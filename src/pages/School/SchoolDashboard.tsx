import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useOrders } from '../../context/OrderContext';
import { useReturns } from '../../context/ReturnContext';
import './school.css';

const SchoolDashboard = () => {
  const { user } = useAuth();
  const { getOrdersBySchoolId } = useOrders();
  const { getReturnsBySchoolId } = useReturns();

  const [allSchoolOrders, setAllSchoolOrders] = useState<any[]>([]);
  const [schoolReturns, setSchoolReturns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user?.id) {
      setLoading(true);
      getOrdersBySchoolId(user.id).then(data => {
        setAllSchoolOrders(data);
        setLoading(false);
      });
      setSchoolReturns(getReturnsBySchoolId(user.id) as any[]);
    }
  }, [user?.id, getOrdersBySchoolId, getReturnsBySchoolId]);

  if (!user) {
    return <div style={{ padding: '20px' }}>Silakan login sebagai sekolah...</div>;
  }

  const activeReturnsCount = schoolReturns.filter((r: any) => r.status === 'pending' || r.status === 'koperasi_confirmed' || r.status === 'sekolah_dikirim').length;
  const pendingCount = allSchoolOrders.filter((o: any) => o.status === 'pending').length;
  const approvedCount = allSchoolOrders.filter((o: any) => o.status === 'approved').length;
  const shippedCount = allSchoolOrders.filter((o: any) => o.status === 'shipped').length;
  const receivedCount = allSchoolOrders.filter((o: any) => o.status === 'received').length;

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
      <div className="school-main-menu" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        <Link to="/school/pemesanan" className="school-stat-card" style={{ textDecoration: 'none', display: 'flex', flexDirection: 'column', gap: '8px', padding: '16px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px' }}>
          <div className="stat-icon" style={{ fontSize: '1.8rem' }}>🛒</div>
          <div style={{ fontWeight: 700, fontSize: '1.1rem', color: '#1e293b' }}>Pemesanan Barang</div>
          <div style={{ fontSize: '0.85rem', color: '#64748b' }}>Buat pesanan seragam dan buku baru ke Kopkar.</div>
        </Link>
        
        <Link to="/school/pelunasan" className="school-stat-card" style={{ textDecoration: 'none', display: 'flex', flexDirection: 'column', gap: '8px', padding: '16px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px' }}>
          <div className="stat-icon" style={{ fontSize: '1.8rem' }}>💳</div>
          <div style={{ fontWeight: 700, fontSize: '1.1rem', color: '#1e293b' }}>Pelunasan Tagihan</div>
          <div style={{ fontSize: '0.85rem', color: '#64748b' }}>Cek tagihan pesanan dan laporkan pembayaran siswa.</div>
        </Link>
        
        <Link to="/school/retur" className="school-stat-card" style={{ textDecoration: 'none', display: 'flex', flexDirection: 'column', gap: '8px', padding: '16px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', position: 'relative' }}>
          <div className="stat-icon" style={{ fontSize: '1.8rem' }}>↩️</div>
          <div style={{ fontWeight: 700, fontSize: '1.1rem', color: '#1e293b' }}>Retur Barang</div>
          <div style={{ fontSize: '0.85rem', color: '#64748b' }}>Ajukan pengembalian barang cacat atau salah ukuran.</div>
          
          {activeReturnsCount > 0 && (
            <span style={{ position: 'absolute', top: '24px', right: '24px', background: '#ef4444', color: '#fff', fontSize: '0.8rem', fontWeight: 700, padding: '2px 8px', borderRadius: '99px' }}>
              {activeReturnsCount} Aktif
            </span>
          )}
        </Link>
        <Link to="/school/rekap" className="school-stat-card" style={{ textDecoration: 'none', display: 'flex', flexDirection: 'column', gap: '8px', padding: '16px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px' }}>
          <div className="stat-icon" style={{ fontSize: '1.8rem' }}>📊</div>
          <div style={{ fontWeight: 700, fontSize: '1.1rem', color: '#1e293b' }}>Rekap Pesanan</div>
          <div style={{ fontSize: '0.85rem', color: '#64748b' }}>Download Excel/PDF rekapan pesanan.</div>
        </Link>
      </div>

      <h3 style={{ fontSize: '1.1rem', color: '#1e293b', marginBottom: '16px' }}>Status Pesanan Terkini</h3>
      {/* Stats Cards */}
      {loading ? <p>Memuat ringkasan...</p> : (
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
      )}
    </div>
  );
};

export default SchoolDashboard;
