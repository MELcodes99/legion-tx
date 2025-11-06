import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export const FAQ = () => {
  const faqs = [
    {
      question: 'How does gasless transfer work?',
      answer:
        'When you initiate a transfer, you sign a transaction from your wallet. Our backend wallet receives your tokens and immediately forwards them to the recipient, covering all network gas fees. You only pay a 0.5% service fee.',
    },
    {
      question: 'What is the service fee?',
      answer:
        'We charge a flat 0.5% service fee on each transfer. This fee covers our operational costs and allows us to pay for network gas fees on your behalf. The fee is automatically calculated and displayed before you confirm any transaction.',
    },
    {
      question: 'Is there a minimum transfer amount?',
      answer:
        'Yes, the minimum transfer amount is $5 USD equivalent in SOL. This ensures the transaction is economically viable after the service fee is deducted.',
    },
    {
      question: 'Which wallets are supported?',
      answer:
        'We currently support Phantom and Solflare wallets. These are two of the most popular and secure Solana wallets. Simply click the "Connect Wallet" button to get started.',
    },
    {
      question: 'How long does a transfer take?',
      answer:
        'Transfers are typically completed within a few seconds, thanks to Solana\'s high-speed blockchain. You\'ll receive a confirmation once both transactions (yours and the backend relay) are complete.',
    },
    {
      question: 'Is it safe?',
      answer:
        'Yes! You maintain full control of your wallet and only sign the exact transaction you intend. Our backend wallet is secured with industry-standard practices, and all transactions are recorded on the Solana blockchain for transparency.',
    },
  ];

  return (
    <Card className="glass-card w-full max-w-3xl mx-auto">
      <CardHeader>
        <CardTitle className="text-2xl font-bold text-center bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
          Frequently Asked Questions
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Accordion type="single" collapsible className="w-full">
          {faqs.map((faq, index) => (
            <AccordionItem key={index} value={`item-${index}`}>
              <AccordionTrigger className="text-left font-semibold">
                {faq.question}
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground">
                {faq.answer}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </CardContent>
    </Card>
  );
};
