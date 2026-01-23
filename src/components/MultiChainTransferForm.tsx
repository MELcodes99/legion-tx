import { useState, useEffect } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { useCurrentAccount as useSuiAccount, useSignTransaction } from '@mysten/dapp-kit';
import { useAccount, useBalance, useSendTransaction, useWaitForTransactionReceipt, useWalletClient, usePublicClient } from 'wagmi';
import { base, mainnet } from 'wagmi/chains';
import { parseUnits, formatUnits, encodeFunctionData, parseAbi } from 'viem';
import { PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { getAssociatedTokenAddress } from '@solana/spl-token';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Send, AlertCircle, Wallet } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ProcessingLogo } from './ProcessingLogo';
import { ConnectedWalletInfo } from './ConnectedWalletInfo';
import { TokenSelectionModal } from './TokenSelectionModal';
import { TOKENS, getTokensByChain, getTokenConfig, getTokenDisplayName, MIN_TRANSFER_USD, CHAIN_NAMES } from '@/config/tokens';
import type { ChainType } from '@/config/tokens';
import { useTokenDiscovery, DiscoveredToken } from '@/hooks/useTokenDiscovery';
import usdtLogo from '@/assets/usdt-logo.png';
import usdcLogo from '@/assets/usdc-logo.png';
import solanaLogo from '@/assets/solana-logo.png';
import suiLogo from '@/assets/sui-logo.png';
import baseLogo from '@/assets/base-logo.jpeg';
import ethLogo from '@/assets/eth-logo.jpeg';
import skrLogo from '@/assets/skr-logo.jpeg';
import { SuiClient } from '@mysten/sui/client';
import { Transaction as SuiTransaction } from '@mysten/sui/transactions';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown } from 'lucide-react';

