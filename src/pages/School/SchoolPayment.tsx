import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { useOrders } from '../../context/OrderContext';
import './school.css';

const SchoolPayment = () => {
  const { user } = useAuth();
  const { uploadPaymentReceipt } = useOrders();

  const [unpaidOrders, setUnpaidOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);
  const [totalCount, setTotalCount] = useState(0);

  const GAS_URL = 'https://script.google.com/macros/s/AKfycbzhByEZzU-c5LWpJJK74Kcy0xcwQal-kmwHuIwAPnaCUJxYMbp9b_cWs5_-SNCsIJE/exec';
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);

  const handleUploadClick = (orderId: string) => {
    setUploadingId(orderId);
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !uploadingId) return;

    if (file.size > 5 * 1024 * 1024) {
      alert('Ukuran file maksimal 5MB.');
      setUploadingId(null);
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      const base64Str = reader.result?.toString().split(',')[1];
      if (!base64Str) {
        setUploadingId(null);
        return;
      }
      
      try {
        const params = new URLSearchParams();
        params.append('data', base64Str);
        params.append('mimeType', file.type);
        params.append('filename', `Bukti_Transfer_${uploadingId}_${file.name}`);

        const response = await fetch(GAS_URL, {
          method: 'POST',
          body: params,
        });
        
        const result = await response.json();
        if (result.status === 'success') {
          await uploadPaymentReceipt(uploadingId, result.url);
          fetchUnpaidOrders(); // Refresh table
          alert('Bukti transfer berhasil diupload!');
        } else {
          alert('Gagal upload: ' + result.message);
        }
      } catch (err) {
        console.error(err);
        alert('Terjadi kesalahan koneksi saat mengupload bukti transfer.');
      } finally {
        setUploadingId(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsDataURL(file);
  };


  const fetchUnpaidOrders = async () => {
    if (!user?.id) return;
    setLoading(true);

    let query = supabase
      .from('orders')
      .select('*, order_items(*)', { count: 'exact' })
      .eq('school_user_id', user.id)
      .eq('payment_status', 'unpaid')
      .not('status', 'in', '("cancelled","rejected","cancellation_requested")');

    // Pagination
    const from = (currentPage - 1) * itemsPerPage;
    const to = from + itemsPerPage - 1;
    query = query.order('created_at', { ascending: false }).range(from, to);

    const { data, count, error } = await query;
    if (!error && data) {
      setUnpaidOrders(data);
      if (count !== null) setTotalCount(count);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchUnpaidOrders();
  }, [user?.id, currentPage]);

  const formatRupiah = (num: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0,
    }).format(num);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  return (
    <div className="school-dashboard">
      <div className="school-header-section">
        <div>
          <h2>Informasi Pelunasan Tagihan</h2>
          <div className="school-welcome">
            Pastikan seluruh tagihan pesanan diselesaikan agar pencairan fee sekolah dapat diproses.
          </div>
        </div>
      </div>

      <div className="order-live-summary-card" style={{ marginBottom: '20px', borderLeft: '4px solid #3b82f6' }}>
        <h4 style={{ margin: '0 0 10px 0', color: '#1e293b' }}>ℹ️ Panduan Pembayaran</h4>
        <p style={{ margin: '0 0 8px 0', fontSize: '0.9rem', color: '#475569', lineHeight: 1.5 }}>
          Pembayaran dilakukan melalui transfer ke rekening resmi Koperasi:
          <br />
          <strong>Bank BCA: 0760256757 a.n. Koperasi Konsumen Karyawan BPK Penabur</strong>
        </p>
        <p style={{ margin: 0, fontSize: '0.9rem', color: '#475569', lineHeight: 1.5 }}>
          Setelah melakukan transfer, silakan konfirmasi ke pihak Koperasi melalui WhatsApp atau bawa bukti bayar ke kantor Koperasi agar status pesanan dapat diubah menjadi <strong>Lunas</strong>.
        </p>
      </div>

      <div className="order-toolbar">
        <h3>Daftar Tagihan Belum Lunas</h3>
        <input 
          type="file" 
          ref={fileInputRef} 
          onChange={handleFileChange} 
          accept="image/*,application/pdf" 
          style={{ display: 'none' }} 
        />
      </div>

      {loading ? (
        <p style={{ padding: '20px', textAlign: 'center', color: '#64748b' }}>Memuat tagihan...</p>
      ) : unpaidOrders.length > 0 ? (
        <>
          <div className="order-table-container desktop-table-view">
            <table className="order-table">
              <thead>
                <tr>
                  <th>ID Pesanan</th>
                  <th>Tanggal Pesan</th>
                  <th>Status Pesanan</th>
                  <th>Total Tagihan Siswa</th>
                  <th>Keterangan</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {unpaidOrders.map((order: any) => (
                  <tr key={order.id}>
                    <td><strong>{order.id}</strong></td>
                    <td>{formatDate(order.created_at)}</td>
                    <td>
                      <span className={`status-badge ${order.status}`}>
                        {order.status === 'pending' && '⏳ Menunggu'}
                        {order.status === 'approved' && '👍 Disetujui'}
                        {order.status === 'shipped' && '🚚 Dikirim'}
                        {order.status === 'received' && '✅ Diterima'}
                      </span>
                    </td>
                    <td>
                      <strong style={{ fontSize: '1.05rem', color: '#0f172a' }}>
                        {formatRupiah(order.total_price_student)}
                      </strong>
                    </td>
                    <td>
                      <span className="badge-pay-unpaid">🔴 Menunggu Pelunasan</span>
                    </td>
                    <td>
                      {order.paid_notes && order.paid_notes.includes('[BUKTI_TRANSFER]') ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <span style={{ fontSize: '0.8rem', color: '#047857', fontWeight: 600 }}>✅ Sedang diverifikasi Koperasi</span>
                          <a href={order.paid_notes.replace('[BUKTI_TRANSFER] ', '')} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.8rem', color: '#3b82f6' }}>Lihat Bukti</a>
                        </div>
                      ) : order.status === 'received' ? (
                        <button 
                          className="btn-ship" 
                          style={{ padding: '6px 12px', fontSize: '0.85rem' }}
                          onClick={() => handleUploadClick(order.id)}
                          disabled={uploadingId === order.id}
                        >
                          {uploadingId === order.id ? 'Mengupload...' : 'Upload Bukti'}
                        </button>
                      ) : (
                        <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Harus Diterima</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile View */}
          <div className="mobile-cards-view">
            {unpaidOrders.map((order) => (
              <div className="mobile-order-card" key={order.id}>
                <div className="mobile-card-header">
                  <div>
                    <span className="mobile-order-id">{order.id}</span>
                    <div className="mobile-card-date">{formatDate(order.created_at)}</div>
                  </div>
                  <span className={`status-badge ${order.status}`}>
                    {order.status === 'pending' && '⏳ Menunggu'}
                    {order.status === 'approved' && '👍 Disetujui'}
                    {order.status === 'shipped' && '🚚 Dikirim'}
                    {order.status === 'received' && '✅ Diterima'}
                  </span>
                </div>
                
                <div className="mobile-price-summary" style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', marginTop: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className="price-sub-label">Total Tagihan:</span>
                    <strong style={{ fontSize: '1.1rem' }}>{formatRupiah(order.total_price_student)}</strong>
                  </div>
                </div>

                <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  {order.paid_notes && order.paid_notes.includes('[BUKTI_TRANSFER]') ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span className="badge-pay-paid">⏳ Sedang Diverifikasi Koperasi</span>
                      <a href={order.paid_notes.replace('[BUKTI_TRANSFER] ', '')} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.8rem', color: '#3b82f6', textAlign: 'center' }}>Lihat Foto Bukti</a>
                    </div>
                  ) : (
                    <>
                      <span className="badge-pay-unpaid">
                        🔴 Menunggu Pelunasan
                      </span>
                      {order.status === 'received' && (
                        <button 
                          className="btn-ship" 
                          style={{ padding: '6px 12px', fontSize: '0.85rem' }}
                          onClick={() => handleUploadClick(order.id)}
                          disabled={uploadingId === order.id}
                        >
                          {uploadingId === order.id ? 'Mengupload...' : 'Upload Bukti'}
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Pagination UI */}
          {totalCount > itemsPerPage && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '16px', marginTop: '24px' }}>
              <button 
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid #cbd5e1', background: currentPage === 1 ? '#f1f5f9' : '#fff', color: currentPage === 1 ? '#94a3b8' : '#1e293b', cursor: currentPage === 1 ? 'not-allowed' : 'pointer' }}
              >
                ← Sebelumnya
              </button>
              <span style={{ fontSize: '0.9rem', color: '#64748b', fontWeight: 500 }}>
                Halaman {currentPage} dari {Math.ceil(totalCount / itemsPerPage)}
              </span>
              <button 
                disabled={currentPage >= Math.ceil(totalCount / itemsPerPage)}
                onClick={() => setCurrentPage(prev => Math.min(Math.ceil(totalCount / itemsPerPage), prev + 1))}
                style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid #cbd5e1', background: currentPage >= Math.ceil(totalCount / itemsPerPage) ? '#f1f5f9' : '#fff', color: currentPage >= Math.ceil(totalCount / itemsPerPage) ? '#94a3b8' : '#1e293b', cursor: currentPage >= Math.ceil(totalCount / itemsPerPage) ? 'not-allowed' : 'pointer' }}
              >
                Selanjutnya →
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="order-empty">
          <div style={{ fontSize: '2rem', marginBottom: '10px' }}>🎉</div>
          <p><strong>Tidak ada tagihan yang belum lunas.</strong></p>
          <p style={{ color: '#64748b' }}>Terima kasih atas kerja sama Anda yang baik dengan Koperasi.</p>
        </div>
      )}
    </div>
  );
};

export default SchoolPayment;
