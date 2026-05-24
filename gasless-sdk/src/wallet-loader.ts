/**
 * Loads the sponsor wallet (a Solana Keypair) from a local JSON file.
 *
 * The file must contain a 64-element JSON array — the same format produced by
 * `solana-keygen new --outfile sponsor-wallet.json` or Phantom's export.
 *
 * ⚠️ This wallet controls real SOL. NEVER commit `sponsor-wallet.json` to git.
 */

import * as fs from "fs";
import * as path from "path";
import { Keypair } from "@solana/web3.js";

export function loadSponsorWallet(walletPath?: string): Keypair {
  const finalPath =
    walletPath ??
    process.env.SPONSOR_WALLET_PATH ??
    path.resolve(process.cwd(), "sponsor-wallet.json");

  if (!fs.existsSync(finalPath)) {
    throw new Error(
      `[GaslessSDK] sponsor-wallet.json not found at ${finalPath}.\n` +
        `Generate one with: solana-keygen new --outfile sponsor-wallet.json\n` +
        `Then fund it with SOL to cover gas fees.`
    );
  }

  let secret: number[];
  try {
    secret = JSON.parse(fs.readFileSync(finalPath, "utf-8"));
  } catch (e) {
    throw new Error(
      `[GaslessSDK] Failed to parse sponsor wallet JSON. ` +
        `It must be a JSON array of 64 numbers.`
    );
  }

  if (!Array.isArray(secret) || secret.length !== 64) {
    throw new Error(
      `[GaslessSDK] Invalid sponsor wallet. Expected a 64-element JSON array, got length ${secret.length}.`
    );
  }

  return Keypair.fromSecretKey(Uint8Array.from(secret));
}
