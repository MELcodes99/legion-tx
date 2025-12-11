import { FC, ReactNode, useMemo } from 'react';
import { ConnectionProvider, WalletProvider as SolanaWalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';

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

  // Use empty wallets array - the wallet-standard protocol will auto-detect installed wallets
  // This avoids importing specific wallet adapters that have native dependencies (usb, node-hid)
  // Phantom, Solflare, and other standard wallets will be auto-detected
  const wallets = useMemo(() => [], []);

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
