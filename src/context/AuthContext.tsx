import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import type { User, UserRole } from '../types';
import { supabase } from '../lib/supabase';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isMaintenanceMode: boolean;
  setMaintenanceMode: (enabled: boolean) => void;
  toggleMaintenanceMode: () => void;
  login: (username: string, password: string) => Promise<{ success: boolean; error?: string }>;
  loginWithGoogleData: (email: string, id: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  addUser: (userData: Omit<User, 'id' | 'createdAt'>) => Promise<{ success: boolean; error?: string }>;
  updateUser: (id: string, updates: Partial<Omit<User, 'id' | 'createdAt'>>) => Promise<{ success: boolean; error?: string }>;
  updateUserPassword: (id: string, newPassword: string) => Promise<{ success: boolean; error?: string }>;
  deleteUser: (id: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

const AUTH_KEY = 'koperasi_auth';
const MAINTENANCE_KEY = 'synera_maintenance_mode';

function loadAuth(): User | null {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // corrupted
  }
  return null;
}

function loadMaintenanceMode(): boolean {
  try {
    return localStorage.getItem(MAINTENANCE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => loadAuth());
  const [isMaintenanceMode, setIsMaintenanceMode] = useState<boolean>(() => loadMaintenanceMode());

  useEffect(() => {
    if (user) {
      localStorage.setItem(AUTH_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(AUTH_KEY);
    }
  }, [user]);

  useEffect(() => {
    localStorage.setItem(MAINTENANCE_KEY, String(isMaintenanceMode));
  }, [isMaintenanceMode]);

  // Sinkronisasi/auto-heal schoolLevel jika user adalah sekolah tetapi schoolLevel belum terisi di state/storage
  useEffect(() => {
    if (user && (user.role === 'sekolah' || user.role === 'guru_ots') && !user.schoolLevel) {
      supabase
        .from('app_users')
        .select('school_level, school_name')
        .eq('id', user.id)
        .maybeSingle()
        .then(({ data: appUserData }) => {
          if (appUserData?.school_level) {
            setUser((prev) => prev ? { ...prev, schoolLevel: appUserData.school_level.trim() } : prev);
          } else {
            supabase
              .from('school_whitelist')
              .select('*')
              .eq('email', user.username)
              .maybeSingle()
              .then(({ data: wlData }) => {
                const j = wlData?.Jenjang || wlData?.jenjang;
                if (j) {
                  const clean = typeof j === 'string' ? j.trim() : j;
                  setUser((prev) => prev ? { ...prev, schoolLevel: clean } : prev);
                }
              });
          }
        });
    }
  }, [user]);

  const setMaintenanceMode = useCallback((enabled: boolean) => {
    setIsMaintenanceMode(enabled);
  }, []);

  const toggleMaintenanceMode = useCallback(() => {
    setIsMaintenanceMode((prev) => !prev);
  }, []);

  const login = useCallback(
    async (username: string, password: string) => {
      const { data, error } = await supabase
        .from('app_users')
        .select('*')
        .ilike('username', username)
        .eq('password', password)
        .single();

      if (error || !data) {
        return { success: false, error: 'Username atau password salah' };
      }

      if (isMaintenanceMode && data.role !== 'admin') {
        return {
          success: false,
          error:
            'Sistem sedang dalam Mode Pemeliharaan (Maintenance Mode). Akses untuk akun Karyawan dan Sekolah ditutup sementara oleh Administrator.',
        };
      }

      const loggedInUser: User = {
        id: data.id,
        username: data.username,
        password: data.password,
        name: data.name,
        role: data.role as UserRole,
        schoolName: data.school_name,
        schoolLevel: data.school_level,
        createdAt: data.created_at,
      };

      setUser(loggedInUser);
      return { success: true };
    },
    [isMaintenanceMode]
  );

  const loginWithGoogleData = useCallback(
    async (email: string, id: string) => {
      const { data, error } = await supabase
        .from('school_whitelist')
        .select('*')
        .eq('email', email)
        .single();

      if (error || !data) {
        await supabase.auth.signOut();
        return { success: false, error: 'Email Anda tidak terdaftar sebagai akun Sekolah.' };
      }

      if (isMaintenanceMode) {
        await supabase.auth.signOut();
        return {
          success: false,
          error: 'Sistem sedang dalam Mode Pemeliharaan. Akses ditutup sementara.',
        };
      }

      let effectiveUserId = id;

      // Ambil nama & jenjang sekolah dari whitelist (perhatikan casing kolom Jenjang / nama_sekolah)
      const rawJenjang = data.Jenjang || data.jenjang;
      const cleanJenjang = typeof rawJenjang === 'string' ? rawJenjang.trim() : rawJenjang;
      const cleanSchoolName = (data.nama_sekolah || data.Nama_Sekolah || email.split('@')[0] || '-').trim();

      try {
        // Cek apakah akun sudah terdaftar di app_users berdasarkan ID atau email
        const { data: existingAppUser } = await supabase
          .from('app_users')
          .select('*')
          .or(`id.eq.${id},username.eq.${email}`)
          .maybeSingle();

        const finalJenjang = cleanJenjang || existingAppUser?.school_level?.trim() || 'SMP';
        const finalSchoolName = cleanSchoolName || existingAppUser?.school_name?.trim() || '-';

        if (existingAppUser) {
          effectiveUserId = existingAppUser.id;
          // Pastikan nama sekolah dan jenjang tetap sinkron
          await supabase
            .from('app_users')
            .update({
              name: finalSchoolName,
              school_name: finalSchoolName,
              school_level: finalJenjang,
            })
            .eq('id', existingAppUser.id);
        } else {
          // Buat akun baru di app_users agar selalu memiliki ID valid & konsisten
          const { data: insertedUser, error: insertErr } = await supabase
            .from('app_users')
            .insert([{
              id: id,
              username: email,
              password: '',
              name: finalSchoolName,
              role: 'sekolah',
              school_name: finalSchoolName,
              school_level: finalJenjang,
            }])
            .select()
            .single();

          if (!insertErr && insertedUser) {
            effectiveUserId = insertedUser.id;
          } else if (insertErr) {
            console.warn('Sync app_users with Auth ID warning, retrying without explicit ID:', insertErr.message);
            const { data: retryUser } = await supabase
              .from('app_users')
              .insert([{
                username: email,
                password: '',
                name: finalSchoolName,
                role: 'sekolah',
                school_name: finalSchoolName,
                school_level: finalJenjang,
              }])
              .select()
              .single();

            if (retryUser) {
              effectiveUserId = retryUser.id;
            }
          }
        }
      } catch (syncErr) {
        console.error('Error syncing Google user to app_users:', syncErr);
      }

      const loggedInUser: User = {
        id: effectiveUserId,
        username: email,
        password: '', // OAuth tidak pakai password
        name: cleanSchoolName,
        role: 'sekolah',
        schoolName: cleanSchoolName, 
        schoolLevel: cleanJenjang || 'SMP',
        createdAt: new Date().toISOString(),
      };

      setUser(loggedInUser);
      return { success: true };
    },
    [isMaintenanceMode]
  );

  const logout = useCallback(async () => {
    setUser(null);
    try {
      sessionStorage.removeItem('suppressed_notifications');
    } catch {}
    await supabase.auth.signOut();
  }, []);

  const addUser = useCallback(async (userData: Omit<User, 'id' | 'createdAt'>) => {
    const { error } = await supabase.from('app_users').insert([{
      username: userData.username,
      password: userData.password,
      name: userData.name,
      role: userData.role,
      school_name: userData.schoolName,
      school_level: userData.schoolLevel
    }]);

    if (error) {
      if (error.code === '23505') { 
        return { success: false, error: 'Username sudah digunakan' };
      }
      return { success: false, error: error.message };
    }

    return { success: true };
  }, []);

  const updateUserPassword = useCallback(async (id: string, newPassword: string) => {
    const { error } = await supabase
      .from('app_users')
      .update({ password: newPassword })
      .eq('id', id);
      
    if (error) {
      return { success: false, error: error.message };
    }
    
    return { success: true };
  }, []);

  const updateUser = useCallback(async (id: string, updates: Partial<Omit<User, 'id' | 'createdAt'>>) => {
    const dbUpdates: any = {};
    if (updates.username !== undefined) dbUpdates.username = updates.username;
    if (updates.name !== undefined) dbUpdates.name = updates.name;
    if (updates.role !== undefined) dbUpdates.role = updates.role;
    
    if (updates.role === 'sekolah' || updates.role === 'guru_ots') {
      if (updates.schoolName !== undefined) dbUpdates.school_name = updates.schoolName;
      if (updates.schoolLevel !== undefined) dbUpdates.school_level = updates.schoolLevel;
    } else if (updates.role) {
      dbUpdates.school_name = null;
      dbUpdates.school_level = null;
    }

    const { error } = await supabase
      .from('app_users')
      .update(dbUpdates)
      .eq('id', id);
      
    if (error) {
      if (error.code === '23505') { 
        return { success: false, error: 'Username sudah digunakan' };
      }
      return { success: false, error: error.message };
    }
    
    return { success: true };
  }, []);

  const deleteUser = useCallback(async (id: string) => {
    await supabase.from('app_users').delete().eq('id', id);
  }, []);
  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isMaintenanceMode,
        setMaintenanceMode,
        toggleMaintenanceMode,
        login,
        loginWithGoogleData,
        logout,
        addUser,
        updateUser,
        updateUserPassword,
        deleteUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
