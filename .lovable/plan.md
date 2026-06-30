## Problem

For Paj off-ramp, the user is currently double-charged the $0.30 fee:

1. **Frontend** sends `feeUsdOverride: $0.30` + `deductFeeFromTokenAmount: true` to `gasless-transfer`, so the backend splits the user's debit into: principal → Paj deposit address, $0.30 → our backend wallet.
2. **Paj order** is created with `businessUSDCFee: $0.30`, so Paj *also* withholds $0.30 from whatever lands on the deposit address.

Result: a $5 send debits $5.30, $0.30 goes to our backend wallet, and Paj still deducts another $0.30 from the $5 that arrived — recipient ends up with ~$4.70 instead of $5.

## Goal

Only Paj should collect the $0.30 fee (via the existing `businessUSDCFee` on the order). Our backend signs and sponsors SOL gas but takes **no** token fee. The recipient bank should receive `gross − $0.30` in NGN.

## Changes

### 1. `src/components/PajOfframpForm.tsx`
In the two `gasless-transfer` invocations (`build_atomic_tx` and `submit_atomic_tx`):
- Remove `feeUsdOverride`, `feeTokenPriceUsd`, `deductFeeFromTokenAmount`, and `feeAmountSmallest`.
- Send the full gross token amount straight to `order.depositAddress` so Paj receives the entire user debit and applies its $0.30 fee on its own books.
- Keep the additive UI summary as-is (user still sees "amount + $0.30 fee = total debit") — the $0.30 is now collected by Paj only, not by our backend.

### 2. `supabase/functions/paj-cash/index.ts` — `create_order`
- Pass `amount: amountToken` (the gross the user typed) instead of `amount: netToken` to `paj.createOfframp`. The `businessUSDCFee: FLAT_FEE_USD` field already tells Paj to deduct $0.30 on their side, so the order's `fiatAmount` will correctly reflect `(gross − $0.30) × rate`.
- Persist `amount_sent = amountToken` and `usdc_amount = grossUsd` in `paj_orders` (current code stores the net), so the recorded amount matches what we actually transfer on-chain.
- Keep `grossAmountToken` / `grossAmountUsd` in the response so the form continues to display the breakdown.

### 3. `supabase/functions/gasless-transfer/index.ts`
No structural change needed — without `feeUsdOverride`/`deductFeeFromTokenAmount`, the Paj flow now follows the normal "single recipient transfer" path. The backend still sponsors SOL gas.

## Verification

- Send $5 USDC via Paj: wallet debit = $5 (no fee split), Paj deposit address receives full $5, Paj credits ₦(4.70 × rate) to the bank. Backend wallet receives nothing token-side.
- Confirm `paj_orders` row shows `amount_sent = 5`, `usdc_amount = 5`, `fee_usd = 0.30`.
- "Pajjed!" success card still shows the correct NGN payout.
