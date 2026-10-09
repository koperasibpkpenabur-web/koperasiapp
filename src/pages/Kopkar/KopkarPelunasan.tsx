
﻿import { useState, useEffect, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useOrders } from '../../context/OrderContext';
import { useReturns } from '../../context/ReturnContext';
import { supabase } from '../../lib/supabase';
import type { Order } from '../../types';
import SuratJalanPrint from './SuratJalanPrint';
import './kopkar.css';

const KopkarPelunasan = () => {
  const { user } = useAuth();
  const { pendingCount: pendingReturnsCount } = useReturns();
  const [orders, setOrders] = useState<any[]>([]);
  // Paginasi Server-Side
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);
  const [totalCount, setTotalCount] = useState(0);

  // Filters (moved up to avoid TDZ ReferenceError in useEffect)
  const [paymentFilter, setPaymentFilter] = useState<string>('all');
  const [timeFilter, setTimeFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Aggregates
  const [totalOmzetStudent, setTotalOmzetStudent] = useState(0);
  const [totalPaidRevenue, setTotalPaidRevenue] = useState(0);
  const [countTahap1, setCountTahap1] = useState(0);
  const [countTahap2, setCountTahap2] = useState(0);
  const [countTambahan, setCountTambahan] = useState(0);
  const [cancelRequestsCount, setCancelRequestsCount] = useState(0);

  
  const fetchAggregates = async () => {
    const { data, error } = await supabase.from('orders').select('status, payment_status, fee_status, order_phase, total_price_student, total_fee_school');
    if (!error && data) {
      let omzet = 0, paid = 0, cT1 = 0, cT2 = 0, cTamb = 0, cCancelReq = 0;
      data.forEach(o => {
        if (o.status !== 'cancelled' && o.status !== 'rejected') omzet += Number(o.total_price_student) || 0;
        if (o.payment_status === 'paid') paid += Number(o.total_price_student) || 0;
        
        if (o.status === 'cancellation_requested') cCancelReq++;
        
        if (o.order_phase === 'Tahap 1') cT1++;
        else if (o.order_phase === 'Tahap 2') cT2++;
        else if (o.order_phase && o.order_phase.includes('Tambahan')) cTamb++;
      });
      setTotalOmzetStudent(omzet);
      setTotalPaidRevenue(paid);
      setCountTahap1(cT1);
      setCountTahap2(cT2);
      setCountTambahan(cTamb);
      setCancelRequestsCount(cCancelReq);
    }
  };

  const fetchOrders = async () => {
    let query = supabase.from('orders').select('*, order_items(*)', { count: 'exact' }).neq('status', 'cancelled').neq('status', 'rejected');
    
    if (paymentFilter !== 'all') {
      query = query.eq('payment_status', paymentFilter);
    }

    if (timeFilter === 'this_week') {
      const startOfWeek = new Date();
      startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
      startOfWeek.setHours(0, 0, 0, 0);
      query = query.gte('created_at', startOfWeek.toISOString());
    } else if (timeFilter === 'this_month') {
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);
      query = query.gte('created_at', startOfMonth.toISOString());
    }

    if (searchQuery) {
      query = query.ilike('school_name', `%${searchQuery}%`);
    }

    query = query.order('created_at', { ascending: false });
    
    const from = (currentPage - 1) * itemsPerPage;
    const to = from + itemsPerPage - 1;
    query = query.range(from, to);

    const { data, count, error } = await query;
    if (!error && data) {
      setOrders(data.map((row: any) => ({
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
      if (count !== null) setTotalCount(count);
    }
  };

  useEffect(() => {
    fetchAggregates();
  }, []);

  useEffect(() => {
    fetchOrders();
  }, [paymentFilter, timeFilter, searchQuery, currentPage]);


  const {
    markOrderAsPaid,
    disburseSchoolFee,
  } = useOrders();

  // Pelunasan modal
  const [payingOrder, setPayingOrder] = useState<Order | null>(null);
  const [payNotes, setPayNotes] = useState<string>('');
  
  // Saldo Retur
  const [schoolReturnBalance, setSchoolReturnBalance] = useState({ tagihan: 0, fee: 0 });
  const [useReturnBalance, setUseReturnBalance] = useState(false);

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




  // Open Pelunasan Modal
  const handleOpenPaymentModal = async (order: Order) => {
    setPayingOrder(order);
    setUseReturnBalance(false);
    
    // Fetch school return balance
    const { data } = await supabase.from('app_users').select('return_balance_tagihan, return_balance_fee').eq('id', order.schoolUserId).single();
    if (data) {
      setSchoolReturnBalance({
        tagihan: Number(data.return_balance_tagihan) || 0,
        fee: Number(data.return_balance_fee) || 0
      });
    } else {
      setSchoolReturnBalance({ tagihan: 0, fee: 0 });
    }

    if (order.paidNotes && order.paidNotes.includes('[BUKTI_TRANSFER]')) {
      setPayNotes(order.paidNotes + '\n\n' + 'Telah diverifikasi lunas oleh Koperasi pada ' + new Date().toLocaleString('id-ID'));
    } else {
      setPayNotes('Pembayaran transfer Bank BCA: 0760256757 a.n. Koperasi Konsumen Karyawan BPK Penabur');
    }
  };

  const handleConfirmPayment = async (e: FormEvent) => {
    e.preventDefault();
    if (!payingOrder) return;

    if (useReturnBalance && schoolReturnBalance.tagihan > 0) {
      const tagihanPotong = Math.min(payingOrder.totalPriceStudent, schoolReturnBalance.tagihan);
      const feePotong = Math.min(payingOrder.totalFeeSchool, schoolReturnBalance.fee);
      
      const newTagihan = payingOrder.totalPriceStudent - tagihanPotong;
      const newFee = payingOrder.totalFeeSchool - feePotong;
      
      const finalNotes = payNotes.trim() + `\n[DIPOTONG SALDO RETUR: ${formatRupiah(tagihanPotong)}]`;
      
      // Update order
      const updateData: any = {
        total_price_student: newTagihan,
        total_fee_school: newFee,
      };
      
      if (newTagihan === 0) {
        updateData.payment_status = 'paid';
        updateData.paid_at = new Date().toISOString();
        updateData.paid_notes = finalNotes;
        updateData.fee_status = 'ready'; // Since it's fully paid now
      } else {
        updateData.payment_status = 'unpaid';
        updateData.paid_notes = finalNotes;
      }
      
      await supabase.from('orders').update(updateData).eq('id', payingOrder.id);
      
      // Deduct balance
      await supabase.from('app_users').update({
        return_balance_tagihan: schoolReturnBalance.tagihan - tagihanPotong,
        return_balance_fee: schoolReturnBalance.fee - feePotong
      }).eq('id', payingOrder.schoolUserId);
      
      fetchOrders();
    } else {
      await markOrderAsPaid(payingOrder.id, payNotes.trim());
      setOrders(prev => prev.map(o => o.id === payingOrder.id ? { ...o, payment_status: 'paid', paymentStatus: 'paid' } : o));
    }
    
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
    <div className="kopkar-dashboard">
      <h2>Pengelolaan Pelunasan</h2>

      {/* Stats Cards & Financial Overview */}
      <div className="kopkar-stats">
        <div className="kopkar-stat-card">
          <div className="stat-icon">💰</div>
          <div className="stat-label">Total Tagihan Siswa</div>
          <div className="stat-value" style={{ fontSize: '1.35rem' }}>{formatRupiah(totalOmzetStudent)}</div>
        </div>
        <div className="kopkar-stat-card">
          <div className="stat-icon">💳</div>
          <div className="stat-label">Telah Dilunasi Sekolah</div>
          <div className="stat-value" style={{ fontSize: '1.35rem', color: '#059669' }}>
            {formatRupiah(totalPaidRevenue)}
          </div>
        </div>
        <div className="kopkar-stat-card">
          <div className="stat-icon">📊</div>
          <div className="stat-label">Rekapitulasi Fase</div>
          <div style={{ fontSize: '0.85rem', marginTop: '8px' }}>
            <div>Tahap 1: <strong>{countTahap1}</strong> pesanan</div>
            <div>Tahap 2: <strong>{countTahap2}</strong> pesanan</div>
            <div>Tambahan: <strong>{countTambahan}</strong> pesanan</div>
          </div>
        </div>
        {cancelRequestsCount > 0 && (
          <div className="kopkar-stat-card alert-card">
            <div className="stat-icon">⚠️</div>
            <div className="stat-label">Request Batal</div>
            <div className="stat-value" style={{ color: '#dc2626' }}>{cancelRequestsCount}</div>
          </div>
        )}
        {pendingReturnsCount > 0 && (
          <Link
            to="/kopkar/retur"
            className="kopkar-stat-card alert-card"
            style={{ textDecoration: 'none', borderLeft: '4px solid #e11d48' }}
            title="Klik untuk membuka permohonan retur masuk"
          >
            <div className="stat-icon">↩️</div>
            <div className="stat-label">Retur Masuk Perlu Dicek</div>
            <div className="stat-value" style={{ color: '#e11d48' }}>{pendingReturnsCount}</div>
          </Link>
        )}
      </div>

      {/* TAB 2: HISTORY PEMESANAN DITERIMA & PENCAIRAN FEE SEKOLAH */}
      
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
              <select
                value={timeFilter}
                onChange={(e) => {
                  setTimeFilter(e.target.value);
                  setCurrentPage(1);
                }}
              >
                <option value="all">Semua Waktu</option>
                <option value="this_week">Minggu Ini</option>
                <option value="this_month">Bulan Ini</option>
              </select>
              <select value={paymentFilter} onChange={(e) => setPaymentFilter(e.target.value)}>
                <option value="all">Semua Pembayaran</option>
                <option value="unpaid">Belum Lunas</option>
                <option value="paid">Lunas</option>
              </select>
            </div>
          </div>

          {orders.length > 0 ? (
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
                    {orders.map((order) => (
                      <tr key={order.id}>
                        <td>
                          <strong>{order.id}</strong>
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
                              {order.paidNotes && order.paidNotes.includes('[BUKTI_TRANSFER]') ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                  <span className="badge-pay-paid" style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d' }}>⏳ Menunggu Verifikasi</span>
                                  <a href={order.paidNotes.replace('[BUKTI_TRANSFER] ', '')} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.8rem', color: '#3b82f6', textDecoration: 'underline' }}>Lihat Bukti Transfer</a>
                                  <button
                                    className="btn-pay-action"
                                    style={{ marginTop: '4px' }}
                                    onClick={() => handleOpenPaymentModal(order)}
                                  >
                                    ✅ Verifikasi Lunas
                                  </button>
                                </div>
                              ) : (
                                <>
                                  <span className="badge-pay-unpaid">🔴 Belum Lunas</span>
                                  <button
                                    className="btn-pay-action"
                                    style={{ marginTop: '6px' }}
                                    onClick={() => handleOpenPaymentModal(order)}
                                  >
                                    💵 Konfirmasi Pelunasan
                                  </button>
                                </>
                              )}
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
                              <div className="badge-fee-ready">⏳ Siap Ditransfer</div>
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

              {/* Mobile Card View */}
              <div className="mobile-cards-view">
                {orders.map((order) => (
                  <div key={order.id} className="mobile-order-card completed-card">
                    <div className="mobile-card-header">
                      <div>
                        <span className="mobile-order-id">{order.id}</span>
                        <div style={{ fontWeight: 700, color: '#1e293b' }}>{order.schoolName}</div>
                      </div>
                      <span className="status-badge received">✅ Diterima</span>
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
                          {order.paidNotes && order.paidNotes.includes('[BUKTI_TRANSFER]') ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                               <div className="badge-pay-paid" style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d', textAlign: 'center' }}>⏳ Menunggu Verifikasi</div>
                               <a href={order.paidNotes.replace('[BUKTI_TRANSFER] ', '')} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.9rem', color: '#3b82f6', textDecoration: 'underline', textAlign: 'center', display: 'block' }}>Lihat Foto Bukti Transfer</a>
                               <button
                                className="btn-pay-action full-width-touch"
                                onClick={() => handleOpenPaymentModal(order)}
                              >
                                ✅ Verifikasi Lunas
                              </button>
                            </div>
                          ) : (
                            <>
                              <div className="badge-pay-unpaid">🔴 Sekolah Belum Melunasi</div>
                              <button
                                className="btn-pay-action full-width-touch"
                                style={{ marginTop: '6px' }}
                                onClick={() => handleOpenPaymentModal(order)}
                              >
                                💵 Konfirmasi Pelunasan Sekolah
                              </button>
                            </>
                          )}
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
      

      {/* Modal Pelunasan Pembayaran Sekolah ke Koperasi */}
      {payingOrder && (
        <div className="modal-overlay" onClick={() => setPayingOrder(null)}>
          <div className="modal" style={{ maxWidth: '480px' }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ color: '#059669' }}>💵 Konfirmasi Pelunasan Sekolah</h3>
            <p style={{ fontSize: '0.88rem', color: '#64748b', marginBottom: '14px' }}>
              Pesanan: <strong>{payingOrder.id}</strong> — {payingOrder.schoolName}
            </p>

            <div style={{ background: '#f0fdf4', padding: '12px', borderRadius: '8px', border: '1px solid #bbf7d0', marginBottom: '14px' }}>
              <div style={{ fontSize: '0.85rem', color: '#166534' }}>
                Total Tagihan Siswa yang Diterima Koperasi:
              </div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#15803d', marginTop: '2px', textDecoration: (useReturnBalance && schoolReturnBalance.tagihan > 0) ? 'line-through' : 'none' }}>
                {formatRupiah(payingOrder.totalPriceStudent)}
              </div>
              
              {useReturnBalance && schoolReturnBalance.tagihan > 0 && (
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#dc2626', marginTop: '4px' }}>
                  {formatRupiah(Math.max(0, payingOrder.totalPriceStudent - schoolReturnBalance.tagihan))}
                </div>
              )}

              <div style={{ fontSize: '0.75rem', color: '#166534', marginTop: '4px' }}>
                Hak Fee Sekolah sebesar <strong style={{ textDecoration: (useReturnBalance && schoolReturnBalance.fee > 0) ? 'line-through' : 'none' }}>{formatRupiah(payingOrder.totalFeeSchool)}</strong> 
                {useReturnBalance && schoolReturnBalance.fee > 0 && <strong> {formatRupiah(Math.max(0, payingOrder.totalFeeSchool - schoolReturnBalance.fee))} </strong>}
                akan terbuka dan siap dicairkan ke sekolah setelah konfirmasi ini.
              </div>
            </div>

            {schoolReturnBalance.tagihan > 0 && (
              <div style={{ background: '#fef3c7', padding: '12px', borderRadius: '8px', border: '1px solid #fde68a', marginBottom: '14px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.9rem', color: '#92400e', fontWeight: 'bold' }}>
                  <input 
                    type="checkbox" 
                    checked={useReturnBalance} 
                    onChange={(e) => setUseReturnBalance(e.target.checked)} 
                    style={{ width: '18px', height: '18px' }}
                  />
                  Gunakan Saldo Potongan Retur Sekolah (Tersedia: {formatRupiah(schoolReturnBalance.tagihan)})
                </label>
              </div>
            )}

            <form className="modal-form" onSubmit={handleConfirmPayment}>
              <div className="form-group">
                <label>Catatan Bukti Pembayaran</label>
                <textarea
                  value={payNotes}
                  onChange={(e) => setPayNotes(e.target.value)}
                  rows={3}
                  required
                />
              </div>

              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setPayingOrder(null)}>
                  Batal
                </button>
                <button type="submit" className="btn-approve" style={{ padding: '10px 18px' }}>
                  ✅ Verifikasi Lunas
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Pencairan Fee Sekolah */}
      {disbursingOrder && (
        <div className="modal-overlay" onClick={() => setDisbursingOrder(null)}>
          <div className="modal" style={{ maxWidth: '480px' }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ color: '#2563eb' }}>💸 Bayarkan Fee Sekolah</h3>
            <p style={{ fontSize: '0.88rem', color: '#64748b', marginBottom: '14px' }}>
              Penerima: <strong>{disbursingOrder.schoolName}</strong> (No: {disbursingOrder.id})
            </p>

            <div style={{ background: '#eff6ff', padding: '12px', borderRadius: '8px', border: '1px solid #bfdbfe', marginBottom: '14px' }}>
              <div style={{ fontSize: '0.85rem', color: '#1e40af' }}>
                Nominal Fee Hak Sekolah:
              </div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#1d4ed8', marginTop: '2px' }}>
                {formatRupiah(disbursingOrder.totalFeeSchool)}
              </div>
            </div>

            <form className="modal-form" onSubmit={handleConfirmDisburse}>
              <div className="form-group">
                <label>Catatan Transfer / No. Referensi Bank</label>
                <textarea
                  value={disburseNotes}
                  onChange={(e) => setDisburseNotes(e.target.value)}
                  rows={3}
                  required
                />
              </div>

              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setDisbursingOrder(null)}>
                  Batal
                </button>
                <button type="submit" className="btn-ship" style={{ padding: '10px 18px' }}>
                  ✅ Konfirmasi Pembayaran Fee
                </button>
              </div>
            </form>
          </div>
        </div>
      )}


      {/* Print Only Surat Jalan */}
      <SuratJalanPrint order={printingOrder} />
    </div>
  );
};

export default KopkarPelunasan;
