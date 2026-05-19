import { useEffect, useState } from 'react';
import type { ChainType } from '@/config/tokens';

const KEY = 'selected_network';
const EVENT = 'selected_network_changed';

export const setSelectedNetwork = (chain: ChainType | null) => {
  if (chain) localStorage.setItem(KEY, chain);
  else localStorage.removeItem(KEY);
  window.dispatchEvent(new CustomEvent(EVENT));
};

export const useSelectedNetwork = (): ChainType | null => {
  const [value, setValue] = useState<ChainType | null>(() => {
    const v = typeof window !== 'undefined' ? localStorage.getItem(KEY) : null;
    return (v as ChainType) || null;
  });

  useEffect(() => {
    const handler = () => {
      const v = localStorage.getItem(KEY);
      setValue((v as ChainType) || null);
    };
    window.addEventListener(EVENT, handler);
    window.addEventListener('storage', handler);
    return () => {
      window.removeEventListener(EVENT, handler);
      window.removeEventListener('storage', handler);
    };
  }, []);

  return value;
};
