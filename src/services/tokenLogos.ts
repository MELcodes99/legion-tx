import { ChainType } from '@/config/tokens';

// Token logo cache to avoid repeated fetches
const logoCache: Record<string, string> = {};

// Known token logos (fallback)
const KNOWN_LOGOS: Record<string, string> = {
  // Solana
  'So11111111111111111111111111111111111111112': 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png',
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png',
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB/logo.png',
  
  // Sui
  '0x2::sui::SUI': 'https://cryptologos.cc/logos/sui-sui-logo.png',
  
  // Ethereum/Base - Native ETH
  '0x0000000000000000000000000000000000000000': 'https://cryptologos.cc/logos/ethereum-eth-logo.png',
  
  // USDC addresses
  '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48': 'https://cryptologos.cc/logos/usd-coin-usdc-logo.png',
  '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913': 'https://cryptologos.cc/logos/usd-coin-usdc-logo.png',
  
  // USDT addresses
  '0xdAC17F958D2ee523a2206206994597C13D831ec7': 'https://cryptologos.cc/logos/tether-usdt-logo.png',
  '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2': 'https://cryptologos.cc/logos/tether-usdt-logo.png',
  
  // DAI
  '0x6B175474E89094C44Da98b954EedscdeCB5BE3bF': 'https://cryptologos.cc/logos/multi-collateral-dai-dai-logo.png',
  '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb': 'https://cryptologos.cc/logos/multi-collateral-dai-dai-logo.png',
  
  // WBTC
  '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599': 'https://cryptologos.cc/logos/wrapped-bitcoin-wbtc-logo.png',
  
  // LINK
  '0x514910771AF9Ca656af840dff83E8264EcF986CA': 'https://cryptologos.cc/logos/chainlink-link-logo.png',
  
  // UNI
  '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984': 'https://cryptologos.cc/logos/uniswap-uni-logo.png',
  
  // AAVE
  '0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9': 'https://cryptologos.cc/logos/aave-aave-logo.png',
  
  // SHIB
  '0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE': 'https://cryptologos.cc/logos/shiba-inu-shib-logo.png',
  
  // PEPE
  '0x6982508145454Ce325dDbE47a25d4ec3d2311933': 'https://assets.coingecko.com/coins/images/29850/small/pepe-token.jpeg',
  
  // WETH on Base
  '0x4200000000000000000000000000000000000006': 'https://cryptologos.cc/logos/ethereum-eth-logo.png',
  
  // cbETH
  '0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22': 'https://assets.coingecko.com/coins/images/27008/small/cbeth.png',
};

// Jupiter API for Solana token metadata
const JUPITER_TOKEN_LIST_URL = 'https://token.jup.ag/strict';

// CoinGecko token info by platform
const COINGECKO_API = 'https://api.coingecko.com/api/v3';

let jupiterTokenList: Record<string, { logoURI: string; symbol: string; name: string }> | null = null;

// Fetch Jupiter token list (Solana)
async function fetchJupiterTokenList(): Promise<Record<string, { logoURI: string; symbol: string; name: string }>> {
  if (jupiterTokenList) return jupiterTokenList;
  
  try {
    const response = await fetch(JUPITER_TOKEN_LIST_URL);
    if (!response.ok) throw new Error('Failed to fetch Jupiter token list');
    
    const tokens = await response.json();
    jupiterTokenList = {};
    
    for (const token of tokens) {
      jupiterTokenList[token.address] = {
        logoURI: token.logoURI || '',
        symbol: token.symbol,
        name: token.name,
      };
    }
    
    return jupiterTokenList;
  } catch (error) {
    console.error('Error fetching Jupiter token list:', error);
    return {};
  }
}

// Fetch logo from CoinGecko by contract address
async function fetchCoinGeckoLogo(address: string, platform: 'ethereum' | 'base'): Promise<string | null> {
  try {
    const response = await fetch(
      `${COINGECKO_API}/coins/${platform}/contract/${address.toLowerCase()}`
    );
    
    if (!response.ok) return null;
    
    const data = await response.json();
    return data.image?.small || data.image?.thumb || null;
  } catch (error) {
    console.error('Error fetching CoinGecko logo:', error);
    return null;
  }
}

