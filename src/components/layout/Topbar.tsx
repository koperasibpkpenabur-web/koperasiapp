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
      kopkar: 'Karyawan Kopkar',
      sekolah: 'Sekolah',
    };
    return labels[role] || role;
  };

  return (
    <header className="topbar">
      <div className="topbar-left">
        {/* Strip 3 (☰) Button untuk Buka / Tutup Sidebar */}
        <button
          className="hamburger-btn"
          onClick={toggleSidebar}
          aria-label="Buka / Tutup Sidebar"
          title="Buka / Tutup Menu Sidebar (Strip 3)"
        >
          <span className="strip-line"></span>
          <span className="strip-line"></span>
          <span className="strip-line"></span>
        </button>

        <div className="topbar-brand" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <h1>SYNERA</h1>
          {isMaintenanceMode && (
            <span
              style={{
                fontSize: '0.7rem',
                background: '#fef3c7',
                color: '#b45309',
                padding: '2px 8px',
                borderRadius: '6px',
                fontWeight: 700,
                border: '1px solid #fde68a',
              }}
              title="Sistem sedang dalam mode pemeliharaan"
            >
              🛠️ MAINTENANCE AKTIF
            </span>
          )}
        </div>
      </div>

      <div className="topbar-actions">
        {user && (
          <div className="user-section">
            <span className="user-profile" title={user.name}>
              <span className="user-display-name">{user.name}</span>
              <span className="user-role-tag">{getRoleLabel(user.role)}</span>
              {user.schoolLevel && (
                <span className="user-level-tag">{user.schoolLevel}</span>
              )}
            </span>
            <div className="header-actions">
              {user.role === 'sekolah' && (
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
