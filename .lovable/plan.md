## Goal

Make EVM gasless transfers behave exactly like Solana and Sui: **one on-chain transaction** that atomically (a) moves the principal from sender → recipient and (b) moves the fee from sender → backend. Either both succeed or the whole tx reverts.

Solana/Sui code paths are NOT touched.

---

## Why this needs a smart contract

On EVM there is no native primitive that lets a third party (the backend) move tokens from a user's wallet AND splits the destination in a single transaction. ERC-20's `transferFrom` only supports one destination per call. The current "gasless" EVM flow therefore submits **two** `transferFrom` calls (principal + fee) — they're gasless for the user, but not atomic.

The repo already contains the right contract: `src/contracts/GaslessTransfer.sol`. It exposes:
- `gaslessTransfer(sender, receiver, tokenToSend, amount, feeToken, feeAmount)` — different fee token
- `gaslessTransferSameToken(sender, receiver, token, amount, feeAmount)` — same token (gas-optimized)

Both perform the principal transfer + fee transfer inside one `nonReentrant` call. That is the atomic primitive we need.

The edge function (`supabase/functions/gasless-transfer/index.ts`) is **already wired** to call this contract (METHOD 1 at line 2064) when `GASLESS_CONTRACT_ADDRESSES[chain]` is non-null. Today both entries are `null`, which is why it falls back to the 2-tx Permit2/permit flow.

So the work is: **deploy the contract, plug in the addresses, switch the approval/permit spender from the backend EOA to the contract, and verify**.

---

## What changes (and what doesn't)

