// Jupiter swap edge function
// - action: "quote"  -> proxy to Jupiter v6 quote (with platformFeeBps=150)
// - action: "build"  -> build swap tx, override fee payer to backend wallet, partial-sign
//
// Backend wallet (BACKEND_WALLET_PRIVATE_KEY) pays SOL gas. 1.5% platform fee
// on output token routes to backend's ATA for the output mint (auto-created on first use).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  Connection,
  Keypair,
  PublicKey,
  VersionedTransaction,
  TransactionMessage,
  MessageV0,
  AddressLookupTableAccount,
  SystemProgram,
} from "npm:@solana/web3.js@1.95.0";
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  ASSOCIATED_TOKEN_PROGRAM_ID,
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

const RPC_URLS = [
  "https://solana-rpc.publicnode.com",
  "https://rpc.ankr.com/solana",
  "https://api.mainnet-beta.solana.com",
];

function getConnection(): Connection {
  return new Connection(RPC_URLS[0], "confirmed");
}

function loadBackendKeypair(): Keypair {
  const raw = Deno.env.get("BACKEND_WALLET_PRIVATE_KEY");
  if (!raw) throw new Error("BACKEND_WALLET_PRIVATE_KEY not configured");
  const arr = JSON.parse(raw);
  return Keypair.fromSecretKey(new Uint8Array(arr));
}

// Resolve the platform fee account: backend wallet's ATA for the OUTPUT mint.
// Returns the ATA pubkey plus an optional create instruction (if it doesn't exist yet).
async function ensureFeeAccount(
  connection: Connection,
  backend: PublicKey,
  outputMint: PublicKey,
) {
  const ata = await getAssociatedTokenAddress(outputMint, backend, true);
  const info = await connection.getAccountInfo(ata);
  if (info) return { ata, createIx: null as null };
  const createIx = createAssociatedTokenAccountInstruction(
    backend, // payer
    ata, // ata
    backend, // owner
    outputMint,
  );
  return { ata, createIx };
}

// Rebuild a VersionedTransaction's message so the backend is the fee payer.
// Strategy: prepend backend to staticAccountKeys, shift all account indices by +1,
// bump numRequiredSignatures by 1. Both backend (idx 0, payer+signer) and user
// (now idx 1, signer) are required signers.
function rebuildWithBackendPayer(
  tx: VersionedTransaction,
  backend: PublicKey,
  prependIxs: { programId: PublicKey; keys: { pubkey: PublicKey; isSigner: boolean; isWritable: boolean }[]; data: Uint8Array }[] = [],
  altAccounts: AddressLookupTableAccount[] = [],
): VersionedTransaction {
  const msg = tx.message;
  // Skip if backend is already in keys at index 0
  if (msg.staticAccountKeys[0].equals(backend)) {
    return tx;
  }

  // If we have lookup tables, decompile to TransactionMessage and rebuild cleanly
  // (this resolves all referenced accounts so we can recompile with a new payer).
  let decompiled: TransactionMessage;
  try {
    decompiled = TransactionMessage.decompile(msg, {
      addressLookupTableAccounts: altAccounts,
    });
  } catch (e) {
    throw new Error(`Failed to decompile Jupiter tx: ${(e as Error).message}`);
  }

  const newIxs = [...prependIxs, ...decompiled.instructions];

  const newMsg = new TransactionMessage({
    payerKey: backend,
    recentBlockhash: decompiled.recentBlockhash,
    instructions: newIxs as any,
  }).compileToV0Message(altAccounts);

  // The original payer (user) was a signer at index 0. After recompile,
  // payerKey=backend at index 0. User must still be a signer because they
  // are the source token owner — instructions still reference them as signer,
  // so compileToV0Message will mark them as a required signer automatically.
  return new VersionedTransaction(newMsg);
}

// Resolve address lookup tables for a v0 message.
async function fetchAltAccounts(
  connection: Connection,
  msg: MessageV0,
): Promise<AddressLookupTableAccount[]> {
  const results: AddressLookupTableAccount[] = [];
  for (const lookup of msg.addressTableLookups) {
    const acc = await connection.getAddressLookupTable(lookup.accountKey);
    if (acc.value) results.push(acc.value);
  }
  return results;
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

  // Resolve / create platform fee ATA (backend's ATA for output mint)
  const { ata: feeAccount, createIx } = await ensureFeeAccount(
    connection,
    backendPk,
    outputMint,
  );

  // Call Jupiter /swap. We pass userPublicKey as the swap user (token authority).
  // Jupiter will return a tx with user as fee payer; we override it below.
  const swapReq = {
    quoteResponse,
    userPublicKey: userPk.toBase58(),
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
    return json({ error: `Jupiter swap build error: ${t}` }, 502);
  }
  const { swapTransaction } = await r.json();
  if (!swapTransaction) {
    return json({ error: "Jupiter returned no transaction" }, 502);
  }

  const txBytes = Uint8Array.from(atob(swapTransaction), (c) => c.charCodeAt(0));
  let tx = VersionedTransaction.deserialize(txBytes);

  // Resolve ALTs so we can decompile / recompile with backend as payer
  const altAccounts = await fetchAltAccounts(connection, tx.message);

  // Prepend ATA-create ix (paid by backend) if needed
  const prepend = createIx
    ? [
        {
          programId: createIx.programId,
          keys: createIx.keys,
          data: createIx.data,
        },
      ]
    : [];

  tx = rebuildWithBackendPayer(tx, backendPk, prepend, altAccounts);

  // Refresh blockhash to be safe
  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  tx.message.recentBlockhash = blockhash;

  // Backend partial-signs as fee payer
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
