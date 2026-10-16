import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useUI } from '../../context/UIContext';
import { useOrders } from '../../context/OrderContext';

const Topbar = () => {
  const { user, logout, isMaintenanceMode } = useAuth();
  const { toggleSidebar } = useUI();
  const { cartItems, setShowCartModal } = useOrders() || { cartItems: [], setShowCartModal: () => {} };
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  const getRoleLabel = (role: string) => {
    const labels: Record<string, string> = {
      admin: 'Admin',
      kopkar: 'Karyawan',
      sekolah: 'Sekolah',
      pengurus: 'Pengurus',
      guru_ots: 'Guru OTS',
    };
    return labels[role] || role;
  };

  const getHomeRoute = (role: string) => {
    switch (role) {
      case 'admin':
        return '/admin';
      case 'kopkar':
        return '/kopkar';
      case 'sekolah':
      case 'guru_ots':
        return '/school';
      case 'pengurus':
        return '/pengurus';
      default:
        return '/';
    }
  };

  return (
    <header className="topbar">
      <div className="topbar-left">
        {/* Strip 3 (☰) Button untuk Buka / Tutup Sidebar */}
        <button
          className="hamburger-btn"
          onClick={toggleSidebar}
          aria-label="Buka / Tutup Sidebar"
          title="Buka / Tutup Menu Sidebar"
        >
          <span className="strip-line"></span>
          <span className="strip-line"></span>
          <span className="strip-line"></span>
        </button>

        <div className="topbar-brand">
          {isMaintenanceMode && (
            <span
              style={{
                fontSize: '0.68rem',
                background: '#fef3c7',
                color: '#b45309',
                padding: '2px 8px',
                borderRadius: '6px',
                fontWeight: 700,
                border: '1px solid #fde68a',
                whiteSpace: 'nowrap',
              }}
              title="Sistem sedang dalam mode pemeliharaan"
            >
              🛠️ MAINTENANCE
            </span>
          )}
        </div>
      </div>

      <div className="topbar-actions">
        {user && (
          <div className="user-section">
            <span className="user-profile" title={`${user.name} (${getRoleLabel(user.role)})`}>
              <span className="user-display-name">{user.name}</span>
              <span className="user-role-tag">{getRoleLabel(user.role)}</span>
              {user.schoolLevel && (
                <span className="user-level-tag">{user.schoolLevel}</span>
              )}
            </span>
            <div className="header-actions">
              <button 
                className="menu-utama-btn"
                onClick={() => navigate(getHomeRoute(user.role))}
                title="Kembali ke Dashboard / Menu Utama"
              >
                <span>🏠</span>
                <span className="btn-text">Menu Utama</span>
              </button>
              {(user.role === 'sekolah' || user.role === 'guru_ots') && (
                <button 
                  className="cart-icon-btn" 
                  onClick={() => setShowCartModal(true)}
                  title="Lihat Keranjang Pesanan"
                >
                  🛒
                  {cartItems.length > 0 && (
                    <span className="cart-badge">{cartItems.length}</span>
                  )}
                </button>
              )}
              <button className="logout-btn" onClick={handleLogout} title="Keluar dari Aplikasi">
                Logout
              </button>
            </div>
          </div>
        )}
      </div>
    </header>
  );
};

export default Topbar;
