import { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search, Loader2 } from 'lucide-react';
import { useJupiterTokenList, JupToken, searchJupiterTokens } from '@/hooks/useJupiterTokenList';
import { DiscoveredToken } from '@/hooks/useTokenDiscovery';

interface Props {
  open: boolean;
  onClose: () => void;
  onSelect: (token: JupToken) => void;
  excludeMint?: string;
  walletTokens?: DiscoveredToken[];
}

const isMintAddress = (s: string) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s.trim());

const fmtPrice = (n?: number) => {
  if (!n || !Number.isFinite(n) || n <= 0) return '';
  if (n >= 1) return `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  if (n >= 0.01) return `$${n.toFixed(3)}`;
  // Render small prices as plain decimals (e.g. $0.00327) — no scientific notation.
  const magnitude = Math.max(0, -Math.floor(Math.log10(n)));
  const digits = Math.min(20, magnitude + 3);
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: 0 })}`;
};

const rank = (t: JupToken, q: string) => {
  const sym = (t.symbol || '').toLowerCase();
  const name = (t.name || '').toLowerCase();
  if (sym === q) return 0;
  if (sym.startsWith(q)) return 1;
  if (name.toLowerCase() === q) return 2;
  if (name.startsWith(q)) return 3;
  if (sym.includes(q)) return 4;
  if (name.includes(q)) return 5;
  return 6;
};

export const SwapOutputTokenModal = ({ open, onClose, onSelect, excludeMint, walletTokens = [] }: Props) => {
  const { tokens, loading } = useJupiterTokenList();
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [remote, setRemote] = useState<JupToken[]>([]);
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Balance lookup by mint
  const balanceByMint = useMemo(() => {
    const m = new Map<string, DiscoveredToken>();
    for (const t of walletTokens) {
      if (t.chain === 'solana') m.set(t.address, t);
    }
    return m;
  }, [walletTokens]);

  // Autofocus when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery('');
      setDebounced('');
      setRemote([]);
    }
  }, [open]);

  // Debounce query
  useEffect(() => {
    const id = setTimeout(() => setDebounced(query.trim()), 200);
    return () => clearTimeout(id);
  }, [query]);

  // Remote search for queries that may not be in verified list
  useEffect(() => {
    const q = debounced;
    if (!q) {
      setRemote([]);
      return;
    }
    let alive = true;
    setSearching(true);
    searchJupiterTokens(q)
      .then((res) => {
        if (alive) setRemote(res);
      })
      .finally(() => alive && setSearching(false));
    return () => {
      alive = false;
    };
  }, [debounced]);

  const q = debounced.toLowerCase();

  const filtered = useMemo<JupToken[]>(() => {
    let list: JupToken[];
    if (!q) {
      list = tokens.slice(0, 80);
    } else {
      // Merge local cached matches + remote search results; dedupe by mint
      const localMatches = tokens.filter(
        (t) =>
          t.symbol?.toLowerCase().includes(q) ||
          t.name?.toLowerCase().includes(q) ||
          t.address.toLowerCase() === q,
      );
      const seen = new Set<string>();
      list = [];
      for (const t of [...localMatches, ...remote]) {
        if (seen.has(t.address)) continue;
        seen.add(t.address);
        list.push(t);
      }
      list.sort((a, b) => rank(a, q) - rank(b, q));
      list = list.slice(0, 80);
    }
    if (excludeMint) list = list.filter((t) => t.address !== excludeMint);
    return list;
  }, [q, tokens, remote, excludeMint]);

  // Pasted mint not in any result → allow raw selection
  const rawMintMatch =
    debounced.length > 0 &&
    isMintAddress(debounced) &&
    !filtered.some((t) => t.address === debounced);

  const handleSelect = (t: JupToken) => {
    onSelect(t);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md bg-background/95 backdrop-blur-xl border-border/50">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">Receive token</DialogTitle>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            ref={inputRef}
            placeholder="Search by name, symbol, or paste mint address"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9 bg-secondary/50 border-border/50"
          />
          {searching && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
          )}
        </div>

        <ScrollArea className="h-[350px] pr-4">
          <div className="space-y-1">
            {loading && tokens.length === 0 && (
              <div className="text-center py-8 text-muted-foreground text-sm">
                Loading token list…
              </div>
            )}

            {rawMintMatch && (
              <button
                onClick={() =>
                  handleSelect({
                    address: debounced,
                    chainId: 101,
                    decimals: 0,
                    name: 'Unknown token',
                    symbol: `${debounced.slice(0, 4)}…`,
                  })
                }
                className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-secondary/50 transition-colors text-left"
              >
                <div>
                  <div className="font-medium text-foreground">Use mint address</div>
                  <div className="text-xs text-muted-foreground break-all">{debounced}</div>
                </div>
              </button>
            )}

            {filtered.map((t) => {
              const held = balanceByMint.get(t.address);
              return (
                <button
                  key={t.address}
                  onClick={() => handleSelect(t)}
                  className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-secondary/50 transition-colors group"
                >
                  {t.logoURI ? (
                    <img
                      src={t.logoURI}
                      alt={t.symbol}
                      className="w-9 h-9 rounded-full object-cover bg-secondary"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.visibility = 'hidden';
                      }}
                    />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center">
                      <span className="text-xs font-bold text-primary">{t.symbol.slice(0, 2)}</span>
                    </div>
                  )}
                  <div className="text-left flex-1 min-w-0">
                    <div className="font-medium text-foreground group-hover:text-primary transition-colors">
                      {t.symbol}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">{t.name}</div>
                  </div>
                  <div className="text-right shrink-0">
                    {t.usdPrice !== undefined && (
                      <div className="text-sm text-foreground">{fmtPrice(t.usdPrice)}</div>
                    )}
                    {held && held.balance > 0 && (
                      <div className="text-[11px] text-muted-foreground">
                        {held.balance.toLocaleString(undefined, { maximumFractionDigits: 4 })} {t.symbol}
                      </div>
                    )}
                  </div>
                </button>
              );
            })}

            {!loading && !searching && filtered.length === 0 && !rawMintMatch && debounced && (
              <div className="text-center py-8 text-muted-foreground text-sm">
                No tokens match "{debounced}"
              </div>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};
