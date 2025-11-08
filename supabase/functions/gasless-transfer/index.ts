import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
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
} from 'https://esm.sh/@solana/spl-token@0.4.14';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Solana RPC endpoint - use mainnet-beta for production
const SOLANA_RPC = 'https://api.mainnet-beta.solana.com';

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action } = body;

    console.log('Gasless transfer request:', { action });

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

        // Build ONE atomic transaction
        const atomicTx = new Transaction({
          recentBlockhash: blockhash,
          feePayer: backendWallet.publicKey, // Backend pays ALL gas fees
        });

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
      const { signedTransaction } = body as { signedTransaction?: string };

      if (!signedTransaction) {
        return new Response(
          JSON.stringify({ error: 'Missing signed transaction' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log('Submitting atomic transaction...');

      try {
        // Deserialize the user-signed transaction
        const binaryString = atob(signedTransaction);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
        const transaction = Transaction.from(bytes);

        // Backend signs as fee payer
        console.log('Backend signing as fee payer...');
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