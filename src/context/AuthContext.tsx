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
      const cleanUsername = username.trim().toLowerCase();
      const emailToUse = cleanUsername.includes('@') ? cleanUsername : `${cleanUsername}@koperasi.local`;

      // 1. Coba login resmi via Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: emailToUse,
        password: password,
      });

      let userData: any = null;

      if (!authError && authData?.user) {
        // Berhasil login via Supabase Auth, ambil data profil dari app_users
        const { data: profile } = await supabase
          .from('app_users')
          .select('*')
          .eq('id', authData.user.id)
          .maybeSingle();

        userData = profile;
      }

      // Fallback transisi (jika script SQL belum sempat dijalankan): cek app_users langsung
      if (!userData) {
        const { data: legacyUser } = await supabase
          .from('app_users')
          .select('*')
          .ilike('username', cleanUsername)
          .maybeSingle();

        if (legacyUser && (legacyUser as any).password === password) {
          userData = legacyUser;
        }
      }

      if (!userData) {
        return { success: false, error: 'Username atau password salah' };
      }

      if (isMaintenanceMode && userData.role !== 'admin') {
        return {
          success: false,
          error:
            'Sistem sedang dalam Mode Pemeliharaan (Maintenance Mode). Akses untuk akun Karyawan dan Sekolah ditutup sementara oleh Administrator.',
        };
      }

      const loggedInUser: User = {
        id: userData.id,
        username: userData.username,
        password: '',
        name: userData.name,
        role: userData.role as UserRole,
        schoolName: userData.school_name,
        schoolLevel: userData.school_level,
        createdAt: userData.created_at,
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

      // Ambil nama & jenjang sekolah dari whitelist
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
          await supabase
            .from('app_users')
            .update({
              name: finalSchoolName,
              school_name: finalSchoolName,
              school_level: finalJenjang,
            })
            .eq('id', existingAppUser.id);
        } else {
          // Buat akun baru di app_users
          const { data: insertedUser, error: insertErr } = await supabase
            .from('app_users')
            .insert([{
              id: id,
              username: email,
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
        password: '',
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
    const cleanUser = userData.username.trim().toLowerCase();
    const emailToUse = cleanUser.includes('@') ? cleanUser : `${cleanUser}@koperasi.local`;

    // 1. Coba melalui RPC admin_create_user
    try {
      const { data: rpcData, error: rpcError } = await supabase.rpc('admin_create_user', {
        p_email: emailToUse,
        p_password: userData.password,
        p_name: userData.name.trim(),
        p_role: userData.role,
        p_school_name: userData.schoolName?.trim() || '',
        p_school_level: userData.schoolLevel?.trim() || '',
        p_username: cleanUser,
      });

      if (!rpcError && rpcData?.success) {
        return { success: true };
      }
      if (rpcError) {
        console.warn('RPC admin_create_user error:', rpcError);
        return { success: false, error: rpcError.message };
      }
      if (rpcData && !rpcData.success) {
        return { success: false, error: rpcData.error || 'Gagal membuat pengguna' };
      }
    } catch (e: any) {
      console.warn('RPC admin_create_user exception:', e);
      return { success: false, error: e?.message || 'Gagal membuat pengguna' };
    }

    return { success: true };
  }, []);

  const updateUserPassword = useCallback(async (id: string, newPassword: string) => {
    // 1. Coba melalui RPC admin_reset_password
    try {
      const { data: rpcData, error: rpcError } = await supabase.rpc('admin_reset_password', {
        p_user_id: id,
        p_new_password: newPassword,
      });

      if (!rpcError && rpcData?.success) {
        return { success: true };
      }
      if (rpcError) {
        return { success: false, error: rpcError.message };
      }
      if (rpcData && !rpcData.success) {
        return { success: false, error: rpcData.error || 'Gagal mengubah password' };
      }
    } catch (e: any) {
      return { success: false, error: e?.message || 'Gagal mengubah password' };
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
    // 1. Coba melalui RPC admin_delete_user
    const { error: rpcError } = await supabase.rpc('admin_delete_user', {
      p_user_id: id,
    });

    if (rpcError) {
      // Fallback
      await supabase.from('app_users').delete().eq('id', id);
    }
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
