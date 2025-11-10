// Multi-chain token configuration
export type ChainType = 'solana' | 'sui';

export interface TokenConfig {
  name: string;
  symbol: string;
  mint: string; // Token address/mint
  decimals: number;
  chain: ChainType;
  gasFee: number; // Fixed gas fee in USD
  isNative: boolean; // Is this the chain's native token (SOL, SUI)
}

export const TOKENS: Record<string, TokenConfig> = {
  // Solana tokens
  'USDC_SOL': {
    name: 'USD Coin',
    symbol: 'USDC',
    mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    decimals: 6,
    chain: 'solana',
    gasFee: 0.50,
    isNative: false,
  },
  'USDT_SOL': {
    name: 'Tether USD',
    symbol: 'USDT',
    mint: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
    decimals: 6,
    chain: 'solana',
    gasFee: 0.50,
    isNative: false,
  },
  'SOL': {
    name: 'Solana',
    symbol: 'SOL',
    mint: 'So11111111111111111111111111111111111111112', // Wrapped SOL
    decimals: 9,
    chain: 'solana',
    gasFee: 0.50,
    isNative: true,
  },
  
  // Sui tokens - Note: Sui has multiple USDC/USDT implementations
  'USDC_SUI': {
    name: 'USD Coin',
    symbol: 'USDC',
    mint: '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC', // Native Sui USDC
    decimals: 6,
    chain: 'sui',
    gasFee: 0.40,
    isNative: false,
  },
  'USDT_SUI': {
    name: 'Tether USD',
    symbol: 'USDT',
    mint: '0xc060006111016b8a020ad5b33834984a437aaa7d3c74c18e09a95d48aceab08c::coin::COIN', // Native Sui USDT
    decimals: 6,
    chain: 'sui',
    gasFee: 0.40,
    isNative: false,
  },
  'SUI': {
    name: 'Sui',
    symbol: 'SUI',
    mint: '0x2::sui::SUI',
    decimals: 9,
    chain: 'sui',
    gasFee: 0.40,
    isNative: true,
  },
};

export const MIN_TRANSFER_USD = 5;

// Get tokens by chain
export const getTokensByChain = (chain: ChainType): TokenConfig[] => {
  return Object.values(TOKENS).filter(token => token.chain === chain);
};

// Get token config by key
export const getTokenConfig = (key: string): TokenConfig | undefined => {
  return TOKENS[key];
};

// Display name for token (includes chain)
export const getTokenDisplayName = (key: string): string => {
  const config = TOKENS[key];
  if (!config) return key;
  return `${config.symbol} (${config.chain === 'solana' ? 'Sol' : 'Sui'})`;
};
