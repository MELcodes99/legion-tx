import { useState } from 'react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { ConnectButton, useConnectWallet, useWallets, useDisconnectWallet } from '@mysten/dapp-kit';
import { useCurrentAccount } from '@mysten/dapp-kit';
import { useWallet } from '@solana/wallet-adapter-react';
import { useAccount, useConnect, useDisconnect, useSwitchChain } from 'wagmi';
import { mainnet, base } from 'wagmi/chains';
import { Button } from './ui/button';
import { Wallet, LogOut, ChevronLeft } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import solanaLogo from '@/assets/solana-logo.png';
import suiLogo from '@/assets/sui-logo.png';
import baseLogo from '@/assets/base-logo.jpeg';
import ethLogo from '@/assets/eth-logo.jpeg';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useToast } from '@/hooks/use-toast';
import type { ChainType } from '@/config/tokens';

type NetworkStep = 'select-network' | 'select-wallet';

const NETWORKS = [
  { id: 'solana' as ChainType, name: 'Solana', logo: solanaLogo },
  { id: 'sui' as ChainType, name: 'Sui', logo: suiLogo },
  { id: 'base' as ChainType, name: 'Base', logo: baseLogo },
  { id: 'ethereum' as ChainType, name: 'Ethereum', logo: ethLogo },
];

