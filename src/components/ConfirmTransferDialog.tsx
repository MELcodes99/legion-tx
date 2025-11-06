import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Loader2 } from 'lucide-react';

interface ConfirmTransferDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  recipient: string;
  amount: number;
  fee: number;
  amountAfterFee: number;
  tokenSymbol: string;
  isLoading: boolean;
}

export const ConfirmTransferDialog = ({
  open,
  onOpenChange,
  onConfirm,
  recipient,
  amount,
  fee,
  amountAfterFee,
  tokenSymbol,
  isLoading,
}: ConfirmTransferDialogProps) => {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="glass-card border-primary/20">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-xl">Confirm Transfer</AlertDialogTitle>
          <AlertDialogDescription className="space-y-3 pt-2">
            <div className="text-base text-foreground">
              Review the transfer details before confirming:
            </div>
            
            <div className="rounded-lg bg-secondary/30 p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Recipient:</span>
                <span className="font-mono font-medium">
                  {recipient.slice(0, 6)}...{recipient.slice(-6)}
                </span>
              </div>
              
              <div className="flex justify-between">
                <span className="text-muted-foreground">Amount:</span>
                <span className="font-semibold">${amount.toFixed(2)} {tokenSymbol}</span>
              </div>
              
              <div className="flex justify-between">
                <span className="text-muted-foreground">Service Fee (0.5%):</span>
                <span className="font-medium text-yellow-500">-${fee.toFixed(2)} {tokenSymbol}</span>
              </div>
              
              <div className="border-t border-border/30 pt-2 mt-2">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground font-semibold">Recipient Receives:</span>
                  <span className="font-bold text-primary text-lg">${amountAfterFee.toFixed(2)} {tokenSymbol}</span>
                </div>
              </div>
            </div>

            <div className="text-xs text-muted-foreground bg-secondary/20 p-3 rounded border border-border/30">
              <div className="font-semibold mb-1 text-primary">✓ Gasless Transaction</div>
              Network fees will be paid by our backend wallet. You only pay the 0.5% service fee.
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              onConfirm();
            }}
            disabled={isLoading}
            className="bg-gradient-to-r from-primary to-accent hover:opacity-90"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              'Confirm Transfer'
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
