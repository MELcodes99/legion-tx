import { WalletProvider } from '@/components/WalletProvider';
import { WalletButton } from '@/components/WalletButton';
import { TransferForm } from '@/components/TransferForm';
import { FAQ } from '@/components/FAQ';

import { Footer } from '@/components/Footer';
import { Zap } from 'lucide-react';

const Index = () => {
  return (
    <WalletProvider>
      <div className="min-h-screen bg-background relative overflow-hidden">
        {/* Gradient glow background effect */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,hsl(195_100%_50%/0.15)_0%,transparent_70%)] pointer-events-none" />
        
        <div className="relative z-10">
          {/* Header */}
          <header className="container mx-auto px-4 py-6">
            <nav className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-gradient-to-br from-primary to-accent">
                  <Zap className="w-6 h-6 text-primary-foreground" />
                </div>
              <div>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                  Legion
                </h1>
              </div>
              </div>
              <WalletButton />
            </nav>
          </header>

          {/* Main Content */}
          <main className="container mx-auto px-4 py-12">
            <div className="max-w-4xl mx-auto text-center mb-12">
              <h2 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-foreground to-foreground/80 bg-clip-text text-transparent">
                Send Tokens Without Gas Fees
              </h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                Send tokens without having gas fees.
                Simple, fast, and secure blockchain transfers.
              </p>
            </div>


            {/* Transfer Form */}
            <div className="flex justify-center">
              <TransferForm />
            </div>

            {/* Features */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto mt-16">
              {[
                {
                  title: 'Zero Gas Fees',
                  description: 'We cover all transaction fees so you can focus on what matters',
                },
                {
                  title: '0.5% Service Fee',
                  description: 'Transparent pricing with automatic fee calculation',
                },
                {
                  title: 'Secure & Fast',
                  description: 'Built on Solana for lightning-fast, secure transactions',
                },
              ].map((feature, i) => (
                <div
                  key={i}
                  className="glass-card p-6 rounded-xl transition-all hover:scale-105 cursor-default"
                >
                  <h3 className="text-lg font-semibold mb-2 text-primary">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground">{feature.description}</p>
                </div>
              ))}
            </div>

            {/* FAQ Section */}
            <div className="mt-20">
              <FAQ />
            </div>
          </main>

          {/* Footer */}
          <Footer />
        </div>
      </div>
    </WalletProvider>
  );
};

export default Index;