export const UnifiedWalletButton = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState<NetworkStep>('select-network');
  const [selectedNetwork, setSelectedNetwork] = useState<ChainType | null>(null);

  // Solana
  const { publicKey: solanaPublicKey, wallets: solanaWallets, select: selectSolanaWallet, disconnect: disconnectSolana } = useWallet();
  
  // Sui
  const suiAccount = useCurrentAccount();
  const { mutate: connectSuiWallet } = useConnectWallet();
  const { mutate: disconnectSui } = useDisconnectWallet();
  const suiWallets = useWallets();
  
  // EVM (Base & Ethereum)
  const { address: evmAddress, chain: evmChain } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect: disconnectEvm } = useDisconnect();
  const { switchChain } = useSwitchChain();

  const { toast } = useToast();

  const isConnected = solanaPublicKey || suiAccount || evmAddress;

  const handleDisconnect = async () => {
    if (solanaPublicKey) {
      await disconnectSolana();
    }
    if (suiAccount) {
      disconnectSui();
    }
    if (evmAddress) {
      disconnectEvm();
    }
    toast({
      title: "Wallet Disconnected",
      description: "Wallet has been disconnected successfully.",
    });
  };

  const handleNetworkSelect = (network: ChainType) => {
    setSelectedNetwork(network);
    setStep('select-wallet');
    
    // For EVM chains, switch chain if already connected
    if (evmAddress && (network === 'base' || network === 'ethereum')) {
      const targetChainId = network === 'base' ? base.id : mainnet.id;
      if (evmChain?.id !== targetChainId) {
        switchChain({ chainId: targetChainId });
      }
    }
  };

  const handleWalletConnect = (walletType: string, wallet?: any) => {
    if (selectedNetwork === 'solana' && wallet) {
      selectSolanaWallet(wallet.adapter.name);
    } else if (selectedNetwork === 'sui' && wallet) {
      connectSuiWallet({ wallet });
    } else if ((selectedNetwork === 'base' || selectedNetwork === 'ethereum') && wallet) {
      const targetChainId = selectedNetwork === 'base' ? base.id : mainnet.id;
      connect({ connector: wallet, chainId: targetChainId });
    }
    setIsOpen(false);
    setStep('select-network');
    setSelectedNetwork(null);
  };

  const handleBack = () => {
    setStep('select-network');
    setSelectedNetwork(null);
  };

  const getConnectedLogo = () => {
    if (solanaPublicKey) return solanaLogo;
    if (suiAccount) return suiLogo;
    if (evmAddress && evmChain?.id === base.id) return baseLogo;
    if (evmAddress) return ethLogo;
    return null;
  };

  const getConnectedChainName = () => {
    if (solanaPublicKey) return 'Solana';
    if (suiAccount) return 'Sui';
    if (evmAddress && evmChain?.id === base.id) return 'Base';
    if (evmAddress) return 'Ethereum';
    return '';
  };

  // Show connected wallet with management
  if (isConnected) {
    const connectedLogo = getConnectedLogo();
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button 
            className="bg-gradient-to-r from-primary via-accent to-primary hover:opacity-90 px-3 sm:px-4 py-2 rounded-lg font-medium transition-all text-primary-foreground flex items-center gap-1.5 sm:gap-2"
          >
            <Wallet className="w-4 h-4" />
            {connectedLogo && <img src={connectedLogo} alt="Network" className="w-3.5 sm:w-4 h-3.5 sm:h-4 rounded-full" />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="bg-popover border-border p-2 w-[85vw] sm:w-[280px] max-w-[280px] z-50">
          <div className="space-y-1">
            <div className="px-3 py-2 text-sm text-muted-foreground">
              Connected to {getConnectedChainName()}
            </div>
            {solanaPublicKey && (
              <div className="px-3 py-2 text-xs font-mono bg-secondary/30 rounded">
                {solanaPublicKey.toBase58().slice(0, 6)}...{solanaPublicKey.toBase58().slice(-4)}
              </div>
            )}
            {suiAccount && (
              <div className="px-3 py-2 text-xs font-mono bg-secondary/30 rounded">
                {suiAccount.address.slice(0, 6)}...{suiAccount.address.slice(-4)}
              </div>
            )}
            {evmAddress && (
              <div className="px-3 py-2 text-xs font-mono bg-secondary/30 rounded">
                {evmAddress.slice(0, 6)}...{evmAddress.slice(-4)}
              </div>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={handleDisconnect}
              className="flex items-center gap-2 cursor-pointer text-destructive hover:!text-destructive hover:!bg-destructive/10 px-3 py-2 rounded-lg"
            >
              <LogOut className="w-4 h-4" />
              <span className="font-medium text-sm">Disconnect to switch networks</span>
            </DropdownMenuItem>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  // Show connect button with network selection dialog
  return (
    <>
      <Button 
        onClick={() => setIsOpen(true)}
        className="bg-gradient-to-r from-primary via-accent to-primary hover:opacity-90 px-3 sm:px-4 py-2 rounded-lg font-medium transition-all text-primary-foreground text-sm sm:text-base"
      >
        <Wallet className="w-4 h-4 sm:mr-2" />
        <span className="hidden sm:inline">Connect Wallet</span>
      </Button>

      <Dialog open={isOpen} onOpenChange={(open) => {
        setIsOpen(open);
        if (!open) {
          setStep('select-network');
          setSelectedNetwork(null);
        }
      }}>
        <DialogContent className="sm:max-w-[360px] bg-popover border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {step === 'select-wallet' && (
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleBack}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
              )}
              {step === 'select-network' ? 'Select Network' : `Connect to ${NETWORKS.find(n => n.id === selectedNetwork)?.name}`}
            </DialogTitle>
          </DialogHeader>

          {step === 'select-network' && (
            <div className="grid grid-cols-2 gap-3 py-4">
              {NETWORKS.map((network) => (
                <Button
                  key={network.id}
                  variant="outline"
                  className="flex flex-col items-center gap-2 h-auto py-4 hover:bg-secondary/50 border-border"
                  onClick={() => handleNetworkSelect(network.id)}
                >
                  <img 
                    src={network.logo} 
                    alt={network.name} 
                    className="w-10 h-10 rounded-full object-cover"
                  />
                  <span className="text-sm font-medium">{network.name}</span>
                </Button>
              ))}
            </div>
          )}

          {step === 'select-wallet' && selectedNetwork === 'solana' && (
            <div className="space-y-2 py-4">
              {solanaWallets.map((wallet) => (
                <Button
                  key={wallet.adapter.name}
                  variant="outline"
                  className="w-full flex items-center gap-3 justify-start h-auto py-3 hover:bg-secondary/50 border-border"
                  onClick={() => handleWalletConnect('solana', wallet)}
                >
                  <img 
                    src={wallet.adapter.icon} 
                    alt={wallet.adapter.name} 
                    className="w-6 h-6 rounded"
                  />
                  <span className="font-medium">{wallet.adapter.name}</span>
                </Button>
              ))}
            </div>
          )}

          {step === 'select-wallet' && selectedNetwork === 'sui' && (
            <div className="space-y-2 py-4">
              {suiWallets.map((wallet) => (
                <Button
                  key={wallet.name}
                  variant="outline"
                  className="w-full flex items-center gap-3 justify-start h-auto py-3 hover:bg-secondary/50 border-border"
                  onClick={() => handleWalletConnect('sui', wallet)}
                >
                  <img 
                    src={wallet.icon} 
                    alt={wallet.name} 
                    className="w-6 h-6 rounded"
                  />
                  <span className="font-medium">{wallet.name}</span>
                </Button>
              ))}
            </div>
          )}

          {step === 'select-wallet' && (selectedNetwork === 'base' || selectedNetwork === 'ethereum') && (
            <div className="space-y-2 py-4">
              {connectors.map((connector) => (
                <Button
                  key={connector.uid}
                  variant="outline"
                  className="w-full flex items-center gap-3 justify-start h-auto py-3 hover:bg-secondary/50 border-border"
                  onClick={() => handleWalletConnect('evm', connector)}
                >
                  {connector.icon && (
                    <img 
                      src={connector.icon} 
                      alt={connector.name} 
                      className="w-6 h-6 rounded"
                    />
                  )}
                  <span className="font-medium">{connector.name}</span>
                </Button>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};
