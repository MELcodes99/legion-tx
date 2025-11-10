

export const Footer = () => {
  return (
    <footer className="container mx-auto px-4 py-6 sm:py-8 mt-12 sm:mt-20 border-t border-border/50">
      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-8">
          {/* About */}
          <div>
            <h3 className="font-semibold text-base sm:text-lg mb-2 sm:mb-3 bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              Legion
            </h3>
            <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
              Built on Solana for lightning-fast token transfers without the burden of gas fees.
            </p>
          </div>

          {/* Stats */}
          <div>
            <h3 className="font-semibold mb-2 sm:mb-3 text-sm sm:text-base">Network Info</h3>
            <ul className="space-y-1.5 sm:space-y-2 text-xs sm:text-sm text-muted-foreground">
              <li>Network: Solana Mainnet Beta</li>
              <li>Service Fee: 0.5%</li>
              <li>Minimum Transfer: $5 USD</li>
              <li>Average Speed: ~2 seconds</li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="mt-6 sm:mt-8 pt-4 sm:pt-6 border-t border-border/30 flex justify-center">
          <p className="text-xs sm:text-sm text-muted-foreground">
            © 2025 Legion.
          </p>
        </div>
      </div>
    </footer>
  );
};
