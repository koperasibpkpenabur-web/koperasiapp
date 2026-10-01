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

  // Checkbox selection
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);
  const [totalCount, setTotalCount] = useState(0);

  const GAS_URL = 'https://script.google.com/macros/s/AKfycbzhByEZzU-c5LWpJJK74Kcy0xcwQal-kmwHuIwAPnaCUJxYMbp9b_cWs5_-SNCsIJE/exec';
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingIds, setUploadingIds] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      const allIds = unpaidOrders.map(o => o.id);
      setSelectedOrderIds(allIds);
    } else {
      setSelectedOrderIds([]);
    }
  };

  const handleSelectOne = (orderId: string, checked: boolean) => {
    if (checked) {
      setSelectedOrderIds(prev => [...prev, orderId]);
    } else {
      setSelectedOrderIds(prev => prev.filter(id => id !== orderId));
    }
  };

  const handleUploadClick = () => {
    if (selectedOrderIds.length === 0) {
      alert('Pilih minimal 1 pesanan untuk diupload bukti pembayarannya.');
      return;
    }
    setUploadingIds(selectedOrderIds);
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || uploadingIds.length === 0) return;

    if (file.size > 5 * 1024 * 1024) {
      alert('Ukuran file maksimal 5MB.');
      setUploadingIds([]);
      return;
    }

    setIsUploading(true);
    const reader = new FileReader();
    reader.onload = async () => {
      const base64Str = reader.result?.toString().split(',')[1];
      if (!base64Str) {
        setUploadingIds([]);
        setIsUploading(false);
        return;
      }
      
      try {
        const params = new URLSearchParams();
        params.append('data', base64Str);
        params.append('mimeType', file.type);
        // Use the first ID as part of the filename, just for reference
        params.append('filename', `Bukti_Transfer_Batch_${uploadingIds[0]}_${file.name}`);

        const response = await fetch(GAS_URL, {
          method: 'POST',
          body: params,
        });
        
        const result = await response.json();
        if (result.status === 'success') {
          // Update all selected orders
          for (const orderId of uploadingIds) {
            await uploadPaymentReceipt(orderId, result.url);
          }
          fetchUnpaidOrders(); // Refresh table
          setSelectedOrderIds([]); // Clear selection
          alert(`Bukti transfer berhasil diupload untuk ${uploadingIds.length} pesanan!`);
        } else {
          alert('Gagal upload: ' + result.message);
        }
      } catch (err) {
        console.error(err);
        alert('Terjadi kesalahan koneksi saat mengupload bukti transfer.');
      } finally {
        setUploadingIds([]);
        setIsUploading(false);
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

  const totalSelectedAmount = unpaidOrders
    .filter(o => selectedOrderIds.includes(o.id))
    .reduce((sum, o) => sum + (Number(o.total_price_student) || 0), 0);

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
          Pilih satu atau lebih pesanan di bawah ini, lalu klik "Upload Bukti Transfer". Anda dapat mengupload 1 bukti transfer gabungan untuk beberapa pesanan sekaligus.
        </p>
      </div>

      <div className="order-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3>Daftar Tagihan Belum Lunas</h3>
          {selectedOrderIds.length > 0 && (
            <div style={{ marginTop: '8px', fontSize: '0.9rem', color: '#0f172a' }}>
              Terpilih <strong>{selectedOrderIds.length}</strong> pesanan (Total: <strong>{formatRupiah(totalSelectedAmount)}</strong>)
            </div>
          )}
        </div>
        
        <input 
          type="file" 
          ref={fileInputRef} 
          onChange={handleFileChange} 
          accept="image/*,application/pdf" 
          style={{ display: 'none' }} 
        />
        <button 
          className="btn-ship" 
          onClick={handleUploadClick}
          disabled={isUploading || unpaidOrders.length === 0}
          style={{ 
            background: isUploading ? '#94a3b8' : '#3b82f6', 
            padding: '10px 20px', 
            fontSize: '0.95rem',
            cursor: isUploading ? 'wait' : 'pointer'
          }}
        >
          {isUploading ? 'Mengupload...' : '📤 Upload Bukti Transfer'}
        </button>
      </div>

      {loading ? (
        <p style={{ padding: '20px', textAlign: 'center', color: '#64748b' }}>Memuat tagihan...</p>
      ) : unpaidOrders.length > 0 ? (
        <>
          <div className="order-table-container desktop-table-view">
            <table className="order-table">
              <thead>
                <tr>
                  <th style={{ width: '40px', textAlign: 'center' }}>
                    <input 
                      type="checkbox" 
                      checked={unpaidOrders.length > 0 && selectedOrderIds.length === unpaidOrders.length}
                      onChange={handleSelectAll}
                      style={{ cursor: 'pointer' }}
                    />
                  </th>
                  <th>ID Pesanan</th>
                  <th>Tanggal Pesan</th>
                  <th>Status Pesanan</th>
                  <th>Total Tagihan Siswa</th>
                  <th>Status Pembayaran</th>
                </tr>
              </thead>
              <tbody>
                {unpaidOrders.map((order: any) => {
                  const isChecked = selectedOrderIds.includes(order.id);
                  const isWaitingVerification = order.paid_notes && order.paid_notes.includes('[BUKTI_TRANSFER]');
                  
                  return (
                    <tr key={order.id} style={{ background: isChecked ? '#eff6ff' : 'transparent' }}>
                      <td style={{ textAlign: 'center' }}>
                        <input 
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => handleSelectOne(order.id, e.target.checked)}
                          style={{ cursor: 'pointer' }}
                          disabled={isWaitingVerification} // prevent re-upload if already waiting
                        />
                      </td>
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
                        {isWaitingVerification ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <span style={{ fontSize: '0.8rem', color: '#047857', fontWeight: 600 }}>✅ Sedang diverifikasi Koperasi</span>
                            <a href={order.paid_notes.replace('[BUKTI_TRANSFER] ', '')} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.8rem', color: '#3b82f6' }}>Lihat Bukti Upload</a>
                          </div>
                        ) : (
                          <span className="badge-pay-unpaid">🔴 Menunggu Pelunasan</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          
          {totalCount > itemsPerPage && (
            <div className="pagination" style={{ marginTop: '20px', display: 'flex', justifyContent: 'center', gap: '10px' }}>
              <button 
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid #cbd5e1', background: currentPage === 1 ? '#f1f5f9' : '#fff', cursor: currentPage === 1 ? 'not-allowed' : 'pointer' }}
              >
                ← Sebelumnya
              </button>
              <span style={{ fontSize: '0.9rem', color: '#64748b', display: 'flex', alignItems: 'center' }}>
                Halaman {currentPage} dari {Math.ceil(totalCount / itemsPerPage)}
              </span>
              <button 
                disabled={currentPage >= Math.ceil(totalCount / itemsPerPage)}
                onClick={() => setCurrentPage(prev => Math.min(Math.ceil(totalCount / itemsPerPage), prev + 1))}
                style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid #cbd5e1', background: currentPage >= Math.ceil(totalCount / itemsPerPage) ? '#f1f5f9' : '#fff', cursor: currentPage >= Math.ceil(totalCount / itemsPerPage) ? 'not-allowed' : 'pointer' }}
              >
                Selanjutnya →
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="order-empty">
          <p>Semua tagihan Anda sudah lunas atau belum ada tagihan aktif.</p>
        </div>
      )}
    </div>
  );
};

export default SchoolPayment;
