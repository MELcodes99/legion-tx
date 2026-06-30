import { useEffect, useMemo, useRef, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Transaction } from "@solana/web3.js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, Wallet, ArrowRight, Plus, Search, Check, Copy } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useTokenDiscovery } from "@/hooks/useTokenDiscovery";
import { usePajProfile } from "@/hooks/usePajProfile";
import { PajBankAccountModal, PajBank } from "@/components/PajBankAccountModal";
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


const MIN_USD = 2;
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
  const [amountCcy, setAmountCcy] = useState<"USD" | "NGN">("USD");
  const [flow, setFlow] = useState<"saved" | "new_wallet">("saved");
  const [bankModalOpen, setBankModalOpen] = useState(false);

  const [rate, setRate] = useState<number | null>(null);
  const [rateLoading, setRateLoading] = useState(false);

  // "Send Cash" inline bank picker
  const [banks, setBanks] = useState<PajBank[]>([]);
  const [banksLoading, setBanksLoading] = useState(false);
  const [bankQuery, setBankQuery] = useState("");
  const [sendCashBank, setSendCashBank] = useState<PajBank | null>(null);
  const [sendCashAcct, setSendCashAcct] = useState("");
  const [sendCashName, setSendCashName] = useState<string | null>(null);
  const [sendCashResolving, setSendCashResolving] = useState(false);
  const [sendCashError, setSendCashError] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [activeOrder, setActiveOrder] = useState<any>(null);
  const [orderStatus, setOrderStatus] = useState<string | null>(null);
  const [pendingOrder, setPendingOrder] = useState<any>(null); // pre-created Send Cash order
  const [generatingAddr, setGeneratingAddr] = useState(false);
  const [copied, setCopied] = useState(false);

  // If a saved profile exists, default to "saved" flow
  useEffect(() => {
    if (profile) setFlow("saved");
  }, [profile?.id]);

  // Lazy-load banks when Send Cash is opened
  useEffect(() => {
    if (flow !== "new_wallet" || banks.length || banksLoading) return;
    setBanksLoading(true);
    supabase.functions
      .invoke("paj-cash", { body: { action: "list_banks" } })
      .then(({ data }) => setBanks((data as any)?.banks ?? []))
      .catch(() => {})
      .finally(() => setBanksLoading(false));
  }, [flow, banks.length, banksLoading]);

  // Auto-resolve account name for Send Cash
  useEffect(() => {
    setSendCashName(null);
    setSendCashError(null);
    if (!sendCashBank || sendCashAcct.length < 10) return;
    const t = setTimeout(async () => {
      setSendCashResolving(true);
      try {
        const { data, error } = await supabase.functions.invoke("paj-cash", {
          body: { action: "resolve_account", bankId: sendCashBank.id, accountNumber: sendCashAcct },
        });
        if (error) throw error;
        const name = (data as any)?.resolved?.accountName;
        if (!name) throw new Error("Could not resolve account");
        setSendCashName(name);
      } catch (err: any) {
        setSendCashError(err.message || "Invalid account number");
      } finally {
        setSendCashResolving(false);
      }
    }, 500);
    return () => clearTimeout(t);
  }, [sendCashBank, sendCashAcct]);

  const filteredBanks = useMemo(() => {
    const q = bankQuery.trim().toLowerCase();
    if (!q) return banks.slice(0, 60);
    return banks.filter((b) => b.name.toLowerCase().includes(q) || b.code?.toLowerCase().includes(q)).slice(0, 60);
  }, [banks, bankQuery]);

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
  const selectedGasToken = selected?.symbol === "SOL" ? "SOL" : selected?.mint;

  // Derive USD value depending on input currency
  const amountNum = parseFloat(amount) || 0;
  const usdValue = amountCcy === "USD"
    ? amountNum
    : (rate && rate > 0 ? amountNum / rate : 0);
  const tokenAmount = selected?.price ? usdValue / selected.price : 0;
  const netUsd = Math.max(0, usdValue - FLAT_FEE_USD);
  const ngnGross = rate ? usdValue * rate : null;
  const ngnNet = rate ? netUsd * rate : null;

  // Live NGN rate — use Paj's per-token off-ramp quote (same endpoint app.paj.cash uses)
  // so the displayed rate is exactly what Paj will pay out.
  const rateAbortRef = useRef<number>(0);
  useEffect(() => {
    const id = ++rateAbortRef.current;
    setRateLoading(true);
    supabase.functions
      .invoke("paj-cash", {
        body: {
          action: "get_rate",
          mint: selectedMint,
          chain: "SOLANA",
          currency: "NGN",
          amount: usdValue && usdValue > 0 ? Math.max(1, Math.round(usdValue)) : 1,
        },
      })
      .then(({ data }) => {
        if (id !== rateAbortRef.current) return;
        const r = (data as any)?.rate;
        const numeric = typeof r === "number" ? r : (r?.rate ?? r?.value ?? null);
        setRate(typeof numeric === "number" ? numeric : null);
      })
      .catch(() => {})
      .finally(() => { if (id === rateAbortRef.current) setRateLoading(false); });
  }, [selectedMint, usdValue]);


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

  // Reset pre-generated deposit address whenever inputs change
  useEffect(() => {
    setPendingOrder(null);
  }, [flow, selectedMint, amount, amountCcy, sendCashBank?.id, sendCashAcct, sendCashName]);

  const validation = (() => {
    if (!publicKey) return "Connect your Solana wallet";
    if (!selected) return "Select a token";
    if (!amountNum) return "Enter an amount";
    if (usdValue < MIN_USD) return `Minimum is $${MIN_USD.toFixed(2)}`;
    if (usdValue > MAX_USD) return `Maximum is $${MAX_USD.toFixed(0)}`;
    if (tokenAmount > (selected.balance || 0) + 1e-6) return "Insufficient balance";
    if (flow === "saved" && !profile) return "Add a Paj account first";
    if (flow === "new_wallet" && (!sendCashBank || !sendCashName)) return "Enter recipient bank details";
    if (flow === "new_wallet" && !pendingOrder) return "Generate deposit wallet";
    return null;
  })();

  const handleGenerateAddress = async () => {
    if (!publicKey || !selected || !sendCashBank || !sendCashName) return;
    setGeneratingAddr(true);
    try {
      const { data, error } = await supabase.functions.invoke("paj-cash", {
        body: {
          action: "create_order",
          walletAddress: publicKey.toBase58(),
          flow: "new_wallet",
          mint: selected.mint,
          tokenSymbol: selected.symbol,
          decimals: selected.decimals,
          amountToken: tokenAmount,
          tokenPriceUsd: selected.price,
          bankId: sendCashBank.id,
          bankName: sendCashBank.name,
          accountNumber: sendCashAcct,
          accountName: sendCashName,
        },
      });
      if (error) throw new Error(error.message);
      if ((data as any)?.error) throw new Error((data as any).error);
      setPendingOrder((data as any).order);
      toast({ title: "Deposit address ready" });
    } catch (err: any) {
      toast({ title: "Could not generate address", description: err?.message ?? String(err), variant: "destructive" });
    } finally {
      setGeneratingAddr(false);
    }
  };

  const copyDepositAddr = async () => {
    if (!pendingOrder?.depositAddress) return;
    try {
      await navigator.clipboard.writeText(pendingOrder.depositAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  const handlePajIt = async () => {
    if (validation || !publicKey || !signTransaction || !selected) return;
    setSubmitting(true);
    setOrderStatus("Creating order…");
    try {
      // 1) Use pre-created Send Cash order if present, else create one (Top Up flow).
      let order = pendingOrder;
      if (!order) {
        const create = await supabase.functions.invoke("paj-cash", {
          body: {
            action: "create_order",
            walletAddress: publicKey.toBase58(),
            flow,
            mint: selected.mint,
            tokenSymbol: selected.symbol,
            decimals: selected.decimals,
            amountToken: tokenAmount,
            tokenPriceUsd: selected.price,
            bankId: flow === "saved" ? profile?.bank_id : sendCashBank?.id,
            bankName: flow === "saved" ? profile?.bank_name : sendCashBank?.name,
            accountNumber: flow === "saved" ? profile?.bank_account_number : sendCashAcct,
            accountName: flow === "saved" ? profile?.bank_account_name : sendCashName,
            pajWalletAddress: flow === "saved" ? profile?.paj_wallet_address : null,
          },
        });
        if (create.error) throw new Error(create.error.message);
        if ((create.data as any)?.error) throw new Error((create.data as any).error);
        order = (create.data as any).order;
      }
      setActiveOrder(order);
      setOrderStatus("INIT");

      // 2) Build gasless atomic tx — recipient is the Paj-generated deposit address
      toast({ title: "Building transaction…" });
      const build = await supabase.functions.invoke("gasless-transfer", {
        body: {
          action: "build_atomic_tx",
          chain: "solana",
          senderPublicKey: publicKey.toBase58(),
          recipientPublicKey: order.depositAddress,
          amountUSD: usdValue,
          tokenAmount,
          mint: selected.mint,
          decimals: selected.decimals,
          gasToken: selectedGasToken,
          tokenSymbol: selected.symbol,
          feeUsdOverride: FLAT_FEE_USD,
          feeTokenPriceUsd: selected.price,
          deductFeeFromTokenAmount: true,
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
          amountUSD: usdValue,
          tokenAmount,
          transferAmountSmallest: amounts?.transferToRecipient,
          mint: selected.mint,
          decimals: selected.decimals,
          gasToken: selectedGasToken,
          tokenSymbol: selected.symbol,
          feeUsdOverride: FLAT_FEE_USD,
          feeTokenPriceUsd: selected.price,
          feeAmountSmallest: amounts?.feeToBackend,
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
        description: `~ ₦${ngnNet ? ngnNet.toLocaleString("en-NG", { maximumFractionDigits: 0 }) : "—"} settling to the bank.`,
      });
      setAmount("");
      setPendingOrder(null);
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
            <div className="inline-flex rounded-md border border-white/10 overflow-hidden text-[11px]">
              <button
                type="button"
                onClick={() => setAmountCcy("USD")}
                className={`px-2 py-0.5 ${amountCcy === "USD" ? "bg-primary/30 text-white" : "text-muted-foreground hover:bg-white/5"}`}
              >USD</button>
              <button
                type="button"
                onClick={() => setAmountCcy("NGN")}
                className={`px-2 py-0.5 ${amountCcy === "NGN" ? "bg-primary/30 text-white" : "text-muted-foreground hover:bg-white/5"}`}
              >NGN</button>
            </div>
          </div>
          <div className="relative mt-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
              {amountCcy === "USD" ? "$" : "₦"}
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
                const usd = selected.balance * selected.price;
                setAmount(String(amountCcy === "USD" ? usd.toFixed(2) : (rate ? Math.floor(usd * rate) : usd.toFixed(2))));
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] px-2 py-1 rounded bg-white/10 hover:bg-white/20"
            >
              MAX
            </button>
          </div>
          <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
            <span>
              {amountCcy === "USD"
                ? (rateLoading ? "Fetching rate…" : ngnGross ? `≈ ₦${ngnGross.toLocaleString("en-NG", { maximumFractionDigits: 0 })}` : "")
                : `≈ $${usdValue.toFixed(2)}`}
            </span>
            <span>{tokenAmount > 0 ? `${tokenAmount.toLocaleString(undefined, { maximumFractionDigits: 6 })} ${selected?.symbol}` : ""}</span>
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
              <div className="font-semibold">Top Up</div>
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
              <div className="font-semibold">Send Cash</div>
              <div className="text-muted-foreground">Enter bank details</div>
            </button>
          </div>

          {flow === "new_wallet" && (
            <div className="mt-3 space-y-2 rounded-lg border border-white/10 bg-white/[0.02] p-3">
              <div>
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Bank</label>
                <div className="relative mt-1">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <Input
                    value={sendCashBank ? sendCashBank.name : bankQuery}
                    onChange={(e) => { setSendCashBank(null); setBankQuery(e.target.value); }}
                    placeholder={banksLoading ? "Loading banks…" : "Search bank"}
                    className="pl-8 h-9 bg-white/5 border-white/10 text-xs"
                    disabled={banksLoading}
                  />
                </div>
                {!sendCashBank && bankQuery && (
                  <div className="mt-1 max-h-36 overflow-y-auto rounded-md border border-white/10 bg-background/80 divide-y divide-white/5">
                    {filteredBanks.map((b) => (
                      <button
                        key={b.id}
                        onClick={() => { setSendCashBank(b); setBankQuery(""); }}
                        className="w-full flex items-center gap-2 px-2 py-1.5 text-left hover:bg-white/5"
                      >
                        {b.logo ? <img src={b.logo} alt="" className="w-4 h-4 rounded-full object-cover" /> : <div className="w-4 h-4 rounded-full bg-white/10" />}
                        <span className="text-xs">{b.name}</span>
                      </button>
                    ))}
                    {filteredBanks.length === 0 && <div className="px-2 py-2 text-[11px] text-muted-foreground">No banks match</div>}
                  </div>
                )}
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Account number</label>
                <Input
                  value={sendCashAcct}
                  onChange={(e) => setSendCashAcct(e.target.value.replace(/\D/g, "").slice(0, 11))}
                  placeholder="10-digit NUBAN"
                  inputMode="numeric"
                  className="mt-1 h-9 bg-white/5 border-white/10 text-xs"
                  disabled={!sendCashBank}
                />
                <div className="mt-1 min-h-[16px] text-[11px]">
                  {sendCashResolving && <span className="inline-flex items-center gap-1 text-muted-foreground"><Loader2 className="w-3 h-3 animate-spin" /> Resolving…</span>}
                  {sendCashName && !sendCashResolving && <span className="inline-flex items-center gap-1 text-emerald-400"><Check className="w-3 h-3" /> {sendCashName}</span>}
                  {sendCashError && !sendCashResolving && <span className="text-rose-400">{sendCashError}</span>}
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Paj will generate a one-time deposit wallet address. Your tokens go there, naira lands in this bank.
              </p>

              {/* Generate / show deposit address */}
              {sendCashName && amountNum > 0 && usdValue >= MIN_USD && !pendingOrder && (
                <Button
                  type="button"
                  onClick={handleGenerateAddress}
                  disabled={generatingAddr}
                  className="w-full h-9 text-xs bg-white/10 hover:bg-white/20"
                >
                  {generatingAddr ? (
                    <span className="inline-flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Generating…</span>
                  ) : "Generate deposit wallet"}
                </Button>
              )}
              {pendingOrder?.depositAddress && (
                <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-2 space-y-1">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Send tokens to</div>
                  <div className="flex items-center justify-between gap-2">
                    <code className="text-[11px] break-all">{pendingOrder.depositAddress}</code>
                    <button
                      type="button"
                      onClick={copyDepositAddr}
                      className="shrink-0 inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded bg-white/10 hover:bg-white/20"
                    >
                      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      {copied ? "Copied" : "Copy"}
                    </button>
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    Click <span className="font-semibold">Paj It</span> below to sign and send.
                  </div>
                </div>
              )}
            </div>
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
          {flow === "saved" && profile && (
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
          {rate && <div className="flex justify-between"><span className="text-muted-foreground">NGN rate</span><span>₦{rate.toLocaleString()}/$</span></div>}
          <div className="flex justify-between pt-1 border-t border-white/5">
            <span className="text-muted-foreground">You receive in bank</span>
            <span className="font-semibold text-emerald-300">
              {ngnNet ? `₦${ngnNet.toLocaleString("en-NG", { maximumFractionDigits: 0 })}` : "—"}
              <span className="text-muted-foreground font-normal"> (${netUsd.toFixed(2)})</span>
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
