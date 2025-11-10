import { useState, useEffect } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey, LAMPORTS_PER_SOL, Transaction } from '@solana/web3.js';
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
import { ConfirmTransferDialog } from './ConfirmTransferDialog';
import { ProcessingLogo } from './ProcessingLogo';
import usdtLogo from '@/assets/usdt-logo.png';
import usdcLogo from '@/assets/usdc-logo.png';

// Token mint addresses on Solana Mainnet
const TOKENS = {
  USDC: {
    name: 'USDC',
    mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    decimals: 6,
  },
  USDT: {
    name: 'USDT',
    mint: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
    decimals: 6,
  },
};

const SERVICE_FEE_PERCENT = 0.5;
const MIN_TRANSFER_USD = 5;

export const TransferForm = () => {
  const { connection } = useConnection();
  const { publicKey, signTransaction } = useWallet();
  const { toast } = useToast();
  
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [selectedToken, setSelectedToken] = useState<'USDC' | 'USDT'>('USDC');
  const [balances, setBalances] = useState<{ USDC: number; USDT: number }>({ USDC: 0, USDT: 0 });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  // Fetch token balances with enhanced debugging and reliability
  useEffect(() => {
    const fetchBalances = async () => {
      if (!publicKey) {
        console.log('No wallet connected, resetting balances');
        setBalances({ USDC: 0, USDT: 0 });
        return;
      }

      const timestamp = new Date().toISOString();
      console.log('=== Balance Fetch Debug Start ===', timestamp);
      console.log('Connected wallet address:', publicKey.toBase58());
      console.log('RPC endpoint:', connection.rpcEndpoint);
      console.log('Expected chain: Solana mainnet-beta');

      try {
        const usdcMint = new PublicKey(TOKENS.USDC.mint);
        const usdtMint = new PublicKey(TOKENS.USDT.mint);

        console.log('Token mints:');
        console.log('- USDC mint:', TOKENS.USDC.mint);
        console.log('- USDT mint:', TOKENS.USDT.mint);

        const usdcATA = await getAssociatedTokenAddress(usdcMint, publicKey);
        const usdtATA = await getAssociatedTokenAddress(usdtMint, publicKey);

        console.log('Associated Token Accounts (ATAs):');
        console.log('- Expected USDC ATA:', usdcATA.toBase58());
        console.log('- Expected USDT ATA:', usdtATA.toBase58());

        let usdcBalance = 0;
        let usdtBalance = 0;

        // Fetch USDC balance using getParsedTokenAccountsByOwner for more reliability
        try {
          console.log('Fetching USDC token accounts...');
          const usdcParsed = await connection.getParsedTokenAccountsByOwner(
            publicKey,
            { mint: usdcMint }
          );
          
          console.log('USDC parsed accounts length:', usdcParsed.value.length);
          
          if (usdcParsed.value.length > 0) {
            const accountInfo = usdcParsed.value[0].account.data.parsed.info;
            const tokenAmount = accountInfo.tokenAmount;
            
            console.log('USDC account found:');
            console.log('- Token account pubkey:', usdcParsed.value[0].pubkey.toBase58());
            console.log('- Raw amount:', tokenAmount.amount);
            console.log('- Decimals:', tokenAmount.decimals);
            console.log('- UI amount:', tokenAmount.uiAmount);
            
            // Use uiAmount if available (more reliable), otherwise calculate
            usdcBalance = tokenAmount.uiAmount !== null 
              ? tokenAmount.uiAmount 
              : Number(tokenAmount.amount) / Math.pow(10, tokenAmount.decimals);
            
            console.log('USDC balance calculated:', usdcBalance);
          } else {
            console.log('No USDC token account found - user has not received USDC yet (balance: 0)');
          }
        } catch (e) {
          console.error('Error fetching USDC balance:', e);
          console.log('USDC account may not exist - balance is 0');
        }

        // Fetch USDT balance using getParsedTokenAccountsByOwner for more reliability
        try {
          console.log('Fetching USDT token accounts...');
          const usdtParsed = await connection.getParsedTokenAccountsByOwner(
            publicKey,
            { mint: usdtMint }
          );
          
          console.log('USDT parsed accounts length:', usdtParsed.value.length);
          
          if (usdtParsed.value.length > 0) {
            const accountInfo = usdtParsed.value[0].account.data.parsed.info;
            const tokenAmount = accountInfo.tokenAmount;
            
            console.log('USDT account found:');
            console.log('- Token account pubkey:', usdtParsed.value[0].pubkey.toBase58());
            console.log('- Raw amount:', tokenAmount.amount);
            console.log('- Decimals:', tokenAmount.decimals);
            console.log('- UI amount:', tokenAmount.uiAmount);
            
            // Use uiAmount if available (more reliable), otherwise calculate
            usdtBalance = tokenAmount.uiAmount !== null 
              ? tokenAmount.uiAmount 
              : Number(tokenAmount.amount) / Math.pow(10, tokenAmount.decimals);
            
            console.log('USDT balance calculated:', usdtBalance);
          } else {
            console.log('No USDT token account found - user has not received USDT yet (balance: 0)');
          }
        } catch (e) {
          console.error('Error fetching USDT balance:', e);
          console.log('USDT account may not exist - balance is 0');
        }

        // Also fetch SOL balance for sanity check
        try {
          const solBalance = await connection.getBalance(publicKey, 'confirmed');
          console.log('SOL native balance (lamports):', solBalance);
          console.log('SOL native balance (SOL):', solBalance / LAMPORTS_PER_SOL);
        } catch (e) {
          console.error('Error fetching SOL balance:', e);
        }

        console.log('Final balances - USDC:', usdcBalance, 'USDT:', usdtBalance);
        console.log('=== Balance Fetch Debug End ===');
        
        setBalances({ USDC: usdcBalance, USDT: usdtBalance });
      } catch (error) {
        console.error('Critical error fetching balances:', error);
        console.log('RPC may be rate-limited or unavailable');
        
        toast({
          title: 'Unable to fetch balances',
          description: 'Network connection issue. Retrying...',
          variant: 'destructive',
        });
      }
    };

    fetchBalances();
    const interval = setInterval(fetchBalances, 5000); // Refresh every 5 seconds for real-time updates
    return () => clearInterval(interval);
  }, [publicKey, connection, toast]);

  const calculateFee = (amt: number) => {
    return amt * (SERVICE_FEE_PERCENT / 100);
  };

  const validateAmount = (amt: number) => {
    // Amount is already in USD for stablecoins
    return amt >= MIN_TRANSFER_USD;
  };

  const initiateTransfer = () => {
    if (!publicKey) {
      toast({
        title: 'Wallet not connected',
        description: 'Please connect your wallet first.',
        variant: 'destructive',
      });
      return;
    }

    setError('');
    
    // Validate recipient address
    try {
      new PublicKey(recipient);
    } catch {
      setError('Invalid recipient wallet address');
      return;
    }

    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      setError('Invalid amount');
      return;
    }

    // Validate minimum amount
    if (!validateAmount(amountNum)) {
      setError(`Minimum transfer amount is $${MIN_TRANSFER_USD} USD`);
      return;
    }

    // Check if user has sufficient balance
    const currentBalance = balances[selectedToken];
    if (amountNum > currentBalance) {
      setError(`Insufficient ${selectedToken} balance. Your balance is $${currentBalance.toFixed(2)}, but you're trying to send $${amountNum.toFixed(2)}`);
      toast({
        title: 'Insufficient balance',
        description: `You only have $${currentBalance.toFixed(2)} ${selectedToken}. Please enter an amount within your balance.`,
        variant: 'destructive',
      });
      return;
    }

    // Show confirmation dialog
    setShowConfirmDialog(true);
  };

  const handleTransfer = async () => {
    setShowConfirmDialog(false);
    if (!publicKey || !signTransaction) {
      toast({
        title: 'Wallet not connected',
        description: 'Please connect your wallet first.',
        variant: 'destructive',
      });
      return;
    }

    setError('');
    setIsLoading(true);

    try {
      const tokenConfig = TOKENS[selectedToken];
      const fullAmount = parseFloat(amount);

      console.log('=== ATOMIC GASLESS TRANSFER START ===');
      console.log('Token:', selectedToken);
      console.log('Amount:', fullAmount);

      // Step 1: Build atomic transaction on backend
      toast({ 
        title: 'Building transaction...', 
        description: 'Creating gasless atomic transfer'
      });

      // Store transfer data for validation in submit step
      const transferData = {
        senderPublicKey: publicKey.toBase58(),
        recipientPublicKey: recipient,
        amount: fullAmount,
        mint: tokenConfig.mint,
        decimals: tokenConfig.decimals,
      };

      const buildResponse = await supabase.functions.invoke('gasless-transfer', {
        body: {
          action: 'build_atomic_tx',
          ...transferData,
        }
      });

      if (buildResponse.error) {
        throw new Error(buildResponse.error.message);
      }

      const { transaction: base64Tx, fee, amountAfterFee } = buildResponse.data;
      console.log('Atomic transaction built:', { fee, amountAfterFee });

      // Step 2: Deserialize transaction
      const binaryString = atob(base64Tx);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
      const transaction = Transaction.from(bytes);

      // Step 3: User signs the atomic transaction FIRST (Phantom requirement)
      // This follows Phantom's Lighthouse security recommendation:
      // "Phantom wallet signs first, then additional signers sign afterward using partialSign"
      toast({ 
        title: 'Sign the transaction', 
        description: 'Please approve in your wallet',
        duration: 60000
      });
      
      // User wallet signs FIRST - this is critical for Phantom Lighthouse compatibility
      const signedTx = await signTransaction(transaction);
      const serialized = signedTx.serialize({ requireAllSignatures: false, verifySignatures: false });
      const signedBase64Tx = btoa(String.fromCharCode(...serialized));

      console.log('User signed atomic transaction (first signer)');

      // Step 4: Submit to backend for final signing and submission
      // Backend will add its signature SECOND using partialSign (Phantom requirement)
      toast({ 
        title: 'Submitting transaction...', 
        description: 'Backend is adding signature and processing your gasless transfer'
      });

      const submitResponse = await supabase.functions.invoke('gasless-transfer', {
        body: {
          action: 'submit_atomic_tx',
          signedTransaction: signedBase64Tx,
          // Include validation data for backend security checks
          senderPublicKey: transferData.senderPublicKey,
          recipientPublicKey: transferData.recipientPublicKey,
          amount: transferData.amount,
          mint: transferData.mint,
        }
      });

      if (submitResponse.error) {
        throw new Error(submitResponse.error.message);
      }

      const { signature } = submitResponse.data;
      console.log('=== ATOMIC TRANSFER COMPLETE ===');
      console.log('Signature:', signature);
      console.log('View on Solscan:', `https://solscan.io/tx/${signature}`);

      toast({
        title: 'Transfer Successful!',
        description: `Sent ${amountAfterFee.toFixed(2)} ${selectedToken} (fee: ${fee.toFixed(2)} ${selectedToken})`,
      });

      // Reset form
      setRecipient('');
      setAmount('');
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

  const fee = amount ? calculateFee(parseFloat(amount) || 0) : 0;
  const amountAfterFee = amount ? (parseFloat(amount) || 0) - fee : 0;

  return (
    <Card className="glass-card w-full max-w-md border-2 border-primary/30">
      <CardHeader className="space-y-1">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xl md:text-2xl font-bold bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent">
            Legion Transfer
          </CardTitle>
          <ProcessingLogo isProcessing={isLoading} className="w-8 h-8 md:w-10 md:h-10" />
        </div>
        <CardDescription className="text-muted-foreground text-sm">
          Send tokens without having gas fees
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!publicKey && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Connect your wallet to start transferring tokens
            </AlertDescription>
          </Alert>
        )}

        {publicKey && (
          <div className="rounded-lg bg-secondary/30 p-3 space-y-2 text-sm">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <img src={usdcLogo} alt="USDC" className="w-5 h-5" />
                <span className="text-muted-foreground">USDC Balance:</span>
              </div>
              <span className="font-medium">${balances.USDC.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <img src={usdtLogo} alt="USDT" className="w-5 h-5" />
                <span className="text-muted-foreground">USDT Balance:</span>
              </div>
              <span className="font-medium">${balances.USDT.toFixed(2)}</span>
            </div>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="token">Select Token</Label>
          <Select value={selectedToken} onValueChange={(value: 'USDC' | 'USDT') => setSelectedToken(value)}>
            <SelectTrigger id="token" className="bg-secondary/50 border-border/50">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="USDC">
                <div className="flex items-center gap-2">
                  <img src={usdcLogo} alt="USDC" className="w-4 h-4" />
                  <span>USDC</span>
                </div>
              </SelectItem>
              <SelectItem value="USDT">
                <div className="flex items-center gap-2">
                  <img src={usdtLogo} alt="USDT" className="w-4 h-4" />
                  <span>USDT</span>
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="recipient">Recipient Wallet Address</Label>
          <Input
            id="recipient"
            placeholder="Enter Solana wallet address"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            disabled={!publicKey || isLoading}
            className="bg-secondary/50 border-border/50"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="amount">Amount ($)</Label>
          <Input
            id="amount"
            type="number"
            step="0.01"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={!publicKey || isLoading}
            className="bg-secondary/50 border-border/50"
          />
        </div>

        {amount && parseFloat(amount) > 0 && (
          <div className="rounded-lg bg-secondary/30 p-3 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Service Fee ({SERVICE_FEE_PERCENT}%):</span>
              <span className="font-medium">${fee.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Recipient receives:</span>
              <span className="font-semibold text-primary">${amountAfterFee.toFixed(2)} {selectedToken}</span>
            </div>
            <div className="pt-2 text-xs text-muted-foreground border-t border-border/30 mt-2">
              Gas fees paid by our backend wallet
            </div>
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
          disabled={!publicKey || isLoading || !recipient || !amount}
          className="w-full bg-gradient-to-r from-primary via-accent to-primary hover:opacity-90 transition-all hover:shadow-lg hover:shadow-primary/50 text-base md:text-lg font-semibold"
          size="lg"
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Processing...
            </>
          ) : (
            <>
              <Send className="mr-2 h-5 w-5" />
              Send Transfer
            </>
          )}
        </Button>

        <ConfirmTransferDialog
          open={showConfirmDialog}
          onOpenChange={setShowConfirmDialog}
          onConfirm={handleTransfer}
          recipient={recipient}
          amount={parseFloat(amount) || 0}
          fee={fee}
          amountAfterFee={amountAfterFee}
          tokenSymbol={selectedToken}
          isLoading={isLoading}
        />
      </CardContent>
    </Card>
  );
};
