# Why gasless transactions are still broken

Direct test of the deployed function right now returns:

```
546 WORKER_RESOURCE_LIMIT — Function failed due to not having enough compute resources
```

Logs show a constant loop:

```
booted (time: ~100ms)
ERROR module "/utf-8-validate@6.0.6/denonext/package.json" not found
ERROR module "/bufferutil@4.1.0/denonext/package.json" not found
ERROR CPU Time exceeded
shutdown
```

The previous "minimal fix" only lazy-loaded the Sui SDK. `@solana/web3.js`, `@solana/spl-token`, and `ethers` are **still imported at the top** of `supabase/functions/gasless-transfer/index.ts` (2,877 lines). Loading all three SDKs at boot exceeds the worker's CPU budget — the function dies before any request handler runs. That's why every Send click on every chain returns "Failed to send a request to the edge function".

The minimal-fix approach has been tried and isn't enough. The router needs to be split.

# Plan: split into chain-specific edge functions

This matches the architecture already documented in project memory (`distributed-gasless-transfer-router`).

## 1. Create three new lightweight edge functions

Each one boots only the SDK it needs, so each stays well within the CPU budget.

- **`gasless-solana`** — handles `build_atomic_tx` and `submit_signed_tx` for Solana. Imports only `@solana/web3.js` and `@solana/spl-token`. Lifts the existing Solana logic out of the monolith verbatim (no behavior changes — Solana flow is frozen per project memory).
- **`gasless-sui`** — handles Sui transfers. Imports only `@mysten/sui`. Lifts the existing Sui logic out verbatim (Sui flow is frozen per project memory).
- **`gasless-evm`** — handles Base and Ethereum (USDC permit flow + USDT Permit2 on Base). Imports only `ethers`. Native ETH / Base ETH stays rejected with a clear "not yet supported" message because the `GaslessTransfer.sol` contract is not deployed.

Each function:
- Uses the standard CORS headers on every response (success and error).
- Returns structured JSON for validation errors (400) instead of letting boot failures surface as "Failed to fetch".
- Has its own `verify_jwt = false` entry in `supabase/config.toml`.
- Pins exact npm versions in `supabase/functions/deno.json` (no carets) per project memory.

## 2. Turn `gasless-transfer` into a thin router

Replace the 2,877-line monolith with a small router (~100 lines) that:
- Reads the request body once.
- Routes to the correct chain function via `supabase.functions.invoke()` based on `chain` (or `network`) field.
- Forwards the response and CORS headers back to the client.
- Keeps the existing `get_backend_wallet` / health action so deployed health checks return 200.
- **No SDK imports at all** at the top level — guarantees boot.

This preserves the existing public API the frontend already uses, so no frontend transfer code needs to change.

## 3. Preserve existing Solana and Sui transaction flows exactly

Project memory explicitly marks Solana and Sui logic as frozen. The split is a **lift-and-shift**:
- Same `build_atomic_tx` / `submit_signed_tx` action names.
- Same `transferAmountSmallest` handoff between build and submit (prevents the rounding mismatch you've hit before).
- Same backend co-signing / single-transaction structure.
- Same min $2 USD validation, full-balance epsilon tolerance, non-stable USD-value validation, and SKR $0.50 fixed gas fee.

## 4. EVM behavior — honest about the limitation

Without the deployed `GaslessTransfer.sol` contract, **truly atomic single-tx EVM transfers (deduct fee + transfer to recipient inside one on-chain transaction) are not possible.** The current EVM flow uses EIP-2612 permits (USDC) and Permit2 (USDT on Base) — the user signs off-chain, and the backend submits two `transferFrom` calls (one to recipient, one for the fee). That is gasless for the user, but it is **two on-chain transfers**, not one atomic contract call.

In this plan I will:
- Keep USDC gasless on Ethereum and Base (permit flow, backend pays gas, fee routed to backend wallet `0x89AF...`).
- Keep USDT on Base gasless via Permit2.
- Keep USDT on Ethereum marked "Coming Soon".
- Reject native ETH / Base ETH gasless with a clean "not yet supported" message until the contract is deployed.

If you want true single-transaction atomic EVM transfers, you (or I, with your help compiling/deploying via Foundry/Remix) need to deploy `src/contracts/GaslessTransfer.sol` and give me the contract addresses for Ethereum and Base. That can be a separate follow-up — it does not block fixing the current 546 crash on Solana, Sui, and the existing EVM permit flow.

## 5. Validation before claiming "done"

After deploying the new functions I will, in this order:

1. Direct backend call: `gasless-solana` health → expect 200, no `CPU Time exceeded`.
2. Direct backend call: `gasless-sui` health → expect 200.
3. Direct backend call: `gasless-evm` health → expect 200.
4. Direct backend call: `gasless-transfer` (router) `get_backend_wallet` → expect 200 with all chain backend addresses.
5. Check `gasless-transfer` logs — confirm zero `WORKER_RESOURCE_LIMIT`, zero `bufferutil`, zero `utf-8-validate`, zero `CPU Time exceeded`.
6. From the preview UI: connect a wallet and click Send on Solana, Sui, and Base → confirm we now reach the wallet-sign prompt instead of "Failed to send a request". Full on-chain completion still requires you to actually sign and have funded balances.

I will only say "done" once steps 1–5 pass and the UI reaches the sign prompt in step 6.

## 6. Files that will change

- **New:** `supabase/functions/gasless-solana/index.ts`
- **New:** `supabase/functions/gasless-sui/index.ts`
- **New:** `supabase/functions/gasless-evm/index.ts`
- **Rewritten (router):** `supabase/functions/gasless-transfer/index.ts` (~2,877 lines → ~100 lines)
- **Updated:** `supabase/functions/deno.json` (split SDK pins per function group)
- **Updated:** `supabase/config.toml` (add `verify_jwt = false` for the three new functions)
- **Untouched:** All frontend code. `MultiChainTransferForm.tsx` keeps calling `gasless-transfer` exactly as it does today.

# Expected outcome

- "Failed to send a request to the edge function" stops on all chains.
- Solana and Sui gasless transfers reach build → user-sign → backend co-sign → submit (single atomic transaction, as they were designed).
- Base USDC and USDC/Ethereum gasless transfers reach the permit-sign step and complete via the existing 2-call backend flow (gasless for the user, but not single-on-chain-tx until the EVM contract is deployed).
- Native ETH / Base ETH return a clean unsupported message instead of a worker crash.

<lov-actions>
<lov-link url="https://docs.lovable.dev/tips-tricks/troubleshooting">Troubleshooting docs</lov-link>
</lov-actions>
