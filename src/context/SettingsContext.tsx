import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';

interface SettingsContextType {
  phase1Open: boolean;
  phase2Open: boolean;
  tambahanOpen: boolean;
  tambahanUseDayRule: boolean;
  tambahanUseDateRule: boolean;
  tambahanStartDate: string;
  tambahanEndDate: string;
  updatePhaseStatus: (phase: 1 | 2, isOpen: boolean) => Promise<void>;
  updateTambahanSettings: (settings: {
    isOpen?: boolean;
    useDayRule?: boolean;
    useDateRule?: boolean;
    startDate?: string;
    endDate?: string;
  }) => Promise<void>;
  isLoading: boolean;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [phase1Open, setPhase1Open] = useState(false);
  const [phase2Open, setPhase2Open] = useState(false);
  const [tambahanOpen, setTambahanOpen] = useState(false);
  const [tambahanUseDayRule, setTambahanUseDayRule] = useState(false);
  const [tambahanUseDateRule, setTambahanUseDateRule] = useState(false);
  const [tambahanStartDate, setTambahanStartDate] = useState('');
  const [tambahanEndDate, setTambahanEndDate] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const fetchSettings = useCallback(async () => {
    setIsLoading(true);
    const { data, error } = await supabase.from('app_settings').select('*');
    if (!error && data) {
      const p1 = data.find(d => d.key === 'phase_1_open');
      const p2 = data.find(d => d.key === 'phase_2_open');
      const tOpen = data.find(d => d.key === 'tambahan_open');
      const tDayRule = data.find(d => d.key === 'tambahan_use_day_rule');
      const tDateRule = data.find(d => d.key === 'tambahan_use_date_rule');
      const tStart = data.find(d => d.key === 'tambahan_start_date');
      const tEnd = data.find(d => d.key === 'tambahan_end_date');
      
      if (p1) setPhase1Open(p1.value === 'true');
      if (p2) setPhase2Open(p2.value === 'true');
      if (tOpen) setTambahanOpen(tOpen.value === 'true');
      if (tDayRule) setTambahanUseDayRule(tDayRule.value === 'true');
      if (tDateRule) setTambahanUseDateRule(tDateRule.value === 'true');
      if (tStart) setTambahanStartDate(tStart.value);
      if (tEnd) setTambahanEndDate(tEnd.value);
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

  const updateTambahanSettings = async (settings: {
    isOpen?: boolean;
    useDayRule?: boolean;
    useDateRule?: boolean;
    startDate?: string;
    endDate?: string;
  }) => {
    const updates = [];
    if (settings.isOpen !== undefined) updates.push({ key: 'tambahan_open', value: settings.isOpen ? 'true' : 'false' });
    if (settings.useDayRule !== undefined) updates.push({ key: 'tambahan_use_day_rule', value: settings.useDayRule ? 'true' : 'false' });
    if (settings.useDateRule !== undefined) updates.push({ key: 'tambahan_use_date_rule', value: settings.useDateRule ? 'true' : 'false' });
    if (settings.startDate !== undefined) updates.push({ key: 'tambahan_start_date', value: settings.startDate });
    if (settings.endDate !== undefined) updates.push({ key: 'tambahan_end_date', value: settings.endDate });

    if (updates.length > 0) {
      await supabase.from('app_settings').upsert(updates);
      await fetchSettings();
    }
  };

  return (
    <SettingsContext.Provider value={{ 
      phase1Open, 
      phase2Open, 
      tambahanOpen,
      tambahanUseDayRule,
      tambahanUseDateRule,
      tambahanStartDate,
      tambahanEndDate,
      updatePhaseStatus, 
      updateTambahanSettings,
      isLoading 
    }}>
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
