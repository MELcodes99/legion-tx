import { useConnection } from '@solana/wallet-adapter-react';
import { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Activity, AlertCircle } from 'lucide-react';

export const NetworkStatus = () => {
  const { connection } = useConnection();
  const [status, setStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [blockHeight, setBlockHeight] = useState<number | null>(null);

  useEffect(() => {
    const checkConnection = async () => {
      try {
        const height = await connection.getBlockHeight();
        setBlockHeight(height);
        setStatus('online');
      } catch (error) {
        console.error('Network connection error:', error);
        setStatus('offline');
      }
    };

    checkConnection();
    const interval = setInterval(checkConnection, 30000); // Check every 30s

    return () => clearInterval(interval);
  }, [connection]);

  if (status === 'checking') {
    return (
      <Badge variant="outline" className="bg-secondary/30 text-muted-foreground border-border/50">
        <Activity className="h-3 w-3 mr-1 animate-pulse" />
        Connecting to Solana...
      </Badge>
    );
  }

  if (status === 'offline') {
    return (
      <Badge variant="outline" className="bg-red-500/10 text-red-500 border-red-500/20">
        <AlertCircle className="h-3 w-3 mr-1" />
        Network Offline
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/20">
      <Activity className="h-3 w-3 mr-1" />
      Solana Mainnet • Block {blockHeight?.toLocaleString()}
    </Badge>
  );
};
