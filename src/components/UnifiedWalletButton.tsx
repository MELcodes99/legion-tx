import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { ConnectButton, useConnectWallet, useWallets } from '@mysten/dapp-kit';
import { useCurrentAccount } from '@mysten/dapp-kit';
import { useWallet } from '@solana/wallet-adapter-react';
import { Button } from './ui/button';
import { Wallet } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel } from '@/components/ui/dropdown-menu';
import solanaLogo from '@/assets/solana-logo.png';
import suiLogo from '@/assets/sui-logo.png';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';

export const UnifiedWalletButton = () => {
  const suiAccount = useCurrentAccount();
  const { publicKey: solanaPublicKey, wallets: solanaWallets, select: selectSolanaWallet } = useWallet();
  const { mutate: connectSuiWallet } = useConnectWallet();
  const suiWallets = useWallets();

  const bothConnected = solanaPublicKey && suiAccount;
  const oneConnected = solanaPublicKey || suiAccount;

  // Show connected state with wallet management
  if (bothConnected) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button 
            className="bg-gradient-to-r from-primary via-accent to-primary hover:opacity-90 px-3 sm:px-4 py-2 rounded-lg font-medium transition-all text-primary-foreground flex items-center gap-1.5 sm:gap-2"
          >
            <Wallet className="w-4 h-4" />
            <img src={solanaLogo} alt="Solana" className="w-3.5 sm:w-4 h-3.5 sm:h-4" />
            <img src={suiLogo} alt="Sui" className="w-3.5 sm:w-4 h-3.5 sm:h-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="bg-popover border-border p-2 w-[85vw] sm:w-[280px] max-w-[280px] z-50">
          <div className="space-y-1">
            <WalletMultiButton className="!w-full !bg-secondary/50 hover:!bg-secondary/70 !px-3 sm:!px-4 !py-2 !rounded-lg !font-medium !transition-all !text-foreground !justify-start !text-sm" />
            <ConnectButton className="!w-full !bg-secondary/50 hover:!bg-secondary/70 !px-3 sm:!px-4 !py-2 !rounded-lg !font-medium !transition-all !text-foreground !text-sm" />
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
            className="bg-gradient-to-r from-primary via-accent to-primary hover:opacity-90 px-3 sm:px-4 py-2 rounded-lg font-medium transition-all text-primary-foreground flex items-center gap-1.5 sm:gap-2"
          >
            <Wallet className="w-4 h-4" />
            {solanaPublicKey && <img src={solanaLogo} alt="Solana" className="w-3.5 sm:w-4 h-3.5 sm:h-4" />}
            {suiAccount && <img src={suiLogo} alt="Sui" className="w-3.5 sm:w-4 h-3.5 sm:h-4" />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="bg-popover border-border p-2 w-[85vw] sm:w-[280px] max-w-[280px] z-50">
          <div className="space-y-1">
            <WalletMultiButton className="!w-full !bg-secondary/50 hover:!bg-secondary/70 !px-3 sm:!px-4 !py-2 !rounded-lg !font-medium !transition-all !text-foreground !justify-start !text-sm" />
            <ConnectButton className="!w-full !bg-gradient-to-r !from-primary !via-accent !to-primary hover:!opacity-90 !px-3 sm:!px-4 !py-2 !rounded-lg !font-medium !transition-all !text-primary-foreground !text-sm" />
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  // Show all available wallets directly
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button 
          className="bg-gradient-to-r from-primary via-accent to-primary hover:opacity-90 px-3 sm:px-4 py-2 rounded-lg font-medium transition-all text-primary-foreground text-sm sm:text-base"
        >
          <Wallet className="w-4 h-4 sm:mr-2" />
          <span className="hidden sm:inline">Connect Wallet</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent 
        align="end"
        className="bg-popover border-border p-3 w-[85vw] sm:w-[320px] max-w-[320px] z-50 max-h-[70vh] overflow-y-auto"
      >
        <DropdownMenuLabel className="text-xs text-muted-foreground flex items-center gap-2">
          <img src={solanaLogo} alt="Solana" className="w-3.5 h-3.5" />
          Solana Wallets
        </DropdownMenuLabel>
        <div className="space-y-1 mt-1 mb-3">
          {solanaWallets.map((wallet) => (
            <DropdownMenuItem
              key={wallet.adapter.name}
              onClick={() => selectSolanaWallet(wallet.adapter.name)}
              className="flex items-center gap-2 cursor-pointer hover:bg-secondary/70 px-3 py-2.5 rounded-md"
            >
              <img 
                src={wallet.adapter.icon} 
                alt={wallet.adapter.name} 
                className="w-5 h-5 rounded flex-shrink-0"
              />
              <span className="font-medium text-sm">{wallet.adapter.name}</span>
            </DropdownMenuItem>
          ))}
        </div>
        
        <DropdownMenuSeparator />
        
        <DropdownMenuLabel className="text-xs text-muted-foreground flex items-center gap-2 mt-2">
          <img src={suiLogo} alt="Sui" className="w-3.5 h-3.5" />
          Sui Wallets
        </DropdownMenuLabel>
        <div className="space-y-1 mt-1">
          {suiWallets.map((wallet) => (
            <DropdownMenuItem
              key={wallet.name}
              onClick={() => connectSuiWallet({ wallet })}
              className="flex items-center gap-2 cursor-pointer hover:bg-secondary/70 px-3 py-2.5 rounded-md"
            >
              <img 
                src={wallet.icon} 
                alt={wallet.name} 
                className="w-5 h-5 rounded flex-shrink-0"
              />
              <span className="font-medium text-sm">{wallet.name}</span>
            </DropdownMenuItem>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
