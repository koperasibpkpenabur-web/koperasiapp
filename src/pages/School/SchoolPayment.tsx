import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import './school.css';

const SchoolPayment = () => {
  const { user } = useAuth();

  const [unpaidOrders, setUnpaidOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);
  const [totalCount, setTotalCount] = useState(0);

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
                      {order.status === 'received' ? (
                        <button className="btn-ship" style={{ padding: '6px 12px', fontSize: '0.85rem' }}>
                          Upload Bukti
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
                  <span className="badge-pay-unpaid">
                    🔴 Menunggu Pelunasan
                  </span>
                  {order.status === 'received' && (
                    <button className="btn-ship" style={{ padding: '6px 12px', fontSize: '0.85rem' }}>
                      Upload Bukti
                    </button>
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
