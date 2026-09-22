import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';

interface SettingsContextType {
  phase1Open: boolean;
  phase2Open: boolean;
  updatePhaseStatus: (phase: 1 | 2, isOpen: boolean) => Promise<void>;
  isLoading: boolean;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [phase1Open, setPhase1Open] = useState(false);
  const [phase2Open, setPhase2Open] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const fetchSettings = useCallback(async () => {
    setIsLoading(true);
    const { data, error } = await supabase.from('app_settings').select('*');
    if (!error && data) {
      const p1 = data.find(d => d.key === 'phase_1_open');
      const p2 = data.find(d => d.key === 'phase_2_open');
      if (p1) setPhase1Open(p1.value === 'true');
      if (p2) setPhase2Open(p2.value === 'true');
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    fetchSettings();

    // Subscribe to changes
    const channel = supabase
      .channel('app_settings_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'app_settings' },
        () => {
          fetchSettings();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchSettings]);

  const updatePhaseStatus = async (phase: 1 | 2, isOpen: boolean) => {
    const key = phase === 1 ? 'phase_1_open' : 'phase_2_open';
    const valueStr = isOpen ? 'true' : 'false';
    
    await supabase.from('app_settings').upsert({ key, value: valueStr });
    await fetchSettings();
  };

  return (
    <SettingsContext.Provider value={{ phase1Open, phase2Open, updatePhaseStatus, isLoading }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
}
