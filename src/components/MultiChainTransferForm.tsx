import { useState, useEffect } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { useCurrentAccount as useSuiAccount, useSignTransaction } from '@mysten/dapp-kit';
import { useAccount, useBalance, useSendTransaction, useWaitForTransactionReceipt } from 'wagmi';
import { base, mainnet } from 'wagmi/chains';
import { parseUnits, formatUnits } from 'viem';
import { PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { getAssociatedTokenAddress } from '@solana/spl-token';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Send, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ProcessingLogo } from './ProcessingLogo';
import { ConnectedWalletInfo } from './ConnectedWalletInfo';
import { TOKENS, getTokensByChain, getTokenConfig, getTokenDisplayName, MIN_TRANSFER_USD, CHAIN_NAMES } from '@/config/tokens';
import type { ChainType } from '@/config/tokens';
import usdtLogo from '@/assets/usdt-logo.png';
import usdcLogo from '@/assets/usdc-logo.png';
import solanaLogo from '@/assets/solana-logo.png';
import suiLogo from '@/assets/sui-logo.png';
import baseLogo from '@/assets/base-logo.jpeg';
import ethLogo from '@/assets/eth-logo.jpeg';
import { SuiClient } from '@mysten/sui/client';
import { Transaction as SuiTransaction } from '@mysten/sui/transactions';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown } from 'lucide-react';

type TokenKey = keyof typeof TOKENS;
type BalanceMap = Record<TokenKey, number>;

