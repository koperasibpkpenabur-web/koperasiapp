import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useReturns } from '../../context/ReturnContext';
import { useSettings } from '../../context/SettingsContext';
import { supabase } from '../../lib/supabase';
import { buildAcademicYearOptions, resolveAcademicYear } from '../../utils/academicYear';
import './school.css';

const SchoolDashboard = () => {
  const { user } = useAuth();
  const { getReturnsBySchoolId } = useReturns();
  const { activeAcademicYear, academicYears } = useSettings();

  const [academicYearFilter, setAcademicYearFilter] = useState<string>(activeAcademicYear);
  const [rawOrders, setRawOrders] = useState<{ status: string; academic_year?: string }[]>([]);
  const [schoolReturns, setSchoolReturns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setAcademicYearFilter(activeAcademicYear);
  }, [activeAcademicYear]);

  useEffect(() => {
    if (user?.id) {
      const fetchOrderStats = async (silent = false) => {
        if (!silent) setLoading(true);
        const { data, error } = await supabase
          .from('orders')
          .select('status, academic_year')
          .eq('school_user_id', user.id);

        if (!error && data) {
          setRawOrders(data);
        }
        if (!silent) setLoading(false);
      };

      fetchOrderStats();
      setSchoolReturns(getReturnsBySchoolId(user.id) as any[]);

      const handleAutoRefresh = () => {
        fetchOrderStats(true);
        setSchoolReturns(getReturnsBySchoolId(user.id) as any[]);
      };

      window.addEventListener('school-order-updated', handleAutoRefresh);
      window.addEventListener('new-return-received', handleAutoRefresh);

      return () => {
        window.removeEventListener('school-order-updated', handleAutoRefresh);
        window.removeEventListener('new-return-received', handleAutoRefresh);
      };
    }
  }, [user?.id, getReturnsBySchoolId]);

  if (!user) {
    return <div style={{ padding: '20px' }}>Silakan login sebagai sekolah...</div>;
  }

  const yearOptions = buildAcademicYearOptions(
    academicYears,
    [
      ...rawOrders.map((o) => o.academic_year),
      ...schoolReturns.map((r) => r.academicYear),
    ],
    activeAcademicYear
  );

  const filteredOrders = academicYearFilter === 'ALL'
    ? rawOrders
    : rawOrders.filter((o) => resolveAcademicYear(o.academic_year) === academicYearFilter);

  const orderCounts = {
    total: filteredOrders.length,
    pending: filteredOrders.filter((o) => o.status === 'pending').length,
    approved: filteredOrders.filter((o) => o.status === 'approved').length,
    shipped: filteredOrders.filter((o) => o.status === 'shipped').length,
    received: filteredOrders.filter((o) => o.status === 'received').length,
  };

  const filteredReturns = academicYearFilter === 'ALL'
    ? schoolReturns
    : schoolReturns.filter((r: any) => resolveAcademicYear(r.academicYear) === academicYearFilter);

  const activeReturnsCount = filteredReturns.filter((r: any) => r.status === 'pending' || r.status === 'koperasi_confirmed' || r.status === 'sekolah_dikirim').length;

  return (
    <div className="school-dashboard">
      <div className="school-header-section">
        <div>
          <h2>{user?.role === 'guru_ots' ? 'Dashboard Guru on the Spot' : 'School Area Dashboard'}</h2>
          <div className="school-welcome">
            Selamat datang, <strong>{user?.name}</strong> ({user?.schoolName || (user?.role === 'guru_ots' ? 'Guru on the Spot' : 'Akun Sekolah')})
            {user?.schoolLevel && (
              <span className={`badge-level ${user.schoolLevel}`} style={{ marginLeft: '8px' }}>
                Jenjang {user.schoolLevel}
              </span>
            )}
            <span style={{ marginLeft: '8px', padding: '2px 10px', borderRadius: '99px', background: '#dbeafe', color: '#1e40af', fontSize: '0.78rem', fontWeight: 700 }}>
              TA Aktif: {activeAcademicYear}
            </span>
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
        
        {user?.role !== 'guru_ots' && (
          <Link to="/school/retur" className="school-stat-card" style={{ textDecoration: 'none', display: 'flex', flexDirection: 'column', gap: '8px', padding: '16px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', position: 'relative' }}>
            <div className="stat-icon" style={{ fontSize: '1.8rem' }}>↩️</div>
            <div style={{ fontWeight: 700, fontSize: '1.1rem', color: '#1e293b' }}>Retur Barang</div>
            <div style={{ fontSize: '0.85rem', color: '#64748b' }}>Ajukan pengembalian barang cacat atau salah ukuran.</div>
            
            {activeReturnsCount > 0 && (
              <span style={{ position: 'absolute', top: '16px', right: '16px', background: '#ef4444', color: '#fff', fontSize: '0.8rem', fontWeight: 700, padding: '2px 8px', borderRadius: '99px' }}>
                {activeReturnsCount} Aktif
              </span>
            )}
          </Link>
        )}

        <Link to="/school/rekap" className="school-stat-card" style={{ textDecoration: 'none', display: 'flex', flexDirection: 'column', gap: '8px', padding: '16px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px' }}>
          <div className="stat-icon" style={{ fontSize: '1.8rem' }}>📊</div>
          <div style={{ fontWeight: 700, fontSize: '1.1rem', color: '#1e293b' }}>Rekap Pesanan</div>
          <div style={{ fontSize: '0.85rem', color: '#64748b' }}>Download Excel/PDF rekapan pesanan.</div>
        </Link>

        {user?.role !== 'guru_ots' && (
          <Link to="/school/pelunasan" className="school-stat-card" style={{ textDecoration: 'none', display: 'flex', flexDirection: 'column', gap: '8px', padding: '16px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px' }}>
            <div className="stat-icon" style={{ fontSize: '1.8rem' }}>💳</div>
            <div style={{ fontWeight: 700, fontSize: '1.1rem', color: '#1e293b' }}>Pelunasan Tagihan</div>
            <div style={{ fontSize: '0.85rem', color: '#64748b' }}>Cek tagihan pesanan dan laporkan pembayaran siswa.</div>
          </Link>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '16px' }}>
        <h3 style={{ fontSize: '1.1rem', color: '#1e293b', margin: 0 }}>Status Pesanan Terkini</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label htmlFor="schoolDashYearFilter" style={{ fontSize: '0.84rem', fontWeight: 600, color: '#475569' }}>
            Tahun Ajaran:
          </label>
          <select
            id="schoolDashYearFilter"
            value={academicYearFilter}
            onChange={(e) => setAcademicYearFilter(e.target.value)}
            style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff', fontSize: '0.86rem', fontWeight: 600 }}
          >
            {yearOptions.map((yr) => (
              <option key={yr} value={yr}>
                TA {yr} {yr === activeAcademicYear ? '(Aktif)' : ''}
              </option>
            ))}
            <option value="ALL">Semua Tahun Ajaran</option>
          </select>
        </div>
      </div>
      {/* Stats Cards */}
      <div className="order-stats">
        <div className="order-stat-card">
          <div className="stat-icon">📦</div>
          <div className="stat-label">Total Pesanan</div>
          <div className="stat-value">{loading ? '...' : orderCounts.total}</div>
        </div>
        <div className="order-stat-card">
          <div className="stat-icon">⏳</div>
          <div className="stat-label">Menunggu</div>
          <div className="stat-value">{loading ? '...' : orderCounts.pending}</div>
        </div>
        <div className="order-stat-card">
          <div className="stat-icon">👍</div>
          <div className="stat-label">Disetujui</div>
          <div className="stat-value">{loading ? '...' : orderCounts.approved}</div>
        </div>
        <div className="order-stat-card">
          <div className="stat-icon">🚚</div>
          <div className="stat-label">Sedang Dikirim</div>
          <div className="stat-value" style={{ color: '#2563eb' }}>{loading ? '...' : orderCounts.shipped}</div>
        </div>
        <div className="order-stat-card">
          <div className="stat-icon">✅</div>
          <div className="stat-label">History Diterima</div>
          <div className="stat-value" style={{ color: '#059669' }}>{loading ? '...' : orderCounts.received}</div>
        </div>
      </div>
    </div>
  );
};

export default SchoolDashboard;
