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

// Tokens explicitly listed in the spec, in display order.
const SUPPORTED = [
  { symbol: "USDC", mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", decimals: 6, logo: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png" },
  { symbol: "USDT", mint: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", decimals: 6, logo: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB/logo.svg" },
  { symbol: "JUP",  mint: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN", decimals: 6, logo: "https://static.jup.ag/jup/icon.png" },
  { symbol: "BONK", mint: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263", decimals: 5, logo: "https://arweave.net/hQiPZOsRZXGXBJd_82PhVdlM_hACsT_q6wqwf5cSY7I" },
  { symbol: "USDG", mint: "2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo", decimals: 6, logo: "https://assets.coingecko.com/coins/images/51281/standard/Global_Dollar.png" },
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
  const [flow, setFlow] = useState<"saved" | "new_wallet">("saved");
  const [destWallet, setDestWallet] = useState("");
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
  const usdValue = amountNum * (selected?.price ?? 0);
  const netUsd = Math.max(0, usdValue - FLAT_FEE_USD - 0.02);
  const ngnEstimate = rate ? netUsd * rate : null;

  // Live NGN rate
  const rateAbortRef = useRef<number>(0);
  useEffect(() => {
    if (!usdValue) { setRate(null); return; }
    const id = ++rateAbortRef.current;
    setRateLoading(true);
    supabase.functions
      .invoke("paj-cash", { body: { action: "get_rate", amount: Math.max(1, Math.round(usdValue)) } })
      .then(({ data }) => {
        if (id !== rateAbortRef.current) return;
        const r = (data as any)?.rate;
        // Paj returns either { rate: number } or numeric — be defensive
        const numeric = typeof r === "number" ? r : (r?.rate ?? r?.value ?? null);
        setRate(typeof numeric === "number" ? numeric : null);
      })
      .catch(() => {})
      .finally(() => { if (id === rateAbortRef.current) setRateLoading(false); });
  }, [usdValue]);

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
    if (usdValue < MIN_USD) return `Minimum is $${MIN_USD.toFixed(2)}`;
    if (usdValue > MAX_USD) return `Maximum is $${MAX_USD.toFixed(0)}`;
    if (amountNum > (selected.balance || 0)) return "Insufficient balance";
    if (flow === "saved" && !profile) return "Add a Paj account first";
    if (flow === "new_wallet" && destWallet.trim().length < 32) return "Enter destination wallet";
    return null;
  })();

  const handlePajIt = async () => {
    if (validation || !publicKey || !signTransaction || !selected) return;
    setSubmitting(true);
    setOrderStatus("Creating order…");
    try {
      // Path B: for new wallet flow, we still need bank info — prompt to add via modal.
      // For v1 we reuse profile bank details as the destination bank for Path B (typical flow:
      // user is sending to another Paj user that they've configured locally).
      if (flow === "new_wallet" && !profile) {
        throw new Error("Set up a Paj profile first so we know which bank to send to.");
      }

      // 1) Create Paj order — returns deposit address.
      const create = await supabase.functions.invoke("paj-cash", {
        body: {
          action: "create_order",
          walletAddress: publicKey.toBase58(),
          flow,
          mint: selected.mint,
          tokenSymbol: selected.symbol,
          decimals: selected.decimals,
          amountToken: amountNum,
          tokenPriceUsd: selected.price,
          // Path B uses the profile's bank (so funds settle to the user's known bank)
          bankId: profile?.bank_id,
          bankName: profile?.bank_name,
          accountNumber: profile?.bank_account_number,
          accountName: profile?.bank_account_name,
          pajWalletAddress: flow === "saved" ? profile?.paj_wallet_address : destWallet.trim(),
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

      // 5) Record signature on the Paj order
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
                    <span className="text-xs text-muted-foreground">bal {t.balance.toLocaleString(undefined, { maximumFractionDigits: 4 })}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Amount</label>
          <div className="relative mt-1">
            <Input
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
              placeholder="0.00"
              inputMode="decimal"
              className="bg-white/5 border-white/10 h-11 pr-20 text-base"
            />
            <button
              type="button"
              onClick={() => selected && setAmount(String(selected.balance))}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] px-2 py-1 rounded bg-white/10 hover:bg-white/20"
            >
              MAX
            </button>
          </div>
          <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
            <span>≈ ${usdValue.toFixed(2)}</span>
            <span>
              {rateLoading ? "Fetching rate…" : ngnEstimate ? `≈ ₦${ngnEstimate.toLocaleString("en-NG", { maximumFractionDigits: 0 })}` : ""}
            </span>
          </div>
        </div>

        {/* Destination */}
        <div>
          <label className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Destination</label>
          <div className="mt-1 grid grid-cols-2 gap-2">
            <button
              onClick={() => setFlow("saved")}
              className={`rounded-lg border px-3 py-2 text-xs text-left ${
                flow === "saved" ? "border-primary/60 bg-primary/10" : "border-white/10 bg-white/[0.02]"
              }`}
            >
              <div className="font-semibold">Saved Paj wallet</div>
              <div className="text-muted-foreground truncate">
                {profile?.paj_wallet_address
                  ? `${profile.paj_wallet_address.slice(0,4)}…${profile.paj_wallet_address.slice(-4)}`
                  : "Not set"}
              </div>
            </button>
            <button
              onClick={() => setFlow("new_wallet")}
              className={`rounded-lg border px-3 py-2 text-xs text-left ${
                flow === "new_wallet" ? "border-primary/60 bg-primary/10" : "border-white/10 bg-white/[0.02]"
              }`}
            >
              <div className="font-semibold">Different wallet</div>
              <div className="text-muted-foreground">Paste address</div>
            </button>
          </div>
          {flow === "new_wallet" && (
            <Input
              value={destWallet}
              onChange={(e) => setDestWallet(e.target.value)}
              placeholder="Recipient Solana wallet"
              className="mt-2 bg-white/5 border-white/10 font-mono text-xs"
            />
          )}
          {flow === "saved" && !profile && (
            <button
              onClick={() => setBankModalOpen(true)}
              disabled={!walletAddress}
              className="mt-2 w-full inline-flex items-center justify-center gap-1 text-xs px-3 py-2 rounded-lg border border-primary/40 bg-primary/10 hover:bg-primary/15"
            >
              <Plus className="w-3 h-3" /> Add Paj account (bank + wallet)
            </button>
          )}
          {profile && (
            <div className="mt-2 text-[11px] text-muted-foreground flex items-center justify-between">
              <span>{profile.bank_name} • {profile.bank_account_name}</span>
              <button onClick={() => setBankModalOpen(true)} className="underline">Edit</button>
            </div>
          )}
        </div>

        {/* Summary */}
        <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3 text-xs space-y-1">
          <div className="flex justify-between"><span className="text-muted-foreground">Flat fee</span><span>${FLAT_FEE_USD.toFixed(2)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Network gas</span><span className="text-emerald-400">Sponsored</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Net to bank</span><span>${netUsd.toFixed(2)}</span></div>
          {rate && <div className="flex justify-between"><span className="text-muted-foreground">NGN rate</span><span>₦{rate.toLocaleString()}/$</span></div>}
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
