import { useEffect, useMemo, useRef, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Transaction } from "@solana/web3.js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, ChevronDown, Wallet, ArrowRight, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useTokenDiscovery } from "@/hooks/useTokenDiscovery";
import { usePajProfile } from "@/hooks/usePajProfile";
import { PajBankAccountModal } from "@/components/PajBankAccountModal";
import usdgLogoAsset from "@/assets/usdg-logo.jpg.asset.json";


// Tokens explicitly listed in the spec, in display order.
const SUPPORTED = [
  { symbol: "USDC", mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", decimals: 6, logo: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png" },
  { symbol: "USDT", mint: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", decimals: 6, logo: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB/logo.svg" },
  { symbol: "JUP",  mint: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN", decimals: 6, logo: "https://static.jup.ag/jup/icon.png" },
  { symbol: "BONK", mint: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263", decimals: 5, logo: "https://arweave.net/hQiPZOsRZXGXBJd_82PhVdlM_hACsT_q6wqwf5cSY7I" },
  { symbol: "USDG", mint: "2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo", decimals: 6, logo: usdgLogoAsset.url },
  { symbol: "SOL",  mint: "So11111111111111111111111111111111111111112", decimals: 9, logo: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png" },
];


const MIN_USD = 1;
const MAX_USD = 5000;
const FLAT_FEE_USD = 0.30;

export const PajOfframpForm = () => {
  const { toast } = useToast();
  const { connection } = useConnection();
  const {
    publicKey, signTransaction, connected, connect, disconnect, wallet,
  } = useWallet();

  const walletAddress = publicKey?.toBase58() ?? null;
  const { profile, reload } = usePajProfile(walletAddress);
  const { discoveredTokens: tokens } = useTokenDiscovery(publicKey, null, null, 'solana' as any);

  const [selectedMint, setSelectedMint] = useState(SUPPORTED[0].mint);
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<"USD" | "NGN">("USD");
  const [flow, setFlow] = useState<"saved" | "new_wallet">("saved");
  const [bankModalOpen, setBankModalOpen] = useState(false);

  const [rate, setRate] = useState<number | null>(null);
  const [rateLoading, setRateLoading] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [activeOrder, setActiveOrder] = useState<any>(null);
  const [orderStatus, setOrderStatus] = useState<string | null>(null);

  // If a saved profile exists, default to "saved" flow
  useEffect(() => {
    if (profile) setFlow("saved");
  }, [profile?.id]);

  // Build a balance/price map for the supported tokens from discovery
  const supportedWithBalance = useMemo(() => {
    return SUPPORTED.map((s) => {
      const d = tokens.find(
        (t) => (t.address === s.mint) || (s.symbol === "SOL" && t.isNative && t.chain === "solana"),
      );
      return {
        ...s,
        balance: d?.balance ?? 0,
        price: d ? (d.balance > 0 ? d.usdValue / d.balance : 0) : 0,
        logoUrl: d?.logoUrl || s.logo,
        usdBalance: d?.usdValue ?? 0,
      };

    });
  }, [tokens]);

  const selected = supportedWithBalance.find((t) => t.mint === selectedMint) ?? supportedWithBalance[0];

  const amountNum = parseFloat(amount) || 0;
  // Amount is entered in either USD or NGN. Convert to USD canonical.
  const usdValue = currency === "USD"
    ? amountNum
    : (rate && rate > 0 ? amountNum / rate : 0);
  const tokenAmount = selected?.price ? usdValue / selected.price : 0;
  const netUsd = Math.max(0, usdValue - FLAT_FEE_USD - 0.02);
  const ngnEstimate = rate ? netUsd * rate : null;
  const grossNgn = rate ? usdValue * rate : null;

  // Live NGN rate — fetch on amount change (USD-equivalent)
  const rateAbortRef = useRef<number>(0);
  useEffect(() => {
    const queryUsd = currency === "USD" ? amountNum : Math.max(1, Math.round((amountNum || 1) / 1500));
    if (!queryUsd) { return; }
    const id = ++rateAbortRef.current;
    setRateLoading(true);
    supabase.functions
      .invoke("paj-cash", { body: { action: "get_rate", amount: Math.max(1, Math.round(queryUsd)) } })
      .then(({ data }) => {
        if (id !== rateAbortRef.current) return;
        const r = (data as any)?.rate;
        const numeric = typeof r === "number" ? r : (r?.rate ?? r?.value ?? null);
        setRate(typeof numeric === "number" ? numeric : null);
      })
      .catch(() => {})
      .finally(() => { if (id === rateAbortRef.current) setRateLoading(false); });
  }, [amountNum, currency]);

  // Poll order status while pending
  useEffect(() => {
    if (!activeOrder?.id) return;
    let cancelled = false;
    const tick = async () => {
      const { data } = await supabase
        .from("paj_orders" as any)
        .select("status")
        .eq("id", activeOrder.id)
        .maybeSingle();
      if (cancelled) return;
      const status = (data as any)?.status;
      if (status && status !== orderStatus) setOrderStatus(status);
      if (status === "COMPLETED" || status === "FAILED") return;
      setTimeout(tick, 4000);
    };
    tick();
    return () => { cancelled = true; };
  }, [activeOrder?.id]);

  const validation = (() => {
    if (!publicKey) return "Connect your Solana wallet";
    if (!selected) return "Select a token";
    if (!amountNum) return "Enter an amount";
    if (currency === "NGN" && !rate) return "Fetching rate…";
    if (usdValue < MIN_USD) return `Minimum is $${MIN_USD.toFixed(2)}`;
    if (usdValue > MAX_USD) return `Maximum is $${MAX_USD.toFixed(0)}`;
    if (tokenAmount > (selected.balance || 0)) return "Insufficient balance";
    if (!profile) return "Add bank details first";
    return null;
  })();

  const handlePajIt = async () => {
    if (validation || !publicKey || !signTransaction || !selected) return;
    setSubmitting(true);
    setOrderStatus("Creating order…");
    try {
      if (!profile) throw new Error("Add bank details first.");

      // 1) Create Paj order — returns deposit address.
      const create = await supabase.functions.invoke("paj-cash", {
        body: {
          action: "create_order",
          walletAddress: publicKey.toBase58(),
          flow: "saved",
          mint: selected.mint,
          tokenSymbol: selected.symbol,
          decimals: selected.decimals,
          amountToken: tokenAmount,
          tokenPriceUsd: selected.price,
          bankId: profile?.bank_id,
          bankName: profile?.bank_name,
          accountNumber: profile?.bank_account_number,
          accountName: profile?.bank_account_name,
          pajWalletAddress: profile?.paj_wallet_address,
        },
      });
      if (create.error) throw new Error(create.error.message);
      if ((create.data as any)?.error) throw new Error((create.data as any).error);
      const order = (create.data as any).order;
      setActiveOrder(order);
      setOrderStatus("INIT");

      // 2) Build gasless atomic tx via existing gasless-transfer endpoint
      toast({ title: "Building transaction…" });
      const build = await supabase.functions.invoke("gasless-transfer", {
        body: {
          action: "build_atomic_tx",
          chain: "solana",
          senderPublicKey: publicKey.toBase58(),
          recipientPublicKey: order.depositAddress,
          amountUSD: order.amountUsd,
          tokenAmount: order.amountToken,
          mint: selected.mint,
          decimals: selected.decimals,
          gasToken: selected.symbol,
          tokenSymbol: selected.symbol,
        },
      });
      if (build.error) throw new Error(build.error.message);
      const { transaction: base64Tx, amounts } = (build.data as any);
      const bytes = Uint8Array.from(atob(base64Tx), (c) => c.charCodeAt(0));
      const tx = Transaction.from(bytes);

      // 3) User signs
      toast({ title: "Approve in your wallet" });
      if (!connected && wallet) { try { await connect(); } catch {} }
      let signed: Transaction;
      try { signed = await signTransaction(tx); }
      catch (e: any) {
        const code = e?.code ?? e?.error?.code;
        if (code === 4001) throw new Error("Transaction was rejected in your wallet.");
        if (code === 4100) {
          try { await disconnect(); } catch {}
          await new Promise(r => setTimeout(r, 200));
          await connect();
          signed = await signTransaction(tx);
        } else throw e;
      }

      // 4) Submit
      const submit = await supabase.functions.invoke("gasless-transfer", {
        body: {
          action: "submit_atomic_tx",
          chain: "solana",
          signedTransaction: btoa(String.fromCharCode(...signed.serialize({ requireAllSignatures: false, verifySignatures: false }))),
          senderPublicKey: publicKey.toBase58(),
          recipientPublicKey: order.depositAddress,
          amountUSD: order.amountUsd,
          tokenAmount: order.amountToken,
          transferAmountSmallest: amounts?.transferToRecipient,
          mint: selected.mint,
          decimals: selected.decimals,
          gasToken: selected.symbol,
          tokenSymbol: selected.symbol,
        },
      });
      if (submit.error) throw new Error(submit.error.message);
      const sig = (submit.data as any)?.signature;

      await supabase.functions.invoke("paj-cash", {
        body: { action: "record_tx", orderId: order.id, signature: sig },
      });

      setOrderStatus("PAID");
      toast({
        title: "Paj it sent!",
        description: `~ ₦${ngnEstimate ? ngnEstimate.toLocaleString("en-NG", { maximumFractionDigits: 0 }) : "—"} settling to your bank.`,
      });
      setAmount("");
    } catch (err: any) {
      setOrderStatus(null);
      toast({ title: "Paj failed", description: err?.message ?? String(err), variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="surface-card backdrop-blur-xl bg-white/[0.03] border-white/10 p-5 md:p-6 rounded-2xl shadow-2xl">
      {/* Wallet indicator */}
      <div className="flex items-center justify-end mb-4">
        <div className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
          <Wallet className="w-3 h-3" /> {walletAddress ? `${walletAddress.slice(0,4)}…${walletAddress.slice(-4)}` : "Not connected"}
        </div>
      </div>



      {/* Token selector + amount */}
      <div className="space-y-3">
        <div>
          <label className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Select token to Paj</label>
          <Select value={selectedMint} onValueChange={setSelectedMint}>
            <SelectTrigger className="mt-1 bg-white/5 border-white/10 h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {supportedWithBalance.map((t) => (
                <SelectItem key={t.mint} value={t.mint}>
                  <span className="inline-flex items-center gap-2">
                    {t.logoUrl && <img src={t.logoUrl} alt="" className="w-4 h-4 rounded-full" />}
                    <span className="font-medium">{t.symbol}</span>
                    <span className="text-xs text-muted-foreground">${t.usdBalance.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <label className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Amount</label>
            <div className="inline-flex rounded-md bg-white/5 border border-white/10 p-0.5 text-[11px]">
              <button
                type="button"
                onClick={() => setCurrency("USD")}
                className={`px-2 py-0.5 rounded ${currency === "USD" ? "bg-primary/30 text-white" : "text-muted-foreground"}`}
              >USD</button>
              <button
                type="button"
                onClick={() => setCurrency("NGN")}
                className={`px-2 py-0.5 rounded ${currency === "NGN" ? "bg-primary/30 text-white" : "text-muted-foreground"}`}
              >NGN</button>
            </div>
          </div>
          <div className="relative mt-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
              {currency === "USD" ? "$" : "₦"}
            </span>
            <Input
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
              placeholder="0.00"
              inputMode="decimal"
              className="bg-white/5 border-white/10 h-11 pl-7 pr-20 text-base"
            />
            <button
              type="button"
              onClick={() => {
                if (!selected) return;
                const usd = selected.usdBalance;
                setAmount(String(currency === "USD" ? usd.toFixed(2) : Math.floor((rate ?? 0) * usd)));
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] px-2 py-1 rounded bg-white/10 hover:bg-white/20"
            >
              MAX
            </button>
          </div>
          <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
            <span>
              {currency === "USD"
                ? (rateLoading ? "Fetching rate…" : grossNgn ? `≈ ₦${grossNgn.toLocaleString("en-NG", { maximumFractionDigits: 0 })}` : "")
                : `≈ $${usdValue.toFixed(2)}`}
            </span>
            <span>≈ {tokenAmount.toFixed(selected?.decimals && selected.decimals < 6 ? 2 : 4)} {selected?.symbol}</span>
          </div>
        </div>

        {/* Destination — Send Cash */}
        <div>
          <label className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Send Cash</label>
          {!profile ? (
            <button
              onClick={() => setBankModalOpen(true)}
              disabled={!walletAddress}
              className="mt-1 w-full inline-flex items-center justify-center gap-1 text-xs px-3 py-3 rounded-lg border border-primary/40 bg-primary/10 hover:bg-primary/15"
            >
              <Plus className="w-3 h-3" /> Enter bank details
            </button>
          ) : (
            <div className="mt-1 rounded-lg border border-white/10 bg-white/[0.02] p-3 text-xs">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold">{profile.bank_account_name}</div>
                  <div className="text-muted-foreground">{profile.bank_name} • {profile.bank_account_number}</div>
                </div>
                <button onClick={() => setBankModalOpen(true)} className="underline text-[11px]">Edit</button>
              </div>
            </div>
          )}
        </div>

        {/* Summary — what you'll receive */}
        <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3 text-xs space-y-1">
          <div className="flex justify-between"><span className="text-muted-foreground">Flat fee</span><span>${FLAT_FEE_USD.toFixed(2)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Network gas</span><span className="text-emerald-400">Sponsored</span></div>
          {rate && <div className="flex justify-between"><span className="text-muted-foreground">NGN rate</span><span>₦{rate.toLocaleString()}/$</span></div>}
          <div className="pt-2 mt-1 border-t border-white/10 flex justify-between items-baseline">
            <span className="text-muted-foreground">You receive</span>
            <span className="text-base font-bold" style={{ color: "#1E5BFF" }}>
              {ngnEstimate ? `₦${ngnEstimate.toLocaleString("en-NG", { maximumFractionDigits: 0 })}` : "—"}
            </span>
          </div>
        </div>

        <Button
          onClick={handlePajIt}
          disabled={!!validation || submitting}
          className="w-full h-11 bg-gradient-to-r from-primary to-accent hover:opacity-90"
        >
          {submitting ? (
            <span className="inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> {orderStatus ?? "Pajing…"}</span>
          ) : validation ? validation : (
            <span className="inline-flex items-center gap-2">Paj It <ArrowRight className="w-4 h-4" /></span>
          )}
        </Button>

        {activeOrder && orderStatus && !submitting && (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs">
            <div className="font-semibold text-emerald-300">Order {orderStatus}</div>
            <div className="text-muted-foreground mt-0.5">
              ${activeOrder.amountUsd?.toFixed(2)} → ₦{activeOrder.fiatAmount?.toLocaleString("en-NG", { maximumFractionDigits: 0 })}
            </div>
          </div>
        )}
      </div>

      {walletAddress && (
        <PajBankAccountModal
          open={bankModalOpen}
          onClose={() => setBankModalOpen(false)}
          walletAddress={walletAddress}
          defaultPajWallet={profile?.paj_wallet_address}
          onSaved={() => reload()}
        />
      )}
    </div>
  );
};
