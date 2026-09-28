import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useOrders } from '../../context/OrderContext';
import { useProducts } from '../../context/ProductContext';
import { useReturns } from '../../context/ReturnContext';
import { useSettings } from '../../context/SettingsContext';
import type { Order, OrderItem, SchoolLevel } from '../../types';
import './school.css';

// Urutan ukuran standar dari terkecil ke terbesar
const SIZE_ORDER = [
  'SS', 'XS', 'S', 'M', 'L',
  'XL', 'XXL', '2XL', '2L',
  '3XL', '3L', '4XL', '4L',
  '5XL', '5L', '6XL', '6L',
  '7XL', '7L', '8XL', '8L',
  '9XL', '9L', '10XL', '10L'
];

function sortBySize(variants: any[]) {
  return [...variants].sort((a, b) => {
    const aSize = (a.size || '').trim().toUpperCase();
    const bSize = (b.size || '').trim().toUpperCase();
    const ai = SIZE_ORDER.indexOf(aSize);
    const bi = SIZE_ORDER.indexOf(bSize);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;  // a (known) comes before b (unknown)
    if (bi !== -1) return 1;   // b (known) comes before a (unknown)
    // Both unknown: use numeric-aware natural sort so "10L" > "3L"
    return (a.size || '').localeCompare(b.size || '', undefined, { numeric: true });
  });
}

/** Group catalog products by name, sorted by the first variant's code (same order as Karyawan stock list) */
function groupByCatalog(catalog: any[]) {
  const acc: Record<string, { name: string; type: string; priceKopkar: number; feeSchool: number; priceStudent: number; firstCode: string; variants: any[] }> = {};
  for (const prod of catalog) {
    if (!acc[prod.name]) {
      acc[prod.name] = {
        name: prod.name,
        type: prod.category,
        priceKopkar: prod.priceKopkar,
        feeSchool: prod.feeSchool,
        priceStudent: prod.priceStudent,
        firstCode: prod.code || '',
        variants: [],
      };
    }
    acc[prod.name].variants.push(prod);
  }
  return Object.values(acc).sort((a, b) => a.firstCode.localeCompare(b.firstCode));
}

