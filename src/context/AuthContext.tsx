import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import type { User, UserRole } from '../types';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isMaintenanceMode: boolean;
  setMaintenanceMode: (enabled: boolean) => void;
  toggleMaintenanceMode: () => void;
  login: (username: string, password: string) => { success: boolean; error?: string };
  logout: () => void;
  addUser: (userData: Omit<User, 'id' | 'createdAt'>) => { success: boolean; error?: string };
  deleteUser: (id: string) => void;
  getUsers: () => User[];
  getUsersByRole: (role: UserRole) => User[];
}

const AuthContext = createContext<AuthContextType | null>(null);

const USERS_KEY = 'koperasi_users';
const AUTH_KEY = 'koperasi_auth';
const MAINTENANCE_KEY = 'synera_maintenance_mode';

const DEFAULT_USERS: User[] = [
  {
    id: 'admin-001',
    username: 'admin',
    password: 'admin123',
    name: 'Administrator',
    role: 'admin',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'kopkar-001',
    username: 'kopkar',
    password: 'kopkar123',
    name: 'Budi Santoso (Staf Koperasi)',
    role: 'kopkar',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'user-demo-tkk1',
    username: 'tkk1',
    password: 'sekolah123',
    name: 'Ibu Maria (PIC TKK 1)',
    role: 'sekolah',
    schoolName: 'TKK 1 PENABUR Jakarta',
    schoolLevel: 'TK',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'user-demo-sdk1',
    username: 'sdk1',
    password: 'sekolah123',
    name: 'Bpk. Yohanes (PIC SDK 1)',
    role: 'sekolah',
    schoolName: 'SDK 1 PENABUR Jakarta',
    schoolLevel: 'SD',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'user-demo-smpk1',
    username: 'smpk1',
    password: 'sekolah123',
    name: 'Ibu Ratna (PIC SMPK 1)',
    role: 'sekolah',
    schoolName: 'SMPK 1 PENABUR Jakarta',
    schoolLevel: 'SMP',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'user-demo-smak1',
    username: 'smak1',
    password: 'sekolah123',
    name: 'Bpk. Hendra (PIC SMAK 1)',
    role: 'sekolah',
    schoolName: 'SMAK 1 PENABUR Jakarta',
    schoolLevel: 'SMA',
    createdAt: new Date().toISOString(),
  },
];

function loadUsers(): User[] {
  try {
    const raw = localStorage.getItem(USERS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {
    // corrupted data, reset
  }
  // Seed default users
  localStorage.setItem(USERS_KEY, JSON.stringify(DEFAULT_USERS));
  return DEFAULT_USERS;
}

function saveUsers(users: User[]) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

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
  const [users, setUsers] = useState<User[]>(() => loadUsers());
  const [isMaintenanceMode, setIsMaintenanceMode] = useState<boolean>(() => loadMaintenanceMode());

  // Persist auth state
  useEffect(() => {
    if (user) {
      localStorage.setItem(AUTH_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(AUTH_KEY);
    }
  }, [user]);

  // Persist users list
  useEffect(() => {
    saveUsers(users);
  }, [users]);

  // Persist maintenance mode
  useEffect(() => {
    localStorage.setItem(MAINTENANCE_KEY, String(isMaintenanceMode));
  }, [isMaintenanceMode]);

  const setMaintenanceMode = useCallback((enabled: boolean) => {
    setIsMaintenanceMode(enabled);
  }, []);

  const toggleMaintenanceMode = useCallback(() => {
    setIsMaintenanceMode((prev) => !prev);
  }, []);

  const login = useCallback(
    (username: string, password: string) => {
      const found = users.find(
        (u) => u.username.toLowerCase() === username.toLowerCase() && u.password === password
      );
      if (!found) {
        return { success: false, error: 'Username atau password salah' };
      }

      // Check Maintenance Mode: If active, only Admin can login!
      if (isMaintenanceMode && found.role !== 'admin') {
        return {
          success: false,
          error:
            'Sistem sedang dalam Mode Pemeliharaan (Maintenance Mode). Akses untuk akun Karyawan dan Sekolah ditutup sementara oleh Administrator.',
        };
      }

      setUser(found);
      return { success: true };
    },
    [users, isMaintenanceMode]
  );

  const logout = useCallback(() => {
    setUser(null);
  }, []);

  const addUser = useCallback((userData: Omit<User, 'id' | 'createdAt'>) => {
    const exists = users.some(
      (u) => u.username.toLowerCase() === userData.username.toLowerCase()
    );
    if (exists) {
      return { success: false, error: 'Username sudah digunakan' };
    }

    const newUser: User = {
      ...userData,
      id: `user-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      createdAt: new Date().toISOString(),
    };
    setUsers((prev) => [...prev, newUser]);
    return { success: true };
  }, [users]);

  const deleteUser = useCallback((id: string) => {
    setUsers((prev) => prev.filter((u) => u.id !== id));
  }, []);

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
