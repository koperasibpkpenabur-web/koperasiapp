import { NavLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useUI } from '../../context/UIContext';
import { useReturns } from '../../context/ReturnContext';

const Sidebar = () => {
  const { user } = useAuth();
  const { isMobileNavOpen, closeMobileNav, isSidebarCollapsed, viewMode, setViewMode } = useUI();
  const { pendingCount } = useReturns();

  if (!user) return null;

  return (
    <aside
      className={`sidebar ${isMobileNavOpen ? 'mobile-open' : ''} ${
        isSidebarCollapsed ? 'sidebar-collapsed' : ''
      }`}
    >
      <div className="sidebar-header">
        <div className="sidebar-logo-wrap" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '8px' }}>
          <img src={`${import.meta.env.BASE_URL}logo-synera.png`} alt="SINARA" className="sidebar-logo" style={{ height: '70px', width: 'auto' }} />
          <h1 className="sidebar-logo-text" style={{ marginTop: '12px', marginBottom: '2px', fontSize: '1.4rem', fontWeight: 800, color: '#ffffff', letterSpacing: '0.05em', lineHeight: 1 }}>SINARA</h1>
          <p className="sidebar-logo-subtext" style={{ margin: 0, fontSize: '0.75rem', color: 'rgba(255,255,255,0.7)', fontWeight: 600, letterSpacing: '0.02em', textTransform: 'uppercase' }}>Sinergi Administrasi Koperasi</p>
        </div>
        <div className="sidebar-title-row">
          <button
            className="sidebar-close-btn"
            onClick={closeMobileNav}
            aria-label="Tutup Menu"
            title="Tutup Menu"
          >
            ✕
          </button>
        </div>
        {user.role === 'sekolah' && user.schoolLevel && (
          <div className="sidebar-school-level">
            Jenjang: <span className="level-badge">{user.schoolLevel}</span>
          </div>
        )}
      </div>

      <nav className="sidebar-nav">
        <ul>
          {/* Admin menu items */}
          {user.role === 'admin' && (
            <>
              <li>
                <NavLink
                  to="/admin"
                  end
                  className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
                  onClick={closeMobileNav}
                >
                  <span className="nav-icon">📊</span>
                  <span className="nav-text">Dashboard</span>
                </NavLink>
              </li>
              <li>
                <NavLink
                  to="/admin/users"
                  className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
                  onClick={closeMobileNav}
                >
                  <span className="nav-icon">👥</span>
                  <span className="nav-text">Manajemen User</span>
                </NavLink>
              </li>
            </>
          )}

          {/* Kopkar menu items */}
          {user.role === 'kopkar' && (
            <>
              <li>
                <NavLink
                  to="/kopkar"
                  end
                  className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
                  onClick={closeMobileNav}
                >
                  <span className="nav-icon">🏠</span>
                  <span className="nav-text">Menu Utama</span>
                </NavLink>
              </li>
              <li>
                <NavLink
                  to="/kopkar/pesanan"
                  className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
                  onClick={closeMobileNav}
                >
                  <span className="nav-icon">🛒</span>
                  <span className="nav-text">Manajemen Pesanan</span>
                </NavLink>
              </li>
              <li>
                <NavLink
                  to="/kopkar/pelunasan"
                  className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
                  onClick={closeMobileNav}
                >
                  <span className="nav-icon">💰</span>
                  <span className="nav-text">Manajemen Pelunasan</span>
                </NavLink>
              </li>
              <li>
                <NavLink
                  to="/kopkar/catalog"
                  className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
                  onClick={closeMobileNav}
                >
                  <span className="nav-icon">🏷️</span>
                  <span className="nav-text">Katalog & Harga</span>
                </NavLink>
              </li>
              <li>
                <NavLink
                  to="/kopkar/stock"
                  className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
                  onClick={closeMobileNav}
                >
                  <span className="nav-icon">📦</span>
                  <span className="nav-text">Stock Barang</span>
                </NavLink>
              </li>
              <li>
                <NavLink
                  to="/kopkar/kalkulator-kain"
                  className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
                  onClick={closeMobileNav}
                >
                  <span className="nav-icon">📐</span>
                  <span className="nav-text">Kalkulator Kain</span>
                </NavLink>
              </li>
              <li>
                <NavLink
                  to="/kopkar/vendor"
                  className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
                  onClick={closeMobileNav}
                >
                  <span className="nav-icon">🏭</span>
                  <span className="nav-text">Manajemen Vendor</span>
                </NavLink>
              </li>
              <li>
                <NavLink
                  to="/kopkar/retur"
                  className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
                  onClick={closeMobileNav}
                >
                  <span className="nav-icon">↩️</span>
                  <span className="nav-text" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                    Retur Masuk
                    {pendingCount > 0 && (
                      <span
                        style={{
                          background: '#e11d48',
                          color: '#ffffff',
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          padding: '1px 7px',
                          borderRadius: '99px',
                          marginLeft: '6px',
                        }}
                      >
                        {pendingCount}
                      </span>
                    )}
                  </span>
                </NavLink>
              </li>
              <li>
                <NavLink
                  to="/kopkar/rekap"
                  className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
                  onClick={closeMobileNav}
                >
                  <span className="nav-icon">📊</span>
                  <span className="nav-text">Rekap Pesanan</span>
                </NavLink>
              </li>
            </>
          )}

          {/* Pengurus menu items */}
          {user.role === 'pengurus' && (
            <>
              <li>
                <NavLink
                  to="/pengurus"
                  end
                  className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
                  onClick={closeMobileNav}
                >
                  <span className="nav-icon">📈</span>
                  <span className="nav-text">Dashboard Eksekutif</span>
                </NavLink>
              </li>
            </>
          )}

          {/* School menu items */}
          {user.role === 'sekolah' && (
            <>
              <li>
                <NavLink
                  to="/school"
                  end
                  className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
                  onClick={closeMobileNav}
                >
                  <span className="nav-icon">🏠</span>
                  <span className="nav-text">Menu Utama</span>
                </NavLink>
              </li>
              <li>
                <NavLink
                  to="/school/pemesanan"
                  className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
                  onClick={closeMobileNav}
                >
                  <span className="nav-icon">🛒</span>
                  <span className="nav-text">Pemesanan Barang</span>
                </NavLink>
              </li>
              <li>
                <NavLink
                  to="/school/pelunasan"
                  className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
                  onClick={closeMobileNav}
                >
                  <span className="nav-icon">💳</span>
                  <span className="nav-text">Pelunasan</span>
                </NavLink>
              </li>
              <li>
                <NavLink
                  to="/school/retur"
                  className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
                  onClick={closeMobileNav}
                >
                  <span className="nav-icon">↩️</span>
                  <span className="nav-text">Retur Barang</span>
                </NavLink>
              </li>
            </>
          )}
        </ul>
      </nav>

      {/* Mode Switcher di Paling Bawah Sidebar */}
      <div className="sidebar-bottom-section">
        <div className="bottom-mode-label">Mode Tampilan Layar:</div>
        <div className="mode-switcher-sidebar">
          <button
            type="button"
            className={`sidebar-mode-btn ${viewMode === 'auto' ? 'active' : ''}`}
            onClick={() => setViewMode('auto')}
            title="Otomatis mengikuti ukuran layar device"
          >
            🔄 Auto
          </button>
          <button
            type="button"
            className={`sidebar-mode-btn ${viewMode === 'mobile' ? 'active' : ''}`}
            onClick={() => setViewMode('mobile')}
            title="Simulasi Tampilan Smartphone Mobile"
          >
            📱 Mobile
          </button>
          <button
            type="button"
            className={`sidebar-mode-btn ${viewMode === 'desktop' ? 'active' : ''}`}
            onClick={() => setViewMode('desktop')}
            title="Tampilan Layar Penuh Desktop"
          >
            💻 Desktop
          </button>
        </div>
        <div className="sidebar-footer-brand">
          © 2026 SINARA • Sinergi Administrasi Koperasi
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
