import { WalletButton as SolanaWalletButton } from './WalletButton';
import { ConnectButton } from '@mysten/dapp-kit';
import { useCurrentAccount } from '@mysten/dapp-kit';
import { Button } from './ui/button';

export const MultiChainWalletButton = () => {
  const suiAccount = useCurrentAccount();

  return (
    <div className="flex gap-2 flex-wrap">
      {/* Solana Wallet Button */}
      <SolanaWalletButton />
      
      {/* Sui Wallet Button */}
      {!suiAccount ? (
        <ConnectButton className="!bg-gradient-to-r !from-primary !via-accent !to-primary hover:!opacity-90 !px-4 !py-2 !rounded-lg !font-medium !transition-all !text-primary-foreground" />
      ) : (
        <ConnectButton className="!bg-secondary/50 hover:!bg-secondary/70 !px-4 !py-2 !rounded-lg !font-medium !transition-all !text-foreground" />
      )}
    </div>
  );
};
