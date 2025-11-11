import { useState, useEffect } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { useCurrentAccount as useSuiAccount } from '@mysten/dapp-kit';
import { PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { supabase } from '@/integrations/supabase/client';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { useToast } from '@/hooks/use-toast';
import { Loader2, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from './ui/alert';
import { TOKENS, MIN_TRANSFER_USD } from '@/config/tokens';
import type { ChainType } from '@/config/tokens';
import { SuiClient } from '@mysten/sui/client';
import usdtLogo from '@/assets/usdt-logo.png';
import usdcLogo from '@/assets/usdc-logo.png';
import solanaLogo from '@/assets/solana-logo.png';
import suiLogo from '@/assets/sui-logo.png';

type TokenKey = keyof typeof TOKENS;
type BalanceMap = Record<TokenKey, number>;

const getTokenLogo = (symbol: string) => {
  if (symbol === 'USDC') return usdcLogo;
  if (symbol === 'USDT') return usdtLogo;
  if (symbol === 'SOL') return solanaLogo;
  if (symbol === 'SUI') return suiLogo;
  return usdcLogo;
};

export const CrossChainGasTransfer = () => {
  const { connection } = useConnection();
  const { publicKey: solanaPublicKey } = useWallet();
  const suiAccount = useSuiAccount();
  const { toast } = useToast();
  
  const suiClient = new SuiClient({ url: 'https://fullnode.mainnet.sui.io:443' });
  
  const [transferChain, setTransferChain] = useState<ChainType>('solana');
  const [selectedToken, setSelectedToken] = useState<TokenKey>('USDC_SOL');
  const [selectedGasToken, setSelectedGasToken] = useState<TokenKey>('USDC_SUI');
  const [amount, setAmount] = useState('');
  const [recipient, setRecipient] = useState('');
  const [balances, setBalances] = useState<BalanceMap>({} as BalanceMap);
  const [loading, setLoading] = useState(false);
  const [feeInfo, setFeeInfo] = useState<any>(null);
  const [tokenPrices, setTokenPrices] = useState<{ solana: number; sui: number } | null>(null);

  const gasChain: ChainType = transferChain === 'solana' ? 'sui' : 'solana';
  const isConnected = solanaPublicKey && suiAccount;

  // Fetch token prices
  useEffect(() => {
    const fetchPrices = async () => {
      try {
        const { data, error } = await supabase.functions.invoke('gasless-transfer', {
          body: { action: 'get_token_prices' },
        });
        
        if (error) throw error;
        if (data?.prices) {
          setTokenPrices(data.prices);
        }
      } catch (error) {
        console.error('Error fetching token prices:', error);
      }
    };

    fetchPrices();
    const interval = setInterval(fetchPrices, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // Fetch balances for all chains
  useEffect(() => {
    const fetchBalances = async () => {
      const newBalances: Partial<BalanceMap> = {};

      // Fetch Solana balances
      if (solanaPublicKey) {
        try {
          // SOL balance
          const solBalance = await connection.getBalance(solanaPublicKey, 'confirmed');
          newBalances.SOL = solBalance / LAMPORTS_PER_SOL;

          // USDC (Solana)
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

          // USDT (Solana)
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

      setBalances(newBalances as BalanceMap);
    };

    fetchBalances();
    const interval = setInterval(fetchBalances, 10000);
    return () => clearInterval(interval);
  }, [solanaPublicKey, suiAccount, connection]);

  // Update token selections when chain changes
  useEffect(() => {
    if (transferChain === 'solana') {
      setSelectedToken('USDC_SOL');
      setSelectedGasToken('USDC_SUI');
    } else {
      setSelectedToken('USDC_SUI');
      setSelectedGasToken('USDC_SOL');
    }
    setFeeInfo(null);
  }, [transferChain]);

  const calculateFee = async () => {
    if (!amount || parseFloat(amount) < MIN_TRANSFER_USD) {
      toast({
        title: 'Invalid amount',
        description: `Minimum transfer amount is $${MIN_TRANSFER_USD}`,
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('cross-chain-gas', {
        body: {
          action: 'calculate_cross_chain_fee',
          transferChain,
          gasChain,
        }
      });

      if (error) throw error;

      setFeeInfo(data);
      toast({
        title: 'Fee calculated',
        description: `${data.feeAmount.toFixed(4)} ${data.feeToken} ($${data.feeUSD})`,
      });
    } catch (error: any) {
      console.error('Fee calculation error:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to calculate fee',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleTransfer = async () => {
    if (!isConnected) {
      toast({
        title: 'Wallets not connected',
        description: 'Please connect both Solana and SUI wallets',
        variant: 'destructive',
      });
      return;
    }

    if (!amount || !recipient) {
      toast({
        title: 'Missing information',
        description: 'Please fill in all fields',
        variant: 'destructive',
      });
      return;
    }

    if (!feeInfo) {
      toast({
        title: 'Calculate fee first',
        description: 'Please calculate the fee before transferring',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      toast({
        title: 'Fee payment',
        description: `Please approve ${feeInfo.feeAmount.toFixed(4)} ${feeInfo.feeToken} payment on ${gasChain}`,
      });
      
      // TODO: Implement actual transaction signing
      const feeSignature = 'mock_signature_' + Date.now();
      
      const { data: verifyData, error: verifyError } = await supabase.functions.invoke('cross-chain-gas', {
        body: {
          action: 'verify_fee_payment',
          gasChain,
          feeSignature,
          senderAddress: transferChain === 'solana' ? solanaPublicKey?.toBase58() : suiAccount?.address,
        }
      });

      if (verifyError) throw verifyError;

      if (!verifyData.verified) {
        throw new Error('Fee payment verification failed');
      }

      toast({
        title: 'Success',
        description: 'Transfer completed successfully!',
      });
      
      setAmount('');
      setRecipient('');
      setFeeInfo(null);
    } catch (error: any) {
      console.error('Transfer error:', error);
      toast({
        title: 'Transfer failed',
        description: error.message || 'An error occurred',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // Get available tokens for transfer chain
  const getTransferTokens = (): [string, typeof TOKENS[TokenKey]][] => {
    return Object.entries(TOKENS).filter(([_, config]) => config.chain === transferChain);
  };

  // Get available tokens for gas payment (opposite chain)
  const getGasTokens = (): [string, typeof TOKENS[TokenKey]][] => {
    return Object.entries(TOKENS).filter(([_, config]) => config.chain === gasChain);
  };

  return (
    <Card className="w-full max-w-2xl mx-auto border-primary/20">
      <CardHeader>
        <CardTitle className="text-2xl bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
          Cross-Chain Gas Payment
        </CardTitle>
        <CardDescription>
          Send tokens on one chain while paying fees with tokens from another chain
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {!isConnected && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Connect both Solana and SUI wallets to use cross-chain gas payment
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-2">
          <Label>Transfer Chain</Label>
          <Select value={transferChain} onValueChange={(value: ChainType) => setTransferChain(value)}>
            <SelectTrigger className="bg-background">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-background border-border z-50">
              <SelectItem value="solana">
                <div className="flex items-center gap-2">
                  <img src={solanaLogo} alt="Solana" className="w-4 h-4" />
                  Send on Solana
                </div>
              </SelectItem>
              <SelectItem value="sui">
                <div className="flex items-center gap-2">
                  <img src={suiLogo} alt="SUI" className="w-4 h-4" />
                  Send on SUI
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Transfer Token</Label>
            <Select value={selectedToken} onValueChange={(value: TokenKey) => setSelectedToken(value)}>
              <SelectTrigger className="bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-background border-border z-50">
                {getTransferTokens().map(([key, token]) => (
                  <SelectItem key={key} value={key}>
                    <div className="flex items-center justify-between w-full gap-2">
                      <div className="flex items-center gap-2">
                        <img src={getTokenLogo(token.symbol)} alt={token.symbol} className="w-4 h-4" />
                        {token.symbol}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {balances[key as TokenKey]?.toFixed(4) || '0'}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Gas Payment Token</Label>
            <Select value={selectedGasToken} onValueChange={(value: TokenKey) => setSelectedGasToken(value)}>
              <SelectTrigger className="bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-background border-border z-50">
                {getGasTokens().map(([key, token]) => (
                  <SelectItem key={key} value={key}>
                    <div className="flex items-center justify-between w-full gap-2">
                      <div className="flex items-center gap-2">
                        <img src={getTokenLogo(token.symbol)} alt={token.symbol} className="w-4 h-4" />
                        {token.symbol}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {balances[key as TokenKey]?.toFixed(4) || '0'}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="p-3 bg-muted/50 rounded-lg text-sm">
          <p className="text-muted-foreground">
            Fee: {transferChain === 'solana' ? '$0.50' : '$0.40'} paid in {TOKENS[selectedGasToken].symbol} on {gasChain}
          </p>
        </div>

        <div className="space-y-2">
          <Label>Amount</Label>
          <Input
            type="number"
            placeholder={`Minimum $${MIN_TRANSFER_USD}`}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            min={MIN_TRANSFER_USD}
          />
        </div>

        <div className="space-y-2">
          <Label>Recipient Address</Label>
          <Input
            placeholder={`Enter ${transferChain} address`}
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
          />
        </div>

        {feeInfo && (
          <div className="p-4 bg-primary/10 border border-primary/20 rounded-lg space-y-1">
            <p className="text-sm font-medium">Fee Details</p>
            <p className="text-xs text-muted-foreground">
              Fee: {feeInfo.feeAmount.toFixed(4)} {feeInfo.feeToken} (${feeInfo.feeUSD})
            </p>
            <p className="text-xs text-muted-foreground">
              Paid on: {feeInfo.gasChain}
            </p>
          </div>
        )}

        <div className="flex gap-3">
          <Button
            onClick={calculateFee}
            disabled={loading || !amount || !isConnected}
            variant="outline"
            className="flex-1"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Calculate Fee'}
          </Button>

          <Button
            onClick={handleTransfer}
            disabled={loading || !isConnected || !feeInfo}
            className="flex-1"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Transfer'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