// Main function to get token logo
export async function getTokenLogo(address: string, chain: ChainType): Promise<string> {
  // Check cache first
  const cacheKey = `${chain}:${address}`;
  if (logoCache[cacheKey]) {
    return logoCache[cacheKey];
  }
  
  // Check known logos
  if (KNOWN_LOGOS[address]) {
    logoCache[cacheKey] = KNOWN_LOGOS[address];
    return KNOWN_LOGOS[address];
  }
  
  let logoUrl: string | null = null;
  
  try {
    if (chain === 'solana') {
      // Use Jupiter for Solana tokens
      const tokenList = await fetchJupiterTokenList();
      if (tokenList[address]?.logoURI) {
        logoUrl = tokenList[address].logoURI;
      }
    } else if (chain === 'ethereum' || chain === 'base') {
      // Use CoinGecko for EVM tokens
      logoUrl = await fetchCoinGeckoLogo(address, chain === 'base' ? 'base' : 'ethereum');
    } else if (chain === 'sui') {
      // For Sui, we use known logos or a placeholder
      // CoinGecko doesn't have great Sui support via contract lookup
      // Try to extract from the coin type
      const parts = address.split('::');
      if (parts.length >= 2) {
        const symbol = parts[parts.length - 1].toLowerCase();
        if (symbol === 'usdc') {
          logoUrl = 'https://cryptologos.cc/logos/usd-coin-usdc-logo.png';
        } else if (symbol === 'usdt') {
          logoUrl = 'https://cryptologos.cc/logos/tether-usdt-logo.png';
        }
      }
    }
  } catch (error) {
    console.error('Error fetching token logo:', error);
  }
  
  // Use placeholder if no logo found
  const finalLogo = logoUrl || generatePlaceholderLogo(address);
  logoCache[cacheKey] = finalLogo;
  
  return finalLogo;
}

// Generate a placeholder logo (data URI with initials)
function generatePlaceholderLogo(address: string): string {
  // Return a generic token icon placeholder
  return `data:image/svg+xml,${encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <circle cx="50" cy="50" r="45" fill="#6366f1"/>
      <text x="50" y="55" font-size="24" fill="white" text-anchor="middle" font-family="Arial, sans-serif" font-weight="bold">
        ${address.slice(0, 2).toUpperCase()}
      </text>
    </svg>
  `)}`;
}

// Batch fetch logos for multiple tokens
export async function batchFetchLogos(
  tokens: { address: string; chain: ChainType }[]
): Promise<Record<string, string>> {
  const results: Record<string, string> = {};
  
  // Group by chain for efficient fetching
  const solanaTokens = tokens.filter(t => t.chain === 'solana');
  const evmTokens = tokens.filter(t => t.chain === 'ethereum' || t.chain === 'base');
  const suiTokens = tokens.filter(t => t.chain === 'sui');
  
  // Fetch Solana tokens from Jupiter (single request)
  if (solanaTokens.length > 0) {
    const tokenList = await fetchJupiterTokenList();
    for (const token of solanaTokens) {
      if (KNOWN_LOGOS[token.address]) {
        results[token.address] = KNOWN_LOGOS[token.address];
      } else if (tokenList[token.address]?.logoURI) {
        results[token.address] = tokenList[token.address].logoURI;
      } else {
        results[token.address] = generatePlaceholderLogo(token.address);
      }
    }
  }
  
  // Fetch EVM tokens (parallel with rate limiting)
  for (const token of evmTokens) {
    if (KNOWN_LOGOS[token.address]) {
      results[token.address] = KNOWN_LOGOS[token.address];
    } else {
      // Don't make too many CoinGecko requests - use placeholder for unknown
      results[token.address] = generatePlaceholderLogo(token.address);
    }
  }
  
  // Fetch Sui tokens
  for (const token of suiTokens) {
    if (KNOWN_LOGOS[token.address]) {
      results[token.address] = KNOWN_LOGOS[token.address];
    } else {
      const parts = token.address.split('::');
      const symbol = parts[parts.length - 1]?.toLowerCase();
      if (symbol === 'usdc') {
        results[token.address] = 'https://cryptologos.cc/logos/usd-coin-usdc-logo.png';
      } else if (symbol === 'usdt') {
        results[token.address] = 'https://cryptologos.cc/logos/tether-usdt-logo.png';
      } else {
        results[token.address] = generatePlaceholderLogo(token.address);
      }
    }
  }
  
  // Update cache
  for (const token of tokens) {
    const cacheKey = `${token.chain}:${token.address}`;
    if (results[token.address]) {
      logoCache[cacheKey] = results[token.address];
    }
  }
  
  return results;
}

// Get token metadata from Jupiter (Solana only)
export async function getSolanaTokenMetadata(address: string): Promise<{ symbol: string; name: string; logoURI: string } | null> {
  const tokenList = await fetchJupiterTokenList();
  return tokenList[address] || null;
}
