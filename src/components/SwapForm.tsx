import { useEffect, useMemo, useRef, useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey, VersionedTransaction } from '@solana/web3.js';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, ArrowDown, AlertCircle, Wallet } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useTokenDiscovery, DiscoveredToken } from '@/hooks/useTokenDiscovery';
import { TokenSelectionModal } from './TokenSelectionModal';
import { SwapOutputTokenModal } from './SwapOutputTokenModal';
import { JupToken } from '@/hooks/useJupiterTokenList';
import { useAccount } from 'wagmi';
import { useCurrentAccount as useSuiAccount } from '@mysten/dapp-kit';

const MIN_SWAP_USD = 1;
const SOL_MINT = 'So11111111111111111111111111111111111111112';

interface QuoteInfo {
  inAmount: string;
  outAmount: string;
  otherAmountThreshold?: string;
  priceImpactPct?: string;
  routePlan?: any[];
  outputMint?: string;
  inputMint?: string;
  platformFee?: { amount: string; feeBps: number };
}

const fmtAmount = (raw: string | number, decimals: number) => {
  if (!raw) return '0';
  const n = Number(raw) / Math.pow(10, decimals);
  if (n >= 1) return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
  return n.toLocaleString(undefined, { maximumFractionDigits: 6 });
};

export const SwapForm = () => {
  const { connection } = useConnection();
  const { publicKey, signTransaction, connected, connect, disconnect, wallet } = useWallet();
  const suiAccount = useSuiAccount();
  const { address: evmAddress, chain: evmChain } = useAccount();
  const { toast } = useToast();

  const { discoveredTokens, isLoading: discovering } = useTokenDiscovery(
    publicKey,
    suiAccount,
    evmAddress,
    evmChain?.id,
  );

  // Only Solana tokens for input
  const solanaWalletTokens = useMemo(
    () => discoveredTokens.filter((t) => t.chain === 'solana' && t.balance > 0),
    [discoveredTokens],
  );

  const [tokenIn, setTokenIn] = useState<DiscoveredToken | null>(null);
  const [tokenOut, setTokenOut] = useState<JupToken | null>(null);
  const [amountIn, setAmountIn] = useState('');
  const [quote, setQuote] = useState<QuoteInfo | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [inputModalOpen, setInputModalOpen] = useState(false);
  const [outputModalOpen, setOutputModalOpen] = useState(false);
  const [outputDecimals, setOutputDecimals] = useState<number>(0);

  // Default input to first solana token user holds
  useEffect(() => {
    if (!tokenIn && solanaWalletTokens.length > 0) {
      // Prefer a stablecoin or SOL if present
      const preferred =
        solanaWalletTokens.find((t) => t.symbol === 'USDC') ||
        solanaWalletTokens.find((t) => t.symbol === 'SOL') ||
        solanaWalletTokens[0];
      setTokenIn(preferred);
    }
  }, [solanaWalletTokens, tokenIn]);

  const inputUsdPrice = tokenIn && tokenIn.balance > 0 ? tokenIn.usdValue / tokenIn.balance : 0;
  const amountInNum = parseFloat(amountIn) || 0;
  const inputUsdValue = amountInNum * inputUsdPrice;

  // Debounced quote
  const quoteSeq = useRef(0);
  useEffect(() => {
    if (!tokenIn || !tokenOut || !amountInNum || amountInNum <= 0) {
      setQuote(null);
      return;
    }
    if (tokenIn.address === tokenOut.address) {
      setQuote(null);
      return;
    }
    const seq = ++quoteSeq.current;
    const handle = setTimeout(async () => {
      setQuoting(true);
      setError('');
      try {
        const amountSmallest = Math.floor(amountInNum * Math.pow(10, tokenIn.decimals));
        if (amountSmallest <= 0) {
          setQuote(null);
          return;
        }
        const { data, error: invokeErr } = await supabase.functions.invoke('jupiter-swap', {
          body: {
            action: 'quote',
            inputMint: tokenIn.address,
            outputMint: tokenOut.address,
            amount: amountSmallest,
            slippageBps: 50,
          },
        });
        if (seq !== quoteSeq.current) return;
        if (invokeErr) throw new Error(invokeErr.message || 'Quote failed');
        if (data?.error) throw new Error(String(data.error));
        const q: QuoteInfo = data?.quote;
        if (!q) throw new Error('No route found');
        setQuote(q);
      } catch (e: any) {
        if (seq !== quoteSeq.current) return;
        setQuote(null);
        setError(e?.message?.includes('No route') ? 'No route available for this pair.' : 'Could not fetch quote. Try again.');
      } finally {
        if (seq === quoteSeq.current) setQuoting(false);
      }
    }, 400);
    return () => clearTimeout(handle);
  }, [tokenIn, tokenOut, amountInNum]);

  // Refresh quote every 10s while form is valid
  useEffect(() => {
    if (!tokenIn || !tokenOut || !amountInNum) return;
    const id = setInterval(() => {
      // Trigger re-quote by nudging seq via state update isn't ideal; just call directly
      quoteSeq.current++;
      // Reuse effect: bump a dummy by setting same values — simplest: setAmountIn(amountIn)
      // Instead, do a direct fetch:
      (async () => {
        try {
          const amountSmallest = Math.floor(amountInNum * Math.pow(10, tokenIn.decimals));
          const { data } = await supabase.functions.invoke('jupiter-swap', {
            body: {
              action: 'quote',
              inputMint: tokenIn.address,
              outputMint: tokenOut.address,
              amount: amountSmallest,
              slippageBps: 50,
            },
          });
          if (data?.quote) setQuote(data.quote);
        } catch {}
      })();
    }, 10000);
    return () => clearInterval(id);
  }, [tokenIn, tokenOut, amountInNum]);

  // Resolve output token decimals when picked
  useEffect(() => {
    if (!tokenOut) {
      setOutputDecimals(0);
      return;
    }
    if (tokenOut.decimals > 0) {
      setOutputDecimals(tokenOut.decimals);
      return;
    }
    // unknown - fetch from chain
    (async () => {
      try {
        const info = await connection.getParsedAccountInfo(new PublicKey(tokenOut.address));
        const parsed: any = info.value?.data;
        const dec = parsed?.parsed?.info?.decimals;
        if (typeof dec === 'number') setOutputDecimals(dec);
      } catch (e) {
        console.warn('Failed to resolve output token decimals', e);
      }
    })();
  }, [tokenOut, connection]);

  const insufficient = tokenIn && amountInNum > tokenIn.balance + 1e-9;
  const samePair = tokenIn && tokenOut && tokenIn.address === tokenOut.address;
  const belowMin = inputUsdValue > 0 && inputUsdValue < MIN_SWAP_USD;

  const canSwap =
    connected &&
    !!tokenIn &&
    !!tokenOut &&
    !!quote &&
    !quoting &&
    !submitting &&
    !insufficient &&
    !samePair &&
    !belowMin &&
    amountInNum > 0;

  const handleMax = () => {
    if (tokenIn) setAmountIn(String(tokenIn.balance));
  };

  const handleSubmit = async () => {
    if (!tokenIn || !tokenOut || !quote || !publicKey || !signTransaction) return;
    setSubmitting(true);
    setError('');
    try {
      // Build tx via edge function (backend overrides fee payer + partial-signs)
      toast({ title: 'Preparing swap…', description: 'Routing via Jupiter' });
      const { data, error: invokeErr } = await supabase.functions.invoke('jupiter-swap', {
        body: {
          action: 'build',
          quoteResponse: quote,
          userPublicKey: publicKey.toBase58(),
        },
      });
      if (invokeErr) throw new Error(invokeErr.message || 'Failed to build swap');
      if (data?.error) throw new Error(String(data.error));
      const b64 = data?.swapTransaction;
      if (!b64) throw new Error('No transaction returned');

      const txBytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const tx = VersionedTransaction.deserialize(txBytes);

      toast({ title: 'Approve in your wallet' });
      // Reconnect if needed (mirrors transfer form auto-recovery)
      if (!connected && wallet) {
        try { await connect(); } catch {}
      }
      let signed: VersionedTransaction;
      try {
        signed = await signTransaction(tx);
      } catch (e: any) {
        const msg = e?.message || '';
        if (/rejected/i.test(msg) || e?.code === 4001) throw new Error('Swap was rejected in your wallet.');
        if (e?.code === 4100 || /unauthorized|not been authorized/i.test(msg)) {
          try { await disconnect(); } catch {}
          await new Promise((r) => setTimeout(r, 200));
          await connect();
          signed = await signTransaction(tx);
        } else {
          throw e;
        }
      }

      const sig = await connection.sendRawTransaction(signed.serialize(), {
        skipPreflight: false,
        maxRetries: 3,
      });
      toast({ title: 'Swap submitted', description: 'Confirming on-chain…' });

      const conf = await connection.confirmTransaction(sig, 'confirmed');
      if (conf.value.err) throw new Error('Transaction failed on-chain');

      toast({
        title: 'Swap complete 🎉',
        description: `Received ~${fmtAmount(quote.outAmount, outputDecimals || tokenOut.decimals || 6)} ${tokenOut.symbol}`,
      });
      setAmountIn('');
      setQuote(null);
    } catch (e: any) {
      console.error('Swap error:', e);
      const raw = e?.message || 'Swap failed';
      // Sanitize technical errors
      const friendly = /rejected/i.test(raw)
        ? raw
        : /insufficient/i.test(raw)
        ? 'Insufficient balance for this swap.'
        : 'Swap failed. Please try again.';
      setError(friendly);
      toast({ title: 'Swap failed', description: friendly, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  if (!connected) {
    return (
      <Card className="w-full max-w-md surface-card">
        <CardHeader>
          <CardTitle className="text-lg">Swap</CardTitle>
          <CardDescription>Connect your Solana wallet to start swapping.</CardDescription>
        </CardHeader>
        <CardContent>
          <Alert>
            <Wallet className="h-4 w-4" />
            <AlertDescription>Use the Connect button at the top right.</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  const outDec = outputDecimals || tokenOut?.decimals || 6;
  const estOut = quote ? fmtAmount(quote.outAmount, outDec) : '0';
  const priceImpact = quote?.priceImpactPct ? `${(Number(quote.priceImpactPct) * 100).toFixed(2)}%` : '—';

  return (
    <Card className="w-full max-w-md surface-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Swap</CardTitle>
        <CardDescription>Gasless Solana swap powered by Legion.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Token In */}
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
          <div className="flex items-center justify-between mb-2">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">You pay</Label>
            {tokenIn && (
              <button
                onClick={handleMax}
                className="text-[11px] text-primary hover:underline"
              >
                Balance: {tokenIn.balance.toLocaleString(undefined, { maximumFractionDigits: 6 })} · MAX
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setInputModalOpen(true)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-secondary/60 hover:bg-secondary border border-white/[0.06] min-w-[120px]"
            >
              {tokenIn?.logoUrl ? (
                <img src={tokenIn.logoUrl} className="w-6 h-6 rounded-full" alt={tokenIn.symbol} />
              ) : (
                <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-bold">
                  {tokenIn?.symbol?.slice(0, 2) || '?'}
                </div>
              )}
              <span className="text-sm font-medium">{tokenIn?.symbol || 'Select'}</span>
            </button>
            <Input
              type="number"
              inputMode="decimal"
              placeholder="0.0"
              value={amountIn}
              onChange={(e) => setAmountIn(e.target.value)}
              className="flex-1 text-right bg-transparent border-0 text-lg focus-visible:ring-0"
            />
          </div>
          <div className="text-right text-[11px] text-muted-foreground mt-1">
            {inputUsdValue > 0 ? `~$${inputUsdValue.toFixed(2)}` : '\u00A0'}
          </div>
        </div>

        <div className="flex justify-center -my-2">
          <div className="w-8 h-8 rounded-full bg-secondary/80 border border-white/[0.06] flex items-center justify-center">
            <ArrowDown className="w-4 h-4 text-muted-foreground" />
          </div>
        </div>

        {/* Token Out */}
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">You receive (after 1.5% fee)</Label>
          <div className="flex items-center gap-2 mt-2">
            <button
              type="button"
              onClick={() => setOutputModalOpen(true)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-secondary/60 hover:bg-secondary border border-white/[0.06] min-w-[120px]"
            >
              {tokenOut?.logoURI ? (
                <img src={tokenOut.logoURI} className="w-6 h-6 rounded-full" alt={tokenOut.symbol} />
              ) : (
                <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-bold">
                  {tokenOut?.symbol?.slice(0, 2) || '?'}
                </div>
              )}
              <span className="text-sm font-medium">{tokenOut?.symbol || 'Select'}</span>
            </button>
            <div className="flex-1 text-right text-lg text-foreground">
              {quoting ? <Loader2 className="inline w-4 h-4 animate-spin text-muted-foreground" /> : estOut}
            </div>
          </div>
          <div className="text-right text-[11px] text-muted-foreground mt-1">
            {quote ? `Price impact ${priceImpact}` : '\u00A0'}
          </div>
        </div>

        {/* Inline messages */}
        {samePair && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>Input and output token must differ.</AlertDescription>
          </Alert>
        )}
        {belowMin && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>Minimum swap is $1</AlertDescription>
          </Alert>
        )}
        {insufficient && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>Insufficient {tokenIn?.symbol} balance.</AlertDescription>
          </Alert>
        )}
        {error && !belowMin && !insufficient && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Button
          onClick={handleSubmit}
          disabled={!canSwap}
          className="w-full h-11"
        >
          {submitting ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Swapping…
            </>
          ) : !tokenOut ? (
            'Select a token to receive'
          ) : belowMin ? (
            'Minimum swap is $1'
          ) : (
            `Swap ${tokenIn?.symbol || ''} → ${tokenOut?.symbol || ''}`
          )}
        </Button>

        <p className="text-[11px] text-muted-foreground text-center">
          1.5% platform fee on output
        </p>
      </CardContent>

      <TokenSelectionModal
        open={inputModalOpen}
        onClose={() => setInputModalOpen(false)}
        tokens={solanaWalletTokens}
        onSelectToken={(t) => setTokenIn(t)}
      />
      <SwapOutputTokenModal
        open={outputModalOpen}
        onClose={() => setOutputModalOpen(false)}
        onSelect={(t) => setTokenOut(t)}
        excludeMint={tokenIn?.address}
        walletTokens={discoveredTokens}
      />
    </Card>
  );
};
