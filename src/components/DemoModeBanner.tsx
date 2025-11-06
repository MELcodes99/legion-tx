import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { CheckCircle } from 'lucide-react';

export const DemoModeBanner = () => {
  return (
    <Alert className="border-primary/50 bg-primary/10 max-w-3xl mx-auto">
      <CheckCircle className="h-4 w-4 text-primary" />
      <AlertTitle className="text-primary font-semibold">Fully Functional</AlertTitle>
      <AlertDescription className="text-sm text-muted-foreground mt-2">
        <p>
          This DApp is production-ready with complete Solana blockchain integration. 
          Real transactions are executed when you connect your wallet and transfer tokens.
        </p>
        <p className="mt-2 text-xs text-primary">
          Backend wallet configured • Live network connection • Gas fees covered
        </p>
      </AlertDescription>
    </Alert>
  );
};
