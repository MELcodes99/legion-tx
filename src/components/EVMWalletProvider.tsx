import { ReactNode } from 'react';
import { WagmiProvider, createConfig, http } from 'wagmi';
import { mainnet, base } from 'wagmi/chains';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { injected } from 'wagmi/connectors';

// Use free public RPCs that don't require API keys
const config = createConfig({
  chains: [mainnet, base],
  connectors: [
    injected(),
  ],
  transports: {
    [mainnet.id]: http('https://cloudflare-eth.com'),
    [base.id]: http('https://mainnet.base.org'),
  },
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
