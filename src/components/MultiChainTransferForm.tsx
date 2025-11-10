import { useState, useEffect } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { useCurrentAccount as useSuiAccount, useSignTransaction } from '@mysten/dapp-kit';
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
import { TOKENS, getTokensByChain, getTokenConfig, getTokenDisplayName, MIN_TRANSFER_USD } from '@/config/tokens';
import type { ChainType } from '@/config/tokens';
import usdtLogo from '@/assets/usdt-logo.png';
import usdcLogo from '@/assets/usdc-logo.png';
import solanaLogo from '@/assets/solana-logo.png';
import suiLogo from '@/assets/sui-logo.png';
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
  
  const suiClient = new SuiClient({ url: 'https://fullnode.mainnet.sui.io:443' });
  
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [selectedToken, setSelectedToken] = useState<TokenKey>('USDC_SOL');
  const [selectedGasToken, setSelectedGasToken] = useState<TokenKey>('USDC_SOL');
  const [balances, setBalances] = useState<BalanceMap>({} as BalanceMap);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [tokenPrices, setTokenPrices] = useState<{ solana: number; sui: number } | null>(null);

  const selectedTokenConfig = getTokenConfig(selectedToken);
  const selectedGasTokenConfig = getTokenConfig(selectedGasToken);
  const gasFee = selectedTokenConfig?.gasFee || 0.50;
  
  // Calculate gas fee in tokens if paying with native token
  const getGasFeeDisplay = () => {
    if (!selectedGasTokenConfig || !tokenPrices) return `$${gasFee.toFixed(2)}`;
    
    if (selectedGasTokenConfig.isNative) {
      const price = selectedGasTokenConfig.chain === 'solana' ? tokenPrices.solana : tokenPrices.sui;
      const tokenAmount = gasFee / price;
      return `${tokenAmount.toFixed(4)} ${selectedGasTokenConfig.symbol} (~$${gasFee.toFixed(2)})`;
    }
    
    return `$${gasFee.toFixed(2)}`;
  };

  // Get available tokens based on connected wallets
  const getAvailableTokens = (): [string, typeof TOKENS[TokenKey]][] => {
    const hasSolana = !!solanaPublicKey;
    const hasSui = !!suiAccount;
    
    return Object.entries(TOKENS).filter(([_, config]) => {
      if (config.chain === 'solana') return hasSolana;
      if (config.chain === 'sui') return hasSui;
      return false;
    });
  };

  const availableTokens = getAvailableTokens();

  // Fetch token prices from backend
  useEffect(() => {
    const fetchPrices = async () => {
      try {
        const { data, error } = await supabase.functions.invoke('gasless-transfer', {
          body: { action: 'get_token_prices' },
        });
        
        if (error) throw error;
        if (data?.prices) {
          setTokenPrices(data.prices);
          console.log('Token prices fetched:', data.prices);
        }
      } catch (error) {
        console.error('Error fetching token prices:', error);
      }
    };

    fetchPrices();
    // Refresh prices every 60 seconds
    const interval = setInterval(fetchPrices, 60000);
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
  }, [solanaPublicKey, suiAccount]);

  // Fetch balances for all chains
  useEffect(() => {
    const fetchBalances = async () => {
      const newBalances: Partial<BalanceMap> = {};

      // Fetch Solana balances
      if (solanaPublicKey) {
        try {
          // Fetch SOL balance
          const solBalance = await connection.getBalance(solanaPublicKey, 'confirmed');
          newBalances.SOL = solBalance / LAMPORTS_PER_SOL;

          // Fetch USDC (Solana)
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

          // Fetch USDT (Solana)
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
          // Get all balances for the Sui account
          const balance = await suiClient.getBalance({
            owner: suiAccount.address,
            coinType: '0x2::sui::SUI',
          });
          newBalances.SUI = Number(balance.totalBalance) / 1e9; // SUI has 9 decimals

          // Fetch USDC on Sui
          try {
            const usdcBalance = await suiClient.getBalance({
              owner: suiAccount.address,
              coinType: TOKENS.USDC_SUI.mint,
            });
            newBalances.USDC_SUI = Number(usdcBalance.totalBalance) / 1e6;
          } catch {
            newBalances.USDC_SUI = 0;
          }

          // Fetch USDT on Sui
          try {
            const usdtBalance = await suiClient.getBalance({
              owner: suiAccount.address,
              coinType: TOKENS.USDT_SUI.mint,
            });
            newBalances.USDT_SUI = Number(usdtBalance.totalBalance) / 1e6;
          } catch {
            newBalances.USDT_SUI = 0;
          }
        } catch (error) {
          console.error('Error fetching Sui balances:', error);
          newBalances.USDC_SUI = 0;
          newBalances.USDT_SUI = 0;
          newBalances.SUI = 0;
        }
      } else {
        newBalances.USDC_SUI = 0;
        newBalances.USDT_SUI = 0;
        newBalances.SUI = 0;
      }

      setBalances(newBalances as BalanceMap);
    };

    fetchBalances();
    const interval = setInterval(fetchBalances, 10000);
    return () => clearInterval(interval);
  }, [solanaPublicKey, suiAccount, connection]);

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

    setError('');
    
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      setError('Invalid amount');
      return;
    }

    if (amountNum < MIN_TRANSFER_USD) {
      setError(`Minimum transfer amount is $${MIN_TRANSFER_USD} USD`);
      return;
    }

    const currentBalance = balances[selectedToken] || 0;
    if (amountNum > currentBalance) {
      setError(`Insufficient balance. You have $${currentBalance.toFixed(2)} ${selectedTokenConfig?.symbol}`);
      return;
    }

    // Check gas token wallet compatibility
    const gasTokenConfig = getTokenConfig(selectedGasToken);
    if (gasTokenConfig) {
      if (gasTokenConfig.chain === 'solana' && !solanaPublicKey) {
        toast({
          title: 'Wallet not compatible',
          description: 'Please connect a Solana wallet to pay gas fees with this token.',
          variant: 'destructive',
        });
        return;
      }
      if (gasTokenConfig.chain === 'sui' && !suiAccount) {
        toast({
          title: 'Wallet not compatible',
          description: 'Please connect a Sui wallet to pay gas fees with this token.',
          variant: 'destructive',
        });
        return;
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
        // Solana transfer logic (same as before)
        toast({ 
          title: 'Building transaction...', 
          description: 'Creating gasless transfer on Solana'
        });

        const buildResponse = await supabase.functions.invoke('gasless-transfer', {
          body: {
            action: 'build_atomic_tx',
            chain: 'solana',
            senderPublicKey: solanaPublicKey.toBase58(),
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

        // Deserialize and sign
        const binaryString = atob(base64Tx);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
        
        const { Transaction } = await import('@solana/web3.js');
        const transaction = Transaction.from(bytes);

        toast({ title: 'Sign the transaction', description: 'Please approve in your wallet' });
        const signedTx = await solanaSignTransaction(transaction);
        const serialized = signedTx.serialize({ requireAllSignatures: false, verifySignatures: false });
        const signedBase64Tx = btoa(String.fromCharCode(...serialized));

        toast({ title: 'Submitting transaction...', description: 'Processing your transfer' });

        const submitResponse = await supabase.functions.invoke('gasless-transfer', {
          body: {
            action: 'submit_atomic_tx',
            chain: 'solana',
            signedTransaction: signedBase64Tx,
            senderPublicKey: solanaPublicKey.toBase58(),
            recipientPublicKey: recipient,
            amount: fullAmount,
            mint: tokenConfig.mint,
          }
        });

        if (submitResponse.error) {
          throw new Error(submitResponse.error.message);
        }

        const { signature } = submitResponse.data;
        toast({
          title: 'Transfer Successful!',
          description: `Sent ${amountAfterFee.toFixed(2)} ${tokenConfig.symbol}`,
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
        
        // Decode and sign the Sui transaction
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
            signedTransaction: signedTx.bytes, // Already base64 encoded
            senderPublicKey: suiAccount.address,
            recipientPublicKey: recipient,
            amount: fullAmount,
            mint: tokenConfig.mint,
          }
        });

        if (submitResponse.error) {
          throw new Error(submitResponse.error.message);
        }

        const { digest } = submitResponse.data;
        toast({
          title: 'Transfer Successful!',
          description: `Sent ${amountAfterFee.toFixed(2)} ${tokenConfig.symbol}`,
        });

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
    const symbol = TOKENS[tokenKey].symbol;
    if (symbol === 'USDC') return usdcLogo;
    if (symbol === 'USDT') return usdtLogo;
    if (symbol === 'SOL') return solanaLogo;
    if (symbol === 'SUI') return suiLogo;
    return usdcLogo;
  };

  const getChainLogo = (chain: ChainType) => {
    return chain === 'solana' ? solanaLogo : suiLogo;
  };

  const solanaTokens = getTokensByChain('solana');
  const suiTokens = getTokensByChain('sui');
  
  // Filter tokens with balance > 0 for display (only show tokens above $0)
  const tokensWithBalance = Object.entries(balances)
    .filter(([_, balance]) => balance > 0)
    .map(([key]) => {
      const config = getTokenConfig(key);
      return { key, config };
    })
    .filter((item): item is { key: string; config: import('@/config/tokens').TokenConfig } => item.config !== undefined);

  const solanaTokensWithBalance = tokensWithBalance.filter(item => item.config.chain === 'solana');
  const suiTokensWithBalance = tokensWithBalance.filter(item => item.config.chain === 'sui');

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
        {!solanaPublicKey && !suiAccount && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Connect a wallet to see available tokens and start transferring
            </AlertDescription>
          </Alert>
        )}

        <ConnectedWalletInfo />

        {(solanaPublicKey || suiAccount) && tokensWithBalance.length > 0 && (
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
              // Auto-select same token for gas payment
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
                      <img src={getChainLogo(config.chain)} alt={config.chain} className="w-2.5 h-2.5 absolute -bottom-0.5 -right-0.5 rounded-full border border-background" />
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
                      <img src={getChainLogo(config.chain)} alt={config.chain} className="w-2.5 h-2.5 absolute -bottom-0.5 -right-0.5 rounded-full border border-background" />
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
            disabled={(!solanaPublicKey && !suiAccount) || isLoading}
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
            disabled={(!solanaPublicKey && !suiAccount) || isLoading}
            className="bg-secondary/50 border-border/50 text-sm"
          />
        </div>

        {amount && parseFloat(amount) > 0 && (
          <div className="rounded-lg bg-secondary/30 p-3 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Multichain Gas Fee:</span>
              <span className="font-medium">{getGasFeeDisplay()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Recipient receives:</span>
              <span className="font-medium">${amountAfterFee.toFixed(2)}</span>
            </div>
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
          disabled={(!solanaPublicKey && !suiAccount) || isLoading || !recipient || !amount}
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
