import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search } from 'lucide-react';
import { DiscoveredToken } from '@/hooks/useTokenDiscovery';

interface TokenSelectionModalProps {
  open: boolean;
  onClose: () => void;
  tokens: DiscoveredToken[];
  onSelectToken: (token: DiscoveredToken) => void;
  chainLogo?: string;
}

export const TokenSelectionModal = ({
  open,
  onClose,
  tokens,
  onSelectToken,
  chainLogo,
}: TokenSelectionModalProps) => {
  const [searchQuery, setSearchQuery] = useState('');

  // PUMP token mint address - disabled for now
  const DISABLED_TOKENS = new Set([
    'pumpCmXqMfrsAkQ5r49WcJnRayYRqmXz6ae8H7H9Dfn', // PUMP
  ]);

  const isTokenDisabled = (token: DiscoveredToken) => {
    return DISABLED_TOKENS.has(token.address);
  };

  const filteredTokens = tokens.filter(token =>
    token.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
    token.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSelect = (token: DiscoveredToken) => {
    if (isTokenDisabled(token)) return;
    onSelectToken(token);
    onClose();
    setSearchQuery('');
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-md bg-background/95 backdrop-blur-xl border-border/50">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold flex items-center gap-2">
            {chainLogo && (
              <img src={chainLogo} alt="Chain" className="w-5 h-5 rounded-full" />
            )}
            Select Token
          </DialogTitle>
        </DialogHeader>
        
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search tokens..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 bg-secondary/50 border-border/50"
          />
        </div>

        <ScrollArea className="h-[350px] pr-4">
          <div className="space-y-1">
            {filteredTokens.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                {tokens.length === 0 
                  ? 'No tokens with balance above $2 found'
                  : 'No tokens match your search'}
              </div>
            ) : (
              filteredTokens.map((token) => {
                const disabled = isTokenDisabled(token);
                return (
                  <button
                    key={token.key}
                    onClick={() => handleSelect(token)}
                    disabled={disabled}
                    className={`w-full flex items-center justify-between p-3 rounded-lg transition-colors group ${
                      disabled 
                        ? 'opacity-50 cursor-not-allowed' 
                        : 'hover:bg-secondary/50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        {token.logoUrl ? (
                          <img
                            src={token.logoUrl}
                            alt={token.symbol}
                            className={`w-9 h-9 rounded-full object-cover ${disabled ? 'grayscale' : ''}`}
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = 'none';
                            }}
                          />
                        ) : (
                          <div className={`w-9 h-9 rounded-full flex items-center justify-center ${
                            disabled ? 'bg-muted' : 'bg-primary/20'
                          }`}>
                            <span className={`text-xs font-bold ${disabled ? 'text-muted-foreground' : 'text-primary'}`}>
                              {token.symbol.slice(0, 2)}
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="text-left">
                        <div className={`font-medium transition-colors ${
                          disabled 
                            ? 'text-muted-foreground' 
                            : 'text-foreground group-hover:text-primary'
                        }`}>
                          {token.symbol}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {token.name}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      {disabled ? (
                        <div className="text-xs font-medium text-muted-foreground bg-muted px-2 py-1 rounded">
                          Coming Soon
                        </div>
                      ) : (
                        <>
                          <div className="font-medium text-foreground">
                            {token.balance.toLocaleString(undefined, { 
                              maximumFractionDigits: token.isNative ? 6 : 2 
                            })}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            ${token.usdValue.toLocaleString(undefined, { 
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2 
                            })}
                          </div>
                        </>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};
