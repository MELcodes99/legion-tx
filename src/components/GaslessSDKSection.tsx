import { Github, Code2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const SDK_CODE = `import { GaslessSDK } from "legion-gasless-sdk";
import { Transaction, SystemProgram } from "@solana/web3.js";

// Auto-loads ./config.json + ./sponsor-wallet.json
const sdk = new GaslessSDK();

// Build any normal Solana transaction
const tx = new Transaction().add(
  SystemProgram.transfer({
    fromPubkey: user.publicKey,
    toPubkey: recipient,
    lamports: 1_000,
  })
);

// Wrap it — sponsor pays SOL, user pays $0.05 USDC
const gaslessTx = await sdk.makeGasless({
  transaction: tx,
  userPublicKey: user.publicKey,
  feeToken: "USDC",
});

gaslessTx.partialSign(userKeypair);
const sig = await sdk.sendAndConfirm(gaslessTx);`;

// Minimal Prism-free purple syntax highlighting
const highlight = (code: string) => {
  const escape = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  let html = escape(code);
  // comments
  html = html.replace(/(\/\/[^\n]*)/g, '<span class="text-purple-400/60 italic">$1</span>');
  // strings
  html = html.replace(/("[^"]*"|'[^']*')/g, '<span class="text-fuchsia-300">$1</span>');
  // keywords
  html = html.replace(
    /\b(import|from|const|await|new|async|return)\b/g,
    '<span class="text-purple-300 font-semibold">$1</span>'
  );
  // classes / Capitalized
  html = html.replace(
    /\b(GaslessSDK|Transaction|SystemProgram)\b/g,
    '<span class="text-violet-300">$1</span>'
  );
  // numbers
  html = html.replace(/\b(\d[\d_]*)\b/g, '<span class="text-pink-300">$1</span>');
  return html;
};

export const GaslessSDKSection = () => {
  return (
    <div className="max-w-5xl mx-auto">
      <div className="text-center mb-10">
        <div className="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.14em] text-purple-300/80 mb-3">
          <Code2 className="w-3.5 h-3.5" />
          For developers
        </div>
        <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground">
          Introducing{" "}
          <span className="bg-gradient-to-r from-purple-400 via-fuchsia-400 to-violet-400 bg-clip-text text-transparent">
            Legion Gasless SDK
          </span>
        </h2>
        <p className="mt-4 text-[15px] text-muted-foreground leading-relaxed max-w-2xl mx-auto">
          Drop-in TypeScript SDK that lets your users sign Solana transactions
          with <span className="text-foreground">zero SOL</span>. Your sponsor
          wallet pays the gas, the SDK collects a small fee in USDC, USDT, or
          any SPL token you configure — bundled atomically into a single
          transaction.
        </p>
      </div>

      <div
        className="relative rounded-2xl border border-purple-500/20 bg-gradient-to-br from-purple-950/40 via-violet-950/30 to-fuchsia-950/20 backdrop-blur-xl p-1 shadow-[0_0_60px_-15px_rgba(168,85,247,0.35)]"
      >
        {/* glow */}
        <div className="absolute -inset-px rounded-2xl bg-gradient-to-br from-purple-500/10 to-fuchsia-500/5 pointer-events-none" />

        <div className="relative rounded-xl bg-[#13091f]/80 border border-purple-500/10 overflow-hidden">
          {/* window chrome */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-purple-500/10 bg-black/20">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
              <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/60" />
              <span className="w-2.5 h-2.5 rounded-full bg-green-500/60" />
            </div>
            <span className="text-[11px] font-mono text-purple-300/60">
              example.ts
            </span>
            <span className="text-[11px] font-mono text-purple-300/40">
              legion-gasless-sdk
            </span>
          </div>

          <pre className="overflow-x-auto p-5 md:p-6 text-[13px] leading-relaxed font-mono text-purple-100/90">
            <code dangerouslySetInnerHTML={{ __html: highlight(SDK_CODE) }} />
          </pre>
        </div>
      </div>

      <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
        <Button
          asChild
          size="lg"
          className="bg-gradient-to-r from-purple-600 to-fuchsia-600 hover:from-purple-500 hover:to-fuchsia-500 text-white border-0 shadow-[0_0_30px_-8px_rgba(168,85,247,0.6)]"
        >
          <a
            href="https://github.com/your-org/legion-gasless-sdk"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Github className="w-4 h-4 mr-2" />
            View on GitHub
          </a>
        </Button>
        <span className="text-xs text-muted-foreground">
          MIT licensed · Clone, configure, ship in minutes
        </span>
      </div>
    </div>
  );
};
