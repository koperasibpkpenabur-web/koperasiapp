import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useOrders } from '../../context/OrderContext';
import { useReturns } from '../../context/ReturnContext';
import './kopkar.css';

const KopkarDashboard = () => {
  const { user } = useAuth();
  const { pendingCount: pendingReturnsCount } = useReturns();
  const { orders } = useOrders();

  const pendingOrders = orders.filter((o) => o.status === 'pending').length;
  const cancelRequestsCount = orders.filter((o) => o.status === 'cancellation_requested').length;

  return (
    <div className="kopkar-dashboard">
      <div className="kopkar-header-section">
        <div>
          <h2>Dashboard 🏠</h2>
          <div className="kopkar-welcome">
            Selamat datang, <strong>{user?.name}</strong> (Karyawan Koperasi)
          </div>
        </div>
      </div>

      {/* Operational Highlights */}
      <div className="kopkar-stats operational-stats" style={{ marginBottom: '24px' }}>
        <div className="kopkar-stat-card summary-card">
          <div className="stat-icon">📋</div>
          <div className="stat-label">Menunggu Persetujuan</div>
          <div className="stat-value warning">{pendingOrders}</div>
        </div>
        {cancelRequestsCount > 0 && (
          <div className="kopkar-stat-card alert-card">
            <div className="stat-icon">⚠️</div>
            <div className="stat-label">Request Batal</div>
            <div className="stat-value" style={{ color: '#dc2626' }}>{cancelRequestsCount}</div>
          </div>
        )}
        {pendingReturnsCount > 0 && (
          <Link
            to="/kopkar/retur"
            className="kopkar-stat-card alert-card"
            style={{ textDecoration: 'none', borderLeft: '4px solid #e11d48' }}
            title="Klik untuk membuka permohonan retur masuk"
          >
            <div className="stat-icon">↩️</div>
            <div className="stat-label">Retur Masuk Perlu Dicek</div>
            <div className="stat-value" style={{ color: '#e11d48' }}>{pendingReturnsCount}</div>
          </Link>
        )}
      </div>

      {/* Menu Utama Action Cards */}
      <div className="kopkar-main-menu" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px' }}>
        <Link to="/kopkar/pesanan" className="kopkar-stat-card" style={{ textDecoration: 'none', display: 'flex', flexDirection: 'column', gap: '8px', padding: '24px' }}>
          <div className="stat-icon" style={{ fontSize: '2rem' }}>🛒</div>
          <div style={{ fontWeight: 700, fontSize: '1.2rem', color: '#1e293b' }}>Manajemen Pesanan</div>
          <div style={{ fontSize: '0.9rem', color: '#64748b' }}>Setujui, tolak, dan kelola pengiriman barang pesanan fisik sekolah.</div>
        </Link>
        
        <Link to="/kopkar/pelunasan" className="kopkar-stat-card" style={{ textDecoration: 'none', display: 'flex', flexDirection: 'column', gap: '8px', padding: '24px' }}>
          <div className="stat-icon" style={{ fontSize: '2rem' }}>💰</div>
          <div style={{ fontWeight: 700, fontSize: '1.2rem', color: '#1e293b' }}>Manajemen Pelunasan</div>
          <div style={{ fontSize: '0.9rem', color: '#64748b' }}>Kelola tagihan, uang masuk dari siswa, dan pencairan fee sekolah.</div>
        </Link>
        
        <Link to="/kopkar/catalog" className="kopkar-stat-card" style={{ textDecoration: 'none', display: 'flex', flexDirection: 'column', gap: '8px', padding: '24px' }}>
          <div className="stat-icon" style={{ fontSize: '2rem' }}>🏷️</div>
          <div style={{ fontWeight: 700, fontSize: '1.2rem', color: '#1e293b' }}>Katalog & Harga</div>
          <div style={{ fontSize: '0.9rem', color: '#64748b' }}>Atur harga pokok, fee sekolah, dan etalase barang.</div>
        </Link>
        
        <Link to="/kopkar/stock" className="kopkar-stat-card" style={{ textDecoration: 'none', display: 'flex', flexDirection: 'column', gap: '8px', padding: '24px' }}>
          <div className="stat-icon" style={{ fontSize: '2rem' }}>📦</div>
          <div style={{ fontWeight: 700, fontSize: '1.2rem', color: '#1e293b' }}>Stock Barang</div>
          <div style={{ fontSize: '0.9rem', color: '#64748b' }}>Kontrol ketersediaan stok fisik gudang koperasi.</div>
        </Link>
        
        <Link to="/kopkar/retur" className="kopkar-stat-card" style={{ textDecoration: 'none', display: 'flex', flexDirection: 'column', gap: '8px', padding: '24px' }}>
          <div className="stat-icon" style={{ fontSize: '2rem' }}>↩️</div>
          <div style={{ fontWeight: 700, fontSize: '1.2rem', color: '#1e293b' }}>Retur Masuk</div>
          <div style={{ fontSize: '0.9rem', color: '#64748b' }}>Terima pengembalian barang atau komplain cacat.</div>
        </Link>
        
        <Link to="/kopkar/rekap" className="kopkar-stat-card" style={{ textDecoration: 'none', display: 'flex', flexDirection: 'column', gap: '8px', padding: '24px' }}>
          <div className="stat-icon" style={{ fontSize: '2rem' }}>📊</div>
          <div style={{ fontWeight: 700, fontSize: '1.2rem', color: '#1e293b' }}>Rekap Data</div>
          <div style={{ fontSize: '0.9rem', color: '#64748b' }}>Laporan seluruh aktivitas dan download rekap PDF/Excel.</div>
        </Link>
      </div>
    </div>
  );
};

export default KopkarDashboard;
