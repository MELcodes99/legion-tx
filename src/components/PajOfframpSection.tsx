import { PajOfframpForm } from "@/components/PajOfframpForm";
import pajLogo from "@/assets/paj-logo.jpeg.asset.json";

export const PajOfframpSection = () => {
  return (
    <section className="mt-20 md:mt-28">
      <div className="max-w-2xl mx-auto text-center">
        <img
          src={pajLogo.url}
          alt="Paj Cash"
          className="mx-auto w-14 h-14 rounded-2xl mb-4 shadow-lg"
        />
        <h2 className="text-4xl md:text-5xl font-bold tracking-tight" style={{ color: "#1E5BFF" }}>
          Gas Abstracted Offramp with Paj Cash
        </h2>
        <p className="mt-3 text-sm md:text-[15px] text-muted-foreground leading-relaxed">
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
