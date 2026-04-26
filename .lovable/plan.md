Root cause found

Legion is failing because the main `gasless-transfer` backend function is not reliably starting. The deployed logs show repeated:

```text
CPU Time exceeded
module "/bufferutil@4.1.0/denonext/package.json" not found
module "/utf-8-validate@6.0.6/denonext/package.json" not found
```

A direct deployed call to `gasless-transfer` returned:

```text
546 WORKER_RESOURCE_LIMIT
Function failed due to not having enough compute resources
```

That means the request is dying before transaction logic runs. The UI then shows “Failed to send a request to the Edge Function” because the backend function crashes/gets killed during boot.

There is also an architecture mismatch:

- Project memory says gasless transfers should be handled by separate lightweight functions (`gasless-solana`, `gasless-evm`, `gasless-sui`).
- The current codebase only has one huge 2,856-line `gasless-transfer` function.
- The frontend still calls that monolith for prices, Solana transfers, Sui transfers, and EVM transfers.
- Even basic price polling currently calls the broken `gasless-transfer` endpoint every 30 seconds, adding load before users even send.

Important EVM limitation

Because the Ethereum/Base gasless smart contract is not deployed, true one-on-chain-transaction atomic EVM execution is not currently possible on Ethereum/Base. The existing EVM fallback uses permits/allowances and backend-submitted ERC-20 calls. That can be backend-gas-paid for supported ERC-20s, but without the deployed contract it cannot guarantee “transfer amount + fee” inside a single atomic smart contract call. Solana and Sui can still be built as a single co-signed transaction.

Plan to fix

1. Stop non-transfer calls from hitting the broken transfer function
   - Update dashboard price polling to use the existing lightweight `get-token-prices` function instead of `gasless-transfer?action=get_token_prices`.
   - Keep the existing multi-source pricing fallback behavior.
   - This removes background calls that currently trigger the crashing function every 30 seconds.

2. Unblock `gasless-transfer` boot with minimal changes
   - Remove heavy top-level blockchain SDK imports from `gasless-transfer/index.ts`.
   - Keep top-level code lightweight: CORS, constants, request parsing, shared response helpers.
   - Move Solana, Sui, and EVM imports behind their specific action/chain branches using dynamic imports.
   - Ensure every response path, including errors, returns CORS headers.
   - Keep dependency versions exact and pinned.

3. Make the function fail gracefully instead of failing to fetch
   - Add an early health/action response path so deployed calls confirm the function is alive.
   - Return structured JSON errors for invalid/missing fields instead of letting boot/runtime failures surface as generic fetch failures.
   - Sanitize user-facing errors so users do not see raw backend/edge technical wording.

4. Preserve the existing Solana/Sui transaction flows
   - Do not rewrite Solana or Sui transaction logic beyond what is necessary to lazy-load dependencies.
   - Preserve the existing build/sign/submit flow:
     - backend builds transaction
     - user signs
     - backend co-signs/pays gas
     - transaction submits
   - Keep amount consistency by preserving `transferAmountSmallest` handoff between build and submit.

5. Preserve EVM support while making the limitation explicit in code behavior
   - Keep USDC permit-based gasless support for Ethereum/Base.
   - Keep native ETH/Base ETH rejected for gasless transfer until the contract is deployed.
   - Avoid claiming EVM is “single atomic smart contract call” while contract addresses are `null`.
   - If no deployed contract exists, return clear guidance for unsupported EVM cases instead of failing generically.

6. Validation after implementation
   - Deploy the changed backend functions.
   - Directly test deployed functions with backend calls:
     - `get-token-prices` returns 200 with live prices.
     - `gasless-transfer` health/basic action returns 200, proving boot is fixed.
     - invalid `build_atomic_tx` requests return clean 400 JSON, not 546/failed fetch.
     - `get_backend_wallet` returns configured backend wallet public addresses.
   - Check backend logs to confirm no more `CPU Time exceeded`, `bufferutil`, or `utf-8-validate` boot errors.
   - Run the frontend and verify price polling no longer calls `gasless-transfer`.
   - Validate the send flow up to wallet-sign prompt in the preview. Full live on-chain completion still requires a connected funded user wallet to sign the real transaction.

Expected outcome

- The generic “Failed to send a request” error should stop.
- The backend transfer function should boot reliably.
- Price fetching should no longer overload the transfer function.
- Solana/Sui gasless paths should reach transaction build/sign/submit instead of failing at request time.
- Ethereum/Base ERC-20 paths should return actionable results, with unsupported native/undeployed-contract cases clearly blocked instead of crashing.

<lov-actions>
<lov-link url="https://docs.lovable.dev/tips-tricks/troubleshooting">Troubleshooting docs</lov-link>
</lov-actions>