### Changes
1. **Deploy `GaslessTransfer.sol`** to Base mainnet and Ethereum mainnet, with `backendWallet = 0x89AF…9bb1` (the existing `EVM_BACKEND_WALLET_PRIVATE_KEY` address) as the constructor arg.
2. **Edge function `gasless-transfer/index.ts`**:
   - Set `GASLESS_CONTRACT_ADDRESSES.base` and `.ethereum` to the deployed addresses (read from new secrets `GASLESS_CONTRACT_BASE` / `GASLESS_CONTRACT_ETHEREUM` so addresses aren't hard-coded).
   - In `build_atomic_tx` for Base/Ethereum: when the contract is configured, return the contract address as the **permit/Permit2 spender** instead of the backend EOA. This is the critical change — the user signs a permit allowing the *contract* (not the backend) to pull tokens.
   - Make sure the EIP-2612 `permit` call and Permit2 `permitTransferFrom` both target the contract address so the contract can do `safeTransferFrom(sender, …)` inside its own tx.
   - In `execute_evm_transfer`: the existing METHOD 1 already calls `gaslessTransfer` / `gaslessTransferSameToken` correctly — verify it's reached now that addresses are set.
   - Keep METHOD 2 (Permit2 2-tx) and METHOD 3 (direct transferFrom) as fallbacks for safety, but they should not be used once the contract is live on each chain.
3. **`MultiChainTransferForm.tsx`**: no logic change required — it already forwards `permitDomain`, `permit2Address`, signatures, etc. from the build response. The only thing that changes is the *value* of the spender encoded inside the permit message, which the backend already computes.
4. **One-time user approvals**:
   - **USDC (Base + Ethereum)**: uses EIP-2612 native permit → no on-chain approval needed, ever. The permit message will name the contract as spender. Fully gasless from the first transfer.
   - **USDT (Base)**: uses Permit2. The Permit2 contract is the spender of the user's USDT (one-time approval to `0x000000000022D473030F116dDEE9F6B43aC78BA3`, already handled by the existing `permit2ApprovalNeeded` flow). The Permit2 `permitTransferFrom` call inside our contract will pull tokens directly to the contract, which then does the atomic split.
   - **USDT on Ethereum**: stays "Coming Soon" (USDT mainnet has no permit and no Permit2 listing the way the current code paths are built; revisit after deployment).

### NOT changed
- Solana code paths (SPL Token, atomic instructions, validation, signing).
- Sui code paths.
- Token discovery, prices, UI form, rate limiting, analytics, logging.
- `supabase/config.toml` (no new functions).

---

## Technical detail (for the engineer)

### 1. Deployment

I'll write a one-shot Deno script (run once locally, no edge function needed) that:
- Reads `EVM_BACKEND_WALLET_PRIVATE_KEY` from a deployer wallet (or asks the user to use a separate funded deployer EOA — recommended).
- Compiles `GaslessTransfer.sol` against OpenZeppelin (`@openzeppelin/contracts@5.x`) using `solc` via npm.
- Deploys to Base mainnet (`https://base-rpc.publicnode.com`) and Ethereum mainnet (`https://ethereum-rpc.publicnode.com`) with constructor arg = backend wallet address.
- Prints the two deployed addresses.
- Optionally verifies on Basescan/Etherscan if API keys are provided (we can skip and verify manually).

**Cost**: Base deployment ≈ 0.0002 ETH (~$0.50). Ethereum deployment ≈ 0.005–0.02 ETH depending on gas (~$15–60). The user funds the deployer EOA before we run the script.

### 2. Secrets

Add two new edge-function secrets so contract addresses aren't hard-coded:
- `GASLESS_CONTRACT_BASE`
- `GASLESS_CONTRACT_ETHEREUM`

Edge function reads them at boot and overrides the `null` defaults in `GASLESS_CONTRACT_ADDRESSES`.

### 3. Spender swap inside `build_atomic_tx` (the actual code change)

Currently (around lines 1828–1871), `permitDomain` + the EIP-712 message encode `spender = evmBackendWallet.address`. Change that to:

```ts
const spender = GASLESS_CONTRACT_ADDRESSES[chain] ?? evmBackendWallet.address;
```

…and use `spender` everywhere the backend address is used as the approval target (EIP-2612 permit `spender` field, Permit2 `transferDetails.to`, allowance reads). This is ~10 lines of edits, isolated to the EVM branch — Solana/Sui untouched.

### 4. Execute path

`METHOD 1` (lines 2064–2096) is already correct:

```ts
const gaslessContract = new ethers.Contract(contractAddress, GASLESS_CONTRACT_ABI, backendSigner);
if (useSameTokenForFee) {
  await gaslessContract.gaslessTransferSameToken(senderAddress, recipientAddress, tokenContract, transferAmount, feeAmount);
} else {
  await gaslessContract.gaslessTransfer(senderAddress, recipientAddress, tokenContract, transferAmount, feeToken, feeAmount);
}
```

Backend pays the gas, single tx, atomic. Same model as Solana's atomic builder.

### 5. Permit2 nuance

For USDT/Base, the user's one-time approval is to **Permit2** (not to our contract). The contract calls `Permit2.permitTransferFrom(...)` from inside `gaslessTransfer` to pull tokens. We need a small addition to the contract's ABI usage in the edge function to include a Permit2-aware variant, OR we add a thin wrapper function to the contract: `gaslessTransferWithPermit2(...)` that internally calls Permit2 then splits. To keep the deployed contract minimal and audited as-is, the cleanest approach is:

- For **USDC (native permit)**: user signs an EIP-2612 permit naming our contract as spender → backend submits one tx that calls `permit()` then `gaslessTransferSameToken()`. To make it truly one tx, we either (a) bundle via a multicall on the contract, or (b) add a helper `permitAndTransfer(...)` to `GaslessTransfer.sol` before deploying.

I recommend option (b): add one function to `GaslessTransfer.sol` before deployment:

```solidity
function permitAndGaslessTransfer(
    address sender, address receiver,
    IERC20 token, uint256 amount, uint256 feeAmount,
    uint256 permitValue, uint256 deadline,
    uint8 v, bytes32 r, bytes32 s
) external onlyBackend nonReentrant {
    IERC20Permit(address(token)).permit(sender, address(this), permitValue, deadline, v, r, s);
    token.safeTransferFrom(sender, receiver, amount);
    if (feeAmount > 0) token.safeTransferFrom(sender, backendWallet, feeAmount);
}
```

This makes USDC fully one-tx (permit + split + transfer in a single on-chain tx), matching Solana/Sui.

For **USDT/Base + Permit2**, similar wrapper:

```solidity
function permit2AndGaslessTransfer(
    address sender, address receiver,
    IERC20 token, uint256 amount, uint256 feeAmount,
    ISignatureTransfer.PermitTransferFrom calldata permit,
    bytes calldata signature
) external onlyBackend nonReentrant { ... }
```

I'll add both wrappers to `GaslessTransfer.sol` before deploying, so every supported case (USDC native permit, USDT Permit2) becomes truly single-tx atomic.

### 6. Validation plan (before saying "done")

1. Deploy script runs cleanly on Base testnet first (Sepolia) with the same wrappers — verify both wrappers execute end-to-end.
2. Deploy to Base mainnet, fund backend EOA with a tiny amount of ETH for gas.
3. Edge function direct call: `build_atomic_tx` chain=base USDC → response has `spender` = contract address (not backend EOA).
4. End-to-end UI test on Base USDC: sign one permit → see exactly **one** Basescan tx that emits both `Transfer(sender, recipient, amount)` and `Transfer(sender, backend, fee)` events.
5. Repeat for Base USDT (Permit2) — also one tx, both transfers atomic.
6. Repeat for Ethereum USDC.
7. Solana + Sui regression: send a small USDC tx on each, confirm identical behavior to today.

Only after all 7 pass do I report success.

---

## Files / actions

### New
- `scripts/deployGaslessContract.ts` — one-shot deployer (Deno, runs locally, not deployed as edge function).
- Two new edge-function secrets: `GASLESS_CONTRACT_BASE`, `GASLESS_CONTRACT_ETHEREUM` (added via the secret tool after I confirm contract addresses with you).

### Edited
- `src/contracts/GaslessTransfer.sol` — add `permitAndGaslessTransfer` and `permit2AndGaslessTransfer` wrappers (before deployment).
- `supabase/functions/gasless-transfer/index.ts` — read contract addresses from secrets; in `build_atomic_tx` for Base/Ethereum set `spender = contractAddress`; in `execute_evm_transfer` route to the new wrapper functions when the contract is configured. ~30 lines of edits, EVM branch only.

### NOT edited
- All Solana code in `gasless-transfer/index.ts`.
- All Sui code in `gasless-transfer/index.ts`.
- `MultiChainTransferForm.tsx`.
- Any pricing, UI, analytics, or rate-limit code.

---

## What I need from you to deploy

1. Confirm you want to fund the deployer wallet with ~$1 on Base + ~$30 on Ethereum (one-time deployment cost). You can use the existing backend wallet as deployer or give me a separate deployer key — separate is safer.
2. After I write the deployment script, you run it (or approve me running it) once the deployer wallet is funded.
3. I take the printed contract addresses and add them as secrets `GASLESS_CONTRACT_BASE` / `GASLESS_CONTRACT_ETHEREUM`.

If you'd rather skip Ethereum mainnet for now (because of gas cost), I can deploy to Base only; Ethereum stays on the existing 2-tx Permit2 path until you're ready. Solana/Sui are unaffected either way.