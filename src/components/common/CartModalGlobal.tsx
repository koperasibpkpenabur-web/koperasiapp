import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useOrders } from '../../context/OrderContext';

const formatRupiah = (angka: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(angka);

/**
 * CartModalGlobal — modal keranjang yang dirender di MainLayout agar selalu
 * bisa dibuka dari mana saja (tidak hanya dari halaman SchoolPemesanan).
 * Modal ini bersifat viewer; tombol "Lanjutkan Pemesanan" akan navigasi ke
 * /school/pemesanan tempat logika submit sesungguhnya berada.
 */
const CartModalGlobal = () => {
  const { user } = useAuth();
  const { cartItems, setCartItems, showCartModal, setShowCartModal } = useOrders();
  const navigate = useNavigate();

  // Hanya tampil untuk role sekolah / guru_ots
  if (!showCartModal) return null;
  if (!user || (user.role !== 'sekolah' && user.role !== 'guru_ots')) return null;

  const totalStudent = cartItems.reduce((acc, it) => acc + (it.priceStudent * it.quantity), 0);
  const totalFee     = cartItems.reduce((acc, it) => acc + (it.feeSchool   * it.quantity), 0);
  const totalKopkar  = cartItems.reduce((acc, it) => acc + (it.priceKopkar  * it.quantity), 0);

  const handleUpdateQty = (index: number, newQty: number) => {
    if (newQty < 1) return;
    const updated = [...cartItems];
    updated[index].quantity = newQty;
    setCartItems(updated);
  };

  const handleRemove = (index: number) => {
    const updated = [...cartItems];
    updated.splice(index, 1);
    setCartItems(updated);
  };

  const handleGoToPemesanan = () => {
    setShowCartModal(false);
    navigate('/school/pemesanan');
  };

  return (
    <div
      className="modal-overlay"
      onClick={() => setShowCartModal(false)}
      style={{ zIndex: 2000 }}
    >
      <div
        className="modal order-modal-wide"
        onClick={(e) => e.stopPropagation()}
        style={{ maxHeight: '90vh', overflowY: 'auto' }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h3 style={{ margin: 0 }}>Keranjang Pesanan 🛒</h3>
          <button className="btn-close-modal" onClick={() => setShowCartModal(false)}>✖</button>
        </div>

        {/* Isi keranjang */}
        <div className="verification-item-box" style={{ marginBottom: '16px' }}>
          <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '8px', color: '#334155' }}>
            Ringkasan Keranjang Pesanan:
          </div>
          {cartItems.length === 0 ? (
            <div style={{ color: '#dc2626', fontSize: '0.9rem' }}>
              Keranjang masih kosong. Silakan tambahkan barang di menu Pemesanan Barang.
            </div>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {cartItems.map((it, idx) => (
                <li
                  key={idx}
                  style={{
                    padding: '8px 0',
                    borderBottom: '1px dashed #e2e8f0',
                    fontSize: '0.88rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <span className={`item-type ${it.type}`} style={{ marginRight: '8px' }}>{it.type}</span>
                    <strong>{it.name}</strong>
                    {it.size && <span style={{ marginLeft: '6px', color: '#2563eb', fontWeight: 600 }}>[{it.size}]</span>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button
                      type="button"
                      onClick={() => handleUpdateQty(idx, it.quantity - 1)}
                      disabled={it.quantity <= 1}
                      style={{ padding: '2px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', background: '#f8fafc', cursor: it.quantity <= 1 ? 'not-allowed' : 'pointer' }}
                    >-</button>
                    <span style={{ minWidth: '32px', textAlign: 'center' }}>{it.quantity}</span>
                    <button
                      type="button"
                      onClick={() => handleUpdateQty(idx, it.quantity + 1)}
                      style={{ padding: '2px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', background: '#f8fafc', cursor: 'pointer' }}
                    >+</button>
                    <button
                      type="button"
                      onClick={() => handleRemove(idx)}
                      style={{ padding: '2px 8px', borderRadius: '4px', border: 'none', background: '#fee2e2', color: '#ef4444', cursor: 'pointer', marginLeft: '4px' }}
                      title="Hapus Item"
                    >✖</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Ringkasan biaya */}
        {cartItems.length > 0 && (
          <div className="order-live-summary-card" style={{ marginBottom: '16px' }}>
            <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#1e293b', marginBottom: '8px' }}>
              Ringkasan Estimasi Biaya & Fee:
            </div>
            <div className="live-summary-grid">
              <div className="summary-item">
                <span className="sum-label">Total Tagihan Siswa (Wajib Dilunasi):</span>
                <span className="sum-value primary">{formatRupiah(totalStudent)}</span>
              </div>
              <div className="summary-item">
                <span className="sum-label">Estimasi Fee Hak Sekolah (Dikembalikan Setelah Lunas):</span>
                <span className="sum-value success">+{formatRupiah(totalFee)}</span>
              </div>
              <div className="summary-item">
                <span className="sum-label">Total Biaya Pengadaan Koperasi (HPP):</span>
                <span className="sum-value secondary">{formatRupiah(totalKopkar)}</span>
              </div>
            </div>
          </div>
        )}

        {/* Info jika tidak di halaman pemesanan */}
        <div
          style={{
            padding: '10px 14px',
            background: '#eff6ff',
            border: '1px solid #bfdbfe',
            borderRadius: '8px',
            fontSize: '0.83rem',
            color: '#1d4ed8',
            marginBottom: '16px',
          }}
        >
          ℹ️ Untuk mengirimkan pesanan, silakan buka halaman <strong>Pemesanan Barang</strong>.
        </div>

        {/* Tombol aksi */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setShowCartModal(false)}
          >
            Tutup
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={handleGoToPemesanan}
          >
            🚀 Lanjutkan Pemesanan
          </button>
        </div>
      </div>
    </div>
  );
};

export default CartModalGlobal;
