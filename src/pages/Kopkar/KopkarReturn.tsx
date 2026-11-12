import { useState, useEffect, useMemo, type FormEvent } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useReturns } from '../../context/ReturnContext';
import { useProducts } from '../../context/ProductContext';
import { useSettings } from '../../context/SettingsContext';
import { generateReturnPdf } from '../../utils/returnPdf';
import { buildAcademicYearOptions, resolveAcademicYear } from '../../utils/academicYear';
import { getWibDateString, getWibTimeString } from '../../utils/dateWib';
import type { ReturnRequest } from '../../types';
import '../School/returns.css';

const formatRupiah = (num: number) => {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(num);
};

const KopkarReturn = () => {
  const { user } = useAuth();
  const { returns, confirmReturn, receiveReturn, rejectReturn } = useReturns();
  const { products } = useProducts();
  const { activeAcademicYear, academicYears } = useSettings();

  // Filter tabs, tahun ajaran & search
  const [activeTab, setActiveTab] = useState<'all' | 'pending' | 'koperasi_confirmed' | 'sekolah_dikirim' | 'koperasi_diterima' | 'rejected'>('pending');
  const [searchQuery, setSearchQuery] = useState('');
  const [yearFilter, setYearFilter] = useState<string>(activeAcademicYear);
  const [hasCustomYear, setHasCustomYear] = useState(false);

  useEffect(() => {
    if (!hasCustomYear && activeAcademicYear) {
      setYearFilter(activeAcademicYear);
    }
  }, [activeAcademicYear, hasCustomYear]);

  const availableAcademicYears = useMemo(
    () =>
      buildAcademicYearOptions(
        academicYears,
        returns.map((r) => r.academicYear),
        activeAcademicYear
      ),
    [academicYears, activeAcademicYear, returns]
  );

  const yearScopedReturns = useMemo(() => {
    if (yearFilter === 'ALL') return returns;
    return returns.filter((r) => resolveAcademicYear(r.academicYear) === yearFilter);
  }, [returns, yearFilter]);

  // Modals state
  const [acceptingReturn, setAcceptingReturn] = useState<ReturnRequest | null>(null);
  const [rejectingReturn, setRejectingReturn] = useState<ReturnRequest | null>(null);
  const [viewingReturn, setViewingReturn] = useState<ReturnRequest | null>(null);

  // Print Return Document states
  const [printingReturn, setPrintingReturn] = useState<ReturnRequest | null>(null);
  const [printRecipient, setPrintRecipient] = useState<string>('');
  const [printSender, setPrintSender] = useState<string>('');
  const [printDate, setPrintDate] = useState<string>('');
  const [isGeneratingPdf, setIsGeneratingPdf] = useState<boolean>(false);

  const handleOpenPrintModal = (ret: ReturnRequest) => {
    const today = getWibDateString();
    setPrintingReturn(ret);
    setPrintRecipient(ret.confirmedByName ? `${ret.confirmedByName} / Koperasi BPK PENABUR` : (user?.name ? `${user.name} / Koperasi BPK PENABUR` : 'Pengurus / Bagian Logistik Koperasi'));
    setPrintSender(ret.schoolName || 'PIC Sekolah');
    setPrintDate(ret.departureDate && ret.departureDate !== '-' ? ret.departureDate : today);
  };

  // Acceptance Form State
  const todayStr = getWibDateString();
  const currentTimeStr = getWibTimeString();

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
  const totalCount = yearScopedReturns.length;
  const pendingCount = yearScopedReturns.filter((r) => r.status === 'pending').length;
  const confirmedCount = yearScopedReturns.filter((r) => r.status === 'koperasi_confirmed').length;
  const sentCount = yearScopedReturns.filter((r) => r.status === 'sekolah_dikirim').length;
  const receivedCount = yearScopedReturns.filter((r) => r.status === 'koperasi_diterima').length;
  const rejectedCount = yearScopedReturns.filter((r) => r.status === 'rejected').length;

  // Filter returns
  const filteredReturns = yearScopedReturns.filter((r) => {
    let matchTab = true;
    if (activeTab === 'pending') matchTab = r.status === 'pending';
    else if (activeTab === 'koperasi_confirmed') matchTab = r.status === 'koperasi_confirmed';
    else if (activeTab === 'sekolah_dikirim') matchTab = r.status === 'sekolah_dikirim';
    else if (activeTab === 'koperasi_diterima') matchTab = r.status === 'koperasi_diterima';
    else if (activeTab === 'rejected') matchTab = r.status === 'rejected';

    const matchSearch =
      r.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.schoolName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.reason.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.items.some((it) => it.productName.toLowerCase().includes(searchQuery.toLowerCase()));

    return matchTab && matchSearch;
  });

  const handleConfirmReturnClick = async (ret: ReturnRequest) => {
    if (window.confirm('Yakin ingin menyetujui pengajuan retur ini?')) {
      const res = await confirmReturn(ret.id, { confirmedByName: user?.name || 'Kopkar' });
      if (res.success) {
        setActionSuccess(`Retur ${ret.id} telah disetujui.`);
        setTimeout(() => setActionSuccess(''), 3000);
      } else {
        alert(`Gagal menyetujui retur: ${res.error}\n\nPastikan kolom "confirmed_at" dan "confirmed_by_name" sudah ada di Supabase.`);
      }
    }
  };

  const handleOpenReceiveModal = (ret: ReturnRequest) => {
    setAcceptingReturn(ret);
    setAcceptedByName(user?.name ? `${user.name} (Kopkar)` : 'Staf Koperasi');
    setAcceptedAtDate(todayStr);
    setAcceptedAtTime(currentTimeStr);
    setAcceptedNotes('Barang telah kami terima di gudang Koperasi dan diverifikasi.');
    setAcceptError('');
  };

  const handleConfirmReceive = async (e: FormEvent) => {
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

    const res = await receiveReturn(acceptingReturn.id, {
      acceptedByName: acceptedByName.trim(),
      acceptedAtDate,
      acceptedAtTime,
      acceptedNotes: acceptedNotes.trim(),
      isRestocked: isRestockChecked,
    });

    if (res.success) {
      setActionSuccess(`Barang retur ${acceptingReturn.id} telah dicatat sebagai diterima.`);
      setTimeout(() => setActionSuccess(''), 3000);
      setAcceptingReturn(null);
    } else {
      setAcceptError(res.error || 'Terjadi kesalahan saat menerima retur.');
    }
  };

  const handleOpenRejectModal = (ret: ReturnRequest) => {
    setRejectingReturn(ret);
    setRejectionReason('');
    setRejectError('');
  };

  const handleConfirmReject = async (e: FormEvent) => {
    e.preventDefault();
    if (!rejectingReturn) return;

    if (!rejectionReason.trim()) {
      setRejectError('Alasan penolakan retur wajib diisi.');
      return;
    }

    const res = await rejectReturn(rejectingReturn.id, {
      rejectedByName: user?.name ? `${user.name} (Kopkar)` : 'Staf Koperasi',
      rejectionReason: rejectionReason.trim(),
    });

    if (res.success) {
      const returnId = rejectingReturn.id;
      setRejectingReturn(null);
      setActionSuccess(`Retur ${returnId} telah ditandai ditolak.`);
      setTimeout(() => setActionSuccess(''), 5000);
    } else {
      setRejectError(res.error || 'Terjadi kesalahan saat menolak retur.');
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

        <div className="return-stat-card success" style={{ background: '#e0f2fe', borderColor: '#bae6fd' }}>
          <div className="return-stat-icon">📋</div>
          <div className="return-stat-info">
            <div className="return-stat-label" style={{ color: '#0369a1' }}>Disetujui</div>
            <div className="return-stat-val" style={{ color: '#0369a1' }}>{confirmedCount}</div>
          </div>
        </div>

        <div className="return-stat-card success">
          <div className="return-stat-icon">✅</div>
          <div className="return-stat-info">
            <div className="return-stat-label">Selesai Diterima</div>
            <div className="return-stat-val">{receivedCount}</div>
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
            className={`returns-tab-btn ${activeTab === 'koperasi_confirmed' ? 'active' : ''}`}
            onClick={() => setActiveTab('koperasi_confirmed')}
          >
            📋 Disetujui <span className="tab-badge">{confirmedCount}</span>
          </button>
          <button
            type="button"
            className={`returns-tab-btn ${activeTab === 'sekolah_dikirim' ? 'active' : ''}`}
            onClick={() => setActiveTab('sekolah_dikirim')}
          >
            🚚 Dikirim Sekolah <span className="tab-badge">{sentCount}</span>
          </button>
          <button
            type="button"
            className={`returns-tab-btn ${activeTab === 'koperasi_diterima' ? 'active' : ''}`}
            onClick={() => setActiveTab('koperasi_diterima')}
          >
            ✅ Selesai Diterima <span className="tab-badge">{receivedCount}</span>
          </button>
          <button
            type="button"
            className={`returns-tab-btn ${activeTab === 'rejected' ? 'active' : ''}`}
            onClick={() => setActiveTab('rejected')}
          >
            ❌ Ditolak <span className="tab-badge">{rejectedCount}</span>
          </button>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <select
            aria-label="Filter Tahun Ajaran Asal Barang"
            value={yearFilter}
            onChange={(e) => {
              setHasCustomYear(true);
              setYearFilter(e.target.value);
            }}
            style={{
              padding: '8px 12px',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              background: '#ffffff',
              color: '#0f172a',
              fontSize: '0.86rem',
              fontWeight: 600,
            }}
          >
            <option value="ALL">Semua Tahun Ajaran</option>
            {availableAcademicYears.map((yr) => (
              <option key={yr} value={yr}>
                Asal Barang: TA {yr}
              </option>
            ))}
          </select>

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
            const isPending = ret.status === 'pending';
            const isConfirmed = ret.status === 'koperasi_confirmed';
            const isSent = ret.status === 'sekolah_dikirim';
            const isReceived = ret.status === 'koperasi_diterima';
            const isRejected = ret.status === 'rejected';

            return (
              <div key={ret.id} className="return-card">
                {/* Header */}
                <div className="return-card-header">
                  <div className="return-card-meta">
                    <span className="return-id-badge">{ret.id}</span>
                    <span
                      style={{
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: '999px',
                        background: '#eff6ff',
                        color: '#1d4ed8',
                        border: '1px solid #bfdbfe',
                      }}
                    >
                      Asal Barang: TA {resolveAcademicYear(ret.academicYear)}
                    </span>
                    <span className="return-school-title">🏫 {ret.schoolName}</span>
                    <span className="return-created-date">
                      Diajukan: {formatDateId(ret.createdAt)}
                    </span>
                  </div>

                  <div>
                    {isPending && (
                      <span className="return-status-pill requested">
                        ⏳ Menunggu Konfirmasi Koperasi
                      </span>
                    )}
                    {isConfirmed && (
                      <span className="return-status-pill accepted" style={{ background: '#e0f2fe', color: '#0369a1', borderColor: '#bae6fd' }}>
                        📋 Disetujui (Menunggu Sekolah Kirim)
                      </span>
                    )}
                    {isSent && (
                      <span className="return-status-pill requested" style={{ background: '#fef3c7', color: '#d97706', borderColor: '#fde68a' }}>
                        🚚 Sedang Dikirim Sekolah
                      </span>
                    )}
                    {isReceived && (
                      <span className="return-status-pill accepted">
                        ✅ Diterima Koperasi
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
                  {/* Left: Items list */}
                  <div className="return-items-summary">
                    <div className="return-items-header">
                      Rincian Barang yang Diretur ({ret.items.length} item)
                    </div>
                    {ret.items.map((it, idx) => {
                      const prodInfo = products.find(p => p.id === it.productId);
                      return (
                      <div key={idx} className="return-item-row">
                        <div className="return-item-info">
                          <span className="return-item-name">{it.productName} {prodInfo?.size ? `(Size ${prodInfo.size})` : ''}</span>
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
                    )})}
                  </div>

                  {/* Right: Logistics & Reason Panel */}
                  <div className="return-logistics-panel">
                    <div className="logistics-row">
                      <span className="logistics-label">Kategori Masalah</span>
                      <span className="logistics-val" style={{ color: '#d97706' }}>
                        ⚠️ {ret.reasonCategory || 'Lainnya'}
                      </span>
                    </div>

                    {ret.departureDate && ret.departureDate !== '-' ? (
                      <>
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
                      </>
                    ) : (
                      <div className="logistics-row">
                        <span className="logistics-label">Jadwal Keberangkatan</span>
                        <span className="logistics-val" style={{ color: '#94a3b8' }}>
                          Belum dikirim (Menunggu Sekolah)
                        </span>
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

                {isReceived && (
                  <div className="return-accepted-alert">
                    <div className="accepted-check-icon">✓</div>
                    <div className="accepted-alert-content">
                      <div className="accepted-alert-title">
                        Telah Dikonfirmasi Diterima oleh Karyawan Koperasi
                      </div>
                      <div className="accepted-alert-meta">
                        Petugas Penerima: <strong>{ret.koperasiDiterimaByName}</strong> • Waktu Penerimaan: <strong>{formatDateId(ret.koperasiDiterimaAt)}</strong>
                      </div>
                      {ret.koperasiDiterimaNotes && (
                        <div className="accepted-alert-notes">
                          "Catatan Fisik: {ret.koperasiDiterimaNotes}"
                        </div>
                      )}
                      
                      {/* Note for exchange sizes */}
                      {ret.reasonCategory === 'Ukuran Tidak Sesuai' && (
                        <div style={{ marginTop: '8px', padding: '8px', background: '#e0f2fe', borderRadius: '6px', fontSize: '0.82rem', color: '#0369a1' }}>
                          ℹ️ Sistem mengingatkan: Harap kirim kembali barang pengganti ke Sekolah.
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

                  {(isConfirmed || isSent || isReceived) && (
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => handleOpenPrintModal(ret)}
                      style={{ padding: '6px 12px', borderRadius: '6px', border: '1.5px solid #0284c7', color: '#0284c7', background: '#fff', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer' }}
                    >
                      🖨️ Cetak Tanda Terima
                    </button>
                  )}

                  {isPending && (
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
                        onClick={() => handleConfirmReturnClick(ret)}
                      >
                        ✓ Setujui Retur
                      </button>
                    </>
                  )}
                  {isSent && (
                    <button
                      type="button"
                      className="btn-accept-action"
                      style={{ background: '#2563eb' }}
                      onClick={() => handleOpenReceiveModal(ret)}
                    >
                      📦 Terima Barang dari Sekolah
                    </button>
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

            <form onSubmit={handleConfirmReceive}>
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
              {viewingReturn.status === 'koperasi_diterima' && (
                <div className="return-accepted-alert">
                  <div className="accepted-check-icon">✓</div>
                  <div className="accepted-alert-content">
                    <div className="accepted-alert-title">Diterima oleh Karyawan Koperasi</div>
                    <div style={{ fontSize: '0.86rem', color: '#166534' }}>
                      Diterima oleh: <strong>{viewingReturn.koperasiDiterimaByName}</strong> pada <strong>{formatDateId(viewingReturn.koperasiDiterimaAt)}</strong>
                    </div>
                    {viewingReturn.koperasiDiterimaNotes && (
                      <div className="accepted-alert-notes">
                        Catatan: {viewingReturn.koperasiDiterimaNotes}
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
                  {viewingReturn.items.map((it, idx) => {
                    const prodInfo = products.find(p => p.id === it.productId);
                    return (
                    <div key={idx} className="return-item-row">
                      <div>
                        <div style={{ fontWeight: 600 }}>{it.productName} {prodInfo?.size ? `(Size ${prodInfo.size})` : ''}</div>
                        {it.itemReason && (
                          <div style={{ fontSize: '0.8rem', color: '#d97706' }}>
                            {it.itemReason}
                          </div>
                        )}
                      </div>
                      <div className="return-item-qty">{it.quantity} Pcs</div>
                    </div>
                  )})}
                </div>
              </div>

              {/* Logistics */}
              <div className="return-logistics-panel">
                <div className="logistics-row">
                  <span className="logistics-label">Tahun Ajaran Asal Barang</span>
                  <span><strong>TA {resolveAcademicYear(viewingReturn.academicYear)}</strong></span>
                </div>
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
                  <span>{viewingReturn.departureDate && viewingReturn.departureDate !== '-' ? `${viewingReturn.departureDate} pukul ${viewingReturn.departureTime} WIB` : 'Belum dikirim'}</span>
                </div>
                <div className="logistics-row">
                  <span className="logistics-label">Armada / Sopir</span>
                  <span>{viewingReturn.departureDate && viewingReturn.departureDate !== '-' ? (viewingReturn.shippingNote || 'Tidak ada catatan armada') : 'Belum dikirim'}</span>
                </div>
              </div>
            </div>

            <div className="return-modal-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
              {(viewingReturn.status === 'koperasi_confirmed' || viewingReturn.status === 'sekolah_dikirim' || viewingReturn.status === 'koperasi_diterima') ? (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    const ret = viewingReturn;
                    setViewingReturn(null);
                    handleOpenPrintModal(ret);
                  }}
                  style={{ padding: '8px 14px', borderRadius: '8px', border: '1.5px solid #0284c7', color: '#0284c7', background: '#fff', fontSize: '0.84rem', fontWeight: 600, cursor: 'pointer' }}
                >
                  🖨️ Cetak Tanda Terima Retur
                </button>
              ) : <div />}
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

      {/* POP-UP MODAL: Cetak Dokumen Tanda Terima Retur */}
      {printingReturn && (
        <div className="return-modal-overlay">
          <div className="return-modal-card" style={{ maxWidth: '680px' }}>
            <div className="return-modal-header" style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '1.3rem' }}>🖨️</span>
                <h3 style={{ margin: 0, fontSize: '1.15rem' }}>Cetak Dokumen Tanda Terima Retur</h3>
              </div>
              <button
                type="button"
                className="btn-modal-close"
                onClick={() => setPrintingReturn(null)}
              >
                ✕
              </button>
            </div>

            <div className="return-modal-body" style={{ maxHeight: '72vh', overflowY: 'auto', padding: '20px 24px' }}>
              <div style={{ background: '#f8fafc', padding: '14px 16px', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '16px', fontSize: '0.85rem', color: '#475569', lineHeight: 1.5 }}>
                ℹ️ Dokumen tanda terima fisik barang retur sekolah. Anda dapat mengedit nama penerima atau pengirim sebelum mengunduh atau mencetak dokumen.
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px', marginBottom: '18px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#334155', marginBottom: '5px' }}>
                    1. Kepada Yth (Tujuan di Koperasi):
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    value={printRecipient}
                    onChange={(e) => setPrintRecipient(e.target.value)}
                    placeholder="Contoh: Pengurus / Bagian Logistik Koperasi"
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#334155', marginBottom: '5px' }}>
                    2. Pengirim Retur (Nama PIC Sekolah):
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    value={printSender}
                    onChange={(e) => setPrintSender(e.target.value)}
                    placeholder="Contoh: Budi Santoso (PIC Sekolah)"
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#334155', marginBottom: '5px' }}>
                    3. Tanggal Dokumen Retur:
                  </label>
                  <input
                    type="date"
                    className="form-input"
                    value={printDate}
                    onChange={(e) => setPrintDate(e.target.value)}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#334155', marginBottom: '5px' }}>
                    No. Dokumen Retur:
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    value={printingReturn.id}
                    disabled
                    style={{ background: '#f1f5f9', color: '#64748b' }}
                  />
                </div>
              </div>

              {/* Tabel Ringkasan Barang Retur */}
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#1e293b', marginBottom: '8px' }}>
                  Preview Barang yang Terlampir:
                </label>
                <div style={{ border: '1px solid #cbd5e1', borderRadius: '8px', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                    <thead>
                      <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #cbd5e1', textAlign: 'left' }}>
                        <th style={{ padding: '8px 10px', width: '35px', textAlign: 'center' }}>No</th>
                        <th style={{ padding: '8px 10px' }}>Nama Barang</th>
                        <th style={{ padding: '8px 10px', textAlign: 'center' }}>Size</th>
                        <th style={{ padding: '8px 10px', textAlign: 'center' }}>Qty</th>
                        <th style={{ padding: '8px 10px', textAlign: 'right' }}>Harga Satuan</th>
                        <th style={{ padding: '8px 10px', textAlign: 'right' }}>Jumlah</th>
                      </tr>
                    </thead>
                    <tbody>
                      {printingReturn.items.map((it, idx) => {
                        const prod = products.find(p => p.id === it.productId);
                        const size = prod?.size || (it as any).size || '-';
                        const price = prod?.priceKopkar || 0;
                        const subtotal = (it.quantity || 0) * price;
                        return (
                          <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0' }}>
                            <td style={{ padding: '8px 10px', textAlign: 'center' }}>{idx + 1}</td>
                            <td style={{ padding: '8px 10px', fontWeight: 600 }}>{it.productName}</td>
                            <td style={{ padding: '8px 10px', textAlign: 'center' }}>{size}</td>
                            <td style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 600 }}>{it.quantity} Pcs</td>
                            <td style={{ padding: '8px 10px', textAlign: 'right' }}>{formatRupiah(price)}</td>
                            <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600 }}>{formatRupiah(subtotal)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr style={{ background: '#f8fafc', fontWeight: 700 }}>
                        <td colSpan={3} style={{ padding: '8px 10px', textAlign: 'center' }}>TOTAL</td>
                        <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                          {printingReturn.items.reduce((sum, it) => sum + (it.quantity || 0), 0)} Pcs
                        </td>
                        <td></td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', color: '#0369a1' }}>
                          {formatRupiah(
                            printingReturn.items.reduce((sum, it) => {
                              const prod = products.find(p => p.id === it.productId);
                              return sum + ((it.quantity || 0) * (prod?.priceKopkar || 0));
                            }, 0)
                          )}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </div>

            <div className="return-modal-footer" style={{ borderTop: '1px solid #e2e8f0', padding: '14px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
              <button
                type="button"
                className="btn-view-detail"
                onClick={() => setPrintingReturn(null)}
              >
                ✕ Batal
              </button>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={isGeneratingPdf}
                  onClick={async () => {
                    setIsGeneratingPdf(true);
                    try {
                      await generateReturnPdf({
                        ret: printingReturn,
                        schoolName: printingReturn.schoolName || 'Sekolah BPK PENABUR',
                        recipientName: printRecipient,
                        senderName: printSender,
                        documentDate: printDate,
                        products,
                        action: 'print',
                      });
                    } catch (err: any) {
                      alert('Gagal membuka cetak: ' + (err?.message || 'Error'));
                    } finally {
                      setIsGeneratingPdf(false);
                    }
                  }}
                  style={{ padding: '9px 16px', borderRadius: '8px', border: '1.5px solid #0284c7', color: '#0284c7', background: '#fff', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}
                >
                  🖨️ Cetak Langsung
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  disabled={isGeneratingPdf}
                  onClick={async () => {
                    setIsGeneratingPdf(true);
                    try {
                      await generateReturnPdf({
                        ret: printingReturn,
                        schoolName: printingReturn.schoolName || 'Sekolah BPK PENABUR',
                        recipientName: printRecipient,
                        senderName: printSender,
                        documentDate: printDate,
                        products,
                        action: 'download',
                      });
                    } catch (err: any) {
                      alert('Gagal mendownload PDF: ' + (err?.message || 'Error'));
                    } finally {
                      setIsGeneratingPdf(false);
                    }
                  }}
                  style={{ padding: '9px 18px', borderRadius: '8px', background: '#0284c7', color: '#fff', border: 'none', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}
                >
                  {isGeneratingPdf ? '⏳ Memproses...' : '📄 Download PDF (A4)'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default KopkarReturn;
