import { ReactNode } from 'react';
import { WalletProvider as SolanaWalletProvider } from './WalletProvider';
import { SuiWalletProvider } from './SuiWalletProvider';
import { EVMWalletProvider } from './EVMWalletProvider';

export const MultiWalletProvider = ({ children }: { children: ReactNode }) => {
  return (
    <EVMWalletProvider>
      <SolanaWalletProvider>
        <SuiWalletProvider>
          {children}
        </SuiWalletProvider>
      </SolanaWalletProvider>
    </EVMWalletProvider>
  );
};
