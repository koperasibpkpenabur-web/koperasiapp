import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import type { UserRole } from '../../types';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: UserRole[];
}

const ProtectedRoute = ({ children, allowedRoles }: ProtectedRouteProps) => {
  const { user, isAuthenticated, isMaintenanceMode, logout } = useAuth();

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }

  // Jika sistem sedang dalam mode maintenance dan bukan admin, blokir akses!
  if (isMaintenanceMode && user.role !== 'admin') {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#F0F3FA',
          padding: '20px',
        }}
      >
        <div
          style={{
            maxWidth: '500px',
            width: '100%',
            backgroundColor: '#ffffff',
            borderRadius: '20px',
            border: '1px solid #d5deef',
            padding: '40px 36px',
            textAlign: 'center',
            boxShadow: '0 20px 50px rgba(30, 45, 66, 0.12)',
          }}
        >
          <div
            style={{
              width: '64px',
              height: '64px',
              borderRadius: '16px',
              backgroundColor: '#fff1f2',
              color: '#e11d48',
              fontSize: '2rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
              border: '1px solid #fecdd3',
            }}
          >
            🛠️
          </div>

          <h2
            style={{
              color: '#395886',
              fontSize: '1.4rem',
              fontWeight: 700,
              marginBottom: '10px',
              letterSpacing: '-0.01em',
            }}
          >
            Mode Pemeliharaan (Maintenance)
          </h2>

          <p
            style={{
              color: '#586b84',
              fontSize: '0.92rem',
              lineHeight: 1.6,
              marginBottom: '24px',
            }}
          >
            Sistem <strong>SYNERA</strong> saat ini sedang dalam proses pemeliharaan atau update oleh Administrator.
            Akses untuk pengguna Karyawan Koperasi dan Sekolah ditutup sementara.
          </p>

          <div
            style={{
              background: '#F0F3FA',
              padding: '12px 16px',
              borderRadius: '10px',
              border: '1px solid #d5deef',
              fontSize: '0.82rem',
              color: '#395886',
              fontWeight: 600,
              marginBottom: '24px',
            }}
          >
            Silakan hubungi Administrator atau coba masuk kembali beberapa saat lagi.
          </div>

          <button
            onClick={logout}
            style={{
              padding: '10px 24px',
              backgroundColor: '#395886',
              color: '#ffffff',
              border: 'none',
              borderRadius: '10px',
              fontSize: '0.9rem',
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(57, 88, 134, 0.25)',
              transition: 'background 0.2s',
            }}
            onMouseOver={(e) => ((e.currentTarget as HTMLButtonElement).style.backgroundColor = '#2b4468')}
            onMouseOut={(e) => ((e.currentTarget as HTMLButtonElement).style.backgroundColor = '#395886')}
          >
            Kembali ke Halaman Login
          </button>
        </div>
      </div>
    );
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    // Redirect to appropriate dashboard based on role
    const roleHome: Record<UserRole, string> = {
      admin: '/admin',
      kopkar: '/kopkar',
      sekolah: '/school',
    };
    return <Navigate to={roleHome[user.role]} replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
