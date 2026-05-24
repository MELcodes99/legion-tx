/**
 * Builds the SPL token fee-collection instructions that get appended to every
 * gasless transaction.
 *
 * Flow:
 *   1. Compute the user's Associated Token Account (ATA) for the fee token.
 *   2. Compute the sponsor's ATA (creating it if missing — sponsor pays rent).
 *   3. If the user's ATA does not exist, create it (sponsor pays rent).
 *   4. Append a `transfer` instruction moving `amount` from user → sponsor.
 *
 * These instructions are added to the SAME transaction as the user's
 * business logic, so fee collection and the user's action are atomic.
 */

import {
  Connection,
  PublicKey,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  getMint,
} from "@solana/spl-token";
import type { FeeTokenConfig } from "./config";

export interface FeeInstructions {
  instructions: TransactionInstruction[];
  userAta: PublicKey;
  sponsorAta: PublicKey;
  /** Raw amount (in token base units) that will be deducted from the user */
  rawAmount: bigint;
}

export async function buildFeeInstructions(
  connection: Connection,
  feeToken: FeeTokenConfig,
  userPublicKey: PublicKey,
  sponsorPublicKey: PublicKey
): Promise<FeeInstructions> {
  const mint = new PublicKey(feeToken.mintAddress);

  // Fetch mint to learn decimals
  const mintInfo = await getMint(connection, mint);
  const rawAmount = BigInt(
    Math.round(feeToken.amount * Math.pow(10, mintInfo.decimals))
  );

  if (rawAmount <= 0n) {
    throw new Error(
      `[GaslessSDK] Fee amount for ${feeToken.token} resolved to 0 base units. ` +
        `Check decimals / config.`
    );
  }

  const userAta = await getAssociatedTokenAddress(
    mint,
    userPublicKey,
    false,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  const sponsorAta = await getAssociatedTokenAddress(
    mint,
    sponsorPublicKey,
    false,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );

  const instructions: TransactionInstruction[] = [];

  // Ensure sponsor ATA exists (sponsor pays for itself)
  const sponsorAtaInfo = await connection.getAccountInfo(sponsorAta);
  if (!sponsorAtaInfo) {
    instructions.push(
      createAssociatedTokenAccountInstruction(
        sponsorPublicKey,
        sponsorAta,
        sponsorPublicKey,
        mint
      )
    );
  }

  // Ensure user ATA exists; if not, sponsor pays the rent so the tx still works
  const userAtaInfo = await connection.getAccountInfo(userAta);
  if (!userAtaInfo) {
    instructions.push(
      createAssociatedTokenAccountInstruction(
        sponsorPublicKey, // payer
        userAta,
        userPublicKey, // owner
        mint
      )
    );
  }

  // Transfer fee from user → sponsor
  instructions.push(
    createTransferInstruction(
      userAta,
      sponsorAta,
      userPublicKey,
      rawAmount
    )
  );

  return { instructions, userAta, sponsorAta, rawAmount };
}
