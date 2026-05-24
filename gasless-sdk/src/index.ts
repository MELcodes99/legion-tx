/**
 * Legion Gasless SDK — public entrypoint.
 *
 * Usage:
 *   import { GaslessSDK } from "legion-gasless-sdk";
 *   const sdk = new GaslessSDK();
 *   const tx = await sdk.makeGasless({ transaction, userPublicKey });
 *   await sdk.sendAndConfirm(tx);
 */

export { GaslessSDK } from "./gasless";
export type { MakeGaslessParams, GaslessSDKOptions } from "./gasless";
export { loadConfig, getFeeToken } from "./config";
export type { SDKConfig, FeeTokenConfig } from "./config";
export { loadSponsorWallet } from "./wallet-loader";
export { buildFeeInstructions } from "./fee-collector";
