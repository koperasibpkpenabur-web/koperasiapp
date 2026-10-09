import { useState, useEffect, type FormEvent } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import './kopkar.css';

interface Notification {
  id: string;
  title: string;
  message: string;
  target_type: 'all' | 'level' | 'school';
  target_value: string | null;
  created_by: string;
  created_at: string;
}

const KopkarNotifikasi = () => {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);

  // Form State
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [targetType, setTargetType] = useState<'all' | 'level' | 'school'>('all');
  const [targetValue, setTargetValue] = useState('');

  // Dropdown data
  const [schools, setSchools] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    fetchNotifications();
    fetchSchools();
  }, []);

  const fetchNotifications = async () => {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data) {
      setNotifications(data);
    }
  };

  const fetchSchools = async () => {
    const { data } = await supabase
      .from('app_users')
      .select('id, name')
      .eq('role', 'sekolah');
    
    if (data) setSchools(data);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !message.trim()) {
      alert('Judul dan pesan tidak boleh kosong');
      return;
    }

    if (targetType === 'level' && !targetValue) {
      alert('Pilih jenjang terlebih dahulu');
      return;
    }
    if (targetType === 'school' && !targetValue) {
      alert('Pilih sekolah terlebih dahulu');
      return;
    }

    setLoading(true);
    const { error } = await supabase.from('notifications').insert([{
      title: title.trim(),
      message: message.trim(),
      target_type: targetType,
      target_value: targetType === 'all' ? null : targetValue,
      created_by: user?.name || 'Admin Koperasi'
    }]);

    setLoading(false);
    if (error) {
      alert('Gagal mengirim pengumuman: ' + error.message);
    } else {
      alert('Pengumuman berhasil dikirim!');
      setTitle('');
      setMessage('');
      setTargetType('all');
      setTargetValue('');
      fetchNotifications();
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Yakin ingin menghapus pengumuman ini?')) {
      await supabase.from('notifications').delete().eq('id', id);
      fetchNotifications();
    }
  };

  return (
    <div className="kopkar-dashboard">
      <h2>Pusat Pengumuman (Notifikasi Sekolah)</h2>
      <p style={{ color: '#64748b', marginBottom: '24px' }}>
        Buat pengumuman yang akan muncul sebagai Pop-Up di layar sekolah saat mereka login.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '24px', alignItems: 'start' }}>
        {/* FORM */}
        <div className="kopkar-stat-card" style={{ padding: '24px' }}>
          <h3 style={{ marginTop: 0, marginBottom: '16px', fontSize: '1.2rem' }}>Buat Pengumuman Baru</h3>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontWeight: 'bold' }}>Judul Pengumuman</label>
              <input
                type="text"
                className="search-input"
                style={{ width: '100%', boxSizing: 'border-box' }}
                placeholder="Cth: Info Jadwal Retur"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontWeight: 'bold' }}>Isi Pesan</label>
              <textarea
                className="search-input"
                style={{ width: '100%', boxSizing: 'border-box', minHeight: '120px', resize: 'vertical' }}
                placeholder="Tulis pesan pengumuman di sini..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontWeight: 'bold' }}>Target Audiens</label>
              <select
                className="search-input"
                style={{ width: '100%', boxSizing: 'border-box' }}
                value={targetType}
                onChange={(e) => {
                  setTargetType(e.target.value as any);
                  setTargetValue('');
                }}
              >
                <option value="all">Semua Sekolah</option>
                <option value="level">Per Jenjang (TK/SD/SMP/SMA)</option>
                <option value="school">Sekolah Tertentu</option>
              </select>
            </div>

            {targetType === 'level' && (
              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontWeight: 'bold' }}>Pilih Jenjang</label>
                <select
                  className="search-input"
                  style={{ width: '100%', boxSizing: 'border-box' }}
                  value={targetValue}
                  onChange={(e) => setTargetValue(e.target.value)}
                >
                  <option value="">-- Pilih Jenjang --</option>
                  <option value="TK">TK</option>
                  <option value="SD">SD</option>
                  <option value="SMP">SMP</option>
                  <option value="SMA">SMA</option>
                  <option value="KARYAWAN">KARYAWAN</option>
                </select>
              </div>
            )}

            {targetType === 'school' && (
              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontWeight: 'bold' }}>Pilih Sekolah</label>
                <select
                  className="search-input"
                  style={{ width: '100%', boxSizing: 'border-box' }}
                  value={targetValue}
                  onChange={(e) => setTargetValue(e.target.value)}
                >
                  <option value="">-- Pilih Sekolah --</option>
                  {schools.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
            )}

            <button
              type="submit"
              className="btn-primary"
              style={{ padding: '12px', marginTop: '8px' }}
              disabled={loading}
            >
              {loading ? 'Mengirim...' : '🚀 Kirim Pengumuman'}
            </button>
          </form>
        </div>

        {/* LIST */}
        <div className="kopkar-table-container">
          <h3 style={{ margin: '16px 24px', fontSize: '1.2rem' }}>Riwayat Pengumuman</h3>
          <table className="kopkar-table">
            <thead>
              <tr>
                <th>Waktu & Pengirim</th>
                <th>Judul & Pesan</th>
                <th>Target</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {notifications.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', padding: '24px', color: '#64748b' }}>
                    Belum ada pengumuman yang dibuat.
                  </td>
                </tr>
              ) : (
                notifications.map(n => (
                  <tr key={n.id}>
                    <td>
                      <div style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>
                        {new Date(n.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </div>
                      <div style={{ color: '#64748b', fontSize: '0.85rem' }}>
                        Oleh: {n.created_by}
                      </div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 'bold', color: '#1e293b' }}>{n.title}</div>
                      <div style={{ color: '#475569', fontSize: '0.9rem', marginTop: '4px', whiteSpace: 'pre-wrap' }}>
                        {n.message}
                      </div>
                    </td>
                    <td>
                      {n.target_type === 'all' && <span className="badge-status-approved">Semua Sekolah</span>}
                      {n.target_type === 'level' && <span className="badge-status-pending">Jenjang {n.target_value}</span>}
                      {n.target_type === 'school' && (
                        <span className="badge-fee-locked">
                          {schools.find(s => s.id === n.target_value)?.name || 'Sekolah Terpilih'}
                        </span>
                      )}
                    </td>
                    <td>
                      <button
                        onClick={() => handleDelete(n.id)}
                        className="btn-danger"
                        style={{ padding: '6px 12px', fontSize: '0.85rem' }}
                      >
                        Hapus
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default KopkarNotifikasi;
