/**
 * Core gasless transaction wrapping logic.
 *
 * `GaslessSDK.makeGasless(...)` takes a normal Solana Transaction and returns
 * a new Transaction where:
 *   - The sponsor wallet is the fee payer (pays SOL gas).
 *   - The user's original instructions are preserved.
 *   - A bundled SPL fee transfer (user → sponsor) is appended atomically.
 *   - The sponsor signs the transaction; the user only needs to add their
 *     signature before sending.
 */

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";

import { loadConfig, getFeeToken, SDKConfig } from "./config";
import { loadSponsorWallet } from "./wallet-loader";
import { buildFeeInstructions } from "./fee-collector";

export interface MakeGaslessParams {
  /** A standard Solana Transaction containing the user's instructions */
  transaction: Transaction;
  /** The end user's wallet public key */
  userPublicKey: PublicKey;
  /** Optional override of which fee token to charge (defaults to config.defaultFeeToken) */
  feeToken?: string;
}

export interface GaslessSDKOptions {
  /** Override config.json location */
  configPath?: string;
  /** Override sponsor wallet JSON location */
  sponsorWalletPath?: string;
  /** Provide an existing Connection instead of building one from the config */
  connection?: Connection;
}

const LOW_BALANCE_WARNING_SOL = 0.05;

export class GaslessSDK {
  public readonly config: SDKConfig;
  public readonly connection: Connection;
  public readonly sponsor: Keypair;

  constructor(options: GaslessSDKOptions = {}) {
    this.config = loadConfig(options.configPath);
    this.sponsor = loadSponsorWallet(options.sponsorWalletPath);
    this.connection =
      options.connection ?? new Connection(this.config.rpcUrl, "confirmed");

    // Best-effort low-balance warning (non-blocking)
    this.connection
      .getBalance(this.sponsor.publicKey)
      .then((lamports) => {
        const sol = lamports / LAMPORTS_PER_SOL;
        if (sol < LOW_BALANCE_WARNING_SOL) {
          console.warn(
            `⚠️  [GaslessSDK] Sponsor wallet ${this.sponsor.publicKey.toBase58()} is low: ${sol} SOL. ` +
              `Top it up to keep sponsoring gas.`
          );
        }
      })
      .catch(() => {
        /* ignore — connection problems will surface on first tx */
      });
  }

  /**
   * Wraps a user transaction into a gasless transaction:
   *   - sponsor pays SOL gas
   *   - user pays the configured SPL fee atomically
   *
   * The returned Transaction is pre-signed by the sponsor. The caller must add
   * the user's signature (via wallet adapter, `partialSign`, etc.) before sending.
   */
  async makeGasless(params: MakeGaslessParams): Promise<Transaction> {
    const { transaction, userPublicKey, feeToken } = params;

    const tokenConfig = getFeeToken(this.config, feeToken);

    // Build the SPL fee-collection instructions
    const { instructions: feeIxs } = await buildFeeInstructions(
      this.connection,
      tokenConfig,
      userPublicKey,
      this.sponsor.publicKey
    );

    // Re-build a transaction: user instructions first, then fee transfer.
    // We deliberately rebuild rather than mutate so blockhash + fee payer are clean.
    const userIxs: TransactionInstruction[] = [...transaction.instructions];

    const { blockhash, lastValidBlockHeight } =
      await this.connection.getLatestBlockhash("confirmed");

    const wrapped = new Transaction({
      feePayer: this.sponsor.publicKey,
      blockhash,
      lastValidBlockHeight,
    });

    wrapped.add(...userIxs, ...feeIxs);

    // Sponsor signs first; user signature still required to authorize the SPL
    // transfer from their ATA. `partialSign` keeps the user's slot open.
    wrapped.partialSign(this.sponsor);

    return wrapped;
  }

  /**
   * Sends a fully-signed gasless transaction and waits for confirmation.
   * The caller is responsible for adding the user's signature before calling this.
   */
  async sendAndConfirm(transaction: Transaction): Promise<string> {
    const raw = transaction.serialize();
    const signature = await this.connection.sendRawTransaction(raw, {
      skipPreflight: false,
      maxRetries: 3,
    });

    await this.connection.confirmTransaction(signature, "confirmed");
    return signature;
  }

  /** Returns the sponsor wallet's current SOL balance, for monitoring. */
  async getSponsorBalance(): Promise<number> {
    const lamports = await this.connection.getBalance(this.sponsor.publicKey);
    return lamports / LAMPORTS_PER_SOL;
  }
}
