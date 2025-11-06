import { useState, useEffect } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey, LAMPORTS_PER_SOL, Transaction } from '@solana/web3.js';
import { getAccount, getAssociatedTokenAddress, createTransferInstruction } from '@solana/spl-token';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Send, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ConfirmTransferDialog } from './ConfirmTransferDialog';
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
      setError(`Insufficient ${selectedToken} balance. You have $${currentBalance.toFixed(2)}`);
      toast({
        title: 'Insufficient balance',
        description: `You need $${amountNum.toFixed(2)} ${selectedToken} but only have $${currentBalance.toFixed(2)}`,
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);

    try {
      const fee = calculateFee(amountNum);
      const amountAfterFee = amountNum - fee;

      const tokenInfo = TOKENS[selectedToken];
      const mint = new PublicKey(tokenInfo.mint);

      // Step 1: Ensure backend has an ATA for this token
      const prepareResp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/gasless-transfer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'prepare_backend_ata', mint: tokenInfo.mint }),
      });
      const prepareData = await prepareResp.json();
      if (!prepareResp.ok) throw new Error(prepareData.error || 'Failed to prepare backend');

      const backendTokenAccount: string = prepareData.backendTokenAccount;

      // Step 2: Create token transfer transaction (user -> backend)
      const { blockhash } = await connection.getLatestBlockhash('confirmed');
      const userTokenAccount = await getAssociatedTokenAddress(mint, publicKey);
      const backendTokenAccountPubkey = new PublicKey(backendTokenAccount);

      const amountInSmallest = Math.floor(amountNum * Math.pow(10, tokenInfo.decimals));

      const tx = new Transaction({ recentBlockhash: blockhash, feePayer: publicKey });
      tx.add(
        createTransferInstruction(
          userTokenAccount,
          backendTokenAccountPubkey,
          publicKey,
          BigInt(amountInSmallest)
        )
      );

      // Step 3: User signs the transaction
      const signedTx = await signTransaction(tx);
      const serializedTx = Buffer.from(signedTx.serialize()).toString('base64');

      // Step 4: Send to backend for relay to final recipient (backend pays gas)
      const relayResponse = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/gasless-transfer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'relay_transfer_token',
          signedTransaction: serializedTx,
          recipientPublicKey: recipient,
          amountAfterFee: amountAfterFee,
          mint: tokenInfo.mint,
          decimals: tokenInfo.decimals,
        }),
      });

      const relayData = await relayResponse.json();

      if (!relayResponse.ok) {
        throw new Error(relayData.error || 'Transaction failed');
      }

      toast({
        title: 'Transfer successful!',
        description: `Sent $${amountAfterFee.toFixed(2)} ${selectedToken} to ${recipient.slice(0, 4)}...${recipient.slice(-4)}`,
      });

      // Log transaction signatures for user reference
      console.log('Transaction signatures:', relayData.signatures);
      
      if (relayData.signatures?.backendToRecipient) {
        console.log('View on Solscan:', `https://solscan.io/tx/${relayData.signatures.backendToRecipient}`);
      }

      // Reset form
      setRecipient('');
      setAmount('');
    } catch (err) {
      console.error('Transfer error:', err);
      toast({
        title: 'Transfer failed',
        description: err instanceof Error ? err.message : 'An error occurred',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const fee = amount ? calculateFee(parseFloat(amount) || 0) : 0;
  const amountAfterFee = amount ? (parseFloat(amount) || 0) - fee : 0;

  return (
    <Card className="glass-card w-full max-w-md">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
          Legion Transfer
        </CardTitle>
        <CardDescription className="text-muted-foreground">
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
          className="w-full bg-gradient-to-r from-primary to-accent hover:opacity-90 transition-opacity"
          size="lg"
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Processing...
            </>
          ) : (
            <>
              <Send className="mr-2 h-4 w-4" />
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
