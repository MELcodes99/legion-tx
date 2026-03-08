import { useState, useCallback, useRef, useEffect } from 'react';
import { Search, X, TrendingUp, TrendingDown, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';

interface TokenResult {
  address: string;
  symbol: string;
  name: string;
  chain: string;
  chainLogo: string;
  price: number;
  priceChange24h: number | null;
  logoUrl: string;
  liquidity: number;
}

const CHAIN_COLORS: Record<string, string> = {
  solana: 'bg-[hsl(280_100%_60%/0.2)] text-[hsl(280_100%_80%)] border-[hsl(280_100%_60%/0.3)]',
  ethereum: 'bg-[hsl(220_100%_60%/0.2)] text-[hsl(220_100%_80%)] border-[hsl(220_100%_60%/0.3)]',
  base: 'bg-[hsl(210_100%_50%/0.2)] text-[hsl(210_100%_80%)] border-[hsl(210_100%_50%/0.3)]',
  sui: 'bg-[hsl(195_100%_50%/0.2)] text-[hsl(195_100%_80%)] border-[hsl(195_100%_50%/0.3)]',
};

const CHAIN_NAMES: Record<string, string> = {
  solana: 'SOL',
  ethereum: 'ETH',
  base: 'BASE',
  sui: 'SUI',
};

export const TokenSearchBar = () => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<TokenResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const searchTokens = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setResults([]);
      setShowResults(false);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('search-tokens', {
        body: { query: q.trim() },
      });

      if (error) {
        console.error('Search error:', error);
        setResults([]);
      } else {
        setResults(data?.results || []);
        setShowResults(true);
      }
    } catch (err) {
      console.error('Search error:', err);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleInputChange = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => searchTokens(value), 400);
  };

  const clearSearch = () => {
    setQuery('');
    setResults([]);
    setShowResults(false);
  };

  const formatPrice = (price: number): string => {
    if (price >= 1) return `$${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    if (price >= 0.01) return `$${price.toFixed(4)}`;
    if (price >= 0.0001) return `$${price.toFixed(6)}`;
    return `$${price.toExponential(2)}`;
  };

  const formatChange = (change: number | null): { text: string; positive: boolean } | null => {
    if (change === null || change === undefined) return null;
    return {
      text: `${change >= 0 ? '+' : ''}${change.toFixed(2)}%`,
      positive: change >= 0,
    };
  };

  return (
    <div ref={containerRef} className="relative w-full max-w-2xl mx-auto mb-6 sm:mb-8">
      {/* Search Input */}
      <div className="relative group">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground group-focus-within:text-primary transition-colors" />
        <Input
          value={query}
          onChange={(e) => handleInputChange(e.target.value)}
          onFocus={() => results.length > 0 && setShowResults(true)}
          placeholder="Search any token across all chains..."
          className="pl-12 pr-12 h-12 sm:h-14 text-base sm:text-lg bg-card/80 backdrop-blur-xl border-border/50 focus:border-primary/60 rounded-2xl shadow-[var(--shadow-glow-subtle)] focus:shadow-[var(--shadow-glow)] transition-all placeholder:text-muted-foreground/50"
        />
        {loading ? (
          <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 h-5 w-5 text-primary animate-spin" />
        ) : query && (
          <button onClick={clearSearch} className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Results Dropdown */}
      {showResults && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-2 z-50 bg-card/95 backdrop-blur-xl border border-border/50 rounded-2xl shadow-2xl shadow-primary/10 overflow-hidden max-h-[70vh] overflow-y-auto">
          <div className="p-3 border-b border-border/30">
            <span className="text-xs text-muted-foreground font-medium">
              {results.length} token{results.length !== 1 ? 's' : ''} found across all chains
            </span>
          </div>
          <div className="divide-y divide-border/20">
            {results.map((token, i) => {
              const change = formatChange(token.priceChange24h);
              return (
                <div
                  key={`${token.chain}-${token.address}-${i}`}
                  className="flex items-center gap-3 p-3 sm:p-4 hover:bg-muted/30 transition-colors cursor-pointer group/item"
                >
                  {/* Token Logo */}
                  <div className="relative flex-shrink-0">
                    {token.logoUrl ? (
                      <img
                        src={token.logoUrl}
                        alt={token.symbol}
                        className="w-10 h-10 rounded-full object-cover ring-1 ring-border/30"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                          (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                        }}
                      />
                    ) : null}
                    <div className={`w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center ${token.logoUrl ? 'hidden' : ''}`}>
                      <span className="text-xs font-bold text-primary">
                        {token.symbol?.slice(0, 2)}
                      </span>
                    </div>
                    {/* Chain badge on logo */}
                    {token.chainLogo && (
                      <img
                        src={token.chainLogo}
                        alt={token.chain}
                        className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full ring-2 ring-card"
                      />
                    )}
                  </div>

                  {/* Token Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-foreground text-sm sm:text-base truncate">
                        {token.symbol}
                      </span>
                      <Badge
                        variant="outline"
                        className={`text-[10px] px-1.5 py-0 h-4 font-medium border ${CHAIN_COLORS[token.chain] || 'bg-muted text-muted-foreground'}`}
                      >
                        {CHAIN_NAMES[token.chain] || token.chain.toUpperCase()}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {token.name}
                    </p>
                  </div>

                  {/* Price + Change */}
                  <div className="text-right flex-shrink-0">
                    <div className="font-semibold text-foreground text-sm sm:text-base">
                      {formatPrice(token.price)}
                    </div>
                    {change && (
                      <div className={`flex items-center justify-end gap-0.5 text-xs font-medium ${change.positive ? 'text-green-400' : 'text-red-400'}`}>
                        {change.positive ? (
                          <TrendingUp className="h-3 w-3" />
                        ) : (
                          <TrendingDown className="h-3 w-3" />
                        )}
                        {change.text}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* No results */}
      {showResults && !loading && query.length >= 2 && results.length === 0 && (
        <div className="absolute top-full left-0 right-0 mt-2 z-50 bg-card/95 backdrop-blur-xl border border-border/50 rounded-2xl shadow-2xl p-8 text-center">
          <p className="text-muted-foreground text-sm">No tokens found for "{query}"</p>
        </div>
      )}
    </div>
  );
};
