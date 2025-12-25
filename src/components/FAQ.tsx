import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
    answer: 'No! That\'s the beauty of Legion. You don\'t need any SOL or SUI to send tokens. Our backend wallet pays all the network gas fees for you. You only pay the small fixed multichain gas fee.'
  }, {
    question: 'Is it safe?',
    answer: 'Yes! Legion uses atomic transactions that ensure either the entire transfer completes successfully or nothing happens. Your tokens never leave your control until the transaction is fully validated and signed by you.'
  }, {
    question: 'What wallets are supported?',
    answer: 'For Solana: Phantom, Solflare, and other Solana-compatible wallets. For Sui: Sui Wallet, Suiet, and other Sui-compatible wallets. Simply connect your preferred wallet to get started.'
  }, {
    question: 'What happens if a transfer fails?',
    answer: 'If a transfer fails for any reason, your tokens remain safely in your wallet. No fees are charged for failed transactions. You can retry the transfer at any time.'
  }];
  return <Card className="glass-card w-full max-w-3xl mx-auto">
      <CardHeader className="p-4 sm:p-6 border-zinc-500 bg-black">
        <CardTitle className="text-xl sm:text-2xl font-bold text-center bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
          Frequently Asked Questions
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 sm:p-6 bg-black">
        <Accordion type="single" collapsible className="w-full">
          {faqs.map((faq, index) => <AccordionItem key={index} value={`item-${index}`}>
              <AccordionTrigger className="text-left font-semibold text-sm sm:text-base hover:no-underline">
                {faq.question}
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground text-xs sm:text-sm leading-relaxed">
                {faq.answer}
              </AccordionContent>
            </AccordionItem>)}
        </Accordion>
      </CardContent>
    </Card>;
};