export const MultiChainTransferForm = () => {
  const { connection } = useConnection();
  const { publicKey: solanaPublicKey, signTransaction: solanaSignTransaction } = useWallet();
  const suiAccount = useSuiAccount();
  const { mutateAsync: signSuiTransaction } = useSignTransaction();
  const { toast } = useToast();
  
  // EVM hooks
  const { address: evmAddress, chain: evmChain } = useAccount();
  
  const suiClient = new SuiClient({ url: 'https://fullnode.mainnet.sui.io:443' });
  
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [selectedToken, setSelectedToken] = useState<TokenKey>('USDC_SOL');
  const [selectedGasToken, setSelectedGasToken] = useState<TokenKey>('USDC_SOL');
  const [balances, setBalances] = useState<BalanceMap>({} as BalanceMap);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [tokenPrices, setTokenPrices] = useState<{ solana: number; sui: number; ethereum: number } | null>(null);

  const selectedTokenConfig = getTokenConfig(selectedToken);
  const selectedGasTokenConfig = getTokenConfig(selectedGasToken);
  const gasFee = selectedTokenConfig?.gasFee || 0.50;
  
  // Calculate gas fee in tokens if paying with native token
  const getGasFeeDisplay = () => {
    if (!selectedGasTokenConfig || !tokenPrices) return `$${gasFee.toFixed(2)}`;
    
    if (selectedGasTokenConfig.isNative) {
      let price = 1;
      if (selectedGasTokenConfig.chain === 'solana') price = tokenPrices.solana;
      else if (selectedGasTokenConfig.chain === 'sui') price = tokenPrices.sui;
      else if (selectedGasTokenConfig.chain === 'base' || selectedGasTokenConfig.chain === 'ethereum') price = tokenPrices.ethereum;
      
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
        const { data, error } = await supabase.functions.invoke('gasless-transfer', {
          body: { action: 'get_token_prices' },
        });
        
        if (error) throw error;
        if (data?.prices) {
          setTokenPrices({
            solana: data.prices.solana || 0,
            sui: data.prices.sui || 0,
            ethereum: data.prices.ethereum || data.prices.base || 3000,
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
        setSelectedGasToken(firstToken);
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
            const usdcParsed = await connection.getParsedTokenAccountsByOwner(
              solanaPublicKey,
              { mint: usdcMint }
            );
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
            const usdtParsed = await connection.getParsedTokenAccountsByOwner(
              solanaPublicKey,
              { mint: usdtMint }
            );
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
            owner: suiAccount.address,
          });
          
          for (const balance of allBalances) {
            const balanceAmount = Number(balance.totalBalance);
            
            if (balanceAmount <= 0) continue;
            
            if (balance.coinType === '0x2::sui::SUI') {
              newBalances.SUI = balanceAmount / 1e9;
            } else if (balance.coinType === TOKENS.USDC_SUI.mint || 
                       balance.coinType.toLowerCase().includes('usdc')) {
              newBalances.USDC_SUI = balanceAmount / 1e6;
            } else if (balance.coinType === TOKENS.USDT_SUI.mint || 
                       balance.coinType.toLowerCase().includes('usdt')) {
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

      setBalances(prev => ({ ...prev, ...newBalances } as BalanceMap));
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
      
      // Use free public RPCs that don't require API keys
      const primaryRpc = evmChain.id === base.id 
        ? 'https://mainnet.base.org' 
        : 'https://cloudflare-eth.com';
      const fallbackRpc = evmChain.id === base.id 
        ? 'https://base.llamarpc.com' 
        : 'https://eth.llamarpc.com';

      // Helper function to make RPC call with fallback
      const makeRpcCall = async (body: object): Promise<any> => {
        try {
          const response = await fetch(primaryRpc, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
          const data = await response.json();
          // Check for authorization errors and retry with fallback
          if (data.error?.code === -32000 || data.error?.message?.includes('Unauthorized')) {
            console.log('Primary RPC failed, trying fallback...');
            const fallbackResponse = await fetch(fallbackRpc, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            });
            return await fallbackResponse.json();
          }
          return data;
        } catch (error) {
          console.log('Primary RPC error, trying fallback...', error);
          const fallbackResponse = await fetch(fallbackRpc, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
          return await fallbackResponse.json();
        }
      };

      try {
        // Fetch native ETH balance
        const balanceData = await makeRpcCall({
          jsonrpc: '2.0',
          method: 'eth_getBalance',
          params: [evmAddress, 'latest'],
          id: 1,
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
        const tokenContracts = evmChain.id === base.id 
          ? [
              { key: 'USDC_BASE', address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6 },
              { key: 'USDT_BASE', address: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2', decimals: 6 }, // Bridged USDT on Base
            ]
          : [
              { key: 'USDC_ETH', address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6 },
              { key: 'USDT_ETH', address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals: 6 },
            ];

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
                data: callData,
              }, 'latest'],
              id: Date.now(),
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

      setBalances(prev => ({ ...prev, ...newBalances } as BalanceMap));
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
        variant: 'destructive',
      });
      return;
    }

    if (tokenConfig.chain === 'sui' && !suiAccount) {
      toast({
        title: 'Sui wallet not connected',
        description: 'Please connect your Sui wallet first.',
        variant: 'destructive',
      });
      return;
    }

    if ((tokenConfig.chain === 'base' || tokenConfig.chain === 'ethereum') && !evmAddress) {
      toast({
        title: 'EVM wallet not connected',
        description: `Please connect your ${CHAIN_NAMES[tokenConfig.chain]} wallet first.`,
        variant: 'destructive',
      });
      return;
    }

    // Validate recipient address format based on chain
    if (!recipient || recipient.trim() === '') {
      setError('Please enter a recipient address');
      return;
    }

    if (tokenConfig.chain === 'base' || tokenConfig.chain === 'ethereum') {
      // EVM address validation: must start with 0x and be 42 characters (0x + 40 hex)
      const evmAddressRegex = /^0x[a-fA-F0-9]{40}$/;
      if (!evmAddressRegex.test(recipient.trim())) {
        setError('Invalid Ethereum address. Must start with 0x followed by 40 hex characters.');
        return;
      }
    }

    setError('');
    
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      setError('Invalid amount');
      return;
    }

    // Calculate minimum transfer based on chain
    // For EVM chains (base/ethereum), minimum is $5 worth of token
    const minTransfer = (tokenConfig.chain === 'base' || tokenConfig.chain === 'ethereum') ? 5 : MIN_TRANSFER_USD;
    
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

    const currentBalance = balances[selectedToken] || 0;
    if (amountNum > currentBalance) {
      setError(`Insufficient balance. You have ${currentBalance.toFixed(selectedTokenConfig?.isNative ? 6 : 2)} ${selectedTokenConfig?.symbol}`);
      return;
    }

    // Check gas token wallet and balance
    const gasTokenConfig = getTokenConfig(selectedGasToken);
    if (gasTokenConfig) {
      if (gasTokenConfig.chain === 'solana' && !solanaPublicKey) {
        toast({
          title: 'Solana wallet required',
          description: `Connect a Solana wallet to pay gas with ${gasTokenConfig.symbol}.`,
          variant: 'destructive',
        });
        return;
      }
      if (gasTokenConfig.chain === 'sui' && !suiAccount) {
        toast({
          title: 'Sui wallet required',
          description: `Connect a Sui wallet to pay gas with ${gasTokenConfig.symbol}.`,
          variant: 'destructive',
        });
        return;
      }
      if ((gasTokenConfig.chain === 'base' || gasTokenConfig.chain === 'ethereum') && !evmAddress) {
        toast({
          title: 'EVM wallet required',
          description: `Connect an EVM wallet to pay gas with ${gasTokenConfig.symbol}.`,
          variant: 'destructive',
        });
        return;
      }
      
      const transferFee = tokenConfig.gasFee;
      
      if (selectedGasToken !== selectedToken) {
        const gasBalance = balances[selectedGasToken] || 0;
        let gasTokenPrice = 1;
        if (gasTokenConfig.isNative) {
          if (gasTokenConfig.chain === 'solana') gasTokenPrice = tokenPrices?.solana || 0;
          else if (gasTokenConfig.chain === 'sui') gasTokenPrice = tokenPrices?.sui || 0;
          else gasTokenPrice = tokenPrices?.ethereum || 0;
        }
        const requiredGasAmount = gasTokenConfig.isNative 
          ? transferFee / gasTokenPrice 
          : transferFee;
        
        if (gasBalance < requiredGasAmount) {
          toast({
            title: 'Insufficient gas balance',
            description: `You need ${requiredGasAmount.toFixed(6)} ${gasTokenConfig.symbol} to pay $${transferFee.toFixed(2)} gas fee.`,
            variant: 'destructive',
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

    if (tokenConfig.chain === 'solana' && (!solanaPublicKey || !solanaSignTransaction)) {
      return;
    }

    if (tokenConfig.chain === 'sui' && !suiAccount) {
      return;
    }

    if ((tokenConfig.chain === 'base' || tokenConfig.chain === 'ethereum') && !evmAddress) {
      return;
    }

    setError('');
    setIsLoading(true);

    try {
      if (!tokenConfig) throw new Error('Invalid token selected');

      const fullAmount = parseFloat(amount);

      console.log('=== MULTI-CHAIN GASLESS TRANSFER START ===');
      console.log('Chain:', tokenConfig.chain);
      console.log('Token:', selectedToken);
      console.log('Amount:', fullAmount);
      console.log('Gas token:', selectedGasToken);

      if (tokenConfig.chain === 'solana') {
        toast({ 
          title: 'Building transaction...', 
          description: 'Creating gasless transfer on Solana'
        });

        const buildResponse = await supabase.functions.invoke('gasless-transfer', {
          body: {
            action: 'build_atomic_tx',
            chain: 'solana',
            senderPublicKey: solanaPublicKey!.toBase58(),
            recipientPublicKey: recipient,
            amount: fullAmount,
            mint: tokenConfig.mint,
            decimals: tokenConfig.decimals,
            gasToken: selectedGasToken,
          }
        });

        if (buildResponse.error) {
          throw new Error(buildResponse.error.message);
        }

        const { transaction: base64Tx, fee, amountAfterFee } = buildResponse.data;

        const binaryString = atob(base64Tx);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
        
        const { Transaction } = await import('@solana/web3.js');
        const transaction = Transaction.from(bytes);

        toast({ title: 'Sign the transaction', description: 'Please approve in your wallet' });
        const signedTx = await solanaSignTransaction!(transaction);
        const serialized = signedTx.serialize({ requireAllSignatures: false, verifySignatures: false });
        const signedBase64Tx = btoa(String.fromCharCode(...serialized));

        toast({ title: 'Submitting transaction...', description: 'Processing your transfer' });

        const submitResponse = await supabase.functions.invoke('gasless-transfer', {
          body: {
            action: 'submit_atomic_tx',
            chain: 'solana',
            signedTransaction: signedBase64Tx,
            senderPublicKey: solanaPublicKey!.toBase58(),
            recipientPublicKey: recipient,
            amount: fullAmount,
            mint: tokenConfig.mint,
            gasToken: selectedGasToken,
          }
        });

        if (submitResponse.error) {
          throw new Error(submitResponse.error.message);
        }

        const { signature } = submitResponse.data;
        const gasTokenConfig = getTokenConfig(selectedGasToken);
        const feeMessage = gasTokenConfig && gasTokenConfig.mint !== tokenConfig.mint
          ? `Gas fee of $${fee.toFixed(2)} paid with ${gasTokenConfig.symbol}`
          : `Fee: $${fee.toFixed(2)}`;
        
        toast({
          title: 'Transfer Successful!',
          description: `Sent ${amountAfterFee.toFixed(2)} ${tokenConfig.symbol}. ${feeMessage}`,
        });

        setRecipient('');
        setAmount('');
      } else if (tokenConfig.chain === 'sui') {
        if (!suiAccount) throw new Error('Sui wallet not connected');

        toast({ 
          title: 'Building transaction...', 
          description: 'Creating gasless transfer on Sui'
        });

        const buildResponse = await supabase.functions.invoke('gasless-transfer', {
          body: {
            action: 'build_atomic_tx',
            chain: 'sui',
            senderPublicKey: suiAccount.address,
            recipientPublicKey: recipient,
            amount: fullAmount,
            mint: tokenConfig.mint,
            decimals: tokenConfig.decimals,
            gasToken: selectedGasToken,
          }
        });

        if (buildResponse.error) {
          throw new Error(buildResponse.error.message);
        }

        const { transaction: base64Tx, fee, amountAfterFee } = buildResponse.data;

        toast({ title: 'Sign the transaction', description: 'Please approve in your Sui wallet' });
        
        const binaryString = atob(base64Tx);
        const txBytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          txBytes[i] = binaryString.charCodeAt(i);
        }
        
        const signedTx = await signSuiTransaction({
          transaction: SuiTransaction.from(txBytes),
          chain: 'sui:mainnet',
        });

        toast({ title: 'Submitting transaction...', description: 'Processing your transfer' });

        const submitResponse = await supabase.functions.invoke('gasless-transfer', {
          body: {
            action: 'submit_atomic_tx',
            chain: 'sui',
            signedTransaction: signedTx.bytes,
            userSignature: signedTx.signature,
            senderPublicKey: suiAccount.address,
            recipientPublicKey: recipient,
            amount: fullAmount,
            mint: tokenConfig.mint,
            gasToken: selectedGasToken,
          }
        });

        if (submitResponse.error) {
          throw new Error(submitResponse.error.message);
        }

        const { digest } = submitResponse.data;
        const gasTokenConfig = getTokenConfig(selectedGasToken);
        const feeMessage = gasTokenConfig && gasTokenConfig.mint !== tokenConfig.mint
          ? `Gas fee of $${fee.toFixed(2)} paid with ${gasTokenConfig.symbol}`
          : `Fee: $${fee.toFixed(2)}`;
        
        toast({
          title: 'Transfer Successful!',
          description: `Sent ${amountAfterFee.toFixed(2)} ${tokenConfig.symbol}. ${feeMessage}`,
        });

        setRecipient('');
        setAmount('');
      } else if (tokenConfig.chain === 'base' || tokenConfig.chain === 'ethereum') {
        if (!evmAddress) throw new Error('EVM wallet not connected');

        toast({ 
          title: 'Building transaction...', 
          description: `Creating transfer on ${CHAIN_NAMES[tokenConfig.chain]}`
        });

        // Get transaction parameters from backend
        const buildResponse = await supabase.functions.invoke('gasless-transfer', {
          body: {
            action: 'build_atomic_tx',
            chain: tokenConfig.chain,
            senderPublicKey: evmAddress,
            recipientPublicKey: recipient,
            amount: fullAmount,
            mint: tokenConfig.isNative ? 'native' : tokenConfig.mint,
            decimals: tokenConfig.decimals,
            gasToken: selectedGasToken,
          }
        });

        if (buildResponse.error) {
          throw new Error(buildResponse.error.message);
        }

        if (buildResponse.data?.error) {
          throw new Error(buildResponse.data.error);
        }

        const { backendWallet, transferAmount, feeAmount, feeAmountUSD, tokenContract } = buildResponse.data;
        
        console.log('EVM transaction params:', {
          backendWallet,
          transferAmount,
          feeAmount,
          feeAmountUSD,
          tokenContract,
          recipient,
        });

        // Get the wallet client from wagmi via window.ethereum
        const ethereum = (window as any).ethereum;
        if (!ethereum) {
          throw new Error('No Ethereum provider found. Please install MetaMask or another wallet.');
        }

        // Ensure we're on the correct chain
        const targetChainId = tokenConfig.chain === 'base' ? '0x2105' : '0x1'; // Base: 8453, ETH: 1
        try {
          const currentChainId = await ethereum.request({ method: 'eth_chainId' });
          if (currentChainId !== targetChainId) {
            await ethereum.request({
              method: 'wallet_switchEthereumChain',
              params: [{ chainId: targetChainId }],
            });
          }
        } catch (switchError: any) {
          console.error('Chain switch error:', switchError);
          throw new Error(`Please switch to ${CHAIN_NAMES[tokenConfig.chain]} network in your wallet`);
        }

        const gasTokenConfigLocal = getTokenConfig(selectedGasToken);
        const isNativeTransfer = tokenConfig.isNative;
        const useSameToken = selectedGasToken === selectedToken;

        toast({ title: 'Sign the transactions', description: 'Please approve in your wallet' });

        // Helper function to encode ERC20 transfer data
        const encodeErc20Transfer = (to: string, amount: string): string => {
          // transfer(address,uint256) selector: 0xa9059cbb
          const toAddress = to.toLowerCase().replace('0x', '').padStart(64, '0');
          const amountHex = BigInt(amount).toString(16).padStart(64, '0');
          return `0xa9059cbb${toAddress}${amountHex}`;
        };

        let txHashes: string[] = [];

        try {
          // Ensure addresses are properly formatted
          const recipientAddress = recipient.trim();
          
          if (isNativeTransfer) {
            // Native ETH transfer - send amount to recipient
            console.log('Sending native ETH to recipient:', recipientAddress, 'amount:', transferAmount);
            const tx1Hash = await ethereum.request({
              method: 'eth_sendTransaction',
              params: [{
                from: evmAddress,
                to: recipientAddress,
                value: `0x${BigInt(transferAmount).toString(16)}`,
              }],
            });
            txHashes.push(tx1Hash);
            console.log('Transfer to recipient tx:', tx1Hash);

            // Send fee to backend in native ETH
            toast({ title: 'Approve fee payment', description: 'Sign the fee transaction' });
            console.log('Sending fee to backend:', backendWallet, 'amount:', feeAmount);
            const tx2Hash = await ethereum.request({
              method: 'eth_sendTransaction',
              params: [{
                from: evmAddress,
                to: backendWallet,
                value: `0x${BigInt(feeAmount).toString(16)}`,
              }],
            });
            txHashes.push(tx2Hash);
            console.log('Fee to backend tx:', tx2Hash);
          } else {
            // ERC20 transfer
            const tokenAddress = tokenContract;
            console.log('Sending ERC20 to recipient:', recipientAddress, 'token:', tokenAddress, 'amount:', transferAmount);

            // Transaction 1: Send amount to recipient
            const tx1Hash = await ethereum.request({
              method: 'eth_sendTransaction',
              params: [{
                from: evmAddress,
                to: tokenAddress,
                data: encodeErc20Transfer(recipientAddress, transferAmount),
                value: '0x0',
              }],
            });
            txHashes.push(tx1Hash);
            console.log('Transfer to recipient tx:', tx1Hash);

            // Transaction 2: Send fee to backend
            toast({ title: 'Approve fee payment', description: 'Sign the fee transaction' });
            console.log('Sending fee to backend:', backendWallet, 'amount:', feeAmount);
            
            if (useSameToken) {
              // Fee in same token
              const tx2Hash = await ethereum.request({
                method: 'eth_sendTransaction',
                params: [{
                  from: evmAddress,
                  to: tokenAddress,
                  data: encodeErc20Transfer(backendWallet, feeAmount),
                  value: '0x0',
                }],
              });
              txHashes.push(tx2Hash);
              console.log('Fee to backend tx:', tx2Hash);
            } else if (gasTokenConfigLocal?.isNative) {
              // Fee in native ETH
              const tx2Hash = await ethereum.request({
                method: 'eth_sendTransaction',
                params: [{
                  from: evmAddress,
                  to: backendWallet,
                  value: `0x${BigInt(feeAmount).toString(16)}`,
                }],
              });
              txHashes.push(tx2Hash);
              console.log('Fee to backend tx:', tx2Hash);
            } else {
              // Fee in different ERC20
              const feeTokenAddress = gasTokenConfigLocal?.mint || tokenAddress;
              const tx2Hash = await ethereum.request({
                method: 'eth_sendTransaction',
                params: [{
                  from: evmAddress,
                  to: feeTokenAddress,
                  data: encodeErc20Transfer(backendWallet, feeAmount),
                  value: '0x0',
                }],
              });
              txHashes.push(tx2Hash);
              console.log('Fee to backend tx:', tx2Hash);
            }
          }
        } catch (txError: any) {
          console.error('Transaction error:', txError);
          if (txError.code === 4001) {
            throw new Error('Transaction rejected by user');
          }
          throw new Error(txError.message || 'Failed to send transaction');
        }

        toast({ title: 'Confirming transaction...', description: 'Waiting for blockchain confirmation' });

        // Wait for transaction confirmation
        const rpcUrl = tokenConfig.chain === 'base' ? 'https://mainnet.base.org' : 'https://cloudflare-eth.com';
        let confirmed = false;
        let attempts = 0;
        const maxAttempts = 60;
        
        while (!confirmed && attempts < maxAttempts) {
          try {
            const receiptResponse = await fetch(rpcUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                jsonrpc: '2.0',
                method: 'eth_getTransactionReceipt',
                params: [txHashes[0]],
                id: 1,
              }),
            });
            const receiptData = await receiptResponse.json();
            
            if (receiptData.result) {
              if (receiptData.result.status === '0x1') {
                confirmed = true;
              } else if (receiptData.result.status === '0x0') {
                throw new Error('Transaction failed on blockchain');
              }
            }
          } catch (e) {
            console.log('Waiting for confirmation...', e);
          }
          
          if (!confirmed) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            attempts++;
          }
        }

        if (!confirmed) {
          throw new Error('Transaction confirmation timeout - please check your wallet');
        }

        // Notify backend of successful transfer
        await supabase.functions.invoke('gasless-transfer', {
          body: {
            action: 'submit_atomic_tx',
            chain: tokenConfig.chain,
            txHash: txHashes[0],
            senderPublicKey: evmAddress,
            recipientPublicKey: recipient,
            amount: fullAmount,
            mint: tokenConfig.isNative ? 'native' : tokenConfig.mint,
            gasToken: selectedGasToken,
          }
        });

        const explorerUrl = tokenConfig.chain === 'base' 
          ? `https://basescan.org/tx/${txHashes[0]}`
          : `https://etherscan.io/tx/${txHashes[0]}`;

        toast({
          title: 'Transfer Successful!',
          description: `Sent ${fullAmount} ${tokenConfig.symbol} to recipient. Fee: $${feeAmountUSD.toFixed(2)}`,
        });

        console.log('Transfer complete:', explorerUrl);
        
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
        variant: 'destructive',
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
    if (symbol === 'ETH') {
      return token.chain === 'base' ? baseLogo : ethLogo;
    }
    return usdcLogo;
  };

  const getChainLogo = (chain: ChainType) => {
    switch (chain) {
      case 'solana': return solanaLogo;
      case 'sui': return suiLogo;
      case 'base': return baseLogo;
      case 'ethereum': return ethLogo;
      default: return solanaLogo;
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
  const tokensWithBalance = Object.entries(balances)
    .filter(([key, balance]) => {
      const config = getTokenConfig(key);
      if (!config) return false;
      // Only show tokens from the connected chain
      return config.chain === connectedChain && balance >= 0;
    })
    .map(([key]) => {
      const config = getTokenConfig(key);
      return { key, config };
    })
    .filter((item): item is { key: string; config: import('@/config/tokens').TokenConfig } => item.config !== undefined);

  const solanaTokensWithBalance = connectedChain === 'solana' ? tokensWithBalance : [];
  const suiTokensWithBalance = connectedChain === 'sui' ? tokensWithBalance : [];
  const baseTokensWithBalance = connectedChain === 'base' ? tokensWithBalance : [];
  const ethTokensWithBalance = connectedChain === 'ethereum' ? tokensWithBalance : [];

  const [balancesOpen, setBalancesOpen] = useState(false);

  return (
    <Card className="glass-card w-full max-w-md border-2 border-primary/30 mx-4 sm:mx-0">
      <CardHeader className="space-y-1 p-4 sm:p-6">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg sm:text-xl md:text-2xl font-bold bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent">
            Legion Transfer
          </CardTitle>
          <ProcessingLogo isProcessing={isLoading} className="w-7 h-7 sm:w-8 sm:h-8 md:w-10 md:h-10" />
        </div>
        <CardDescription className="text-muted-foreground text-xs sm:text-sm">
          Send tokens across multiple chains without gas fees
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 p-4 sm:p-6">
        {!hasWalletConnected && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Connect a wallet to see available tokens and start transferring
            </AlertDescription>
          </Alert>
        )}

        <ConnectedWalletInfo />

        {hasWalletConnected && tokensWithBalance.length > 0 && (
          <Collapsible open={balancesOpen} onOpenChange={setBalancesOpen}>
            <CollapsibleTrigger asChild>
              <Button 
                variant="outline" 
                className="w-full flex justify-between items-center bg-secondary/30 hover:bg-secondary/50 text-xs sm:text-sm"
              >
                <span className="font-medium">View Token Balances</span>
                <ChevronDown className={`h-3.5 w-3.5 sm:h-4 sm:w-4 transition-transform ${balancesOpen ? 'rotate-180' : ''}`} />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-3">
              <div className="space-y-3">
                {/* Solana Balances */}
                {solanaTokensWithBalance.length > 0 && (
                  <div className="rounded-lg bg-secondary/30 p-3 space-y-2">
                    <div className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
                      <img src={solanaLogo} alt="Solana" className="w-4 h-4 rounded-full" />
                      Solana Balances
                    </div>
                    {solanaTokensWithBalance.map(({ key, config }) => (
                      <div key={key} className="flex justify-between items-center text-sm">
                        <div className="flex items-center gap-2">
                          <div className="relative">
                            <img src={getTokenLogo(key as TokenKey)} alt={config.symbol} className="w-5 h-5 rounded-full" />
                            <img src={solanaLogo} alt="Solana" className="w-3 h-3 absolute -bottom-0.5 -right-0.5 rounded-full border border-background" />
                          </div>
                          <span className="text-muted-foreground">{config.symbol}:</span>
                        </div>
                        <span className="font-medium">
                          {(balances[key as TokenKey] || 0).toFixed(config.isNative ? 4 : 2)} {config.symbol}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Sui Balances */}
                {suiTokensWithBalance.length > 0 && (
                  <div className="rounded-lg bg-secondary/30 p-3 space-y-2">
                    <div className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
                      <img src={suiLogo} alt="Sui" className="w-4 h-4 rounded-full" />
                      Sui Balances
                    </div>
                    {suiTokensWithBalance.map(({ key, config }) => (
                      <div key={key} className="flex justify-between items-center text-sm">
                        <div className="flex items-center gap-2">
                          <div className="relative">
                            <img src={getTokenLogo(key as TokenKey)} alt={config.symbol} className="w-5 h-5 rounded-full" />
                            <img src={suiLogo} alt="Sui" className="w-3 h-3 absolute -bottom-0.5 -right-0.5 rounded-full border border-background" />
                          </div>
                          <span className="text-muted-foreground">{config.symbol}:</span>
                        </div>
                        <span className="font-medium">
                          {(balances[key as TokenKey] || 0).toFixed(config.isNative ? 4 : 2)} {config.symbol}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Base Balances */}
                {baseTokensWithBalance.length > 0 && (
                  <div className="rounded-lg bg-secondary/30 p-3 space-y-2">
                    <div className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
                      <img src={baseLogo} alt="Base" className="w-4 h-4 rounded-full" />
                      Base Balances
                    </div>
                    {baseTokensWithBalance.map(({ key, config }) => (
                      <div key={key} className="flex justify-between items-center text-sm">
                        <div className="flex items-center gap-2">
                          <div className="relative">
                            <img src={getTokenLogo(key as TokenKey)} alt={config.symbol} className="w-5 h-5 rounded-full" />
                            {!config.isNative && (
                              <img src={baseLogo} alt="Base" className="w-3 h-3 absolute -bottom-0.5 -right-0.5 rounded-full border border-background" />
                            )}
                          </div>
                          <span className="text-muted-foreground">{config.symbol}:</span>
                        </div>
                        <span className="font-medium">
                          {(balances[key as TokenKey] || 0).toFixed(config.isNative ? 6 : 2)} {config.symbol}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Ethereum Balances */}
                {ethTokensWithBalance.length > 0 && (
                  <div className="rounded-lg bg-secondary/30 p-3 space-y-2">
                    <div className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
                      <img src={ethLogo} alt="Ethereum" className="w-4 h-4 rounded-full" />
                      Ethereum Balances
                    </div>
                    {ethTokensWithBalance.map(({ key, config }) => (
                      <div key={key} className="flex justify-between items-center text-sm">
                        <div className="flex items-center gap-2">
                          <div className="relative">
                            <img src={getTokenLogo(key as TokenKey)} alt={config.symbol} className="w-5 h-5 rounded-full" />
                            {!config.isNative && (
                              <img src={ethLogo} alt="Ethereum" className="w-3 h-3 absolute -bottom-0.5 -right-0.5 rounded-full border border-background" />
                            )}
                          </div>
                          <span className="text-muted-foreground">{config.symbol}:</span>
                        </div>
                        <span className="font-medium">
                          {(balances[key as TokenKey] || 0).toFixed(config.isNative ? 6 : 2)} {config.symbol}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        <div className="space-y-2">
          <Label htmlFor="token" className="text-sm">Token to Send</Label>
          <Select 
            value={selectedToken} 
            onValueChange={(value: TokenKey) => {
              setSelectedToken(value);
              setSelectedGasToken(value);
            }}
            disabled={availableTokens.length === 0}
          >
            <SelectTrigger id="token" className="bg-secondary/50 border-border/50">
              <SelectValue placeholder={availableTokens.length === 0 ? "Connect a wallet first" : "Select token"} />
            </SelectTrigger>
            <SelectContent className="bg-popover border-border z-[100] max-h-[300px]">
              {availableTokens.map(([key, config]) => (
                <SelectItem key={key} value={key}>
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <img src={getTokenLogo(key as TokenKey)} alt={config.symbol} className="w-4 h-4 rounded-full" />
                      {!config.isNative && (
                        <img src={getChainLogo(config.chain)} alt={config.chain} className="w-2.5 h-2.5 absolute -bottom-0.5 -right-0.5 rounded-full border border-background" />
                      )}
                    </div>
                    <span>{getTokenDisplayName(key)}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="gasToken" className="text-sm">Pay Gas With</Label>
          <Select 
            value={selectedGasToken} 
            onValueChange={(value: TokenKey) => setSelectedGasToken(value)}
            disabled={availableTokens.length === 0}
          >
            <SelectTrigger id="gasToken" className="bg-secondary/50 border-border/50">
              <SelectValue placeholder={availableTokens.length === 0 ? "Connect a wallet first" : "Select gas token"} />
            </SelectTrigger>
            <SelectContent className="bg-popover border-border z-[100] max-h-[300px]">
              {availableTokens.map(([key, config]) => (
                <SelectItem key={key} value={key}>
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <img src={getTokenLogo(key as TokenKey)} alt={config.symbol} className="w-4 h-4 rounded-full" />
                      {!config.isNative && (
                        <img src={getChainLogo(config.chain)} alt={config.chain} className="w-2.5 h-2.5 absolute -bottom-0.5 -right-0.5 rounded-full border border-background" />
                      )}
                    </div>
                    <span>{getTokenDisplayName(key)}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="recipient" className="text-sm">Recipient Address</Label>
          <Input
            id="recipient"
            placeholder="Enter recipient address"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            disabled={!hasWalletConnected || isLoading}
            className="bg-secondary/50 border-border/50 text-sm"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="amount" className="text-sm">Amount ($)</Label>
          <Input
            id="amount"
            type="number"
            step="0.01"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={!hasWalletConnected || isLoading}
            className="bg-secondary/50 border-border/50 text-sm"
          />
        </div>

        {amount && parseFloat(amount) > 0 && (
          <div className="rounded-lg bg-secondary/30 p-3 space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Transfer Amount:</span>
              <span className="font-medium">${parseFloat(amount).toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Gas Fee ({selectedGasTokenConfig?.symbol || 'token'}):</span>
              <span className="font-medium">{getGasFeeDisplay()}</span>
            </div>
            <div className="h-px bg-border/50 my-1" />
            <div className="flex justify-between font-semibold text-base">
              <span>Recipient Receives:</span>
              <span className="text-primary">${parseFloat(amount).toFixed(2)}</span>
            </div>
            {selectedToken === selectedGasToken && (
              <div className="mt-2 pt-2 border-t border-border/50">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Total Needed ({selectedTokenConfig?.symbol}):</span>
                  <span className="font-semibold text-accent">${(parseFloat(amount) + gasFee).toFixed(2)}</span>
                </div>
              </div>
            )}
            {selectedGasTokenConfig?.isNative && !tokenPrices && (
              <p className="text-xs text-muted-foreground mt-2">Loading current {selectedGasTokenConfig.symbol} price...</p>
            )}
          </div>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Button
          onClick={initiateTransfer}
          disabled={!hasWalletConnected || isLoading || !recipient || !amount}
          className="w-full gap-2 bg-gradient-to-r from-primary via-accent to-primary hover:opacity-90 text-sm sm:text-base py-5 sm:py-6"
        >
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="hidden xs:inline">Processing...</span>
            </>
          ) : (
            <>
              <Send className="h-4 w-4" />
              Send Now
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
};
