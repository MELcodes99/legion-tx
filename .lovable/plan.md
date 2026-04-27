## Three independent issues, three minimal fixes

I traced each problem to a specific cause. Solana and Sui paths are not touched.

---

### 1. Why Ethereum & Base gasless transfers fail

**Root cause (confirmed by direct edge-function call):**

In `supabase/functions/gasless-transfer/index.ts` (around lines 697–722), the action whitelist that decides whether to lazy-load `ethers` is:

```ts
const _needsEvm =
  action === 'execute_evm_transfer' ||
  action === 'check_evm_allowance' ||
  action === 'get_backend_wallet';
```

`build_atomic_tx` is **missing** from that list. So when the frontend calls `build_atomic_tx` for chain `base`/`ethereum`:

1. `ethers` stays as the placeholder `{ ZeroAddress: '0x...' }`.
2. The unconditional EVM-wallet parse block (lines 757–780) runs `new ethers.Wallet(...)` → throws → `evmBackendWallet` stays `null`.
3. The Base/Ethereum branch at line 1572 returns HTTP 500: **"EVM backend wallet not configured. Please configure EVM_BACKEND_WALLET_PRIVATE_KEY secret."**
4. Frontend surfaces this as **"Failed to send a request to the edge function"**.

I confirmed this by calling `gasless-transfer` directly with `action: build_atomic_tx, chain: base` — got the 500 above. The secret IS set, and `get_backend_wallet` correctly returns the EVM address `0x89AF…9bb1`. The bug is purely the missing whitelist entry.

**Fix (one block, ~5 lines):**

- Add `build_atomic_tx` (when `chain === 'base' || chain === 'ethereum'`) to `_needsEvm`.
- Move the `evmBackendWallet` parse block to only run when `_needsEvm` is true (so it can't throw on Solana/Sui requests).

This change does not touch the Solana/Sui code paths at all — `_needsSolana` and the existing Solana/Sui branches stay byte-for-byte identical.

After this fix:
- USDC on Base + USDC on Ethereum → existing EIP-2612 permit flow works (gasless for user, backend pays gas).
- USDT on Base → existing Permit2 flow works (gasless for user, backend pays gas).
- USDT on Ethereum stays "Coming Soon" (already the case).
- Native ETH / Base ETH stays explicitly rejected with the existing "use USDC/USDT for gasless" message — true single-tx atomic EVM requires deploying `src/contracts/GaslessTransfer.sol`, which is a separate task you can request when ready.

---

### 2. Why token prices look wrong

The `get-token-prices` summary endpoint (`handleSummary()` in `supabase/functions/get-token-prices/index.ts`) only calls CoinGecko's free public API for SOL, SUI, ETH, SKR. Two real problems:

- **CoinGecko has no `seeker-2` listing that returns reliably** → SKR almost always falls through to the hard-coded fallback `0.024`. That's why SKR is stale.
- **CoinGecko free tier rate-limits aggressively** → on cold starts the response is sometimes empty, so SOL/SUI/ETH fall through to the `SUMMARY_FALLBACK` constants (80 / 0.85 / 1850), which look "wrong" until the next poll succeeds.

**Fix:**

- For **SKR**: query GeckoTerminal first (`api.geckoterminal.com/api/v2/networks/solana/tokens/<SKR_mint>`), fall back to DexScreener, then CoinGecko. This is the same pattern already used successfully for SKR in the per-token branch lower in the file.
- For **SOL / SUI / ETH**: keep CoinGecko as the primary, but add a CoinPaprika fallback (free, no key, far higher rate limits) before falling back to constants. Also bump the constants to current realistic values so the absolute worst case is closer to reality.
- Run the four lookups in parallel (`Promise.all`) so latency stays under the 30-second poll window.

No frontend changes — same response shape `{ prices: { solana, sui, ethereum, base, skr } }`.

---

### 3. Remove the search bar above the transfer form

In `src/pages/Index.tsx`:
- Remove the `<TokenSearchBar />` block and its wrapping `<div className="px-2 mb-6 sm:mb-8">`.
- Remove the `import { TokenSearchBar } from "@/components/TokenSearchBar"` line.

The `TokenSearchBar.tsx` file itself is left in place (unused) so we don't risk breaking other imports.

---

### Validation (before I say "done")

1. Direct call: `gasless-transfer` `get_backend_wallet` → 200 (regression check; already passing).
2. Direct call: `gasless-transfer` `build_atomic_tx` for chain `base`, USDC → expect a structured response (either `{ domain, message, ... }` for the EIP-712 signing flow, or a clear validation error like "insufficient balance"), **NOT** the "EVM backend wallet not configured" 500.
3. Direct call: `gasless-transfer` `build_atomic_tx` for chain `ethereum`, USDC → same expectation.
4. Direct call: `gasless-transfer` `build_atomic_tx` for chain `solana`, USDC → identical response to before this change (Solana path unchanged).
5. Direct call: `gasless-transfer` `build_atomic_tx` for chain `sui`, USDC → identical response to before (Sui path unchanged).
6. Direct call: `get-token-prices` `{ action: 'get_token_prices' }` → SKR no longer shows `0.024`; SOL/SUI/ETH return real upstream values (not fallback constants).
7. Preview UI: confirm the search bar is gone above the form; the form itself is unchanged.
8. Preview UI: connect a Base wallet, click Send with USDC → reach the EIP-712 signature prompt instead of the "Failed to send a request" toast.

I will only mark the task complete after steps 1–6 return the expected results in the deployed function.

---

### Files changed

- `supabase/functions/gasless-transfer/index.ts` — small edit around lines 697–780 (whitelist + guard the EVM-wallet parse). Solana, Sui, all chain-specific branches untouched.
- `supabase/functions/get-token-prices/index.ts` — rewrite `handleSummary()` to use GeckoTerminal for SKR and add a CoinPaprika fallback for SOL/SUI/ETH.
- `src/pages/Index.tsx` — remove `TokenSearchBar` import + render.

### Files NOT changed

- All Solana code in `gasless-transfer/index.ts` (per the project's "Solana/Sui logic frozen" rule).
- All Sui code in `gasless-transfer/index.ts`.
- `MultiChainTransferForm.tsx` (frontend transfer logic stays as-is).
- `TokenSearchBar.tsx` (left in place but unused).
- `supabase/config.toml` (no new functions added).

### Out of scope (call this out separately if you want it)

True **single on-chain transaction** atomic EVM transfers (deduct fee + send to recipient inside one tx) require deploying `src/contracts/GaslessTransfer.sol` to Ethereum and Base and giving me the addresses. The current EVM flow is gasless for the user but uses two backend-submitted `transferFrom` calls. Tell me when you want to deploy the contract and I'll wire it up.
