import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useReturns } from '../../context/ReturnContext';
import { useSettings } from '../../context/SettingsContext';
import { supabase } from '../../lib/supabase';
import { buildAcademicYearOptions, resolveAcademicYear } from '../../utils/academicYear';

import './kopkar.css';

const KopkarDashboard = () => {
  const { user } = useAuth();
  const { returns: allReturns } = useReturns();
  const { activeAcademicYear, academicYears } = useSettings();
  const [academicYearFilter, setAcademicYearFilter] = useState<string>(activeAcademicYear);
  const [rawOrders, setRawOrders] = useState<{ status: string; academic_year?: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setAcademicYearFilter(activeAcademicYear);
  }, [activeAcademicYear]);

  useEffect(() => {
    const fetchData = async (silent = false) => {
      if (!silent) setLoading(true);
      const { data, error } = await supabase
        .from('orders')
        .select('status, academic_year')
        .in('status', ['pending', 'cancellation_requested']);

      if (!error && data) {
        setRawOrders(data);
      }
      if (!silent) setLoading(false);
    };
    fetchData();

    const handleNewOrder = () => {
      fetchData(true);
    };

    window.addEventListener('new-order-received', handleNewOrder);
    return () => {
      window.removeEventListener('new-order-received', handleNewOrder);
    };
  }, []);

  const yearOptions = useMemo(
    () =>
      buildAcademicYearOptions(
        academicYears,
        [...rawOrders.map((o) => o.academic_year), ...allReturns.map((r) => r.academicYear)],
        activeAcademicYear
      ),
    [academicYears, rawOrders, allReturns, activeAcademicYear]
  );

  const filteredOrders = useMemo(
    () =>
      academicYearFilter === 'ALL'
        ? rawOrders
        : rawOrders.filter((o) => resolveAcademicYear(o.academic_year) === academicYearFilter),
    [rawOrders, academicYearFilter]
  );

  const pendingOrders = filteredOrders.filter((o) => o.status === 'pending').length;
  const cancelRequestsCount = filteredOrders.filter((o) => o.status === 'cancellation_requested').length;

  const pendingReturnsCount = useMemo(
    () =>
      allReturns.filter(
        (r) =>
          r.status === 'pending' &&
          (academicYearFilter === 'ALL' || resolveAcademicYear(r.academicYear) === academicYearFilter)
      ).length,
    [allReturns, academicYearFilter]
  );

  return (
    <div className="kopkar-dashboard">
      <div className="kopkar-header-section" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2>Dashboard 🏠</h2>
          <div className="kopkar-welcome">
            Selamat datang, <strong>{user?.name}</strong> (Karyawan Koperasi)
            <span style={{ marginLeft: '10px', padding: '2px 10px', borderRadius: '99px', background: '#dbeafe', color: '#1e40af', fontSize: '0.78rem', fontWeight: 700 }}>
              TA Aktif: {activeAcademicYear}
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label htmlFor="kopkarDashYearFilter" style={{ fontSize: '0.84rem', fontWeight: 600, color: '#475569' }}>
            Tahun Ajaran:
          </label>
          <select
            id="kopkarDashYearFilter"
            value={academicYearFilter}
            onChange={(e) => setAcademicYearFilter(e.target.value)}
            style={{ padding: '7px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff', fontSize: '0.86rem', fontWeight: 600 }}
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

      {/* Operational Highlights */}
      <div className="kopkar-stats operational-stats" style={{ marginBottom: '24px' }}>
        <Link 
          to="/kopkar/pesanan" 
          className="kopkar-stat-card summary-card" 
          style={{ textDecoration: 'none', cursor: 'pointer' }}
          title="Klik untuk membuka Daftar Pesanan Berjalan"
        >
          <div className="stat-icon">📋</div>
          <div className="stat-label">Menunggu Persetujuan</div>
          <div className="stat-value warning">{loading ? '...' : pendingOrders}</div>
        </Link>
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
      <div className="kopkar-main-menu" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
        <Link to="/kopkar/pesanan" className="kopkar-stat-card" style={{ textDecoration: 'none', display: 'flex', flexDirection: 'column', gap: '6px', padding: '16px' }}>
          <div className="stat-icon" style={{ fontSize: '1.5rem' }}>🛒</div>
          <div style={{ fontWeight: 700, fontSize: '1rem', color: '#1e293b' }}>Manajemen Pesanan</div>
          <div style={{ fontSize: '0.8rem', color: '#64748b' }}>Setujui, tolak, dan kelola pengiriman barang pesanan fisik sekolah.</div>
        </Link>
        
        <Link to="/kopkar/pelunasan" className="kopkar-stat-card" style={{ textDecoration: 'none', display: 'flex', flexDirection: 'column', gap: '6px', padding: '16px' }}>
          <div className="stat-icon" style={{ fontSize: '1.5rem' }}>💰</div>
          <div style={{ fontWeight: 700, fontSize: '1rem', color: '#1e293b' }}>Manajemen Pelunasan</div>
          <div style={{ fontSize: '0.8rem', color: '#64748b' }}>Kelola tagihan, uang masuk dari siswa, dan pencairan fee sekolah.</div>
        </Link>
        
        <Link to="/kopkar/barang" className="kopkar-stat-card" style={{ textDecoration: 'none', display: 'flex', flexDirection: 'column', gap: '6px', padding: '16px' }}>
          <div className="stat-icon" style={{ fontSize: '1.5rem' }}>📦</div>
          <div style={{ fontWeight: 700, fontSize: '1rem', color: '#1e293b' }}>Manajemen Barang</div>
          <div style={{ fontSize: '0.8rem', color: '#64748b' }}>Kelola daftar katalog, harga, stok fisik gudang, dan opname stok.</div>
        </Link>
        
        <Link to="/kopkar/retur" className="kopkar-stat-card" style={{ textDecoration: 'none', display: 'flex', flexDirection: 'column', gap: '6px', padding: '16px' }}>
          <div className="stat-icon" style={{ fontSize: '1.5rem' }}>↩️</div>
          <div style={{ fontWeight: 700, fontSize: '1rem', color: '#1e293b' }}>Retur Masuk</div>
          <div style={{ fontSize: '0.8rem', color: '#64748b' }}>Terima pengembalian barang atau komplain cacat.</div>
        </Link>
        
        <Link to="/kopkar/rekap" className="kopkar-stat-card" style={{ textDecoration: 'none', display: 'flex', flexDirection: 'column', gap: '6px', padding: '16px' }}>
          <div className="stat-icon" style={{ fontSize: '1.5rem' }}>📊</div>
          <div style={{ fontWeight: 700, fontSize: '1rem', color: '#1e293b' }}>Rekap Data</div>
          <div style={{ fontSize: '0.8rem', color: '#64748b' }}>Laporan seluruh aktivitas dan download rekap PDF/Excel.</div>
        </Link>
        
        <Link to="/kopkar/vendor" className="kopkar-stat-card" style={{ textDecoration: 'none', display: 'flex', flexDirection: 'column', gap: '6px', padding: '16px' }}>
          <div className="stat-icon" style={{ fontSize: '1.5rem' }}>🏭</div>
          <div style={{ fontWeight: 700, fontSize: '1rem', color: '#1e293b' }}>Manajemen Vendor</div>
          <div style={{ fontSize: '0.8rem', color: '#64748b' }}>Input barang masuk dan kontrol pembayaran/piutang ke vendor.</div>
        </Link>
      </div>
    </div>
  );
};

export default KopkarDashboard;
