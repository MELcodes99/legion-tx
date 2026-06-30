import { PajOfframpForm } from "@/components/PajOfframpForm";

export const PajOfframpSection = () => {
  return (
    <section className="mt-20 md:mt-28">
      <div className="max-w-2xl mx-auto text-center">
        {/* Logo placeholder — drop the Paj asset here later */}
        <div className="mx-auto w-12 h-12 rounded-xl bg-white/[0.04] border border-white/10 flex items-center justify-center text-[10px] text-muted-foreground mb-4">
          LOGO
        </div>
        <h2 className="text-2xl md:text-3xl font-semibold tracking-tight text-foreground">
          Gas Abstracted Offramp with Paj Cash
        </h2>
        <p className="mt-2 text-sm md:text-[15px] text-muted-foreground leading-relaxed">
          Offramp crypto into your Nigerian Bank account without Native gas fees. Just Paj it.
        </p>
      </div>

      <div className="mt-6 max-w-md mx-auto">
        <PajOfframpForm />
      </div>

      <p className="mt-4 text-center text-xs text-muted-foreground">
        Powered by{" "}
        <a
          href="https://paj.cash/"
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2 hover:text-foreground"
        >
          Paj.cash
        </a>
      </p>
    </section>
  );
};
