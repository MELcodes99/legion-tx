import { useEffect, useState } from 'react';
import { MultiChainTransferForm } from './MultiChainTransferForm';
import { SwapForm } from './SwapForm';
import { useSelectedNetwork } from '@/hooks/useSelectedNetwork';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

type Mode = 'send' | 'swap';

export const TransferOrSwapPanel = () => {
  const selectedNetwork = useSelectedNetwork();
  const [mode, setMode] = useState<Mode>('send');
  const swapDisabled = selectedNetwork !== null && selectedNetwork !== 'solana';

  // Auto-revert to Send if user switches off Solana while on Swap
  useEffect(() => {
    if (mode === 'swap' && swapDisabled) setMode('send');
  }, [mode, swapDisabled]);

  return (
    <div className="w-full max-w-md mx-auto flex flex-col items-center gap-3">
      {/* Glass toggle */}
      <div className="grid w-full grid-cols-2 gap-1.5 p-1 rounded-2xl bg-white/[0.04] backdrop-blur-xl border border-primary/20 shadow-[0_8px_32px_-12px_hsl(var(--primary)/0.35)]">
        <ToggleButton
          active={mode === 'send'}
          onClick={() => setMode('send')}
          label="Send"
        />
        {swapDisabled ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="contents">
                <ToggleButton
                  active={false}
                  onClick={() => {}}
                  label="Swap"
                  disabled
                />
              </span>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              Swap is only available on Solana
            </TooltipContent>
          </Tooltip>
        ) : (
          <ToggleButton
            active={mode === 'swap'}
            onClick={() => setMode('swap')}
            label="Swap"
          />
        )}
      </div>

      {mode === 'send' ? <MultiChainTransferForm /> : <SwapForm />}
    </div>
  );
};

const ToggleButton = ({
  active,
  onClick,
  label,
  disabled = false,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  disabled?: boolean;
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    aria-pressed={active}
    className={[
      'w-full h-9 sm:h-10 px-3 rounded-xl text-xs sm:text-sm font-medium transition-all',
      'backdrop-blur-md border whitespace-nowrap',
      active
        ? 'bg-gradient-to-b from-primary/30 to-primary-glow/20 border-primary/40 text-foreground shadow-[inset_0_1px_0_0_hsl(var(--primary)/0.25),0_4px_16px_-4px_hsl(var(--primary)/0.45)]'
        : 'bg-transparent border-transparent text-muted-foreground hover:bg-primary/10 hover:text-foreground',
      disabled ? 'opacity-40 cursor-not-allowed pointer-events-none' : '',
    ].join(' ')}
  >
    {label}
  </button>
);
