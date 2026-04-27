// One-shot deploy edge function for the GaslessTransfer contract.
// Uses EVM_BACKEND_WALLET_PRIVATE_KEY as the deployer (and as the contract's
// immutable backendWallet so the same key submits transfers and receives fees).
//
// Usage:
//   POST /functions/v1/deploy-gasless-contract
//   { "chain": "base" | "ethereum" }

import { ethers } from "npm:ethers@6.13.4";
import artifact from "./artifact.json" with { type: "json" };

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const RPCS: Record<string, string[]> = {
  base: [
    "https://mainnet.base.org",
    "https://base.publicnode.com",
    "https://base.llamarpc.com",
  ],
  ethereum: [
    "https://ethereum-rpc.publicnode.com",
    "https://eth.llamarpc.com",
    "https://rpc.ankr.com/eth",
  ],
};

async function getProvider(chain: string): Promise<ethers.JsonRpcProvider> {
  const urls = RPCS[chain];
  if (!urls) throw new Error(`Unsupported chain: ${chain}`);
  let lastErr: unknown;
  for (const url of urls) {
    try {
      const p = new ethers.JsonRpcProvider(url);
      await p.getBlockNumber(); // sanity check
      return p;
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error(`All RPCs failed for ${chain}: ${String(lastErr)}`);
}

function normalizePk(raw: string): string {
  let pk = raw.trim();
  if (pk.startsWith("[")) {
    // accidentally stored as JSON array of bytes — convert to hex
    const arr = JSON.parse(pk) as number[];
    pk =
      "0x" +
      arr.map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  if (!pk.startsWith("0x")) pk = "0x" + pk;
  return pk;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const chain = String(body.chain ?? "base").toLowerCase();

    if (!["base", "ethereum"].includes(chain)) {
      return new Response(
        JSON.stringify({ error: "chain must be 'base' or 'ethereum'" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const rawKey = Deno.env.get("EVM_BACKEND_WALLET_PRIVATE_KEY");
    if (!rawKey) {
      return new Response(
        JSON.stringify({ error: "EVM_BACKEND_WALLET_PRIVATE_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const pk = normalizePk(rawKey);
    const provider = await getProvider(chain);
    const wallet = new ethers.Wallet(pk, provider);
    const backendAddress = await wallet.getAddress();

    // Pre-flight: check balance and estimate gas
    const balance = await provider.getBalance(backendAddress);
    const factory = new ethers.ContractFactory(
      artifact.abi,
      artifact.bytecode,
      wallet,
    );

    const deployTx = await factory.getDeployTransaction(backendAddress);
    const gasEstimate = await provider.estimateGas({
      ...deployTx,
      from: backendAddress,
    });
    const feeData = await provider.getFeeData();
    const gasPrice = feeData.gasPrice ?? feeData.maxFeePerGas ?? 0n;
    const estimatedCost = gasEstimate * gasPrice;

    if (balance < estimatedCost) {
      return new Response(
        JSON.stringify({
          error: "insufficient_balance",
          chain,
          backendAddress,
          balanceWei: balance.toString(),
          balanceEth: ethers.formatEther(balance),
          estimatedCostWei: estimatedCost.toString(),
          estimatedCostEth: ethers.formatEther(estimatedCost),
          gasEstimate: gasEstimate.toString(),
          gasPriceGwei: ethers.formatUnits(gasPrice, "gwei"),
          message: `Backend wallet needs at least ${ethers.formatEther(estimatedCost)} ETH on ${chain}. Currently has ${ethers.formatEther(balance)} ETH.`,
        }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Deploy
    const contract = await factory.deploy(backendAddress);
    const deploymentTxHash = contract.deploymentTransaction()?.hash;
    await contract.waitForDeployment();
    const address = await contract.getAddress();

    // Verify backendWallet was set correctly
    const reportedBackend = await (contract as any).backendWallet();

    const explorerBase =
      chain === "base"
        ? "https://basescan.org"
        : "https://etherscan.io";

    return new Response(
      JSON.stringify({
        success: true,
        chain,
        contractAddress: address,
        backendWallet: reportedBackend,
        deploymentTxHash,
        explorer: `${explorerBase}/address/${address}`,
        secretToSet:
          chain === "base"
            ? "GASLESS_CONTRACT_BASE"
            : "GASLESS_CONTRACT_ETHEREUM",
        nextStep: `Add a Lovable Cloud secret named ${chain === "base" ? "GASLESS_CONTRACT_BASE" : "GASLESS_CONTRACT_ETHEREUM"} with the value ${address}, then atomic gasless transfers will activate automatically.`,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[deploy-gasless-contract] error:", msg);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
