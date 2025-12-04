import { FC, ReactNode, useMemo } from 'react';
import { ConnectionProvider, WalletProvider as SolanaWalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { useStandardWalletAdapters } from '@solana/wallet-standard-wallet-adapter-react';

// Import wallet adapter CSS
import '@solana/wallet-adapter-react-ui/styles.css';

interface WalletProviderProps {
  children: ReactNode;
}

// Inner component to use the hook
const WalletProviderInner: FC<WalletProviderProps> = ({ children }) => {
  // Auto-detect wallets via wallet-standard (Phantom, Solflare, etc.)
  const wallets = useStandardWalletAdapters([]);

  return (
    <SolanaWalletProvider wallets={wallets} autoConnect>
      <WalletModalProvider>
        {children}
      </WalletModalProvider>
    </SolanaWalletProvider>
  );
};

export const WalletProvider: FC<WalletProviderProps> = ({ children }) => {
  // Use a reliable public RPC endpoint
  const endpoint = useMemo(() => {
    const reliableEndpoint = 'https://solana-rpc.publicnode.com';
    console.log('Using RPC endpoint:', reliableEndpoint);
    return reliableEndpoint;
  }, []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProviderInner>
        {children}
      </WalletProviderInner>
    </ConnectionProvider>
  );
};