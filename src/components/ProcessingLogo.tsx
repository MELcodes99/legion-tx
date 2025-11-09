import legionLogo from '@/assets/legion-logo.png';

interface ProcessingLogoProps {
  isProcessing: boolean;
  className?: string;
}

export const ProcessingLogo = ({ isProcessing, className = '' }: ProcessingLogoProps) => {
  return (
    <div className={`relative ${className}`}>
      <img 
        src={legionLogo} 
        alt="Processing" 
        className={`w-full h-full ${isProcessing ? 'animate-pulse-glow animate-spin-slow' : ''}`}
      />
      {isProcessing && (
        <div className="absolute inset-0 rounded-full blur-xl opacity-50 bg-gradient-to-r from-primary to-accent animate-pulse" />
      )}
    </div>
  );
};
