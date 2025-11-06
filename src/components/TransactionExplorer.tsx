import { ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface TransactionExplorerProps {
  signature: string;
  label?: string;
}

export const TransactionExplorer = ({ signature, label = 'View Transaction' }: TransactionExplorerProps) => {
  return (
    <Button
      variant="outline"
      size="sm"
      className="gap-2"
      onClick={() => window.open(`https://solscan.io/tx/${signature}`, '_blank')}
    >
      {label}
      <ExternalLink className="h-3 w-3" />
    </Button>
  );
};
