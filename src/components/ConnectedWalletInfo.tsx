import { useWallet as useSolanaWallet } from '@solana/wallet-adapter-react';
import { useCurrentAccount as useSuiAccount } from '@mysten/dapp-kit';
import { useAccount } from 'wagmi';
import { base } from 'wagmi/chains';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import solanaLogo from '@/assets/solana-logo.png';
import suiLogo from '@/assets/sui-logo.png';
import baseLogo from '@/assets/base-logo.jpeg';
import ethLogo from '@/assets/eth-logo.jpeg';
import type { ChainType } from '@/config/tokens';

interface ConnectedWalletInfoProps {
  activeChain?: ChainType | null;
}

export const ConnectedWalletInfo = ({ activeChain }: ConnectedWalletInfoProps) => {
  const { publicKey: solanaPublicKey } = useSolanaWallet();
  const suiAccount = useSuiAccount();
  const { address: evmAddress, chain: evmChain } = useAccount();

  const showSolana = !!solanaPublicKey && (!activeChain || activeChain === 'solana');
  const showSui = !!suiAccount && (!activeChain || activeChain === 'sui');
  const showBase = !!evmAddress && evmChain?.id === base.id && (!activeChain || activeChain === 'base');
  const showEth = !!evmAddress && evmChain?.id !== base.id && (!activeChain || activeChain === 'ethereum');

  if (!showSolana && !showSui && !showBase && !showEth) {
    return null;
  }

  return (
    <Card className="glass-card p-4 space-y-3">
      <h3 className="text-sm font-semibold text-muted-foreground">Connected Wallet</h3>
      <div className="space-y-2">
        {showSolana && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <img src={solanaLogo} alt="Solana" className="w-5 h-5" />
              <span className="text-sm font-medium">Solana</span>
            </div>
            <Badge variant="secondary" className="font-mono text-xs">
              {solanaPublicKey!.toBase58().slice(0, 4)}...{solanaPublicKey!.toBase58().slice(-4)}
            </Badge>
          </div>
        )}
        {showSui && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <img src={suiLogo} alt="Sui" className="w-5 h-5" />
              <span className="text-sm font-medium">Sui</span>
            </div>
            <Badge variant="secondary" className="font-mono text-xs">
              {suiAccount!.address.slice(0, 6)}...{suiAccount!.address.slice(-4)}
            </Badge>
          </div>
        )}
        {(showBase || showEth) && evmAddress && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <img
                src={showBase ? baseLogo : ethLogo}
                alt={showBase ? 'Base' : 'Ethereum'}
                className="w-5 h-5 rounded-full"
              />
              <span className="text-sm font-medium">{showBase ? 'Base' : 'Ethereum'}</span>
            </div>
            <Badge variant="secondary" className="font-mono text-xs">
              {evmAddress.slice(0, 6)}...{evmAddress.slice(-4)}
            </Badge>
          </div>
        )}
      </div>
    </Card>
  );
};
