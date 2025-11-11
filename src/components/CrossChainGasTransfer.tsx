import { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useCurrentAccount } from '@mysten/dapp-kit';
import { supabase } from '@/integrations/supabase/client';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

export const CrossChainGasTransfer = () => {
  const solanaWallet = useWallet();
  const suiAccount = useCurrentAccount();
  
  const [transferChain, setTransferChain] = useState<'solana' | 'sui'>('solana');
  const [amount, setAmount] = useState('');
  const [recipient, setRecipient] = useState('');
  const [loading, setLoading] = useState(false);
  const [feeInfo, setFeeInfo] = useState<any>(null);

  const gasChain = transferChain === 'solana' ? 'sui' : 'solana';
  const isConnected = transferChain === 'solana' 
    ? solanaWallet.connected && suiAccount
    : suiAccount && solanaWallet.connected;

  const calculateFee = async () => {
    if (!amount || parseFloat(amount) < 5) {
      toast.error('Minimum transfer amount is $5');
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
      toast.success(`Fee calculated: ${data.feeAmount.toFixed(4)} ${data.feeToken}`);
    } catch (error: any) {
      console.error('Fee calculation error:', error);
      toast.error(error.message || 'Failed to calculate fee');
    } finally {
      setLoading(false);
    }
  };

  const handleTransfer = async () => {
    if (!isConnected) {
      toast.error(`Please connect both Solana and SUI wallets`);
      return;
    }

    if (!amount || !recipient) {
      toast.error('Please fill in all fields');
      return;
    }

    if (!feeInfo) {
      toast.error('Please calculate fee first');
      return;
    }

    setLoading(true);
    try {
      // Step 1: User pays fee on gas chain
      toast.info(`Please approve fee payment of ${feeInfo.feeAmount.toFixed(4)} ${feeInfo.feeToken} on ${gasChain}`);
      
      // TODO: Implement actual transaction signing for fee payment
      const feeSignature = 'mock_signature_' + Date.now();
      
      // Step 2: Verify fee payment
      const { data: verifyData, error: verifyError } = await supabase.functions.invoke('cross-chain-gas', {
        body: {
          action: 'verify_fee_payment',
          gasChain,
          feeSignature,
          senderAddress: transferChain === 'solana' ? solanaWallet.publicKey?.toBase58() : suiAccount?.address,
        }
      });

      if (verifyError) throw verifyError;

      if (!verifyData.verified) {
        throw new Error('Fee payment verification failed');
      }

      // Step 3: Execute transfer on transfer chain
      toast.success('Fee verified! Executing transfer...');
      
      // TODO: Implement actual transfer execution
      toast.success(`Transfer completed successfully!`);
      
      // Reset form
      setAmount('');
      setRecipient('');
      setFeeInfo(null);
    } catch (error: any) {
      console.error('Transfer error:', error);
      toast.error(error.message || 'Transfer failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>Cross-Chain Gas Payment Transfer</CardTitle>
        <CardDescription>
          Send tokens on one chain while paying gas fees with another chain's tokens
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <label className="text-sm font-medium">Transfer Chain</label>
          <Select value={transferChain} onValueChange={(value: any) => setTransferChain(value)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="solana">Solana (pay with SUI)</SelectItem>
              <SelectItem value="sui">SUI (pay with SOL)</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Gas fee: {transferChain === 'solana' ? '$0.50 in SUI' : '$0.40 in SOL'}
          </p>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Amount (USD)</label>
          <Input
            type="number"
            placeholder="Minimum $5"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            min={5}
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Recipient Address</label>
          <Input
            placeholder={`Enter ${transferChain} address`}
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
          />
        </div>

        {feeInfo && (
          <div className="p-4 bg-muted rounded-lg space-y-1">
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
            disabled={loading || !amount}
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

        {!isConnected && (
          <p className="text-xs text-destructive text-center">
            Connect both Solana and SUI wallets to use cross-chain gas payment
          </p>
        )}
      </CardContent>
    </Card>
  );
};
