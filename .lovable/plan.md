## Goal

Add a **Swap** mode next to the existing transfer form, powered by Jupiter Aggregator. Solana-only, gasless (backend pays SOL), 1.5% fee on the output token routed to the backend fee account, $1 min, full SPL token support with live prices/logos/tickers.

---

## 1. UI — Send / Swap toggle

- New component `SendSwapToggle.tsx` placed directly above `MultiChainTransferForm` in `src/pages/Index.tsx`.
- Two glassmorphism buttons (`backdrop-blur`, semi‑transparent bg, subtle border). Active state uses primary accent ring.
- State lifted into a small wrapper `TransferOrSwapPanel.tsx` that renders either `<MultiChainTransferForm/>` or `<SwapForm/>`.
- Swap button is disabled (greyed + `pointer-events-none`) when `useSelectedNetwork() !== 'solana'`. Tooltip: *"Swap is only available on Solana"*. If user switches to a non‑Solana network while on Swap, auto‑fall back to Send.

## 2. Swap UI — `SwapForm.tsx`

- Token In selector → opens existing `TokenSelectionModal` populated from `useTokenDiscovery('solana')` (wallet SPL tokens with logo/ticker/balance).
- Amount In input + USD value (live).
- Token Out selector → opens a new `SwapOutputTokenModal` that lets users pick ANY SPL token. Source list:
  - Seed with Jupiter "strict" / verified token list (`https://token.jup.ag/strict`) — cached client‑side.
  - Free‑text search by symbol or mint address; if mint pasted that isn't in list, resolve metadata via new edge function `resolve-solana-token` (Jupiter single‑token API → Metaplex fallback, reusing the resolver pattern already in `discover-solana-tokens`).
- Estimated Out (post‑fee), price impact, route summary — refreshed every 8s and on input change (debounced 400ms).
- Swap button with inline validation messages (`Minimum swap is $1`, `Insufficient balance`, etc.).

## 3. Quotes & swap build — new edge function `jupiter-swap`

Single Deno edge function with two actions:

- `action: "quote"` → proxies `GET https://quote-api.jup.ag/v6/quote` with `inputMint`, `outputMint`, `amount`, `slippageBps` (default 50), `platformFeeBps=150`. Returns the quote plus computed USD values using existing `get-token-prices` infra (Jupiter price API as primary, DexScreener fallback — extending `get-token-prices` to accept Solana mints).
- `action: "build"` → calls `POST https://quote-api.jup.ag/v6/swap` with:
  - `quoteResponse` from client
  - `userPublicKey` = user's wallet
  - `feeAccount` = backend's referral token account for `outputMint` (ATA derivation explained below)
  - `wrapAndUnwrapSol: true`
  - **Gas payer override:** we cannot pass `feePayer` directly to `/swap`, so we deserialize the returned `VersionedTransaction`, **replace the fee payer** in the message header with the backend wallet pubkey, **partially sign** with the backend wallet's keypair (from `BACKEND_WALLET_PRIVATE_KEY` already in secrets), and return the partially‑signed serialized tx to the client.
- Client then signs with the user wallet (Phantom/etc.) and submits via `sendRawTransaction` to a Solana RPC. Confirmation handled client‑side, then logged via existing `logTransaction` / `record_transaction_stats` flow with `chain='solana'`, `token_sent=inputSymbol`, `gas_token='SOL (backend)'`.

## 4. Fee account setup (1.5% on output)

- Backend fee receiving wallet = existing Solana backend wallet pubkey derived from `BACKEND_WALLET_PRIVATE_KEY`.
- For each `outputMint`, the fee account is the **Associated Token Account** of the backend wallet for that mint. The `jupiter-swap` edge function:
  1. Derives the ATA via `getAssociatedTokenAddressSync(outputMint, backendPubkey)`.
  2. Checks if it exists; if not, prepends a `createAssociatedTokenAccountInstruction` (payer = backend wallet) to the swap transaction before re‑signing. This auto‑provisions fee ATAs on first use for any token.
- `platformFeeBps=150` ensures Jupiter routes the 1.5% slice of output into that ATA atomically.

> Note: We are NOT registering with `referral.jup.ag` — Jupiter v6 accepts any ATA owned by `feeAccount`'s owner for the output mint as a valid platform fee account. Auto‑creating the ATA on demand removes the manual setup step.

## 5. Prices, tickers, logos

- Extend `get-token-prices` edge function to accept an array of Solana mints and return `{mint: {priceUsd, symbol, name, logoURI}}`. Order: Jupiter Price API v6 → DexScreener → cached metadata from `discover-solana-tokens`.
- `SwapForm` uses a `useSwapQuote` hook (react‑query, 8s refetch) that calls `jupiter-swap` with `action:"quote"` and joins price data for USD display.
- Estimated Out shown = `outAmount` from quote (Jupiter already subtracts the platform fee), formatted with output token decimals.

## 6. Validation rules

- Real‑time `inputUsdValue = amount * priceUsd(inputMint)`; if `< 1`, disable Swap with message *"Minimum swap is $1"*.
- Disable if no quote, insufficient balance, same in/out mint, wallet not connected, or network ≠ solana.

## 7. Files to add / change

**New:**
- `src/components/SendSwapToggle.tsx`
- `src/components/TransferOrSwapPanel.tsx`
- `src/components/SwapForm.tsx`
- `src/components/SwapOutputTokenModal.tsx`
- `src/hooks/useSwapQuote.ts`
- `src/hooks/useJupiterTokenList.ts`
- `supabase/functions/jupiter-swap/index.ts`

**Changed:**
- `src/pages/Index.tsx` — render `TransferOrSwapPanel` instead of `MultiChainTransferForm` directly.
- `supabase/functions/get-token-prices/index.ts` — add Solana mint price+metadata path using Jupiter Price API v6.

No DB migrations needed (existing `transactions` / analytics tables already cover swaps via `insert_chain_transaction`).

## 8. Out of scope

- No changes to Sui / EVM / Bungee flows (frozen per project rules).
- No new secrets — reuses `BACKEND_WALLET_PRIVATE_KEY`.
- No hardcoded token list; everything dynamic from Jupiter + Metaplex.

---

Reply **approve** to build, or tell me what to adjust (e.g. different default slippage, separate edge functions for quote vs build, manual referral.jup.ag setup instead of auto‑ATA).