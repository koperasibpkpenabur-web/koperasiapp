import { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { isSchoolMatch, cleanSchoolName } from '../../utils/schoolMatcher';
import './schoolKanvasOrders.css';

interface ParentOrderItem {
  id: string;
  parent_order_id: string;
  product_name: string;
  category?: string;
  size?: string;
  quantity: number;
  price_student: number;
  subtotal: number;
}

interface ParentOrder {
  id: string;
  created_at: string;
  school_name: string;
  school_level?: string;
  student_name: string;
  student_class?: string;
  parent_name: string;
  parent_phone: string;
  parent_email?: string;
  total_amount: number;
  payment_method?: string;
  payment_status?: string;
  payment_receipt_url?: string;
  delivery_method?: string;
  shipping_address?: string;
  status: 'submitted' | 'processing' | 'ready_for_pickup' | 'completed' | 'cancelled' | string;
  academic_year?: string;
  verified_at?: string;
  verified_by?: string;
  ready_at?: string;
  ready_by?: string;
  completed_at?: string;
  completed_by?: string;
  pickup_notes?: string;
  school_notes?: string;
  items?: ParentOrderItem[];
}

export default function SchoolKanvasOrders() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<ParentOrder[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedOrder, setSelectedOrder] = useState<ParentOrder | null>(null);
  const [isUpdating, setIsUpdating] = useState<boolean>(false);
  const [activeSchoolFilter, setActiveSchoolFilter] = useState<string>('all');

  // Fetch orders from Supabase parent_orders
  const fetchOrders = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data: ordersData, error: ordersErr } = await supabase
        .from('parent_orders')
        .select('*')
        .order('created_at', { ascending: false });

      if (ordersErr) {
        console.error('Error fetching parent_orders:', ordersErr);
        setIsLoading(false);
        return;
      }

      if (!ordersData || ordersData.length === 0) {
        setOrders([]);
        setIsLoading(false);
        return;
      }

      // Fetch items for all orders
      const orderIds = ordersData.map((o) => o.id);
      const { data: itemsData } = await supabase
        .from('parent_order_items')
        .select('*')
        .in('parent_order_id', orderIds);

      const itemsMap = new Map<string, ParentOrderItem[]>();
      if (itemsData) {
        itemsData.forEach((it) => {
          const list = itemsMap.get(it.parent_order_id) || [];
          list.push(it);
          itemsMap.set(it.parent_order_id, list);
        });
      }

      const fullOrders: ParentOrder[] = ordersData.map((o) => ({
        ...o,
        items: itemsMap.get(o.id) || [],
      }));

      setOrders(fullOrders);
    } catch (err) {
      console.error('Exception fetching parent_orders:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrders();

    // Listen to realtime changes in parent_orders
    const channel = supabase
      .channel('realtime_parent_orders')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'parent_orders' },
        () => {
          fetchOrders();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchOrders]);

  // Unique list of schools from orders (for Admin/Kopkar filter)
  const schoolOptions = useMemo(() => {
    const set = new Set<string>();
    orders.forEach((o) => {
      if (o.school_name) set.add(o.school_name);
    });
    return Array.from(set).sort();
  }, [orders]);

  // Filter orders by school and search query
  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      // 1. School permission filter
      if (user?.role === 'sekolah') {
        const isMatch = isSchoolMatch(o.school_name, user?.schoolName);
        if (!isMatch) return false;
      } else if (activeSchoolFilter !== 'all') {
        if (!isSchoolMatch(o.school_name, activeSchoolFilter)) return false;
      }

      // 2. Status filter
      if (statusFilter !== 'all' && o.status !== statusFilter) {
        return false;
      }

      // 3. Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchId = (o.id || '').toLowerCase().includes(q);
        const matchStudent = (o.student_name || '').toLowerCase().includes(q);
        const matchClass = (o.student_class || '').toLowerCase().includes(q);
        const matchParent = (o.parent_name || '').toLowerCase().includes(q);
        const matchPhone = (o.parent_phone || '').includes(q);
        return matchId || matchStudent || matchClass || matchParent || matchPhone;
      }

      return true;
    });
  }, [orders, user, activeSchoolFilter, statusFilter, searchQuery]);

  // Counts by status
  const statusCounts = useMemo(() => {
    const baseList = orders.filter((o) => {
      if (user?.role === 'sekolah') {
        return isSchoolMatch(o.school_name, user?.schoolName);
      }
      if (activeSchoolFilter !== 'all') {
        return isSchoolMatch(o.school_name, activeSchoolFilter);
      }
      return true;
    });

    const c = { all: baseList.length, submitted: 0, processing: 0, ready_for_pickup: 0, completed: 0, cancelled: 0 };
    baseList.forEach((o) => {
      if (o.status in c) {
        (c as any)[o.status]++;
      }
    });
    return c;
  }, [orders, user, activeSchoolFilter]);

  // Action: Update Order Status
  const handleUpdateStatus = async (
    order: ParentOrder,
    newStatus: 'processing' | 'ready_for_pickup' | 'completed' | 'cancelled',
    actionDesc: string
  ) => {
    if (!window.confirm(`Konfirmasi: Apakah Anda yakin ingin memproses pesanan #${order.id} ke status "${actionDesc}"?`)) {
      return;
    }

    setIsUpdating(true);
    try {
      const now = new Date().toISOString();
      const staffName = user?.name || user?.username || 'Petugas Sekolah';

      const updates: any = {
        status: newStatus,
      };

      if (newStatus === 'processing') {
        updates.verified_at = now;
        updates.verified_by = staffName;
        updates.payment_status = 'paid';
      } else if (newStatus === 'ready_for_pickup') {
        updates.ready_at = now;
        updates.ready_by = staffName;
      } else if (newStatus === 'completed') {
        updates.completed_at = now;
        updates.completed_by = staffName;
      }

      const { error } = await supabase
        .from('parent_orders')
        .update(updates)
        .eq('id', order.id);

      if (error) {
        alert(`Gagal memperbarui status: ${error.message}`);
        return;
      }

      // Update local state
      setOrders((prev) =>
        prev.map((o) => (o.id === order.id ? { ...o, ...updates } : o))
      );

      if (selectedOrder && selectedOrder.id === order.id) {
        setSelectedOrder((prev) => (prev ? { ...prev, ...updates } : null));
      }

      alert(`Pesanan #${order.id} berhasil diperbarui menjadi "${actionDesc}"!`);
    } catch (err) {
      console.error('Error updating parent order:', err);
      alert('Terjadi kesalahan sistem saat memperbarui status.');
    } finally {
      setIsUpdating(false);
    }
  };

  const getCleanPhone = (phone?: string) => {
    if (!phone) return '';
    let p = phone.replace(/[^0-9]/g, '');
    if (p.startsWith('0')) p = '62' + p.slice(1);
    return p;
  };

  return (
    <div className="kanvas-orders-page">
      {/* Header */}
      <div className="kanvas-orders-header">
        <div>
          <h2>Pesanan Siswa (Kanvas PENABUR)</h2>
          <p className="kanvas-orders-subtitle">
            Daftar pesanan seragam masuk dari wali murid untuk pengambilan di sekolah.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span className="kanvas-school-badge">
            🏫 {user?.role === 'sekolah' ? (user?.schoolName || 'Sekolah') : 'Akses Koperasi / Admin'}
          </span>
          <button
            onClick={() => fetchOrders()}
            disabled={isLoading}
            className="btn-action-sm btn-verify"
            title="Segarkan data pesanan"
          >
            {isLoading ? '⏳ Memuat...' : '🔄 Segarkan'}
          </button>
        </div>
      </div>

      {/* Stat Cards / Tab Filter */}
      <div className="kanvas-stat-grid">
        <div
          className={`kanvas-stat-card ${statusFilter === 'all' ? 'active' : ''}`}
          onClick={() => setStatusFilter('all')}
        >
          <div>
            <div className="kanvas-stat-label">Semua Pesanan</div>
            <div className="kanvas-stat-val">{statusCounts.all}</div>
          </div>
          <span style={{ fontSize: '1.4rem' }}>📦</span>
        </div>

        <div
          className={`kanvas-stat-card ${statusFilter === 'submitted' ? 'active' : ''}`}
          onClick={() => setStatusFilter('submitted')}
        >
          <div>
            <div className="kanvas-stat-label" style={{ color: '#d97706' }}>Menunggu Verifikasi</div>
            <div className="kanvas-stat-val" style={{ color: '#d97706' }}>{statusCounts.submitted}</div>
          </div>
          <span style={{ fontSize: '1.4rem' }}>⏳</span>
        </div>

        <div
          className={`kanvas-stat-card ${statusFilter === 'processing' ? 'active' : ''}`}
          onClick={() => setStatusFilter('processing')}
        >
          <div>
            <div className="kanvas-stat-label" style={{ color: '#0284c7' }}>Sedang Disiapkan</div>
            <div className="kanvas-stat-val" style={{ color: '#0284c7' }}>{statusCounts.processing}</div>
          </div>
          <span style={{ fontSize: '1.4rem' }}>⚙️</span>
        </div>

        <div
          className={`kanvas-stat-card ${statusFilter === 'ready_for_pickup' ? 'active' : ''}`}
          onClick={() => setStatusFilter('ready_for_pickup')}
        >
          <div>
            <div className="kanvas-stat-label" style={{ color: '#059669' }}>Siap Diambil</div>
            <div className="kanvas-stat-val" style={{ color: '#059669' }}>{statusCounts.ready_for_pickup}</div>
          </div>
          <span style={{ fontSize: '1.4rem' }}>🎒</span>
        </div>

        <div
          className={`kanvas-stat-card ${statusFilter === 'completed' ? 'active' : ''}`}
          onClick={() => setStatusFilter('completed')}
        >
          <div>
            <div className="kanvas-stat-label" style={{ color: '#475569' }}>Selesai Diserahkan</div>
            <div className="kanvas-stat-val" style={{ color: '#475569' }}>{statusCounts.completed}</div>
          </div>
          <span style={{ fontSize: '1.4rem' }}>✅</span>
        </div>
      </div>

      {/* Toolbar & Search */}
      <div className="kanvas-toolbar">
        <div className="kanvas-search-box">
          <span className="kanvas-search-icon">🔍</span>
          <input
            type="text"
            className="kanvas-search-input"
            placeholder="Cari No. Order, Nama Siswa, Kelas, atau No. WA..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {user?.role !== 'sekolah' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#64748b' }}>Filter Sekolah:</span>
            <select
              style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.82rem' }}
              value={activeSchoolFilter}
              onChange={(e) => setActiveSchoolFilter(e.target.value)}
            >
              <option value="all">Semua Sekolah ({schoolOptions.length})</option>
              {schoolOptions.map((sch) => (
                <option key={sch} value={sch}>
                  {cleanSchoolName(sch)}
                </option>
              ))}
            </select>
          </div>
        )}

        <div style={{ fontSize: '0.82rem', color: '#64748b' }}>
          Menampilkan <strong>{filteredOrders.length}</strong> dari <strong>{orders.length}</strong> pesanan
        </div>
      </div>

      {/* Orders Table */}
      <div className="kanvas-table-wrap">
        <table className="kanvas-table">
          <thead>
            <tr>
              <th>No. Order & Tanggal</th>
              <th>Data Siswa & Sekolah</th>
              <th>Wali Murid / Kontak</th>
              <th>Rincian Seragam</th>
              <th>Total & Pengambilan</th>
              <th>Status Pesanan</th>
              <th style={{ textAlign: 'center' }}>Aksi / Serah Terima</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
                  ⏳ Memuat data pesanan Kanvas...
                </td>
              </tr>
            ) : filteredOrders.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '50px 20px' }}>
                  <div style={{ fontSize: '2.5rem', marginBottom: '8px' }}>📭</div>
                  <h4 style={{ margin: '0 0 4px 0', color: '#334155', fontWeight: 700 }}>
                    Tidak Ada Pesanan Ditemukan
                  </h4>
                  <p style={{ margin: 0, fontSize: '0.82rem', color: '#94a3b8' }}>
                    {searchQuery
                      ? 'Coba ganti kata kunci pencarian Anda.'
                      : 'Belum ada pesanan seragam masuk dari wali murid untuk filter ini.'}
                  </p>
                </td>
              </tr>
            ) : (
              filteredOrders.map((ord) => {
                const itemsCount = ord.items?.length || 0;
                const isHouseDelivery = ord.delivery_method === 'rumah';

                return (
                  <tr key={ord.id}>
                    {/* No. Order & Tanggal */}
                    <td>
                      <div style={{ fontWeight: 800, color: '#0F2C59', fontFamily: 'monospace', fontSize: '0.9rem' }}>
                        {ord.id}
                      </div>
                      <div style={{ fontSize: '0.74rem', color: '#64748b', marginTop: '2px' }}>
                        {ord.created_at
                          ? new Date(ord.created_at).toLocaleDateString('id-ID', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : '-'}
                      </div>
                    </td>

                    {/* Siswa & Sekolah */}
                    <td>
                      <div style={{ fontWeight: 700, color: '#0f172a' }}>{ord.student_name}</div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>
                        {ord.student_class ? `Kelas: ${ord.student_class}` : 'Kelas -'}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: '#0369a1', fontWeight: 600 }}>
                        {ord.school_name}
                      </div>
                    </td>

                    {/* Wali Murid */}
                    <td>
                      <div style={{ fontWeight: 600, color: '#1e293b' }}>{ord.parent_name || '-'}</div>
                      {ord.parent_phone && (
                        <div style={{ marginTop: '2px' }}>
                          <a
                            href={`https://wa.me/${getCleanPhone(ord.parent_phone)}?text=Halo%20Bapak%2FIbu%20${encodeURIComponent(ord.parent_name || '')}%2C%20mengenai%20pesanan%20seragam%20PENABUR%20no%20${encodeURIComponent(ord.id)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              fontSize: '0.75rem',
                              color: '#059669',
                              textDecoration: 'none',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              fontWeight: 700,
                            }}
                          >
                            💬 {ord.parent_phone}
                          </a>
                        </div>
                      )}
                    </td>

                    {/* Rincian Seragam */}
                    <td>
                      <button
                        onClick={() => setSelectedOrder(ord)}
                        style={{
                          background: '#f8fafc',
                          border: '1px solid #cbd5e1',
                          padding: '4px 10px',
                          borderRadius: '8px',
                          fontSize: '0.78rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          color: '#0F2C59',
                        }}
                      >
                        📋 {itemsCount} Jenis Seragam
                      </button>
                    </td>

                    {/* Total & Pengambilan */}
                    <td>
                      <div style={{ fontWeight: 800, color: '#0F2C59', fontSize: '0.92rem' }}>
                        Rp{(ord.total_amount || 0).toLocaleString('id-ID')}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: isHouseDelivery ? '#d97706' : '#166534', fontWeight: 700, marginTop: '2px' }}>
                        {isHouseDelivery ? '🏠 Kirim ke Rumah' : '🏫 Ambil di Sekolah'}
                      </div>
                      {ord.payment_receipt_url && (
                        <div style={{ marginTop: '3px' }}>
                          <button
                            onClick={() => setSelectedOrder(ord)}
                            style={{ fontSize: '0.7rem', color: '#0284c7', background: 'none', border: 'none', padding: 0, textDecoration: 'underline', cursor: 'pointer', fontWeight: 600 }}
                          >
                            Bukti Transfer
                          </button>
                        </div>
                      )}
                    </td>

                    {/* Status Badge */}
                    <td>
                      {ord.status === 'completed' && (
                        <span className="status-pill status-completed">
                          ✅ Selesai
                        </span>
                      )}
                      {ord.status === 'ready_for_pickup' && (
                        <span className="status-pill status-ready_for_pickup">
                          🎒 Siap Diambil
                        </span>
                      )}
                      {ord.status === 'processing' && (
                        <span className="status-pill status-processing">
                          ⚙️ Disiapkan
                        </span>
                      )}
                      {ord.status === 'submitted' && (
                        <span className="status-pill status-submitted">
                          ⏳ Perlu Verifikasi
                        </span>
                      )}
                      {ord.status === 'cancelled' && (
                        <span className="status-pill status-cancelled">
                          ❌ Dibatalkan
                        </span>
                      )}
                    </td>

                    {/* Aksi Bertahap */}
                    <td style={{ textAlign: 'center' }}>
                      <div style={{ display: 'inline-flex', flexDirection: 'column', gap: '6px' }}>
                        {ord.status === 'submitted' && (
                          <button
                            onClick={() => handleUpdateStatus(ord, 'processing', 'Verifikasi Pembayaran & Siapkan')}
                            disabled={isUpdating}
                            className="btn-action-sm btn-verify"
                            title="Konfirmasi bahwa bukti bayar valid dan seragam siap dikemas"
                          >
                            ✔️ Verifikasi Bayar
                          </button>
                        )}

                        {ord.status === 'processing' && (
                          <button
                            onClick={() => handleUpdateStatus(ord, 'ready_for_pickup', 'Seragam Siap Diambil')}
                            disabled={isUpdating}
                            className="btn-action-sm btn-ready"
                            title="Seragam sudah selesai dikemas dan siap di meja TU"
                          >
                            🎒 Seragam Ready
                          </button>
                        )}

                        {ord.status === 'ready_for_pickup' && (
                          <button
                            onClick={() => handleUpdateStatus(ord, 'completed', 'Selesai / Serahkan Seragam')}
                            disabled={isUpdating}
                            className="btn-action-sm btn-complete"
                            title="Serahkan seragam ke siswa/wali murid dan selesaikan pesanan"
                          >
                            🤝 Serahkan (Selesai)
                          </button>
                        )}

                        {ord.status === 'completed' && (
                          <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>
                            Diserahkan {ord.completed_by ? `oleh ${ord.completed_by}` : ''}
                          </span>
                        )}

                        <button
                          onClick={() => setSelectedOrder(ord)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#64748b',
                            fontSize: '0.72rem',
                            cursor: 'pointer',
                            textDecoration: 'underline',
                          }}
                        >
                          Detail & Cetak
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Modal Detail & Serah Terima Pesanan */}
      {selectedOrder && (
        <div className="kanvas-modal-overlay" onClick={() => setSelectedOrder(null)}>
          <div className="kanvas-modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="kanvas-modal-header">
              <div>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#0369a1', textTransform: 'uppercase' }}>
                  Detail Pesanan Kanvas PENABUR
                </span>
                <h3 className="kanvas-modal-title">#{selectedOrder.id}</h3>
              </div>
              <button className="kanvas-modal-close" onClick={() => setSelectedOrder(null)}>
                ✕
              </button>
            </div>

            {/* Info Siswa & Sekolah */}
            <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '12px', marginBottom: '16px', fontSize: '0.85rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <div style={{ color: '#64748b', fontSize: '0.75rem', fontWeight: 600 }}>Nama Siswa:</div>
                  <div style={{ fontWeight: 800, color: '#0f172a' }}>{selectedOrder.student_name}</div>
                  <div style={{ fontSize: '0.75rem', color: '#475569' }}>Kelas: {selectedOrder.student_class || '-'}</div>
                </div>
                <div>
                  <div style={{ color: '#64748b', fontSize: '0.75rem', fontWeight: 600 }}>Sekolah Tujuan:</div>
                  <div style={{ fontWeight: 700, color: '#0F2C59' }}>{selectedOrder.school_name}</div>
                  <div style={{ fontSize: '0.75rem', color: '#475569' }}>T.A: {selectedOrder.academic_year || '2026/2027'}</div>
                </div>
              </div>

              <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <span style={{ color: '#64748b', fontSize: '0.75rem' }}>Wali Murid: </span>
                  <strong style={{ color: '#1e293b' }}>{selectedOrder.parent_name}</strong> ({selectedOrder.parent_phone})
                </div>
                {selectedOrder.parent_phone && (
                  <a
                    href={`https://wa.me/${getCleanPhone(selectedOrder.parent_phone)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-action-sm btn-ready"
                    style={{ textDecoration: 'none' }}
                  >
                    💬 Chat WA
                  </a>
                )}
              </div>
            </div>

            {/* Bukti Transfer */}
            {selectedOrder.payment_receipt_url && (
              <div style={{ marginBottom: '16px', padding: '12px', background: '#e0f2fe', borderRadius: '12px', fontSize: '0.82rem' }}>
                <div style={{ fontWeight: 700, color: '#0369a1', marginBottom: '4px' }}>Bukti Transfer Pembayaran:</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ color: '#475569', wordBreak: 'break-all' }}>{selectedOrder.payment_receipt_url}</span>
                  <a
                    href={selectedOrder.payment_receipt_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ padding: '4px 10px', background: '#0284c7', color: '#ffffff', borderRadius: '6px', textDecoration: 'none', fontWeight: 700, fontSize: '0.75rem', whiteSpace: 'nowrap' }}
                  >
                    Buka Bukti ↗
                  </a>
                </div>
              </div>
            )}

            {/* Rincian Barang Seragam */}
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontWeight: 700, color: '#1e293b', fontSize: '0.88rem', marginBottom: '8px' }}>
                Daftar Seragam Dipesan ({selectedOrder.items?.length || 0} item):
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                <thead>
                  <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #cbd5e1' }}>
                    <th style={{ padding: '8px', textAlign: 'left' }}>Nama Seragam</th>
                    <th style={{ padding: '8px', textAlign: 'center' }}>Ukuran</th>
                    <th style={{ padding: '8px', textAlign: 'center' }}>Qty</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>Harga</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedOrder.items?.map((it, itemIdx) => (
                    <tr key={itemIdx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '8px', fontWeight: 600 }}>{it.product_name}</td>
                      <td style={{ padding: '8px', textAlign: 'center' }}>
                        <span style={{ background: '#fef3c7', padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}>
                          {it.size || '-'}
                        </span>
                      </td>
                      <td style={{ padding: '8px', textAlign: 'center', fontWeight: 700 }}>{it.quantity}</td>
                      <td style={{ padding: '8px', textAlign: 'right' }}>
                        Rp{(it.price_student || 0).toLocaleString('id-ID')}
                      </td>
                      <td style={{ padding: '8px', textAlign: 'right', fontWeight: 700 }}>
                        Rp{(it.subtotal || (it.price_student * it.quantity) || 0).toLocaleString('id-ID')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px', paddingTop: '10px', borderTop: '2px dashed #e2e8f0' }}>
                <span style={{ fontWeight: 700, color: '#64748b' }}>Total Tagihan Pesanan:</span>
                <span style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0F2C59' }}>
                  Rp{(selectedOrder.total_amount || 0).toLocaleString('id-ID')}
                </span>
              </div>
            </div>

            {/* Riwayat Timeline Status */}
            <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '12px', marginBottom: '16px', fontSize: '0.78rem', color: '#64748b' }}>
              <div style={{ fontWeight: 700, color: '#334155', marginBottom: '4px' }}>Riwayat Status:</div>
              <div>📅 Dibuat: {selectedOrder.created_at ? new Date(selectedOrder.created_at).toLocaleString('id-ID') : '-'}</div>
              {selectedOrder.verified_at && (
                <div>✔️ Diverifikasi: {new Date(selectedOrder.verified_at).toLocaleString('id-ID')} {selectedOrder.verified_by ? `(oleh ${selectedOrder.verified_by})` : ''}</div>
              )}
              {selectedOrder.ready_at && (
                <div>🎒 Siap Diambil: {new Date(selectedOrder.ready_at).toLocaleString('id-ID')} {selectedOrder.ready_by ? `(oleh ${selectedOrder.ready_by})` : ''}</div>
              )}
              {selectedOrder.completed_at && (
                <div>🤝 Selesai: {new Date(selectedOrder.completed_at).toLocaleString('id-ID')} {selectedOrder.completed_by ? `(oleh ${selectedOrder.completed_by})` : ''}</div>
              )}
            </div>

            {/* Action Buttons in Modal */}
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button
                onClick={() => window.print()}
                className="btn-action-sm"
                style={{ background: '#f1f5f9', color: '#334155' }}
              >
                🖨️ Cetak Lembar Serah Terima
              </button>

              {selectedOrder.status === 'submitted' && (
                <button
                  onClick={() => handleUpdateStatus(selectedOrder, 'processing', 'Verifikasi Pembayaran & Siapkan')}
                  disabled={isUpdating}
                  className="btn-action-sm btn-verify"
                >
                  ✔️ Verifikasi Bayar
                </button>
              )}

              {selectedOrder.status === 'processing' && (
                <button
                  onClick={() => handleUpdateStatus(selectedOrder, 'ready_for_pickup', 'Seragam Siap Diambil')}
                  disabled={isUpdating}
                  className="btn-action-sm btn-ready"
                >
                  🎒 Tandai Siap Diambil
                </button>
              )}

              {selectedOrder.status === 'ready_for_pickup' && (
                <button
                  onClick={() => handleUpdateStatus(selectedOrder, 'completed', 'Selesai / Serahkan Seragam')}
                  disabled={isUpdating}
                  className="btn-action-sm btn-complete"
                >
                  🤝 Serahkan ke Siswa (Selesai)
                </button>
              )}

              <button
                onClick={() => setSelectedOrder(null)}
                className="btn-action-sm"
                style={{ background: '#e2e8f0', color: '#475569' }}
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
