export const Footer = () => {
  return <footer className="container mx-auto px-4 py-6 sm:py-8 mt-12 sm:mt-20 border-t border-border/50">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-center">
          {/* About */}
          <div className="text-center">
            <h3 className="font-semibold text-base sm:text-lg mb-2 sm:mb-3 bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent font-serif">
              Legion
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed font-serif sm:text-base">Multi-chain Flexible gas transfers across Solana, Sui, Base & Ethereum.</p>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="mt-6 sm:mt-8 pt-4 sm:pt-6 border-t border-border/30 flex justify-center">
          <p className="text-xs sm:text-sm text-muted-foreground">
            © 2025 Legion.
          </p>
        </div>
      </div>
    </footer>;
};