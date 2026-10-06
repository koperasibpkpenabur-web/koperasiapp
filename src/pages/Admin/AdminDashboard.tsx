import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useSettings } from '../../context/SettingsContext';
import { supabase } from '../../lib/supabase';
import './admin.css';

const AdminDashboard = () => {
  const { isMaintenanceMode, toggleMaintenanceMode } = useAuth();
  const settings = useSettings();
  const { phase1Open, phase2Open, updatePhaseStatus } = settings;

  const [totalAdmin, setTotalAdmin] = useState(0);
  const [totalKopkar, setTotalKopkar] = useState(0);
  const [listSekolah, setListSekolah] = useState<any[]>([]);
  const totalSekolah = listSekolah.length;

  useEffect(() => {
    const fetchStats = async () => {
      const { data, error } = await supabase.from('app_users').select('id, role, school_name');
      if (!error && data) {
        setTotalAdmin(data.filter((u) => u.role === 'admin').length);
        setTotalKopkar(data.filter((u) => u.role === 'kopkar').length);
        setListSekolah(data.filter((u) => u.role === 'sekolah').map(u => ({ id: u.id, name: u.school_name || u.id })));
      }
    };
    fetchStats();
  }, []);

  const [selectedSchoolReset, setSelectedSchoolReset] = useState<string>('ALL');

  const handleToggleMaintenance = () => {
    const message = isMaintenanceMode
      ? 'Apakah Anda yakin ingin menonaktifkan Mode Maintenance? Pengguna Karyawan dan Sekolah akan dapat login kembali.'
      : 'Apakah Anda yakin ingin mengaktifkan Mode Maintenance? Semua role Karyawan dan Sekolah TIDAK AKAN BISA login atau mengakses sistem saat ini.';

    if (window.confirm(message)) {
      toggleMaintenanceMode();
    }
  };

  const handleResetHistory = async () => {
    const isAll = selectedSchoolReset === 'ALL';
    const msg = isAll 
      ? 'PERINGATAN BAHAYA: Anda akan MENGHAPUS SEMUA RIWAYAT PESANAN (Orders, Order Items, dan Returns) dari SELURUH SEKOLAH. Tindakan ini TIDAK BISA DIBATALKAN. Yakin ingin melanjutkan?'
      : 'PERINGATAN BAHAYA: Anda akan MENGHAPUS riwayat pesanan (Orders dan Returns) KHUSUS UNTUK SEKOLAH YANG DIPILIH. Tindakan ini TIDAK BISA DIBATALKAN. Yakin ingin melanjutkan?';

    const confirm1 = window.confirm(msg);
    if (!confirm1) return;
    const confirm2 = window.prompt(`Ketik "RESET" untuk mengonfirmasi penghapusan history pengetesan${isAll ? ' semua sekolah' : ''}:`);
    if (confirm2 !== 'RESET') {
      alert('Konfirmasi dibatalkan. Data aman.');
      return;
    }
    
    try {
      if (isAll) {
        // Ambil semua order_id terlebih dahulu
        const { data: allOrders } = await supabase.from('orders').select('id');
        if (allOrders && allOrders.length > 0) {
          const orderIds = allOrders.map(o => o.id);
          // Hapus order items berdasarkan order_id
          const { error: err0 } = await supabase.from('order_items').delete().in('order_id', orderIds);
          if (err0) console.warn('Info order_items:', err0.message);
          // Hapus orders
          const { error: err1 } = await supabase.from('orders').delete().in('id', orderIds);
          if (err1) throw err1;
        }

        // Ambil semua returns dan hapus
        const { data: allReturns } = await supabase.from('returns').select('id');
        if (allReturns && allReturns.length > 0) {
          const returnIds = allReturns.map(r => r.id);
          const { error: err2 } = await supabase.from('returns').delete().in('id', returnIds);
          if (err2) throw err2;
        }
      } else {
        const { error: err1 } = await supabase.from('orders').delete().eq('school_user_id', selectedSchoolReset);
        const { error: err2 } = await supabase.from('returns').delete().eq('school_user_id', selectedSchoolReset);
        if (err1) throw err1;
        if (err2) throw err2;
      }
      alert('BERHASIL: History transaksi telah dihapus. Silakan muat ulang halaman (F5).');
      window.location.reload();
    } catch (err: any) {
      alert('Terjadi kesalahan: ' + err.message);
    }
  };

  return (
    <div className="admin-dashboard">
      <h2>Admin Dashboard</h2>

      {/* Control Panel Mode Maintenance */}
      <div
        style={{
          background: isMaintenanceMode ? '#fff1f2' : '#ffffff',
          border: `1.5px solid ${isMaintenanceMode ? '#fecdd3' : '#d5deef'}`,
          borderRadius: '16px',
          padding: '20px 24px',
          marginBottom: '26px',
          boxShadow: '0 2px 8px rgba(57, 88, 134, 0.05)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '16px',
          transition: 'all 0.3s ease',
        }}
      >
        <div style={{ maxWidth: '640px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
            <span style={{ fontSize: '1.4rem' }}>🛠️</span>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1e2d42', margin: 0 }}>
              Mode Pemeliharaan Sistem (Maintenance Mode)
            </h3>
            <span
              style={{
                fontSize: '0.74rem',
                fontWeight: 700,
                padding: '3px 10px',
                borderRadius: '20px',
                background: isMaintenanceMode ? '#fee2e2' : '#e6f7f5',
                color: isMaintenanceMode ? '#e11d48' : '#0d9488',
                border: `1px solid ${isMaintenanceMode ? '#fca5a5' : '#99f6e4'}`,
                textTransform: 'uppercase',
                letterSpacing: '0.03em',
              }}
            >
              {isMaintenanceMode ? '🔴 Maintenance Aktif' : '🟢 Sistem Normal'}
            </span>
          </div>
          <p style={{ fontSize: '0.86rem', color: '#586b84', lineHeight: 1.5, margin: 0 }}>
            {isMaintenanceMode
              ? 'Mode Maintenance sedang AKTIF. Akses untuk role Karyawan Koperasi dan PIC Sekolah diblokir sementara. Hanya Administrator yang dapat login dan mengakses dashboard.'
              : 'Aktifkan mode ini jika Anda ingin melakukan perubahan/pembaruan pada role Karyawan maupun Sekolah, sehingga mereka tidak dapat login terlebih dahulu.'}
          </p>
        </div>

        <div>
          <button
            type="button"
            onClick={handleToggleMaintenance}
            style={{
              padding: '10px 20px',
              backgroundColor: isMaintenanceMode ? '#0d9488' : '#e11d48',
              color: '#ffffff',
              border: 'none',
              borderRadius: '10px',
              fontSize: '0.88rem',
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: `0 4px 12px ${isMaintenanceMode ? 'rgba(13, 148, 136, 0.25)' : 'rgba(225, 29, 72, 0.25)'}`,
              transition: 'all 0.2s',
              whiteSpace: 'nowrap',
            }}
          >
            {isMaintenanceMode ? '✓ Matikan Maintenance (Buka Akses)' : '⚠️ Aktifkan Mode Maintenance'}
          </button>
        </div>
      </div>

      {/* Danger Zone: Reset Data */}
      <div
        style={{
          background: '#fff1f2',
          border: '1.5px solid #fecdd3',
          borderRadius: '16px',
          padding: '20px 24px',
          marginBottom: '26px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '16px',
        }}
      >
        <div style={{ maxWidth: '640px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
            <span style={{ fontSize: '1.4rem' }}>⚠️</span>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#be123c', margin: 0 }}>
              Danger Zone: Hapus Riwayat Pengetesan
            </h3>
          </div>
          <p style={{ fontSize: '0.86rem', color: '#9f1239', lineHeight: 1.5, margin: 0 }}>
            Tindakan ini akan menghapus seluruh data transaksi dari tabel <strong>orders, order_items, dan returns</strong> di Supabase secara permanen. Gunakan fitur ini HANYA jika Anda ingin mengosongkan riwayat pengetesan (Master barang dan akun pengguna TIDAK akan terhapus).
          </p>
        </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <select
              value={selectedSchoolReset}
              onChange={(e) => setSelectedSchoolReset(e.target.value)}
              style={{
                padding: '10px 14px',
                border: '1.5px solid #fecdd3',
                borderRadius: '10px',
                fontSize: '0.88rem',
                outline: 'none',
              }}
            >
              <option value="ALL">SEMUA SEKOLAH (Seluruh Data)</option>
              {listSekolah.map(s => (
                <option key={s.id} value={s.id}>{s.name || s.id}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleResetHistory}
              style={{
                padding: '10px 20px',
                backgroundColor: '#e11d48',
                color: '#ffffff',
                border: 'none',
                borderRadius: '10px',
                fontSize: '0.88rem',
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(225, 29, 72, 0.25)',
                whiteSpace: 'nowrap',
              }}
            >
              🗑️ Hapus History Transaksi
            </button>
          </div>
      </div>

      {/* Control Panel Pesanan Sekolah */}
      <div
        style={{
          background: '#ffffff',
          border: '1.5px solid #d5deef',
          borderRadius: '16px',
          padding: '20px 24px',
          marginBottom: '26px',
          boxShadow: '0 2px 8px rgba(57, 88, 134, 0.05)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
          <span style={{ fontSize: '1.4rem' }}>🛒</span>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1e2d42', margin: 0 }}>
            Pengaturan Fase Pemesanan Sekolah
          </h3>
        </div>
        
        <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
          {/* Phase 1 Toggle */}
          <div style={{ flex: '1 1 300px', background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontWeight: 600, color: '#0f172a', marginBottom: '4px' }}>Pemesanan Tahap 1</div>
              <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                Status: <strong style={{ color: phase1Open ? '#059669' : '#dc2626' }}>{phase1Open ? 'DIBUKA' : 'DITUTUP'}</strong>
              </div>
            </div>
            <button
              onClick={() => updatePhaseStatus(1, !phase1Open)}
              style={{
                padding: '8px 16px',
                backgroundColor: phase1Open ? '#dc2626' : '#059669',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              {phase1Open ? 'Tutup Tahap 1' : 'Buka Tahap 1'}
            </button>
          </div>

          {/* Phase 2 Toggle */}
          <div style={{ flex: '1 1 300px', background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontWeight: 600, color: '#0f172a', marginBottom: '4px' }}>Pemesanan Tahap 2</div>
              <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                Status: <strong style={{ color: phase2Open ? '#059669' : '#dc2626' }}>{phase2Open ? 'DIBUKA' : 'DITUTUP'}</strong>
              </div>
            </div>
            <button
              onClick={() => updatePhaseStatus(2, !phase2Open)}
              style={{
                padding: '8px 16px',
                backgroundColor: phase2Open ? '#dc2626' : '#059669',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              {phase2Open ? 'Tutup Tahap 2' : 'Buka Tahap 2'}
            </button>
          </div>
          
          {/* Tambahan Settings */}
          <div style={{ flex: '1 1 100%', background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 600, color: '#0f172a', marginBottom: '4px' }}>Pemesanan Tambahan</div>
                <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                  Status Akses Utama: <strong style={{ color: settings.tambahanOpen ? '#059669' : '#dc2626' }}>{settings.tambahanOpen ? 'DIBUKA' : 'DITUTUP'}</strong>
                </div>
              </div>
              <button
                onClick={() => settings.updateTambahanSettings({ isOpen: !settings.tambahanOpen })}
                style={{
                  padding: '8px 16px',
                  backgroundColor: settings.tambahanOpen ? '#dc2626' : '#059669',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                {settings.tambahanOpen ? 'Tutup Fase Tambahan' : 'Buka Fase Tambahan'}
              </button>
            </div>
            
            {/* Additional Tambahan Rules */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '12px', borderTop: '1px solid #e2e8f0', paddingTop: '16px' }}>
              <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#334155' }}>Persyaratan Pemesanan Tambahan</div>
              
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem', cursor: 'pointer' }}>
                <input 
                  type="checkbox" 
                  checked={settings.tambahanUseDayRule}
                  onChange={(e) => settings.updateTambahanSettings({ useDayRule: e.target.checked })}
                  style={{ width: '16px', height: '16px' }}
                />
                Gunakan Aturan Hari Jenjang (TK=Senin, SD=Selasa, dst)
              </label>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem', cursor: 'pointer' }}>
                  <input 
                    type="checkbox" 
                    checked={settings.tambahanUseDateRule}
                    onChange={(e) => settings.updateTambahanSettings({ useDateRule: e.target.checked })}
                    style={{ width: '16px', height: '16px' }}
                  />
                  Gunakan Rentang Tanggal Khusus
                </label>
                
                {settings.tambahanUseDateRule && (
                  <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginLeft: '24px', flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '4px' }}>Start Date</div>
                      <input 
                        type="date" 
                        value={settings.tambahanStartDate}
                        onChange={(e) => settings.updateTambahanSettings({ startDate: e.target.value })}
                        style={{ padding: '6px 12px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                      />
                    </div>
                    <div>
                      <div style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '4px' }}>Finish Date</div>
                      <input 
                        type="date" 
                        value={settings.tambahanEndDate}
                        onChange={(e) => settings.updateTambahanSettings({ endDate: e.target.value })}
                        style={{ padding: '6px 12px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="admin-stats">
        <div className="stat-card">
          <div className="stat-icon">🛡️</div>
          <div className="stat-label">Admin</div>
          <div className="stat-value">{totalAdmin}</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">🏪</div>
          <div className="stat-label">Karyawan Kopkar</div>
          <div className="stat-value">{totalKopkar}</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">🏫</div>
          <div className="stat-label">Sekolah</div>
          <div className="stat-value">{totalSekolah}</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">👥</div>
          <div className="stat-label">Total User</div>
          <div className="stat-value">{totalAdmin + totalKopkar + totalSekolah}</div>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
