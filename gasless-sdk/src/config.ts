/**
 * Configuration loader and types for the Legion Gasless SDK.
 *
 * Edit `config.json` at the project root to add fee tokens or change pricing.
 * Each fee token entry charges the user a fixed amount per gasless transaction.
 */

import * as fs from "fs";
import * as path from "path";

export interface FeeTokenConfig {
  /** Human-readable symbol, e.g. "USDC" */
  token: string;
  /** SPL token mint address on Solana */
  mintAddress: string;
  /** Amount to charge per transaction, in human units (e.g. 0.10 = $0.10) */
  amount: number;
}

export interface SDKConfig {
  /** Solana RPC endpoint */
  rpcUrl: string;
  gasless: {
    fees: FeeTokenConfig[];
    /** Symbol of the default fee token (must exist in `fees`) */
    defaultFeeToken: string;
  };
}

/**
 * Loads the SDK config from `config.json` at the given path.
 * Falls back to `./config.json` in the current working directory.
 */
export function loadConfig(configPath?: string): SDKConfig {
  const finalPath = configPath ?? path.resolve(process.cwd(), "config.json");

  if (!fs.existsSync(finalPath)) {
    throw new Error(
      `[GaslessSDK] config.json not found at ${finalPath}. ` +
        `Copy the template from the SDK root and configure your fee tokens.`
    );
  }

  const raw = fs.readFileSync(finalPath, "utf-8");
  const parsed = JSON.parse(raw) as SDKConfig;

  // Allow env overrides for ops convenience
  if (process.env.SOLANA_RPC_URL) parsed.rpcUrl = process.env.SOLANA_RPC_URL;
  if (process.env.DEFAULT_FEE_TOKEN)
    parsed.gasless.defaultFeeToken = process.env.DEFAULT_FEE_TOKEN;

  // Validate the default token exists
  const hasDefault = parsed.gasless.fees.some(
    (f) => f.token === parsed.gasless.defaultFeeToken
  );
  if (!hasDefault) {
    throw new Error(
      `[GaslessSDK] defaultFeeToken "${parsed.gasless.defaultFeeToken}" is not in the fees list.`
    );
  }

  return parsed;
}

/** Looks up a fee token by symbol */
export function getFeeToken(
  config: SDKConfig,
  symbol?: string
): FeeTokenConfig {
  const target = symbol ?? config.gasless.defaultFeeToken;
  const token = config.gasless.fees.find((f) => f.token === target);
  if (!token) {
    throw new Error(
      `[GaslessSDK] Fee token "${target}" not configured. Add it to config.json.`
    );
  }
  return token;
}
