// Jupiter swap edge function
// - action: "quote"  -> proxy to Jupiter v1 quote (with platformFeeBps=150)
// - action: "build"  -> ask Jupiter to build swap with backend as fee payer,
//                       backend partial-signs, returns tx for the user to sign.
//
// Backend wallet (BACKEND_WALLET_PRIVATE_KEY) pays SOL gas. 1.5% platform fee
// on output token routes to backend's ATA for the output mint.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  VersionedTransaction,
} from "npm:@solana/web3.js@1.95.0";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddress,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "npm:@solana/spl-token@0.4.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const PLATFORM_FEE_BPS = 150; // 1.5%

const RPC_URL = "https://solana-rpc.publicnode.com";

function getConnection(): Connection {
  return new Connection(RPC_URL, "confirmed");
}

function loadBackendKeypair(): Keypair {
  const raw = Deno.env.get("BACKEND_WALLET_PRIVATE_KEY");
  if (!raw) throw new Error("BACKEND_WALLET_PRIVATE_KEY not configured");
  const arr = JSON.parse(raw);
  return Keypair.fromSecretKey(new Uint8Array(arr));
}

async function getTokenProgramId(connection: Connection, mint: PublicKey): Promise<PublicKey> {
  const info = await connection.getAccountInfo(mint, "confirmed");
  if (info?.owner?.equals(TOKEN_2022_PROGRAM_ID)) return TOKEN_2022_PROGRAM_ID;
  return TOKEN_PROGRAM_ID;
}

async function ensureFeeAccount(
  connection: Connection,
  backend: Keypair,
  mint: PublicKey,
): Promise<PublicKey> {
  const tokenProgramId = await getTokenProgramId(connection, mint);
  const feeAccount = await getAssociatedTokenAddress(
    mint,
    backend.publicKey,
    false,
    tokenProgramId,
  );

  const existing = await connection.getAccountInfo(feeAccount, "confirmed");
  if (existing) return feeAccount;

  const tx = new Transaction().add(
    createAssociatedTokenAccountIdempotentInstruction(
      backend.publicKey,
      feeAccount,
      backend.publicKey,
      mint,
      tokenProgramId,
    ),
  );
  tx.feePayer = backend.publicKey;
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.sign(backend);

  const signature = await connection.sendRawTransaction(tx.serialize(), {
    skipPreflight: false,
    maxRetries: 3,
    preflightCommitment: "confirmed",
  });
  await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");
  return feeAccount;
}

async function handleQuote(body: any): Promise<Response> {
  const { inputMint, outputMint, amount, slippageBps = 50 } = body;
  if (!inputMint || !outputMint || !amount) {
    return json({ error: "inputMint, outputMint, amount required" }, 400);
  }

  const url = new URL("https://lite-api.jup.ag/swap/v1/quote");
  url.searchParams.set("inputMint", inputMint);
  url.searchParams.set("outputMint", outputMint);
  url.searchParams.set("amount", String(amount));
  url.searchParams.set("slippageBps", String(slippageBps));
  url.searchParams.set("platformFeeBps", String(PLATFORM_FEE_BPS));
  url.searchParams.set("onlyDirectRoutes", "false");

  const r = await fetch(url.toString(), { headers: { Accept: "application/json" } });
  if (!r.ok) {
    const t = await r.text();
    return json({ error: `Jupiter quote error: ${t}` }, 502);
  }
  const quote = await r.json();
  return json({ quote });
}

async function handleBuild(body: any): Promise<Response> {
  const { quoteResponse, userPublicKey } = body;
  if (!quoteResponse || !userPublicKey) {
    return json({ error: "quoteResponse and userPublicKey required" }, 400);
  }

  const backend = loadBackendKeypair();
  const backendPk = backend.publicKey;
  const userPk = new PublicKey(userPublicKey);
  const outputMint = new PublicKey(quoteResponse.outputMint);

  const connection = getConnection();

  // Platform fee account = backend's ATA for the output mint.
  // Jupiter requires this token account to already exist; otherwise swaps fail
  // with InvalidTokenAccount (6025 / 0x1789).
  const feeAccount = await ensureFeeAccount(connection, backend, outputMint);

  // Build the swap via Jupiter with backend as fee payer.
  // `payer` makes Jupiter compile the tx with backend at staticAccountKeys[0]
  // (fee payer + signer). The user remains a signer because they own the
  // input token account.
  const swapReq = {
    quoteResponse,
    userPublicKey: userPk.toBase58(),
    payer: backendPk.toBase58(),
    feeAccount: feeAccount.toBase58(),
    wrapAndUnwrapSol: true,
    dynamicComputeUnitLimit: true,
    prioritizationFeeLamports: "auto",
    asLegacyTransaction: false,
  };

  const r = await fetch("https://lite-api.jup.ag/swap/v1/swap", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(swapReq),
  });
  if (!r.ok) {
    const t = await r.text();
    console.error("Jupiter swap build error:", t);
    return json({ error: `Jupiter swap build error: ${t}` }, 502);
  }
  const { swapTransaction } = await r.json();
  if (!swapTransaction) {
    return json({ error: "Jupiter returned no transaction" }, 502);
  }

  const txBytes = Uint8Array.from(atob(swapTransaction), (c) => c.charCodeAt(0));
  const tx = VersionedTransaction.deserialize(txBytes);

  // Refresh blockhash so the user has plenty of time to sign.
  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  tx.message.recentBlockhash = blockhash;

  // Backend partial-signs as fee payer.
  tx.sign([backend]);

  const serialized = tx.serialize();
  const b64 = btoa(String.fromCharCode(...serialized));

  return json({
    swapTransaction: b64,
    feeAccount: feeAccount.toBase58(),
    backendPayer: backendPk.toBase58(),
    blockhash,
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  try {
    const body = await req.json().catch(() => ({}));
    const action = body?.action;
    if (action === "quote") return await handleQuote(body);
    if (action === "build") return await handleBuild(body);
    return json({ error: "Unknown action. Use 'quote' or 'build'." }, 400);
  } catch (e) {
    console.error("jupiter-swap error:", e);
    return json({ error: (e as Error).message || "Internal error" }, 500);
  }
});
