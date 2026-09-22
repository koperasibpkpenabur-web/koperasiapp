import { useState, type FormEvent } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useReturns } from '../../context/ReturnContext';
import { useProducts } from '../../context/ProductContext';
import type { ReturnRequest } from '../../types';
import '../School/returns.css';

const KopkarReturn = () => {
  const { user } = useAuth();
  const { returns, acceptReturn, rejectReturn } = useReturns();
  const { restockProduct } = useProducts();

  // Filter tabs & search
  const [activeTab, setActiveTab] = useState<'all' | 'pending' | 'accepted' | 'rejected'>('pending');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals state
  const [acceptingReturn, setAcceptingReturn] = useState<ReturnRequest | null>(null);
  const [rejectingReturn, setRejectingReturn] = useState<ReturnRequest | null>(null);
  const [viewingReturn, setViewingReturn] = useState<ReturnRequest | null>(null);

  // Acceptance Form State
  const todayStr = new Date().toISOString().split('T')[0];
  const currentTimeStr = new Date().toTimeString().slice(0, 5);

  const [acceptedByName, setAcceptedByName] = useState(user?.name ? `${user.name} (Kopkar)` : 'Staf Koperasi');
  const [acceptedAtDate, setAcceptedAtDate] = useState(todayStr);
  const [acceptedAtTime, setAcceptedAtTime] = useState(currentTimeStr);
  const [acceptedNotes, setAcceptedNotes] = useState('');
  const [isRestockChecked, setIsRestockChecked] = useState(false);
  const [acceptError, setAcceptError] = useState('');

  // Rejection Form State
  const [rejectionReason, setRejectionReason] = useState('');
  const [rejectError, setRejectError] = useState('');

  // Success message toast
  const [actionSuccess, setActionSuccess] = useState('');

  // Stats calculation
  const totalCount = returns.length;
  const pendingCount = returns.filter((r) => r.status === 'requested' || r.status === 'in_transit').length;
  const acceptedCount = returns.filter((r) => r.status === 'accepted').length;
  const rejectedCount = returns.filter((r) => r.status === 'rejected').length;

  // Filter returns
  const filteredReturns = returns.filter((r) => {
    let matchTab = true;
    if (activeTab === 'pending') matchTab = r.status === 'requested' || r.status === 'in_transit';
    else if (activeTab === 'accepted') matchTab = r.status === 'accepted';
    else if (activeTab === 'rejected') matchTab = r.status === 'rejected';

    const matchSearch =
      r.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.schoolName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.reason.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.items.some((it) => it.productName.toLowerCase().includes(searchQuery.toLowerCase()));

    return matchTab && matchSearch;
  });

  const handleOpenAcceptModal = (ret: ReturnRequest) => {
    setAcceptingReturn(ret);
    setAcceptedByName(user?.name ? `${user.name} (Kopkar)` : 'Staf Koperasi');
    setAcceptedAtDate(todayStr);
    setAcceptedAtTime(currentTimeStr);
    setAcceptedNotes('Barang telah kami terima di gudang Koperasi dan diverifikasi fisik lengkap sesuai permohonan.');
    setIsRestockChecked(false);
    setAcceptError('');
  };

  const handleConfirmAccept = (e: FormEvent) => {
    e.preventDefault();
    if (!acceptingReturn) return;

    if (!acceptedByName.trim()) {
      setAcceptError('Nama staf penerima wajib diisi.');
      return;
    }
    if (!acceptedAtDate || !acceptedAtTime) {
      setAcceptError('Tanggal dan jam penerimaan fisik wajib diisi.');
      return;
    }
    if (!acceptedNotes.trim()) {
      setAcceptError('Catatan konfirmasi penerimaan fisik wajib diisi.');
      return;
    }

    // Process return acceptance
    acceptReturn(acceptingReturn.id, {
      acceptedByName: acceptedByName.trim(),
      acceptedAtDate,
      acceptedAtTime,
      acceptedNotes: acceptedNotes.trim(),
      isRestocked: isRestockChecked,
    });

    // Optionally restock if checked
    if (isRestockChecked && restockProduct) {
      acceptingReturn.items.forEach((item) => {
        if (item.productId && item.quantity > 0) {
          restockProduct(item.productId, item.quantity);
        }
      });
    }

    const returnId = acceptingReturn.id;
    setAcceptingReturn(null);
    setActionSuccess(`Retur ${returnId} berhasil dikonfirmasi diterima oleh Koperasi!`);
    setTimeout(() => setActionSuccess(''), 5000);
  };

  const handleOpenRejectModal = (ret: ReturnRequest) => {
    setRejectingReturn(ret);
    setRejectionReason('');
    setRejectError('');
  };

  const handleConfirmReject = (e: FormEvent) => {
    e.preventDefault();
    if (!rejectingReturn) return;

    if (!rejectionReason.trim()) {
      setRejectError('Alasan penolakan retur wajib diisi.');
      return;
    }

    rejectReturn(rejectingReturn.id, {
      rejectedByName: user?.name ? `${user.name} (Kopkar)` : 'Staf Koperasi',
      rejectionReason: rejectionReason.trim(),
    });

    const returnId = rejectingReturn.id;
    setRejectingReturn(null);
    setActionSuccess(`Retur ${returnId} telah ditandai ditolak.`);
    setTimeout(() => setActionSuccess(''), 5000);
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
          <h2>↩️ Permohonan Retur Masuk (Koperasi)</h2>
          <div className="returns-subtitle">
            Pemeriksaan dan konfirmasi penerimaan fisik barang retur dari seluruh sekolah mitra PENABUR.
          </div>
        </div>
      </div>

      {/* Success Notification Alert */}
      {actionSuccess && (
        <div className="return-info-callout success" style={{ marginBottom: '20px' }}>
          <strong>Sukses!</strong> {actionSuccess}
        </div>
      )}

      {/* Stats Cards */}
      <div className="returns-stats">
        <div className="return-stat-card">
          <div className="return-stat-icon">📥</div>
          <div className="return-stat-info">
            <div className="return-stat-label">Total Permohonan Masuk</div>
            <div className="return-stat-val">{totalCount}</div>
          </div>
        </div>

        <div className="return-stat-card warning">
          <div className="return-stat-icon">⏳</div>
          <div className="return-stat-info">
            <div className="return-stat-label">Menunggu Konfirmasi</div>
            <div className="return-stat-val">{pendingCount}</div>
          </div>
        </div>

        <div className="return-stat-card success">
          <div className="return-stat-icon">✅</div>
          <div className="return-stat-info">
            <div className="return-stat-label">Selesai Diterima</div>
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

      {/* Toolbar: Tabs & Search */}
      <div className="returns-toolbar">
        <div className="returns-tabs">
          <button
            type="button"
            className={`returns-tab-btn ${activeTab === 'pending' ? 'active' : ''}`}
            onClick={() => setActiveTab('pending')}
          >
            ⏳ Perlu Diproses <span className="tab-badge">{pendingCount}</span>
          </button>
          <button
            type="button"
            className={`returns-tab-btn ${activeTab === 'all' ? 'active' : ''}`}
            onClick={() => setActiveTab('all')}
          >
            Semua Retur <span className="tab-badge">{totalCount}</span>
          </button>
          <button
            type="button"
            className={`returns-tab-btn ${activeTab === 'accepted' ? 'active' : ''}`}
            onClick={() => setActiveTab('accepted')}
          >
            ✅ Selesai Diterima <span className="tab-badge">{acceptedCount}</span>
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
            placeholder="Cari sekolah, ID retur, atau nama barang..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Returns List */}
      {filteredReturns.length === 0 ? (
        <div className="returns-empty">
          <div className="returns-empty-icon">✨</div>
          <h4>Tidak Ada Permohonan Retur</h4>
          <p>
            {activeTab === 'pending'
              ? 'Semua permohonan retur masuk telah selesai diproses. Kerja bagus!'
              : 'Tidak ada data retur yang sesuai dengan filter atau pencarian Anda.'}
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
                    <span className="return-school-title">🏫 {ret.schoolName}</span>
                    <span className="return-created-date">
                      Diajukan: {formatDateId(ret.createdAt)}
                    </span>
                  </div>

                  <div>
                    {isRequested && (
                      <span className="return-status-pill requested">
                        ⏳ Menunggu Konfirmasi Penerimaan
                      </span>
                    )}
                    {isAccepted && (
                      <span className="return-status-pill accepted">
                        ✅ Barang Sudah Diterima Koperasi
                      </span>
                    )}
                    {isRejected && (
                      <span className="return-status-pill rejected">
                        ❌ Retur Ditolak
                      </span>
                    )}
                  </div>
                </div>

                {/* Body Content */}
                <div className="return-card-body">
                  {/* Left: Items list */}
                  <div className="return-items-summary">
                    <div className="return-items-header">
                      Rincian Barang yang Diretur ({ret.items.length} item)
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
                              Catatan Item: {it.itemReason}
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
                      <span className="logistics-label">Jadwal Keberangkatan dari Sekolah</span>
                      <span className="logistics-val">
                        📅 {ret.departureDate} • ⏰ {ret.departureTime} WIB
                      </span>
                    </div>

                    <div className="logistics-row">
                      <span className="logistics-label">Armada / Kurir Pengantar</span>
                      <span className="logistics-val">
                        🚚 {ret.shippingNote || 'Diantar langsung oleh perwakilan sekolah'}
                      </span>
                    </div>

                    <div className="logistics-row" style={{ marginTop: '4px' }}>
                      <span className="logistics-label">Penjelasan Sekolah</span>
                      <span style={{ color: '#374151', fontSize: '0.86rem', lineHeight: 1.4 }}>
                        "{ret.reason}"
                      </span>
                    </div>
                  </div>
                </div>

                {/* Acceptance proof if already accepted */}
                {isAccepted && (
                  <div className="return-accepted-alert">
                    <div className="accepted-check-icon">✓</div>
                    <div className="accepted-alert-content">
                      <div className="accepted-alert-title">
                        Telah Dikonfirmasi Diterima oleh Karyawan Koperasi
                      </div>
                      <div className="accepted-alert-meta">
                        Petugas Penerima: <strong>{ret.acceptedByName}</strong> • Waktu Penerimaan: <strong>{ret.acceptedAtDate || formatDateId(ret.acceptedAt)} {ret.acceptedAtTime ? `pukul ${ret.acceptedAtTime} WIB` : ''}</strong>
                      </div>
                      {ret.acceptedNotes && (
                        <div className="accepted-alert-notes">
                          "Catatan Fisik: {ret.acceptedNotes}"
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Rejection proof if rejected */}
                {isRejected && (
                  <div className="return-rejected-alert">
                    <div className="rejected-icon">✕</div>
                    <div className="rejected-alert-content">
                      <div className="rejected-alert-title">Permohonan Retur Telah Ditolak</div>
                      <div className="rejected-alert-meta">
                        Diproses oleh: <strong>{ret.rejectedByName}</strong>
                      </div>
                      {ret.rejectionReason && (
                        <div className="rejected-alert-notes">
                          Alasan: {ret.rejectionReason}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="return-card-footer">
                  <button
                    type="button"
                    className="btn-view-detail"
                    onClick={() => setViewingReturn(ret)}
                  >
                    🔍 Lihat Rincian
                  </button>

                  {isRequested && (
                    <>
                      <button
                        type="button"
                        className="btn-reject-action"
                        onClick={() => handleOpenRejectModal(ret)}
                      >
                        ✕ Tolak Retur
                      </button>
                      <button
                        type="button"
                        className="btn-accept-action"
                        onClick={() => handleOpenAcceptModal(ret)}
                      >
                        ✓ Konfirmasi Terima Retur
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* POP-UP MODAL: Konfirmasi Penerimaan Barang Retur */}
      {acceptingReturn && (
        <div className="return-modal-overlay">
          <div className="return-modal-card">
            <div className="return-modal-header">
              <h3>✅ Konfirmasi Penerimaan Barang Retur #{acceptingReturn.id}</h3>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setAcceptingReturn(null)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleConfirmAccept}>
              <div className="return-modal-body">
                {acceptError && (
                  <div className="return-info-callout" style={{ borderLeftColor: '#e11d48', background: '#fff1f2', color: '#be123c' }}>
                    {acceptError}
                  </div>
                )}

                {/* School & Items Summary */}
                <div className="return-info-callout">
                  <strong>Pengirim:</strong> {acceptingReturn.schoolName}<br />
                  <strong>Jadwal Keberangkatan Sekolah:</strong> {acceptingReturn.departureDate} pukul {acceptingReturn.departureTime} WIB ({acceptingReturn.shippingNote || 'Armada sekolah'})<br />
                  <strong>Alasan Retur:</strong> {acceptingReturn.reason}
                </div>

                {/* List items to check */}
                <div>
                  <label style={{ fontSize: '0.86rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px', display: 'block' }}>
                    Barang yang Diterima & Dicek Fisik:
                  </label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {acceptingReturn.items.map((it, idx) => (
                      <div key={idx} className="return-item-row" style={{ background: '#f8fafc' }}>
                        <div>
                          <div style={{ fontWeight: 600 }}>{it.productName}</div>
                          {it.itemReason && (
                            <div style={{ fontSize: '0.8rem', color: '#d97706' }}>
                              Catatan: {it.itemReason}
                            </div>
                          )}
                        </div>
                        <div className="return-item-qty">{it.quantity} Pcs</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Form Inputs for Karyawan */}
                <div className="form-group">
                  <label>
                    Nama Petugas Pemeriksa / Staf Penerima Koperasi <span className="required">*</span>
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    value={acceptedByName}
                    onChange={(e) => setAcceptedByName(e.target.value)}
                    required
                  />
                </div>

                <div className="form-grid-2">
                  <div className="form-group">
                    <label>
                      📅 Tanggal Diterima di Gudang Koperasi <span className="required">*</span>
                    </label>
                    <input
                      type="date"
                      className="form-input"
                      value={acceptedAtDate}
                      onChange={(e) => setAcceptedAtDate(e.target.value)}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label>
                      ⏰ Jam Diterima di Gudang Koperasi <span className="required">*</span>
                    </label>
                    <input
                      type="time"
                      className="form-input"
                      value={acceptedAtTime}
                      onChange={(e) => setAcceptedAtTime(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label>
                    Catatan Konfirmasi & Pengecekan Fisik <span className="required">*</span>
                  </label>
                  <textarea
                    rows={3}
                    className="form-textarea"
                    placeholder="Contoh: Barang telah diperiksa fisik, jumlah 5 pcs lengkap, kondisi terverifikasi sesuai surat jalan..."
                    value={acceptedNotes}
                    onChange={(e) => setAcceptedNotes(e.target.value)}
                    required
                  />
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                    Catatan ini akan langsung tampil di akun sekolah sebagai bukti resmi bahwa barang sudah diterima koperasi.
                  </span>
                </div>

                {/* Optional Restock Checkbox */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'var(--bluish-white)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                  <input
                    type="checkbox"
                    id="restockCheck"
                    checked={isRestockChecked}
                    onChange={(e) => setIsRestockChecked(e.target.checked)}
                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                  />
                  <label htmlFor="restockCheck" style={{ fontSize: '0.86rem', color: 'var(--text-primary)', cursor: 'pointer' }}>
                    <strong>Update Stok Koperasi:</strong> Tambahkan kembali kuantiti barang ke stok fisik aktif koperasi
                  </label>
                </div>
              </div>

              <div className="return-modal-footer">
                <button
                  type="button"
                  className="btn-view-detail"
                  onClick={() => setAcceptingReturn(null)}
                >
                  Batal
                </button>
                <button type="submit" className="btn-accept-action">
                  ✓ Simpan & Konfirmasi Diterima
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* POP-UP MODAL: Tolak Retur */}
      {rejectingReturn && (
        <div className="return-modal-overlay">
          <div className="return-modal-card" style={{ maxWidth: '520px' }}>
            <div className="return-modal-header">
              <h3 style={{ color: '#be123c' }}>✕ Tolak Permohonan Retur #{rejectingReturn.id}</h3>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setRejectingReturn(null)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleConfirmReject}>
              <div className="return-modal-body">
                {rejectError && (
                  <div className="return-info-callout" style={{ borderLeftColor: '#e11d48', background: '#fff1f2', color: '#be123c' }}>
                    {rejectError}
                  </div>
                )}

                <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', margin: 0 }}>
                  Apakah Anda yakin ingin menolak permohonan retur dari <strong>{rejectingReturn.schoolName}</strong>? Silakan berikan alasan penolakan yang jelas.
                </p>

                <div className="form-group">
                  <label>
                    Alasan Penolakan <span className="required">*</span>
                  </label>
                  <textarea
                    rows={3}
                    className="form-textarea"
                    placeholder="Contoh: Kondisi barang tidak memenuhi kriteria retur / bukan produk cacat pabrik..."
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="return-modal-footer">
                <button
                  type="button"
                  className="btn-view-detail"
                  onClick={() => setRejectingReturn(null)}
                >
                  Batal
                </button>
                <button type="submit" className="btn-reject-action">
                  ✕ Konfirmasi Tolak
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* POP-UP MODAL: Rincian Lengkap Retur */}
      {viewingReturn && (
        <div className="return-modal-overlay">
          <div className="return-modal-card">
            <div className="return-modal-header">
              <div>
                <h3 style={{ margin: 0 }}>Rincian Permohonan Retur #{viewingReturn.id}</h3>
                <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                  Sekolah: <strong>{viewingReturn.schoolName}</strong> • Diajukan: {formatDateId(viewingReturn.createdAt)}
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
              {/* Status info */}
              {viewingReturn.status === 'accepted' && (
                <div className="return-accepted-alert">
                  <div className="accepted-check-icon">✓</div>
                  <div className="accepted-alert-content">
                    <div className="accepted-alert-title">Diterima oleh Karyawan Koperasi</div>
                    <div style={{ fontSize: '0.86rem', color: '#166534' }}>
                      Diterima oleh: <strong>{viewingReturn.acceptedByName}</strong> pada <strong>{viewingReturn.acceptedAtDate} ({viewingReturn.acceptedAtTime} WIB)</strong>
                    </div>
                    {viewingReturn.acceptedNotes && (
                      <div className="accepted-alert-notes">
                        Catatan: {viewingReturn.acceptedNotes}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Items */}
              <div>
                <h4 style={{ fontSize: '0.92rem', color: 'var(--primary-blue)', marginBottom: '10px' }}>
                  Daftar Barang yang Diretur
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {viewingReturn.items.map((it, idx) => (
                    <div key={idx} className="return-item-row">
                      <div>
                        <div style={{ fontWeight: 600 }}>{it.productName}</div>
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

              {/* Logistics */}
              <div className="return-logistics-panel">
                <div className="logistics-row">
                  <span className="logistics-label">Kategori Alasan</span>
                  <span>{viewingReturn.reasonCategory}</span>
                </div>
                <div className="logistics-row">
                  <span className="logistics-label">Penjelasan Sekolah</span>
                  <span>{viewingReturn.reason}</span>
                </div>
                <div className="logistics-row">
                  <span className="logistics-label">Jadwal Keberangkatan</span>
                  <span>{viewingReturn.departureDate} pukul {viewingReturn.departureTime} WIB</span>
                </div>
                <div className="logistics-row">
                  <span className="logistics-label">Armada / Sopir</span>
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

export default KopkarReturn;
