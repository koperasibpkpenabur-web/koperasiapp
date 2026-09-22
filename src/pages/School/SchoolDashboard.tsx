import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useOrders } from '../../context/OrderContext';
import { useProducts } from '../../context/ProductContext';
import { useReturns } from '../../context/ReturnContext';
import { useSettings } from '../../context/SettingsContext';
import type { Order, OrderItem, SchoolLevel } from '../../types';
import './school.css';

const SchoolDashboard = () => {
  const { user } = useAuth();
  const { getOrdersBySchoolId, createOrder, receiveOrder, requestCancelOrder, deleteOrder, cartItems, setCartItems, showCartModal, setShowCartModal } = useOrders();
  const { products, getProductsByLevel } = useProducts();
  const { getReturnsBySchoolId } = useReturns();
  const { phase1Open, phase2Open } = useSettings();

  // 3 Tabs: 'active' (Berjalan), 'received' (History Diterima), 'cancellations' (Riwayat Pembatalan)
  const [activeTab, setActiveTab] = useState<'active' | 'received' | 'cancellations'>('active');

  // Modal Create Order
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [orderLevelFilter, setOrderLevelFilter] = useState<SchoolLevel>(
    user?.schoolLevel || 'SMP'
  );
  const [orderPhase, setOrderPhase] = useState<'Tahap 1' | 'Tahap 2' | 'Tambahan'>('Tahap 1');

  // Available products for current school level
  const availableCatalog = getProductsByLevel(orderLevelFilter);

  // Selected items in order form
  const [selectedItems, setSelectedItems] = useState<OrderItem[]>([
    {
      name: availableCatalog[0]?.name || 'Seragam Sekolah',
      type: availableCatalog[0]?.category || 'seragam',
      quantity: 10,
      priceKopkar: availableCatalog[0]?.priceKopkar || 80000,
      feeSchool: availableCatalog[0]?.feeSchool || 15000,
      priceStudent: availableCatalog[0]?.priceStudent || 95000,
      productId: availableCatalog[0]?.id,
      code: availableCatalog[0]?.code,
    },
  ]);
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
    if (orderPhase === 'Tahap 1' || orderPhase === 'Tahap 2') return true;
    if (!user || user.role !== 'sekolah') return true;
    if (user.schoolLevel === 'TK' && currentDay !== 1) return false;
    if (user.schoolLevel === 'SD' && currentDay !== 2) return false;
    if (user.schoolLevel === 'SMP' && currentDay !== 3) return false;
    if (user.schoolLevel === 'SMA' && currentDay !== 4) return false;
    return true;
  };
  const isAllowedToInput = isInputAllowed();

  const hasPhase1Order = allSchoolOrders.some(o => o.orderPhase === 'Tahap 1' && o.status !== 'cancelled' && o.status !== 'rejected');
  const hasPhase2Order = allSchoolOrders.some(o => o.orderPhase === 'Tahap 2' && o.status !== 'cancelled' && o.status !== 'rejected');

  const handleAddItem = () => {
    const firstProd = availableCatalog[0] || products[0];
    setSelectedItems((prev) => [
      ...prev,
      {
        name: firstProd ? firstProd.name : '',
        type: firstProd ? firstProd.category : 'seragam',
        quantity: 10,
        priceKopkar: firstProd ? firstProd.priceKopkar : 0,
        feeSchool: firstProd ? firstProd.feeSchool : 0,
        priceStudent: firstProd ? firstProd.priceStudent : 0,
        productId: firstProd?.id,
        code: firstProd?.code,
      },
    ]);
  };

  const handleRemoveItem = (index: number) => {
    if (selectedItems.length <= 1) return;
    setSelectedItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleProductSelect = (index: number, productId: string) => {
    const prod = products.find((p) => p.id === productId);
    if (!prod) return;

    setSelectedItems((prev) =>
      prev.map((item, i) => {
        if (i === index) {
          return {
            ...item,
            productId: prod.id,
            code: prod.code,
            name: prod.name,
            type: prod.category,
            priceKopkar: prod.priceKopkar,
            feeSchool: prod.feeSchool,
            priceStudent: prod.priceStudent,
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

  const resetCreateForm = (phase: 'Tahap 1' | 'Tahap 2' | 'Tambahan') => {
    const defaultLevel = user?.schoolLevel || 'SMP';
    setOrderLevelFilter(defaultLevel);
    setOrderPhase(phase);
    const cat = getProductsByLevel(defaultLevel);
    
    // Bulk fill all products for Tahap 1/2
    if (phase !== 'Tambahan' && cat.length > 0) {
      setSelectedItems(cat.map(prod => ({
        name: prod.name,
        type: prod.category,
        quantity: 0,
        priceKopkar: prod.priceKopkar,
        feeSchool: prod.feeSchool,
        priceStudent: prod.priceStudent,
        productId: prod.id,
        code: prod.code,
      })));
    } else {
      setSelectedItems([]);
    }
    setNotes('');
    setFormError('');
  };

  const handleCreateSubmit = (e: FormEvent) => {
    e.preventDefault();
    setFormError('');

    // Filter out items with 0 quantity if it's Tahap 1/2
    const itemsToSubmit = selectedItems.filter(it => it.quantity > 0);

    if (itemsToSubmit.length === 0) {
      setFormError('Pilih minimal 1 item barang dengan kuantitas > 0');
      return;
    }

    for (const item of itemsToSubmit) {
      if (!item.name.trim()) {
        setFormError('Nama item tidak boleh kosong');
        return;
      }
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
          <h2>School Area Dashboard</h2>
          <div className="school-welcome">
            Selamat datang, <strong>{user?.name}</strong> ({user?.schoolName || 'Akun Sekolah'})
            {user?.schoolLevel && (
              <span className={`badge-level ${user.schoolLevel}`} style={{ marginLeft: '8px' }}>
                Jenjang {user.schoolLevel}
              </span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
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
            
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <button 
                className="btn-primary" 
                onClick={() => { resetCreateForm('Tambahan'); setShowCreateModal(true); }}
                style={{ padding: '8px 12px' }}
              >
                + Buat Pesanan
              </button>
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
                                {it.name} (<strong>{it.quantity} pcs</strong>)
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
                                {it.name} ({it.quantity} pcs)
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
                            {it.name} ({it.quantity} pcs)
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
                                {it.name} ({it.quantity} pcs)
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
                            {it.name} ({it.quantity} pcs)
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
                      if (orderPhase !== 'Tambahan') {
                        setSelectedItems(cat.map(prod => ({
                          name: prod.name,
                          type: prod.category,
                          quantity: 0,
                          priceKopkar: prod.priceKopkar,
                          feeSchool: prod.feeSchool,
                          priceStudent: prod.priceStudent,
                          productId: prod.id,
                          code: prod.code,
                        })));
                      }
                    }}
                  >
                    <option value="TK">Jenjang TK</option>
                    <option value="SD">Jenjang SD</option>
                    <option value="SMP">Jenjang SMP</option>
                    <option value="SMA">Jenjang SMA</option>
                    <option value="SEMUA">Semua Jenjang</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Fase Pemesanan</label>
                  <select
                    value={orderPhase}
                    onChange={(e) => {
                      const p = e.target.value as 'Tahap 1' | 'Tahap 2' | 'Tambahan';
                      setOrderPhase(p);
                      const cat = getProductsByLevel(orderLevelFilter);
                      if (p !== 'Tambahan') {
                        setSelectedItems(cat.map(prod => ({
                          name: prod.name,
                          type: prod.category,
                          quantity: 0,
                          priceKopkar: prod.priceKopkar,
                          feeSchool: prod.feeSchool,
                          priceStudent: prod.priceStudent,
                          productId: prod.id,
                          code: prod.code,
                        })));
                      } else {
                        const firstProd = cat[0] || products[0];
                        setSelectedItems([{
                          name: firstProd ? firstProd.name : 'Seragam',
                          type: firstProd ? firstProd.category : 'seragam',
                          quantity: 1,
                          priceKopkar: firstProd ? firstProd.priceKopkar : 80000,
                          feeSchool: firstProd ? firstProd.feeSchool : 15000,
                          priceStudent: firstProd ? firstProd.priceStudent : 95000,
                          productId: firstProd?.id,
                          code: firstProd?.code,
                        }]);
                      }
                    }}
                  >
                    <option value="Tahap 1">Tahap 1</option>
                    <option value="Tahap 2">Tahap 2</option>
                    <option value="Tambahan">Tambahan</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label>Pilih Barang dari Katalog Jenjang {orderLevelFilter}:</label>

                <div className="school-order-items-table">
                  {selectedItems.map((item, index) => (
                    <div key={index} className="school-order-row">
                      <div style={{ flexGrow: 1 }}>
                        {orderPhase !== 'Tambahan' ? (
                           <div style={{ padding: '8px 12px', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '6px' }}>
                             <strong>{item.name}</strong> — Harga Siswa: {formatRupiah(item.priceStudent)}
                           </div>
                        ) : (
                          <select
                            className="product-select"
                            value={item.productId || ''}
                            onChange={(e) => handleProductSelect(index, e.target.value)}
                          >
                            <option value="">-- Pilih Barang dari Katalog --</option>
                            {availableCatalog.map((prod) => (
                              <option key={prod.id} value={prod.id}>
                                [{prod.level}] {prod.name} — Harga Siswa: {formatRupiah(prod.priceStudent)} (Fee: +{formatRupiah(prod.feeSchool)})
                              </option>
                            ))}
                          </select>
                        )}
                      </div>

                      <div style={{ width: '100px' }}>
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

                      {orderPhase === 'Tambahan' && selectedItems.length > 1 && (
                        <button
                          type="button"
                          className="btn-remove-item"
                          onClick={() => handleRemoveItem(index)}
                          title="Hapus baris"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                {orderPhase === 'Tambahan' && (
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
                    disabled={(orderPhase === 'Tahap 1' && (!phase1Open || hasPhase1Order)) || (orderPhase === 'Tahap 2' && (!phase2Open || hasPhase2Order))}
                    style={((orderPhase === 'Tahap 1' && (!phase1Open || hasPhase1Order)) || (orderPhase === 'Tahap 2' && (!phase2Open || hasPhase2Order))) ? { background: '#94a3b8', cursor: 'not-allowed' } : {}}
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
                      <li key={idx} style={{ padding: '6px 0', borderBottom: '1px dashed #e2e8f0', fontSize: '0.88rem' }}>
                        <span className={`item-type ${it.type}`} style={{ marginRight: '8px' }}>{it.type}</span>
                        <strong>{it.name}</strong> — {it.quantity} pcs
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
                {!isAllowedToInput && (
                  <div style={{ padding: '12px 16px', background: '#fef9c3', borderLeft: '4px solid #eab308', borderRadius: '4px', fontSize: '0.9rem', color: '#854d0e', marginBottom: '16px' }}>
                    <strong>Tombol "Pesan Sekarang" Dikunci:</strong> Hari ini BUKAN jadwal jenjang {user?.schoolLevel} untuk memesan. 
                    (Jadwal: TK=Senin, SD=Selasa, SMP=Rabu, SMA=Kamis).
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
                  <div style={{ display: 'flex', gap: '12px' }}>
                    <button 
                      type="submit" 
                      className="btn-primary"
                      disabled={!isAllowedToInput || cartItems.length === 0}
                      style={(!isAllowedToInput || cartItems.length === 0) ? { background: '#94a3b8', cursor: 'not-allowed' } : {}}
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

export default SchoolDashboard;