const SchoolPemesanan = () => {
  const { user } = useAuth();
  const { getOrdersBySchoolId, createOrder, receiveOrder, requestCancelOrder, deleteOrder, cartItems, setCartItems, showCartModal, setShowCartModal } = useOrders();
  const { getProductsByLevel } = useProducts();
  const { getReturnsBySchoolId } = useReturns();
  const { phase1Open, phase2Open, tambahanOpen, tambahanUseDayRule, tambahanUseDateRule, tambahanStartDate, tambahanEndDate } = useSettings();

  // 3 Tabs: 'active' (Berjalan), 'received' (History Diterima), 'cancellations' (Riwayat Pembatalan)
  const [activeTab, setActiveTab] = useState<'active' | 'received' | 'cancellations'>('active');

  // Modal Create Order
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [orderLevelFilter, setOrderLevelFilter] = useState<SchoolLevel>(
    user?.schoolLevel || 'SMP'
  );
  const [orderPhase, setOrderPhase] = useState<'Tahap 1' | 'Tambahan Tahap 1' | 'Tahap 2' | 'Tambahan Tahap 2' | 'Tambahan Mingguan'>('Tahap 1');

  // Available products for current school level
  const availableCatalog = getProductsByLevel(orderLevelFilter);

  // Group products by name for smarter forms, sorted by kode barang (same as Karyawan stock list)
  const groupedCatalogArray = groupByCatalog(availableCatalog);
  // Lookup map by name for fast access
  const groupedCatalog = Object.fromEntries(groupedCatalogArray.map(g => [g.name, g]));


  // Selected items in order form
  const [selectedItems, setSelectedItems] = useState<OrderItem[]>([]);
  const [matrixItems, setMatrixItems] = useState<any[]>([]);
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState('');

  // Modal Receive Confirmation
  const [receivingOrder, setReceivingOrder] = useState<Order | null>(null);
  const [receiverName, setReceiverName] = useState('');
  const [isChecklistDone, setIsChecklistDone] = useState(false);
  const [receiveNotes, setReceiveNotes] = useState('');
  const [receiveError, setReceiveError] = useState('');

  // Modal Request Cancellation
  const [cancellingOrder, setCancellingOrder] = useState<Order | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelError, setCancelError] = useState('');

  // Detail Modal & Menu Action
  const [openCancelMenuId, setOpenCancelMenuId] = useState<string | null>(null);
  const [detailOrder, setDetailOrder] = useState<Order | null>(null);

  if (!user) {
    return <div style={{ padding: '20px' }}>Silakan login sebagai sekolah...</div>;
  }

  // Filter orders for logged-in school
  const allSchoolOrders = user ? getOrdersBySchoolId(user.id) : [];
  const schoolReturns = user ? getReturnsBySchoolId(user.id) : [];
  const activeReturnsCount = schoolReturns.filter((r) => r.status === 'requested' || r.status === 'in_transit').length;

  // 1. Pesanan Berjalan: pending, approved, shipped
  const activeOrders = allSchoolOrders.filter(
    (o) => o.status === 'pending' || o.status === 'approved' || o.status === 'shipped'
  );

  // 2. History Diterima (Selesai): received
  const receivedOrders = allSchoolOrders.filter((o) => o.status === 'received');

  // 3. History Pembatalan: cancellation_requested, cancelled, rejected
  const cancelledOrders = allSchoolOrders.filter(
    (o) => o.status === 'cancelled' || o.status === 'cancellation_requested' || o.status === 'rejected'
  );

  const pendingCount = allSchoolOrders.filter((o) => o.status === 'pending').length;
  const approvedCount = allSchoolOrders.filter((o) => o.status === 'approved').length;
  const shippedCount = allSchoolOrders.filter((o) => o.status === 'shipped').length;
  const receivedCount = receivedOrders.length;
  const cancelledCount = cancelledOrders.length;

  // Calculate live financial summary for modal
  const cartTotalStudent = cartItems.reduce((acc, it) => acc + (it.priceStudent * it.quantity), 0);
  const cartTotalKopkar = cartItems.reduce((acc, it) => acc + (it.priceKopkar * it.quantity), 0);
  const cartTotalFee = cartItems.reduce((acc, it) => acc + (it.feeSchool * it.quantity), 0);

  // Day Restriction Logic
  const currentDay = new Date().getDay(); // 0: Sun, 1: Mon, 2: Tue, 3: Wed, 4: Thu, 5: Fri, 6: Sat
  const isInputAllowed = () => {
    if (orderPhase.includes('Tambahan')) {
      if (!tambahanOpen) return false;
      
      let isAllowedByDate = true;
      if (tambahanUseDateRule && tambahanStartDate && tambahanEndDate) {
        const todayStr = new Date().toISOString().split('T')[0];
        isAllowedByDate = (todayStr >= tambahanStartDate && todayStr <= tambahanEndDate);
      }
      
      let isAllowedByDay = true;
      if (tambahanUseDayRule && user) {
        if (user.schoolLevel === 'TK' && currentDay !== 1) isAllowedByDay = false;
        if (user.schoolLevel === 'SD' && currentDay !== 2) isAllowedByDay = false;
        if (user.schoolLevel === 'SMP' && currentDay !== 3) isAllowedByDay = false;
        if (user.schoolLevel === 'SMA' && currentDay !== 4) isAllowedByDay = false;
      }
      
      return isAllowedByDate && isAllowedByDay;
    }
    
    return true;
  };
  const isAllowedToInput = isInputAllowed();

  const hasPhase1Order = allSchoolOrders.some(o => o.orderPhase === 'Tahap 1' && o.status !== 'cancelled' && o.status !== 'rejected');
  const hasPhase2Order = allSchoolOrders.some(o => o.orderPhase === 'Tahap 2' && o.status !== 'cancelled' && o.status !== 'rejected');

  const handleAddItem = () => {
    const firstGroup = groupedCatalogArray[0];
    setSelectedItems((prev) => [
      ...prev,
      {
        name: firstGroup ? firstGroup.name : '',
        type: firstGroup ? (firstGroup.type as import('../../types').OrderItemType) : 'seragam',
        quantity: 1,
        size: '',
        priceKopkar: firstGroup ? firstGroup.priceKopkar : 0,
        feeSchool: firstGroup ? firstGroup.feeSchool : 0,
        priceStudent: firstGroup ? firstGroup.priceStudent : 0,
        productId: '',
        code: '',
      },
    ]);
  };

  const handleRemoveItem = (index: number) => {
    if (selectedItems.length <= 1) return;
    setSelectedItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUpdateCartQty = (index: number, newQty: number) => {
    if (newQty < 1) return;
    const updated = [...cartItems];
    updated[index].quantity = newQty;
    setCartItems(updated);
  };

  const handleRemoveCartItem = (index: number) => {
    const updated = [...cartItems];
    updated.splice(index, 1);
    setCartItems(updated);
  };

  const handleProductSelect = (index: number, productName: string) => {
    const group = groupedCatalog[productName];
    if (!group) return;

    setSelectedItems((prev) =>
      prev.map((item, i) => {
        if (i === index) {
          return {
            ...item,
            name: group.name,
            type: group.type as import('../../types').OrderItemType,
            priceKopkar: group.priceKopkar,
            feeSchool: group.feeSchool,
            priceStudent: group.priceStudent,
            productId: '', // reset until size is picked
            code: '',
            size: '',
          };
        }
        return item;
      })
    );
  };

  const handleQuantityChange = (index: number, qty: number) => {
    const validQty = Math.max(1, qty);
    setSelectedItems((prev) =>
      prev.map((item, i) => {
        if (i === index) {
          return { ...item, quantity: validQty };
        }
        return item;
      })
    );
  };

  const resetCreateForm = (phase: 'Tahap 1' | 'Tambahan Tahap 1' | 'Tahap 2' | 'Tambahan Tahap 2' | 'Tambahan Mingguan') => {
    const defaultLevel = user?.schoolLevel || 'SMP';
    setOrderLevelFilter(defaultLevel);
    setOrderPhase(phase);
    const cat = getProductsByLevel(defaultLevel);
    const grp = groupByCatalog(cat);

    if (!phase.includes('Tambahan') && grp.length > 0) {
      setMatrixItems(grp.map((g: any) => ({
        name: g.name,
        type: g.type,
        priceKopkar: g.priceKopkar,
        feeSchool: g.feeSchool,
        priceStudent: g.priceStudent,
        variants: g.variants,
        sizesInput: {},
        customVariantId: '',
        customQty: 0
      })));
      setSelectedItems([]);
    } else {
      setMatrixItems([]);
      setSelectedItems([{
        name: '',
        type: (grp[0]?.type || 'seragam') as import('../../types').OrderItemType,
        quantity: 1,
        priceKopkar: grp[0]?.priceKopkar || 80000,
        feeSchool: grp[0]?.feeSchool || 15000,
        priceStudent: grp[0]?.priceStudent || 95000,
        productId: '',
        code: '',
        size: ''
      }]);
    }
    setNotes('');
    setFormError('');
  };


  const handleCreateSubmit = (e: FormEvent) => {
    e.preventDefault();
    setFormError('');

    let itemsToSubmit: OrderItem[] = [];

    if (!orderPhase.includes('Tambahan')) {
      matrixItems.forEach(row => {
        Object.entries(row.sizesInput).forEach(([variantId, qty]) => {
          if ((qty as number) > 0) {
            const variant = row.variants.find((v: any) => v.id === variantId);
            if (variant) {
              itemsToSubmit.push({
                productId: variant.id,
                code: variant.code,
                name: row.name,
                type: row.type,
                priceKopkar: row.priceKopkar,
                feeSchool: row.feeSchool,
                priceStudent: row.priceStudent,
                size: variant.size,
                quantity: qty as number
              });
            }
          }
        });
        if (row.customQty > 0 && row.customVariantId) {
          const variant = row.variants.find((v: any) => v.id === row.customVariantId);
          if (variant) {
            itemsToSubmit.push({
              productId: variant.id,
              code: variant.code,
              name: row.name,
              type: row.type,
              priceKopkar: row.priceKopkar,
              feeSchool: row.feeSchool,
              priceStudent: row.priceStudent,
              size: variant.size,
              quantity: row.customQty
            });
          }
        }
      });
    } else {
      itemsToSubmit = selectedItems.filter(it => it.quantity > 0 && it.productId); // must have selected a specific size/variant
      for (const item of itemsToSubmit) {
        if (!item.name.trim()) {
          setFormError('Nama item tidak boleh kosong');
          return;
        }
      }
    }

    if (itemsToSubmit.length === 0) {
      setFormError('Pilih minimal 1 item barang dengan kuantitas > 0');
      return;
    }

    // Add to global cart state
    setCartItems(prev => [...prev, ...itemsToSubmit]);
    setShowCreateModal(false);
    resetCreateForm(orderPhase);
  };

  const handleCartSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!user) return;
    
    if (cartItems.length === 0) {
      setFormError('Keranjang masih kosong');
      return;
    }

    const result = await createOrder({
      schoolUserId: user.id,
      schoolName: user.schoolName || user.name,
      schoolLevel: user.schoolLevel || orderLevelFilter, // default to user's level
      orderPhase: orderPhase,
      items: cartItems,
      notes: notes.trim(),
    });

    if (result.success) {
      setCartItems([]);
      setNotes('');
      setShowCartModal(false);
    } else {
      setFormError(result.error || 'Gagal membuat pesanan');
    }
  };

  // Open receive modal
  const handleOpenReceiveModal = (order: Order) => {
    setReceivingOrder(order);
    setReceiverName(user?.name || '');
    setIsChecklistDone(false);
    setReceiveNotes('');
    setReceiveError('');
  };

  const handleConfirmReceive = (e: FormEvent) => {
    e.preventDefault();
    if (!receivingOrder) return;

    if (!receiverName.trim()) {
      setReceiveError('Nama penerima wajib diisi');
      return;
    }
    if (!isChecklistDone) {
      setReceiveError('Harap centang verifikasi bahwa fisik barang telah dicek dan sesuai');
      return;
    }

    receiveOrder(receivingOrder.id, {
      receivedBy: receiverName.trim(),
      isChecked: true,
      notes: receiveNotes.trim() || undefined,
    });

    setReceivingOrder(null);
  };

  // Open cancel modal
  const handleOpenCancelModal = (order: Order) => {
    setCancellingOrder(order);
    setCancelReason('');
    setCancelError('');
  };

  const handleConfirmCancel = (e: FormEvent) => {
    e.preventDefault();
    if (!cancellingOrder || !user) return;

    if (!cancelReason.trim()) {
      setCancelError('Alasan pembatalan wajib diisi');
      return;
    }

    requestCancelOrder(cancellingOrder.id, cancelReason.trim(), user.name);
    setCancellingOrder(null);
    setCancelReason('');
  };

  const formatRupiah = (num?: number) => {
    if (num === undefined || isNaN(num)) return 'Rp 0';
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
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="school-dashboard">
      <div className="school-header-section">
        <div>
          <h2>Pemesanan Barang</h2>
          <div className="school-welcome">
            Buat pesanan seragam dan buku baru ke Kopkar.
          </div>
        </div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button 
            className="btn-primary" 
            onClick={() => { resetCreateForm('Tambahan Mingguan'); setShowCreateModal(true); }}
            style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <span>➕</span> Buat Pesanan
          </button>
          <Link
            to="/school/retur"
            className="btn-primary"
            style={{
              background: 'var(--bluish-white, #F0F3FA)',
              color: 'var(--primary-blue, #395886)',
              border: '1px solid var(--border-subtle, #d5deef)',
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span>↩️</span> Retur Barang
            {activeReturnsCount > 0 && (
              <span
                style={{
                  background: '#d97706',
                  color: '#ffffff',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  padding: '1px 6px',
                  borderRadius: '99px',
                }}
              >
                {activeReturnsCount}
              </span>
            )}
          </Link>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="order-stats">
        <div className="order-stat-card">
          <div className="stat-icon">📦</div>
          <div className="stat-label">Total Pesanan</div>
          <div className="stat-value">{allSchoolOrders.length}</div>
        </div>
        <div className="order-stat-card">
          <div className="stat-icon">⏳</div>
          <div className="stat-label">Menunggu</div>
          <div className="stat-value">{pendingCount}</div>
        </div>
        <div className="order-stat-card">
          <div className="stat-icon">👍</div>
          <div className="stat-label">Disetujui</div>
          <div className="stat-value">{approvedCount}</div>
        </div>
        <div className="order-stat-card">
          <div className="stat-icon">🚚</div>
          <div className="stat-label">Sedang Dikirim</div>
          <div className="stat-value" style={{ color: '#2563eb' }}>{shippedCount}</div>
        </div>
        <div className="order-stat-card">
          <div className="stat-icon">✅</div>
          <div className="stat-label">History Diterima</div>
          <div className="stat-value" style={{ color: '#059669' }}>{receivedCount}</div>
        </div>
      </div>

      {/* 3 Tabs Navigation */}
      <div className="dashboard-tabs">
        <button
          className={`tab-button ${activeTab === 'active' ? 'active' : ''}`}
          onClick={() => setActiveTab('active')}
        >
          📋 Pesanan Berjalan ({activeOrders.length})
        </button>
        <button
          className={`tab-button ${activeTab === 'received' ? 'active' : ''}`}
          onClick={() => setActiveTab('received')}
        >
          ✅ History Diterima ({receivedCount})
        </button>
        <button
          className={`tab-button ${activeTab === 'cancellations' ? 'active' : ''}`}
          onClick={() => setActiveTab('cancellations')}
        >
          🚫 History Pembatalan ({cancelledCount})
        </button>
      </div>

      {/* TAB 1: PESANAN BERJALAN */}
      {activeTab === 'active' && (
        <div className="tab-pane">
          <div className="order-toolbar" style={{ alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              <h3>Daftar Pesanan Sedang Berjalan</h3>
            </div>
          </div>

          {activeOrders.length > 0 ? (
            <>
              {/* Desktop Table View */}
              <div className="order-table-container desktop-table-view">
                <table className="order-table">
                  <thead>
                    <tr>
                      <th>ID & Tgl Pesan</th>
                      <th>Item Pemesanan</th>
                      <th>Status Pelunasan</th>
                      <th>Status Pengiriman</th>
                      <th>Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeOrders.map((order) => (
                      <tr key={order.id}>
                        <td>
                          <strong>{order.id}</strong>
                          <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
                            {formatDate(order.createdAt)}
                          </div>
                        </td>
                        <td>
                          <ul className="order-items-list">
                            {order.items.map((it, idx) => (
                              <li key={idx}>
                                <span className={`item-type ${it.type}`}>{it.type}</span>
                                {it.name} {it.size && <span style={{color: '#2563eb', fontWeight: 600}}> [{it.size}] </span>} (<strong>{it.quantity} pcs</strong>)
                              </li>
                            ))}
                          </ul>
                        </td>
                        <td>
                          {order.paymentStatus === 'paid' ? (
                            <span className="badge-pay-paid">🟢 Lunas ke Koperasi</span>
                          ) : (
                            <span className="badge-pay-unpaid">🔴 Menunggu Pelunasan</span>
                          )}
                        </td>
                        <td>
                          {order.status === 'pending' && (
                            <span className="status-badge pending">⏳ Menunggu Persetujuan</span>
                          )}
                          {order.status === 'approved' && (
                            <span className="status-badge approved">👍 Disetujui (Siap Kirim)</span>
                          )}
                          {order.status === 'shipped' && (
                            <div className="shipping-badge-container">
                              <span className="status-badge shipped">🚚 Sedang Dikirim</span>
                              {order.shippingInfo && (
                                <div className="shipping-info-box">
                                  <div>{order.shippingInfo.shippedAtDate} (Pk {order.shippingInfo.shippedAtTime})</div>
                                  <div>{order.shippingInfo.courierNotes || 'Armada Koperasi'}</div>
                                </div>
                              )}
                            </div>
                          )}
                        </td>
                        <td>
                          <div className="action-buttons-col">
                            <button
                              className="btn-detail-dots"
                              title="Lihat Detail"
                              onClick={() => setDetailOrder(order)}
                            >
                              ⋯
                            </button>
                            {order.status === 'shipped' && (
                              <button
                                className="btn-receive"
                                onClick={() => handleOpenReceiveModal(order)}
                              >
                                📦 Konfirmasi Terima
                              </button>
                            )}
                            {(order.status === 'pending' || order.status === 'approved') && (
                              <button
                                className="btn-cancel-request"
                                onClick={() => handleOpenCancelModal(order)}
                              >
                                ✕ Batalkan
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Card View */}
              <div className="mobile-cards-view">
                {activeOrders.map((order) => (
                  <div key={order.id} className="mobile-order-card">
                    <div className="mobile-card-header">
                      <div>
                        <span className="mobile-order-id">{order.id}</span>
                        <div className="mobile-card-date">{formatDate(order.createdAt)}</div>
                      </div>
                      <span className={`status-badge ${order.status}`}>
                        {order.status === 'pending' && '⏳ Menunggu'}
                        {order.status === 'approved' && '👍 Disetujui'}
                        {order.status === 'shipped' && '🚚 Dikirim'}
                      </span>
                    </div>

                    <div className="mobile-items-box">
                      <div className="mobile-label">Item Pesanan:</div>
                      <ul className="order-items-list">
                        {order.items.map((it, idx) => (
                          <li key={idx}>
                            <span className={`item-type ${it.type}`}>{it.type}</span>
                            {it.name} — {it.quantity} pcs
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="mobile-price-summary">
                      <div>
                        <span className="price-sub-label">Total Tagihan Siswa:</span>
                        <strong>{formatRupiah(order.totalPriceStudent)}</strong>
                      </div>
                      <div>
                        <span className="price-sub-label">Hak Fee Sekolah:</span>
                        <strong style={{ color: '#059669' }}>+{formatRupiah(order.totalFeeSchool)}</strong>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '4px' }}>
                      {order.paymentStatus === 'paid' ? (
                        <span className="badge-pay-paid">🟢 Lunas</span>
                      ) : (
                        <span className="badge-pay-unpaid">🔴 Belum Lunas</span>
                      )}
                      {order.feeStatus === 'disbursed' ? (
                        <span className="badge-fee-disbursed">💰 Fee Cair</span>
                      ) : (
                        <span className="badge-fee-locked">🔒 Fee Belum Cair</span>
                      )}
                    </div>

                    <div className="mobile-card-actions">
                      {order.status === 'shipped' && (
                        <button
                          className="btn-receive full-width-touch"
                          onClick={() => handleOpenReceiveModal(order)}
                        >
                          📦 Konfirmasi Terima Barang
                        </button>
                      )}
                      {(order.status === 'pending' || order.status === 'approved') && (
                        <button
                          className="btn-cancel-request full-width-touch"
                          onClick={() => handleOpenCancelModal(order)}
                        >
                          ✕ Batalkan Pesanan
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="order-empty">
              <p>Belum ada pesanan aktif saat ini.</p>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: HISTORY PEMESANAN DITERIMA (SELESAI) */}
      {activeTab === 'received' && (
        <div className="tab-pane">
          <div className="order-toolbar">
            <h3>Riwayat Pesanan yang Berhasil Diterima & Selesai</h3>
          </div>

          {receivedOrders.length > 0 ? (
            <>
              {/* Desktop Table View */}
              <div className="order-table-container desktop-table-view">
                <table className="order-table">
                  <thead>
                    <tr>
                      <th>ID & Tgl Pesan</th>
                      <th>Item Pemesanan</th>
                      <th>Status Pelunasan</th>
                      <th>Status Pengiriman</th>
                      <th>Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {receivedOrders.map((order) => (
                      <tr key={order.id}>
                        <td>
                          <strong>{order.id}</strong>
                          <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
                            {formatDate(order.createdAt)}
                          </div>
                        </td>
                        <td>
                          <ul className="order-items-list">
                            {order.items.map((it, idx) => (
                              <li key={idx}>
                                <span className={`item-type ${it.type}`}>{it.type}</span>
                                {it.name} {it.size && <span style={{color: '#2563eb', fontWeight: 600}}> [{it.size}] </span>} ({it.quantity} pcs)
                              </li>
                            ))}
                          </ul>
                        </td>
                        <td>
                          {order.paymentStatus === 'paid' ? (
                            <div>
                              <span className="badge-pay-paid">🟢 Lunas ke Koperasi</span>
                              {order.paidAt && (
                                <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>
                                  {formatDate(order.paidAt)}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="badge-pay-unpaid">🔴 Menunggu Pelunasan</span>
                          )}
                        </td>
                        <td>
                          <span className="status-badge received">✅ Selesai Diterima</span>
                          {order.receiveInfo && (
                            <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px' }}>
                              Oleh: {order.receiveInfo.receivedBy}
                            </div>
                          )}
                        </td>
                        <td>
                          <div className="action-buttons-col">
                            <button
                              className="btn-detail-dots"
                              title="Lihat Detail"
                              onClick={() => setDetailOrder(order)}
                            >
                              ⋯
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Card View */}
              <div className="mobile-cards-view">
                {receivedOrders.map((order) => (
                  <div key={order.id} className="mobile-order-card completed-card">
                    <div className="mobile-card-header">
                      <div>
                        <span className="mobile-order-id">{order.id}</span>
                        <div className="mobile-card-date">{formatDate(order.createdAt)}</div>
                      </div>
                      <span className="status-badge received">✅ Selesai Diterima</span>
                    </div>

                    <div className="mobile-items-box">
                      <div className="mobile-label">Item:</div>
                      <ul className="order-items-list">
                        {order.items.map((it, idx) => (
                          <li key={idx}>
                            <span className={`item-type ${it.type}`}>{it.type}</span>
                            {it.name} {it.size && <span style={{color: '#2563eb', fontWeight: 600}}> [{it.size}] </span>} ({it.quantity} pcs)
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="mobile-price-summary">
                      <div>
                        <span className="price-sub-label">Total Tagihan Siswa:</span>
                        <strong>{formatRupiah(order.totalPriceStudent)}</strong>
                      </div>
                      <div>
                        <span className="price-sub-label">Hak Fee Sekolah:</span>
                        <strong style={{ color: '#059669' }}>+{formatRupiah(order.totalFeeSchool)}</strong>
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '6px' }}>
                      {order.paymentStatus === 'paid' ? (
                        <div className="badge-pay-paid">🟢 Pembayaran: Lunas ke Koperasi</div>
                      ) : (
                        <div className="badge-pay-unpaid">🔴 Pembayaran: Belum Lunas</div>
                      )}

                      {order.feeStatus === 'disbursed' ? (
                        <div className="badge-fee-disbursed">💰 Fee Sekolah: Telah Ditransfer Koperasi</div>
                      ) : order.feeStatus === 'ready' ? (
                        <div className="badge-fee-ready">⏳ Fee Sekolah: Siap Ditransfer (Koperasi sedang proses)</div>
                      ) : (
                        <div className="badge-fee-locked">🔒 Fee Sekolah: Cair Setelah Pelunasan</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="order-empty">
              <p>Belum ada riwayat pesanan yang selesai/diterima.</p>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: HISTORY PEMBATALAN */}
      {activeTab === 'cancellations' && (
        <div className="tab-pane">
          <div className="order-toolbar">
            <h3>Riwayat Pembatalan & Penolakan Pesanan</h3>
          </div>

          {cancelledOrders.length > 0 ? (
            <>
              {/* Desktop Table View */}
              <div className="order-table-container desktop-table-view">
                <table className="order-table">
                  <thead>
                    <tr>
                      <th>ID & Tgl Pesan</th>
                      <th>Item Pemesanan</th>
                      <th>Status Pelunasan</th>
                      <th>Status Pengiriman</th>
                      <th>Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cancelledOrders.map((order) => (
                      <tr key={order.id}>
                        <td>
                          <strong>{order.id}</strong>
                          <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
                            {formatDate(order.createdAt)}
                          </div>
                        </td>
                        <td>
                          <ul className="order-items-list">
                            {order.items.map((it, idx) => (
                              <li key={idx}>
                                <span className={`item-type ${it.type}`}>{it.type}</span>
                                {it.name} {it.size && <span style={{color: '#2563eb', fontWeight: 600}}> [{it.size}] </span>} ({it.quantity} pcs)
                              </li>
                            ))}
                          </ul>
                        </td>
                        <td>
                          {order.paymentStatus === 'paid' ? (
                            <span className="badge-pay-paid">🟢 Lunas</span>
                          ) : (
                            <span className="badge-pay-unpaid">🔴 Belum Lunas</span>
                          )}
                        </td>
                        <td>
                          {order.status === 'cancellation_requested' && (
                            <span className="status-badge requested">⏳ Permintaan Batal</span>
                          )}
                          {order.status === 'cancelled' && (
                            <span className="status-badge cancelled">🚫 Dibatalkan</span>
                          )}
                          {order.status === 'rejected' && (
                            <span className="status-badge rejected">❌ Ditolak Koperasi</span>
                          )}
                        </td>
                        <td>
                          <div className="action-buttons-col" style={{ position: 'relative' }}>
                            <button
                              className="btn-detail-dots"
                              title="Opsi"
                              onClick={() => setOpenCancelMenuId(openCancelMenuId === order.id ? null : order.id)}
                            >
                              ⋮
                            </button>
                            {openCancelMenuId === order.id && (
                              <div className="action-menu-dropdown">
                                <button
                                  className="dropdown-item"
                                  onClick={() => {
                                    setDetailOrder(order);
                                    setOpenCancelMenuId(null);
                                  }}
                                >
                                  📄 Detail
                                </button>
                                <button
                                  className="dropdown-item delete"
                                  onClick={() => {
                                    if(window.confirm('Yakin ingin menghapus permanen riwayat pembatalan ini?')) {
                                      deleteOrder(order.id);
                                    }
                                    setOpenCancelMenuId(null);
                                  }}
                                >
                                  🗑️ Hapus Riwayat
                                </button>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Card View */}
              <div className="mobile-cards-view">
                {cancelledOrders.map((order) => (
                  <div key={order.id} className="mobile-order-card cancelled-card">
                    <div className="mobile-card-header">
                      <span className="mobile-order-id">{order.id}</span>
                      <span className={`status-badge ${order.status}`}>
                        {order.status === 'cancellation_requested' && '⏳ Request Batal'}
                        {order.status === 'cancelled' && '🚫 Dibatalkan'}
                        {order.status === 'rejected' && '❌ Ditolak'}
                      </span>
                    </div>

                    <div className="mobile-items-box">
                      <div className="mobile-label">Item:</div>
                      <ul className="order-items-list">
                        {order.items.map((it, idx) => (
                          <li key={idx}>
                            <span className={`item-type ${it.type}`}>{it.type}</span>
                            {it.name} {it.size && <span style={{color: '#2563eb', fontWeight: 600}}> [{it.size}] </span>} ({it.quantity} pcs)
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="reason-text-box" style={{ marginTop: '8px' }}>
                      <strong>Alasan:</strong> {order.cancellationInfo?.reason || order.rejectionReason || 'Tidak ada alasan'}
                    </div>

                    <div style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
                      <button 
                        className="btn-primary" 
                        style={{ flex: 1, padding: '8px', fontSize: '0.85rem', background: '#395886' }}
                        onClick={() => setDetailOrder(order)}
                      >
                        📄 Detail
                      </button>
                      <button 
                        className="btn-reject" 
                        style={{ flex: 1, padding: '8px', fontSize: '0.85rem' }}
                        onClick={() => {
                          if(window.confirm('Yakin ingin menghapus permanen riwayat pembatalan ini?')) {
                            deleteOrder(order.id);
                          }
                        }}
                      >
                        🗑️ Hapus
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="order-empty">
              <p>Tidak ada riwayat pembatalan atau penolakan pesanan.</p>
            </div>
          )}
        </div>
      )}

      {/* Modal Buat Order Baru (Dengan Pilihan Katalog Barang Sesuai Jenjang) */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal order-modal-wide" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ margin: 0 }}>Form Pemesanan Seragam & Buku</h3>
              <button className="btn-close-modal" onClick={() => setShowCreateModal(false)}>✕</button>
            </div>

            <form className="modal-form" onSubmit={handleCreateSubmit}>
              {formError && <div className="modal-error">{formError}</div>}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px 140px', gap: '12px' }}>
                <div className="form-group">
                  <label>Nama Pemesan / Sekolah</label>
                  <input
                    type="text"
                    value={`${user?.name} - ${user?.schoolName || ''}`}
                    disabled
                    style={{ background: '#f1f5f9', cursor: 'not-allowed' }}
                  />
                </div>

                <div className="form-group">
                  <label>Jenjang Sekolah</label>
                  <select
                    value={orderLevelFilter}
                    onChange={(e) => {
                      const lvl = e.target.value as SchoolLevel;
                      setOrderLevelFilter(lvl);
                      const cat = getProductsByLevel(lvl);
                      if (!orderPhase.includes('Tambahan')) {
                        setMatrixItems(groupByCatalog(cat).map((g: any) => ({
                          name: g.name, type: g.type, priceKopkar: g.priceKopkar, feeSchool: g.feeSchool, priceStudent: g.priceStudent,
                          variants: g.variants, sizesInput: {}, customVariantId: '', customQty: 0
                        })));
                        setSelectedItems([]);
                      }
                    }}
                  >
                    <option value="TK">Jenjang TK</option>
                    <option value="SD">Jenjang SD</option>
                    <option value="SMP">Jenjang SMP</option>
                    <option value="SMA">Jenjang SMA</option>
                    <option value="SPK-SD">Jenjang SPK (Primary)</option>
                    <option value="SPK-SMP">Jenjang SPK (Lower Sec)</option>
                    <option value="SPK-SMA">Jenjang SPK (Upper Sec)</option>
                    <option value="SEMUA">Semua Jenjang</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Fase Pemesanan</label>
                  <select
                    value={orderPhase}
                    onChange={(e) => {
                      const p = e.target.value as 'Tahap 1' | 'Tambahan Tahap 1' | 'Tahap 2' | 'Tambahan Tahap 2' | 'Tambahan Mingguan';
                      setOrderPhase(p);
                      const grp = groupByCatalog(getProductsByLevel(orderLevelFilter));
                      if (!p.includes('Tambahan')) {
                        setMatrixItems(grp.map((g: any) => ({
                          name: g.name, type: g.type, priceKopkar: g.priceKopkar, feeSchool: g.feeSchool, priceStudent: g.priceStudent,
                          variants: g.variants, sizesInput: {}, customVariantId: '', customQty: 0
                        })));
                        setSelectedItems([]);
                      } else {
                        setMatrixItems([]);
                        setSelectedItems([{ name: '', type: (grp[0]?.type || 'seragam') as import('../../types').OrderItemType, quantity: 1, priceKopkar: grp[0]?.priceKopkar || 80000, feeSchool: grp[0]?.feeSchool || 15000, priceStudent: grp[0]?.priceStudent || 95000, productId: '', code: '', size: '' }]);
                      }
                    }}
                  >
                    <option value="Tahap 1">Tahap 1</option>
                    <option value="Tambahan Tahap 1">Tambahan Tahap 1</option>
                    <option value="Tahap 2">Tahap 2</option>
                    <option value="Tambahan Tahap 2">Tambahan Tahap 2</option>
                    <option value="Tambahan Mingguan">Tambahan Mingguan</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label>Pilih Barang dari Katalog Jenjang {orderLevelFilter}:</label>

                {!orderPhase.includes('Tambahan') ? (
                  <div className="matrix-table-wrapper" style={{ overflowX: 'auto', marginBottom: '16px', background: '#fff', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    <table className="order-table" style={{ minWidth: '800px', margin: 0 }}>
                      <thead style={{ background: '#f8fafc' }}>
                        <tr>
                          <th style={{ padding: '12px', borderBottom: '2px solid #cbd5e1' }}>Nama Barang</th>
                          {SIZE_ORDER.map(sz => {
                            // only show column if at least one matrixItem has this size
                            const hasAnySz = matrixItems.some((row: any) =>
                              row.variants.some((v: any) => v.size?.trim().toUpperCase() === sz)
                            );
                            if (!hasAnySz) return null;
                            return (
                              <th key={sz} style={{ width: '60px', textAlign: 'center', padding: '12px', borderBottom: '2px solid #cbd5e1' }}>{sz}</th>
                            );
                          })}
                          <th style={{ width: '180px', textAlign: 'center', padding: '12px', borderBottom: '2px solid #cbd5e1' }}>Ukuran Lainnya</th>
                          <th style={{ width: '80px', textAlign: 'center', padding: '12px', borderBottom: '2px solid #cbd5e1' }}>Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {matrixItems.map((row, rIdx) => {
                          const rowTotal = Object.values(row.sizesInput).reduce((acc: number, val: any) => acc + (parseInt(val) || 0), 0) + (parseInt(row.customQty) || 0);
                          return (
                            <tr key={rIdx} style={{ borderBottom: '1px solid #e2e8f0' }}>
                              <td style={{ padding: '12px' }}>
                                <strong>{row.name}</strong>
                                <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '4px' }}>Rp {new Intl.NumberFormat('id-ID').format(row.priceStudent)}</div>
                              </td>
                              {SIZE_ORDER.map(sz => {
                                const hasSzCol = matrixItems.some((row: any) =>
                                  row.variants.some((v: any) => v.size?.trim().toUpperCase() === sz)
                                );
                                if (!hasSzCol) return null;
                                const variant = row.variants.find((v: any) => v.size?.trim().toUpperCase() === sz);
                                return (
                                  <td key={sz} style={{ padding: '6px', textAlign: 'center' }}>
                                    {variant ? (
                                      <input 
                                        type="number" 
                                        min="0" 
                                        value={row.sizesInput[variant.id] || ''}
                                        onChange={(e) => {
                                          const val = parseInt(e.target.value) || 0;
                                          setMatrixItems(prev => prev.map((it, i) => i === rIdx ? { ...it, sizesInput: { ...it.sizesInput, [variant.id]: val } } : it));
                                        }}
                                        style={{ width: '100%', maxWidth: '60px', textAlign: 'center', padding: '8px 4px', border: '1px solid #cbd5e1', borderRadius: '4px' }}
                                      />
                                    ) : (
                                      <div style={{ color: '#cbd5e1', fontSize: '0.8rem' }}>-</div>
                                    )}
                                  </td>
                                );
                              })}
                              <td style={{ padding: '6px' }}>
                                <div style={{ display: 'flex', gap: '4px' }}>
                                  <select 
                                    value={row.customVariantId}
                                    onChange={(e) => setMatrixItems(prev => prev.map((it, i) => i === rIdx ? { ...it, customVariantId: e.target.value } : it))}
                                    style={{ width: '60%', padding: '8px 4px', border: '1px solid #cbd5e1', borderRadius: '4px' }}
                                  >
                                    <option value="">- Ukuran -</option>
                                    {sortBySize(row.variants.filter((v: any) => !SIZE_ORDER.includes(v.size?.trim().toUpperCase()))).map((v: any) => (
                                      <option key={v.id} value={v.id}>{v.size || 'No Size'}</option>
                                    ))}
                                  </select>
                                  <input 
                                    type="number" 
                                    min="0" 
                                    placeholder="Qty" 
                                    value={row.customQty || ''}
                                    onChange={(e) => setMatrixItems(prev => prev.map((it, i) => i === rIdx ? { ...it, customQty: parseInt(e.target.value) || 0 } : it))}
                                    style={{ width: '40%', padding: '8px 4px', textAlign: 'center', border: '1px solid #cbd5e1', borderRadius: '4px' }}
                                    disabled={!row.customVariantId}
                                  />
                                </div>
                              </td>
                              <td style={{ textAlign: 'center', fontWeight: 600, padding: '12px' }}>{rowTotal}</td>
                            </tr>
                          );
                        })}
                        {matrixItems.length === 0 && (
                          <tr><td colSpan={9} style={{ textAlign: 'center', padding: '24px', color: '#64748b' }}>Katalog kosong untuk jenjang ini.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="school-order-items-table">
                    {selectedItems.map((item, index) => {
                      const selectedGroup = groupedCatalog[item.name];
                      return (
                        <div key={index} className="school-order-row">
                          <div style={{ flexGrow: 1 }}>
                            <select
                              className="product-select"
                              value={item.name || ''}
                              onChange={(e) => handleProductSelect(index, e.target.value)}
                            >
                              <option value="">-- Pilih Barang --</option>
                              {groupedCatalogArray.map((group) => (
                                <option key={group.name} value={group.name}>
                                  [{group.type}] {group.name}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div style={{ width: '160px', marginLeft: '10px' }}>
                            <select
                              value={item.productId || ''}
                              onChange={(e) => {
                                const prodId = e.target.value;
                                const variant = selectedGroup?.variants.find(v => v.id === prodId);
                                setSelectedItems((prev) => prev.map((it, i) => i === index ? { ...it, productId: prodId, code: variant?.code, size: variant?.size || '' } : it));
                              }}
                              style={{ width: '100%', padding: '9px 12px', border: '1px solid #cbd5e1', borderRadius: '4px', background: '#fff' }}
                              required={item.quantity > 0}
                              disabled={!item.name}
                            >
                              <option value="">-- Pilih Ukuran --</option>
                              {sortBySize(selectedGroup?.variants || []).map(v => (
                                <option key={v.id} value={v.id}>{v.size || 'Tanpa Ukuran'} (Stok: {v.stock})</option>
                              ))}
                            </select>
                          </div>

                          <div style={{ width: '100px', marginLeft: '10px' }}>
                            <input
                              type="number"
                              min="0"
                              placeholder="Jumlah"
                              value={item.quantity || ''}
                              onChange={(e) => handleQuantityChange(index, parseInt(e.target.value) || 0)}
                              style={{ width: '100%', padding: '9px 12px', textAlign: 'center' }}
                              required
                            />
                          </div>

                          {selectedItems.length > 1 && (
                            <button
                              type="button"
                              className="btn-remove-item"
                              onClick={() => handleRemoveItem(index)}
                              title="Hapus baris"
                              style={{ marginLeft: '10px' }}
                            >
                              ×
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {orderPhase.includes('Tambahan') && (
                  <button
                    type="button"
                    className="btn-add-item"
                    onClick={handleAddItem}
                    style={{ marginTop: '8px' }}
                  >
                    + Tambah Item Barang Lainnya
                  </button>
                )}
              </div>

              <div className="modal-actions" style={{ marginTop: '24px', flexDirection: 'column', alignItems: 'stretch' }}>
                {(orderPhase === 'Tahap 1' && hasPhase1Order) && (
                  <div style={{ padding: '12px 16px', background: '#fef9c3', borderLeft: '4px solid #eab308', borderRadius: '4px', fontSize: '0.9rem', color: '#854d0e', marginBottom: '16px' }}>
                    <strong>Sudah Dipesan:</strong> Anda sudah melakukan pesanan untuk Tahap 1.
                  </div>
                )}
                {(orderPhase === 'Tahap 2' && hasPhase2Order) && (
                  <div style={{ padding: '12px 16px', background: '#fef9c3', borderLeft: '4px solid #eab308', borderRadius: '4px', fontSize: '0.9rem', color: '#854d0e', marginBottom: '16px' }}>
                    <strong>Sudah Dipesan:</strong> Anda sudah melakukan pesanan untuk Tahap 2.
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button 
                    type="submit" 
                    className="btn-primary"
                    disabled={(orderPhase === 'Tahap 1' && hasPhase1Order) || (orderPhase === 'Tahap 2' && hasPhase2Order)}
                    style={((orderPhase === 'Tahap 1' && hasPhase1Order) || (orderPhase === 'Tahap 2' && hasPhase2Order)) ? { background: '#94a3b8', cursor: 'not-allowed' } : {}}
                  >
                    🛒 Tambahkan ke Keranjang
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Keranjang */}
      {showCartModal && (
        <div className="modal-overlay" onClick={() => setShowCartModal(false)}>
          <div className="modal order-modal-wide" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ margin: 0 }}>Keranjang Pesanan 🛒</h3>
              <button className="btn-close-modal" onClick={() => setShowCartModal(false)}>✕</button>
            </div>

            <form className="modal-form" onSubmit={handleCartSubmit}>
              {formError && <div className="modal-error">{formError}</div>}

              <div className="verification-item-box" style={{ marginBottom: '20px' }}>
                <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '8px', color: '#334155' }}>
                  Ringkasan Keranjang Pesanan:
                </div>
                {cartItems.length === 0 ? (
                  <div style={{ color: '#dc2626', fontSize: '0.9rem' }}>Keranjang masih kosong. Harap kembali ke Dashboard dan buat pesanan.</div>
                ) : (
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                    {cartItems.map((it, idx) => (
                      <li key={idx} style={{ padding: '8px 0', borderBottom: '1px dashed #e2e8f0', fontSize: '0.88rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ flex: 1 }}>
                          <span className={`item-type ${it.type}`} style={{ marginRight: '8px' }}>{it.type}</span>
                          <strong>{it.name}</strong>
                          {it.size && <span style={{ marginLeft: '6px', color: '#2563eb', fontWeight: 600 }}>[{it.size}]</span>}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <button
                            type="button"
                            onClick={() => handleUpdateCartQty(idx, it.quantity - 1)}
                            disabled={it.quantity <= 1}
                            style={{ padding: '2px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', background: '#f8fafc', cursor: it.quantity <= 1 ? 'not-allowed' : 'pointer' }}
                          >-</button>
                          <span style={{ minWidth: '32px', textAlign: 'center' }}>{it.quantity}</span>
                          <button
                            type="button"
                            onClick={() => handleUpdateCartQty(idx, it.quantity + 1)}
                            style={{ padding: '2px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', background: '#f8fafc', cursor: 'pointer' }}
                          >+</button>
                          <button
                            type="button"
                            onClick={() => handleRemoveCartItem(idx)}
                            style={{ padding: '2px 8px', borderRadius: '4px', border: 'none', background: '#fee2e2', color: '#ef4444', cursor: 'pointer', marginLeft: '4px' }}
                            title="Hapus Item"
                          >✕</button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {cartItems.length > 0 && (
                <>
                  <div className="order-live-summary-card">
                    <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#1e293b', marginBottom: '8px' }}>
                      Ringkasan Estimasi Biaya & Fee:
                    </div>
                    <div className="live-summary-grid">
                      <div className="summary-item">
                        <span className="sum-label">Total Tagihan Siswa (Wajib Dilunasi):</span>
                        <span className="sum-value primary">{formatRupiah(cartTotalStudent)}</span>
                      </div>
                      <div className="summary-item">
                        <span className="sum-label">Estimasi Fee Hak Sekolah (Dikembalikan Setelah Lunas):</span>
                        <span className="sum-value success">+{formatRupiah(cartTotalFee)}</span>
                      </div>
                      <div className="summary-item">
                        <span className="sum-label">Total Biaya Pengadaan Koperasi (HPP):</span>
                        <span className="sum-value secondary">{formatRupiah(cartTotalKopkar)}</span>
                      </div>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '8px', lineHeight: 1.4 }}>
                      ℹ️ Sekolah menagihkan <strong>{formatRupiah(cartTotalStudent)}</strong> kepada siswa/wali murid dan membayarkannya ke Koperasi. Setelah diverifikasi lunas, Koperasi akan membayarkan fee hak sekolah sebesar <strong>{formatRupiah(cartTotalFee)}</strong>.
                    </div>
                  </div>

                  <div className="form-group">
                    <label htmlFor="orderNotes">Catatan Tambahan (opsional)</label>
                    <textarea
                      id="orderNotes"
                      placeholder="Misal: Mohon dikirimkan bertahap atau ditujukan ke ruang TU..."
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={2}
                    />
                  </div>
                </>
              )}

              <div className="modal-actions" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                {(orderPhase === 'Tahap 1' && !phase1Open) && (
                  <div style={{ padding: '12px 16px', background: '#fef9c3', borderLeft: '4px solid #eab308', borderRadius: '4px', fontSize: '0.9rem', color: '#854d0e', marginBottom: '16px' }}>
                    <strong>Tahap 1 Ditutup:</strong> Admin belum mengaktifkan pemesanan Tahap 1.
                  </div>
                )}
                {(orderPhase === 'Tahap 2' && !phase2Open) && (
                  <div style={{ padding: '12px 16px', background: '#fef9c3', borderLeft: '4px solid #eab308', borderRadius: '4px', fontSize: '0.9rem', color: '#854d0e', marginBottom: '16px' }}>
                    <strong>Tahap 2 Ditutup:</strong> Admin belum mengaktifkan pemesanan Tahap 2.
                  </div>
                )}
                {(orderPhase.includes('Tambahan') && !tambahanOpen) && (
                  <div style={{ padding: '12px 16px', background: '#fef9c3', borderLeft: '4px solid #eab308', borderRadius: '4px', fontSize: '0.9rem', color: '#854d0e', marginBottom: '16px' }}>
                    <strong>Fase Tambahan Ditutup:</strong> Admin sedang menutup akses pesanan Tambahan.
                  </div>
                )}
                {(orderPhase.includes('Tambahan') && tambahanOpen && !isAllowedToInput) && (
                  <div style={{ padding: '12px 16px', background: '#fee2e2', borderLeft: '4px solid #ef4444', borderRadius: '4px', fontSize: '0.9rem', color: '#b91c1c', marginBottom: '16px' }}>
                    <strong>Akses Dibatasi:</strong> Checkout tidak dapat dilakukan saat ini karena belum memasuki periode waktu pemesanan yang ditetapkan atau bukan jadwal hari pesanan jenjang Anda.
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
                  <div style={{ display: 'flex', gap: '12px' }}>
                    <button 
                      type="submit" 
                      className="btn-primary"
                      disabled={(orderPhase === 'Tahap 1' && !phase1Open) || (orderPhase === 'Tahap 2' && !phase2Open) || (orderPhase.includes('Tambahan') && (!tambahanOpen || !isAllowedToInput)) || cartItems.length === 0}
                      style={((orderPhase === 'Tahap 1' && !phase1Open) || (orderPhase === 'Tahap 2' && !phase2Open) || (orderPhase.includes('Tambahan') && (!tambahanOpen || !isAllowedToInput)) || cartItems.length === 0) ? { background: '#94a3b8', cursor: 'not-allowed' } : {}}
                    >
                      🚀 Pesan Sekarang
                    </button>
                  </div>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Konfirmasi Penerimaan & Pengecekan Barang */}
      {receivingOrder && (
        <div className="modal-overlay" onClick={() => setReceivingOrder(null)}>
          <div className="modal" style={{ maxWidth: '600px' }} onClick={(e) => e.stopPropagation()}>
            <h3>📦 Konfirmasi Penerimaan & Verifikasi Fisik Barang</h3>
            <p style={{ fontSize: '0.9rem', color: '#64748b', marginBottom: '16px' }}>
              Pesanan No: <strong>{receivingOrder.id}</strong> ({receivingOrder.schoolName})
            </p>

            <form className="modal-form" onSubmit={handleConfirmReceive}>
              {receiveError && <div className="modal-error">{receiveError}</div>}

              <div className="verification-item-box">
                <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: '8px', color: '#334155' }}>
                  Periksa Kesesuaian Fisik Barang:
                </div>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {receivingOrder.items.map((it, idx) => (
                    <li key={idx} style={{ padding: '6px 0', borderBottom: '1px dashed #e2e8f0', fontSize: '0.88rem' }}>
                      📦 <strong>{it.name}</strong> — {it.quantity} pcs ({it.type})
                    </li>
                  ))}
                </ul>
              </div>

              <div className="checklist-container">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={isChecklistDone}
                    onChange={(e) => setIsChecklistDone(e.target.checked)}
                    required
                  />
                  <span>
                    <strong>Saya telah memeriksa fisik barang</strong> dan menyatakan bahwa jumlah serta kondisi barang sudah sesuai pesanan.
                  </span>
                </label>
              </div>

              <div className="form-group">
                <label htmlFor="receiverName">Nama Petugas Penerima di Sekolah *</label>
                <input
                  id="receiverName"
                  type="text"
                  placeholder="Contoh: Bpk. Haryanto (Staf TU)"
                  value={receiverName}
                  onChange={(e) => setReceiverName(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="receiveNotes">Catatan Penerimaan (opsional)</label>
                <textarea
                  id="receiveNotes"
                  placeholder="Misal: Diterima dalam kondisi baik, kardus tersegel rapi..."
                  value={receiveNotes}
                  onChange={(e) => setReceiveNotes(e.target.value)}
                />
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setReceivingOrder(null)}
                >
                  Batal
                </button>
                <button type="submit" className="btn-receive">
                  ✓ Konfirmasi & Selesai
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Pengajuan Pembatalan oleh Sekolah */}
      {cancellingOrder && (
        <div className="modal-overlay" onClick={() => setCancellingOrder(null)}>
          <div className="modal" style={{ maxWidth: '500px' }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ color: '#dc2626' }}>✕ Ajukan Pembatalan Pesanan</h3>
            <p style={{ fontSize: '0.9rem', color: '#64748b', marginBottom: '16px' }}>
              Nomor Pesanan: <strong>{cancellingOrder.id}</strong>
            </p>

            <form className="modal-form" onSubmit={handleConfirmCancel}>
              {cancelError && <div className="modal-error">{cancelError}</div>}

              <div className="form-group">
                <label htmlFor="cancelReason">
                  Alasan Pembatalan (wajib diisi agar dapat ditinjau Koperasi) *
                </label>
                <textarea
                  id="cancelReason"
                  placeholder="Contoh: Terjadi perubahan data ukuran siswa baru / Pembatalan kegiatan..."
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  required
                  rows={4}
                  autoFocus
                />
              </div>

              <div style={{ fontSize: '0.82rem', color: '#64748b', background: '#fef2f2', padding: '10px 12px', borderRadius: '8px', border: '1px solid #fee2e2' }}>
                ℹ️ Permintaan pembatalan ini akan masuk ke dashboard Karyawan Koperasi untuk disetujui.
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setCancellingOrder(null)}
                >
                  Kembali
                </button>
                <button type="submit" className="btn-reject">
                  Kirim Pengajuan Batal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Detail Order */}
      {detailOrder && (
        <div className="modal-overlay" onClick={() => setDetailOrder(null)}>
          <div className="modal" style={{ maxWidth: '600px' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0 }}>Detail Pesanan</h3>
              <button className="btn-close-modal" onClick={() => setDetailOrder(null)} style={{ border: 'none', background: 'none', fontSize: '1.2rem', cursor: 'pointer' }}>✕</button>
            </div>
            
            <div style={{ marginBottom: '20px' }}>
              <div style={{ fontSize: '0.9rem', color: '#64748b' }}>ID Pesanan</div>
              <div style={{ fontWeight: 600 }}>{detailOrder.id}</div>
              <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '4px' }}>
                Tanggal Pesan: {formatDate(detailOrder.createdAt)}
              </div>
            </div>

            <div className="verification-item-box" style={{ marginBottom: '20px' }}>
              <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '8px', color: '#334155' }}>
                Item Pemesanan:
              </div>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {detailOrder.items.map((it, idx) => (
                  <li key={idx} style={{ padding: '6px 0', borderBottom: '1px dashed #e2e8f0', fontSize: '0.88rem' }}>
                    <span className={`item-type ${it.type}`} style={{ marginRight: '8px' }}>{it.type}</span>
                    <strong>{it.name}</strong> — {it.quantity} pcs
                  </li>
                ))}
              </ul>
            </div>

            <div className="order-live-summary-card" style={{ marginBottom: '20px' }}>
              <div className="live-summary-grid" style={{ gridTemplateColumns: '1fr' }}>
                <div className="summary-item" style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #e2e8f0', paddingBottom: '8px', marginBottom: '8px' }}>
                  <span className="sum-label" style={{ fontWeight: 600 }}>Total Tagihan Siswa:</span>
                  <span className="sum-value primary" style={{ fontWeight: 700, fontSize: '1.1rem' }}>{formatRupiah(detailOrder.totalPriceStudent)}</span>
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <div style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '4px' }}>Status Pelunasan</div>
                {detailOrder.paymentStatus === 'paid' ? (
                  <span className="badge-pay-paid">🟢 Lunas ke Koperasi</span>
                ) : (
                  <span className="badge-pay-unpaid">🔴 Menunggu Pelunasan</span>
                )}
              </div>
              <div>
                <div style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '4px' }}>Status Pengiriman</div>
                <span className={`status-badge ${detailOrder.status}`}>
                  {detailOrder.status === 'pending' && '⏳ Menunggu Persetujuan'}
                  {detailOrder.status === 'approved' && '👍 Disetujui (Siap Kirim)'}
                  {detailOrder.status === 'shipped' && '🚚 Sedang Dikirim'}
                  {detailOrder.status === 'received' && '✅ Selesai Diterima'}
                  {detailOrder.status === 'cancellation_requested' && '⏳ Permintaan Batal'}
                  {detailOrder.status === 'cancelled' && '🚫 Dibatalkan'}
                  {detailOrder.status === 'rejected' && '❌ Ditolak Koperasi'}
                </span>
              </div>
            </div>

            <div className="modal-actions" style={{ marginTop: '24px' }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setDetailOrder(null)}
                style={{ width: '100%' }}
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SchoolPemesanan;
