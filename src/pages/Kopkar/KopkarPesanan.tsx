// @ts-nocheck
import { useState, useEffect, useCallback, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useOrders } from '../../context/OrderContext';
import { useReturns } from '../../context/ReturnContext';
import { supabase } from '../../lib/supabase';
import type { Order, ShippingInfo } from '../../types';
import { playOrderNotificationSound } from '../../utils/sound';
import SuratJalanPrint from './SuratJalanPrint';
import { generateSuratJalanExcel } from '../../utils/excelGenerator';
import { resolveItemUnit } from '../../utils/formatUnit';
import { getWibDateString, getWibTimeString } from '../../utils/dateWib';
import { findMatchingOrderLine } from '../../utils/orderItemMatch';
import './kopkar.css';

const KopkarPesanan = () => {
  const { user } = useAuth();
  const { pendingCount: pendingReturnsCount } = useReturns();
  const [orders, setOrders] = useState<any[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});

  const toggleExpand = (orderId: string) => {
    setExpandedItems(prev => ({ ...prev, [orderId]: !prev[orderId] }));
  };

  const [isNotifEnabled, setIsNotifEnabled] = useState<boolean>(() => {
    const saved = localStorage.getItem('kopkar_order_notif_enabled');
    return saved === null ? true : saved === 'true';
  });

  const handleToggleNotif = () => {
    setIsNotifEnabled((prev) => {
      const next = !prev;
      localStorage.setItem('kopkar_order_notif_enabled', String(next));
      window.dispatchEvent(new CustomEvent('kopkar-notif-toggle', { detail: next }));
      if (next) {
        playOrderNotificationSound();
      }
      return next;
    });
  };

  const fetchOrders = useCallback(async (silent = false) => {
    if (!silent) setLoadingOrders(true);
    
    // Pagination bertahap (range) agar tidak terpotong batas default 1.000 baris Supabase
    const PAGE_SIZE = 1000;
    let allRows: any[] = [];
    let from = 0;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabase
        .from('orders')
        .select('*, order_items(*)')
        .order('created_at', { ascending: false })
        .range(from, from + PAGE_SIZE - 1);

      if (error) {
        console.error('Error fetching orders:', error);
        break;
      }

      if (data && data.length > 0) {
        allRows = allRows.concat(data);
        if (data.length < PAGE_SIZE) {
          hasMore = false;
        } else {
          from += PAGE_SIZE;
        }
      } else {
        hasMore = false;
      }
    }

    setOrders(allRows.map((row: any) => ({
      id: row.id,
      schoolUserId: row.school_user_id,
      schoolName: row.school_name,
      schoolLevel: row.school_level,
      orderPhase: row.order_phase,
      items: (row.order_items || []).map((it: any) => ({
        id: it.id,
        productId: it.product_id,
        name: it.name,
        type: it.type,
        size: it.size,
        gender: it.gender,
        unit: it.unit || resolveItemUnit(it, it.quantity),
        quantity: it.quantity,
        priceKopkar: Number(it.price_kopkar),
        feeSchool: Number(it.fee_school),
        priceStudent: Number(it.price_student),
      })),
      totalPriceKopkar: Number(row.total_price_kopkar),
      totalFeeSchool: Number(row.total_fee_school),
      totalPriceStudent: Number(row.total_price_student),
      status: row.status,
      rejectionReason: row.rejection_reason,
      shippingInfo: row.shipping_info,
      receiveInfo: row.receive_info,
      cancellationInfo: row.cancellation_info,
      paymentStatus: row.payment_status,
      paidAt: row.paid_at,
      paidNotes: row.paid_notes,
      feeStatus: row.fee_status,
      feeDisbursedAt: row.fee_disbursed_at,
      feeDisbursedBy: row.fee_disbursed_by,
      feeDisbursedNotes: row.fee_disbursed_notes,
      createdAt: row.created_at,
      processedAt: row.processed_at,
      processedBy: row.processed_by,
    })));

    if (!silent) setLoadingOrders(false);
  }, []);

  useEffect(() => {
    fetchOrders();

    const handleNewOrder = () => {
      // Auto-refresh orders list silently without full screen blink
      fetchOrders(true);
    };

    window.addEventListener('new-order-received', handleNewOrder);
    window.addEventListener('focus', handleNewOrder);
    document.addEventListener('visibilitychange', handleNewOrder);

    return () => {
      window.removeEventListener('new-order-received', handleNewOrder);
      window.removeEventListener('focus', handleNewOrder);
      document.removeEventListener('visibilitychange', handleNewOrder);
    };
  }, [fetchOrders]);

  const {
    approveOrder,
    rejectOrder,
    shipOrder,
    cancelShipment,
    approveCancelOrder,
    kopkarCancelOrder,
    markOrderAsPaid,
    disburseSchoolFee,
    saveShippingInfo,
    shipRemainingOrder,
    deleteOrder,
  } = useOrders();

  // 3 Tabs: 'active' (Berjalan), 'received' (History Diterima/Selesai), 'cancellations' (Riwayat Pembatalan)
  const [activeTab, setActiveTab] = useState<'active' | 'received' | 'cancellations'>('active');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [paymentFilter, setPaymentFilter] = useState<string>('all');
  const [cancelStatusFilter, setCancelStatusFilter] = useState<'all' | 'cancellation_requested' | 'cancelled' | 'rejected'>('all');
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
  const [shippedKopkarQuantities, setShippedKopkarQuantities] = useState<number[]>([]);
  const [shippedVendorQuantities, setShippedVendorQuantities] = useState<number[]>([]);
  const [isShippingRemainder, setIsShippingRemainder] = useState<boolean>(false);

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

  // Cancellation action menu, reject-cancel modal, and detail state
  const [openCancelMenuId, setOpenCancelMenuId] = useState<string | null>(null);
  const [detailOrder, setDetailOrder] = useState<Order | null>(null);
  const [rejectingCancelOrder, setRejectingCancelOrder] = useState<Order | null>(null);
  const [cancelRejectReason, setCancelRejectReason] = useState<string>('');

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

  const filteredCancellationOrders = cancellationOrders
    .filter((ord) => {
      const matchesCancelStatus = cancelStatusFilter === 'all' || ord.status === cancelStatusFilter;
      const matchesSearch =
        ord.schoolName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        ord.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        ord.items.some((it) => it.name.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchesCancelStatus && matchesSearch;
    })
    .sort((a, b) => {
      // Prioritaskan Pengajuan Batal (menunggu approval) di paling atas
      if (a.status === 'cancellation_requested' && b.status !== 'cancellation_requested') return -1;
      if (a.status !== 'cancellation_requested' && b.status === 'cancellation_requested') return 1;
      return 0;
    });

  // Approve Pending Order
  const handleApprove = async (order: Order) => {
    const processorName = user ? user.name : 'Karyawan Koperasi';
    if (window.confirm(`Setujui pesanan ${order.id} dari "${order.schoolName}"?`)) {
      await approveOrder(order.id, processorName);
      setOrders(prev => prev.map(o => o.id === order.id ? { ...o, status: 'approved' } : o));
    }
  };

  // Open initial reject modal
  const handleOpenRejectModal = (order: Order) => {
    setRejectingOrder(order);
    setRejectionReason('');
  };

  const handleConfirmReject = async () => {
    if (!rejectingOrder) return;
    const processorName = user ? user.name : 'Karyawan Koperasi';
    await rejectOrder(
      rejectingOrder.id,
      processorName,
      rejectionReason.trim() || 'Stok tidak mencukupi atau pesanan tidak sesuai'
    );
    setOrders(prev => prev.map(o => o.id === rejectingOrder.id ? { ...o, status: 'rejected' } : o));
    setRejectingOrder(null);
    setRejectionReason('');
  };

  // Open Shipping Modal
  const handleOpenShipModal = (order: Order) => {
    const now = new Date();
    setShippingOrder(order);
    setIsShippingRemainder(false);
    setShipDate(getWibDateString(now));
    setShipTime(getWibTimeString(now));
    setCourierNotes('Mobil Box Koperasi - Bpk. Supardi');
    setShipError('');
    setShippedKopkarQuantities(order.items.map(it => it.quantity));
    setShippedVendorQuantities(order.items.map(() => 0));
  };

  const handleOpenShipRemainderModal = (order: Order) => {
    const now = new Date();
    setShippingOrder(order);
    setIsShippingRemainder(true);
    setShipDate(getWibDateString(now));
    setShipTime(getWibTimeString(now));
    setCourierNotes('Susulan - Dikirim Langsung oleh Vendor');
    setShipError('');
    
    // Default to missing qty
    const missingQties = order.items.map(it => {
      const receivedIt = findMatchingOrderLine(order.receiveInfo?.receivedItems, it);
      return receivedIt?.missingQty || 0;
    });
    setShippedKopkarQuantities(order.items.map(() => 0));
    setShippedVendorQuantities(missingQties);
  };

  const handleConfirmShip = async (e: FormEvent) => {
    e.preventDefault();
    if (!shippingOrder) return;

    if (!shipDate || !shipTime) {
      setShipError('Tanggal dan jam kirim wajib diisi');
      return;
    }

    // Validasi stok fisik di gudang Koperasi sebelum membuat Surat Jalan
    const kopkarItemsToCheck = shippingOrder.items
      .map((it, idx) => ({ it, qty: shippedKopkarQuantities[idx] || 0 }))
      .filter(x => x.qty > 0 && x.it.productId);

    if (kopkarItemsToCheck.length > 0) {
      const pIds = kopkarItemsToCheck.map(x => x.it.productId!);
      const { data: prods, error: pError } = await supabase.from('products').select('id, name, size, stock').in('id', pIds);
      if (pError) {
        setShipError('Gagal memeriksa stok gudang Koperasi: ' + pError.message);
        return;
      }

      const outOfStock: string[] = [];
      for (const check of kopkarItemsToCheck) {
        const p = prods?.find(prod => prod.id === check.it.productId);
        const currentStock = p ? (p.stock || 0) : 0;
        if (currentStock < check.qty) {
          const label = `${check.it.name}${check.it.size ? ` [Ukuran: ${check.it.size}]` : ''}`;
          outOfStock.push(`• ${label} (Dibutuhkan: ${check.qty} pcs, Stok Gudang: ${currentStock} pcs)`);
        }
      }

      if (outOfStock.length > 0) {
        setShipError(`Stok fisik di gudang Koperasi tidak mencukupi:\n${outOfStock.join('\n')}\n\nHarap sesuaikan kuantitas kirim dari Koperasi atau lakukan restock.`);
        return;
      }
    }

    const stafName = user ? user.name : 'Karyawan Koperasi';
    const shippingData: ShippingInfo = {
      shippedAtDate: shipDate,
      shippedAtTime: shipTime,
      courierNotes: courierNotes.trim() || undefined,
      shippedBy: stafName,
      shippedItems: shippingOrder.items.map((it, idx) => ({
        productId: it.productId,
        name: it.name,
        type: it.type,
        shippedQty: (shippedKopkarQuantities[idx] || 0) + (shippedVendorQuantities[idx] || 0),
        kopkarQty: shippedKopkarQuantities[idx] || 0,
        vendorQty: shippedVendorQuantities[idx] || 0,
        size: it.size
      })),
    };

    try {
      if (isShippingRemainder) {
        // Direct ship remainder
        await shipRemainingOrder(shippingOrder.id, shippingData);
        await fetchOrders(true);
        if (window.confirm('Kekurangan barang berhasil dikonfirmasi dan stok terpotong! Apakah Anda ingin mencetak Surat Jalan Susulan?')) {
          setPrintingOrder({ ...shippingOrder, shippingInfo: shippingData });
        }
        
        setShippingOrder(null);
        setIsShippingRemainder(false);
      } else {
        await saveShippingInfo(shippingOrder.id, shippingData);
        // Update local state without changing status
        setOrders(prev => prev.map(o => o.id === shippingOrder.id ? { ...o, shippingInfo: shippingData } : o));
        // Langsung buka print
        setPrintingOrder({ ...shippingOrder, shippingInfo: shippingData });
        setShippingOrder(null);
      }
    } catch (err: any) {
      console.error(err);
      setShipError(err.message || 'Gagal menyimpan Surat Jalan');
    }
  };

  // Cancel Shipment
  const handleCancelShipment = async (order: Order) => {
    if (window.confirm(`Batalkan pengiriman untuk pesanan ${order.id}? Status akan kembali menjadi Disetujui.`)) {
      try {
        await cancelShipment(order.id);
        setOrders(prev => prev.map(o => o.id === order.id ? { ...o, status: 'approved', shippingInfo: undefined, receiveInfo: undefined } : o));
      } catch (err: any) {
        alert(err?.message || 'Gagal membatalkan pengiriman.');
      }
    }
  };

  // Open Pelunasan Modal
  const handleOpenPaymentModal = (order: Order) => {
    setPayingOrder(order);
    setPayNotes('Pembayaran transfer Bank BCA: 0760256757 a.n. Koperasi Konsumen Karyawan BPK Penabur');
  };

  const handleConfirmPayment = async (e: FormEvent) => {
    e.preventDefault();
    if (!payingOrder) return;

    await markOrderAsPaid(payingOrder.id, payNotes.trim());
    setOrders(prev => prev.map(o => o.id === payingOrder.id ? { ...o, payment_status: 'paid', paymentStatus: 'paid' } : o));
    setPayingOrder(null);
  };

  // Open Disburse Fee Modal
  const handleOpenDisburseModal = (order: Order) => {
    setDisbursingOrder(order);
    setDisburseNotes(`Transfer Fee Sekolah ke rekening ${order.schoolName}`);
  };

  const handleConfirmDisburse = async (e: FormEvent) => {
    e.preventDefault();
    if (!disbursingOrder) return;

    const stafName = user ? user.name : 'Karyawan Koperasi';
    await disburseSchoolFee(disbursingOrder.id, stafName, disburseNotes.trim());
    setOrders(prev => prev.map(o => o.id === disbursingOrder.id ? { ...o, fee_status: 'disbursed', feeStatus: 'disbursed' } : o));
    setDisbursingOrder(null);
  };

  // Open Kopkar Cancellation Modal
  const handleOpenKopkarCancelModal = (order: Order) => {
    setCancellingApprovedOrder(order);
    setKopkarCancelReason('');
    setCancelError('');
  };

  const handleConfirmKopkarCancel = async (e: FormEvent) => {
    e.preventDefault();
    if (!cancellingApprovedOrder) return;

    if (!kopkarCancelReason.trim()) {
      setCancelError('Alasan pembatalan wajib diisi agar sekolah menerima pemberitahuan yang jelas');
      return;
    }

    const stafName = user ? user.name : 'Karyawan Koperasi';
    await kopkarCancelOrder(cancellingApprovedOrder.id, kopkarCancelReason.trim(), stafName);
    setOrders(prev => prev.map(o => o.id === cancellingApprovedOrder.id ? { ...o, status: 'cancelled' } : o));
    setCancellingApprovedOrder(null);
  };

  // Approve Cancellation Request from School
  const handleApproveSchoolCancel = async (order: Order) => {
    const stafName = user ? user.name : 'Karyawan Koperasi';
    if (window.confirm(`Setujui permintaan pembatalan pesanan ${order.id} dari "${order.schoolName}"?`)) {
      await approveCancelOrder(order.id, stafName);
      const nowIso = new Date().toISOString();
      setOrders(prev => prev.map(o => o.id === order.id ? {
        ...o,
        status: 'cancelled',
        cancellationInfo: {
          ...(o.cancellationInfo || { cancelledByRole: 'sekolah', cancelledByName: o.schoolName }),
          cancelledAt: nowIso,
          reason: `${o.cancellationInfo?.reason || 'Pengajuan pembatalan sekolah'} (Disetujui oleh ${stafName})`,
        },
      } : o));
    }
  };

  // Reject Cancellation Request from School (restore order back to approved/pending)
  const handleOpenRejectCancelModal = (order: Order) => {
    setRejectingCancelOrder(order);
    setCancelRejectReason('');
  };

  const handleConfirmRejectSchoolCancel = async (e: FormEvent) => {
    e.preventDefault();
    if (!rejectingCancelOrder) return;

    const stafName = user ? user.name : 'Karyawan Koperasi';
    const restoredStatus = rejectingCancelOrder.processedAt ? 'approved' : 'pending';
    const reasonText = cancelRejectReason.trim() || 'Pengajuan pembatalan ditolak oleh Koperasi';
    const updatedCancelInfo = {
      ...(rejectingCancelOrder.cancellationInfo || {}),
      rejectedAt: new Date().toISOString(),
      rejectedByName: stafName,
      cancelRejectionReason: reasonText,
    };

    const { error } = await supabase
      .from('orders')
      .update({
        status: restoredStatus,
        cancellation_info: updatedCancelInfo,
      })
      .eq('id', rejectingCancelOrder.id);

    if (error) {
      alert('Gagal menolak pengajuan batal: ' + error.message);
      return;
    }

    setOrders(prev => prev.map(o => o.id === rejectingCancelOrder.id ? {
      ...o,
      status: restoredStatus,
      cancellationInfo: updatedCancelInfo,
    } : o));
    setRejectingCancelOrder(null);
    setCancelRejectReason('');
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
    let baseId = order.id;
    if (!baseId || !baseId.startsWith('ORD-')) {
      const sortedOrders = [...orders].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      const index = sortedOrders.findIndex(o => o.id === order.id);
      const num = (index + 1).toString().padStart(3, '0');
      const year = new Date(order.createdAt).getFullYear();
      baseId = `ORD-${year}-${num}`;
    }
    if (order.status === 'cancelled' || order.status === 'cancellation_requested' || order.status === 'rejected') {
      if (!baseId.endsWith('-BTL')) {
        baseId += '-BTL';
      }
    }
    return baseId;
  };

  return (
    <div className="kopkar-dashboard">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
        <h2 style={{ margin: 0 }}>Pengelolaan Pesanan</h2>
        <button
          type="button"
          onClick={handleToggleNotif}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '0.85rem',
            fontWeight: 700,
            padding: '7px 14px',
            cursor: 'pointer',
            borderRadius: '8px',
            border: isNotifEnabled ? '1px solid #10b981' : '1px solid #cbd5e1',
            background: isNotifEnabled ? '#ecfdf5' : '#f8fafc',
            color: isNotifEnabled ? '#065f46' : '#64748b',
            boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
            transition: 'all 0.2s ease',
          }}
          title={isNotifEnabled ? 'Notifikasi Suara: AKTIF (Klik untuk mematikan)' : 'Notifikasi Suara: NONAKTIF (Klik untuk mengaktifkan)'}
        >
          <span style={{ fontSize: '1.05rem' }}>{isNotifEnabled ? '🔔' : '🔕'}</span>
          <span>Notifikasi Suara: <strong>{isNotifEnabled ? 'ON' : 'OFF'}</strong></span>
          <span
            style={{
              display: 'inline-block',
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: isNotifEnabled ? '#10b981' : '#94a3b8',
              marginLeft: '2px',
              boxShadow: isNotifEnabled ? '0 0 6px #10b981' : 'none',
            }}
          />
        </button>
      </div>


      {/* Operational Highlights */}
      <div className="kopkar-stats operational-stats">
        <div
          className="kopkar-stat-card summary-card"
          role="button"
          tabIndex={0}
          onClick={() => {
            setActiveTab('active');
            setStatusFilter(statusFilter === 'pending' && activeTab === 'active' ? 'all' : 'pending');
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              setActiveTab('active');
              setStatusFilter('pending');
            }
          }}
          title="Klik untuk melihat pesanan yang menunggu persetujuan"
          style={{
            cursor: 'pointer',
            border: activeTab === 'active' && statusFilter === 'pending' ? '2px solid #d97706' : undefined,
            background: activeTab === 'active' && statusFilter === 'pending' ? '#fffbeb' : undefined,
          }}
        >
          <div className="stat-icon">📋</div>
          <div className="stat-label">Menunggu Persetujuan</div>
          <div className="stat-value warning">{pendingOrders}</div>
        </div>

        <div
          className="kopkar-stat-card summary-card"
          role="button"
          tabIndex={0}
          onClick={() => {
            setActiveTab('active');
            setStatusFilter(statusFilter === 'shipped' && activeTab === 'active' ? 'all' : 'shipped');
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              setActiveTab('active');
              setStatusFilter('shipped');
            }
          }}
          title="Klik untuk melihat pesanan yang sedang dikirim"
          style={{
            cursor: 'pointer',
            border: activeTab === 'active' && statusFilter === 'shipped' ? '2px solid #2563eb' : undefined,
            background: activeTab === 'active' && statusFilter === 'shipped' ? '#eff6ff' : undefined,
          }}
        >
          <div className="stat-icon">🚚</div>
          <div className="stat-label">Sedang Dikirim</div>
          <div className="stat-value info">{shippedOrders}</div>
        </div>

        <div
          className="kopkar-stat-card summary-card"
          role="button"
          tabIndex={0}
          onClick={() => {
            setActiveTab('cancellations');
            setCancelStatusFilter(cancelRequestsCount > 0 ? 'cancellation_requested' : 'all');
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              setActiveTab('cancellations');
              setCancelStatusFilter(cancelRequestsCount > 0 ? 'cancellation_requested' : 'all');
            }
          }}
          title="Klik untuk melihat & memproses pengajuan pembatalan dari sekolah"
          style={{
            cursor: 'pointer',
            border: activeTab === 'cancellations'
              ? '2px solid #e11d48'
              : cancelRequestsCount > 0
                ? '1.5px solid #fda4af'
                : undefined,
            background: activeTab === 'cancellations'
              ? '#fff1f2'
              : cancelRequestsCount > 0
                ? '#fff5f5'
                : undefined,
          }}
        >
          <div className="stat-icon">🚫</div>
          <div className="stat-label">Pengajuan Batal</div>
          <div className="stat-value danger">{cancelRequestsCount}</div>
          <div style={{ fontSize: '0.74rem', color: cancelRequestsCount > 0 ? '#be123c' : '#64748b', marginTop: '4px', fontWeight: 600 }}>
            {cancelRequestsCount > 0 ? 'Klik untuk tinjau & setujui →' : 'Klik untuk lihat riwayat batal →'}
          </div>
        </div>
      </div>

      {/* 3 Tabs Navigation */}
      <div className="dashboard-tabs">
        <button
          className={`tab-button ${activeTab === 'active' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('active');
            setStatusFilter('all');
          }}
        >
          📋 Pesanan Berjalan ({activeOrders.length})
        </button>
        <button
          className={`tab-button ${activeTab === 'received' ? 'active' : ''}`}
          onClick={() => setActiveTab('received')}
        >
          ✅ Riwayat Selesai ({receivedCount})
        </button>
        <button
          className={`tab-button ${activeTab === 'cancellations' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('cancellations');
            setCancelStatusFilter('all');
          }}
        >
          🚫 Pengajuan & History Batal ({cancellationOrders.length})
          {cancelRequestsCount > 0 && (
            <span
              style={{
                marginLeft: '8px',
                background: '#e11d48',
                color: '#ffffff',
                fontSize: '0.72rem',
                fontWeight: 700,
                padding: '2px 7px',
                borderRadius: '99px',
              }}
            >
              {cancelRequestsCount} Pending
            </span>
          )}
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
                          <div style={{ fontWeight: 600, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                            {order.schoolName}
                            {order.orderPhase === 'On The Spot' && (
                              <span style={{ background: '#f3e8ff', color: '#7e22ce', border: '1px solid #d8b4fe', padding: '1px 6px', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 700 }}>
                                On The Spot
                              </span>
                            )}
                          </div>
                          {order.schoolLevel && (
                            <span className={`badge-level ${order.schoolLevel}`}>
                              {order.schoolLevel}
                            </span>
                          )}
                        </td>
                        <td>
                          <ul className="order-items-list" style={{ gap: '8px', display: 'flex', flexDirection: 'column' }}>
                            {(expandedItems[order.id] ? order.items : order.items.slice(0, 1)).map((it, idx) => {
                              const shippedIt = findMatchingOrderLine(order.shippingInfo?.shippedItems, it);
                              const shippedQty = shippedIt ? shippedIt.shippedQty : (order.status === 'received' || order.status === 'shipped' ? it.quantity : 0);
                              const unsentQty = Math.max(0, it.quantity - shippedQty);
                              return (
                              <li key={idx}>
                                <div style={{ fontWeight: 600 }}>{it.name}{it.size ? ` [${it.size}]` : ''}</div>
                                <div style={{ fontSize: '0.8rem', color: '#475569' }}>
                                  Pesan: {it.quantity}, Terkirim: {shippedQty}, Belum dikirim: {unsentQty}
                                </div>
                              </li>
                            )})}
                            {order.items.length > 1 && (
                              <li 
                                style={{ fontSize: '0.8rem', color: '#2563eb', fontStyle: 'italic', marginTop: '4px', cursor: 'pointer' }}
                                onClick={() => toggleExpand(order.id)}
                              >
                                {expandedItems[order.id] ? 'Sembunyikan' : `+ ${order.items.length - 1} item lainnya (Klik)`}
                              </li>
                            )}
                          </ul>
                        </td>

                        <td>
                          <div className="kopkar-actions-col">
                            <div style={{ marginBottom: '8px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                              <button
                                className="btn-detail-dots"
                                title="Lihat Detail Pesanan"
                                onClick={() => setDetailOrder(order)}
                                style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 8px', fontSize: '0.8rem', borderRadius: '4px', border: '1px solid #cbd5e1', background: '#f8fafc', color: '#334155', cursor: 'pointer' }}
                              >
                                ⋮ Detail
                              </button>
                              {order.notes?.match(/\[Bukti GDrive:\s*(https?:\/\/[^\]]+)\]/)?.[1] && (
                                <a
                                  href={order.notes.match(/\[Bukti GDrive:\s*(https?:\/\/[^\]]+)\]/)![1]}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  title="Buka Lembar Pemesanan Resmi (GDrive)"
                                  style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 8px', fontSize: '0.78rem', fontWeight: 600, borderRadius: '4px', border: '1px solid #86efac', background: '#f0fdf4', color: '#15803d', textDecoration: 'none' }}
                                >
                                  📄 Surat Kepsek
                                </a>
                              )}
                            </div>
                            {order.status === 'pending' && (
                              <div className="action-buttons">
                                <button className="btn-approve" style={{ padding: '4px 10px', fontSize: '0.8rem' }} onClick={() => handleApprove(order)}>
                                  ✓ Setujui
                                </button>
                                <button className="btn-reject" style={{ padding: '4px 10px', fontSize: '0.8rem' }} onClick={() => handleOpenRejectModal(order)}>
                                  ✕ Tolak
                                </button>
                              </div>
                            )}
                      {order.status === 'approved' && !order.shippingInfo && (
                              <div className="action-buttons-wrap">
                                <button className="btn-ship" onClick={() => handleOpenShipModal(order)} style={{ backgroundColor: '#2563eb' }}>
                                  📄 Buat Surat Jalan
                                </button>
                                <button className="btn-secondary" style={{ padding: '6px 12px', fontSize: '0.82rem', borderColor: '#10b981', color: '#059669', backgroundColor: '#ecfdf5' }} onClick={() => generateSuratJalanExcel(order)}>
                                  📊 Download Excel
                                </button>
                                <button className="btn-cancel-approved" onClick={() => handleOpenKopkarCancelModal(order)}>
                                  ⚠️ Batalkan
                                </button>
                              </div>
                            )}
                      {order.status === 'approved' && order.shippingInfo && (
                              <div className="action-buttons-wrap">
                                <button className="btn-secondary" style={{ padding: '6px 12px', fontSize: '0.82rem' }} onClick={() => setPrintingOrder(order)}>
                                  🖨️ Cetak Ulang Surat Jalan
                                </button>
                                <button className="btn-ship" onClick={async () => {
                                  if(window.confirm('Kurir sudah berangkat? Konfirmasi kirim barang dan potong stok?')) {
                                    try {
                                      await shipOrder(order.id, order.shippingInfo!);
                                      setOrders(prev => prev.map(o => o.id === order.id ? { ...o, status: 'shipped' } : o));
                                      alert('Pengiriman berhasil dikonfirmasi dan stok gudang koperasi telah dipotong!');
                                    } catch (err: any) {
                                      alert(err?.message || 'Gagal mengirim barang.');
                                    }
                                  }
                                }} style={{ backgroundColor: '#10b981' }}>
                                  🚚 Konfirmasi Kirim
                                </button>
                              </div>
                            )}
                      {order.status === 'shipped' && (
                              <div style={{ fontSize: '0.8rem', color: '#2563eb' }}>
                                Barang sedang diantar ke sekolah.
                                {order.shippingInfo?.shippedItems && order.items.some((it) => {
                                  const shippedIt = findMatchingOrderLine(order.shippingInfo!.shippedItems, it);
                                  return shippedIt && shippedIt.shippedQty < it.quantity;
                                }) && (
                                  <div style={{ marginTop: '4px', color: '#dc2626', fontWeight: 600 }}>
                                    ⚠️ Terdapat barang yang belum dikirim!
                                  </div>
                                )}
                                
                                {order.receiveInfo?.isPartial && (
                                  <div style={{ marginTop: '8px', padding: '6px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '4px', color: '#b91c1c', fontWeight: 600 }}>
                                    ⚠️ DITERIMA SEBAGIAN OLEH SEKOLAH
                                    <ul style={{ margin: '4px 0 0 16px', padding: 0, fontWeight: 'normal', fontSize: '0.75rem' }}>
                                      {order.receiveInfo.receivedItems?.filter(r => r.missingQty && r.missingQty > 0).map((r, idx) => (
                                        <li key={idx}>Kurang: {r.missingQty} pcs ({r.name}{r.size ? ` [${r.size}]` : ''})</li>
                                      ))}
                                    </ul>
                                    <div style={{ marginTop: '4px', fontStyle: 'italic', fontSize: '0.75rem' }}>Harap follow-up sisa barang.</div>
                                    <button 
                                      className="btn-ship" 
                                      style={{ marginTop: '8px', width: '100%', fontSize: '0.75rem', padding: '6px' }}
                                      onClick={() => handleOpenShipRemainderModal(order)}
                                    >
                                      📦 Kirim Kekurangan
                                    </button>
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
                        {order.status === 'pending' && '⏳ Menunggu'}
                        {order.status === 'approved' && '👍 Disetujui'}
                        {order.status === 'shipped' && '🚚 Dikirim'}
                      </span>
                    </div>

                    <div className="mobile-items-box">
                      <div className="mobile-label">Item:</div>
                      <ul className="order-items-list">
                        {(expandedItems[order.id] ? order.items : order.items.slice(0, 1)).map((it, idx) => {
                          const shippedIt = findMatchingOrderLine(order.shippingInfo?.shippedItems, it);
                          const shippedQty = shippedIt ? shippedIt.shippedQty : (order.status === 'received' || order.status === 'shipped' ? it.quantity : 0);
                          const unsentQty = Math.max(0, it.quantity - shippedQty);
                          return (
                          <li key={idx}>
                            <div style={{ fontWeight: 600 }}>{it.name}{it.size ? ` [${it.size}]` : ''}</div>
                            <div style={{ fontSize: '0.8rem', color: '#475569' }}>
                              Pesan: {it.quantity}, Terkirim: {shippedQty}, Belum dikirim: {unsentQty}
                            </div>
                          </li>
                        )})}
                        {order.items.length > 1 && (
                          <li 
                            style={{ fontSize: '0.8rem', color: '#2563eb', fontStyle: 'italic', marginTop: '4px', cursor: 'pointer' }}
                            onClick={() => toggleExpand(order.id)}
                          >
                            {expandedItems[order.id] ? 'Sembunyikan' : `+ ${order.items.length - 1} item lainnya (Klik)`}
                          </li>
                        )}
                      </ul>
                    </div>


                    <div className="mobile-card-actions">
                      <div style={{ marginBottom: '12px' }}>
                        <button
                          className="btn-detail-dots full-width-touch"
                          onClick={() => setDetailOrder(order)}
                          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', padding: '8px', fontSize: '0.9rem', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#f8fafc', color: '#334155', cursor: 'pointer' }}
                        >
                          ⋮ Detail Pesanan
                        </button>
                      </div>
                      {order.status === 'pending' && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                          <button className="btn-approve full-width-touch" style={{ padding: '6px', fontSize: '0.85rem' }} onClick={() => handleApprove(order)}>
                            ✓ Setujui
                          </button>
                          <button className="btn-reject full-width-touch" style={{ padding: '6px', fontSize: '0.85rem' }} onClick={() => handleOpenRejectModal(order)}>
                            ✕ Tolak
                          </button>
                        </div>
                      )}
                      {order.status === 'approved' && !order.shippingInfo && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '8px' }}>
                          <button className="btn-ship full-width-touch" onClick={() => handleOpenShipModal(order)} style={{ backgroundColor: '#2563eb' }}>
                            📄 Buat Surat Jalan
                          </button>
                          <button className="btn-secondary full-width-touch" style={{ borderColor: '#10b981', color: '#059669', backgroundColor: '#ecfdf5' }} onClick={() => generateSuratJalanExcel(order)}>
                            📊 Download Excel
                          </button>
                          <button className="btn-cancel-approved full-width-touch" onClick={() => handleOpenKopkarCancelModal(order)}>
                            ⚠️ Batalkan
                          </button>
                        </div>
                      )}
                      {order.status === 'approved' && order.shippingInfo && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '8px' }}>
                          <button className="btn-secondary full-width-touch" onClick={() => setPrintingOrder(order)}>
                            🖨️ Cetak Ulang Surat Jalan
                          </button>
                          <button className="btn-ship full-width-touch" onClick={async () => {
                            if(window.confirm('Kurir sudah berangkat? Konfirmasi kirim barang dan potong stok?')) {
                              try {
                                await shipOrder(order.id, order.shippingInfo!);
                                setOrders(prev => prev.map(o => o.id === order.id ? { ...o, status: 'shipped' } : o));
                                alert('Pengiriman berhasil dikonfirmasi dan stok gudang koperasi telah dipotong!');
                              } catch (err: any) {
                                alert(err?.message || 'Gagal mengirim barang.');
                              }
                            }
                          }} style={{ backgroundColor: '#10b981' }}>
                            🚚 Konfirmasi Kirim
                          </button>
                        </div>
                      )}
                      {order.status === 'shipped' && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '8px' }}>
                          {order.shippingInfo?.shippedItems && order.items.some((it) => {
                            const shippedIt = findMatchingOrderLine(order.shippingInfo!.shippedItems, it);
                            return shippedIt && shippedIt.shippedQty < it.quantity;
                          }) && (
                            <div style={{ fontSize: '0.8rem', color: '#dc2626', fontWeight: 600 }}>
                              ⚠️ Terdapat barang yang belum dikirim!
                            </div>
                          )}

                          {order.receiveInfo?.isPartial && (
                            <div style={{ padding: '10px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', color: '#b91c1c', fontSize: '0.8rem' }}>
                              <div style={{ fontWeight: 700, marginBottom: '4px' }}>⚠️ DITERIMA SEBAGIAN OLEH SEKOLAH</div>
                              <ul style={{ margin: '4px 0 6px 16px', padding: 0 }}>
                                {order.receiveInfo.receivedItems?.filter((r: any) => r.missingQty && r.missingQty > 0).map((r: any, idx: number) => (
                                  <li key={idx}>Kurang: {r.missingQty} pcs ({r.name}{r.size ? ` [${r.size}]` : ''})</li>
                                ))}
                              </ul>
                              <button
                                className="btn-ship full-width-touch"
                                onClick={() => handleOpenShipRemainderModal(order)}
                              >
                                📦 Kirim Kekurangan
                              </button>
                            </div>
                          )}

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
                      <th>Status Pelunasan Sekolah</th>
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
                      <span className="status-badge received">✅ Diterima</span>
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

      {/* TAB 3: HISTORY PEMBATALAN & APPROVAL PENGAJUAN BATAL */}
      {activeTab === 'cancellations' && (
        <div className="tab-pane">
          <div className="kopkar-toolbar">
            <h3>Pengajuan Batal Sekolah & Riwayat Pembatalan</h3>
            <div className="kopkar-filters">
              <input
                type="text"
                placeholder="Cari sekolah, ID order, atau item..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <select
                value={cancelStatusFilter}
                onChange={(e) => setCancelStatusFilter(e.target.value as any)}
              >
                <option value="all">Semua Status ({cancellationOrders.length})</option>
                <option value="cancellation_requested">⏳ Menunggu Approval ({cancelRequestsCount})</option>
                <option value="cancelled">🚫 Sudah Dibatalkan</option>
                <option value="rejected">❌ Ditolak Awal</option>
              </select>
            </div>
          </div>

          {cancelRequestsCount > 0 && (
            <div
              style={{
                background: '#fff1f2',
                border: '1px solid #fecdd3',
                borderLeft: '4px solid #e11d48',
                borderRadius: '10px',
                padding: '12px 16px',
                marginBottom: '16px',
                color: '#881337',
                fontSize: '0.88rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '12px',
                flexWrap: 'wrap',
              }}
            >
              <div>
                <strong>⏳ {cancelRequestsCount} Pengajuan Pembatalan Menunggu Persetujuan:</strong>{' '}
                Klik <strong>✓ Setujui Batal</strong> untuk menyetujui pembatalan, atau <strong>↩ Tolak Batal</strong> agar pesanan tetap dilanjutkan.
              </div>
              {cancelStatusFilter !== 'cancellation_requested' && (
                <button
                  type="button"
                  onClick={() => setCancelStatusFilter('cancellation_requested')}
                  style={{
                    background: '#e11d48',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '6px 12px',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Tampilkan Hanya Pending ({cancelRequestsCount})
                </button>
              )}
            </div>
          )}

          {filteredCancellationOrders.length > 0 ? (
            <>
              {/* Desktop Table View */}
              <div className="kopkar-table-container desktop-table-view">
                <table className="kopkar-table">
                  <thead>
                    <tr>
                      <th>ID & Sekolah</th>
                      <th>Daftar Item</th>
                      <th>Status</th>
                      <th>Pihak Pemohon</th>
                      <th>Alasan Pembatalan</th>
                      <th>Waktu</th>
                      <th>Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCancellationOrders.map((order) => (
                      <tr
                        key={order.id}
                        style={
                          order.status === 'cancellation_requested'
                            ? { background: '#fff9fa' }
                            : undefined
                        }
                      >
                        <td>
                          <strong>{order.id}</strong>
                          <div style={{ fontWeight: 600, color: '#334155' }}>{order.schoolName}</div>
                          {order.orderPhase && (
                            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Fase: {order.orderPhase}</span>
                          )}
                        </td>
                        <td>
                          <ul className="order-items-list">
                            {order.items.map((it, idx) => (
                              <li key={idx}>
                                <span className={`item-type ${it.type}`}>{it.type}</span>
                                {it.name} {it.size ? `[${it.size}] ` : ''}({it.quantity} {resolveItemUnit(it, it.quantity)})
                              </li>
                            ))}
                          </ul>
                        </td>
                        <td>
                          {order.status === 'cancellation_requested' && (
                            <span className="status-badge requested">⏳ Menunggu Approval</span>
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
                          {formatDate(
                            order.status === 'cancellation_requested'
                              ? (order.cancellationInfo?.requestedAt || order.createdAt)
                              : (order.cancellationInfo?.cancelledAt || order.createdAt)
                          )}
                        </td>
                        <td>
                          {order.status === 'cancellation_requested' ? (
                            <div className="kopkar-actions-col" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                              <button
                                className="btn-approve"
                                onClick={() => handleApproveSchoolCancel(order)}
                                title="Setujui pembatalan pesanan ini"
                              >
                                ✓ Setujui Batal
                              </button>
                              <button
                                className="btn-reject"
                                style={{ background: '#fff', color: '#b45309', border: '1px solid #f59e0b' }}
                                onClick={() => handleOpenRejectCancelModal(order)}
                                title="Tolak pengajuan batal & lanjutkan pesanan"
                              >
                                ↩ Tolak Batal
                              </button>
                              <button
                                className="btn-detail-dots"
                                title="Lihat Detail Pesanan"
                                onClick={() => setDetailOrder(order)}
                                style={{ fontSize: '0.8rem', padding: '4px 8px' }}
                              >
                                📄 Detail
                              </button>
                            </div>
                          ) : (
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
                                    onClick={async () => {
                                      if (window.confirm('Yakin ingin menghapus permanen riwayat pembatalan ini?')) {
                                        await deleteOrder(order.id);
                                        setOrders(prev => prev.filter(o => o.id !== order.id));
                                      }
                                      setOpenCancelMenuId(null);
                                    }}
                                  >
                                    🗑️ Hapus Riwayat
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Card View */}
              <div className="mobile-cards-view">
                {filteredCancellationOrders.map((order) => (
                  <div
                    key={order.id}
                    className="mobile-order-card"
                    style={
                      order.status === 'cancellation_requested'
                        ? { borderLeft: '4px solid #e11d48', background: '#fff9fa' }
                        : undefined
                    }
                  >
                    <div className="mobile-card-header">
                      <div>
                        <span className="mobile-order-id">{order.id}</span>
                        <div style={{ fontWeight: 700, fontSize: '0.92rem', color: '#1e2d42' }}>{order.schoolName}</div>
                        <div className="mobile-card-date">
                          {formatDate(
                            order.status === 'cancellation_requested'
                              ? (order.cancellationInfo?.requestedAt || order.createdAt)
                              : (order.cancellationInfo?.cancelledAt || order.createdAt)
                          )}
                        </div>
                      </div>
                      <span className={`status-badge ${order.status === 'cancellation_requested' ? 'requested' : order.status}`}>
                        {order.status === 'cancellation_requested' && '⏳ Menunggu Approval'}
                        {order.status === 'cancelled' && '🚫 Dibatalkan'}
                        {order.status === 'rejected' && '❌ Ditolak'}
                      </span>
                    </div>

                    <div className="mobile-items-box">
                      <div className="mobile-label">Daftar Item:</div>
                      <ul className="order-items-list">
                        {order.items.map((it, idx) => (
                          <li key={idx}>
                            <span className={`item-type ${it.type}`}>{it.type}</span>
                            {it.name} {it.size ? `[${it.size}] ` : ''}— {it.quantity} {resolveItemUnit(it, it.quantity)}
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="reason-text-box" style={{ marginTop: '8px' }}>
                      <strong>Pemohon ({order.cancellationInfo?.cancelledByName || 'Koperasi'}):</strong>{' '}
                      {order.cancellationInfo?.reason || order.rejectionReason || 'Tidak ada alasan'}
                    </div>

                    <div className="mobile-card-actions" style={{ marginTop: '12px' }}>
                      {order.status === 'cancellation_requested' ? (
                        <>
                          <button
                            className="btn-approve full-width-touch"
                            onClick={() => handleApproveSchoolCancel(order)}
                          >
                            ✓ Setujui Pembatalan
                          </button>
                          <button
                            className="btn-reject full-width-touch"
                            style={{ background: '#fff', color: '#b45309', border: '1px solid #f59e0b' }}
                            onClick={() => handleOpenRejectCancelModal(order)}
                          >
                            ↩ Tolak Batal (Lanjutkan Pesanan)
                          </button>
                        </>
                      ) : null}
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          className="btn-secondary"
                          style={{ flex: 1, padding: '8px' }}
                          onClick={() => setDetailOrder(order)}
                        >
                          📄 Detail
                        </button>
                        {order.status !== 'cancellation_requested' && (
                          <button
                            className="btn-reject"
                            style={{ flex: 1, padding: '8px' }}
                            onClick={async () => {
                              if (window.confirm('Yakin ingin menghapus permanen riwayat pembatalan ini?')) {
                                await deleteOrder(order.id);
                                setOrders(prev => prev.filter(o => o.id !== order.id));
                              }
                            }}
                          >
                            🗑️ Hapus
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="kopkar-empty">
              <p>Tidak ada data pengajuan pembatalan atau riwayat pembatalan.</p>
            </div>
          )}
        </div>
      )}

      {/* Modal Input Pengiriman Barang */}
      {shippingOrder && (() => {
        const totalShippedNow = shippingOrder.items.reduce(
          (sum, _, idx) => sum + (shippedKopkarQuantities[idx] || 0) + (shippedVendorQuantities[idx] || 0),
          0
        );
        const totalOrdered = shippingOrder.items.reduce((sum, it) => sum + it.quantity, 0);

        const allocateAllToSource = (target: 'kopkar' | 'vendor') => {
          const allocated = shippingOrder.items.map((it, idx) => {
            const currentTotal = (shippedKopkarQuantities[idx] || 0) + (shippedVendorQuantities[idx] || 0);
            return currentTotal > 0 ? currentTotal : (!isShippingRemainder ? it.quantity : 0);
          });
          const zeros = shippingOrder.items.map(() => 0);
          if (target === 'kopkar') {
            setShippedKopkarQuantities(allocated);
            setShippedVendorQuantities(zeros);
          } else {
            setShippedKopkarQuantities(zeros);
            setShippedVendorQuantities(allocated);
          }
        };

        return (
          <div className="modal-overlay" onClick={() => setShippingOrder(null)}>
            <div className="modal sj-modal" onClick={(e) => e.stopPropagation()}>
              <div className="sj-modal-header">
                <div className="sj-modal-title-wrap">
                  <div className="sj-modal-icon" aria-hidden="true">📄</div>
                  <div className="sj-modal-title-text">
                    <h3>{isShippingRemainder ? 'Buat Surat Jalan Susulan' : 'Buat Surat Jalan'}</h3>
                    <div className="sj-order-meta">
                      <span className="sj-meta-id">{shippingOrder.id}</span>
                      <span className="sj-meta-school">{shippingOrder.schoolName}</span>
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  className="sj-modal-close"
                  aria-label="Tutup modal surat jalan"
                  onClick={() => setShippingOrder(null)}
                >
                  ✕
                </button>
              </div>

              <form className="modal-form sj-modal-form" onSubmit={handleConfirmShip}>
                <div className="sj-modal-body">
                  {shipError && <div className="modal-error">{shipError}</div>}

                  <div className="sj-schedule-grid">
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

                  <div className="sj-items-section">
                    <div className="sj-items-header">
                      <span className="sj-items-label">Rincian Qty Pengiriman per Barang</span>
                      <div className="sj-quick-actions">
                        <button
                          type="button"
                          className="sj-quick-btn"
                          onClick={() => allocateAllToSource('kopkar')}
                        >
                          Semua dari Kopkar
                        </button>
                        <button
                          type="button"
                          className="sj-quick-btn"
                          onClick={() => allocateAllToSource('vendor')}
                        >
                          Semua dari Penjahit
                        </button>
                      </div>
                    </div>

                    <div className="sj-items-list">
                      {shippingOrder.items.map((it, idx) => {
                        const unit = resolveItemUnit(it, it.quantity);
                        const kopkarQty = shippedKopkarQuantities[idx] ?? 0;
                        const vendorQty = shippedVendorQuantities[idx] ?? 0;
                        const lineTotal = kopkarQty + vendorQty;
                        const statusClass =
                          lineTotal === 0
                            ? 'is-zero'
                            : lineTotal >= it.quantity
                              ? 'is-exact'
                              : 'is-partial';

                        return (
                          <div key={idx} className="sj-item-card">
                            <div className="sj-item-top">
                              <div className="sj-item-name">
                                {it.name}
                                {it.size && <span className="sj-size-badge">Uk: {it.size}</span>}
                              </div>
                              <span className="sj-order-qty-badge">
                                Pesan: {it.quantity} {unit}
                              </span>
                            </div>

                            <div className="sj-item-inputs">
                              <label className="sj-qty-field">
                                <span>Dari Kopkar</span>
                                <input
                                  type="number"
                                  min="0"
                                  className="sj-qty-input"
                                  value={kopkarQty}
                                  onChange={(e) => {
                                    const newQties = [...shippedKopkarQuantities];
                                    newQties[idx] = Math.max(0, parseInt(e.target.value, 10) || 0);
                                    setShippedKopkarQuantities(newQties);
                                  }}
                                />
                              </label>

                              <label className="sj-qty-field">
                                <span>Dari Penjahit</span>
                                <input
                                  type="number"
                                  min="0"
                                  className="sj-qty-input"
                                  value={vendorQty}
                                  onChange={(e) => {
                                    const newQties = [...shippedVendorQuantities];
                                    newQties[idx] = Math.max(0, parseInt(e.target.value, 10) || 0);
                                    setShippedVendorQuantities(newQties);
                                  }}
                                />
                              </label>

                              <div className={`sj-item-subtotal ${statusClass}`}>
                                Kirim: {lineTotal} {unit}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className="sj-modal-footer">
                  <div className="sj-total-summary">
                    Total kirim sekarang: <strong>{totalShippedNow}</strong> / {totalOrdered} item
                  </div>
                  <div className="sj-footer-buttons">
                    <button type="button" className="btn-secondary" onClick={() => setShippingOrder(null)}>
                      Batal
                    </button>
                    <button type="submit" className="sj-btn-submit">
                      📄 Simpan &amp; Cetak Surat Jalan
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        );
      })()}

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

      {/* Modal Tolak Pengajuan Batal dari Sekolah */}
      {rejectingCancelOrder && (
        <div className="modal-overlay" onClick={() => setRejectingCancelOrder(null)}>
          <div className="modal" style={{ maxWidth: '480px' }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ color: '#b45309' }}>↩ Tolak Pengajuan Pembatalan</h3>
            <p style={{ fontSize: '0.88rem', color: '#64748b', marginBottom: '10px' }}>
              Pesanan: <strong>{rejectingCancelOrder.id}</strong> — {rejectingCancelOrder.schoolName}
            </p>
            <div style={{ fontSize: '0.84rem', background: '#fffbeb', border: '1px solid #fde68a', padding: '10px 12px', borderRadius: '8px', marginBottom: '14px', color: '#92400e' }}>
              ℹ️ Jika pengajuan batal ditolak, pesanan akan dikembalikan ke status aktif (<strong>{rejectingCancelOrder.processedAt ? 'Disetujui / Siap Kirim' : 'Menunggu Persetujuan'}</strong>) dan dilanjutkan prosesnya.
            </div>
            <form className="modal-form" onSubmit={handleConfirmRejectSchoolCancel}>
              <div className="form-group">
                <label>Alasan Penolakan Pembatalan (ditampilkan ke sekolah):</label>
                <textarea
                  value={cancelRejectReason}
                  onChange={(e) => setCancelRejectReason(e.target.value)}
                  placeholder="Contoh: Barang sudah dipacking / sudah masuk jadwal pengiriman..."
                  rows={3}
                  required
                  autoFocus
                />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setRejectingCancelOrder(null)}>
                  Batal
                </button>
                <button type="submit" className="btn-reject" style={{ background: '#d97706' }}>
                  Konfirmasi Tolak Batal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Print Only Surat Jalan */}
      <SuratJalanPrint order={printingOrder} />
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
                Sekolah: <strong>{detailOrder.schoolName}</strong>
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
                    <strong>{it.name}</strong> {it.size && `[${it.size}] `}— {it.quantity} {resolveItemUnit(it, it.quantity)}
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
                <div style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '4px' }}>Status Pesanan</div>
                <span className={`status-badge ${detailOrder.status === 'cancellation_requested' ? 'requested' : detailOrder.status}`}>
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

            {(detailOrder.cancellationInfo?.reason || detailOrder.rejectionReason) && (
              <div style={{ marginTop: '16px', padding: '10px 12px', borderRadius: '8px', background: '#fff1f2', border: '1px solid #fecdd3', fontSize: '0.86rem', color: '#881337' }}>
                <strong>Alasan Pembatalan / Penolakan:</strong>{' '}
                {detailOrder.cancellationInfo?.reason || detailOrder.rejectionReason}
              </div>
            )}

            <div className="modal-actions" style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end', gap: '10px', flexWrap: 'wrap' }}>
              {detailOrder.status === 'cancellation_requested' && (
                <>
                  <button
                    type="button"
                    className="btn-reject"
                    style={{ background: '#fff', color: '#b45309', border: '1px solid #f59e0b' }}
                    onClick={() => {
                      const target = detailOrder;
                      setDetailOrder(null);
                      handleOpenRejectCancelModal(target);
                    }}
                  >
                    ↩ Tolak Batal
                  </button>
                  <button
                    type="button"
                    className="btn-approve"
                    onClick={async () => {
                      const target = detailOrder;
                      setDetailOrder(null);
                      await handleApproveSchoolCancel(target);
                    }}
                  >
                    ✓ Setujui Batal
                  </button>
                </>
              )}
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setDetailOrder(null)}
                style={{ minWidth: '120px' }}
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

export default KopkarPesanan;
