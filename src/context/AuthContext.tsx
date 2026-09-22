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
  logout: () => void;
  addUser: (userData: Omit<User, 'id' | 'createdAt'>) => Promise<{ success: boolean; error?: string }>;
  updateUserPassword: (id: string, newPassword: string) => Promise<{ success: boolean; error?: string }>;
  deleteUser: (id: string) => Promise<void>;
  getUsers: () => User[];
  getUsersByRole: (role: UserRole) => User[];
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
  const [users, setUsers] = useState<User[]>([]);
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

  const fetchUsers = useCallback(async () => {
    const { data, error } = await supabase.from('app_users').select('*');
    if (!error && data) {
      const mapped = data.map(u => ({
        id: u.id,
        username: u.username,
        password: u.password,
        name: u.name,
        role: u.role as UserRole,
        schoolName: u.school_name,
        schoolLevel: u.school_level,
        createdAt: u.created_at,
      }));
      setUsers(mapped);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

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

  const logout = useCallback(() => {
    setUser(null);
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

    await fetchUsers();
    return { success: true };
  }, [fetchUsers]);

  const updateUserPassword = useCallback(async (id: string, newPassword: string) => {
    const { error } = await supabase
      .from('app_users')
      .update({ password: newPassword })
      .eq('id', id);
      
    if (error) {
      return { success: false, error: error.message };
    }
    
    await fetchUsers();
    return { success: true };
  }, [fetchUsers]);

  const deleteUser = useCallback(async (id: string) => {
    await supabase.from('app_users').delete().eq('id', id);
    await fetchUsers();
  }, [fetchUsers]);

  const getUsers = useCallback(() => users, [users]);

  const getUsersByRole = useCallback(
    (role: UserRole) => users.filter((u) => u.role === role),
    [users]
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isMaintenanceMode,
        setMaintenanceMode,
        toggleMaintenanceMode,
        login,
        logout,
        addUser,
        updateUserPassword,
        deleteUser,
        getUsers,
        getUsersByRole,
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
