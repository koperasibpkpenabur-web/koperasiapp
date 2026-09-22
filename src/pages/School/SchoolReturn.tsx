import { useState, type FormEvent } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useReturns } from '../../context/ReturnContext';
import { useProducts } from '../../context/ProductContext';
import type { ReturnRequest, ReturnItem, SchoolLevel } from '../../types';
import './returns.css';

const REASON_CATEGORIES = [
  'Cacat Jahitan / Bahan Pabrik',
  'Salah Ukuran / Salah Kirim',
  'Buku Cacat Cetak / Rusak Fisik',
  'Kerusakan Selama Pengiriman',
  'Kelebihan Kuantiti Pengiriman',
  'Lainnya',
];

const SchoolReturn = () => {
  const { user } = useAuth();
  const { getReturnsBySchoolId, createReturn } = useReturns();
  const { products, getProductsByLevel } = useProducts();

  // All returns for this school
  const schoolReturns = user ? getReturnsBySchoolId(user.id) : [];

  // Filter tabs & search
  const [activeTab, setActiveTab] = useState<'all' | 'pending' | 'accepted' | 'rejected'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [viewingReturn, setViewingReturn] = useState<ReturnRequest | null>(null);

  // Form State
  const schoolLevel: SchoolLevel = user?.schoolLevel || 'SMP';
  const availableCatalog = getProductsByLevel(schoolLevel).length > 0
    ? getProductsByLevel(schoolLevel)
    : products;

  const [returnItems, setReturnItems] = useState<ReturnItem[]>([
    {
      productId: availableCatalog[0]?.id || '',
      productCode: availableCatalog[0]?.code || '',
      productName: availableCatalog[0]?.name || 'Seragam Sekolah',
      quantity: 1,
      itemReason: '',
    },
  ]);

  const todayStr = new Date().toISOString().split('T')[0];
  const currentTimeStr = new Date().toTimeString().slice(0, 5);

  const [reasonCategory, setReasonCategory] = useState(REASON_CATEGORIES[0]);
  const [reasonDetail, setReasonDetail] = useState('');
  const [departureDate, setDepartureDate] = useState(todayStr);
  const [departureTime, setDepartureTime] = useState(currentTimeStr);
  const [shippingNote, setShippingNote] = useState('');
  const [formError, setFormError] = useState('');
  const [submitSuccess, setSubmitSuccess] = useState('');

  // Stats calculation
  const totalCount = schoolReturns.length;
  const pendingCount = schoolReturns.filter((r) => r.status === 'requested' || r.status === 'in_transit').length;
  const acceptedCount = schoolReturns.filter((r) => r.status === 'accepted').length;
  const rejectedCount = schoolReturns.filter((r) => r.status === 'rejected').length;

  // Filtered returns
  const filteredReturns = schoolReturns.filter((r) => {
    let matchTab = true;
    if (activeTab === 'pending') matchTab = r.status === 'requested' || r.status === 'in_transit';
    else if (activeTab === 'accepted') matchTab = r.status === 'accepted';
    else if (activeTab === 'rejected') matchTab = r.status === 'rejected';

    const matchSearch =
      r.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.reason.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.items.some((it) => it.productName.toLowerCase().includes(searchQuery.toLowerCase()));

    return matchTab && matchSearch;
  });

  // Handlers for Items Builder
  const handleAddItem = () => {
    const defaultProd = availableCatalog[0] || products[0];
    setReturnItems((prev) => [
      ...prev,
      {
        productId: defaultProd?.id || '',
        productCode: defaultProd?.code || '',
        productName: defaultProd?.name || 'Barang Baru',
        quantity: 1,
        itemReason: '',
      },
    ]);
  };

  const handleRemoveItem = (index: number) => {
    if (returnItems.length <= 1) return;
    setReturnItems((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleProductSelect = (index: number, prodId: string) => {
    const selected = products.find((p) => p.id === prodId);
    if (!selected) return;

    setReturnItems((prev) =>
      prev.map((item, idx) => {
        if (idx !== index) return item;
        return {
          ...item,
          productId: selected.id,
          productCode: selected.code,
          productName: selected.name,
        };
      })
    );
  };

  const handleItemQtyChange = (index: number, qty: number) => {
    const validQty = Math.max(1, qty);
    setReturnItems((prev) =>
      prev.map((item, idx) => {
        if (idx !== index) return item;
        return { ...item, quantity: validQty };
      })
    );
  };

  const handleItemReasonChange = (index: number, text: string) => {
    setReturnItems((prev) =>
      prev.map((item, idx) => {
        if (idx !== index) return item;
        return { ...item, itemReason: text };
      })
    );
  };

  const resetForm = () => {
    const defaultProd = availableCatalog[0] || products[0];
    setReturnItems([
      {
        productId: defaultProd?.id || '',
        productCode: defaultProd?.code || '',
        productName: defaultProd?.name || 'Seragam Sekolah',
        quantity: 1,
        itemReason: '',
      },
    ]);
    setReasonCategory(REASON_CATEGORIES[0]);
    setReasonDetail('');
    setDepartureDate(todayStr);
    setDepartureTime(currentTimeStr);
    setShippingNote('');
    setFormError('');
  };

  const handleSubmitReturn = (e: FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!user) {
      setFormError('Sesi login telah berakhir.');
      return;
    }

    if (!reasonDetail.trim()) {
      setFormError('Alasan retur detail wajib diisi.');
      return;
    }

    if (!departureDate || !departureTime) {
      setFormError('Tanggal dan jam keberangkatan barang wajib diisi.');
      return;
    }

    const res = createReturn({
      schoolUserId: user.id,
      schoolName: user.schoolName || user.name,
      schoolLevel: user.schoolLevel,
      items: returnItems,
      reasonCategory,
      reason: reasonDetail,
      departureDate,
      departureTime,
      shippingNote,
    });

    if (res.success) {
      setShowCreateModal(false);
      resetForm();
      setSubmitSuccess(`Permohonan retur ${res.id} berhasil diajukan dan dikirim ke Koperasi!`);
      setTimeout(() => setSubmitSuccess(''), 5000);
    } else {
      setFormError(res.error || 'Gagal mengajukan retur.');
    }
  };

  const formatDateId = (dateStr?: string) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  return (
    <div className="returns-container">
      {/* Header */}
      <div className="returns-header">
        <div>
          <h2>↩️ Retur Barang Sekolah</h2>
          <div className="returns-subtitle">
            Kelola pengajuan retur barang bermasalah / salah kirim, jadwalkan pengantaran, dan pantau bukti konfirmasi penerimaan dari Koperasi Karyawan.
          </div>
        </div>
        <button
          type="button"
          className="btn-new-return"
          onClick={() => {
            resetForm();
            setShowCreateModal(true);
          }}
        >
          <span>➕</span> Ajukan Retur Barang
        </button>
      </div>

      {/* Success Notification Alert */}
      {submitSuccess && (
        <div className="return-info-callout success" style={{ marginBottom: '20px' }}>
          <strong>Berhasil!</strong> {submitSuccess}
        </div>
      )}

      {/* Stats Cards */}
      <div className="returns-stats">
        <div className="return-stat-card">
          <div className="return-stat-icon">📋</div>
          <div className="return-stat-info">
            <div className="return-stat-label">Total Pengajuan</div>
            <div className="return-stat-val">{totalCount}</div>
          </div>
        </div>

        <div className="return-stat-card warning">
          <div className="return-stat-icon">⏳</div>
          <div className="return-stat-info">
            <div className="return-stat-label">Menunggu Koperasi</div>
            <div className="return-stat-val">{pendingCount}</div>
          </div>
        </div>

        <div className="return-stat-card success">
          <div className="return-stat-icon">✅</div>
          <div className="return-stat-info">
            <div className="return-stat-label">Diterima Koperasi</div>
            <div className="return-stat-val">{acceptedCount}</div>
          </div>
        </div>

        <div className="return-stat-card danger">
          <div className="return-stat-icon">❌</div>
          <div className="return-stat-info">
            <div className="return-stat-label">Retur Ditolak</div>
            <div className="return-stat-val">{rejectedCount}</div>
          </div>
        </div>
      </div>

      {/* Toolbar: Filter Tabs & Search */}
      <div className="returns-toolbar">
        <div className="returns-tabs">
          <button
            type="button"
            className={`returns-tab-btn ${activeTab === 'all' ? 'active' : ''}`}
            onClick={() => setActiveTab('all')}
          >
            Semua <span className="tab-badge">{totalCount}</span>
          </button>
          <button
            type="button"
            className={`returns-tab-btn ${activeTab === 'pending' ? 'active' : ''}`}
            onClick={() => setActiveTab('pending')}
          >
            ⏳ Menunggu Koperasi <span className="tab-badge">{pendingCount}</span>
          </button>
          <button
            type="button"
            className={`returns-tab-btn ${activeTab === 'accepted' ? 'active' : ''}`}
            onClick={() => setActiveTab('accepted')}
          >
            ✅ Sudah Diterima <span className="tab-badge">{acceptedCount}</span>
          </button>
          <button
            type="button"
            className={`returns-tab-btn ${activeTab === 'rejected' ? 'active' : ''}`}
            onClick={() => setActiveTab('rejected')}
          >
            ❌ Ditolak <span className="tab-badge">{rejectedCount}</span>
          </button>
        </div>

        <div className="returns-search-box">
          <span>🔍</span>
          <input
            type="text"
            placeholder="Cari ID retur, alasan, atau nama barang..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Returns List */}
      {filteredReturns.length === 0 ? (
        <div className="returns-empty">
          <div className="returns-empty-icon">📦</div>
          <h4>Belum Ada Data Retur</h4>
          <p>
            {searchQuery
              ? 'Tidak ditemukan pengajuan retur yang sesuai kata kunci pencarian.'
              : 'Belum ada pengajuan retur barang pada tab ini. Klik tombol "Ajukan Retur Barang" di atas untuk membuat permohonan baru.'}
          </p>
        </div>
      ) : (
        <div className="returns-list">
          {filteredReturns.map((ret) => {
            const isAccepted = ret.status === 'accepted';
            const isRejected = ret.status === 'rejected';
            const isRequested = ret.status === 'requested' || ret.status === 'in_transit';

            return (
              <div key={ret.id} className="return-card">
                {/* Header */}
                <div className="return-card-header">
                  <div className="return-card-meta">
                    <span className="return-id-badge">{ret.id}</span>
                    <span className="return-school-title">{ret.schoolName}</span>
                    <span className="return-created-date">
                      Diajukan: {formatDateId(ret.createdAt)}
                    </span>
                  </div>

                  <div>
                    {isRequested && (
                      <span className="return-status-pill requested">
                        ⏳ Menunggu Konfirmasi Koperasi
                      </span>
                    )}
                    {isAccepted && (
                      <span className="return-status-pill accepted">
                        ✅ Diterima oleh Koperasi
                      </span>
                    )}
                    {isRejected && (
                      <span className="return-status-pill rejected">
                        ❌ Permohonan Retur Ditolak
                      </span>
                    )}
                  </div>
                </div>

                {/* Body Content */}
                <div className="return-card-body">
                  {/* Left: Items List */}
                  <div className="return-items-summary">
                    <div className="return-items-header">
                      Daftar Barang yang Diretur ({ret.items.length} item)
                    </div>
                    {ret.items.map((it, idx) => (
                      <div key={idx} className="return-item-row">
                        <div className="return-item-info">
                          <span className="return-item-name">{it.productName}</span>
                          {it.productCode && (
                            <span className="return-item-code">Kode: {it.productCode}</span>
                          )}
                          {it.itemReason && (
                            <span className="return-item-reason-tag">
                              Catatan: {it.itemReason}
                            </span>
                          )}
                        </div>
                        <span className="return-item-qty">{it.quantity} Pcs</span>
                      </div>
                    ))}
                  </div>

                  {/* Right: Logistics & Reason Panel */}
                  <div className="return-logistics-panel">
                    <div className="logistics-row">
                      <span className="logistics-label">Kategori Masalah</span>
                      <span className="logistics-val" style={{ color: '#d97706' }}>
                        ⚠️ {ret.reasonCategory || 'Lainnya'}
                      </span>
                    </div>

                    <div className="logistics-row">
                      <span className="logistics-label">Jadwal Keberangkatan</span>
                      <span className="logistics-val">
                        📅 {ret.departureDate} • ⏰ {ret.departureTime} WIB
                      </span>
                    </div>

                    {ret.shippingNote && (
                      <div className="logistics-row">
                        <span className="logistics-label">Armada / Pengantar</span>
                        <span className="logistics-val">🚚 {ret.shippingNote}</span>
                      </div>
                    )}

                    <div className="logistics-row" style={{ marginTop: '4px' }}>
                      <span className="logistics-label">Penjelasan Sekolah</span>
                      <span style={{ color: '#374151', fontSize: '0.86rem', lineHeight: 1.4 }}>
                        "{ret.reason}"
                      </span>
                    </div>
                  </div>
                </div>

                {/* Proof / Verification Alert when Accepted by Koperasi */}
                {isAccepted && (
                  <div className="return-accepted-alert">
                    <div className="accepted-check-icon">✓</div>
                    <div className="accepted-alert-content">
                      <div className="accepted-alert-title">
                        Bukti Konfirmasi Penerimaan oleh Koperasi
                      </div>
                      <div className="accepted-alert-meta">
                        Diterima oleh Petugas Koperasi: <strong>{ret.acceptedByName || 'Staf Koperasi'}</strong> • Waktu Diterima: <strong>{ret.acceptedAtDate || formatDateId(ret.acceptedAt)} {ret.acceptedAtTime ? `pukul ${ret.acceptedAtTime} WIB` : ''}</strong>
                      </div>
                      {ret.acceptedNotes && (
                        <div className="accepted-alert-notes">
                          "Catatan Koperasi: {ret.acceptedNotes}"
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Alert when Rejected */}
                {isRejected && (
                  <div className="return-rejected-alert">
                    <div className="rejected-icon">✕</div>
                    <div className="rejected-alert-content">
                      <div className="rejected-alert-title">Retur Tidak Dapat Diterima</div>
                      <div className="rejected-alert-meta">
                        Diproses oleh: <strong>{ret.rejectedByName || 'Petugas Koperasi'}</strong>
                      </div>
                      {ret.rejectionReason && (
                        <div className="rejected-alert-notes">
                          Alasan: {ret.rejectionReason}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Footer Action */}
                <div className="return-card-footer">
                  <button
                    type="button"
                    className="btn-view-detail"
                    onClick={() => setViewingReturn(ret)}
                  >
                    🔍 Cek Detail & Status Lengkap
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* POP-UP MODAL 1: Ajukan Retur Baru */}
      {showCreateModal && (
        <div className="return-modal-overlay">
          <div className="return-modal-card">
            <div className="return-modal-header">
              <h3>📝 Formulir Pengajuan Retur Barang</h3>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setShowCreateModal(false)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitReturn}>
              <div className="return-modal-body">
                {formError && (
                  <div className="return-info-callout" style={{ borderLeftColor: '#e11d48', background: '#fff1f2', color: '#be123c' }}>
                    {formError}
                  </div>
                )}

                {/* Section 1: Sekolah Info */}
                <div className="return-info-callout">
                  <strong>Pemohon Retur:</strong> {user?.schoolName || user?.name} ({user?.schoolLevel || 'Semua Jenjang'})
                </div>

                {/* Section 2: Items to return */}
                <div className="modal-items-builder">
                  <div className="builder-header">
                    <h4>Pilih Barang yang Diretur</h4>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      Total {returnItems.length} item
                    </span>
                  </div>

                  {returnItems.map((item, idx) => (
                    <div key={idx} className="builder-item-card">
                      <div className="builder-item-row">
                        <div>
                          <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                            Pilih Nama Barang
                          </label>
                          <select
                            className="form-select"
                            value={item.productId || ''}
                            onChange={(e) => handleProductSelect(idx, e.target.value)}
                          >
                            {availableCatalog.map((prod) => (
                              <option key={prod.id} value={prod.id}>
                                [{prod.code}] {prod.name} ({prod.category.toUpperCase()} - {prod.level})
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                            Qty (Pcs)
                          </label>
                          <input
                            type="number"
                            min="1"
                            className="form-input"
                            value={item.quantity}
                            onChange={(e) => handleItemQtyChange(idx, parseInt(e.target.value) || 1)}
                          />
                        </div>

                        <div style={{ paddingTop: '16px' }}>
                          <button
                            type="button"
                            className="btn-remove-row"
                            onClick={() => handleRemoveItem(idx)}
                            disabled={returnItems.length <= 1}
                            title="Hapus baris barang"
                          >
                            ✕
                          </button>
                        </div>
                      </div>

                      <div>
                        <input
                          type="text"
                          className="form-input"
                          placeholder="Catatan spesifik item ini (opsional, contoh: Size L kancing lepas)"
                          value={item.itemReason || ''}
                          onChange={(e) => handleItemReasonChange(idx, e.target.value)}
                          style={{ fontSize: '0.84rem' }}
                        />
                      </div>
                    </div>
                  ))}

                  <button
                    type="button"
                    className="btn-add-row"
                    onClick={handleAddItem}
                  >
                    ➕ Tambah Barang Lain yang Diretur
                  </button>
                </div>

                {/* Section 3: Reason */}
                <div className="form-group">
                  <label>
                    Kategori Alasan Retur <span className="required">*</span>
                  </label>
                  <select
                    className="form-select"
                    value={reasonCategory}
                    onChange={(e) => setReasonCategory(e.target.value)}
                  >
                    {REASON_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label>
                    Penjelasan Alasan & Masalah Barang <span className="required">*</span>
                  </label>
                  <textarea
                    rows={3}
                    className="form-textarea"
                    placeholder="Jelaskan kendala, kondisi cacat, atau nomor pesanan sebelumnya jika ada..."
                    value={reasonDetail}
                    onChange={(e) => setReasonDetail(e.target.value)}
                    required
                  />
                </div>

                {/* Section 4: Departure Date & Time */}
                <div className="form-grid-2">
                  <div className="form-group">
                    <label>
                      📅 Tanggal Keberangkatan Barang <span className="required">*</span>
                    </label>
                    <input
                      type="date"
                      className="form-input"
                      value={departureDate}
                      onChange={(e) => setDepartureDate(e.target.value)}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label>
                      ⏰ Jam Keberangkatan Barang <span className="required">*</span>
                    </label>
                    <input
                      type="time"
                      className="form-input"
                      value={departureTime}
                      onChange={(e) => setDepartureTime(e.target.value)}
                      required
                    />
                  </div>
                </div>

                {/* Section 5: Driver / Courier note */}
                <div className="form-group">
                  <label>🚚 Info Armada / Kurir / Pengantar</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Contoh: Diantar mobil dinas sekolah B 1234 CD - Sopir Pak Joko"
                    value={shippingNote}
                    onChange={(e) => setShippingNote(e.target.value)}
                  />
                </div>
              </div>

              <div className="return-modal-footer">
                <button
                  type="button"
                  className="btn-view-detail"
                  onClick={() => setShowCreateModal(false)}
                >
                  Batal
                </button>
                <button type="submit" className="btn-new-return">
                  🚀 Kirim Permohonan Retur
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* POP-UP MODAL 2: Cek Detail & Status Lengkap Konfirmasi Koperasi */}
      {viewingReturn && (
        <div className="return-modal-overlay">
          <div className="return-modal-card">
            <div className="return-modal-header">
              <div>
                <h3 style={{ margin: 0 }}>Detail Permohonan Retur #{viewingReturn.id}</h3>
                <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                  Diajukan pada {formatDateId(viewingReturn.createdAt)}
                </span>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setViewingReturn(null)}
              >
                ✕
              </button>
            </div>

            <div className="return-modal-body">
              {/* Timeline Status */}
              <div className="timeline-status-box">
                <div className="timeline-step completed">
                  <div className="timeline-icon">1</div>
                  <div className="timeline-content">
                    <div className="timeline-title">Permohonan Diajukan oleh Sekolah</div>
                    <div className="timeline-desc">
                      Keberangkatan: {viewingReturn.departureDate} pukul {viewingReturn.departureTime} WIB
                    </div>
                  </div>
                </div>

                <div className={`timeline-step ${viewingReturn.status === 'accepted' ? 'completed' : viewingReturn.status === 'rejected' ? 'rejected' : 'current'}`}>
                  <div className="timeline-icon">
                    {viewingReturn.status === 'accepted' ? '✓' : viewingReturn.status === 'rejected' ? '✕' : '2'}
                  </div>
                  <div className="timeline-content">
                    <div className="timeline-title">
                      {viewingReturn.status === 'accepted'
                        ? 'Dikonfirmasi Diterima oleh Karyawan Koperasi'
                        : viewingReturn.status === 'rejected'
                        ? 'Retur Ditolak oleh Koperasi'
                        : 'Menunggu Pemeriksaan Fisik di Koperasi'}
                    </div>
                    <div className="timeline-desc">
                      {viewingReturn.status === 'accepted'
                        ? `Diterima oleh ${viewingReturn.acceptedByName || 'Staf Gudang'} pada ${viewingReturn.acceptedAtDate || formatDateId(viewingReturn.acceptedAt)} pukul ${viewingReturn.acceptedAtTime || '-'} WIB`
                        : viewingReturn.status === 'rejected'
                        ? `Ditolak oleh ${viewingReturn.rejectedByName || 'Koperasi'}: ${viewingReturn.rejectionReason}`
                        : 'Barang sedang dalam perjalanan atau menunggu antrean pengecekan fisik di gudang koperasi.'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Acceptance Details Box */}
              {viewingReturn.status === 'accepted' && (
                <div className="return-accepted-alert">
                  <div className="accepted-check-icon">✅</div>
                  <div className="accepted-alert-content">
                    <div className="accepted-alert-title">Konfirmasi Resmi Koperasi Karyawan</div>
                    <div style={{ fontSize: '0.88rem', color: '#166534', marginTop: '4px' }}>
                      Petugas Penerima: <strong>{viewingReturn.acceptedByName}</strong><br />
                      Waktu Diterima Fisik: <strong>{viewingReturn.acceptedAtDate} • {viewingReturn.acceptedAtTime} WIB</strong>
                    </div>
                    <div className="accepted-alert-notes" style={{ marginTop: '8px' }}>
                      <strong>Catatan Fisik Koperasi:</strong> {viewingReturn.acceptedNotes || 'Barang telah diterima dalam kondisi sesuai.'}
                    </div>
                  </div>
                </div>
              )}

              {/* Items List */}
              <div>
                <h4 style={{ fontSize: '0.92rem', color: 'var(--primary-blue)', marginBottom: '10px' }}>
                  Rincian Barang Retur
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {viewingReturn.items.map((it, idx) => (
                    <div key={idx} className="return-item-row">
                      <div>
                        <div style={{ fontWeight: 600 }}>{it.productName}</div>
                        {it.productCode && (
                          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                            Kode: {it.productCode}
                          </div>
                        )}
                        {it.itemReason && (
                          <div style={{ fontSize: '0.8rem', color: '#d97706' }}>
                            {it.itemReason}
                          </div>
                        )}
                      </div>
                      <div className="return-item-qty">{it.quantity} Pcs</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Reason & Shipment Info */}
              <div className="return-logistics-panel">
                <div className="logistics-row">
                  <span className="logistics-label">Kategori Alasan</span>
                  <span className="logistics-val">{viewingReturn.reasonCategory}</span>
                </div>
                <div className="logistics-row">
                  <span className="logistics-label">Alasan Lengkap</span>
                  <span>{viewingReturn.reason}</span>
                </div>
                <div className="logistics-row">
                  <span className="logistics-label">Armada / Pengantar Sekolah</span>
                  <span>{viewingReturn.shippingNote || 'Tidak ada catatan armada'}</span>
                </div>
              </div>
            </div>

            <div className="return-modal-footer">
              <button
                type="button"
                className="btn-new-return"
                onClick={() => setViewingReturn(null)}
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

export default SchoolReturn;
