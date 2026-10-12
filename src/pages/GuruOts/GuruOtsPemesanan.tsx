import { useState, useEffect, useMemo, type FormEvent } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useOrders } from '../../context/OrderContext';
import { useProducts } from '../../context/ProductContext';
import { supabase } from '../../lib/supabase';
import type { Order, OrderItem, SchoolLevel } from '../../types';
import KwitansiPrint from '../Kopkar/KwitansiPrint';
import './guruOts.css';

const formatRupiah = (angka: number) => {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(angka);
};

const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const LEVEL_LIST: (SchoolLevel | 'SEMUA')[] = [
  'SEMUA',
  'TK',
  'SD',
  'SMP',
  'SMA',
  'SPK-SD',
  'SPK-SMP',
  'SPK-SMA',
];

const GuruOtsPemesanan = () => {
  const { user } = useAuth();
  const { createOrder } = useOrders();
  const { products } = useProducts();

  // Filters & State
  const [selectedLevel, setSelectedLevel] = useState<SchoolLevel | 'SEMUA'>('SEMUA');
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'seragam' | 'buku'>('all');

  // Selected item variant selection state (maps product name to selected variant id)
  const [selectedVariantByGroup, setSelectedVariantByGroup] = useState<Record<string, string>>({});
  const [selectedQtyByGroup, setSelectedQtyByGroup] = useState<Record<string, number>>({});

  // Local Cart for OTS
  const [otsCart, setOtsCart] = useState<OrderItem[]>([]);
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  // Kwitansi Print state
  const [printingOrder, setPrintingOrder] = useState<Order | null>(null);
  const [successOrder, setSuccessOrder] = useState<Order | null>(null);

  // History Orders
  const [historyOrders, setHistoryOrders] = useState<Order[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => {
    if (printingOrder) {
      const timer = setTimeout(() => {
        window.print();
        setPrintingOrder(null);
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [printingOrder]);

  const fetchHistory = async () => {
    if (!user?.id) return;
    setLoadingHistory(true);
    const { data, error } = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .eq('school_user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(30);

    if (!error && data) {
      setHistoryOrders(
        data.map((row: any) => ({
          id: row.id,
          schoolUserId: row.school_user_id,
          schoolName: row.school_name,
          schoolLevel: row.school_level,
          orderPhase: row.order_phase,
          items: (row.order_items || []).map((it: any) => ({
            id: it.id,
            productId: it.product_id,
            code: it.code,
            name: it.name,
            type: it.type,
            size: it.size,
            gender: it.gender,
            quantity: it.quantity,
            priceKopkar: Number(it.price_kopkar),
            feeSchool: Number(it.fee_school),
            priceStudent: Number(it.price_student),
          })),
          totalPriceKopkar: Number(row.total_price_kopkar),
          totalFeeSchool: Number(row.total_fee_school),
          totalPriceStudent: Number(row.total_price_student),
          status: row.status,
          paymentStatus: row.payment_status,
          feeStatus: row.fee_status,
          notes: row.notes || '',
          createdAt: row.created_at,
        }))
      );
    }
    setLoadingHistory(false);
  };

  useEffect(() => {
    fetchHistory();
  }, [user?.id]);

  // Group products by product name
  const groupedProducts = useMemo(() => {
    let filtered = products;

    if (selectedLevel !== 'SEMUA') {
      filtered = filtered.filter((p) => p.level === selectedLevel || p.level === 'SEMUA');
    }

    if (categoryFilter !== 'all') {
      filtered = filtered.filter((p) => p.category === categoryFilter);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.code && p.code.toLowerCase().includes(q)) ||
          (p.size && p.size.toLowerCase().includes(q))
      );
    }

    // Grouping
    const groups: Record<
      string,
      {
        name: string;
        category: 'seragam' | 'buku';
        level: SchoolLevel;
        variants: typeof products;
      }
    > = {};

    filtered.forEach((p) => {
      if (!groups[p.name]) {
        groups[p.name] = {
          name: p.name,
          category: p.category,
          level: p.level,
          variants: [],
        };
      }
      groups[p.name].variants.push(p);
    });

    return Object.values(groups);
  }, [products, selectedLevel, categoryFilter, searchQuery]);

  // Handle add item to OTS Cart
  const handleAddToCart = (groupName: string) => {
    setFormError('');
    const group = groupedProducts.find((g) => g.name === groupName);
    if (!group) return;

    const chosenVariantId = selectedVariantByGroup[groupName] || group.variants[0]?.id;
    const variant = group.variants.find((v) => v.id === chosenVariantId);

    if (!variant) {
      setFormError(`Silakan pilih ukuran untuk ${groupName}`);
      return;
    }

    const qty = selectedQtyByGroup[groupName] || 1;
    if (qty <= 0) return;

    setOtsCart((prev) => {
      const existingIdx = prev.findIndex(
        (it) => it.productId === variant.id && it.name === variant.name
      );

      if (existingIdx !== -1) {
        const next = [...prev];
        next[existingIdx] = {
          ...next[existingIdx],
          quantity: next[existingIdx].quantity + qty,
        };
        return next;
      }

      return [
        ...prev,
        {
          productId: variant.id,
          code: variant.code,
          name: variant.name,
          type: variant.category,
          size: variant.size || '-',
          quantity: qty,
          priceKopkar: variant.priceKopkar,
          feeSchool: variant.feeSchool,
          priceStudent: variant.priceStudent || variant.priceKopkar + variant.feeSchool,
        },
      ];
    });

    // Reset qty for this group
    setSelectedQtyByGroup((prev) => ({ ...prev, [groupName]: 1 }));
  };

  const handleUpdateCartQty = (idx: number, delta: number) => {
    setOtsCart((prev) => {
      const next = [...prev];
      const newQty = next[idx].quantity + delta;
      if (newQty <= 0) {
        return next.filter((_, i) => i !== idx);
      }
      next[idx] = { ...next[idx], quantity: newQty };
      return next;
    });
  };

  const handleRemoveCartItem = (idx: number) => {
    setOtsCart((prev) => prev.filter((_, i) => i !== idx));
  };

  // Cart total
  const cartTotalStudent = useMemo(() => {
    return otsCart.reduce((acc, it) => acc + (it.priceStudent || 0) * it.quantity, 0);
  }, [otsCart]);

  const cartTotalQty = useMemo(() => {
    return otsCart.reduce((acc, it) => acc + it.quantity, 0);
  }, [otsCart]);

  // Submit Order
  const handleCheckout = async (e: FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (otsCart.length === 0) {
      setFormError('Keranjang masih kosong. Pilih barang terlebih dahulu.');
      return;
    }

    if (!user) return;

    setIsSubmitting(true);

    try {
      // Order created directly with status 'received' (Barang langsung diambil di tempat)
      const result = await createOrder(
        {
          schoolUserId: user.id,
          schoolName: user.schoolName || user.name || 'Guru on the Spot',
          schoolLevel: selectedLevel === 'SEMUA' ? (user.schoolLevel || 'SEMUA') : selectedLevel,
          orderPhase: 'On The Spot',
          items: otsCart,
          notes: notes.trim(),
        },
        'received'
      );

      if (result.success && result.newOrderId) {
        const orderDataForPrint: Order = {
          id: result.newOrderId,
          schoolUserId: user.id,
          schoolName: user.schoolName || user.name || 'Guru on the Spot',
          schoolLevel: selectedLevel === 'SEMUA' ? (user.schoolLevel || 'SEMUA') : selectedLevel,
          orderPhase: 'On The Spot',
          items: [...otsCart],
          status: 'received',
          notes: notes.trim(),
          totalPriceKopkar: otsCart.reduce((acc, it) => acc + (it.priceKopkar || 0) * it.quantity, 0),
          totalFeeSchool: otsCart.reduce((acc, it) => acc + (it.feeSchool || 0) * it.quantity, 0),
          totalPriceStudent: cartTotalStudent,
          paymentStatus: 'unpaid',
          feeStatus: 'locked',
          createdAt: new Date().toISOString(),
        };

        setSuccessOrder(orderDataForPrint);
        setOtsCart([]);
        setNotes('');
        await fetchHistory();
      } else {
        setFormError(result.error || 'Gagal menyimpan pesanan');
      }
    } catch (err: any) {
      setFormError(err.message || 'Terjadi kesalahan sistem');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="ots-container">
      {/* Header */}
      <div className="ots-header">
        <div className="ots-title-area">
          <h2>
            <span>🛒</span> Pemesanan On The Spot (Langsung di Koperasi)
          </h2>
          <p className="ots-subtitle">
            Catat pesanan barang yang langsung diambil di tempat dan cetak kwitansi pembayaran resmi.
          </p>
        </div>
        <div>
          <span className="ots-badge-role">
            📍 Guru on the Spot • {user?.name || 'Kasir Koperasi'}
          </span>
        </div>
      </div>

      {/* Level Selection Tabs */}
      <div className="ots-level-nav">
        {LEVEL_LIST.map((lvl) => (
          <button
            key={lvl}
            type="button"
            className={`ots-level-btn ${selectedLevel === lvl ? 'active' : ''}`}
            onClick={() => setSelectedLevel(lvl)}
          >
            {lvl === 'SEMUA' ? '🌐 Semua Jenjang' : `Jenjang ${lvl}`}
          </button>
        ))}
      </div>

      {/* Main Grid: Catalog (Left) + Cart (Right) */}
      <div className="ots-grid-layout">
        {/* Left: Product Catalog */}
        <div className="ots-catalog-card">
          <div className="ots-search-bar">
            <input
              type="text"
              placeholder="🔍 Cari nama barang / kode..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="ots-search-input"
            />
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value as any)}
              className="ots-category-filter"
            >
              <option value="all">Semua Kategori</option>
              <option value="seragam">👕 Seragam</option>
              <option value="buku">📚 Buku</option>
            </select>
          </div>

          {formError && (
            <div style={{ background: '#fee2e2', color: '#b91c1c', padding: '10px 14px', borderRadius: '8px', marginBottom: '14px', fontSize: '0.88rem' }}>
              ⚠️ {formError}
            </div>
          )}

          {groupedProducts.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: '#64748b' }}>
              Tidak ada produk yang cocok dengan pencarian atau jenjang ini.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="ots-product-table">
                <thead>
                  <tr>
                    <th style={{ width: '40%' }}>Nama Barang</th>
                    <th style={{ width: '15%' }}>Kategori</th>
                    <th style={{ width: '25%' }}>Pilih Ukuran / Varian</th>
                    <th style={{ width: '20%', textAlign: 'right' }}>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {groupedProducts.map((grp) => {
                    const selectedVarId = selectedVariantByGroup[grp.name] || grp.variants[0]?.id;
                    const selectedVar = grp.variants.find((v) => v.id === selectedVarId) || grp.variants[0];
                    const currentQty = selectedQtyByGroup[grp.name] || 1;
                    const priceDisplay = selectedVar ? (selectedVar.priceStudent || selectedVar.priceKopkar + selectedVar.feeSchool) : 0;

                    return (
                      <tr key={grp.name}>
                        <td>
                          <div style={{ fontWeight: 700, color: '#1e293b' }}>{grp.name}</div>
                          <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '2px' }}>
                            Jenjang: <span style={{ fontWeight: 600 }}>{grp.level}</span>
                          </div>
                        </td>
                        <td>
                          <span
                            style={{
                              padding: '2px 8px',
                              borderRadius: '4px',
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              background: grp.category === 'seragam' ? '#e0f2fe' : '#fef3c7',
                              color: grp.category === 'seragam' ? '#0369a1' : '#b45309',
                            }}
                          >
                            {grp.category.toUpperCase()}
                          </span>
                        </td>
                        <td>
                          <div className="ots-variant-pills">
                            {grp.variants.map((v) => (
                              <button
                                key={v.id}
                                type="button"
                                className={`ots-variant-btn ${selectedVarId === v.id ? 'selected' : ''}`}
                                onClick={() => setSelectedVariantByGroup((prev) => ({ ...prev, [grp.name]: v.id }))}
                              >
                                {v.size || 'All Size'}
                              </button>
                            ))}
                          </div>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ fontWeight: 800, color: '#0f172a', marginBottom: '6px' }}>
                            {formatRupiah(priceDisplay)}
                          </div>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                            <input
                              type="number"
                              min={1}
                              value={currentQty}
                              onChange={(e) => {
                                const val = Math.max(1, parseInt(e.target.value) || 1);
                                setSelectedQtyByGroup((prev) => ({ ...prev, [grp.name]: val }));
                              }}
                              style={{ width: '48px', padding: '4px', borderRadius: '6px', border: '1px solid #cbd5e1', textAlign: 'center', fontSize: '0.85rem' }}
                            />
                            <button
                              type="button"
                              onClick={() => handleAddToCart(grp.name)}
                              style={{
                                background: '#7e22ce',
                                color: '#ffffff',
                                border: 'none',
                                borderRadius: '6px',
                                padding: '6px 12px',
                                fontWeight: 700,
                                fontSize: '0.82rem',
                                cursor: 'pointer',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              + Tambah
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Right: Cart Card (Ringkasan Kasir) */}
        <div className="ots-cart-card">
          <div className="ots-cart-header">
            <h3>🛒 Keranjang Langsung</h3>
            <span className="ots-cart-badge">{cartTotalQty} Item</span>
          </div>

          {otsCart.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '30px 10px', color: '#94a3b8' }}>
              <div style={{ fontSize: '2rem', marginBottom: '8px' }}>🛒</div>
              Keranjang masih kosong.<br />Pilih barang dari katalog di sebelah kiri.
            </div>
          ) : (
            <>
              <div className="ots-cart-items-list">
                {otsCart.map((item, idx) => (
                  <div key={idx} className="ots-cart-item">
                    <div className="ots-item-info">
                      <div className="ots-item-name">{item.name}</div>
                      <div className="ots-item-sub">
                        Ukuran: <strong style={{ color: '#7e22ce' }}>{item.size || '-'}</strong> • @{formatRupiah(item.priceStudent || 0)}
                      </div>
                    </div>
                    <div className="ots-qty-controls">
                      <button type="button" className="ots-qty-btn" onClick={() => handleUpdateCartQty(idx, -1)}>-</button>
                      <span className="ots-qty-val">{item.quantity}</span>
                      <button type="button" className="ots-qty-btn" onClick={() => handleUpdateCartQty(idx, 1)}>+</button>
                    </div>
                    <div className="ots-item-price">
                      {formatRupiah((item.priceStudent || 0) * item.quantity)}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveCartItem(idx)}
                      style={{ border: 'none', background: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '1rem', padding: '0 4px' }}
                      title="Hapus item"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                  Catatan Pembeli / Keterangan (Opsional):
                </label>
                <input
                  type="text"
                  placeholder="Contoh: Bpk. Budi (SMPK 1) / No HP"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                />
              </div>

              <div className="ots-cart-summary">
                <div className="ots-summary-row">
                  <span>Total Kuantitas:</span>
                  <strong>{cartTotalQty} pcs</strong>
                </div>
                <div className="ots-summary-total">
                  <span>Total Bayar:</span>
                  <span style={{ color: '#059669' }}>{formatRupiah(cartTotalStudent)}</span>
                </div>
              </div>

              <button
                type="button"
                className="ots-btn-submit"
                onClick={handleCheckout}
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Menyimpan...' : '💾 Simpan Pesanan & Buat Kwitansi'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Bottom Section: Riwayat Pesanan On The Spot */}
      <div className="ots-history-section">
        <div className="ots-history-header">
          <h3>📋 Riwayat Pesanan On The Spot</h3>
          <button
            type="button"
            onClick={fetchHistory}
            style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '0.82rem' }}
          >
            🔄 Refresh Riwayat
          </button>
        </div>

        {loadingHistory ? (
          <p style={{ color: '#64748b' }}>Memuat riwayat pesanan...</p>
        ) : historyOrders.length === 0 ? (
          <p style={{ color: '#94a3b8', textAlign: 'center', padding: '24px 0' }}>
            Belum ada pesanan yang dibuat oleh akun ini.
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="ots-product-table">
              <thead>
                <tr>
                  <th>No. Pesanan & Tanggal</th>
                  <th>Rincian Barang</th>
                  <th>Total Tagihan</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Aksi Cetak</th>
                </tr>
              </thead>
              <tbody>
                {historyOrders.map((ord) => (
                  <tr key={ord.id}>
                    <td>
                      <div style={{ fontWeight: 800, color: '#1e293b' }}>{ord.id}</div>
                      <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '2px' }}>
                        {formatDate(ord.createdAt)}
                      </div>
                    </td>
                    <td>
                      <div style={{ fontSize: '0.85rem' }}>
                        {ord.items.map((it, i) => (
                          <div key={i}>
                            • {it.name} [{it.size || '-'}] ({it.quantity} pcs)
                          </div>
                        ))}
                      </div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 800, color: '#059669' }}>
                        {formatRupiah(ord.totalPriceStudent)}
                      </div>
                    </td>
                    <td>
                      <span
                        style={{
                          background: '#dcfce7',
                          color: '#15803d',
                          padding: '3px 8px',
                          borderRadius: '4px',
                          fontWeight: 700,
                          fontSize: '0.75rem',
                        }}
                      >
                        ✅ Selesai Diterima
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        type="button"
                        className="ots-btn-kwitansi"
                        onClick={() => setPrintingOrder(ord)}
                        title="Cetak Kwitansi Pembayaran"
                      >
                        🧾 Cetak Kwitansi
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Sukses Order & Cetak Kwitansi Langsung */}
      {successOrder && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '16px',
          }}
          onClick={() => setSuccessOrder(null)}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '16px',
              padding: '24px',
              maxWidth: '460px',
              width: '100%',
              textAlign: 'center',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: '3rem', marginBottom: '8px' }}>🎉</div>
            <h3 style={{ margin: '0 0 6px 0', fontSize: '1.25rem', color: '#0f172a' }}>
              Pesanan On The Spot Berhasil!
            </h3>
            <p style={{ color: '#64748b', fontSize: '0.88rem', margin: '0 0 16px 0' }}>
              Pesanan telah tercatat dengan status <strong>Diterima / Selesai</strong>.
            </p>

            <div
              style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '10px',
                padding: '12px 16px',
                textAlign: 'left',
                marginBottom: '20px',
                fontSize: '0.9rem',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ color: '#64748b' }}>No. Pesanan:</span>
                <strong>{successOrder.id}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ color: '#64748b' }}>Jumlah Item:</span>
                <strong>{successOrder.items.reduce((acc, it) => acc + it.quantity, 0)} pcs</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #e2e8f0', paddingTop: '6px' }}>
                <span style={{ color: '#64748b' }}>Total Tagihan:</span>
                <strong style={{ color: '#059669', fontSize: '1.1rem' }}>
                  {formatRupiah(successOrder.totalPriceStudent)}
                </strong>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
              <button
                type="button"
                onClick={() => setPrintingOrder(successOrder)}
                style={{
                  background: '#0284c7',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '10px 20px',
                  fontWeight: 700,
                  fontSize: '0.9rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                🖨️ Cetak Kwitansi Sekarang
              </button>
              <button
                type="button"
                onClick={() => setSuccessOrder(null)}
                style={{
                  background: '#f1f5f9',
                  color: '#475569',
                  border: '1px solid #cbd5e1',
                  borderRadius: '8px',
                  padding: '10px 18px',
                  fontWeight: 600,
                  fontSize: '0.9rem',
                  cursor: 'pointer',
                }}
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Kwitansi Print Hidden Component */}
      <KwitansiPrint order={printingOrder} />
    </div>
  );
};

export default GuruOtsPemesanan;
