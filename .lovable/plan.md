## Why USDG isn't off-ramping

Verified against Paj's live API: USDG is fully supported (`/rates/offramp-value` returns a valid NGN quote for mint `2u1tsz…`). The problem is on our side.

In `src/components/PajOfframpForm.tsx`, each token's USD price is computed from `useTokenDiscovery`:

```ts
price: d ? (d.balance > 0 ? d.usdValue / d.balance : 0) : 0
```

For USDG, discovery often returns a balance but no `usdValue` (our price feed doesn't always cache USDG, and Jupiter/DexScreener can return empty). When `price = 0`:
- `tokenAmount = grossUsd / price` becomes `Infinity`/`0` → "Insufficient balance"
- `create_order` is called with `tokenPriceUsd: 0` → edge function rejects with "missing required fields"

USDC/USDT work because they're reliably priced; USDG, USDF aren't.

## Fix (scoped, no other behavior changes)

In `PajOfframpForm.tsx` only, update `supportedWithBalance`:

1. Maintain a small `STABLE_SYMBOLS` set: `USDC, USDT, USDG, USDF`.
2. If discovery returns no price for a stablecoin, default `price = 1` and `usdBalance = balance`.
3. Leave non-stables (SOL, JUP, BONK) untouched — they keep their live discovery price.

Result:
- USDG off-ramps immediately, even before price hydration.
- NGN rate stays 100% live from Paj per-token (`paj.offrampValue`) — no hardcoded fiat.
- Gasless transfer / Paj order creation flow is unchanged.

## Out of scope

- No changes to `paj-cash`, `gasless-transfer`, or rate logic.
- No changes to other tokens or chains.
- No touching `useTokenDiscovery` or `get-token-prices`.
