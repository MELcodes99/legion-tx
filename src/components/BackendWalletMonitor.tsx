import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Wallet, AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

export const BackendWalletMonitor = () => {
  const [balance, setBalance] = useState<number | null>(null);
  const [publicKey, setPublicKey] = useState<string>('');
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
          setPublicKey(data.publicKey);
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
  const isLowBalance = balance !== null && balance < LOW_BALANCE_THRESHOLD;

  return (
    <Card className="glass-card">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Wallet className="h-5 w-5 text-primary" />
          Backend Wallet Status
        </CardTitle>
        <CardDescription>
          Monitoring the wallet that covers gas fees
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {error ? (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : (
          <>
            <div className="space-y-2">
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">Public Key:</span>
                <Badge variant="outline" className="font-mono text-xs">
                  {publicKey.slice(0, 4)}...{publicKey.slice(-4)}
                </Badge>
              </div>
              
              {balance !== null && (
                <>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Balance:</span>
                    <span className={`font-semibold ${isLowBalance ? 'text-yellow-500' : 'text-primary'}`}>
                      {balance.toFixed(4)} SOL
                    </span>
                  </div>

                  {isLowBalance && (
                    <Alert className="border-yellow-500/50 bg-yellow-500/10">
                      <AlertTriangle className="h-4 w-4 text-yellow-500" />
                      <AlertDescription className="text-sm">
                        Backend wallet balance is low. Please add more SOL to continue covering gas fees.
                      </AlertDescription>
                    </Alert>
                  )}
                </>
              )}
            </div>

            <div className="pt-3 border-t border-border/30">
              <a
                href={`https://solscan.io/account/${publicKey}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary hover:underline flex items-center gap-1"
              >
                View on Solscan →
              </a>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};
