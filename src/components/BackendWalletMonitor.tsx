import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Wallet, AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

export const BackendWalletMonitor = () => {
  const [solanaBalance, setSolanaBalance] = useState<number | null>(null);
  const [solanaPublicKey, setSolanaPublicKey] = useState<string>('');
  const [suiBalance, setSuiBalance] = useState<number | null>(null);
  const [suiAddress, setSuiAddress] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    const checkBackendWallet = async () => {
      try {
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/gasless-transfer`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              action: 'get_backend_wallet',
            }),
          }
        );

        const data = await response.json();

        if (response.ok) {
          setSolanaPublicKey(data.publicKey || '');
          setSuiAddress(data.suiAddress || '');
          setError('');
        } else {
          setError(data.error || 'Failed to fetch backend wallet info');
        }
      } catch (err) {
        setError('Backend wallet not configured');
      } finally {
        setIsLoading(false);
      }
    };

    checkBackendWallet();
  }, []);

  if (isLoading) {
    return null;
  }

  const LOW_BALANCE_THRESHOLD = 0.1;
  const isSolanaLowBalance = solanaBalance !== null && solanaBalance < LOW_BALANCE_THRESHOLD;
  const isSuiLowBalance = suiBalance !== null && suiBalance < LOW_BALANCE_THRESHOLD;

  return (
    <Card className="glass-card">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Wallet className="h-5 w-5 text-primary" />
          Backend Wallet Status
        </CardTitle>
        <CardDescription>
          Multi-chain wallets that cover gas fees
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : (
          <>
            {/* Solana Backend Wallet */}
            {solanaPublicKey && (
              <div className="space-y-2 pb-4 border-b border-border/30">
                <h4 className="text-sm font-semibold text-primary">Solana Network</h4>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Address:</span>
                  <Badge variant="outline" className="font-mono text-xs">
                    {solanaPublicKey.slice(0, 4)}...{solanaPublicKey.slice(-4)}
                  </Badge>
                </div>
                
                {solanaBalance !== null && (
                  <>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground">Balance:</span>
                      <span className={`font-semibold ${isSolanaLowBalance ? 'text-yellow-500' : 'text-primary'}`}>
                        {solanaBalance.toFixed(4)} SOL
                      </span>
                    </div>

                    {isSolanaLowBalance && (
                      <Alert className="border-yellow-500/50 bg-yellow-500/10">
                        <AlertTriangle className="h-4 w-4 text-yellow-500" />
                        <AlertDescription className="text-sm">
                          Solana backend wallet balance is low. Please add more SOL.
                        </AlertDescription>
                      </Alert>
                    )}
                  </>
                )}
                
                <a
                  href={`https://solscan.io/account/${solanaPublicKey}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline flex items-center gap-1"
                >
                  View on Solscan →
                </a>
              </div>
            )}

            {/* Sui Backend Wallet */}
            {suiAddress && (
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-primary">Sui Network</h4>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Address:</span>
                  <Badge variant="outline" className="font-mono text-xs">
                    {suiAddress.slice(0, 6)}...{suiAddress.slice(-4)}
                  </Badge>
                </div>
                
                {suiBalance !== null && (
                  <>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground">Balance:</span>
                      <span className={`font-semibold ${isSuiLowBalance ? 'text-yellow-500' : 'text-primary'}`}>
                        {suiBalance.toFixed(4)} SUI
                      </span>
                    </div>

                    {isSuiLowBalance && (
                      <Alert className="border-yellow-500/50 bg-yellow-500/10">
                        <AlertTriangle className="h-4 w-4 text-yellow-500" />
                        <AlertDescription className="text-sm">
                          Sui backend wallet balance is low. Please add more SUI.
                        </AlertDescription>
                      </Alert>
                    )}
                  </>
                )}
                
                <a
                  href={`https://suiscan.xyz/mainnet/account/${suiAddress}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline flex items-center gap-1"
                >
                  View on Suiscan →
                </a>
                
                <Alert className="border-blue-500/50 bg-blue-500/10 mt-3">
                  <AlertDescription className="text-xs">
                    ⚠️ This wallet needs SUI tokens to pay for gas when forwarding transfers. 
                    Recommended: Add at least 0.5 SUI
                  </AlertDescription>
                </Alert>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};