type TokenKey = keyof typeof TOKENS;
type BalanceMap = Record<TokenKey, number>;
export const MultiChainTransferForm = () => {
  const {
    connection
  } = useConnection();
  const {
    publicKey: solanaPublicKey,
    signTransaction: solanaSignTransaction
  } = useWallet();
  const suiAccount = useSuiAccount();
  const {
    mutateAsync: signSuiTransaction
  } = useSignTransaction();
  const {
    toast
  } = useToast();

  // EVM hooks
  const {
    address: evmAddress,
    chain: evmChain,
    isConnected: isEvmConnected,
    connector: evmConnector
  } = useAccount();
  // Get wallet client - we need to ensure it's available for the connected chain
  const { data: walletClient, refetch: refetchWalletClient } = useWalletClient({
    chainId: evmChain?.id
  });
  const publicClient = usePublicClient({
    chainId: evmChain?.id
  });
  const suiClient = new SuiClient({
    url: 'https://fullnode.mainnet.sui.io:443'
  });
  
  // Token discovery hook for all chains
  const { discoveredTokens, isLoading: isDiscoveringTokens, refreshTokens } = useTokenDiscovery(
    solanaPublicKey,
    suiAccount,
    evmAddress,
    evmChain?.id
  );
  
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [selectedToken, setSelectedToken] = useState<TokenKey>('USDC_SOL');
  const [selectedGasToken, setSelectedGasToken] = useState<TokenKey>('USDC_SOL');
  const [balances, setBalances] = useState<BalanceMap>({} as BalanceMap);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [tokenSelectionOpen, setTokenSelectionOpen] = useState(false);
  const [selectedDiscoveredToken, setSelectedDiscoveredToken] = useState<DiscoveredToken | null>(null);
  const [tokenPrices, setTokenPrices] = useState<{
    solana: number;
    sui: number;
    ethereum: number;
  } | null>(null);
  const selectedTokenConfig = getTokenConfig(selectedToken);
  const selectedGasTokenConfig = getTokenConfig(selectedGasToken);
  const gasFee = selectedTokenConfig?.gasFee || 0.50;

  // Calculate gas fee in tokens if paying with native token
  const getGasFeeDisplay = () => {
    if (!selectedGasTokenConfig || !tokenPrices) return `$${gasFee.toFixed(2)}`;
    if (selectedGasTokenConfig.isNative) {
      let price = 1;
      if (selectedGasTokenConfig.chain === 'solana') price = tokenPrices.solana;else if (selectedGasTokenConfig.chain === 'sui') price = tokenPrices.sui;else if (selectedGasTokenConfig.chain === 'base' || selectedGasTokenConfig.chain === 'ethereum') price = tokenPrices.ethereum;
      const tokenAmount = gasFee / price;
      return `${tokenAmount.toFixed(6)} ${selectedGasTokenConfig.symbol} (~$${gasFee.toFixed(2)})`;
    }
    return `$${gasFee.toFixed(2)}`;
  };

  // Check if any wallet is connected
  const hasWalletConnected = !!solanaPublicKey || !!suiAccount || !!evmAddress;

  // Get available tokens based on connected wallets
  const getAvailableTokens = (): [string, typeof TOKENS[TokenKey]][] => {
    const hasSolana = !!solanaPublicKey;
    const hasSui = !!suiAccount;
    const hasBase = !!evmAddress && evmChain?.id === base.id;
    const hasEthereum = !!evmAddress && evmChain?.id === mainnet.id;
    return Object.entries(TOKENS).filter(([_, config]) => {
      if (config.chain === 'solana') return hasSolana;
      if (config.chain === 'sui') return hasSui;
      if (config.chain === 'base') return hasBase;
      if (config.chain === 'ethereum') return hasEthereum;
      return false;
    });
  };
  const availableTokens = getAvailableTokens();

  // Fetch token prices from backend in real-time
  useEffect(() => {
    const fetchPrices = async () => {
      try {
        const {
          data,
          error
        } = await supabase.functions.invoke('gasless-transfer', {
          body: {
            action: 'get_token_prices'
          }
        });
        if (error) throw error;
        if (data?.prices) {
          setTokenPrices({
            solana: data.prices.solana || 0,
            sui: data.prices.sui || 0,
            ethereum: data.prices.ethereum || data.prices.base || 3000
          });
          console.log('Token prices fetched:', data.prices);
        }
      } catch (error) {
        console.error('Error fetching token prices:', error);
      }
    };
    fetchPrices();
    // Fetch prices more frequently (every 30 seconds) for real-time accuracy
    const interval = setInterval(fetchPrices, 30 * 1000);
    return () => clearInterval(interval);
  }, []);

  // Auto-select first available token when wallets connect/disconnect
  useEffect(() => {
    if (availableTokens.length > 0) {
      const currentTokenAvailable = availableTokens.some(([key]) => key === selectedToken);
      if (!currentTokenAvailable) {
        const firstToken = availableTokens[0][0] as TokenKey;
        setSelectedToken(firstToken);

        // For EVM chains, find first non-native token for gas (gasless requires ERC20)
        const firstTokenConfig = availableTokens[0][1];
        if (firstTokenConfig.chain === 'base' || firstTokenConfig.chain === 'ethereum') {
          const nonNativeToken = availableTokens.find(([_, config]) => !config.isNative);
          if (nonNativeToken) {
            setSelectedGasToken(nonNativeToken[0] as TokenKey);
          } else {
            setSelectedGasToken(firstToken);
          }
        } else {
          setSelectedGasToken(firstToken);
        }
      }
    }
  }, [solanaPublicKey, suiAccount, evmAddress, evmChain]);

  // Fetch balances for all chains
  useEffect(() => {
    const fetchBalances = async () => {
      const newBalances: Partial<BalanceMap> = {};

      // Fetch Solana balances
      if (solanaPublicKey) {
        try {
          const solBalance = await connection.getBalance(solanaPublicKey, 'confirmed');
          newBalances.SOL = solBalance / LAMPORTS_PER_SOL;
          try {
            const usdcMint = new PublicKey(TOKENS.USDC_SOL.mint);
            const usdcParsed = await connection.getParsedTokenAccountsByOwner(solanaPublicKey, {
              mint: usdcMint
            });
            if (usdcParsed.value.length > 0) {
              const tokenAmount = usdcParsed.value[0].account.data.parsed.info.tokenAmount;
              newBalances.USDC_SOL = tokenAmount.uiAmount || 0;
            } else {
              newBalances.USDC_SOL = 0;
            }
          } catch {
            newBalances.USDC_SOL = 0;
          }
          try {
            const usdtMint = new PublicKey(TOKENS.USDT_SOL.mint);
            const usdtParsed = await connection.getParsedTokenAccountsByOwner(solanaPublicKey, {
              mint: usdtMint
            });
            if (usdtParsed.value.length > 0) {
              const tokenAmount = usdtParsed.value[0].account.data.parsed.info.tokenAmount;
              newBalances.USDT_SOL = tokenAmount.uiAmount || 0;
            } else {
              newBalances.USDT_SOL = 0;
            }
          } catch {
            newBalances.USDT_SOL = 0;
          }
        } catch (error) {
          console.error('Error fetching Solana balances:', error);
        }
      }

      // Fetch Sui balances
      if (suiAccount) {
        try {
          const allBalances = await suiClient.getAllBalances({
            owner: suiAccount.address
          });
          for (const balance of allBalances) {
            const balanceAmount = Number(balance.totalBalance);
            if (balanceAmount <= 0) continue;
            if (balance.coinType === '0x2::sui::SUI') {
              newBalances.SUI = balanceAmount / 1e9;
            } else if (balance.coinType === TOKENS.USDC_SUI.mint || balance.coinType.toLowerCase().includes('usdc')) {
              newBalances.USDC_SUI = balanceAmount / 1e6;
            } else if (balance.coinType === TOKENS.USDT_SUI.mint || balance.coinType.toLowerCase().includes('usdt')) {
              newBalances.USDT_SUI = balanceAmount / 1e6;
            }
          }
          if (newBalances.SUI === undefined) newBalances.SUI = 0;
          if (newBalances.USDC_SUI === undefined) newBalances.USDC_SUI = 0;
          if (newBalances.USDT_SUI === undefined) newBalances.USDT_SUI = 0;
        } catch (error) {
          console.error('Error fetching Sui balances:', error);
          newBalances.USDC_SUI = 0;
          newBalances.USDT_SUI = 0;
          newBalances.SUI = 0;
        }
      }

      // EVM balances will be handled separately via wagmi hooks
      // For now set to 0, they'll be updated when available
      if (!evmAddress) {
        newBalances.USDC_BASE = 0;
        newBalances.USDT_BASE = 0;
        newBalances.BASE_ETH = 0;
        newBalances.USDC_ETH = 0;
        newBalances.USDT_ETH = 0;
        newBalances.ETH = 0;
      }
      setBalances(prev => ({
        ...prev,
        ...newBalances
      }) as BalanceMap);
    };
    fetchBalances();
    const interval = setInterval(fetchBalances, 10000);
    return () => clearInterval(interval);
  }, [solanaPublicKey, suiAccount, connection]);

  // Fetch EVM balances
  useEffect(() => {
    const fetchEvmBalances = async () => {
      if (!evmAddress || !evmChain) return;
      console.log(`Fetching EVM balances for address: ${evmAddress} on chain: ${evmChain.id}`);
      const newBalances: Partial<BalanceMap> = {};

      // Use reliable public RPCs - prioritize LlamaRPC which has better uptime
      const rpcs = evmChain.id === base.id 
        ? ['https://mainnet.base.org', 'https://base.llamarpc.com', 'https://base.meowrpc.com']
        : ['https://eth.llamarpc.com', 'https://rpc.ankr.com/eth', 'https://eth.meowrpc.com'];

      // Helper function to make RPC call with multiple fallbacks
      const makeRpcCall = async (body: object): Promise<any> => {
        let lastError: any = null;
        
        for (const rpc of rpcs) {
          try {
            const response = await fetch(rpc, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body)
            });
            const data = await response.json();
            
            // Check for any RPC errors (not just -32000)
            if (data.error) {
              console.log(`RPC ${rpc} returned error:`, data.error);
              lastError = data;
              continue; // Try next RPC
            }
            return data;
          } catch (error) {
            console.log(`RPC ${rpc} failed:`, error);
            lastError = { error: { message: String(error) } };
            continue; // Try next RPC
          }
        }
        
        // All RPCs failed, return last error
        console.error('All RPCs failed, returning last error');
        return lastError || { error: { message: 'All RPC endpoints failed' } };
      };
      try {
        // Fetch native ETH balance
        const balanceData = await makeRpcCall({
          jsonrpc: '2.0',
          method: 'eth_getBalance',
          params: [evmAddress, 'latest'],
          id: 1
        });
        console.log('Native ETH balance response:', balanceData);
        if (balanceData.result) {
          const balance = BigInt(balanceData.result);
          const ethBalance = Number(formatUnits(balance, 18));
          console.log(`Native ETH balance: ${ethBalance}`);
          if (evmChain.id === base.id) {
            newBalances.BASE_ETH = ethBalance;
          } else {
            newBalances.ETH = ethBalance;
          }
        }

        // Fetch ERC20 token balances (USDC, USDT) with verified contract addresses
        const tokenContracts = evmChain.id === base.id ? [{
          key: 'USDC_BASE',
          address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
          decimals: 6
        }, {
          key: 'USDT_BASE',
          address: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2',
          decimals: 6
        } // Bridged USDT on Base
        ] : [{
          key: 'USDC_ETH',
          address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
          decimals: 6
        }, {
          key: 'USDT_ETH',
          address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
          decimals: 6
        }];

        // ERC20 balanceOf function signature: balanceOf(address) = 0x70a08231
        for (const token of tokenContracts) {
          try {
            // Properly encode the address - remove 0x prefix and pad to 32 bytes (64 hex chars)
            const cleanAddress = evmAddress.replace('0x', '').toLowerCase();
            const paddedAddress = cleanAddress.padStart(64, '0');
            const callData = `0x70a08231${paddedAddress}`;
            console.log(`Querying ${token.key} at ${token.address} for wallet ${evmAddress}`);
            console.log(`Call data: ${callData}`);
            const tokenData = await makeRpcCall({
              jsonrpc: '2.0',
              method: 'eth_call',
              params: [{
                to: token.address,
                data: callData
              }, 'latest'],
              id: Date.now()
            });
            console.log(`${token.key} balance response:`, tokenData);
            if (tokenData.result && tokenData.result !== '0x') {
              // Parse the hex result - handle zero balances properly
              const hexValue = tokenData.result;
              try {
                const tokenBalance = BigInt(hexValue);
                const formattedBalance = Number(formatUnits(tokenBalance, token.decimals));
                newBalances[token.key as TokenKey] = formattedBalance;
                console.log(`${token.key} balance: ${formattedBalance}`);
              } catch (parseError) {
                console.error(`Error parsing ${token.key} balance:`, parseError);
                newBalances[token.key as TokenKey] = 0;
              }
            } else {
              newBalances[token.key as TokenKey] = 0;
              console.log(`${token.key} balance: 0 (empty response)`);
            }
          } catch (error) {
            console.error(`Error fetching ${token.key} balance:`, error);
            newBalances[token.key as TokenKey] = 0;
          }
        }
      } catch (error) {
        console.error('Error fetching EVM balances:', error);
        // Set defaults on error
        if (evmChain.id === base.id) {
          newBalances.BASE_ETH = 0;
          newBalances.USDC_BASE = 0;
          newBalances.USDT_BASE = 0;
        } else {
          newBalances.ETH = 0;
          newBalances.USDC_ETH = 0;
          newBalances.USDT_ETH = 0;
        }
      }
      setBalances(prev => ({
        ...prev,
        ...newBalances
      }) as BalanceMap);
    };
    fetchEvmBalances();
    const interval = setInterval(fetchEvmBalances, 15000);
    return () => clearInterval(interval);
  }, [evmAddress, evmChain]);
  const initiateTransfer = async () => {
    const tokenConfig = selectedTokenConfig;
    if (!tokenConfig) return;

    // Check if appropriate wallet is connected for the chain
    if (tokenConfig.chain === 'solana' && !solanaPublicKey) {
      toast({
        title: 'Solana wallet not connected',
        description: 'Please connect your Solana wallet first.',
        variant: 'destructive'
      });
      return;
    }
    if (tokenConfig.chain === 'sui' && !suiAccount) {
      toast({
        title: 'Sui wallet not connected',
        description: 'Please connect your Sui wallet first.',
        variant: 'destructive'
      });
      return;
    }
    if ((tokenConfig.chain === 'base' || tokenConfig.chain === 'ethereum') && !evmAddress) {
      toast({
        title: 'EVM wallet not connected',
        description: `Please connect your ${CHAIN_NAMES[tokenConfig.chain]} wallet first.`,
        variant: 'destructive'
      });
      return;
    }
    setError('');
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      setError('Invalid amount');
      return;
    }

    // Calculate minimum transfer based on chain - $2 for all chains
    const minTransfer = MIN_TRANSFER_USD;

    // For native tokens, convert amount to USD using real-time prices
    let amountInUsd = amountNum;
    if (tokenConfig.isNative && tokenPrices) {
      if (tokenConfig.chain === 'base' || tokenConfig.chain === 'ethereum') {
        amountInUsd = amountNum * tokenPrices.ethereum;
      } else if (tokenConfig.chain === 'solana') {
        amountInUsd = amountNum * tokenPrices.solana;
      } else if (tokenConfig.chain === 'sui') {
        amountInUsd = amountNum * tokenPrices.sui;
      }
    }
    if (amountInUsd < minTransfer) {
      if (tokenConfig.isNative && tokenPrices) {
        const minTokenAmount = minTransfer / (tokenPrices.ethereum || 1);
        setError(`Minimum transfer is $${minTransfer} USD (~${minTokenAmount.toFixed(6)} ${tokenConfig.symbol})`);
      } else {
        setError(`Minimum transfer amount is $${minTransfer} USD`);
      }
      return;
    }
    // Use discovered token balance if available, otherwise fall back to balances state
    const currentBalance = selectedDiscoveredToken?.balance ?? balances[selectedToken] ?? 0;
    
    // For balance validation, use the ACTUAL token properties (from discovered token if available)
    // This is critical for tokens like TRUMP that fall back to USDC in selectedToken
    const actualSymbol = selectedDiscoveredToken?.symbol || tokenConfig.symbol;
    const actualIsNative = selectedDiscoveredToken?.isNative ?? tokenConfig.isNative;
    
    // Check stablecoin status based on the ACTUAL token being sent, not the fallback config
    const isStablecoin = actualSymbol === 'USDC' || actualSymbol === 'USDT' || actualSymbol === 'DAI';
    
    if (actualIsNative) {
      // For native tokens, amountNum is token amount, check directly
      if (amountNum > currentBalance) {
        setError(`Insufficient balance. You have ${currentBalance.toFixed(6)} ${actualSymbol}`);
        return;
      }
    } else if (isStablecoin) {
      // For stablecoins, amount in USD = amount in tokens (1:1)
      if (amountNum > currentBalance) {
        setError(`Insufficient balance. You have ${currentBalance.toFixed(2)} ${actualSymbol}`);
        return;
      }
    } else {
      // For other tokens (TRUMP, JUP, PENGU, etc.), user enters USD value
      // Check if the USD value of user's balance >= entered USD amount
      const tokenUsdValue = selectedDiscoveredToken?.usdValue ?? 0;
      if (amountInUsd > tokenUsdValue) {
        setError(`Insufficient balance. You have ${currentBalance.toFixed(6)} ${actualSymbol} (~$${tokenUsdValue.toFixed(2)})`);
        return;
      }
    }

    // Check gas token wallet and balance
    const gasTokenConfig = getTokenConfig(selectedGasToken);
    if (gasTokenConfig) {
      if (gasTokenConfig.chain === 'solana' && !solanaPublicKey) {
        toast({
          title: 'Solana wallet required',
          description: `Connect a Solana wallet to pay gas with ${gasTokenConfig.symbol}.`,
          variant: 'destructive'
        });
        return;
      }
      if (gasTokenConfig.chain === 'sui' && !suiAccount) {
        toast({
          title: 'Sui wallet required',
          description: `Connect a Sui wallet to pay gas with ${gasTokenConfig.symbol}.`,
          variant: 'destructive'
        });
        return;
      }
      if ((gasTokenConfig.chain === 'base' || gasTokenConfig.chain === 'ethereum') && !evmAddress) {
        toast({
          title: 'EVM wallet required',
          description: `Connect an EVM wallet to pay gas with ${gasTokenConfig.symbol}.`,
          variant: 'destructive'
        });
        return;
      }
      const transferFee = tokenConfig.gasFee;
      if (selectedGasToken !== selectedToken) {
        // Use discovered token balance for gas token if available
        const gasTokenFromDiscovery = discoveredTokens.find(
          t => t.symbol === gasTokenConfig.symbol && t.chain === gasTokenConfig.chain
        );
        const gasBalance = gasTokenFromDiscovery?.balance ?? balances[selectedGasToken] ?? 0;
        let gasTokenPrice = 1;
        if (gasTokenConfig.isNative) {
          if (gasTokenConfig.chain === 'solana') gasTokenPrice = tokenPrices?.solana || 0;else if (gasTokenConfig.chain === 'sui') gasTokenPrice = tokenPrices?.sui || 0;else gasTokenPrice = tokenPrices?.ethereum || 0;
        }
        const requiredGasAmount = gasTokenConfig.isNative ? transferFee / gasTokenPrice : transferFee;
        if (gasBalance < requiredGasAmount) {
          toast({
            title: 'Insufficient gas balance',
            description: `You need ${requiredGasAmount.toFixed(6)} ${gasTokenConfig.symbol} to pay $${transferFee.toFixed(2)} gas fee.`,
            variant: 'destructive'
          });
          return;
        }
      }
    }
    await handleTransfer();
  };
  const handleTransfer = async () => {
    const tokenConfig = selectedTokenConfig;
    if (!tokenConfig) return;
    
    // Determine the actual transfer token details (from discovered token or config)
    const actualMint = selectedDiscoveredToken?.address || tokenConfig.mint;
    const actualDecimals = selectedDiscoveredToken?.decimals || tokenConfig.decimals;
    const actualSymbol = selectedDiscoveredToken?.symbol || tokenConfig.symbol;
    const actualChain = selectedDiscoveredToken?.chain || tokenConfig.chain;
    
    if (actualChain === 'solana' && (!solanaPublicKey || !solanaSignTransaction)) {
      return;
    }
    if (actualChain === 'sui' && !suiAccount) {
      return;
    }
    if ((actualChain === 'base' || actualChain === 'ethereum') && !evmAddress) {
      return;
    }
    setError('');
    setIsLoading(true);
    try {
      if (!tokenConfig && !selectedDiscoveredToken) throw new Error('Invalid token selected');
      const amountUSD = parseFloat(amount);
      
      // Calculate token amount from USD
      const getTokenAmountFromUSD = (usdValue: number) => {
        // For stablecoins, 1:1 with USD
        if (actualSymbol === 'USDC' || actualSymbol === 'USDT') {
          return usdValue;
        }
        // For native tokens, convert using real-time prices
        if (tokenPrices) {
          if (actualSymbol === 'SOL') return usdValue / tokenPrices.solana;
          if (actualSymbol === 'SUI') return usdValue / tokenPrices.sui;
          if (actualSymbol === 'ETH') return usdValue / tokenPrices.ethereum;
        }
        // For discovered tokens with USD value
        if (selectedDiscoveredToken && selectedDiscoveredToken.usdValue > 0 && selectedDiscoveredToken.balance > 0) {
          const pricePerToken = selectedDiscoveredToken.usdValue / selectedDiscoveredToken.balance;
          return usdValue / pricePerToken;
        }
        return usdValue;
      };
      
      const tokenAmount = getTokenAmountFromUSD(amountUSD);
      const isStablecoin = actualSymbol === 'USDC' || actualSymbol === 'USDT';
      
      console.log('=== MULTI-CHAIN GASLESS TRANSFER START ===');
      console.log('Chain:', actualChain);
      console.log('Token:', selectedToken);
      console.log('Transfer Token Mint:', actualMint);
      console.log('Transfer Token Symbol:', actualSymbol);
      console.log('Amount USD:', amountUSD);
      console.log('Token Amount:', tokenAmount);
      console.log('Gas token:', selectedGasToken);
      console.log('Selected Discovered Token:', selectedDiscoveredToken);
      
      if (actualChain === 'solana') {
        toast({
          title: 'Building transaction...',
          description: `Creating gasless transfer of ${actualSymbol} on Solana`
        });
        const buildResponse = await supabase.functions.invoke('gasless-transfer', {
          body: {
            action: 'build_atomic_tx',
            chain: 'solana',
            senderPublicKey: solanaPublicKey!.toBase58(),
            recipientPublicKey: recipient,
            amountUSD: amountUSD,
            tokenAmount: tokenAmount,
            mint: actualMint,
            decimals: actualDecimals,
            gasToken: selectedGasToken,
            tokenSymbol: actualSymbol
          }
        });
        if (buildResponse.error) {
          throw new Error(buildResponse.error.message);
        }
        const {
          transaction: base64Tx,
          amounts
        } = buildResponse.data;
        const fee = amounts?.feeUSD || gasFee;
        // Use the exact token amount from backend (in smallest units) for validation consistency
        const transferAmountSmallest = amounts?.transferToRecipient || amounts?.tokenAmount;
        const actualTokenAmountFromBackend = transferAmountSmallest ? parseFloat(transferAmountSmallest) / Math.pow(10, actualDecimals) : tokenAmount;
        const binaryString = atob(base64Tx);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
        const {
          Transaction
        } = await import('@solana/web3.js');
        const transaction = Transaction.from(bytes);
        toast({
          title: 'Sign the transaction',
          description: `Approve sending ${isStablecoin ? actualTokenAmountFromBackend.toFixed(2) : actualTokenAmountFromBackend.toFixed(6)} ${actualSymbol}`
        });
        const signedTx = await solanaSignTransaction!(transaction);
        const serialized = signedTx.serialize({
          requireAllSignatures: false,
          verifySignatures: false
        });
        const signedBase64Tx = btoa(String.fromCharCode(...serialized));
        toast({
          title: 'Submitting transaction...',
          description: 'Processing your transfer'
        });
        // Pass the exact smallest units amount from the build response for perfect validation match
        const submitResponse = await supabase.functions.invoke('gasless-transfer', {
          body: {
            action: 'submit_atomic_tx',
            chain: 'solana',
            signedTransaction: signedBase64Tx,
            senderPublicKey: solanaPublicKey!.toBase58(),
            recipientPublicKey: recipient,
            amountUSD: amountUSD,
            tokenAmount: actualTokenAmountFromBackend,
            transferAmountSmallest: transferAmountSmallest,
            mint: actualMint,
            decimals: actualDecimals,
            gasToken: selectedGasToken,
            tokenSymbol: actualSymbol
          }
        });
        if (submitResponse.error) {
          throw new Error(submitResponse.error.message);
        }
        const {
          signature
        } = submitResponse.data;
        const gasTokenConfig = getTokenConfig(selectedGasToken);
        const displayAmount = isStablecoin ? actualTokenAmountFromBackend.toFixed(2) : actualTokenAmountFromBackend.toFixed(6);
        const feeMessage = gasTokenConfig && gasTokenConfig.mint !== actualMint 
          ? `Gas fee of $${fee.toFixed(2)} paid with ${gasTokenConfig.symbol}` 
          : `Fee: $${fee.toFixed(2)}`;
        toast({
          title: 'Transfer Successful!',
          description: `Sent ${displayAmount} ${actualSymbol} ($${amountUSD.toFixed(2)}). ${feeMessage}`
        });
        setRecipient('');
        setAmount('');
      } else if (actualChain === 'sui') {
        if (!suiAccount) throw new Error('Sui wallet not connected');
        toast({
          title: 'Building transaction...',
          description: `Creating gasless transfer of ${actualSymbol} on Sui`
        });
        const buildResponse = await supabase.functions.invoke('gasless-transfer', {
          body: {
            action: 'build_atomic_tx',
            chain: 'sui',
            senderPublicKey: suiAccount.address,
            recipientPublicKey: recipient,
            amountUSD: amountUSD,
            tokenAmount: tokenAmount,
            mint: actualMint,
            decimals: actualDecimals,
            gasToken: selectedGasToken,
            tokenSymbol: actualSymbol
          }
        });
        if (buildResponse.error) {
          throw new Error(buildResponse.error.message);
        }
        const {
          transaction: base64Tx,
          amounts: suiAmounts
        } = buildResponse.data;
        const fee = suiAmounts?.feeUSD || gasFee;
        const suiActualTokenAmount = suiAmounts?.tokenAmount ? parseFloat(suiAmounts.tokenAmount) / Math.pow(10, actualDecimals) : tokenAmount;
        toast({
          title: 'Sign the transaction',
          description: `Approve sending ${isStablecoin ? suiActualTokenAmount.toFixed(2) : suiActualTokenAmount.toFixed(6)} ${actualSymbol}`
        });
        const binaryString = atob(base64Tx);
        const txBytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          txBytes[i] = binaryString.charCodeAt(i);
        }
        const signedTx = await signSuiTransaction({
          transaction: SuiTransaction.from(txBytes),
          chain: 'sui:mainnet'
        });
        toast({
          title: 'Submitting transaction...',
          description: 'Processing your transfer'
        });
        const submitResponse = await supabase.functions.invoke('gasless-transfer', {
          body: {
            action: 'submit_atomic_tx',
            chain: 'sui',
            signedTransaction: signedTx.bytes,
            userSignature: signedTx.signature,
            senderPublicKey: suiAccount.address,
            recipientPublicKey: recipient,
            amountUSD: amountUSD,
            tokenAmount: tokenAmount,
            mint: actualMint,
            gasToken: selectedGasToken
          }
        });
        if (submitResponse.error) {
          throw new Error(submitResponse.error.message);
        }
        const {
          digest
        } = submitResponse.data;
        const gasTokenConfig = getTokenConfig(selectedGasToken);
        const displayAmount = isStablecoin ? suiActualTokenAmount.toFixed(2) : suiActualTokenAmount.toFixed(6);
        const feeMessage = gasTokenConfig && gasTokenConfig.mint !== actualMint 
          ? `Gas fee of $${fee.toFixed(2)} paid with ${gasTokenConfig.symbol}` 
          : `Fee: $${fee.toFixed(2)}`;
        toast({
          title: 'Transfer Successful!',
          description: `Sent ${displayAmount} ${actualSymbol} ($${amountUSD.toFixed(2)}). ${feeMessage}`
        });
        setRecipient('');
        setAmount('');
      } else if (actualChain === 'base' || actualChain === 'ethereum') {
        if (!evmAddress) throw new Error('EVM wallet not connected');
        toast({
          title: 'Building transaction...',
          description: `Creating gasless transfer of ${actualSymbol} on ${CHAIN_NAMES[actualChain]}`
        });

        // Get transaction parameters from backend
        const buildResponse = await supabase.functions.invoke('gasless-transfer', {
          body: {
            action: 'build_atomic_tx',
            chain: actualChain,
            senderPublicKey: evmAddress,
            recipientPublicKey: recipient,
            amountUSD: amountUSD,
            tokenAmount: tokenAmount,
            mint: tokenConfig?.isNative ? 'native' : actualMint,
            decimals: actualDecimals,
            gasToken: selectedGasToken,
            tokenSymbol: actualSymbol
          }
        });
        if (buildResponse.error) {
          throw new Error(buildResponse.error.message);
        }
        const buildData = buildResponse.data;

        // Check if this is a native transfer that requires user gas
        if (buildData.requiresUserGas) {
          throw new Error(buildData.suggestion || 'Native ETH transfers require you to pay gas. Use USDC or USDT for gasless transfers.');
        }
        
        // Check if Permit2 approval is needed (for USDT on Base/Ethereum)
        if (buildData.permit2ApprovalNeeded) {
          // Request user to approve Permit2 contract
          toast({
            title: 'Permit2 Approval Required',
            description: 'USDT requires a one-time approval. Please approve the transaction in your wallet.',
            duration: 10000,
          });
          
          const permit2Address = buildData.permit2Address as `0x${string}`;
          const maxApproval = BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');
          const targetChain = actualChain === 'base' ? base : mainnet;
          
          try {
            // Ensure wallet client is available for approval
            let approvalWalletClient = walletClient;
            if (!approvalWalletClient) {
              const refetchResult = await refetchWalletClient();
              approvalWalletClient = refetchResult.data;
            }
            if (!approvalWalletClient) {
              throw new Error('Wallet client not available for approval. Please reconnect your wallet.');
            }
            
            // Send approval transaction to Permit2 contract
            const approvalHash = await approvalWalletClient.writeContract({
              address: actualMint as `0x${string}`,
              abi: parseAbi(['function approve(address spender, uint256 amount) returns (bool)']),
              functionName: 'approve',
              args: [permit2Address, maxApproval],
              account: evmAddress as `0x${string}`,
              chain: targetChain,
            });
            
            toast({
              title: 'Approval submitted',
              description: 'Waiting for confirmation...',
            });
            
            // Wait for the approval transaction to be confirmed using the hook's public client
            if (publicClient) {
              await publicClient.waitForTransactionReceipt({ hash: approvalHash });
            }
            
            toast({
              title: 'Approval confirmed!',
              description: 'Now retrying the transfer...',
            });
            
            // Retry the transfer by recursively calling handleTransfer
            // The user now has the approval, so it should work
            return handleTransfer();
          } catch (approvalError: any) {
            console.error('Permit2 approval error:', approvalError);
            if (approvalError.code === 4001 || approvalError.message?.includes('rejected')) {
              throw new Error('Approval rejected by user. USDT transfers require a one-time Permit2 approval.');
            }
            throw new Error(`Failed to approve Permit2: ${approvalError.message}`);
          }
        }
        const {
          backendWallet,
          transferAmount,
          feeAmount,
          feeAmountUSD,
          tokenContract,
          feeTokenContract,
          isNativeFee,
          // Permit support (for truly gasless transfers)
          supportsPermit,
          supportsNativePermit,
          usePermit2,
          permitNonce,
          permitDomain,
          permit2Address,
          // Legacy approval (only for tokens that don't support any permit)
          needsApproval,
          feeTokenNeedsApproval,
          domain,
          message,
          nonce,
          deadline
        } = buildData;
        console.log('EVM gasless transaction params:', {
          backendWallet,
          transferAmount,
          feeAmount,
          feeAmountUSD,
          tokenContract,
          supportsPermit,
          supportsNativePermit,
          usePermit2,
          needsApproval
        });

        // Verify wallet client is available - try refetching if not
        let activeWalletClient = walletClient;
        if (!activeWalletClient) {
          console.log('Wallet client not immediately available, attempting to refetch...');
          const refetchResult = await refetchWalletClient();
          activeWalletClient = refetchResult.data;
        }
        
        if (!activeWalletClient) {
          console.error('Wallet client unavailable after refetch. EVM connection state:', {
            isConnected: isEvmConnected,
            evmAddress,
            chainId: evmChain?.id,
            connector: evmConnector?.name
          });
          throw new Error('Wallet client not available. Please disconnect and reconnect your wallet.');
        }
        console.log('Wallet client available:', { chainId: evmChain?.id, address: evmAddress });

        // Validate EVM address
        const senderAddress = evmAddress as `0x${string}`;
        if (!senderAddress || !senderAddress.startsWith('0x')) {
          throw new Error('Invalid EVM wallet address. Please reconnect your wallet.');
        }
        console.log('Using EVM sender address:', senderAddress);

        // Calculate display amounts
        const transferAmountDisplay = Number(transferAmount) / Math.pow(10, actualDecimals);
        const feeAmountDisplay = Number(feeAmount) / Math.pow(10, actualDecimals);
        const totalAmountDisplay = transferAmountDisplay + feeAmountDisplay;

        // Variables for permit signatures
        let permitSignature: `0x${string}` | undefined;
        let permitDeadline: number | undefined;
        let permitValue: string | undefined;
        
        // Variables for Permit2 signatures
        let permit2Signature: `0x${string}` | undefined;
        let permit2Nonce: string | undefined;
        let permit2Deadline: number | undefined;
        let permit2Amount: string | undefined;

        // Step 1: Handle permit or approval
        if (supportsNativePermit && permitDomain) {
          // Sign EIP-2612 Permit (gasless approval - no ETH needed!)
          toast({
            title: `Sign Permit for ${actualSymbol}`,
            description: `Authorizing gasless transfer of ${totalAmountDisplay.toFixed(2)} ${actualSymbol} (no gas required)`,
            duration: 10000,
          });

          const totalNeeded = BigInt(transferAmount) + BigInt(feeAmount);
          permitDeadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour
          permitValue = totalNeeded.toString();

          try {
            console.log('Signing EIP-2612 permit:', {
              owner: senderAddress,
              spender: backendWallet,
              value: permitValue,
              nonce: permitNonce,
              deadline: permitDeadline,
              domain: permitDomain
            });

            permitSignature = await activeWalletClient.signTypedData({
              account: senderAddress,
              domain: {
                name: permitDomain.name,
                version: permitDomain.version,
                chainId: BigInt(permitDomain.chainId),
                verifyingContract: permitDomain.verifyingContract as `0x${string}`,
              },
              types: {
                Permit: [
                  { name: 'owner', type: 'address' },
                  { name: 'spender', type: 'address' },
                  { name: 'value', type: 'uint256' },
                  { name: 'nonce', type: 'uint256' },
                  { name: 'deadline', type: 'uint256' },
                ],
              },
              primaryType: 'Permit',
              message: {
                owner: senderAddress,
                spender: backendWallet as `0x${string}`,
                value: BigInt(permitValue),
                nonce: BigInt(permitNonce),
                deadline: BigInt(permitDeadline),
              },
            });
            console.log('Permit signature obtained:', permitSignature);
          } catch (permitError: any) {
            console.error('Permit signing error:', permitError);
            if (permitError.code === 4001 || permitError.message?.includes('rejected')) {
              throw new Error('Permit signature rejected by user');
            }
            throw permitError;
          }
        } else if (usePermit2 && permitDomain) {
          // Sign Permit2 (universal gasless permit - for USDT and other tokens)
          toast({
            title: `Sign Permit2 for ${actualSymbol}`,
            description: `Authorizing gasless transfer of ${totalAmountDisplay.toFixed(2)} ${actualSymbol} via Permit2`,
            duration: 10000,
          });

          const totalNeeded = BigInt(transferAmount) + BigInt(feeAmount);
          permit2Deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour
          permit2Amount = totalNeeded.toString();
          permit2Nonce = String(permitNonce);

          try {
            console.log('Signing Permit2 PermitTransferFrom:', {
              token: tokenContract,
              amount: permit2Amount,
              spender: backendWallet,
              nonce: permit2Nonce,
              deadline: permit2Deadline,
            });

            permit2Signature = await activeWalletClient.signTypedData({
              account: senderAddress,
              domain: {
                name: 'Permit2',
                chainId: BigInt(permitDomain.chainId),
                verifyingContract: permit2Address as `0x${string}`,
              },
              types: {
                PermitTransferFrom: [
                  { name: 'permitted', type: 'TokenPermissions' },
                  { name: 'spender', type: 'address' },
                  { name: 'nonce', type: 'uint256' },
                  { name: 'deadline', type: 'uint256' },
                ],
                TokenPermissions: [
                  { name: 'token', type: 'address' },
                  { name: 'amount', type: 'uint256' },
                ],
              },
              primaryType: 'PermitTransferFrom',
              message: {
                permitted: {
                  token: tokenContract as `0x${string}`,
                  amount: BigInt(permit2Amount),
                },
                spender: backendWallet as `0x${string}`,
                nonce: BigInt(permit2Nonce),
                deadline: BigInt(permit2Deadline),
              },
            });
            console.log('Permit2 signature obtained:', permit2Signature);
          } catch (permit2Error: any) {
            console.error('Permit2 signing error:', permit2Error);
            if (permit2Error.code === 4001 || permit2Error.message?.includes('rejected')) {
              throw new Error('Permit2 signature rejected by user');
            }
            throw permit2Error;
          }
        } else if (needsApproval || feeTokenNeedsApproval) {
          // Token doesn't support any permit - user needs ETH for on-chain approval
          throw new Error(
            `${actualSymbol} requires a one-time approval of the Permit2 contract. ` +
            `Please approve Permit2 (${permit2Address}) for ${actualSymbol} first, then retry.`
          );
        }

        // Step 2: Sign EIP-712 typed data for authorization
        toast({
          title: `Sign Transfer: ${transferAmountDisplay} ${actualSymbol}`,
          description: `To: ${recipient.slice(0, 6)}...${recipient.slice(-4)} | Fee: ${feeAmountDisplay} ${actualSymbol} ($${feeAmountUSD.toFixed(2)})`,
          duration: 10000,
        });

        let signature: `0x${string}`;
        try {
          signature = await activeWalletClient.signTypedData({
            account: senderAddress,
            domain: {
              name: domain.name,
              version: domain.version,
              chainId: BigInt(domain.chainId),
            },
            types: {
              Transfer: [
                { name: 'sender', type: 'address' },
                { name: 'recipient', type: 'address' },
                { name: 'amount', type: 'uint256' },
                { name: 'fee', type: 'uint256' },
                { name: 'token', type: 'address' },
                { name: 'nonce', type: 'uint256' },
                { name: 'deadline', type: 'uint256' },
              ],
            },
            primaryType: 'Transfer',
            message: {
              sender: message.sender as `0x${string}`,
              recipient: message.recipient as `0x${string}`,
              amount: BigInt(message.amount),
              fee: BigInt(message.fee),
              token: message.token as `0x${string}`,
              nonce: BigInt(message.nonce),
              deadline: BigInt(message.deadline),
            },
          });
        } catch (signError: any) {
          console.error('Signature error:', signError);
          if (signError.code === 4001 || signError.message?.includes('rejected')) {
            throw new Error('Signature rejected by user');
          }
          throw signError;
        }
        console.log('EIP-712 signature obtained:', signature);

        // Step 3: Submit to backend for gasless execution
        toast({
          title: 'Executing transfer...',
          description: 'Backend is processing your gasless transfer'
        });
        const executeResponse = await supabase.functions.invoke('gasless-transfer', {
          body: {
            action: 'execute_evm_transfer',
            chain: actualChain,
            senderAddress: senderAddress,
            recipientAddress: recipient,
            transferAmount,
            feeAmount,
            tokenContract,
            feeToken: isNativeFee ? 'native' : feeTokenContract || tokenContract,
            signature,
            nonce,
            deadline,
            // EIP-2612 Permit data (for gasless approval)
            ...(permitSignature && {
              permitSignature,
              permitDeadline,
              permitValue,
            }),
            // Permit2 data (for tokens without native permit)
            ...(permit2Signature && {
              usePermit2: true,
              permit2Signature,
              permit2Nonce,
              permit2Deadline,
              permit2Amount,
            }),
          }
        });
        if (executeResponse.error) {
          throw new Error(executeResponse.error.message);
        }
        if (!executeResponse.data.success) {
          throw new Error(executeResponse.data.error || 'Transfer execution failed');
        }
        const {
          txHash,
          explorerUrl
        } = executeResponse.data;
        const displayAmount = isStablecoin ? tokenAmount.toFixed(2) : tokenAmount.toFixed(6);
        toast({
          title: 'Transfer Successful!',
          description: `Sent ${displayAmount} ${actualSymbol} ($${amountUSD.toFixed(2)}) to recipient. Fee: $${feeAmountUSD.toFixed(2)}. Gas paid by backend.`
        });
        console.log('Gasless transfer complete:', explorerUrl);
        setRecipient('');
        setAmount('');
      }
    } catch (err) {
      console.error('Transfer error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Transfer failed';
      setError(errorMessage);
      toast({
        title: 'Transfer failed',
        description: errorMessage,
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
    }
  };
  const amountAfterFee = amount ? (parseFloat(amount) || 0) - gasFee : 0;
  const getTokenLogo = (tokenKey: TokenKey) => {
    const token = TOKENS[tokenKey];
    const symbol = token.symbol;
    if (symbol === 'USDC') return usdcLogo;
    if (symbol === 'USDT') return usdtLogo;
    if (symbol === 'SOL') return solanaLogo;
    if (symbol === 'SUI') return suiLogo;
    if (symbol === 'SKR') return skrLogo;
    if (symbol === 'ETH') {
      return token.chain === 'base' ? baseLogo : ethLogo;
    }
    return usdcLogo;
  };
  const getChainLogo = (chain: ChainType) => {
    switch (chain) {
      case 'solana':
        return solanaLogo;
      case 'sui':
        return suiLogo;
      case 'base':
        return baseLogo;
      case 'ethereum':
        return ethLogo;
      default:
        return solanaLogo;
    }
  };

  // Filter tokens with balance > 0 for display
  // Determine which chain is currently connected
  const connectedChain: ChainType | null = (() => {
    if (evmAddress && evmChain?.id === base.id) return 'base';
    if (evmAddress && evmChain?.id === mainnet.id) return 'ethereum';
    if (solanaPublicKey) return 'solana';
    if (suiAccount) return 'sui';
    return null;
  })();

  // Only show tokens for the currently connected chain
  const tokensWithBalance = Object.entries(balances).filter(([key, balance]) => {
    const config = getTokenConfig(key);
    if (!config) return false;
    // Only show tokens from the connected chain
    return config.chain === connectedChain && balance >= 0;
  }).map(([key]) => {
    const config = getTokenConfig(key);
    return {
      key,
      config
    };
  }).filter((item): item is {
    key: string;
    config: import('@/config/tokens').TokenConfig;
  } => item.config !== undefined);
  const solanaTokensWithBalance = connectedChain === 'solana' ? tokensWithBalance : [];
  const suiTokensWithBalance = connectedChain === 'sui' ? tokensWithBalance : [];
  const baseTokensWithBalance = connectedChain === 'base' ? tokensWithBalance : [];
  const ethTokensWithBalance = connectedChain === 'ethereum' ? tokensWithBalance : [];
  const [balancesOpen, setBalancesOpen] = useState(false);
  return <Card className="glass-card w-full max-w-md border-2 mx-4 sm:mx-0 border-secondary-foreground">
      <CardHeader className="space-y-1 p-4 sm:p-6">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg sm:text-xl md:text-2xl font-bold bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent">Legion Transfer

        </CardTitle>
          <ProcessingLogo isProcessing={isLoading} className="w-7 h-7 sm:w-8 sm:h-8 md:w-10 md:h-10" />
        </div>
        <CardDescription className="text-muted-foreground text-xs font-mono sm:text-base">Send tokens across multiple chains with flexible gas fees</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 p-4 sm:p-6">
        {!hasWalletConnected && <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Connect a wallet to see available tokens and start transferring
            </AlertDescription>
          </Alert>}

        <ConnectedWalletInfo />

        {/* Token Selection Modal */}
        <TokenSelectionModal
          open={tokenSelectionOpen}
          onClose={() => setTokenSelectionOpen(false)}
          tokens={discoveredTokens}
          onSelectToken={(token) => {
            setSelectedDiscoveredToken(token);
            // Try to map to existing token key for transfer
            const matchingTokenKey = Object.entries(TOKENS).find(
              ([_, config]) => config.mint === token.address && config.chain === token.chain
            );
            if (matchingTokenKey) {
              setSelectedToken(matchingTokenKey[0] as TokenKey);
              // Only set gas token if user hasn't already selected a valid one for this chain
              const currentGasConfig = getTokenConfig(selectedGasToken);
              if (!currentGasConfig || currentGasConfig.chain !== token.chain) {
                // Find the best available stablecoin for gas payment
                // Check if user has USDC balance, if not try USDT
                const usdcOnChain = Object.entries(TOKENS).find(
                  ([_, config]) => config.symbol === 'USDC' && config.chain === token.chain
                );
                const usdtOnChain = Object.entries(TOKENS).find(
                  ([_, config]) => config.symbol === 'USDT' && config.chain === token.chain
                );
                
                // Check available balances from discovered tokens to pick the best gas token
                const usdcBalance = discoveredTokens.find(t => t.symbol === 'USDC' && t.chain === token.chain)?.balance || 0;
                const usdtBalance = discoveredTokens.find(t => t.symbol === 'USDT' && t.chain === token.chain)?.balance || 0;
                
                if (usdcOnChain && usdcBalance > 0) {
                  setSelectedGasToken(usdcOnChain[0] as TokenKey);
                } else if (usdtOnChain && usdtBalance > 0) {
                  setSelectedGasToken(usdtOnChain[0] as TokenKey);
                } else if (usdcOnChain) {
                  // Default to USDC if neither has balance (user will see error)
                  setSelectedGasToken(usdcOnChain[0] as TokenKey);
                } else if (usdtOnChain) {
                  setSelectedGasToken(usdtOnChain[0] as TokenKey);
                } else {
                  // Fallback to the token itself if no stablecoins on chain
                  setSelectedGasToken(matchingTokenKey[0] as TokenKey);
                }
              }
            } else {
              // For discovered tokens not in TOKENS config, find appropriate gas token
              const usdcOnChain = Object.entries(TOKENS).find(
                ([_, config]) => config.symbol === 'USDC' && config.chain === token.chain
              );
              const usdtOnChain = Object.entries(TOKENS).find(
                ([_, config]) => config.symbol === 'USDT' && config.chain === token.chain
              );
              
              // Check available balances
              const usdcBalance = discoveredTokens.find(t => t.symbol === 'USDC' && t.chain === token.chain)?.balance || 0;
              const usdtBalance = discoveredTokens.find(t => t.symbol === 'USDT' && t.chain === token.chain)?.balance || 0;
              
              if (usdcOnChain && usdcBalance > 0) {
                setSelectedToken(usdcOnChain[0] as TokenKey);
                setSelectedGasToken(usdcOnChain[0] as TokenKey);
              } else if (usdtOnChain && usdtBalance > 0) {
                setSelectedToken(usdtOnChain[0] as TokenKey);
                setSelectedGasToken(usdtOnChain[0] as TokenKey);
              } else if (usdcOnChain) {
                setSelectedToken(usdcOnChain[0] as TokenKey);
                setSelectedGasToken(usdcOnChain[0] as TokenKey);
              }
            }
          }}
          chainLogo={connectedChain === 'solana' ? solanaLogo : connectedChain === 'sui' ? suiLogo : connectedChain === 'base' ? baseLogo : connectedChain === 'ethereum' ? ethLogo : undefined}
        />

        <div className="space-y-2">
          <Label htmlFor="token" className="text-sm">Token to Send</Label>
          {selectedDiscoveredToken ? (
            <button
              type="button"
              onClick={() => setTokenSelectionOpen(true)}
              disabled={isDiscoveringTokens}
              className="w-full flex items-center justify-between px-3 py-2.5 rounded-md bg-secondary/50 border border-border/50 hover:bg-secondary/70 transition-colors"
            >
              <div className="flex items-center gap-3">
                {selectedDiscoveredToken.logoUrl ? (
                  <img src={selectedDiscoveredToken.logoUrl} alt={selectedDiscoveredToken.symbol} className="w-7 h-7 rounded-full" />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center">
                    <span className="text-xs font-bold text-primary">{selectedDiscoveredToken.symbol.slice(0, 2)}</span>
                  </div>
                )}
                <div className="text-left">
                  <div className="font-medium text-sm">{selectedDiscoveredToken.symbol}</div>
                  <div className="text-xs text-muted-foreground">
                    Balance: {selectedDiscoveredToken.balance.toLocaleString(undefined, { maximumFractionDigits: 4 })} 
                    {selectedDiscoveredToken.usdValue > 0 && ` ($${selectedDiscoveredToken.usdValue.toFixed(2)})`}
                  </div>
                </div>
              </div>
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setTokenSelectionOpen(true)}
              disabled={!hasWalletConnected || isDiscoveringTokens}
              className="w-full flex items-center justify-between px-3 py-2.5 rounded-md bg-secondary/50 border border-border/50 hover:bg-secondary/70 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className="text-sm text-muted-foreground flex items-center gap-2">
                {isDiscoveringTokens ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading tokens...
                  </>
                ) : hasWalletConnected ? (
                  'Select a token'
                ) : (
                  'Connect a wallet first'
                )}
              </span>
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </button>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="gasToken" className="text-sm">Pay Gas With</Label>
          <Select value={selectedGasToken} onValueChange={(value: TokenKey) => setSelectedGasToken(value)} disabled={availableTokens.length === 0}>
            <SelectTrigger id="gasToken" className="bg-secondary/50 border-border/50">
              <SelectValue placeholder={availableTokens.length === 0 ? "Connect a wallet first" : "Select gas token"} />
            </SelectTrigger>
            <SelectContent className="bg-popover border-border z-[100] max-h-[300px]">
              {availableTokens.filter(([key, config]) => {
              // For EVM chains, only allow ERC20 tokens (not native ETH) for gas payment
              if ((config.chain === 'base' || config.chain === 'ethereum') && config.isNative) {
                return false;
              }
              return true;
            }).map(([key, config]) => <SelectItem key={key} value={key}>
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <img src={getTokenLogo(key as TokenKey)} alt={config.symbol} className="w-4 h-4 rounded-full" />
                      {!config.isNative && <img src={getChainLogo(config.chain)} alt={config.chain} className="w-2.5 h-2.5 absolute -bottom-0.5 -right-0.5 rounded-full border border-background" />}
                    </div>
                    <span>{getTokenDisplayName(key)}</span>
                  </div>
                </SelectItem>)}
            </SelectContent>
        </Select>
        </div>

        {/* Coming Soon card for USDT on Ethereum (either as transfer token or gas token) */}
        {/* Coming Soon card for USDT on Ethereum or Base */}
        {selectedToken === 'USDT_ETH' || selectedToken === 'USDT_BASE' || 
         (selectedGasToken === 'USDT_ETH' && selectedTokenConfig?.chain === 'ethereum') ||
         (selectedGasToken === 'USDT_BASE' && selectedTokenConfig?.chain === 'base') ? (
          <div className="rounded-lg bg-secondary/50 border border-border/50 p-6 text-center space-y-3">
            <div className="flex justify-center">
              <img src={usdtLogo} alt="USDT" className="w-12 h-12 rounded-full opacity-50" />
            </div>
            <h3 className="text-lg font-semibold text-foreground">Coming Soon</h3>
            <p className="text-sm text-muted-foreground">
              {selectedToken === 'USDT_ETH' || selectedToken === 'USDT_BASE'
                ? `USDT transfers on ${selectedToken === 'USDT_ETH' ? 'Ethereum' : 'Base'} are coming soon. Please use USDC in the meantime.`
                : `USDT as gas payment on ${selectedGasToken === 'USDT_ETH' ? 'Ethereum' : 'Base'} is coming soon. Please use USDC for gas fees in the meantime.`}
            </p>
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <Label htmlFor="recipient" className="text-sm">Recipient Address</Label>
              <Input id="recipient" placeholder="Enter recipient address" value={recipient} onChange={e => setRecipient(e.target.value)} disabled={!hasWalletConnected || isLoading} className="bg-secondary/50 border-border/50 text-sm" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="amount" className="text-sm">Amount ($)</Label>
              <Input id="amount" type="number" step="0.01" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} disabled={!hasWalletConnected || isLoading} className="bg-secondary/50 border-border/50 text-sm" />
            </div>

            {amount && parseFloat(amount) > 0 && (() => {
              const amountUsd = parseFloat(amount);
              const tokenConfig = selectedDiscoveredToken || selectedTokenConfig;
              
              // Calculate token amount from USD value
              const getTokenAmount = () => {
                if (!tokenConfig) return 0;
                // For stablecoins (USDC/USDT), 1:1 with USD
                if (tokenConfig.symbol === 'USDC' || tokenConfig.symbol === 'USDT') {
                  return amountUsd;
                }
                // For native tokens, use real-time prices
                if (tokenPrices) {
                  if (tokenConfig.symbol === 'SOL') return amountUsd / tokenPrices.solana;
                  if (tokenConfig.symbol === 'SUI') return amountUsd / tokenPrices.sui;
                  if (tokenConfig.symbol === 'ETH') return amountUsd / tokenPrices.ethereum;
                }
                // For discovered tokens with USD value
                if (selectedDiscoveredToken && selectedDiscoveredToken.usdValue > 0 && selectedDiscoveredToken.balance > 0) {
                  const pricePerToken = selectedDiscoveredToken.usdValue / selectedDiscoveredToken.balance;
                  return amountUsd / pricePerToken;
                }
                return amountUsd; // Fallback
              };
              
              // Calculate gas fee in tokens
              const getGasFeeInTokens = () => {
                if (!selectedGasTokenConfig) return gasFee;
                // For stablecoins, fee is in USD
                if (selectedGasTokenConfig.symbol === 'USDC' || selectedGasTokenConfig.symbol === 'USDT') {
                  return gasFee;
                }
                // For native tokens, convert from USD
                if (tokenPrices) {
                  if (selectedGasTokenConfig.symbol === 'SOL') return gasFee / tokenPrices.solana;
                  if (selectedGasTokenConfig.symbol === 'SUI') return gasFee / tokenPrices.sui;
                  if (selectedGasTokenConfig.symbol === 'ETH') return gasFee / tokenPrices.ethereum;
                }
                return gasFee;
              };
              
              const tokenAmount = getTokenAmount();
              const gasFeeTokens = getGasFeeInTokens();
              const tokenSymbol = tokenConfig?.symbol || 'tokens';
              const gasSymbol = selectedGasTokenConfig?.symbol || 'tokens';
              const isStablecoin = tokenSymbol === 'USDC' || tokenSymbol === 'USDT';
              const isGasStablecoin = gasSymbol === 'USDC' || gasSymbol === 'USDT';
              
              return (
                <div className="rounded-lg bg-secondary/30 p-3 space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">You're Sending:</span>
                    <span className="font-medium">
                      {isStablecoin 
                        ? `${tokenAmount.toFixed(2)} ${tokenSymbol} ($${amountUsd.toFixed(2)})`
                        : `${tokenAmount.toFixed(6)} ${tokenSymbol} ($${amountUsd.toFixed(2)})`
                      }
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Gas Fee:</span>
                    <span className="font-medium">
                      {isGasStablecoin 
                        ? `${gasFeeTokens.toFixed(2)} ${gasSymbol} ($${gasFee.toFixed(2)})`
                        : `${gasFeeTokens.toFixed(6)} ${gasSymbol} ($${gasFee.toFixed(2)})`
                      }
                    </span>
                  </div>
                  <div className="h-px bg-border/50 my-1" />
                  <div className="flex justify-between font-semibold text-base">
                    <span>Recipient Receives:</span>
                    <span className="text-primary">
                      {isStablecoin 
                        ? `${tokenAmount.toFixed(2)} ${tokenSymbol} ($${amountUsd.toFixed(2)})`
                        : `${tokenAmount.toFixed(6)} ${tokenSymbol} ($${amountUsd.toFixed(2)})`
                      }
                    </span>
                  </div>
                  {selectedToken === selectedGasToken && (
                    <div className="mt-2 pt-2 border-t border-border/50">
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Total Value:</span>
                        <span className="font-semibold text-accent">
                          ${(amountUsd + gasFee).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  )}
                  {selectedToken !== selectedGasToken && (
                    <div className="mt-2 pt-2 border-t border-border/50">
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Total Value:</span>
                        <span className="font-semibold text-accent">
                          ${(amountUsd + gasFee).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  )}
                  {selectedGasTokenConfig?.isNative && !tokenPrices && (
                    <p className="text-xs text-muted-foreground mt-2">Loading current {selectedGasTokenConfig.symbol} price...</p>
                  )}
                </div>
              );
            })()}

            {error && <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>}

            <Button onClick={initiateTransfer} disabled={!hasWalletConnected || isLoading || !recipient || !amount} className="w-full gap-2 bg-gradient-to-r from-primary via-accent to-primary hover:opacity-90 text-sm sm:text-base py-5 sm:py-6 font-mono">
              {isLoading ? <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="hidden xs:inline">Processing...</span>
                </> : <>
                  <Send className="h-4 w-4" />
                  Send Now
                </>}
            </Button>
          </>
        )}
      </CardContent>
    </Card>;
};