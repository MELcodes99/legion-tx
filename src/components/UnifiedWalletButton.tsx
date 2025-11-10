import { WalletButton as SolanaWalletButton } from './WalletButton';
import { ConnectButton } from '@mysten/dapp-kit';
import { useCurrentAccount } from '@mysten/dapp-kit';
import { useWallet } from '@solana/wallet-adapter-react';
import { Button } from './ui/button';
import { Wallet } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import solanaLogo from '@/assets/solana-logo.png';
import suiLogo from '@/assets/sui-logo.png';

export const UnifiedWalletButton = () => {
  const suiAccount = useCurrentAccount();
  const { publicKey: solanaPublicKey } = useWallet();

  const bothConnected = solanaPublicKey && suiAccount;
  const oneConnected = solanaPublicKey || suiAccount;

  if (bothConnected) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button 
            className="bg-gradient-to-r from-primary via-accent to-primary hover:opacity-90 px-4 py-2 rounded-lg font-medium transition-all text-primary-foreground flex items-center gap-2"
          >
            <Wallet className="w-4 h-4" />
            <img src={solanaLogo} alt="Solana" className="w-4 h-4" />
            <img src={suiLogo} alt="Sui" className="w-4 h-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="bg-popover border-border p-2 space-y-2 z-50">
          <div className="space-y-2">
            <SolanaWalletButton />
            <ConnectButton className="!w-full !bg-secondary/50 hover:!bg-secondary/70 !px-4 !py-2 !rounded-lg !font-medium !transition-all !text-foreground" />
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  if (oneConnected) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button 
            className="bg-gradient-to-r from-primary via-accent to-primary hover:opacity-90 px-4 py-2 rounded-lg font-medium transition-all text-primary-foreground flex items-center gap-2"
          >
            <Wallet className="w-4 h-4" />
            {solanaPublicKey && <img src={solanaLogo} alt="Solana" className="w-4 h-4" />}
            {suiAccount && <img src={suiLogo} alt="Sui" className="w-4 h-4" />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="bg-popover border-border p-2 space-y-2 z-50">
          <div className="space-y-2">
            <SolanaWalletButton />
            <ConnectButton className="!w-full !bg-secondary/50 hover:!bg-secondary/70 !px-4 !py-2 !rounded-lg !font-medium !transition-all !text-foreground" />
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button 
          className="bg-gradient-to-r from-primary via-accent to-primary hover:opacity-90 px-4 py-2 rounded-lg font-medium transition-all text-primary-foreground"
        >
          <Wallet className="w-4 h-4 mr-2" />
          Connect Wallet
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="bg-popover border-border p-2 space-y-2 z-50">
        <div className="space-y-2">
          <SolanaWalletButton />
          <ConnectButton className="!w-full !bg-gradient-to-r !from-primary !via-accent !to-primary hover:!opacity-90 !px-4 !py-2 !rounded-lg !font-medium !transition-all !text-primary-foreground" />
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
