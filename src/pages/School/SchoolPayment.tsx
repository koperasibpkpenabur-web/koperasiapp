import { useAuth } from '../../context/AuthContext';
import { useOrders } from '../../context/OrderContext';
import './school.css';

const SchoolPayment = () => {
  const { user } = useAuth();
  const { getOrdersBySchoolId } = useOrders();

  const allSchoolOrders = user ? getOrdersBySchoolId(user.id) : [];
  
  // Ambil order yang belum lunas (unpaid), dan tidak dalam status batal/ditolak
  const unpaidOrders = allSchoolOrders.filter(
    (o) => o.paymentStatus === 'unpaid' && 
    o.status !== 'cancelled' && 
    o.status !== 'rejected' && 
    o.status !== 'cancellation_requested'
  );

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
          <strong>Bank BNI: 123-456-7890 a.n. Koperasi Synera</strong>
        </p>
        <p style={{ margin: 0, fontSize: '0.9rem', color: '#475569', lineHeight: 1.5 }}>
          Setelah melakukan transfer, silakan konfirmasi ke pihak Koperasi melalui WhatsApp atau bawa bukti bayar ke kantor Koperasi agar status pesanan dapat diubah menjadi <strong>Lunas</strong>.
        </p>
      </div>

      <div className="order-toolbar">
        <h3>Daftar Tagihan Belum Lunas</h3>
      </div>

      {unpaidOrders.length > 0 ? (
        <div className="order-table-container desktop-table-view">
          <table className="order-table">
            <thead>
              <tr>
                <th>ID Pesanan</th>
                <th>Tanggal Pesan</th>
                <th>Status Pesanan</th>
                <th>Total Tagihan Siswa</th>
                <th>Keterangan</th>
              </tr>
            </thead>
            <tbody>
              {unpaidOrders.map((order) => (
                <tr key={order.id}>
                  <td><strong>{order.id}</strong></td>
                  <td>{formatDate(order.createdAt)}</td>
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
                      {formatRupiah(order.totalPriceStudent)}
                    </strong>
                  </td>
                  <td>
                    <span className="badge-pay-unpaid">🔴 Menunggu Pelunasan</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="order-empty">
          <div style={{ fontSize: '2rem', marginBottom: '10px' }}>🎉</div>
          <p><strong>Tidak ada tagihan yang belum lunas.</strong></p>
          <p style={{ color: '#64748b' }}>Terima kasih atas kerja sama Anda yang baik dengan Koperasi.</p>
        </div>
      )}

      {/* Mobile View */}
      <div className="mobile-cards-view">
        {unpaidOrders.map((order) => (
          <div className="mobile-order-card" key={order.id}>
            <div className="mobile-card-header">
              <div>
                <span className="mobile-order-id">{order.id}</span>
                <div className="mobile-card-date">{formatDate(order.createdAt)}</div>
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
                <strong style={{ fontSize: '1.1rem' }}>{formatRupiah(order.totalPriceStudent)}</strong>
              </div>
            </div>

            <div style={{ marginTop: '12px' }}>
              <span className="badge-pay-unpaid" style={{ display: 'block', textAlign: 'center' }}>
                🔴 Menunggu Pelunasan
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default SchoolPayment;
