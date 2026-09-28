import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useOrders } from '../../context/OrderContext';
import { useReturns } from '../../context/ReturnContext';
import './school.css';

const SchoolDashboard = () => {
  const { user } = useAuth();
  const { getOrdersBySchoolId } = useOrders();
  const { getReturnsBySchoolId } = useReturns();

  if (!user) {
    return <div style={{ padding: '20px' }}>Silakan login sebagai sekolah...</div>;
  }

  const allSchoolOrders = getOrdersBySchoolId(user.id);
  const schoolReturns = getReturnsBySchoolId(user.id);
  
  const activeReturnsCount = schoolReturns.filter((r) => r.status === 'requested' || r.status === 'in_transit').length;
  const pendingCount = allSchoolOrders.filter((o) => o.status === 'pending').length;
  const approvedCount = allSchoolOrders.filter((o) => o.status === 'approved').length;
  const shippedCount = allSchoolOrders.filter((o) => o.status === 'shipped').length;
  const receivedCount = allSchoolOrders.filter((o) => o.status === 'received').length;

  return (
    <div className="school-dashboard">
      <div className="school-header-section">
        <div>
          <h2>School Area Dashboard</h2>
          <div className="school-welcome">
            Selamat datang, <strong>{user?.name}</strong> ({user?.schoolName || 'Akun Sekolah'})
            {user?.schoolLevel && (
              <span className={`badge-level ${user.schoolLevel}`} style={{ marginLeft: '8px' }}>
                Jenjang {user.schoolLevel}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Menu Utama Action Cards */}
      <div className="school-main-menu" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px', marginBottom: '32px' }}>
        <Link to="/school/pemesanan" className="school-stat-card" style={{ textDecoration: 'none', display: 'flex', flexDirection: 'column', gap: '8px', padding: '24px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px' }}>
          <div className="stat-icon" style={{ fontSize: '2rem' }}>🛒</div>
          <div style={{ fontWeight: 700, fontSize: '1.2rem', color: '#1e293b' }}>Pemesanan Barang</div>
          <div style={{ fontSize: '0.9rem', color: '#64748b' }}>Buat pesanan seragam dan buku baru ke Kopkar.</div>
        </Link>
        
        <Link to="/school/pelunasan" className="school-stat-card" style={{ textDecoration: 'none', display: 'flex', flexDirection: 'column', gap: '8px', padding: '24px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px' }}>
          <div className="stat-icon" style={{ fontSize: '2rem' }}>💳</div>
          <div style={{ fontWeight: 700, fontSize: '1.2rem', color: '#1e293b' }}>Pelunasan Tagihan</div>
          <div style={{ fontSize: '0.9rem', color: '#64748b' }}>Cek tagihan pesanan dan laporkan pembayaran siswa.</div>
        </Link>
        
        <Link to="/school/retur" className="school-stat-card" style={{ textDecoration: 'none', display: 'flex', flexDirection: 'column', gap: '8px', padding: '24px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', position: 'relative' }}>
          <div className="stat-icon" style={{ fontSize: '2rem' }}>↩️</div>
          <div style={{ fontWeight: 700, fontSize: '1.2rem', color: '#1e293b' }}>Retur Barang</div>
          <div style={{ fontSize: '0.9rem', color: '#64748b' }}>Ajukan pengembalian barang cacat atau salah ukuran.</div>
          
          {activeReturnsCount > 0 && (
            <span style={{ position: 'absolute', top: '24px', right: '24px', background: '#ef4444', color: '#fff', fontSize: '0.8rem', fontWeight: 700, padding: '2px 8px', borderRadius: '99px' }}>
              {activeReturnsCount} Aktif
            </span>
          )}
        </Link>
      </div>

      <h3 style={{ fontSize: '1.1rem', color: '#1e293b', marginBottom: '16px' }}>Status Pesanan Terkini</h3>
      {/* Stats Cards */}
      <div className="order-stats">
        <div className="order-stat-card">
          <div className="stat-icon">📦</div>
          <div className="stat-label">Total Pesanan</div>
          <div className="stat-value">{allSchoolOrders.length}</div>
        </div>
        <div className="order-stat-card">
          <div className="stat-icon">⏳</div>
          <div className="stat-label">Menunggu</div>
          <div className="stat-value">{pendingCount}</div>
        </div>
        <div className="order-stat-card">
          <div className="stat-icon">👍</div>
          <div className="stat-label">Disetujui</div>
          <div className="stat-value">{approvedCount}</div>
        </div>
        <div className="order-stat-card">
          <div className="stat-icon">🚚</div>
          <div className="stat-label">Sedang Dikirim</div>
          <div className="stat-value" style={{ color: '#2563eb' }}>{shippedCount}</div>
        </div>
        <div className="order-stat-card">
          <div className="stat-icon">✅</div>
          <div className="stat-label">History Diterima</div>
          <div className="stat-value" style={{ color: '#059669' }}>{receivedCount}</div>
        </div>
      </div>
    </div>
  );
};

export default SchoolDashboard;
