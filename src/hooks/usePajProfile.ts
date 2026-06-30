import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface PajProfile {
  id: string;
  user_wallet_address: string;
  paj_wallet_address: string;
  paj_bank_account_id: string;
  bank_id: string;
  bank_name: string;
  bank_logo: string | null;
  bank_account_number: string;
  bank_account_name: string;
}

export function usePajProfile(walletAddress: string | null) {
  const [profile, setProfile] = useState<PajProfile | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!walletAddress) {
      setProfile(null);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("paj-cash", {
        body: { action: "get_profile", walletAddress },
      });
      if (error) throw error;
      setProfile((data as any)?.profile ?? null);
    } catch (err) {
      console.error("usePajProfile load failed:", err);
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, [walletAddress]);

  useEffect(() => {
    load();
  }, [load]);

  return { profile, loading, reload: load, setProfile };
}
