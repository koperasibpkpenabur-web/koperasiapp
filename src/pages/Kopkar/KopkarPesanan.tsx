// @ts-nocheck
import { useState, useEffect, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useOrders } from '../../context/OrderContext';
import { useReturns } from '../../context/ReturnContext';
import type { Order, ShippingInfo } from '../../types';
import SuratJalanPrint from './SuratJalanPrint';
import './kopkar.css';

const KopkarPelunasan = () => {
  const { user } = useAuth();
  const { pendingCount: pendingReturnsCount } = useReturns();
  const {
    orders,
    approveOrder,
    rejectOrder,
    shipOrder,
    cancelShipment,
    approveCancelOrder,
    kopkarCancelOrder,
    markOrderAsPaid,
    disburseSchoolFee,
  } = useOrders();

  // 3 Tabs: 'active' (Berjalan), 'received' (History Diterima/Selesai), 'cancellations' (Riwayat Pembatalan)
  const [activeTab, setActiveTab] = useState<'active' | 'received' | 'cancellations'>('active');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [paymentFilter, setPaymentFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Rejection modal (initial reject for pending order)
  const [rejectingOrder, setRejectingOrder] = useState<Order | null>(null);
  const [rejectionReason, setRejectionReason] = useState<string>('');

  // Shipping modal
  const [shippingOrder, setShippingOrder] = useState<Order | null>(null);
  const [shipDate, setShipDate] = useState<string>('');
  const [shipTime, setShipTime] = useState<string>('');
  const [courierNotes, setCourierNotes] = useState<string>('');
  const [shipError, setShipError] = useState<string>('');
  const [shippedQuantities, setShippedQuantities] = useState<number[]>([]);

  // Kopkar cancellation modal (cancelling an approved order)
  const [cancellingApprovedOrder, setCancellingApprovedOrder] = useState<Order | null>(null);
  const [kopkarCancelReason, setKopkarCancelReason] = useState<string>('');
  const [cancelError, setCancelError] = useState<string>('');

  // Pelunasan modal
  const [payingOrder, setPayingOrder] = useState<Order | null>(null);
  const [payNotes, setPayNotes] = useState<string>('');

  // Disburse Fee modal
  const [disbursingOrder, setDisbursingOrder] = useState<Order | null>(null);
  const [disburseNotes, setDisburseNotes] = useState<string>('');

  // Print Order state
  const [printingOrder, setPrintingOrder] = useState<Order | null>(null);

  useEffect(() => {
    if (printingOrder) {
      const timer = setTimeout(() => {
        window.print();
        setPrintingOrder(null);
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [printingOrder]);

  // 1. Pesanan Berjalan: pending, approved, shipped
  const activeOrders = orders.filter(
    (o) => o.status === 'pending' || o.status === 'approved' || o.status === 'shipped'
  );

  // 2. History Diterima (Selesai): received
  const receivedOrders = orders.filter((o) => o.status === 'received');

  // 3. History Pembatalan: cancellation_requested, cancelled, rejected
  const cancellationOrders = orders.filter(
    (o) => o.status === 'cancelled' || o.status === 'cancellation_requested' || o.status === 'rejected'
  );

  const pendingOrders = orders.filter((o) => o.status === 'pending').length;
  const shippedOrders = orders.filter((o) => o.status === 'shipped').length;
  const receivedCount = receivedOrders.length;
  const cancelRequestsCount = orders.filter((o) => o.status === 'cancellation_requested').length;

  // Financial aggregates
  const totalOmzetStudent = orders
    .filter((o) => o.status !== 'cancelled' && o.status !== 'rejected')
    .reduce((acc, o) => acc + (o.totalPriceStudent || 0), 0);

  const totalPaidRevenue = orders
    .filter((o) => o.paymentStatus === 'paid')
    .reduce((acc, o) => acc + (o.totalPriceStudent || 0), 0);

  const totalSchoolFeeToDisburse = orders
    .filter((o) => o.feeStatus === 'ready')
    .reduce((acc, o) => acc + (o.totalFeeSchool || 0), 0);

  // Phase summaries
  const countTahap1 = orders.filter(o => o.orderPhase === 'Tahap 1' && o.status !== 'cancelled' && o.status !== 'rejected').length;
  const countTahap2 = orders.filter(o => o.orderPhase === 'Tahap 2' && o.status !== 'cancelled' && o.status !== 'rejected').length;
  const countTambahan = orders.filter(o => o.orderPhase === 'Tambahan' && o.status !== 'cancelled' && o.status !== 'rejected').length;

  const filteredActiveOrders = activeOrders.filter((ord) => {
    const matchesStatus = statusFilter === 'all' || ord.status === statusFilter;
    const matchesPayment = paymentFilter === 'all' || ord.paymentStatus === paymentFilter;
    const matchesSearch =
      ord.schoolName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ord.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ord.items.some((it) => it.name.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesStatus && matchesPayment && matchesSearch;
  });

  const filteredReceivedOrders = receivedOrders.filter((ord) => {
    const matchesPayment = paymentFilter === 'all' || ord.paymentStatus === paymentFilter;
    const matchesSearch =
      ord.schoolName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ord.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ord.items.some((it) => it.name.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesPayment && matchesSearch;
  });

  const filteredCancellationOrders = cancellationOrders.filter((ord) => {
    return (
      ord.schoolName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ord.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ord.items.some((it) => it.name.toLowerCase().includes(searchQuery.toLowerCase()))
    );
  });

  // Approve Pending Order
  const handleApprove = (order: Order) => {
    const processorName = user ? user.name : 'Karyawan Koperasi';
    if (window.confirm(`Setujui pesanan ${order.id} dari "${order.schoolName}"?`)) {
      approveOrder(order.id, processorName);
    }
  };

  // Open initial reject modal
  const handleOpenRejectModal = (order: Order) => {
    setRejectingOrder(order);
    setRejectionReason('');
  };

  const handleConfirmReject = () => {
    if (!rejectingOrder) return;
    const processorName = user ? user.name : 'Karyawan Koperasi';
    rejectOrder(
      rejectingOrder.id,
      processorName,
      rejectionReason.trim() || 'Stok tidak mencukupi atau pesanan tidak sesuai'
    );
    setRejectingOrder(null);
    setRejectionReason('');
  };

  // Open Shipping Modal
  const handleOpenShipModal = (order: Order) => {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');

    setShippingOrder(order);
    setShipDate(todayStr);
    setShipTime(`${hours}:${minutes}`);
    setCourierNotes('Mobil Box Koperasi - Bpk. Supardi');
    setShipError('');
    setShippedQuantities(order.items.map(it => it.quantity));
  };

  const handleConfirmShip = (e: FormEvent) => {
    e.preventDefault();
    if (!shippingOrder) return;

    if (!shipDate || !shipTime) {
      setShipError('Tanggal dan jam kirim wajib diisi');
      return;
    }

    const stafName = user ? user.name : 'Karyawan Koperasi';
    const shippingData: ShippingInfo = {
      shippedAtDate: shipDate,
      shippedAtTime: shipTime,
      courierNotes: courierNotes.trim() || undefined,
      shippedBy: stafName,
      shippedItems: shippingOrder.items.map((it, idx) => ({
        name: it.name,
        type: it.type,
        shippedQty: shippedQuantities[idx]
      })),
    };

    shipOrder(shippingOrder.id, shippingData);
    setShippingOrder(null);
  };

  // Cancel Shipment
  const handleCancelShipment = (order: Order) => {
    if (window.confirm(`Batalkan pengiriman untuk pesanan ${order.id}? Status akan kembali menjadi Disetujui.`)) {
      cancelShipment(order.id);
    }
  };

  // Open Pelunasan Modal
  const handleOpenPaymentModal = (order: Order) => {
    setPayingOrder(order);
    setPayNotes('Pembayaran transfer Bank Mandiri Rekening Koperasi');
  };

  const handleConfirmPayment = (e: FormEvent) => {
    e.preventDefault();
    if (!payingOrder) return;

    markOrderAsPaid(payingOrder.id, payNotes.trim());
    setPayingOrder(null);
  };

  // Open Disburse Fee Modal
  const handleOpenDisburseModal = (order: Order) => {
    setDisbursingOrder(order);
    setDisburseNotes(`Transfer Fee Sekolah ke rekening ${order.schoolName}`);
  };

  const handleConfirmDisburse = (e: FormEvent) => {
    e.preventDefault();
    if (!disbursingOrder) return;

    const stafName = user ? user.name : 'Karyawan Koperasi';
    disburseSchoolFee(disbursingOrder.id, stafName, disburseNotes.trim());
    setDisbursingOrder(null);
  };

  // Open Kopkar Cancellation Modal
  const handleOpenKopkarCancelModal = (order: Order) => {
    setCancellingApprovedOrder(order);
    setKopkarCancelReason('');
    setCancelError('');
  };

  const handleConfirmKopkarCancel = (e: FormEvent) => {
    e.preventDefault();
    if (!cancellingApprovedOrder) return;

    if (!kopkarCancelReason.trim()) {
      setCancelError('Alasan pembatalan wajib diisi agar sekolah menerima pemberitahuan yang jelas');
      return;
    }

    const stafName = user ? user.name : 'Karyawan Koperasi';
    kopkarCancelOrder(cancellingApprovedOrder.id, kopkarCancelReason.trim(), stafName);
    setCancellingApprovedOrder(null);
  };

  // Approve Cancellation Request from School
  const handleApproveSchoolCancel = (order: Order) => {
    const stafName = user ? user.name : 'Karyawan Koperasi';
    if (window.confirm(`Setujui permintaan pembatalan pesanan ${order.id} dari "${order.schoolName}"?`)) {
      approveCancelOrder(order.id, stafName);
    }
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

  const getFormattedOrderId = (order: Order) => {
    const sortedOrders = [...orders].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    const index = sortedOrders.findIndex(o => o.id === order.id);
    const num = (index + 1).toString().padStart(3, '0');
    const year = new Date(order.createdAt).getFullYear();
    let baseId = `ORD-${year}-${num}`;
    if (order.status === 'cancelled' || order.status === 'cancellation_requested' || order.status === 'rejected') {
      baseId += '-BTL';
    }
    return baseId;
  };

  return (
    <div className="kopkar-dashboard">
      <h2>Pengelolaan Pesanan</h2>


      {/* Operational Highlights */}
      <div className="kopkar-stats operational-stats">
        <div className="kopkar-stat-card summary-card">
          <div className="stat-icon">📋</div>
          <div className="stat-label">Menunggu Persetujuan</div>
          <div className="stat-value warning">{pendingOrders}</div>
        </div>
        <div className="kopkar-stat-card summary-card">
          <div className="stat-icon">🚚</div>
          <div className="stat-label">Sedang Dikirim</div>
          <div className="stat-value info">{shippedOrders}</div>
        </div>
        <div className="kopkar-stat-card summary-card">
          <div className="stat-icon">🚫</div>
          <div className="stat-label">Pengajuan Batal</div>
          <div className="stat-value danger">{cancelRequestsCount}</div>
        </div>
      </div>
      {/* 3 Tabs Navigation */}
      <div className="dashboard-tabs">
        <button
          className={`tab-button ${activeTab === 'active' ? 'active' : ''}`}
          onClick={() => setActiveTab('active')}
        >
          💰 Tagihan Berjalan ({activeOrders.length})
        </button>
        <button
          className={`tab-button ${activeTab === 'received' ? 'active' : ''}`}
          onClick={() => setActiveTab('received')}
        >
          ✅ Riwayat Selesai ({receivedCount})
        </button>
      </div>

      {/* TAB 1: PESANAN BERJALAN */}
      {activeTab === 'active' && (
        <div className="tab-pane">
          <div className="kopkar-toolbar">
            <h3>Daftar Pesanan Berjalan</h3>
            <div className="kopkar-filters">
              <input
                type="text"
                placeholder="Cari sekolah atau item..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="all">Semua Status</option>
                <option value="pending">Menunggu Persetujuan</option>
                <option value="approved">Disetujui (Siap Kirim)</option>
                <option value="shipped">Sedang Dikirim</option>
              </select>
              <select value={paymentFilter} onChange={(e) => setPaymentFilter(e.target.value)}>
                <option value="all">Semua Pembayaran</option>
                <option value="unpaid">Belum Lunas</option>
                <option value="paid">Lunas</option>
              </select>
            </div>
          </div>

          {filteredActiveOrders.length > 0 ? (
            <>
              {/* Desktop Table View */}
              <div className="kopkar-table-container desktop-table-view">
                <table className="kopkar-table">
                  <thead>
                    <tr>
                      <th>ID Order</th>
                      <th>Sekolah</th>
                      <th>Daftar Item</th>
                      <th>Rincian Harga</th>
                      <th>Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredActiveOrders.map((order) => (
                      <tr key={order.id}>
                        <td>
                          <strong>{getFormattedOrderId(order)}</strong>
                          <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px' }}>
                            {formatDate(order.createdAt)}
                          </div>
                        </td>
                        <td>
                          <div style={{ fontWeight: 600, color: '#1e293b' }}>
                            {order.schoolName}
                          </div>
                          {order.schoolLevel && (
                            <span className={`badge-level ${order.schoolLevel}`}>
                              {order.schoolLevel}
                            </span>
                          )}
                        </td>
                        <td>
                          <ul className="order-items-list" style={{ gap: '8px', display: 'flex', flexDirection: 'column' }}>
                            {order.items.map((it, idx) => {
                              const shippedIt = order.shippingInfo?.shippedItems?.find(si => si.name === it.name && si.type === it.type);
                              const shippedQty = shippedIt ? shippedIt.shippedQty : (order.status === 'received' || order.status === 'shipped' ? it.quantity : 0);
                              const unsentQty = Math.max(0, it.quantity - shippedQty);
                              return (
                              <li key={idx}>
                                <div style={{ fontWeight: 600 }}>{it.name}</div>
                                <div style={{ fontSize: '0.8rem', color: '#475569' }}>
                                  Pesan: {it.quantity}, Terkirim: {shippedQty}, Belum dikirim: {unsentQty}
                                </div>
                              </li>
                            )})}
                          </ul>
                        </td>
                        <td>
                          <div style={{ fontSize: '0.85rem', marginBottom: '8px' }}>
                            <div>
                              <span style={{ color: '#64748b' }}>Harga Siswa (Masuk):</span>{' '}
                              <strong>{formatRupiah(order.totalPriceStudent)}</strong>
                            </div>
                            <div>
                              <span style={{ color: '#64748b' }}>Hak Koperasi:</span>{' '}
                              <span style={{ color: '#1e40af', fontWeight: 600 }}>{formatRupiah(order.totalPriceKopkar)}</span>
                            </div>
                            <div>
                              <span style={{ color: '#64748b' }}>Fee Sekolah:</span>{' '}
                              <span style={{ color: '#059669', fontWeight: 600 }}>+{formatRupiah(order.totalFeeSchool)}</span>
                            </div>
                          </div>
                          {order.paymentStatus === 'paid' ? (
                            <div>
                              <span className="badge-pay-paid">✅ Lunas Diterima</span>
                              {order.paidAt && (
                                <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>
                                  {formatDate(order.paidAt)}
                                </div>
                              )}
                            </div>
                          ) : (
                            <div>
                              <span className="badge-pay-unpaid">🔴 Belum Lunas</span>
                              <button
                                className="btn-pay-action"
                                style={{ marginTop: '6px' }}
                                onClick={() => handleOpenPaymentModal(order)}
                              >
                                💵 Konfirmasi Pelunasan
                              </button>
                            </div>
                          )}
                        </td>

                        <td>
                          <div className="kopkar-actions-col">
                            {order.status === 'pending' && (
                              <div className="action-buttons">
                                <button className="btn-approve" onClick={() => handleApprove(order)}>
                                  ✓ Setujui
                                </button>
                                <button className="btn-reject" onClick={() => handleOpenRejectModal(order)}>
                                  ✕ Tolak
                                </button>
                              </div>
                            )}

                            {order.status === 'approved' && (
                              <div className="action-buttons-wrap">
                                <button className="btn-ship" onClick={() => handleOpenShipModal(order)}>
                                  🚚 Kirim Barang
                                </button>
                                <button className="btn-secondary" style={{ padding: '6px 12px', fontSize: '0.82rem' }} onClick={() => setPrintingOrder(order)}>
                                  🖨️ Cetak Surat Jalan
                                </button>
                                <button className="btn-cancel-approved" onClick={() => handleOpenKopkarCancelModal(order)}>
                                  ⚠️ Batalkan
                                </button>
                              </div>
                            )}

                            {order.status === 'shipped' && (
                              <div style={{ fontSize: '0.8rem', color: '#2563eb' }}>
                                Barang sedang diantar ke sekolah.
                                {order.shippingInfo?.shippedItems && order.items.some((it) => {
                                  const shippedIt = order.shippingInfo!.shippedItems!.find(si => si.name === it.name && si.type === it.type);
                                  return shippedIt && shippedIt.shippedQty < it.quantity;
                                }) && (
                                  <div style={{ marginTop: '4px', color: '#dc2626', fontWeight: 600 }}>
                                    ⚠️ Terdapat barang yang belum dikirim!
                                  </div>
                                )}
                                <div style={{ marginTop: '8px' }}>
                                  <button className="btn-secondary" style={{ padding: '4px 8px', fontSize: '0.75rem', color: '#dc2626', borderColor: '#fca5a5' }} onClick={() => handleCancelShipment(order)}>
                                    Batal Kirim (Revert)
                                  </button>
                                </div>
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
                {filteredActiveOrders.map((order) => (
                  <div key={order.id} className="mobile-order-card">
                    <div className="mobile-card-header">
                      <div>
                        <span className="mobile-order-id">{getFormattedOrderId(order)}</span>
                        <div style={{ fontWeight: 700, color: '#1e293b' }}>{order.schoolName}</div>
                      </div>
                      <span className={`status-badge ${order.status}`}>
                        {order.status === 'pending' && 'ΓÅ│ Menunggu'}
                        {order.status === 'approved' && '👍 Disetujui'}
                        {order.status === 'shipped' && '🚚 Dikirim'}
                      </span>
                    </div>

                    <div className="mobile-items-box">
                      <div className="mobile-label">Item:</div>
                      <ul className="order-items-list">
                        {order.items.map((it, idx) => {
                          const shippedIt = order.shippingInfo?.shippedItems?.find(si => si.name === it.name && si.type === it.type);
                          const shippedQty = shippedIt ? shippedIt.shippedQty : (order.status === 'received' || order.status === 'shipped' ? it.quantity : 0);
                          const unsentQty = Math.max(0, it.quantity - shippedQty);
                          return (
                          <li key={idx}>
                            <div style={{ fontWeight: 600 }}>{it.name}</div>
                            <div style={{ fontSize: '0.8rem', color: '#475569' }}>
                              Pesan: {it.quantity}, Terkirim: {shippedQty}, Belum dikirim: {unsentQty}
                            </div>
                          </li>
                        )})}
                      </ul>
                    </div>

                    <div className="mobile-price-summary">
                      <div>
                        <span className="price-sub-label">Harga Siswa:</span>
                        <strong>{formatRupiah(order.totalPriceStudent)}</strong>
                      </div>
                      <div>
                        <span className="price-sub-label">Fee Sekolah:</span>
                        <strong style={{ color: '#059669' }}>+{formatRupiah(order.totalFeeSchool)}</strong>
                      </div>
                    </div>

                    <div style={{ marginTop: '6px' }}>
                      {order.paymentStatus === 'paid' ? (
                        <span className="badge-pay-paid">✅ Lunas</span>
                      ) : (
                        <button
                          className="btn-pay-action full-width-touch"
                          onClick={() => handleOpenPaymentModal(order)}
                        >
                          💵 Konfirmasi Pelunasan Sekolah
                        </button>
                      )}
                    </div>

                    <div className="mobile-card-actions">
                      {order.status === 'pending' && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                          <button className="btn-approve full-width-touch" onClick={() => handleApprove(order)}>
                            ✓ Setujui
                          </button>
                          <button className="btn-reject full-width-touch" onClick={() => handleOpenRejectModal(order)}>
                            ✕ Tolak
                          </button>
                        </div>
                      )}

                      {order.status === 'approved' && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '8px' }}>
                          <button className="btn-ship full-width-touch" onClick={() => handleOpenShipModal(order)}>
                            🚚 Kirim Barang
                          </button>
                          <button className="btn-secondary full-width-touch" onClick={() => setPrintingOrder(order)}>
                            🖨️ Cetak Surat Jalan
                          </button>
                          <button className="btn-cancel-approved full-width-touch" onClick={() => handleOpenKopkarCancelModal(order)}>
                            ⚠️ Batalkan
                          </button>
                        </div>
                      )}

                      {order.status === 'shipped' && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '8px' }}>
                          <button className="btn-secondary full-width-touch" style={{ color: '#dc2626', borderColor: '#fca5a5' }} onClick={() => handleCancelShipment(order)}>
                            Batal Kirim (Revert)
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="kopkar-empty">
              <p>Tidak ada pesanan aktif yang sesuai filter.</p>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: HISTORY PEMESANAN DITERIMA & PENCAIRAN FEE SEKOLAH */}
      {activeTab === 'received' && (
        <div className="tab-pane">
          <div className="kopkar-toolbar">
            <h3>Riwayat Pesanan Selesai Diterima & Pembayaran Fee Sekolah</h3>
            <div className="kopkar-filters">
              <input
                type="text"
                placeholder="Cari sekolah atau item..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <select value={paymentFilter} onChange={(e) => setPaymentFilter(e.target.value)}>
                <option value="all">Semua Pembayaran</option>
                <option value="unpaid">Belum Lunas</option>
                <option value="paid">Lunas</option>
              </select>
            </div>
          </div>

          {filteredReceivedOrders.length > 0 ? (
            <>
              {/* Desktop Table View */}
              <div className="kopkar-table-container desktop-table-view">
                <table className="kopkar-table">
                  <thead>
                    <tr>
                      <th>ID & Sekolah</th>
                      <th>Total Tagihan Siswa</th>
                      <th>Hak Fee Sekolah</th>
                      <th>Status Pelunasan Sekolah</th>
                      <th>Pencairan Fee ke Sekolah</th>
                      <th>Penerima di Sekolah</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredReceivedOrders.map((order) => (
                      <tr key={order.id}>
                        <td>
                          <strong>{getFormattedOrderId(order)}</strong>
                          <div style={{ fontWeight: 600, color: '#1e293b' }}>{order.schoolName}</div>
                          <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{formatDate(order.createdAt)}</div>
                        </td>
                        <td>
                          <strong>{formatRupiah(order.totalPriceStudent)}</strong>
                          <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                            Modal Kopkar: {formatRupiah(order.totalPriceKopkar)}
                          </div>
                        </td>
                        <td>
                          <strong style={{ color: '#059669' }}>+{formatRupiah(order.totalFeeSchool)}</strong>
                        </td>
                        <td>
                          {order.paymentStatus === 'paid' ? (
                            <div>
                              <span className="badge-pay-paid">✅ Lunas</span>
                              {order.paidAt && (
                                <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '2px' }}>
                                  {formatDate(order.paidAt)}
                                </div>
                              )}
                            </div>
                          ) : (
                            <div>
                              <span className="badge-pay-unpaid">🔴 Belum Lunas</span>
                              <button
                                className="btn-pay-action"
                                style={{ marginTop: '6px' }}
                                onClick={() => handleOpenPaymentModal(order)}
                              >
                                💵 Konfirmasi Pelunasan
                              </button>
                            </div>
                          )}
                        </td>
                        <td>
                          {/* Logika Pencairan Fee Sekolah */}
                          {order.feeStatus === 'disbursed' && (
                            <div>
                              <span className="badge-fee-disbursed">💰 Fee Telah Ditransfer</span>
                              <div style={{ fontSize: '0.72rem', color: '#047857', marginTop: '2px' }}>
                                Oleh: {order.feeDisbursedBy}
                              </div>
                            </div>
                          )}

                          {order.feeStatus === 'ready' && (
                            <div>
                              <div className="badge-fee-ready">ΓÅ│ Siap Ditransfer</div>
                              <button
                                className="btn-disburse-action"
                                style={{ marginTop: '6px' }}
                                onClick={() => handleOpenDisburseModal(order)}
                              >
                                💸 Bayarkan Fee ({formatRupiah(order.totalFeeSchool)})
                              </button>
                            </div>
                          )}

                          {order.feeStatus === 'locked' && (
                            <div className="badge-fee-locked">
                              🔒 Kunci (Tunggu Sekolah Lunas)
                            </div>
                          )}
                        </td>
                        <td>
                          {order.receiveInfo ? (
                            <div className="receive-info-box">
                              <div><strong>{order.receiveInfo.receivedBy}</strong></div>
                              <div style={{ fontSize: '0.75rem' }}>{formatDate(order.receiveInfo.receivedAt)}</div>
                            </div>
                          ) : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Card View */}
              <div className="mobile-cards-view">
                {filteredReceivedOrders.map((order) => (
                  <div key={order.id} className="mobile-order-card completed-card">
                    <div className="mobile-card-header">
                      <div>
                        <span className="mobile-order-id">{getFormattedOrderId(order)}</span>
                        <div style={{ fontWeight: 700, color: '#1e293b' }}>{order.schoolName}</div>
                      </div>
                      <span className="status-badge received">Γ£à Diterima</span>
                    </div>

                    <div className="mobile-price-summary">
                      <div>
                        <span className="price-sub-label">Harga Siswa:</span>
                        <strong>{formatRupiah(order.totalPriceStudent)}</strong>
                      </div>
                      <div>
                        <span className="price-sub-label">Fee Sekolah:</span>
                        <strong style={{ color: '#059669' }}>+{formatRupiah(order.totalFeeSchool)}</strong>
                      </div>
                    </div>

                    {/* Financial Status Mobile */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '6px' }}>
                      {order.paymentStatus === 'paid' ? (
                        <div className="badge-pay-paid">✅ Sekolah Telah Melunasi Tagihan</div>
                      ) : (
                        <div>
                          <div className="badge-pay-unpaid">🔴 Sekolah Belum Melunasi</div>
                          <button
                            className="btn-pay-action full-width-touch"
                            style={{ marginTop: '6px' }}
                            onClick={() => handleOpenPaymentModal(order)}
                          >
                            💵 Konfirmasi Pelunasan Sekolah
                          </button>
                        </div>
                      )}

                      {order.feeStatus === 'disbursed' ? (
                        <div className="badge-fee-disbursed">💰 Fee Sekolah Telah Dibayarkan</div>
                      ) : order.feeStatus === 'ready' ? (
                        <button
                          className="btn-disburse-action full-width-touch"
                          onClick={() => handleOpenDisburseModal(order)}
                        >
                          💸 Bayarkan Fee Sekolah ({formatRupiah(order.totalFeeSchool)})
                        </button>
                      ) : (
                        <div className="badge-fee-locked">🔒 Fee Sekolah Cair Setelah Pelunasan</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="kopkar-empty">
              <p>Tidak ada riwayat pesanan yang selesai.</p>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: HISTORY PEMBATALAN */}
      {activeTab === 'cancellations' && (
        <div className="tab-pane">
          <div className="kopkar-toolbar">
            <h3>Riwayat Pembatalan & Permintaan Batal Sekolah</h3>
          </div>

          {filteredCancellationOrders.length > 0 ? (
            <div className="kopkar-table-container desktop-table-view">
              <table className="kopkar-table">
                <thead>
                  <tr>
                    <th>ID & Sekolah</th>
                    <th>Daftar Item</th>
                    <th>Status</th>
                    <th>Pihak Pembatal</th>
                    <th>Alasan Pembatalan</th>
                    <th>Waktu</th>
                    <th>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCancellationOrders.map((order) => (
                    <tr key={order.id}>
                      <td>
                        <strong>{order.id}</strong>
                        <div style={{ fontWeight: 600, color: '#334155' }}>{order.schoolName}</div>
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
                        {order.status === 'cancellation_requested' && (
                          <span className="status-badge requested">ΓÅ│ Request Batal</span>
                        )}
                        {order.status === 'cancelled' && (
                          <span className="status-badge cancelled">🚫 Dibatalkan</span>
                        )}
                        {order.status === 'rejected' && (
                          <span className="status-badge rejected">❌ Ditolak</span>
                        )}
                      </td>
                      <td>
                        {order.cancellationInfo?.cancelledByName || 'Koperasi'}
                      </td>
                      <td>
                        <div className="reason-text-box">
                          {order.cancellationInfo?.reason || order.rejectionReason || 'Tidak ada alasan'}
                        </div>
                      </td>
                      <td>
                        {formatDate(order.cancellationInfo?.cancelledAt || order.createdAt)}
                      </td>
                      <td>
                        {order.status === 'cancellation_requested' && (
                          <button
                            className="btn-approve-cancel"
                            onClick={() => handleApproveSchoolCancel(order)}
                          >
                            ✓ Setujui Batal
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="kopkar-empty">
              <p>Tidak ada riwayat pembatalan pesanan.</p>
            </div>
          )}
        </div>
      )}

      {/* Modal Input Pengiriman Barang */}
      {shippingOrder && (
        <div className="modal-overlay" onClick={() => setShippingOrder(null)}>
          <div className="modal" style={{ maxWidth: '500px' }} onClick={(e) => e.stopPropagation()}>
            <h3>🚚 Input Pengiriman Barang</h3>
            <p style={{ fontSize: '0.88rem', color: '#64748b', marginBottom: '14px' }}>
              Pesanan No: <strong>{shippingOrder.id}</strong> ({shippingOrder.schoolName})
            </p>

            <form className="modal-form" onSubmit={handleConfirmShip}>
              {shipError && <div className="modal-error">{shipError}</div>}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div className="form-group">
                  <label htmlFor="shipDate">Tanggal Kirim *</label>
                  <input
                    id="shipDate"
                    type="date"
                    value={shipDate}
                    onChange={(e) => setShipDate(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="shipTime">Jam Kirim *</label>
                  <input
                    id="shipTime"
                    type="time"
                    value={shipTime}
                    onChange={(e) => setShipTime(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="courierNotes">Armada Pengiriman / Nama Kurir</label>
                <input
                  id="courierNotes"
                  type="text"
                  placeholder="Contoh: Mobil Box Koperasi (B 1234 CD) - Sopir Pak Joko"
                  value={courierNotes}
                  onChange={(e) => setCourierNotes(e.target.value)}
                />
              </div>

              <div className="form-group" style={{ marginTop: '14px' }}>
                <label>Kuantitas yang Dikirim</label>
                <div style={{ maxHeight: '180px', overflowY: 'auto', border: '1px solid #cbd5e1', padding: '10px', borderRadius: '4px' }}>
                  {shippingOrder.items.map((it, idx) => (
                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span style={{ fontSize: '0.85rem' }}>{it.name} (Pesan: {it.quantity})</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <input 
                          type="number" 
                          min="0" 
                          max={it.quantity}
                          value={shippedQuantities[idx]}
                          onChange={(e) => {
                            const newQties = [...shippedQuantities];
                            newQties[idx] = parseInt(e.target.value) || 0;
                            setShippedQuantities(newQties);
                          }}
                          style={{ width: '80px', padding: '4px' }}
                        />
                        <span style={{ fontSize: '0.85rem' }}>pcs</span>
                      </div>
                    </div>
                  ))}
                </div>
                <p style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px' }}>
                  Ubah jumlah di atas jika pesanan dikirim sebagian.
                </p>
              </div>

              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setShippingOrder(null)}>
                  Batal
                </button>
                <button type="submit" className="btn-ship">
                  Γ£ô Konfirmasi Kirim Barang
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Batalkan Pesanan Approved */}
      {cancellingApprovedOrder && (
        <div className="modal-overlay" onClick={() => setCancellingApprovedOrder(null)}>
          <div className="modal" style={{ maxWidth: '480px' }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ color: '#dc2626' }}>⚠️ Batalkan Pesanan</h3>
            <p style={{ fontSize: '0.88rem', color: '#64748b', marginBottom: '14px' }}>
              Pesanan: <strong>{cancellingApprovedOrder.id}</strong> — {cancellingApprovedOrder.schoolName}
            </p>

            <form className="modal-form" onSubmit={handleConfirmKopkarCancel}>
              {cancelError && <div className="modal-error">{cancelError}</div>}

              <div className="form-group">
                <label>Alasan Pembatalan Koperasi *</label>
                <textarea
                  value={kopkarCancelReason}
                  onChange={(e) => setKopkarCancelReason(e.target.value)}
                  rows={4}
                  required
                  autoFocus
                />
              </div>

              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setCancellingApprovedOrder(null)}>
                  Kembali
                </button>
                <button type="submit" className="btn-reject">
                  Konfirmasi Batalkan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Initial Reject Modal */}
      {rejectingOrder && (
        <div className="modal-overlay" onClick={() => setRejectingOrder(null)}>
          <div className="modal reject-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Tolak Pesanan {rejectingOrder.id}</h3>
            <p style={{ fontSize: '0.88rem', color: '#64748b', marginBottom: '14px' }}>
              Pesanan dari: <strong>{rejectingOrder.schoolName}</strong>
            </p>
            <div className="form-group">
              <label>Alasan Penolakan:</label>
              <textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                autoFocus
              />
            </div>
            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={() => setRejectingOrder(null)}>
                Batal
              </button>
              <button type="button" className="btn-reject" onClick={handleConfirmReject}>
                Konfirmasi Tolak
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Print Only Surat Jalan */}
      <SuratJalanPrint order={printingOrder} />
    </div>
  );
};

export default KopkarPelunasan;
