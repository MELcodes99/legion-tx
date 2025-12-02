// Multi-chain token configuration
export type ChainType = 'solana' | 'sui' | 'base' | 'ethereum';

export interface TokenConfig {
  name: string;
  symbol: string;
  mint: string; // Token address/mint
  decimals: number;
  chain: ChainType;
  gasFee: number; // Fixed gas fee in USD
  isNative: boolean; // Is this the chain's native token (SOL, SUI, ETH)
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
  
  // Sui tokens
  'USDC_SUI': {
    name: 'USD Coin',
    symbol: 'USDC',
    mint: '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC',
    decimals: 6,
    chain: 'sui',
    gasFee: 0.40,
    isNative: false,
  },
  'USDT_SUI': {
    name: 'Tether USD',
    symbol: 'USDT',
    mint: '0x375f70cf2ae4c00bf37117d0c85a2c71545e6ee05c4a5c7d282cd66a4504b068::usdt::USDT',
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

  // Base tokens
  'USDC_BASE': {
    name: 'USD Coin',
    symbol: 'USDC',
    mint: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // Base USDC
    decimals: 6,
    chain: 'base',
    gasFee: 0.40,
    isNative: false,
  },
  'USDT_BASE': {
    name: 'Tether USD',
    symbol: 'USDT',
    mint: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2', // Base USDT
    decimals: 6,
    chain: 'base',
    gasFee: 0.40,
    isNative: false,
  },
  'BASE_ETH': {
    name: 'Ethereum',
    symbol: 'ETH',
    mint: '0x0000000000000000000000000000000000000000', // Native ETH on Base
    decimals: 18,
    chain: 'base',
    gasFee: 0.40,
    isNative: true,
  },

  // Ethereum tokens
  'USDC_ETH': {
    name: 'USD Coin',
    symbol: 'USDC',
    mint: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // Ethereum USDC
    decimals: 6,
    chain: 'ethereum',
    gasFee: 0.40,
    isNative: false,
  },
  'USDT_ETH': {
    name: 'Tether USD',
    symbol: 'USDT',
    mint: '0xdAC17F958D2ee523a2206206994597C13D831ec7', // Ethereum USDT
    decimals: 6,
    chain: 'ethereum',
    gasFee: 0.40,
    isNative: false,
  },
  'ETH': {
    name: 'Ethereum',
    symbol: 'ETH',
    mint: '0x0000000000000000000000000000000000000000', // Native ETH
    decimals: 18,
    chain: 'ethereum',
    gasFee: 0.40,
    isNative: true,
  },
};

export const MIN_TRANSFER_USD = 5;

// Chain display names
export const CHAIN_NAMES: Record<ChainType, string> = {
  solana: 'Solana',
  sui: 'Sui',
  base: 'Base',
  ethereum: 'Ethereum',
};

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
  const chainName = CHAIN_NAMES[config.chain];
  return `${config.symbol} (${chainName})`;
};
