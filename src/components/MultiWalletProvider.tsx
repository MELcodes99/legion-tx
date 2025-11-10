import { ReactNode } from 'react';
import { WalletProvider as SolanaWalletProvider } from './WalletProvider';
import { SuiWalletProvider } from './SuiWalletProvider';

export const MultiWalletProvider = ({ children }: { children: ReactNode }) => {
  return (
    <SolanaWalletProvider>
      <SuiWalletProvider>
        {children}
      </SuiWalletProvider>
    </SolanaWalletProvider>
  );
};
