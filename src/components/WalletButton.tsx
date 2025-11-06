import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { Wallet } from 'lucide-react';

export const WalletButton = () => {
  return (
    <div className="wallet-adapter-button-container">
      <WalletMultiButton className="!bg-gradient-to-r !from-primary !to-accent !rounded-lg !font-semibold hover:!opacity-90 !transition-opacity" />
    </div>
  );
};
