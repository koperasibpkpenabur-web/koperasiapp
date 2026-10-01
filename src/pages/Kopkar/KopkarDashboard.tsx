import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useReturns } from '../../context/ReturnContext';
import { supabase } from '../../lib/supabase';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import './kopkar.css';

const KopkarDashboard = () => {
  const { user } = useAuth();
  const { pendingCount: pendingReturnsCount } = useReturns();
  const [pendingOrders, setPendingOrders] = useState(0);
  const [cancelRequestsCount, setCancelRequestsCount] = useState(0);
  const [salesBySchool, setSalesBySchool] = useState<{name: string; Omzet: number; Laba: number}[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('orders')
        .select('status, school_name, total_price_student, total_price_kopkar');

      if (!error && data) {
        setPendingOrders(data.filter((o: any) => o.status === 'pending').length);
        setCancelRequestsCount(data.filter((o: any) => o.status === 'cancellation_requested').length);

        const sales = data
          .filter((o: any) => o.status !== 'cancelled' && o.status !== 'rejected')
          .reduce((acc: any[], order: any) => {
            const existing = acc.find(item => item.name === order.school_name);
            if (existing) {
              existing.Omzet += (Number(order.total_price_student) || 0);
              existing.Laba += (Number(order.total_price_kopkar) || 0);
            } else {
              acc.push({
                name: order.school_name || 'Unknown',
                Omzet: Number(order.total_price_student) || 0,
                Laba: Number(order.total_price_kopkar) || 0
              });
            }
            return acc;
          }, [])
          .sort((a: any, b: any) => b.Omzet - a.Omzet)
          .slice(0, 5);
        
        setSalesBySchool(sales);
      }
      setLoading(false);
    };
    fetchData();
  }, []);

  const formatRupiah = (value: number) => {
    if (value >= 1000000) {
      return `Rp ${(value / 1000000).toFixed(1)}Jt`;
    }
    return `Rp ${(value / 1000).toFixed(0)}K`;
  };

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

      {loading ? <p>Memuat dashboard...</p> : (
        <>
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

      {/* Chart Section */}
      {salesBySchool.length > 0 && (
        <div className="kopkar-stat-card" style={{ marginBottom: '16px', padding: '16px' }}>
          <h3 style={{ marginBottom: '16px', color: '#1e293b', fontSize: '1.2rem', fontWeight: 700 }}>
            📊 Top 5 Sekolah Berdasarkan Omzet
          </h3>
          <div style={{ width: '100%', height: '220px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={salesBySchool}
                margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                <YAxis axisLine={false} tickLine={false} tickFormatter={formatRupiah} tick={{ fontSize: 12, fill: '#64748b' }} />
                <Tooltip 
                  formatter={(value: any) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value)}
                  cursor={{ fill: '#f8fafc' }}
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                />
                <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px' }} />
                <Bar dataKey="Omzet" name="Total Omzet (Tagihan Siswa)" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={40} />
                <Bar dataKey="Laba" name="Laba Koperasi (HPP)" fill="#10b981" radius={[4, 4, 0, 0]} barSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

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
      </>
      )}
    </div>
  );
};

export default KopkarDashboard;
