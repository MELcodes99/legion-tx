

export const Footer = () => {
  return (
    <footer className="container mx-auto px-4 py-8 mt-20 border-t border-border/50">
      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* About */}
          <div>
            <h3 className="font-semibold text-lg mb-3 bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              Legion
            </h3>
            <p className="text-sm text-muted-foreground">
              Built on Solana for lightning-fast token transfers without the burden of gas fees.
            </p>
          </div>

          {/* Stats */}
          <div>
            <h3 className="font-semibold mb-3">Network Info</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>Network: Solana Mainnet Beta</li>
              <li>Service Fee: 0.5%</li>
              <li>Minimum Transfer: $5 USD</li>
              <li>Average Speed: ~2 seconds</li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="mt-8 pt-6 border-t border-border/30 flex justify-center">
          <p className="text-sm text-muted-foreground">
            © 2025 Legion.
          </p>
        </div>
      </div>
    </footer>
  );
};
