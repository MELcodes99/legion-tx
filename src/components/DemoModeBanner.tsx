import { Alert, AlertDescription } from '@/components/ui/alert';
import { Info } from 'lucide-react';
import { Badge } from './ui/badge';

export const DemoModeBanner = () => {
  return (
    <Alert className="glass-card border-primary/30 bg-primary/5">
      <Info className="h-4 w-4" />
      <AlertDescription className="flex flex-col gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold">Multi-Chain Status:</span>
          <Badge variant="default" className="bg-green-500/20 text-green-500 border-green-500/30">
            ✓ Solana Live
          </Badge>
          <Badge variant="secondary" className="bg-blue-500/20 text-blue-500 border-blue-500/30">
            🔄 Sui Ready (Testing)
          </Badge>
        </div>
        <div className="text-sm text-muted-foreground">
          Solana transfers are fully operational with fixed $0.50 gas fee. 
          Sui integration is ready and undergoing final testing before full launch.
        </div>
      </AlertDescription>
    </Alert>
  );
};
