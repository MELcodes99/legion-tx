import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';

export const FAQ = () => {
  const faqs = [{
    question: 'What is Legion?',
    answer: 'Legion is a multi-chain gasless transfer service that allows you to send USDT and USDC tokens on Solana and Sui blockchains without needing native tokens (SOL/SUI) for gas fees. We cover all transaction costs on your behalf.'
  }, {
    question: 'Which blockchains are supported?',
    answer: 'Legion currently supports Solana and Sui blockchains. You can send USDT and USDC on both chains. We plan to add more chains in the future.'
  }, {
    question: 'What are the fees?',
    answer: 'Legion charges a fixed multichain gas fee per transaction: $0.50 for Solana transfers and $0.40 for Sui transfers. This covers all blockchain network fees. The minimum transfer amount is $5.'
  }, {
    question: 'Do I need SOL or SUI in my wallet?',
    answer: 'No. You don\'t need any SOL or SUI to send tokens. Our backend wallet pays all the network gas fees for you. You only pay the small fixed multichain gas fee.'
  }, {
    question: 'Is it safe?',
    answer: 'Yes. Legion uses atomic transactions that ensure either the entire transfer completes successfully or nothing happens. Your tokens never leave your control until the transaction is fully validated and signed by you.'
  }, {
    question: 'What wallets are supported?',
    answer: 'For Solana: Phantom, Solflare, and other Solana-compatible wallets. For Sui: Sui Wallet, Suiet, and other Sui-compatible wallets. Simply connect your preferred wallet to get started.'
  }, {
    question: 'What happens if a transfer fails?',
    answer: 'If a transfer fails for any reason, your tokens remain safely in your wallet. No fees are charged for failed transactions. You can retry the transfer at any time.'
  }];

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          Support
        </div>
        <h2 className="mt-1 text-xl md:text-2xl font-semibold tracking-tight text-foreground">
          Frequently asked questions
        </h2>
      </div>
      <div className="surface-card overflow-hidden">
        <Accordion type="single" collapsible className="w-full divide-y divide-white/[0.06]">
          {faqs.map((faq, index) => (
            <AccordionItem
              key={index}
              value={`item-${index}`}
              className="border-0 px-5 md:px-6"
            >
              <AccordionTrigger className="text-left text-sm md:text-[15px] font-medium text-foreground hover:no-underline py-4 hover:text-foreground/90">
                {faq.question}
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground text-sm leading-relaxed pb-5 pr-6">
                {faq.answer}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </div>
  );
};
