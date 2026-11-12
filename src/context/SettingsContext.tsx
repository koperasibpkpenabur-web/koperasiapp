import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import {
  DEFAULT_ACADEMIC_YEAR,
  DEFAULT_ACADEMIC_YEARS,
  parseAcademicYearsSetting,
  resolveAcademicYear,
  sortAcademicYears,
} from '../utils/academicYear';

interface SettingsContextType {
  phase1Open: boolean;
  phase2Open: boolean;
  tambahanOpen: boolean;
  tambahanUseDayRule: boolean;
  tambahanUseDateRule: boolean;
  tambahanStartDate: string;
  tambahanEndDate: string;
  gdriveWebAppUrl: string;
  gdriveFolderUrl: string;
  gdrivePaymentFolderUrl: string;
  activeAcademicYear: string;
  academicYears: string[];
  updatePhaseStatus: (phase: 1 | 2, isOpen: boolean) => Promise<void>;
  updateTambahanSettings: (settings: {
    isOpen?: boolean;
    useDayRule?: boolean;
    useDateRule?: boolean;
    startDate?: string;
    endDate?: string;
  }) => Promise<void>;
  updateGdriveWebAppUrl: (url: string, folderUrl?: string, paymentFolderUrl?: string) => Promise<void>;
  updateActiveAcademicYear: (year: string) => Promise<void>;
  addAcademicYear: (year: string) => Promise<void>;
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
  const [gdriveWebAppUrl, setGdriveWebAppUrl] = useState('');
  const [gdriveFolderUrl, setGdriveFolderUrl] = useState('');
  const [gdrivePaymentFolderUrl, setGdrivePaymentFolderUrl] = useState('');
  const [activeAcademicYear, setActiveAcademicYear] = useState<string>(DEFAULT_ACADEMIC_YEAR);
  const [academicYears, setAcademicYears] = useState<string[]>([...DEFAULT_ACADEMIC_YEARS]);
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
      const gdriveUrl = data.find(d => d.key === 'gdrive_webapp_url');
      const gdriveFolder = data.find(d => d.key === 'gdrive_folder_url');
      const gdrivePaymentFolder = data.find(d => d.key === 'gdrive_payment_folder_url');
      const activeYearRow = data.find(d => d.key === 'active_academic_year');
      const yearListRow = data.find(d => d.key === 'academic_years_list');
      
      if (p1) setPhase1Open(p1.value === 'true');
      if (p2) setPhase2Open(p2.value === 'true');
      if (tOpen) setTambahanOpen(tOpen.value === 'true');
      if (tDayRule) setTambahanUseDayRule(tDayRule.value === 'true');
      if (tDateRule) setTambahanUseDateRule(tDateRule.value === 'true');
      if (tStart) setTambahanStartDate(tStart.value);
      if (tEnd) setTambahanEndDate(tEnd.value);
      if (gdriveUrl) setGdriveWebAppUrl(gdriveUrl.value || '');
      if (gdriveFolder) setGdriveFolderUrl(gdriveFolder.value || '');
      if (gdrivePaymentFolder) setGdrivePaymentFolderUrl(gdrivePaymentFolder.value || '');

      const resolvedActiveYear = resolveAcademicYear(activeYearRow?.value, DEFAULT_ACADEMIC_YEAR);
      setActiveAcademicYear(resolvedActiveYear);
      setAcademicYears(parseAcademicYearsSetting(yearListRow?.value, resolvedActiveYear));
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

  const updateGdriveWebAppUrl = async (url: string, folderUrl?: string, paymentFolderUrl?: string) => {
    const upserts: { key: string; value: string }[] = [
      { key: 'gdrive_webapp_url', value: url.trim() },
    ];
    if (folderUrl !== undefined) {
      upserts.push({ key: 'gdrive_folder_url', value: folderUrl.trim() });
    }
    if (paymentFolderUrl !== undefined) {
      upserts.push({ key: 'gdrive_payment_folder_url', value: paymentFolderUrl.trim() });
    }
    await supabase.from('app_settings').upsert(upserts);
    await fetchSettings();
  };

  const updateActiveAcademicYear = async (year: string) => {
    const normalized = resolveAcademicYear(year);
    const nextYears = sortAcademicYears([...academicYears, normalized]);
    await supabase.from('app_settings').upsert([
      { key: 'active_academic_year', value: normalized },
      { key: 'academic_years_list', value: JSON.stringify(nextYears) },
    ]);
    await fetchSettings();
  };

  const addAcademicYear = async (year: string) => {
    const normalized = year.trim();
    if (!normalized) return;
    const nextYears = sortAcademicYears([...academicYears, normalized]);
    await supabase.from('app_settings').upsert({
      key: 'academic_years_list',
      value: JSON.stringify(nextYears),
    });
    await fetchSettings();
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
      gdriveWebAppUrl,
      gdriveFolderUrl,
      gdrivePaymentFolderUrl,
      activeAcademicYear,
      academicYears,
      updatePhaseStatus, 
      updateTambahanSettings,
      updateGdriveWebAppUrl,
      updateActiveAcademicYear,
      addAcademicYear,
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
