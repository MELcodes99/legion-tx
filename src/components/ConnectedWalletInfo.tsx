import { useWallet as useSolanaWallet } from '@solana/wallet-adapter-react';
import { useCurrentAccount as useSuiAccount } from '@mysten/dapp-kit';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import solanaLogo from '@/assets/solana-logo.png';
import suiLogo from '@/assets/sui-logo.png';

export const ConnectedWalletInfo = () => {
  const { publicKey: solanaPublicKey } = useSolanaWallet();
  const suiAccount = useSuiAccount();

  if (!solanaPublicKey && !suiAccount) {
    return null;
  }

  return (
    <Card className="glass-card p-4 space-y-3">
      <h3 className="text-sm font-semibold text-muted-foreground">Connected Wallets</h3>
      <div className="space-y-2">
        {solanaPublicKey && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <img src={solanaLogo} alt="Solana" className="w-5 h-5" />
              <span className="text-sm font-medium">Solana</span>
            </div>
            <Badge variant="secondary" className="font-mono text-xs">
              {solanaPublicKey.toBase58().slice(0, 4)}...{solanaPublicKey.toBase58().slice(-4)}
            </Badge>
          </div>
        )}
        {suiAccount && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <img src={suiLogo} alt="Sui" className="w-5 h-5" />
              <span className="text-sm font-medium">Sui</span>
            </div>
            <Badge variant="secondary" className="font-mono text-xs">
              {suiAccount.address.slice(0, 6)}...{suiAccount.address.slice(-4)}
            </Badge>
          </div>
        )}
      </div>
    </Card>
  );
};
