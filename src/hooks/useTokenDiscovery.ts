import { useState, useEffect, useCallback, useRef } from 'react';
import { Connection, PublicKey } from '@solana/web3.js';
import { useConnection } from '@solana/wallet-adapter-react';
import { useSuiClient } from '@mysten/dapp-kit';
import { createPublicClient, http, parseAbi } from 'viem';
import { mainnet, base } from 'viem/chains';
import { ChainType, TOKENS, TokenConfig } from '@/config/tokens';
import { supabase } from '@/integrations/supabase/client';
import { batchFetchLogos, getSolanaTokenMetadata, SOLANA_TOKEN_MINTS, LOCAL_TOKEN_LOGOS } from '@/services/tokenLogos';

// Known Solana tokens to always check for (decimals fetched from actual token accounts)
const KNOWN_SOLANA_TOKENS = [
  { address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', symbol: 'USDC', name: 'USD Coin' },
  { address: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', symbol: 'USDT', name: 'Tether USD' },
  { address: SOLANA_TOKEN_MINTS.PENGU, symbol: 'PENGU', name: 'Pudgy Penguins' },
  { address: SOLANA_TOKEN_MINTS.WET, symbol: 'WET', name: 'Wet' },
  { address: SOLANA_TOKEN_MINTS.TRUMP, symbol: 'TRUMP', name: 'Official Trump' },
  { address: SOLANA_TOKEN_MINTS.JUP, symbol: 'JUP', name: 'Jupiter' },
  { address: SOLANA_TOKEN_MINTS.GRASS, symbol: 'GRASS', name: 'Grass' },
  { address: SOLANA_TOKEN_MINTS.RAY, symbol: 'RAY', name: 'Raydium' },
  { address: SOLANA_TOKEN_MINTS.BONK, symbol: 'BONK', name: 'Bonk' },
  { address: SOLANA_TOKEN_MINTS.MET, symbol: 'MET', name: 'Meteora' },
  { address: SOLANA_TOKEN_MINTS.PUMP, symbol: 'PUMP', name: 'Pump' },
  { address: SOLANA_TOKEN_MINTS.MON, symbol: 'MON', name: 'Mon Protocol' },
  { address: SOLANA_TOKEN_MINTS.SKR, symbol: 'SKR', name: 'Seeker' },
];

export interface DiscoveredToken {
  key: string;
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  balance: number;
  usdValue: number;
  chain: ChainType;
  isNative: boolean;
  logoUrl?: string;
}

interface TokenPrice {
  [address: string]: number;
}

const MIN_USD_VALUE = 0.001;

// ERC20 ABI for balance and metadata
const erc20Abi = parseAbi([
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function name() view returns (string)',
]);

// Well-known token lists for EVM chains
const KNOWN_EVM_TOKENS: Record<number, { address: string; symbol: string; name: string; decimals: number }[]> = {
  [mainnet.id]: [
    { address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', symbol: 'USDC', name: 'USD Coin', decimals: 6 },
    { address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', symbol: 'USDT', name: 'Tether USD', decimals: 6 },
    { address: '0x6B175474E89094C44Da98b954EedeAC495271d0F', symbol: 'DAI', name: 'Dai Stablecoin', decimals: 18 },
    { address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', symbol: 'WBTC', name: 'Wrapped BTC', decimals: 8 },
    { address: '0x514910771AF9Ca656af840dff83E8264EcF986CA', symbol: 'LINK', name: 'Chainlink', decimals: 18 },
    { address: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984', symbol: 'UNI', name: 'Uniswap', decimals: 18 },
    { address: '0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9', symbol: 'AAVE', name: 'Aave', decimals: 18 },
    { address: '0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE', symbol: 'SHIB', name: 'Shiba Inu', decimals: 18 },
    { address: '0x6982508145454Ce325dDbE47a25d4ec3d2311933', symbol: 'PEPE', name: 'Pepe', decimals: 18 },
  ],
  [base.id]: [
    { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', symbol: 'USDC', name: 'USD Coin', decimals: 6 },
    { address: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2', symbol: 'USDT', name: 'Tether USD', decimals: 6 },
    { address: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb', symbol: 'DAI', name: 'Dai Stablecoin', decimals: 18 },
    { address: '0x4200000000000000000000000000000000000006', symbol: 'WETH', name: 'Wrapped Ether', decimals: 18 },
    { address: '0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22', symbol: 'cbETH', name: 'Coinbase Wrapped Staked ETH', decimals: 18 },
  ],
};

export const useTokenDiscovery = (
  solanaPublicKey: PublicKey | null,
  suiAccount: { address: string } | null,
  evmAddress: string | undefined,
  evmChainId: number | undefined
) => {
  const { connection } = useConnection();
  const suiClient = useSuiClient();
  const [discoveredTokens, setDiscoveredTokens] = useState<DiscoveredToken[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [tokenPrices, setTokenPrices] = useState<TokenPrice>({});
  const hasLoadedOnceRef = useRef(false);

  // Fetch token prices from edge function
  const fetchTokenPrices = useCallback(async (tokens: { address: string; chain: ChainType }[]) => {
    try {
      const { data, error } = await supabase.functions.invoke('get-token-prices', {
        body: { tokens }
      });
      
      if (error) throw error;
      return data?.prices || {};
    } catch (error) {
      console.error('Error fetching token prices:', error);
      // Return fallback prices for known stablecoins (including SUI stablecoins)
      const fallbackPrices: TokenPrice = {};
      const suiUsdcMints = [
        '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC',
        '0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::COIN',
      ];
      const suiUsdtMints = [
        '0x375f70cf2ae4c00bf37117d0c85a2c71545e6ee05c4a5c7d282cd66a4504b068::usdt::USDT',
        '0xc060006111016b8a020ad5b33834984a437aaa7d3c74c18e09a95d48aceab08c::coin::COIN',
      ];
      tokens.forEach(t => {
        const addr = t.address.toLowerCase();
        // Check for stablecoins by name pattern or known SUI addresses
        if (addr.includes('usdc') || addr.includes('usdt') || addr.includes('dai') ||
            suiUsdcMints.includes(t.address) || suiUsdtMints.includes(t.address)) {
          fallbackPrices[t.address] = 1;
        }
      });
      return fallbackPrices;
    }
  }, []);

  // Discover Solana tokens
  const discoverSolanaTokens = useCallback(async (): Promise<DiscoveredToken[]> => {
    if (!solanaPublicKey || !connection) return [];

    const tokens: DiscoveredToken[] = [];

    try {
      // Get native SOL balance
      const solBalance = await connection.getBalance(solanaPublicKey);
      const solAmount = solBalance / 1e9;
      
      // Get all token accounts
      const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
        solanaPublicKey,
        { programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA') }
      );

      // Build a map of mint -> token account data for quick lookup
      const tokenAccountMap: Record<string, { uiAmount: number; decimals: number }> = {};
      for (const account of tokenAccounts.value) {
        const parsedInfo = account.account.data.parsed.info;
        const mint = parsedInfo.mint;
        const tokenAmount = parsedInfo.tokenAmount;
        if (tokenAmount.uiAmount > 0) {
          tokenAccountMap[mint] = {
            uiAmount: tokenAmount.uiAmount,
            decimals: tokenAmount.decimals,
          };
        }
      }

      // Collect token addresses for price fetching - include SOL and all found tokens
      const tokenAddresses: { address: string; chain: ChainType }[] = [
        { address: 'So11111111111111111111111111111111111111112', chain: 'solana' }
      ];

      // Add all tokens the user has
      Object.keys(tokenAccountMap).forEach(mint => {
        tokenAddresses.push({ address: mint, chain: 'solana' });
      });

      // Fetch prices
      const prices = await fetchTokenPrices(tokenAddresses);

      // Add SOL if user has any balance
      const solPrice = prices['So11111111111111111111111111111111111111112'] || 0;
      const solUsdValue = solAmount * solPrice;
      if (solAmount > 0) {
        tokens.push({
          key: 'SOL',
          address: 'So11111111111111111111111111111111111111112',
          symbol: 'SOL',
          name: 'Solana',
          decimals: 9,
          balance: solAmount,
          usdValue: solUsdValue,
          chain: 'solana',
          isNative: true,
        });
      }

      // Process SPL tokens - prioritize known tokens first
      const processedMints = new Set<string>();

      // First, process known Solana tokens that user has
      for (const knownToken of KNOWN_SOLANA_TOKENS) {
        const tokenData = tokenAccountMap[knownToken.address];
        if (tokenData && tokenData.uiAmount > 0) {
          const price = prices[knownToken.address] || 0;
          const usdValue = tokenData.uiAmount * price;
          
          // Always show known tokens if user has balance, even if < $2 for debugging
          // In production, use: if (usdValue >= MIN_USD_VALUE)
          tokens.push({
            key: `SOL_${knownToken.symbol}`,
            address: knownToken.address,
            symbol: knownToken.symbol,
            name: knownToken.name,
            decimals: tokenData.decimals,
            balance: tokenData.uiAmount,
            usdValue,
            chain: 'solana',
            isNative: false,
            logoUrl: LOCAL_TOKEN_LOGOS[knownToken.address] || undefined,
          });
          processedMints.add(knownToken.address);
        }
      }

      // Then process remaining tokens from user's wallet
      for (const [mint, tokenData] of Object.entries(tokenAccountMap)) {
        if (processedMints.has(mint)) continue;
        
        const price = prices[mint] || 0;
        const usdValue = tokenData.uiAmount * price;
        
        if (tokenData.uiAmount > 0) {
          // Check if it's a known token in our config (USDC, USDT, etc.)
          const knownToken = Object.entries(TOKENS).find(
            ([_, config]) => config.chain === 'solana' && config.mint === mint
          );

          // Try to get metadata from Jupiter
          let symbol = knownToken ? knownToken[1].symbol : mint.slice(0, 6);
          let name = knownToken ? knownToken[1].name : `Token ${mint.slice(0, 8)}`;
          
          const jupiterMeta = await getSolanaTokenMetadata(mint);
          if (jupiterMeta) {
            symbol = jupiterMeta.symbol;
            name = jupiterMeta.name;
          }

          tokens.push({
            key: knownToken ? knownToken[0] : `SPL_${mint.slice(0, 8)}`,
            address: mint,
            symbol,
            name,
            decimals: tokenData.decimals,
            balance: tokenData.uiAmount,
            usdValue,
            chain: 'solana',
            isNative: false,
          });
        }
      }
    } catch (error) {
      console.error('Error discovering Solana tokens:', error);
    }

    return tokens;
  }, [solanaPublicKey, connection, fetchTokenPrices]);

  // Discover Sui tokens
  const discoverSuiTokens = useCallback(async (): Promise<DiscoveredToken[]> => {
    if (!suiAccount) return [];

    const tokens: DiscoveredToken[] = [];

    try {
      const allBalances = await suiClient.getAllBalances({
        owner: suiAccount.address
      });

      const tokenAddresses: { address: string; chain: ChainType }[] = [];

      for (const balance of allBalances) {
        if (Number(balance.totalBalance) > 0) {
          tokenAddresses.push({ address: balance.coinType, chain: 'sui' });
        }
      }

      const prices = await fetchTokenPrices(tokenAddresses);

      for (const balance of allBalances) {
        const balanceAmount = Number(balance.totalBalance);
        if (balanceAmount <= 0) continue;

        const coinType = balance.coinType;
        const isSui = coinType === '0x2::sui::SUI';
        const decimals = isSui ? 9 : 6; // SUI has 9 decimals, most tokens have 6
        const amount = balanceAmount / Math.pow(10, decimals);
        
        // Use fetched price or fallback to $1 for known stablecoins
        let price = prices[coinType] || 0;
        const isKnownStablecoin = coinType.toLowerCase().includes('usdc') || 
                                   coinType.toLowerCase().includes('usdt') ||
                                   coinType === '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC' ||
                                   coinType === '0x375f70cf2ae4c00bf37117d0c85a2c71545e6ee05c4a5c7d282cd66a4504b068::usdt::USDT' ||
                                   coinType === '0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::COIN' ||
                                   coinType === '0xc060006111016b8a020ad5b33834984a437aaa7d3c74c18e09a95d48aceab08c::coin::COIN';
        
        // Fallback to $1 for stablecoins if price fetch failed
        if (price === 0 && isKnownStablecoin) {
          price = 1;
        }
        
        const usdValue = amount * price;

        // Show all stablecoins that meet the minimum balance requirement OR have sufficient balance
        // For stablecoins, use the balance directly as USD value if price was not fetched
        // Show all tokens with any balance
        if (amount > 0) {
          // Extract symbol from coin type
          const parts = coinType.split('::');
          const symbol = parts[parts.length - 1] || coinType.slice(0, 6);

          const knownToken = Object.entries(TOKENS).find(
            ([_, config]) => config.chain === 'sui' && config.mint === coinType
          );

          tokens.push({
            key: knownToken ? knownToken[0] : `SUI_${symbol}`,
            address: coinType,
            symbol: knownToken ? knownToken[1].symbol : symbol,
            name: knownToken ? knownToken[1].name : symbol,
            decimals,
            balance: amount,
            usdValue,
            chain: 'sui',
            isNative: isSui,
          });
        }
      }
    } catch (error) {
      console.error('Error discovering Sui tokens:', error);
    }

    return tokens;
  }, [suiAccount, suiClient, fetchTokenPrices]);

  // Discover EVM tokens (Ethereum/Base)
  const discoverEvmTokens = useCallback(async (): Promise<DiscoveredToken[]> => {
    if (!evmAddress || !evmChainId) return [];

    const tokens: DiscoveredToken[] = [];
    const chain = evmChainId === base.id ? 'base' : 'ethereum';
    const viemChain = evmChainId === base.id ? base : mainnet;

    // Use multiple RPC endpoints with fallback for reliability
    const rpcUrls = evmChainId === base.id 
      ? ['https://base-rpc.publicnode.com', 'https://mainnet.base.org', 'https://1rpc.io/base']
      : ['https://ethereum-rpc.publicnode.com', 'https://1rpc.io/eth', 'https://cloudflare-eth.com'];
    
    // Try each RPC until one works
    let publicClient = null;
    for (const rpcUrl of rpcUrls) {
      try {
        const client = createPublicClient({
          chain: viemChain,
          transport: http(rpcUrl),
        });
        // Test the connection
        await client.getBlockNumber();
        publicClient = client;
        console.log(`EVM token discovery using RPC: ${rpcUrl}`);
        break;
      } catch (error) {
        console.log(`RPC ${rpcUrl} failed, trying next...`);
        continue;
      }
    }
    
    if (!publicClient) {
      console.error('All EVM RPC endpoints failed');
      return tokens;
    }

    try {
      // Get native ETH balance
      const ethBalance = await publicClient.getBalance({ address: evmAddress as `0x${string}` });
      const ethAmount = Number(ethBalance) / 1e18;

      const tokenAddresses: { address: string; chain: ChainType }[] = [
        { address: '0x0000000000000000000000000000000000000000', chain }
      ];

      // Check known tokens
      const knownTokens = KNOWN_EVM_TOKENS[evmChainId] || [];
      
      for (const token of knownTokens) {
        tokenAddresses.push({ address: token.address, chain });
      }

      const prices = await fetchTokenPrices(tokenAddresses);

      // Add ETH if user has any balance
      const ethPrice = prices['0x0000000000000000000000000000000000000000'] || 0;
      const ethUsdValue = ethAmount * ethPrice;
      if (ethAmount > 0) {
        tokens.push({
          key: chain === 'base' ? 'BASE_ETH' : 'ETH',
          address: '0x0000000000000000000000000000000000000000',
          symbol: 'ETH',
          name: 'Ethereum',
          decimals: 18,
          balance: ethAmount,
          usdValue: ethUsdValue,
          chain,
          isNative: true,
        });
      }

      // Check ERC20 tokens
      for (const token of knownTokens) {
        try {
          // Use call directly to avoid authorizationList requirement
          const data = await publicClient.call({
            to: token.address as `0x${string}`,
            data: `0x70a08231000000000000000000000000${evmAddress.slice(2)}` as `0x${string}`,
          });
          
          const balance = data.data ? BigInt(data.data) : BigInt(0);
          const tokenBalance = Number(balance) / Math.pow(10, token.decimals);
          
          if (tokenBalance > 0) {
            // Use fetched price or fallback to $1 for stablecoins
            let price = prices[token.address] || 0;
            const isStablecoin = ['USDC', 'USDT', 'DAI'].includes(token.symbol);
            if (price === 0 && isStablecoin) {
              price = 1;
            }
            
            const usdValue = tokenBalance * price;
            const effectiveUsdValue = isStablecoin && price === 1 ? tokenBalance : usdValue;
            
            if (tokenBalance > 0) {
              // Find if it's a known token in our config
              const knownConfigToken = Object.entries(TOKENS).find(
                ([_, config]) => config.chain === chain && config.mint.toLowerCase() === token.address.toLowerCase()
              );

              tokens.push({
                key: knownConfigToken ? knownConfigToken[0] : `${chain.toUpperCase()}_${token.symbol}`,
                address: token.address,
                symbol: token.symbol,
                name: token.name,
                decimals: token.decimals,
                balance: tokenBalance,
                usdValue: effectiveUsdValue,
                chain,
                isNative: false,
              });
            }
          }
        } catch (error) {
          console.error(`Error fetching balance for ${token.symbol}:`, error);
        }
      }
    } catch (error) {
      console.error('Error discovering EVM tokens:', error);
    }

    return tokens;
  }, [evmAddress, evmChainId, fetchTokenPrices]);

  // Main discovery function
  const discoverTokens = useCallback(async () => {
    // Only show loading spinner on first load, not on background refreshes
    if (!hasLoadedOnceRef.current) {
      setIsLoading(true);
    }

    try {
      const [solanaTokens, suiTokens, evmTokens] = await Promise.all([
        discoverSolanaTokens(),
        discoverSuiTokens(),
        discoverEvmTokens(),
      ]);

      const allTokens = [...solanaTokens, ...suiTokens, ...evmTokens];
      
      // Fetch logos for all discovered tokens
      if (allTokens.length > 0) {
        const logoAddresses = allTokens.map(t => ({ address: t.address, chain: t.chain }));
        const logos = await batchFetchLogos(logoAddresses);
        
        // Attach logos to tokens - preserve local logos for known tokens
        for (const token of allTokens) {
          if (!token.logoUrl) {
            token.logoUrl = logos[token.address] || undefined;
          }
        }
      }

      setDiscoveredTokens(allTokens);
      hasLoadedOnceRef.current = true;
    } catch (error) {
      console.error('Error discovering tokens:', error);
    } finally {
      setIsLoading(false);
    }
  }, [discoverSolanaTokens, discoverSuiTokens, discoverEvmTokens]);

  // Keep a ref to the latest discoverTokens to avoid stale closures in setInterval
  const discoverTokensRef = useRef(discoverTokens);
  discoverTokensRef.current = discoverTokens;

  // Auto-discover when wallet changes
  useEffect(() => {
    const hasWallet = solanaPublicKey || suiAccount || evmAddress;
    if (hasWallet) {
      hasLoadedOnceRef.current = false; // Reset so first load shows spinner
      discoverTokensRef.current();
      // Refresh prices every 30 seconds to keep USD values updated
      const interval = setInterval(() => {
        discoverTokensRef.current();
      }, 30 * 1000);
      return () => clearInterval(interval);
    } else {
      setDiscoveredTokens([]);
      hasLoadedOnceRef.current = false;
    }
  }, [solanaPublicKey, suiAccount, evmAddress, evmChainId]);

  return {
    discoveredTokens,
    isLoading,
    refreshTokens: discoverTokens,
  };
};
