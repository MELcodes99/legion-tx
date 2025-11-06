import { CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface StatusBadgeProps {
  status: 'idle' | 'processing' | 'success' | 'error';
  message?: string;
}

export const StatusBadge = ({ status, message }: StatusBadgeProps) => {
  const getStatusConfig = () => {
    switch (status) {
      case 'processing':
        return {
          icon: <Loader2 className="h-3 w-3 animate-spin" />,
          text: message || 'Processing...',
          className: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
        };
      case 'success':
        return {
          icon: <CheckCircle className="h-3 w-3" />,
          text: message || 'Success',
          className: 'bg-green-500/10 text-green-500 border-green-500/20',
        };
      case 'error':
        return {
          icon: <AlertCircle className="h-3 w-3" />,
          text: message || 'Error',
          className: 'bg-red-500/10 text-red-500 border-red-500/20',
        };
      default:
        return null;
    }
  };

  const config = getStatusConfig();
  if (!config) return null;

  return (
    <Badge variant="outline" className={`flex items-center gap-1.5 ${config.className}`}>
      {config.icon}
      <span className="text-xs font-medium">{config.text}</span>
    </Badge>
  );
};
