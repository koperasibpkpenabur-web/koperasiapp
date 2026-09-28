import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useProducts } from '../../context/ProductContext';
import type { VendorPayable, ProductItem } from '../../types';

const VendorManagement = () => {
  const { products, setProductStock } = useProducts();
  const [payables, setPayables] = useState<VendorPayable[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal Input Stock Vendor
  const [showAddStockModal, setShowAddStockModal] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [addQty, setAddQty] = useState(0);

  useEffect(() => {
    fetchPayables();
  }, []);

  const fetchPayables = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('vendor_payables')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data) {
      setPayables(data.map(d => ({
        id: d.id,
        vendorName: d.vendor_name,
        orderId: d.order_id,
        schoolName: d.school_name,
        totalAmount: d.total_amount,
        status: d.status,
        createdAt: d.created_at,
        paidAt: d.paid_at
      })));
    }
    setLoading(false);
  };

  const handleMarkAsPaid = async (id: string) => {
    if (!window.confirm('Tandai tagihan ini sudah dibayar/ditransfer ke vendor?')) return;
    
    await supabase.from('vendor_payables').update({
      status: 'paid',
      paid_at: new Date().toISOString()
    }).eq('id', id);
    
    fetchPayables();
  };

  const handleAddVendorStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProductId || addQty <= 0) return;
    const p = products.find(prod => prod.id === selectedProductId);
    if (!p) return;
    
    const newStockVendor = (p.stockVendor || 0) + addQty;
    await setProductStock(p.id, p.stock || 0, newStockVendor);
    
    setShowAddStockModal(false);
    setSelectedProductId('');
    setAddQty(0);
    alert(`Berhasil menambahkan ${addQty} pcs ke Stock Vendor untuk barang ${p.name}`);
  };

  const pendingPayables = payables.filter(p => p.status === 'pending');
  const paidPayables = payables.filter(p => p.status === 'paid');

  const formatRupiah = (num: number) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(num);
  };

  const formatDate = (isoString: string) => {
    if (!isoString) return '-';
    const date = new Date(isoString);
    return date.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
  };

  return (
    <div className="kopkar-container">
      <div className="kopkar-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2 className="kopkar-title">Manajemen Vendor</h2>
          <p className="kopkar-subtitle">Kelola tagihan hutang ke vendor dan terima stok barang dari vendor.</p>
        </div>
        <div>
          <button 
            onClick={() => setShowAddStockModal(true)}
            style={{ padding: '10px 16px', background: '#0f172a', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            🏭 + Input Barang Masuk (Vendor)
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px', marginBottom: '24px' }}>
        <div style={{ background: '#fff', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
          <div style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total Hutang Pending</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#e11d48', marginTop: '8px' }}>
            {formatRupiah(pendingPayables.reduce((acc, curr) => acc + curr.totalAmount, 0))}
          </div>
          <div style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '4px' }}>Dari {pendingPayables.length} tagihan</div>
        </div>

        <div style={{ background: '#fff', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
          <div style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total Sudah Dibayar</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#10b981', marginTop: '8px' }}>
            {formatRupiah(paidPayables.reduce((acc, curr) => acc + curr.totalAmount, 0))}
          </div>
          <div style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '4px' }}>Dari {paidPayables.length} tagihan</div>
        </div>
      </div>

      {loading ? (
        <p>Memuat data vendor...</p>
      ) : (
        <div className="catalog-table-container">
          <table className="catalog-table">
            <thead>
              <tr>
                <th>Nama Vendor</th>
                <th>No. Pesanan / Order ID</th>
                <th>Sekolah Penerima</th>
                <th>Tgl Diterima Sekolah</th>
                <th>Total Hutang (HPP)</th>
                <th>Status</th>
                <th style={{ textAlign: 'center' }}>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {payables.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '32px', color: '#64748b' }}>
                    Belum ada data tagihan vendor.
                  </td>
                </tr>
              ) : (
                payables.map((p) => (
                  <tr key={p.id}>
                    <td><strong>{p.vendorName}</strong></td>
                    <td><span className="order-id-badge">{p.orderId}</span></td>
                    <td>{p.schoolName}</td>
                    <td>{formatDate(p.createdAt)}</td>
                    <td style={{ fontWeight: 700, color: '#334155' }}>{formatRupiah(p.totalAmount)}</td>
                    <td>
                      {p.status === 'paid' ? (
                        <span style={{ background: '#d1fae5', color: '#059669', padding: '4px 8px', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 600 }}>
                          LUNAS
                        </span>
                      ) : (
                        <span style={{ background: '#fee2e2', color: '#b91c1c', padding: '4px 8px', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 600 }}>
                          BELUM DIBAYAR
                        </span>
                      )}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {p.status === 'pending' ? (
                        <button 
                          style={{ background: '#2563eb', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '6px', fontSize: '0.8rem', cursor: 'pointer', fontWeight: 600 }}
                          onClick={() => handleMarkAsPaid(p.id)}
                        >
                          Bayar Vendor
                        </button>
                      ) : (
                        <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                          Dibayar pd {formatDate(p.paidAt!)}
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal Tambah Stock Vendor */}
      {showAddStockModal && (
        <div className="modal-overlay" onClick={() => setShowAddStockModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>Input Barang Masuk dari Vendor</h3>
            <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '16px' }}>
              Tambahkan stok barang yang dikelola/disimpan di gudang vendor.
            </p>
            <form onSubmit={handleAddVendorStock}>
              <div className="form-group">
                <label>Pilih Barang (Hanya yang memiliki Supplier)</label>
                <select 
                  value={selectedProductId} 
                  onChange={e => setSelectedProductId(e.target.value)}
                  required
                >
                  <option value="">-- Pilih Barang --</option>
                  {products
                    .filter(p => p.supplierName)
                    .map(p => (
                    <option key={p.id} value={p.id}>
                      [{p.supplierName}] {p.name} (Stok Vendor saat ini: {p.stockVendor || 0})
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Jumlah Barang Masuk (Pcs)</label>
                <input 
                  type="number" 
                  min="1" 
                  value={addQty || ''}
                  onChange={e => setAddQty(Number(e.target.value))}
                  required 
                />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setShowAddStockModal(false)}>Batal</button>
                <button type="submit" className="btn-primary" style={{ background: '#0f172a' }}>Simpan Stock Vendor</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default VendorManagement;
