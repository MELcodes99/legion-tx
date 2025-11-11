import { MultiWalletProvider } from '@/components/MultiWalletProvider';
import { UnifiedWalletButton } from '@/components/UnifiedWalletButton';
import { MultiChainTransferForm } from '@/components/MultiChainTransferForm';
import { CrossChainGasTransfer } from '@/components/CrossChainGasTransfer';
import { FAQ } from '@/components/FAQ';
import { Footer } from '@/components/Footer';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import legionLogo from '@/assets/legion-logo.png';
import xLogo from '@/assets/x-logo.png';

const Index = () => {
  return (
    <MultiWalletProvider>
      <div className="min-h-screen bg-background relative overflow-hidden">
        {/* Neon gradient background effects */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,hsl(280_100%_60%/0.2)_0%,transparent_50%)] pointer-events-none" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,hsl(195_100%_50%/0.15)_0%,transparent_50%)] pointer-events-none" />
        
        <div className="relative z-10">
          {/* Header */}
          <header className="container mx-auto px-4 py-4 md:py-6">
            <nav className="flex items-center justify-between">
              <div className="flex items-center gap-2 md:gap-3">
                <img 
                  src={legionLogo} 
                  alt="Legion" 
                  className="w-10 h-10 md:w-12 md:h-12 neon-glow-purple"
                />
                <div>
                  <h1 className="text-xl md:text-2xl font-bold bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent">
                    Legion
                  </h1>
                </div>
              </div>
              <div className="flex items-center gap-2 md:gap-3">
                <a 
                  href="https://x.com/use_legion" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="hover:opacity-80 transition-opacity"
                >
                  <img 
                    src={xLogo} 
                    alt="Follow us on X" 
                    className="w-8 h-8 md:w-9 md:h-9"
                  />
                </a>
                <UnifiedWalletButton />
              </div>
            </nav>
          </header>

          {/* Main Content */}
          <main className="container mx-auto px-4 py-6 sm:py-8 md:py-12">
            <div className="max-w-4xl mx-auto text-center mb-6 sm:mb-8 md:mb-12 px-2">
              <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold mb-2 sm:mb-3 md:mb-4 bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent animate-pulse-glow leading-tight">
                Multi-Chain Gasless Transfers
              </h2>
              <p className="text-sm sm:text-base md:text-lg text-muted-foreground max-w-2xl mx-auto px-2">
                Send USDT & USDC across Solana and Sui without gas fees.
                Simple, fast, and secure multi-chain transfers.
              </p>
            </div>

            {/* Transfer Form */}
            <div className="flex justify-center px-2">
              <Tabs defaultValue="gasless" className="w-full max-w-4xl">
                <TabsList className="grid w-full grid-cols-2 mb-6 h-auto p-1">
                  <TabsTrigger value="gasless" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground py-3">
                    Regular Gasless
                  </TabsTrigger>
                  <TabsTrigger value="crosschain" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground py-3">
                    Cross-Chain Gas
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="gasless">
                  <MultiChainTransferForm />
                </TabsContent>
                <TabsContent value="crosschain">
                  <CrossChainGasTransfer />
                </TabsContent>
              </Tabs>
            </div>

            {/* Features */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4 md:gap-6 max-w-4xl mx-auto mt-8 sm:mt-12 md:mt-16 px-2">
              {[
                {
                  title: 'Zero Gas Fees',
                  description: 'We cover all transaction fees so you can focus on what matters',
                },
                {
                  title: 'Multichain Gas Fee',
                  description: 'Fixed fee: $0.50 (Solana) | $0.40 (Sui) - transparent and predictable',
                },
                {
                  title: 'Multi-Chain Support',
                  description: 'Send USDT & USDC across Solana and Sui blockchains',
                },
              ].map((feature, i) => (
                <div
                  key={i}
                  className="glass-card p-4 sm:p-5 md:p-6 rounded-xl transition-all hover:scale-105 cursor-default border-2 border-primary/20 hover:border-primary/40"
                >
                  <h3 className="text-sm sm:text-base md:text-lg font-semibold mb-1.5 sm:mb-2 bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">{feature.title}</h3>
                  <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
                </div>
              ))}
            </div>

            {/* FAQ Section */}
            <div className="mt-12 sm:mt-16 md:mt-20 px-2">
              <FAQ />
            </div>
          </main>

          {/* Footer */}
          <Footer />
        </div>
      </div>
    </MultiWalletProvider>
  );
};

export default Index;
