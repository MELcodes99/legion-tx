import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search } from 'lucide-react';
import { useJupiterTokenList, JupToken } from '@/hooks/useJupiterTokenList';

interface Props {
  open: boolean;
  onClose: () => void;
  onSelect: (token: JupToken) => void;
  excludeMint?: string;
}

const isMintAddress = (s: string) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s.trim());

export const SwapOutputTokenModal = ({ open, onClose, onSelect, excludeMint }: Props) => {
  const { tokens, loading } = useJupiterTokenList();
  const [query, setQuery] = useState('');

  const q = query.trim().toLowerCase();
  let filtered: JupToken[] = [];
  if (!q) {
    filtered = tokens.slice(0, 60);
  } else {
    filtered = tokens
      .filter((t) =>
        t.symbol?.toLowerCase().includes(q) ||
        t.name?.toLowerCase().includes(q) ||
        t.address.toLowerCase() === q,
      )
      .slice(0, 80);
  }
  if (excludeMint) filtered = filtered.filter((t) => t.address !== excludeMint);

  // If user pasted a mint address not in list, allow them to pick it as raw
  const rawMintMatch =
    q.length > 0 &&
    isMintAddress(query) &&
    !tokens.some((t) => t.address === query.trim());

  const handleSelect = (t: JupToken) => {
    onSelect(t);
    onClose();
    setQuery('');
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
            placeholder="Search by name, symbol, or paste mint address"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9 bg-secondary/50 border-border/50"
          />
        </div>

        <ScrollArea className="h-[350px] pr-4">
          <div className="space-y-1">
            {loading && tokens.length === 0 && (
              <div className="text-center py-8 text-muted-foreground text-sm">
                Loading Jupiter token list…
              </div>
            )}

            {rawMintMatch && (
              <button
                onClick={() =>
                  handleSelect({
                    address: query.trim(),
                    chainId: 101,
                    decimals: 0, // resolved later via quote
                    name: 'Unknown token',
                    symbol: `${query.trim().slice(0, 4)}…`,
                  })
                }
                className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-secondary/50 transition-colors text-left"
              >
                <div>
                  <div className="font-medium text-foreground">Use mint address</div>
                  <div className="text-xs text-muted-foreground break-all">{query.trim()}</div>
                </div>
              </button>
            )}

            {filtered.map((t) => (
              <button
                key={t.address}
                onClick={() => handleSelect(t)}
                className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-secondary/50 transition-colors group"
              >
                {t.logoURI ? (
                  <img
                    src={t.logoURI}
                    alt={t.symbol}
                    className="w-9 h-9 rounded-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
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
              </button>
            ))}

            {!loading && filtered.length === 0 && !rawMintMatch && (
              <div className="text-center py-8 text-muted-foreground text-sm">
                No tokens match "{query}"
              </div>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};
