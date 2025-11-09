import { FC, ReactNode, useMemo, useEffect } from 'react';
import { ConnectionProvider, WalletProvider as SolanaWalletProvider, useConnection } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets';
import { clusterApiUrl } from '@solana/web3.js';

// Import wallet adapter CSS
import '@solana/wallet-adapter-react-ui/styles.css';

interface WalletProviderProps {
  children: ReactNode;
}

export const WalletProvider: FC<WalletProviderProps> = ({ children }) => {
  // Use a reliable public RPC endpoint - publicnode.com is more stable than the official public endpoint
  const endpoint = useMemo(() => {
    // Using publicnode.com which has better rate limits and reliability
    // Fallback endpoints if needed: 'https://solana.api.onfinality.io/public', 'https://solana.drpc.org'
    const reliableEndpoint = 'https://solana-rpc.publicnode.com';
    console.log('Using RPC endpoint:', reliableEndpoint);
    return reliableEndpoint;
  }, []);

  const wallets = useMemo(
    () => [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter(),
      // MetaMask and Jupiter support via wallet adapter auto-detection
    ],
    []
  );

  return (
    <ConnectionProvider endpoint={endpoint}>
      <SolanaWalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          {children}
        </WalletModalProvider>
      </SolanaWalletProvider>
    </ConnectionProvider>
  );
};
