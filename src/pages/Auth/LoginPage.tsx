import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import type { UserRole } from '../../types';
import './login.css';

const LoginPage = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();

  const roleHome: Record<UserRole, string> = {
    admin: '/admin',
    kopkar: '/kopkar',
    sekolah: '/school',
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
      <div className="login-card">
        {/* Brand Logo Header */}
        <div className="login-header">
          <img src={`${import.meta.env.BASE_URL}logo-synera1.png`} alt="Logo Synera Koperasi" className="login-logo-img" />
          <h1 className="login-welcome-title">Web-App Synera Koperasi</h1>
        </div>

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

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              placeholder="Masukkan password..."
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>

          <button type="submit" className="login-btn" disabled={isLoading}>
            {isLoading ? 'Memeriksa...' : 'Login'}
          </button>
        </form>

        <div className="login-footer">
          © 2026 SYNERA • Koperasi BPK PENABUR
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
