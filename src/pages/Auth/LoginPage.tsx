import { useState, type FormEvent, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import type { UserRole } from '../../types';
import './login.css';

const LoginPage = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  const { login, loginWithGoogleData } = useAuth();
  const navigate = useNavigate();

  const roleHome: Record<UserRole, string> = {
    admin: '/admin',
    kopkar: '/kopkar',
    sekolah: '/school',
    pengurus: '/pengurus',
    guru_ots: '/school',
  };

  useEffect(() => {
    let isSubscribed = true;
    let isProcessing = false;

    const processSession = async (session: any) => {
      if (isProcessing) return;
      const provider = session?.user?.app_metadata?.provider;
      const isGoogle =
        provider === 'google' ||
        session?.user?.app_metadata?.providers?.includes('google');

      if (session?.user?.email && isGoogle) {
        isProcessing = true;
        setIsGoogleLoading(true);
        setError('');
        try {
          const result = await loginWithGoogleData(session.user.email, session.user.id);
          if (!isSubscribed) return;
          if (result.success) {
            navigate('/school', { replace: true });
          } else {
            setError(result.error || 'Login Google gagal');
          }
        } catch (err: any) {
          if (isSubscribed) {
            setError(err.message || 'Terjadi kesalahan saat memproses login Google');
          }
        } finally {
          if (isSubscribed) {
            setIsGoogleLoading(false);
            isProcessing = false;
          }
        }
      }
    };

    // 1. Cek session aktif saat komponen mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (isSubscribed && session) {
        processSession(session);
      }
    });

    // 2. Dengarkan perubahan event auth
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (isSubscribed && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session) {
        processSession(session);
      }
    });

    return () => {
      isSubscribed = false;
      subscription.unsubscribe();
    };
  }, [loginWithGoogleData, navigate]);

  const handleGoogleLogin = async () => {
    try {
      setIsGoogleLoading(true);
      setError('');
      // Bersihkan session lama sebelum memulai OAuth baru agar Google memunculkan pemilih akun
      await supabase.auth.signOut();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin + '/koperasiapp/',
          queryParams: {
            prompt: 'select_account',
            access_type: 'offline',
          },
        },
      });
      if (error) throw error;
    } catch (err: any) {
      setError(err.message || 'Terjadi kesalahan saat memulai login Google');
      setIsGoogleLoading(false);
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (!username.trim() || !password.trim()) {
      setError('Username dan password harus diisi');
      return;
    }

    setIsLoading(true);

    // Simulate small delay for UX
    setTimeout(async () => {
      const result = await login(username.trim(), password);
      if (result.success) {
        const users = JSON.parse(sessionStorage.getItem('koperasi_auth') || localStorage.getItem('koperasi_auth') || '{}');
        const destination = roleHome[users.role as UserRole] || '/';
        navigate(destination, { replace: true });
      } else {
        setError(result.error || 'Login gagal');
      }
      setIsLoading(false);
    }, 300);
  };

  return (
    <div className="login-page">
      <div className="login-card split-layout">
        <div className="login-left">
          <img
            src={`${import.meta.env.BASE_URL}Logo Aksara.png`}
            alt="Logo AKSARA"
            className="login-logo-img"
            style={{ width: '170px', height: 'auto', margin: '0 auto', display: 'block' }}
          />
          <h1 className="login-welcome-title">Welcome to AKSARA PENABUR</h1>
          <p className="login-tagline">Akses Sistem Administrasi Koperasi BPK PENABUR</p>
        </div>

        <div className="login-right">
          <h2 className="login-heading" style={{ marginBottom: '12px', fontSize: '1.35rem', color: '#395886', fontWeight: 800 }}>Login</h2>
          <form className="login-form" onSubmit={handleSubmit}>
            {error && <div className="login-error">{error}</div>}

            <div className="form-group">
              <label htmlFor="username">Username</label>
              <input
                id="username"
                type="text"
                placeholder="Masukkan username..."
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
              />
            </div>

            <div className="form-group" style={{ marginBottom: '8px' }}>
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="Masukkan password..."
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', fontSize: '0.85rem', color: '#64748b' }}>
              <input
                type="checkbox"
                id="show-password"
                checked={showPassword}
                onChange={() => setShowPassword(!showPassword)}
                style={{ cursor: 'pointer', width: '16px', height: '16px' }}
              />
              <label htmlFor="show-password" style={{ cursor: 'pointer', margin: 0, fontWeight: 'normal', color: '#475569' }}>Tampilkan password</label>
            </div>

            <button type="submit" className="login-btn" disabled={isLoading || isGoogleLoading}>
              {isLoading ? 'Memeriksa...' : 'Login'}
            </button>

            <div style={{ display: 'flex', alignItems: 'center', margin: '12px 0' }}>
              <div style={{ flex: 1, height: '1px', backgroundColor: '#e2e8f0' }}></div>
              <span style={{ padding: '0 10px', color: '#64748b', fontSize: '0.85rem', fontWeight: 500 }}>ATAU</span>
              <div style={{ flex: 1, height: '1px', backgroundColor: '#e2e8f0' }}></div>
            </div>

            <button
              type="button"
              className="login-btn"
              style={{
                backgroundColor: '#ffffff',
                color: '#334155',
                border: '1px solid #cbd5e1',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px'
              }}
              onClick={handleGoogleLogin}
              disabled={isLoading || isGoogleLoading}
            >
              <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google logo" style={{ width: '18px', height: '18px' }} />
              {isGoogleLoading ? 'Memeriksa Google...' : 'Login khusus Sekolah'}
            </button>
          </form>

          <div className="login-footer">
            © 2026 AKSARA • Akses Sistem Administrasi Koperasi BPK PENABUR
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
