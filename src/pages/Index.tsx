import { MultiWalletProvider } from "@/components/MultiWalletProvider";
import { UnifiedWalletButton } from "@/components/UnifiedWalletButton";
import { MultiChainTransferForm } from "@/components/MultiChainTransferForm";

import { FAQ } from "@/components/FAQ";
import { Footer } from "@/components/Footer";
import legionLogo from "@/assets/legion-logo.png";
import solanaLogo from "@/assets/solana-logo.png";
import suiLogo from "@/assets/sui-logo.png";
import baseLogo from "@/assets/base-logo.jpeg";
import ethLogo from "@/assets/eth-logo.jpeg";
import { Zap, Shield, Layers } from "lucide-react";

const SUPPORTED_CHAINS = [
  { name: "Solana", logo: solanaLogo },
  { name: "Sui", logo: suiLogo },
  { name: "Base", logo: baseLogo },
  { name: "Ethereum", logo: ethLogo },
];

const FEATURES = [
  {
    icon: Zap,
    title: "Flexible gas",
    description: "Pay network fees with the same token you're sending. No native gas required.",
    stat: "USDC · USDT · SPL",
  },
  {
    icon: Shield,
    title: "Atomic execution",
    description: "Transfers settle in a single signed transaction or revert entirely. No partial state.",
    stat: "Non-custodial",
  },
  {
    icon: Layers,
    title: "Transparent fees",
    description: "Fixed network coverage per chain. No spreads, no slippage on the fee itself.",
    stat: "$0.40 – $0.50",
  },
];

const Index = () => {
  return (
    <MultiWalletProvider>
      <div className="min-h-screen bg-background relative">
        <div className="relative z-10">
          {/* Header */}
          <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-background/70 backdrop-blur-xl">
            <nav className="container mx-auto px-4 sm:px-6 h-14 md:h-16 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <img src={legionLogo} alt="Legion" className="w-7 h-7 md:w-8 md:h-8" />
                <span className="text-[15px] md:text-base font-semibold tracking-tight text-foreground">
                  Legion
                </span>
                <span className="hidden sm:inline-flex items-center text-[10px] font-medium uppercase tracking-wider text-muted-foreground border border-white/10 rounded-full px-2 py-0.5 ml-2">
                  Mainnet
                </span>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href="https://x.com/use_legion"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hidden sm:flex items-center justify-center w-9 h-9 rounded-lg border border-white/[0.06] hover:border-white/15 hover:bg-white/[0.03] transition-colors"
                  aria-label="Follow on X"
                >
                  <img alt="X" className="w-4 h-4" src="/lovable-uploads/0bfe1a7e-3715-4490-bdd6-a69e1f7a1f1c.jpg" />
                </a>
                <UnifiedWalletButton />
              </div>
            </nav>
          </header>

          {/* Hero / Main */}
          <main className="container mx-auto px-4 sm:px-6 pt-10 sm:pt-14 md:pt-20 pb-16">
            <div className="grid lg:grid-cols-[1.05fr_minmax(0,460px)] gap-10 lg:gap-14 items-start">
              {/* Left column */}
              <div className="max-w-xl">
                <span className="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground border border-white/[0.08] bg-white/[0.02] rounded-full px-3 py-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/90 shadow-[0_0_0_3px_rgba(16,185,129,0.15)]" />
                  Gasless infrastructure · Live
                </span>

                <h1 className="mt-6 text-4xl sm:text-5xl md:text-[3.4rem] font-bold leading-[1.05] tracking-tight text-foreground">
                  Multi-chain transfers,
                  <br />
                  <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                    without the gas friction.
                  </span>
                </h1>

                <p className="mt-5 text-[15px] sm:text-base text-muted-foreground leading-relaxed max-w-lg">
                  Send stablecoins and supported tokens across Solana, Sui, Base, and Ethereum.
                  Pay network fees in the token you're already holding — no native gas balance required.
                </p>

                {/* Supported chains strip */}
                <div className="mt-8">
                  <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground mb-3">
                    Supported networks
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {SUPPORTED_CHAINS.map((c) => (
                      <div
                        key={c.name}
                        className="inline-flex items-center gap-2 rounded-full border border-white/[0.06] bg-white/[0.02] hover:border-white/15 hover:bg-white/[0.04] transition-colors px-3 py-1.5"
                      >
                        <img src={c.logo} alt={c.name} className="w-4 h-4 rounded-full" />
                        <span className="text-xs font-medium text-foreground/90">{c.name}</span>
                      </div>
                    ))}
                  </div>
                </div>


              {/* Right column — transfer widget */}
              <div className="lg:sticky lg:top-24 w-full flex justify-center lg:justify-end">
                <MultiChainTransferForm />
              </div>
            </div>

            {/* Features */}
            <section className="mt-20 md:mt-28">
              <div className="flex items-end justify-between mb-6">
                <div>
                  <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                    Platform
                  </div>
                  <h2 className="mt-1 text-xl md:text-2xl font-semibold tracking-tight text-foreground">
                    Built for predictable settlement
                  </h2>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {FEATURES.map((f) => (
                  <div
                    key={f.title}
                    className="surface-card p-5 md:p-6 transition-colors hover:border-white/15"
                  >
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-white/[0.04] border border-white/[0.06] text-primary mb-4">
                      <f.icon className="w-4.5 h-4.5" strokeWidth={1.75} />
                    </div>
                    <h3 className="text-[15px] font-semibold text-foreground tracking-tight">
                      {f.title}
                    </h3>
                    <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
                      {f.description}
                    </p>
                    <div className="mt-4 pt-4 border-t border-white/[0.06] text-xs font-medium text-foreground/70">
                      {f.stat}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* FAQ Section */}
            <section className="mt-20 md:mt-28">
              <FAQ />
            </section>
          </main>

          <Footer />
        </div>
      </div>
    </MultiWalletProvider>
  );
};

export default Index;
