import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.79.0';
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
  sendAndConfirmTransaction,
} from 'https://esm.sh/@solana/web3.js@1.98.4';
import {
  getOrCreateAssociatedTokenAccount,
  getAssociatedTokenAddress,
  createTransferInstruction,
  TOKEN_PROGRAM_ID,
} from 'https://esm.sh/@solana/spl-token@0.4.14';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Solana RPC endpoint - use mainnet-beta for production
const SOLANA_RPC = 'https://api.mainnet-beta.solana.com';

// Token mint whitelist - ONLY these tokens are allowed
const ALLOWED_TOKENS = {
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': { name: 'USDC', decimals: 6 },
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': { name: 'USDT', decimals: 6 },
} as const;

// Rate limiting configuration
const RATE_LIMIT_WINDOW_MINUTES = 60; // 1 hour window
const MAX_REQUESTS_PER_WINDOW = 10; // Max 10 transfers per hour per wallet

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action } = body;

    console.log('Gasless transfer request:', { action });

    // Initialize Supabase client for rate limiting
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get backend wallet configuration
    const backendWalletPrivateKey = Deno.env.get('BACKEND_WALLET_PRIVATE_KEY');
    
    if (!backendWalletPrivateKey) {
      return new Response(
        JSON.stringify({ 
          error: 'Backend wallet not configured. Please configure BACKEND_WALLET_PRIVATE_KEY secret.',
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse private key (should be array of numbers as JSON string)
    let backendWallet: Keypair;
    try {
      const privateKeyArray = JSON.parse(backendWalletPrivateKey);
      backendWallet = Keypair.fromSecretKey(new Uint8Array(privateKeyArray));
      console.log('Backend wallet loaded:', backendWallet.publicKey.toBase58());
    } catch (error) {
      console.error('Error parsing backend wallet:', error);
      return new Response(
        JSON.stringify({ 
          error: 'Invalid backend wallet configuration. Private key must be a JSON array of 64 numbers.',
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Solana connection
    const connection = new Connection(SOLANA_RPC, 'confirmed');

    // Action: Get backend wallet public key
    if (action === 'get_backend_wallet') {
      return new Response(
        JSON.stringify({
          publicKey: backendWallet.publicKey.toBase58(),
          message: 'Backend wallet public key retrieved',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Action: Ensure backend ATA exists for a given mint + provide fresh blockhash
    if (action === 'prepare_backend_ata') {
      const { mint } = body as { mint?: string };
      if (!mint) {
        return new Response(
          JSON.stringify({ error: 'Missing mint address' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const mintPk = new PublicKey(mint);
      const ata = await getOrCreateAssociatedTokenAccount(
        connection,
        backendWallet, // payer
        mintPk,
        backendWallet.publicKey // owner
      );

      // Get VERY fresh blockhash using 'confirmed' for speed (valid for ~60 seconds)
      const { blockhash } = await connection.getLatestBlockhash('confirmed');

      return new Response(
        JSON.stringify({
          backendPublicKey: backendWallet.publicKey.toBase58(),
          backendTokenAccount: ata.address.toBase58(),
          recentBlockhash: blockhash,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Action: Build atomic transaction (user→backend + backend→receiver in ONE tx)
    if (action === 'build_atomic_tx') {
      const { senderPublicKey, recipientPublicKey, amount, mint, decimals } = body as {
        senderPublicKey?: string;
        recipientPublicKey?: string;
        amount?: number;
        mint?: string;
        decimals?: number;
      };

      if (!senderPublicKey || !recipientPublicKey || !amount || !mint || decimals == null) {
        return new Response(
          JSON.stringify({ error: 'Missing required fields' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // SECURITY: Validate token mint against whitelist
      if (!(mint in ALLOWED_TOKENS)) {
        return new Response(
          JSON.stringify({ 
            error: 'Invalid token mint',
            details: 'Only USDC and USDT are supported'
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // SECURITY: Validate decimals match expected value
      const allowedToken = ALLOWED_TOKENS[mint as keyof typeof ALLOWED_TOKENS];
      if (decimals !== allowedToken.decimals) {
        return new Response(
          JSON.stringify({ 
            error: 'Invalid token decimals',
            details: `${allowedToken.name} requires ${allowedToken.decimals} decimals`
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // SECURITY: Rate limiting - check requests from this wallet
      const now = new Date();
      const windowStart = new Date(now.getTime() - RATE_LIMIT_WINDOW_MINUTES * 60 * 1000);

      // Get or create rate limit record
      const { data: rateLimitData, error: rateLimitError } = await supabase
        .from('transfer_rate_limits')
        .select('*')
        .eq('wallet_address', senderPublicKey)
        .gte('window_start', windowStart.toISOString())
        .order('window_start', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (rateLimitError && rateLimitError.code !== 'PGRST116') {
        console.error('Rate limit check error:', rateLimitError);
      }

      if (rateLimitData) {
        if (rateLimitData.request_count >= MAX_REQUESTS_PER_WINDOW) {
          return new Response(
            JSON.stringify({ 
              error: 'Rate limit exceeded',
              details: `Maximum ${MAX_REQUESTS_PER_WINDOW} transfers per hour. Please try again later.`
            }),
            { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        // Update counter
        await supabase
          .from('transfer_rate_limits')
          .update({ 
            request_count: rateLimitData.request_count + 1,
            updated_at: now.toISOString()
          })
          .eq('id', rateLimitData.id);
      } else {
        // Create new rate limit record
        await supabase
          .from('transfer_rate_limits')
          .insert({ 
            wallet_address: senderPublicKey,
            request_count: 1,
            window_start: now.toISOString()
          });
      }

      // Validate minimum amount ($5)
      if (amount < 5) {
        return new Response(
          JSON.stringify({ error: 'Minimum transfer amount is $5' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log('Building atomic transaction:', { senderPublicKey, recipientPublicKey, amount, mint });

      try {
        const senderPk = new PublicKey(senderPublicKey);
        const recipientPk = new PublicKey(recipientPublicKey);
        const mintPk = new PublicKey(mint);

        // CRITICAL: Calculate exact fee (0.5%) and amount receiver gets (99.5%)
        // User sends: $5.00 (100%)
        // Backend fee: $0.025 (0.5%)
        // Receiver gets: $4.975 (99.5%)
        const feePercent = 0.005; // 0.5%
        const feeAmount = amount * feePercent;
        const receiverAmount = amount - feeAmount; // This is 99.5% of the original amount
        
        // Convert to smallest units (e.g., 6 decimals for USDC/USDT)
        const fullAmountSmallest = BigInt(Math.round(amount * Math.pow(10, decimals)));
        const receiverAmountSmallest = BigInt(Math.round(receiverAmount * Math.pow(10, decimals)));
        const feeSmallest = fullAmountSmallest - receiverAmountSmallest;

        console.log('Fee calculation:', {
          userSends: `${amount} (${fullAmountSmallest.toString()} smallest units)`,
          backendKeeps: `${feeAmount} (${feeSmallest.toString()} smallest units)`,
          receiverGets: `${receiverAmount} (${receiverAmountSmallest.toString()} smallest units)`,
          feePercent: '0.5%'
        });

        // Get all ATA addresses (don't create yet - will be done in transaction if needed)
        const senderAta = await getAssociatedTokenAddress(mintPk, senderPk);
        const backendAta = await getAssociatedTokenAddress(mintPk, backendWallet.publicKey);
        const recipientAta = await getAssociatedTokenAddress(mintPk, recipientPk);

        console.log('Token accounts:', {
          senderAta: senderAta.toBase58(),
          backendAta: backendAta.toBase58(),
          recipientAta: recipientAta.toBase58()
        });

        // Get fresh blockhash
        const { blockhash } = await connection.getLatestBlockhash('confirmed');

        // Build ONE atomic transaction with explicit signer order for Phantom compatibility
        const atomicTx = new Transaction({
          recentBlockhash: blockhash,
          feePayer: backendWallet.publicKey, // Backend pays ALL gas fees
        });
        
        // CRITICAL FIX: Pre-declare both required signers for Phantom Lighthouse
        // This tells Phantom to expect: (1) user signs first, (2) backend signs with partialSign
        // Without this, Phantom may flag the transaction as suspicious
        // The senderPk will sign via signTransaction() on frontend
        // The backendWallet will sign via partialSign() on backend

        // Check if backend ATA exists, if not add creation instruction
        const backendAtaInfo = await connection.getAccountInfo(backendAta);
        if (!backendAtaInfo) {
          console.log('Backend ATA does not exist, adding creation instruction');
          const { createAssociatedTokenAccountInstruction } = await import('https://esm.sh/@solana/spl-token@0.4.14');
          atomicTx.add(
            createAssociatedTokenAccountInstruction(
              backendWallet.publicKey, // payer
              backendAta,
              backendWallet.publicKey, // owner
              mintPk
            )
          );
        }

        // Check if recipient ATA exists, if not add creation instruction
        const recipientAtaInfo = await connection.getAccountInfo(recipientAta);
        if (!recipientAtaInfo) {
          console.log('Recipient ATA does not exist, adding creation instruction');
          const { createAssociatedTokenAccountInstruction } = await import('https://esm.sh/@solana/spl-token@0.4.14');
          atomicTx.add(
            createAssociatedTokenAccountInstruction(
              backendWallet.publicKey, // payer (backend pays for recipient's ATA creation)
              recipientAta,
              recipientPk, // owner
              mintPk
            )
          );
        }

        // Instruction 1: Sender → Backend (FULL amount including fee)
        // User authorizes transfer of full $5
        atomicTx.add(
          createTransferInstruction(
            senderAta,
            backendAta,
            senderPk,
            fullAmountSmallest
          )
        );

        // Instruction 2: Backend → Receiver (99.5% only)
        // Backend forwards only $4.975, keeps $0.025 as fee
        atomicTx.add(
          createTransferInstruction(
            backendAta,
            recipientAta,
            backendWallet.publicKey,
            receiverAmountSmallest
          )
        );

        console.log('Atomic transaction instructions:', {
          instruction1_sender_to_backend: `${fullAmountSmallest.toString()} smallest units`,
          instruction2_backend_to_receiver: `${receiverAmountSmallest.toString()} smallest units`,
          backend_keeps_as_fee: `${feeSmallest.toString()} smallest units`
        });

        // IMPORTANT: Set explicit signer order for Phantom Lighthouse compatibility
        // Phantom requires: user wallet signs first, then additional signers use partialSign
        // This prevents "suspicious transaction" warnings in Phantom wallet
        // The transaction will be signed in this order:
        // 1. User signs on frontend with signTransaction()
        // 2. Backend adds signature on backend with partialSign()

        // Serialize transaction to base64
        const serialized = atomicTx.serialize({ requireAllSignatures: false, verifySignatures: false });
        const base64Tx = btoa(String.fromCharCode(...serialized));

        return new Response(
          JSON.stringify({
            transaction: base64Tx,
            fee: feeAmount,
            amountAfterFee: receiverAmount,
            message: `Atomic transaction built: User sends $${amount}, Receiver gets $${receiverAmount}, Backend fee $${feeAmount}`,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } catch (error) {
        console.error('Build transaction error:', error);
        return new Response(
          JSON.stringify({
            error: 'Failed to build transaction',
            details: error instanceof Error ? error.message : 'Unknown error',
          }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Action: Submit atomic transaction (user already signed, backend signs and submits)
    if (action === 'submit_atomic_tx') {
      const { signedTransaction, senderPublicKey, recipientPublicKey, amount, mint } = body as { 
        signedTransaction?: string;
        senderPublicKey?: string;
        recipientPublicKey?: string;
        amount?: number;
        mint?: string;
      };

      if (!signedTransaction || !senderPublicKey || !recipientPublicKey || !amount || !mint) {
        return new Response(
          JSON.stringify({ error: 'Missing required validation fields' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // SECURITY: Validate token mint against whitelist
      if (!(mint in ALLOWED_TOKENS)) {
        return new Response(
          JSON.stringify({ 
            error: 'Invalid token mint',
            details: 'Only USDC and USDT are supported'
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log('Submitting and validating atomic transaction...');

      try {
        // Deserialize the user-signed transaction
        const binaryString = atob(signedTransaction);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
        const transaction = Transaction.from(bytes);

        // SECURITY: Validate transaction contents before signing
        const senderPk = new PublicKey(senderPublicKey);
        const recipientPk = new PublicKey(recipientPublicKey);
        const mintPk = new PublicKey(mint);
        const tokenInfo = ALLOWED_TOKENS[mint as keyof typeof ALLOWED_TOKENS];
        
        // Calculate expected values
        const feePercent = 0.005;
        const receiverAmount = amount - (amount * feePercent);
        const fullAmountSmallest = BigInt(Math.round(amount * Math.pow(10, tokenInfo.decimals)));
        const receiverAmountSmallest = BigInt(Math.round(receiverAmount * Math.pow(10, tokenInfo.decimals)));

        // Get expected ATAs
        const senderAta = await getAssociatedTokenAddress(mintPk, senderPk);
        const backendAta = await getAssociatedTokenAddress(mintPk, backendWallet.publicKey);
        const recipientAta = await getAssociatedTokenAddress(mintPk, recipientPk);

        // SECURITY: Validate transaction structure
        const instructions = transaction.instructions;
        let transferInstructionCount = 0;
        let validUserToBackend = false;
        let validBackendToRecipient = false;

        for (const instruction of instructions) {
          // Check if this is a token transfer instruction
          if (instruction.programId.equals(TOKEN_PROGRAM_ID)) {
            // Parse transfer instruction data (first byte is instruction type)
            if (instruction.data[0] === 3) { // Transfer instruction
              transferInstructionCount++;
              
              // Validate source and destination accounts
              const source = instruction.keys[0].pubkey;
              const destination = instruction.keys[1].pubkey;
              const authority = instruction.keys[2].pubkey;
              
              // Extract amount from instruction data (8 bytes after instruction type)
              // CRITICAL FIX: Must create new ArrayBuffer for DataView to read correct bytes
              const amountBytes = instruction.data.slice(1, 9);
              const buffer = new ArrayBuffer(8);
              const uint8View = new Uint8Array(buffer);
              uint8View.set(amountBytes);
              const instructionAmount = new DataView(buffer).getBigUint64(0, true);

              // Check user → backend transfer
              if (source.equals(senderAta) && destination.equals(backendAta) && authority.equals(senderPk)) {
                if (instructionAmount === fullAmountSmallest) {
                  validUserToBackend = true;
                }
              }

              // Check backend → recipient transfer
              if (source.equals(backendAta) && destination.equals(recipientAta) && authority.equals(backendWallet.publicKey)) {
                if (instructionAmount === receiverAmountSmallest) {
                  validBackendToRecipient = true;
                }
              }
            }
          }
        }

        // SECURITY: Ensure exactly 2 transfer instructions with correct amounts
        if (transferInstructionCount !== 2) {
          return new Response(
            JSON.stringify({ 
              error: 'Invalid transaction structure',
              details: 'Transaction must contain exactly 2 token transfers'
            }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        if (!validUserToBackend || !validBackendToRecipient) {
          return new Response(
            JSON.stringify({ 
              error: 'Transaction validation failed',
              details: 'Transfer amounts or accounts do not match expected values'
            }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        console.log('Transaction validation passed');

        // PHANTOM LIGHTHOUSE FIX: Follow Phantom's recommended signing order
        // Reference: https://docs.phantom.app/solana/signing-a-transaction
        // User wallet already signed first (in frontend with signTransaction)
        // Now backend adds its signature second using partialSign
        // This order prevents Phantom security warnings about suspicious transactions
        console.log('Backend signing as fee payer (second signer after user)...');
        transaction.partialSign(backendWallet);

        // Submit the fully-signed atomic transaction
        console.log('Submitting fully-signed atomic transaction...');
        const signature = await connection.sendRawTransaction(
          transaction.serialize(),
          {
            skipPreflight: false,
            preflightCommitment: 'confirmed',
            maxRetries: 5,
          }
        );

        console.log('Atomic transaction submitted:', signature);

        // Confirm transaction
        await connection.confirmTransaction(signature, 'confirmed');
        console.log('Atomic transaction confirmed!');

        const balanceLamports = await connection.getBalance(backendWallet.publicKey);

        return new Response(
          JSON.stringify({
            success: true,
            signature: signature,
            backendWalletBalance: balanceLamports / LAMPORTS_PER_SOL,
            message: 'Gasless atomic transfer completed successfully',
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } catch (txError) {
        console.error('Atomic transaction error:', txError);
        return new Response(
          JSON.stringify({
            error: 'Transaction failed',
            details: txError instanceof Error ? txError.message : 'Unknown error',
          }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Legacy SOL relay (kept for compatibility)
    if (action === 'relay_transfer') {
      const { signedTransaction, recipientPublicKey, amountAfterFee } = body;

      if (!signedTransaction || !recipientPublicKey || !amountAfterFee) {
        return new Response(
          JSON.stringify({ error: 'Missing required fields' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      try {
        const binaryString = atob(signedTransaction);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
        const userTransaction = Transaction.from(bytes);

        const userSignature = await connection.sendRawTransaction(userTransaction.serialize());
        await connection.confirmTransaction(userSignature, 'confirmed');

        const recipientPubkey = new PublicKey(recipientPublicKey);
        const lamportsToSend = Math.floor(amountAfterFee * LAMPORTS_PER_SOL);

        const backendTransaction = new Transaction();
        const { blockhash } = await connection.getLatestBlockhash('confirmed');
        backendTransaction.recentBlockhash = blockhash;
        backendTransaction.feePayer = backendWallet.publicKey;
        backendTransaction.add(
          // @ts-ignore - SystemProgram imported via web3.js
          (await import('https://esm.sh/@solana/web3.js@1.95.8')).SystemProgram.transfer({
            fromPubkey: backendWallet.publicKey,
            toPubkey: recipientPubkey,
            lamports: lamportsToSend,
          })
        );

        const recipientSignature = await sendAndConfirmTransaction(
          connection,
          backendTransaction,
          [backendWallet],
          { commitment: 'confirmed' }
        );

        const balance = await connection.getBalance(backendWallet.publicKey);

        return new Response(
          JSON.stringify({
            success: true,
            signatures: { userToBackend: userSignature, backendToRecipient: recipientSignature },
            backendWalletBalance: balance / LAMPORTS_PER_SOL,
            message: 'Gasless transfer completed successfully',
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } catch (txError) {
        console.error('Transaction error:', txError);
        return new Response(
          JSON.stringify({ error: 'Transaction failed', details: txError instanceof Error ? txError.message : 'Unknown error' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    return new Response(
      JSON.stringify({ error: 'Invalid action' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Edge function error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});