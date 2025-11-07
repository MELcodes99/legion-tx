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

    // Action: Ensure backend ATA exists for a given mint
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

      return new Response(
        JSON.stringify({
          backendPublicKey: backendWallet.publicKey.toBase58(),
          backendTokenAccount: ata.address.toBase58(),
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Action: Relay SPL token transfer (user signed, backend pays gas and forwards)
    if (action === 'relay_transfer_token') {
      const { signedTransaction, recipientPublicKey, amountAfterFee, mint, decimals } = body as {
        signedTransaction?: string;
        recipientPublicKey?: string;
        amountAfterFee?: number;
        mint?: string;
        decimals?: number;
      };

      if (!signedTransaction || !recipientPublicKey || !amountAfterFee || !mint || decimals == null) {
        return new Response(
          JSON.stringify({ error: 'Missing required fields' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log('Processing gasless token relay:', {
        recipient: recipientPublicKey,
        amountAfterFee,
        mint,
        decimals,
      });

      try {
        // Step 1: Deserialize user's partially-signed transaction
        const binaryString = atob(signedTransaction);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
        const userTransaction = Transaction.from(bytes);

        // Step 2: Backend signs as fee payer (this makes it gasless for user!)
        console.log('Backend signing as fee payer...');
        userTransaction.partialSign(backendWallet);

        // Step 3: Submit transaction to Solana (user → backend ATA, backend pays gas)
        console.log('Submitting gasless transaction to Solana...');
        const userSignature = await connection.sendRawTransaction(
          userTransaction.serialize(),
          { skipPreflight: false, preflightCommitment: 'confirmed' }
        );
        console.log('Transaction submitted:', userSignature);
        await connection.confirmTransaction(userSignature, 'confirmed');
        console.log('User→Backend transfer confirmed (gasless!)');


        // Step 2: Send tokens from backend to final recipient (minus fee)
        const recipientPk = new PublicKey(recipientPublicKey);
        const mintPk = new PublicKey(mint);

        // Ensure recipient ATA exists (backend pays)
        const recipientAta = await getOrCreateAssociatedTokenAccount(
          connection,
          backendWallet,
          mintPk,
          recipientPk
        );

        const backendAtaAddress = await getAssociatedTokenAddress(mintPk, backendWallet.publicKey);

        const amountSmallest = BigInt(Math.floor(amountAfterFee * Math.pow(10, decimals)));

        console.log('Transferring tokens from backend to recipient:', {
          backendAta: backendAtaAddress.toBase58(),
          recipientAta: recipientAta.address.toBase58(),
          amountSmallest: amountSmallest.toString(),
        });

        // Create transaction to transfer from backend to recipient
        const { blockhash } = await connection.getLatestBlockhash('confirmed');
        const backendToRecipientTx = new Transaction({
          recentBlockhash: blockhash,
          feePayer: backendWallet.publicKey,
        });

        backendToRecipientTx.add(
          createTransferInstruction(
            backendAtaAddress, // source
            recipientAta.address, // destination
            backendWallet.publicKey, // owner
            amountSmallest // amount
          )
        );

        // Sign and send the transaction
        const recipientSignature = await sendAndConfirmTransaction(
          connection,
          backendToRecipientTx,
          [backendWallet],
          { commitment: 'confirmed' }
        );

        console.log('Backend token transfer confirmed:', recipientSignature);

        const balanceLamports = await connection.getBalance(backendWallet.publicKey);

        return new Response(
          JSON.stringify({
            success: true,
            signatures: {
              userToBackend: userSignature,
              backendToRecipient: recipientSignature,
            },
            backendWalletBalance: balanceLamports / LAMPORTS_PER_SOL,
            message: 'Token transfer completed successfully',
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } catch (txError) {
        console.error('Token transaction error:', txError);
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