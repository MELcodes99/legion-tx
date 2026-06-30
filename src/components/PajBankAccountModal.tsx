import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Search, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface PajBank {
  id: string;
  code: string;
  name: string;
  logo?: string;
  country?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  walletAddress: string;
  defaultPajWallet?: string;
  onSaved: (profile: any) => void;
}

export const PajBankAccountModal = ({ open, onClose, walletAddress, defaultPajWallet, onSaved }: Props) => {
  const { toast } = useToast();
  const [banks, setBanks] = useState<PajBank[]>([]);
  const [loadingBanks, setLoadingBanks] = useState(false);
  const [bankQuery, setBankQuery] = useState("");
  const [selectedBank, setSelectedBank] = useState<PajBank | null>(null);
  const [accountNumber, setAccountNumber] = useState("");
  const [resolving, setResolving] = useState(false);
  const [resolvedName, setResolvedName] = useState<string | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [pajWallet, setPajWallet] = useState(defaultPajWallet || "");
  const [saving, setSaving] = useState(false);

  // Load banks once when opened
  useEffect(() => {
    if (!open || banks.length) return;
    setLoadingBanks(true);
    supabase.functions
      .invoke("paj-cash", { body: { action: "list_banks" } })
      .then(({ data, error }) => {
        if (error) throw error;
        setBanks((data as any)?.banks ?? []);
      })
      .catch((err) => {
        console.error(err);
        toast({ title: "Failed to load banks", description: err.message, variant: "destructive" });
      })
      .finally(() => setLoadingBanks(false));
  }, [open, banks.length, toast]);

  // Auto-resolve account when bank + 10-digit number entered (debounced)
  useEffect(() => {
    setResolvedName(null);
    setResolveError(null);
    if (!selectedBank || accountNumber.length < 10) return;
    const t = setTimeout(async () => {
      setResolving(true);
      try {
        const { data, error } = await supabase.functions.invoke("paj-cash", {
          body: { action: "resolve_account", bankId: selectedBank.id, accountNumber },
        });
        if (error) throw error;
        const name = (data as any)?.resolved?.accountName;
        if (!name) throw new Error("Could not resolve account");
        setResolvedName(name);
      } catch (err: any) {
        setResolveError(err.message || "Invalid account number");
      } finally {
        setResolving(false);
      }
    }, 500);
    return () => clearTimeout(t);
  }, [selectedBank, accountNumber]);

  const filteredBanks = useMemo(() => {
    const q = bankQuery.trim().toLowerCase();
    if (!q) return banks.slice(0, 60);
    return banks.filter((b) => b.name.toLowerCase().includes(q) || b.code?.toLowerCase().includes(q)).slice(0, 60);
  }, [banks, bankQuery]);

  const canSave = !!resolvedName && !!pajWallet && pajWallet.length >= 32 && !saving;

  const handleSave = async () => {
    if (!canSave || !selectedBank) return;
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke("paj-cash", {
        body: {
          action: "save_profile",
          walletAddress,
          pajWalletAddress: pajWallet.trim(),
          bankId: selectedBank.id,
          bankName: selectedBank.name,
          bankLogo: selectedBank.logo,
          accountNumber,
          accountName: resolvedName,
        },
      });
      if (error) throw error;
      onSaved((data as any).profile);
      toast({ title: "Paj profile saved", description: `${selectedBank.name} • ${resolvedName}` });
      onClose();
    } catch (err: any) {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md backdrop-blur-xl bg-background/80 border-white/10">
        <DialogHeader>
          <DialogTitle>Add your Paj account</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Bank</label>
            <div className="relative mt-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={selectedBank ? selectedBank.name : bankQuery}
                onChange={(e) => {
                  setSelectedBank(null);
                  setBankQuery(e.target.value);
                }}
                placeholder={loadingBanks ? "Loading banks…" : "Search bank"}
                className="pl-9 bg-white/5 border-white/10"
                disabled={loadingBanks}
              />
            </div>
            {!selectedBank && bankQuery && (
              <div className="mt-2 max-h-44 overflow-y-auto rounded-lg border border-white/10 bg-background/80 divide-y divide-white/5">
                {filteredBanks.map((b) => (
                  <button
                    key={b.id}
                    onClick={() => {
                      setSelectedBank(b);
                      setBankQuery("");
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/5"
                  >
                    {b.logo ? (
                      <img src={b.logo} alt="" className="w-5 h-5 rounded-full object-cover" />
                    ) : (
                      <div className="w-5 h-5 rounded-full bg-white/10" />
                    )}
                    <span className="text-sm">{b.name}</span>
                  </button>
                ))}
                {filteredBanks.length === 0 && (
                  <div className="px-3 py-3 text-xs text-muted-foreground">No banks match</div>
                )}
              </div>
            )}
          </div>

          <div>
            <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Account number</label>
            <Input
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, "").slice(0, 11))}
              placeholder="10-digit NUBAN"
              inputMode="numeric"
              className="mt-1 bg-white/5 border-white/10"
              disabled={!selectedBank}
            />
            <div className="mt-2 min-h-[20px] text-xs">
              {resolving && (
                <span className="inline-flex items-center gap-1 text-muted-foreground">
                  <Loader2 className="w-3 h-3 animate-spin" /> Resolving…
                </span>
              )}
              {resolvedName && !resolving && (
                <span className="inline-flex items-center gap-1 text-emerald-400">
                  <Check className="w-3 h-3" /> {resolvedName}
                </span>
              )}
              {resolveError && !resolving && (
                <span className="text-rose-400">{resolveError}</span>
              )}
            </div>
          </div>

          <div>
            <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Your Paj wallet address</label>
            <Input
              value={pajWallet}
              onChange={(e) => setPajWallet(e.target.value)}
              placeholder="Paj-issued Solana wallet"
              className="mt-1 bg-white/5 border-white/10 font-mono text-xs"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Funds routed to this Paj wallet will auto-settle to the bank above.
            </p>
          </div>

          <Button
            onClick={handleSave}
            disabled={!canSave}
            className="w-full bg-gradient-to-r from-primary to-accent"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save Paj account"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
