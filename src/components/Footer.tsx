import legionLogo from "@/assets/legion-logo.png";

export const Footer = () => {
  return (
    <footer className="container mx-auto px-4 sm:px-6 py-8 mt-16 border-t border-white/[0.06]">
      <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <img src={legionLogo} alt="Legion" className="w-5 h-5" />
          <span className="text-sm font-semibold tracking-tight text-foreground">Legion</span>
          <span className="text-xs text-muted-foreground hidden sm:inline">
            · Multi-chain flexible gas transfers
          </span>
        </div>
        <p className="text-xs text-muted-foreground">© 2025 Legion. All rights reserved.</p>
      </div>
    </footer>
  );
};
