import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import type { UserRole } from '../../types';
import './login.css';

const LoginPage = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();

  const roleHome: Record<UserRole, string> = {
    admin: '/admin',
    kopkar: '/kopkar',
    sekolah: '/school',
    pengurus: '/pengurus',
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
        const users = JSON.parse(localStorage.getItem('koperasi_auth') || '{}');
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
          <img src={`${import.meta.env.BASE_URL}logo-synera1.png`} alt="Logo SINARA Koperasi" className="login-logo-img" />
          <h1 className="login-welcome-title">Welcome to SINARA</h1>
          <p className="login-tagline">Sinergi Administrasi Koperasi</p>
        </div>

        <div className="login-right">
          <h2 className="login-heading" style={{ marginBottom: '24px', fontSize: '1.5rem', color: '#395886', fontWeight: 800 }}>Login</h2>
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
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px', fontSize: '0.85rem', color: '#64748b' }}>
              <input 
                type="checkbox" 
                id="show-password" 
                checked={showPassword} 
                onChange={() => setShowPassword(!showPassword)}
                style={{ cursor: 'pointer', width: '16px', height: '16px' }}
              />
              <label htmlFor="show-password" style={{ cursor: 'pointer', margin: 0, fontWeight: 'normal', color: '#475569' }}>Tampilkan password</label>
            </div>

            <button type="submit" className="login-btn" disabled={isLoading}>
              {isLoading ? 'Memeriksa...' : 'Login'}
            </button>
          </form>

          <div className="login-footer">
            © 2026 SINARA • Sinergi Administrasi Koperasi
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
