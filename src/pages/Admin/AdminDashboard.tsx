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
  const [totalOrders, setTotalOrders] = useState(0);
  const [totalReturns, setTotalReturns] = useState(0);
  const [nextTodayOrderId, setNextTodayOrderId] = useState('');
  const [schoolOptions, setSchoolOptions] = useState<{
    schoolName: string;
    userIds: string[];
    orderCount: number;
    returnCount: number;
    accountTypes: string[];
  }[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);
  const [selectedSchoolReset, setSelectedSchoolReset] = useState<string>('ALL');
  const [gdriveUrlInput, setGdriveUrlInput] = useState<string>('');
  const [gdriveFolderInput, setGdriveFolderInput] = useState<string>('');
  const [gdrivePaymentFolderInput, setGdrivePaymentFolderInput] = useState<string>('');

  useEffect(() => {
    setGdriveUrlInput(settings.gdriveWebAppUrl || '');
    setGdriveFolderInput(settings.gdriveFolderUrl || '');
    setGdrivePaymentFolderInput(settings.gdrivePaymentFolderUrl || '');
  }, [settings.gdriveWebAppUrl, settings.gdriveFolderUrl, settings.gdrivePaymentFolderUrl]);

  const extractDriveFolderId = (rawUrlOrId: string) => {
    const clean = (rawUrlOrId || '').trim();
    if (!clean) return '';
    const folderMatch = clean.match(/\/folders\/([a-zA-Z0-9_-]+)/);
    if (folderMatch && folderMatch[1]) return folderMatch[1];
    const idMatch = clean.match(/[-\w]{25,}/);
    return idMatch ? idMatch[0] : clean;
  };

  const fetchStats = async () => {
    try {
      // 1. Fetch app_users
      const { data: usersData } = await supabase.from('app_users').select('id, role, school_name, username');
      if (usersData) {
        setTotalAdmin(usersData.filter((u) => u.role === 'admin').length);
        setTotalKopkar(usersData.filter((u) => u.role === 'kopkar').length);
      }

      // 2. Fetch school_whitelist
      const { data: whitelistData } = await supabase.from('school_whitelist').select('nama_sekolah, email');

      // 3. Fetch orders
      const { data: ordersData } = await supabase.from('orders').select('id, school_user_id, school_name');
      setTotalOrders(ordersData?.length || 0);

      // 4. Fetch returns
      const { data: returnsData } = await supabase.from('returns').select('id, school_user_id, school_name');
      setTotalReturns(returnsData?.length || 0);

      // Hitung urutan order berikutnya untuk hari ini
      const d = new Date();
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const dateForId = `${year}${month}${day}`;
      const prefix = `ORD-${dateForId}-`;
      const todayOrders = (ordersData || []).filter(o => o.id?.startsWith(prefix));
      let maxSeq = 0;
      todayOrders.forEach(o => {
        const parts = (o.id || '').split('-');
        if (parts.length >= 3) {
          const num = parseInt(parts[2], 10);
          if (!isNaN(num) && num > maxSeq) maxSeq = num;
        }
      });
      const nextSeq = String(maxSeq + 1).padStart(3, '0');
      setNextTodayOrderId(`ORD-${dateForId}-${nextSeq}`);

      // Kumpulkan dan gabungkan seluruh data sekolah dari akun Google & manajemen user
      const schoolMap = new Map<string, { userIds: Set<string>; orderCount: number; returnCount: number; hasGoogle: boolean; hasManual: boolean }>();

      (usersData || []).forEach(u => {
        if (u.role === 'sekolah' && u.school_name) {
          const sName = u.school_name.trim();
          if (!schoolMap.has(sName)) {
            schoolMap.set(sName, { userIds: new Set(), orderCount: 0, returnCount: 0, hasGoogle: false, hasManual: false });
          }
          const item = schoolMap.get(sName)!;
          if (u.id) item.userIds.add(u.id);
          item.hasManual = true;
        }
      });

      (whitelistData || []).forEach(w => {
        if (w.nama_sekolah) {
          const sName = w.nama_sekolah.trim();
          if (!schoolMap.has(sName)) {
            schoolMap.set(sName, { userIds: new Set(), orderCount: 0, returnCount: 0, hasGoogle: false, hasManual: false });
          }
          const item = schoolMap.get(sName)!;
          item.hasGoogle = true;
        }
      });

      (ordersData || []).forEach(o => {
        const sName = (o.school_name || '').trim();
        if (sName) {
          if (!schoolMap.has(sName)) {
            schoolMap.set(sName, { userIds: new Set(), orderCount: 0, returnCount: 0, hasGoogle: false, hasManual: false });
          }
          const item = schoolMap.get(sName)!;
          item.orderCount += 1;
          if (o.school_user_id) item.userIds.add(o.school_user_id);
        }
      });

      (returnsData || []).forEach(r => {
        const sName = (r.school_name || '').trim();
        if (sName) {
          if (!schoolMap.has(sName)) {
            schoolMap.set(sName, { userIds: new Set(), orderCount: 0, returnCount: 0, hasGoogle: false, hasManual: false });
          }
          const item = schoolMap.get(sName)!;
          item.returnCount += 1;
          if (r.school_user_id) item.userIds.add(r.school_user_id);
        }
      });

      const parsedOptions = Array.from(schoolMap.entries()).map(([name, val]) => {
        const accTypes = [];
        if (val.hasGoogle) accTypes.push('Google Whitelist');
        if (val.hasManual) accTypes.push('Manajemen User');
        return {
          schoolName: name,
          userIds: Array.from(val.userIds),
          orderCount: val.orderCount,
          returnCount: val.returnCount,
          accountTypes: accTypes,
        };
      }).sort((a, b) => a.schoolName.localeCompare(b.schoolName, 'id', { numeric: true, sensitivity: 'base' }));

      setSchoolOptions(parsedOptions);
    } catch (err) {
      console.error('Error fetching admin stats:', err);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const totalSekolah = schoolOptions.length;

  const handleToggleMaintenance = () => {
    const message = isMaintenanceMode
      ? 'Apakah Anda yakin ingin menonaktifkan Mode Maintenance? Pengguna Karyawan dan Sekolah akan dapat login kembali.'
      : 'Apakah Anda yakin ingin mengaktifkan Mode Maintenance? Semua role Karyawan dan Sekolah TIDAK AKAN BISA login atau mengakses sistem saat ini.';

    if (window.confirm(message)) {
      toggleMaintenanceMode();
    }
  };

  const chunkArray = (arr: any[], size: number) => {
    const res = [];
    for (let i = 0; i < arr.length; i += size) res.push(arr.slice(i, i + size));
    return res;
  };

  const handleResetHistory = async () => {
    const isAll = selectedSchoolReset === 'ALL';
    const isToday = selectedSchoolReset === 'TODAY';
    const targetSchool = schoolOptions.find(s => s.schoolName === selectedSchoolReset);

    let desc = '';
    if (isAll) {
      desc = 'SEMUA RIWAYAT PESANAN & RETUR dari SELURUH SEKOLAH (Akun Google maupun Akun Manajemen User). Nomor urut order hari ini akan ter-reset kembali ke 001.';
    } else if (isToday) {
      desc = 'SELURUH PESANAN HARI INI dari semua sekolah. Nomor urut pesanan hari ini akan langsung ter-reset kembali ke 001.';
    } else if (targetSchool) {
      desc = `seluruh riwayat pesanan & retur untuk sekolah "${targetSchool.schoolName}" (termasuk pesanan via Akun Google dan Manajemen User).`;
    } else {
      desc = `riwayat pesanan untuk "${selectedSchoolReset}".`;
    }

    const confirm1 = window.confirm(`PERINGATAN BAHAYA:\nAnda akan MENGHAPUS ${desc}\n\nTindakan ini TIDAK BISA DIBATALKAN. Yakin ingin melanjutkan?`);
    if (!confirm1) return;

    const confirm2 = window.prompt(`Ketik "RESET" untuk mengonfirmasi penghapusan history transaksi:`);
    if (confirm2 !== 'RESET') {
      alert('Konfirmasi dibatalkan. Data tetap aman.');
      return;
    }

    setIsDeleting(true);

    try {
      if (isAll) {
        // 1. Ambil seluruh order_id
        const { data: allOrders } = await supabase.from('orders').select('id');
        const orderIds = (allOrders || []).map(o => o.id);
        
        if (orderIds.length > 0) {
          const chunks = chunkArray(orderIds, 50);
          for (const chunk of chunks) {
            await supabase.from('order_items').delete().in('order_id', chunk);
            await supabase.from('orders').delete().in('id', chunk);
          }
        }

        // 2. Ambil seluruh returns
        const { data: allReturns } = await supabase.from('returns').select('id');
        const returnIds = (allReturns || []).map(r => r.id);
        if (returnIds.length > 0) {
          const chunks = chunkArray(returnIds, 50);
          for (const chunk of chunks) {
            await supabase.from('returns').delete().in('id', chunk);
          }
        }

        // 3. Reset saldo retur di app_users
        await supabase.from('app_users').update({ return_balance_tagihan: 0, return_balance_fee: 0 }).neq('id', '00000000-0000-0000-0000-000000000000');

      } else if (isToday) {
        // Ambil pesanan hari ini berdasarkan prefix ORD-YYYYMMDD-
        const d = new Date();
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const prefix = `ORD-${year}${month}${day}-`;

        const { data: todayOrders } = await supabase.from('orders').select('id').like('id', `${prefix}%`);
        const orderIds = (todayOrders || []).map(o => o.id);

        if (orderIds.length > 0) {
          const chunks = chunkArray(orderIds, 50);
          for (const chunk of chunks) {
            await supabase.from('order_items').delete().in('order_id', chunk);
            await supabase.from('orders').delete().in('id', chunk);
          }
        }

      } else if (targetSchool) {
        // 1. Ambil pesanan berdasarkan nama sekolah atau user_id terkait (mencakup akun Google & akun Manajemen User)
        const userIds = targetSchool.userIds;
        let ordersQuery = supabase.from('orders').select('id');
        if (userIds.length > 0) {
          ordersQuery = ordersQuery.or(`school_name.eq."${targetSchool.schoolName}",school_user_id.in.(${userIds.join(',')})`);
        } else {
          ordersQuery = ordersQuery.eq('school_name', targetSchool.schoolName);
        }

        const { data: schoolOrders } = await ordersQuery;
        const orderIds = (schoolOrders || []).map(o => o.id);

        if (orderIds.length > 0) {
          const chunks = chunkArray(orderIds, 50);
          for (const chunk of chunks) {
            await supabase.from('order_items').delete().in('order_id', chunk);
            await supabase.from('orders').delete().in('id', chunk);
          }
        }

        // 2. Hapus retur untuk sekolah ini
        let returnsQuery = supabase.from('returns').delete();
        if (userIds.length > 0) {
          returnsQuery = returnsQuery.or(`school_name.eq."${targetSchool.schoolName}",school_user_id.in.(${userIds.join(',')})`);
        } else {
          returnsQuery = returnsQuery.eq('school_name', targetSchool.schoolName);
        }
        await returnsQuery;

        // 3. Reset saldo retur di app_users jika ada
        if (userIds.length > 0) {
          await supabase.from('app_users').update({ return_balance_tagihan: 0, return_balance_fee: 0 }).in('id', userIds);
        }
      }

      alert('BERHASIL: History transaksi telah dihapus. Sekolah sekarang dapat membuat pesanan baru, dan nomor urut pesanan hari ini ter-reset kembali ke 001.');
      await fetchStats();
    } catch (err: any) {
      alert('Terjadi kesalahan saat menghapus history: ' + err.message);
    } finally {
      setIsDeleting(false);
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
          padding: '24px',
          marginBottom: '26px',
          boxShadow: '0 2px 8px rgba(225, 29, 72, 0.05)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '16px' }}>
          <div style={{ maxWidth: '640px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
              <span style={{ fontSize: '1.4rem' }}>⚠️</span>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#be123c', margin: 0 }}>
                Danger Zone: Hapus Riwayat Pengetesan & Reset Nomor Order
              </h3>
            </div>
            <p style={{ fontSize: '0.88rem', color: '#9f1239', lineHeight: 1.5, margin: 0 }}>
              Fitur khusus masa testing: Menghapus data transaksi dari tabel <strong>orders, order_items, dan returns</strong> (mencakup pesanan dari akun Google Whitelist maupun Akun Manajemen User). Setelah dihapus, sekolah dapat memulai pesanan baru dan nomor order otomatis ter-reset kembali ke urutan <strong>001</strong> (contoh: <code>{nextTodayOrderId || 'ORD-YYYYMMDD-001'}</code>). Master barang dan akun pengguna TIDAK akan terhapus.
            </p>
          </div>

          {/* Status Badge Info */}
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <div style={{ background: '#ffe4e6', border: '1px solid #fda4af', borderRadius: '10px', padding: '8px 14px', fontSize: '0.82rem', color: '#9f1239' }}>
              <div>Total Pesanan di Database: <strong>{totalOrders}</strong></div>
              <div>Total Retur di Database: <strong>{totalReturns}</strong></div>
            </div>
            <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '10px', padding: '8px 14px', fontSize: '0.82rem', color: '#1e40af' }}>
              <div>Urutan Order Hari Ini:</div>
              <strong style={{ fontSize: '0.95rem' }}>{nextTodayOrderId || 'ORD-YYYYMMDD-001'}</strong>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '14px', background: '#ffffff', padding: '16px', borderRadius: '12px', border: '1px solid #fecdd3' }}>
          <div style={{ flex: '1 1 340px' }}>
            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
              Pilih Target Penghapusan Riwayat:
            </label>
            <select
              value={selectedSchoolReset}
              onChange={(e) => setSelectedSchoolReset(e.target.value)}
              disabled={isDeleting}
              style={{
                width: '100%',
                padding: '10px 14px',
                border: '1.5px solid #cbd5e1',
                borderRadius: '8px',
                fontSize: '0.88rem',
                outline: 'none',
                backgroundColor: '#ffffff',
              }}
            >
              <optgroup label="Pilihan Global">
                <option value="ALL">💥 SEMUA SEKOLAH & AKUN (Hapus Seluruh Data Transaksi)</option>
                <option value="TODAY">📅 HANYA PESANAN HARI INI (Reset Nomor Urut Hari Ini ke 001)</option>
              </optgroup>
              <optgroup label="Pilih Riwayat Per Sekolah (Google & Manajemen User)">
                {schoolOptions.map(s => (
                  <option key={s.schoolName} value={s.schoolName}>
                    🏫 {s.schoolName} {s.accountTypes.length > 0 ? `[${s.accountTypes.join(' & ')}]` : ''} ({s.orderCount} pesanan, {s.returnCount} retur)
                  </option>
                ))}
              </optgroup>
            </select>
          </div>

          <div style={{ alignSelf: 'flex-end' }}>
            <button
              type="button"
              onClick={handleResetHistory}
              disabled={isDeleting}
              style={{
                padding: '11px 22px',
                backgroundColor: isDeleting ? '#94a3b8' : '#e11d48',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                fontSize: '0.88rem',
                fontWeight: 700,
                cursor: isDeleting ? 'not-allowed' : 'pointer',
                boxShadow: '0 4px 12px rgba(225, 29, 72, 0.25)',
                whiteSpace: 'nowrap',
                transition: 'all 0.2s',
              }}
            >
              {isDeleting ? '⏳ Sedang Menghapus...' : '🗑️ Hapus History & Reset Nomor'}
            </button>
          </div>
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

          {/* Google Drive Direct Upload Settings */}
          <div style={{ flex: '1 1 100%', background: '#f0f9ff', padding: '18px', borderRadius: '12px', border: '1px solid #bae6fd', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ fontWeight: 700, color: '#0369a1', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>☁️</span> Integrasi Upload Google Drive Koperasi (Lembar Pemesanan & Bukti Pelunasan)
            </div>
            <div style={{ fontSize: '0.82rem', color: '#334155', lineHeight: 1.5 }}>
              1. Masukkan <strong>Link Folder Google Drive Pemesanan</strong> dan (opsional) <strong>Link Folder Bukti Pelunasan Tagihan</strong>.<br />
              2. Klik tombol <strong>Salin Kode Google Apps Script</strong>, lalu pasang di <a href="https://script.google.com" target="_blank" rel="noopener noreferrer" style={{ color: '#0284c7', fontWeight: 700 }}>script.google.com</a> (Pilih <em>Deploy &gt; New deployment &gt; Web app &gt; Execute as: Me &gt; Who has access: Anyone</em>).<br />
              3. Cukup gunakan <strong>1 Web App URL</strong> hasil deploy untuk mengunggah otomatis file pemesanan maupun bukti pelunasan ke folder masing-masing.
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#0c4a6e', marginBottom: '4px' }}>
                  1. Link Folder Google Drive Lembar Pemesanan (Tahap 1 & 2):
                </label>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  <input
                    type="text"
                    placeholder="Contoh: https://drive.google.com/drive/folders/1aBcDeFgHiJkLmNoPqRsTuVwXyZ12345"
                    value={gdriveFolderInput}
                    onChange={(e) => setGdriveFolderInput(e.target.value)}
                    style={{ flex: '1 1 320px', padding: '9px 12px', borderRadius: '8px', border: '1px solid #93c5fd', fontSize: '0.85rem', background: '#fff' }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const fid = extractDriveFolderId(gdriveFolderInput) || extractDriveFolderId(gdrivePaymentFolderInput) || 'ISI_DENGAN_FOLDER_ID_ANDA';
                      const scriptCode = `const DEFAULT_FOLDER_ID = '${fid}';

function extractId(raw) {
  if (!raw) return DEFAULT_FOLDER_ID;
  var m = String(raw).match(/\\/folders\\/([a-zA-Z0-9_-]+)/);
  if (m && m[1]) return m[1];
  var m2 = String(raw).match(/[-\\w]{25,}/);
  return m2 ? m2[0] : String(raw).trim();
}

function doPost(e) {
  try {
    var payload = {};
    if (e.postData && e.postData.contents) {
      try {
        payload = JSON.parse(e.postData.contents);
      } catch (errJson) {
        payload = e.parameter || {};
      }
    } else if (e.parameter) {
      payload = e.parameter;
    }

    var rawFolderId = payload.folderId || DEFAULT_FOLDER_ID;
    var folderId = extractId(rawFolderId);
    var folder = DriveApp.getFolderById(folderId);

    var b64 = payload.base64Data || payload.data;
    var decodedBytes = Utilities.base64Decode(b64);
    var fileName = payload.fileName || payload.filename || ('Upload_' + new Date().getTime());
    var mimeType = payload.mimeType || 'application/octet-stream';
    var blob = Utilities.newBlob(decodedBytes, mimeType, fileName);
    var file = folder.createFile(blob);

    try {
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (shareErr) {}

    var fileUrl = file.getUrl();
    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      status: 'success',
      fileId: file.getId(),
      fileUrl: fileUrl,
      url: fileUrl,
      folderUrl: folder.getUrl(),
      folderName: folder.getName()
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      status: 'error',
      error: err.toString(),
      message: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}`;
                      navigator.clipboard.writeText(scriptCode);
                      alert(`Kode Google Apps Script berhasil disalin ke Clipboard!\n\nDefault Folder ID: ${fid}\nScript ini otomatis mendukung folder Lembar Pemesanan & Bukti Pelunasan secara terpisah.\n\nSilakan Paste di script.google.com lalu klik Deploy > New deployment > Web app.`);
                    }}
                    style={{ padding: '9px 14px', backgroundColor: '#ffffff', color: '#0369a1', border: '1.5px solid #0284c7', borderRadius: '8px', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}
                  >
                    📋 Salin Kode Google Apps Script
                  </button>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#0c4a6e', marginBottom: '4px' }}>
                  2. Link Folder Google Drive Bukti Pelunasan Tagihan Sekolah:
                </label>
                <input
                  type="text"
                  placeholder="Contoh: https://drive.google.com/drive/folders/... (Jika dikosongkan, bukti transfer akan disimpan di folder pemesanan di atas)"
                  value={gdrivePaymentFolderInput}
                  onChange={(e) => setGdrivePaymentFolderInput(e.target.value)}
                  style={{ width: '100%', maxWidth: '640px', padding: '9px 12px', borderRadius: '8px', border: '1px solid #93c5fd', fontSize: '0.85rem', background: '#fff', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#0c4a6e', marginBottom: '4px' }}>
                  3. Web App URL (Google Apps Script yang berakhiran /exec):
                </label>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  <input
                    type="url"
                    placeholder="https://script.google.com/macros/s/AKfycb.../exec"
                    value={gdriveUrlInput}
                    onChange={(e) => setGdriveUrlInput(e.target.value)}
                    style={{ flex: '1 1 320px', padding: '9px 12px', borderRadius: '8px', border: '1px solid #93c5fd', fontSize: '0.85rem', background: '#fff' }}
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      if (gdriveUrlInput.includes('drive.google.com/drive/folders')) {
                        alert('PERHATIAN:\nLink yang Anda masukkan di kolom Web App URL adalah Link Folder Google Drive biasa, bukan Web App URL dari Google Apps Script (https://script.google.com/macros/s/.../exec).\n\nSaya pindahkan Link Folder tersebut ke kolom 1. Silakan pasang juga Web App URL dari script.google.com di kolom 3 agar file benar-benar ter-upload otomatis ke dalam folder tersebut.');
                        setGdriveFolderInput(gdriveUrlInput);
                        await settings.updateGdriveWebAppUrl(gdriveUrlInput, gdriveUrlInput, gdrivePaymentFolderInput);
                        return;
                      }
                      await settings.updateGdriveWebAppUrl(gdriveUrlInput, gdriveFolderInput, gdrivePaymentFolderInput);
                      alert('Pengaturan Google Drive berhasil disimpan!');
                    }}
                    style={{ padding: '9px 18px', backgroundColor: '#0284c7', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}
                  >
                    💾 Simpan Pengaturan Google Drive
                  </button>
                </div>
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
