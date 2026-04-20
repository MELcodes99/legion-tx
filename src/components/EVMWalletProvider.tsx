import { ReactNode } from 'react';
import { WagmiProvider, createConfig, http, fallback } from 'wagmi';
import { mainnet, base } from 'wagmi/chains';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { injected } from 'wagmi/connectors';

// Use fallback transports with multiple reliable public RPCs
const config = createConfig({
  chains: [mainnet, base],
  connectors: [
    injected({
      shimDisconnect: true,
    }),
  ],
  transports: {
    [mainnet.id]: fallback([
      http('https://ethereum-rpc.publicnode.com', { retryCount: 3 }),
      http('https://1rpc.io/eth', { retryCount: 2 }),
      http('https://cloudflare-eth.com', { retryCount: 1 }),
    ]),
    [base.id]: fallback([
      http('https://base-rpc.publicnode.com', { retryCount: 3 }),
      http('https://mainnet.base.org', { retryCount: 2 }),
      http('https://1rpc.io/base', { retryCount: 1 }),
    ]),
  },
  // Disable storage to prevent auto-reconnect on page load
  storage: null,
  // Disable auto-reconnect behavior
  syncConnectedChain: false,
  // Enable multi-injected provider discovery to detect Phantom, MetaMask, etc.
  multiInjectedProviderDiscovery: true,
});

// Use a separate query client for wagmi to avoid conflicts
const wagmiQueryClient = new QueryClient();

interface EVMWalletProviderProps {
  children: ReactNode;
}

export const EVMWalletProvider = ({ children }: EVMWalletProviderProps) => {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={wagmiQueryClient}>
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  );
};

export { config as wagmiConfig };
