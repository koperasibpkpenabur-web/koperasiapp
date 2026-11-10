import { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import './schoolRekap.css';

interface FlatRecapRow {
  orderId: string;
  orderDate: string;
  phase: string;
  status: string;
  name: string;
  type: string;
  size: string;
  unit: string;
  quantity: number;
  priceStudent: number;
  priceKopkar: number;
  feeSchool: number;
  totalStudent: number;
  totalKopkar: number;
  totalFee: number;
}

const formatRupiah = (num: number) => {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(num);
};

const formatDateShort = (isoString?: string) => {
  if (!isoString) return '-';
  try {
    const d = new Date(isoString);
    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return isoString;
  }
};

const getStatusBadge = (status: string) => {
  switch (status) {
    case 'received':
      return { label: 'Selesai (Diterima)', class: 'status-received' };
    case 'shipped':
      return { label: 'Sedang Dikirim', class: 'status-shipped' };
    case 'approved':
      return { label: 'Disetujui', class: 'status-approved' };
    case 'pending':
      return { label: 'Menunggu Persetujuan', class: 'status-pending' };
    case 'cancellation_requested':
      return { label: 'Permohonan Batal', class: 'status-pending' };
    case 'cancelled':
      return { label: 'Dibatalkan', class: 'status-cancelled' };
    case 'rejected':
      return { label: 'Ditolak', class: 'status-cancelled' };
    default:
      return { label: status, class: 'status-pending' };
  }
};

const SchoolRekap = () => {
  const { user } = useAuth();

  const [rawRows, setRawRows] = useState<FlatRecapRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [isExportingExcel, setIsExportingExcel] = useState(false);
  const [isExportingPDF, setIsExportingPDF] = useState(false);

  // Filters State
  const [statusFilter, setStatusFilter] = useState<string>('all_active');
  const [phaseFilter, setPhaseFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Pagination State
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [itemsPerPage, setItemsPerPage] = useState<number>(25);

  // Fetch all orders for this school
  const fetchRekapData = useCallback(async (silent = false) => {
    if (!user?.id) return;
    if (!silent) setLoading(true);

    try {
      const PAGE_SIZE = 1000;
      let allOrdersData: any[] = [];
      let from = 0;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from('orders')
          .select('id, created_at, order_phase, status, order_items(name, type, size, unit, quantity, price_student, price_kopkar, fee_school)')
          .eq('school_user_id', user.id)
          .order('created_at', { ascending: false })
          .range(from, from + PAGE_SIZE - 1);

        if (error) {
          console.error('Gagal mengambil data rekap sekolah:', error);
          break;
        }

        if (data && data.length > 0) {
          allOrdersData = allOrdersData.concat(data);
          if (data.length < PAGE_SIZE) {
            hasMore = false;
          } else {
            from += PAGE_SIZE;
          }
        } else {
          hasMore = false;
        }
      }

      // Flatten items into tabular rows
      const flattened: FlatRecapRow[] = [];
      allOrdersData.forEach((order) => {
        const items = order.order_items || [];
        items.forEach((it: any) => {
          const qty = Number(it.quantity) || 0;
          if (qty > 0) {
            const pStudent = Number(it.price_student) || 0;
            const pKopkar = Number(it.price_kopkar) || 0;
            const pFee = Number(it.fee_school) || 0;

            flattened.push({
              orderId: order.id,
              orderDate: order.created_at,
              phase: order.order_phase || 'Tahap 1',
              status: order.status,
              name: it.name || '-',
              type: it.type || 'seragam',
              size: (it.size || '').trim(),
              unit: it.unit || 'pcs',
              quantity: qty,
              priceStudent: pStudent,
              priceKopkar: pKopkar,
              feeSchool: pFee,
              totalStudent: qty * pStudent,
              totalKopkar: qty * pKopkar,
              totalFee: qty * pFee,
            });
          }
        });
      });

      // Sort natural: Phase first, then Item Name, then Size
      flattened.sort((a, b) => {
        if (a.phase !== b.phase) {
          return a.phase.localeCompare(b.phase, 'id', { numeric: true, sensitivity: 'base' });
        }
        if (a.name !== b.name) {
          return a.name.localeCompare(b.name, 'id', { numeric: true, sensitivity: 'base' });
        }
        return (a.size || '').localeCompare(b.size || '', 'id', { numeric: true, sensitivity: 'base' });
      });

      setRawRows(flattened);
    } catch (err) {
      console.error('Error in fetchRekapData:', err);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchRekapData();
  }, [fetchRekapData]);

  // Client-side Reactive Filtering
  const filteredRows = useMemo(() => {
    return rawRows.filter((row) => {
      // 1. Status Filter
      if (statusFilter === 'all_active') {
        if (!['pending', 'approved', 'shipped', 'received'].includes(row.status)) {
          return false;
        }
      } else if (statusFilter !== 'all') {
        if (row.status !== statusFilter) {
          return false;
        }
      }

      // 2. Phase Filter
      if (phaseFilter !== 'all' && row.phase !== phaseFilter) {
        return false;
      }

      // 3. Category Filter
      if (categoryFilter !== 'all' && row.type !== categoryFilter) {
        return false;
      }

      // 4. Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = row.name.toLowerCase().includes(q);
        const matchSize = row.size.toLowerCase().includes(q);
        const matchPhase = row.phase.toLowerCase().includes(q);
        const matchOrderId = row.orderId.toLowerCase().includes(q);
        if (!matchName && !matchSize && !matchPhase && !matchOrderId) {
          return false;
        }
      }

      return true;
    });
  }, [rawRows, statusFilter, phaseFilter, categoryFilter, searchQuery]);

  // Aggregated Stat Calculations (Live based on filtered dataset)
  const totalQuantity = useMemo(() => {
    return filteredRows.reduce((sum, r) => sum + r.quantity, 0);
  }, [filteredRows]);

  const totalRupiahKopkar = useMemo(() => {
    return filteredRows.reduce((sum, r) => sum + r.totalKopkar, 0);
  }, [filteredRows]);

  const totalRupiahFee = useMemo(() => {
    return filteredRows.reduce((sum, r) => sum + r.totalFee, 0);
  }, [filteredRows]);

  const totalRupiahStudent = useMemo(() => {
    return filteredRows.reduce((sum, r) => sum + r.totalStudent, 0);
  }, [filteredRows]);

  const uniqueOrdersCount = useMemo(() => {
    return new Set(filteredRows.map((r) => r.orderId)).size;
  }, [filteredRows]);

  // Pagination Calculations
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / itemsPerPage));
  const safeCurrentPage = Math.min(currentPage, totalPages);

  const paginatedRows = useMemo(() => {
    const fromIdx = (safeCurrentPage - 1) * itemsPerPage;
    return filteredRows.slice(fromIdx, fromIdx + itemsPerPage);
  }, [filteredRows, safeCurrentPage, itemsPerPage]);

  const handleFilterChange = (setter: (v: string) => void, val: string) => {
    setter(val);
    setCurrentPage(1);
  };

  const handleResetFilters = () => {
    setStatusFilter('all_active');
    setPhaseFilter('all');
    setCategoryFilter('all');
    setSearchQuery('');
    setCurrentPage(1);
  };

  const hasActiveFilters =
    statusFilter !== 'all_active' ||
    phaseFilter !== 'all' ||
    categoryFilter !== 'all' ||
    searchQuery.trim() !== '';

  // Excel Export
  const handleDownloadExcel = () => {
    if (filteredRows.length === 0) {
      alert('Tidak ada data pesanan untuk diekspor ke Excel.');
      return;
    }

    setIsExportingExcel(true);
    try {
      const exportData = filteredRows.map((row, index) => ({
        'No': index + 1,
        'Tanggal Order': formatDateShort(row.orderDate),
        'Fase Pesanan': row.phase,
        'Nama Barang': row.name,
        'Ukuran': row.size || '-',
        'Kategori': row.type === 'seragam' ? 'Seragam' : 'Buku',
        'Status': getStatusBadge(row.status).label,
        'Kuantitas (pcs)': row.quantity,
        'Harga Modal Kopkar (Rp)': row.priceKopkar,
        'Total Modal Kopkar (Rp)': row.totalKopkar,
        'Fee Sekolah (Rp)': row.feeSchool,
        'Total Fee Sekolah (Rp)': row.totalFee,
        'Harga Siswa (Rp)': row.priceStudent,
        'Total Tagihan Siswa (Rp)': row.totalStudent,
        'No. Pesanan': row.orderId,
      }));

      // Add summary row at the bottom
      exportData.push({
        'No': '' as any,
        'Tanggal Order': '',
        'Fase Pesanan': '',
        'Nama Barang': 'TOTAL KESELURUHAN',
        'Ukuran': '',
        'Kategori': '',
        'Status': `${filteredRows.length} item (${uniqueOrdersCount} berkas order)`,
        'Kuantitas (pcs)': totalQuantity,
        'Harga Modal Kopkar (Rp)': 0,
        'Total Modal Kopkar (Rp)': totalRupiahKopkar,
        'Fee Sekolah (Rp)': 0,
        'Total Fee Sekolah (Rp)': totalRupiahFee,
        'Harga Siswa (Rp)': 0,
        'Total Tagihan Siswa (Rp)': totalRupiahStudent,
        'No. Pesanan': '',
      });

      const worksheet = XLSX.utils.json_to_sheet(exportData);
      worksheet['!cols'] = [
        { wch: 6 },
        { wch: 15 },
        { wch: 18 },
        { wch: 35 },
        { wch: 10 },
        { wch: 12 },
        { wch: 22 },
        { wch: 16 },
        { wch: 22 },
        { wch: 22 },
        { wch: 18 },
        { wch: 20 },
        { wch: 18 },
        { wch: 24 },
        { wch: 26 },
      ];

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Rekap_Pesanan');
      const schoolNameSlug = (user?.schoolName || user?.name || 'Sekolah').replace(/[^a-zA-Z0-9]/g, '_');
      XLSX.writeFile(workbook, `Rekap_Pesanan_${schoolNameSlug}_${new Date().toISOString().split('T')[0]}.xlsx`);
    } catch (err) {
      console.error('Error exporting Excel:', err);
      alert('Gagal mengekspor data ke Excel.');
    } finally {
      setIsExportingExcel(false);
    }
  };

  // PDF Export
  const handleDownloadPDF = () => {
    if (filteredRows.length === 0) {
      alert('Tidak ada data pesanan untuk diekspor ke PDF.');
      return;
    }

    setIsExportingPDF(true);
    try {
      const doc = new jsPDF('landscape');
      const schoolTitle = user?.schoolName || user?.name || 'Sekolah';

      // Header title
      doc.setFontSize(16);
      doc.setTextColor(30, 45, 66);
      doc.text(`REKAPITULASI PESANAN - ${schoolTitle.toUpperCase()}`, 14, 15);

      doc.setFontSize(9);
      doc.setTextColor(100, 116, 139);
      doc.text(`Dicetak pada: ${new Date().toLocaleString('id-ID')} | Total Item: ${filteredRows.length} (${uniqueOrdersCount} berkas order)`, 14, 21);
      doc.text(`Filter: Status [${statusFilter}] | Fase [${phaseFilter}] | Kategori [${categoryFilter}]`, 14, 26);

      const tableColumn = [
        'No',
        'Fase',
        'Nama Barang',
        'Ukuran',
        'Kategori',
        'Status',
        'Qty',
        'H. Kopkar',
        'T. Kopkar',
        'Fee Sek',
        'T. Fee',
        'H. Siswa',
        'T. Siswa',
      ];

      const tableRows: any[] = [];
      filteredRows.forEach((row, index) => {
        tableRows.push([
          index + 1,
          row.phase,
          row.name,
          row.size || '-',
          row.type === 'seragam' ? 'Seragam' : 'Buku',
          getStatusBadge(row.status).label,
          row.quantity,
          formatRupiah(row.priceKopkar),
          formatRupiah(row.totalKopkar),
          formatRupiah(row.feeSchool),
          formatRupiah(row.totalFee),
          formatRupiah(row.priceStudent),
          formatRupiah(row.totalStudent),
        ]);
      });

      // Add summary row at the end
      tableRows.push([
        '',
        '',
        'TOTAL KESELURUHAN',
        '',
        '',
        '',
        totalQuantity,
        '',
        formatRupiah(totalRupiahKopkar),
        '',
        formatRupiah(totalRupiahFee),
        '',
        formatRupiah(totalRupiahStudent),
      ]);

      autoTable(doc, {
        head: [tableColumn],
        body: tableRows,
        startY: 31,
        styles: { fontSize: 7.5, cellPadding: 2.2 },
        headStyles: { fillColor: [57, 88, 134], textColor: [255, 255, 255], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [248, 250, 253] },
        didParseCell: (data: any) => {
          if (data.row.index === tableRows.length - 1) {
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.fillColor = [220, 228, 242];
            data.cell.styles.textColor = [30, 45, 66];
          }
        },
      });

      const schoolNameSlug = (user?.schoolName || user?.name || 'Sekolah').replace(/[^a-zA-Z0-9]/g, '_');
      doc.save(`Rekap_Pesanan_${schoolNameSlug}_${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (err) {
      console.error('Error exporting PDF:', err);
      alert('Gagal mengekspor data ke PDF.');
    } finally {
      setIsExportingPDF(false);
    }
  };

  return (
    <div className="school-rekap-page">
      {/* 1. HEADER SECTION */}
      <div className="school-rekap-header">
        <div className="school-rekap-header-title">
          <div className="school-rekap-badge">
            <span>📊</span> Rekapitulasi & Laporan Keuangan
          </div>
          <h2 className="school-rekap-title">Rekapitulasi Pesanan Sekolah</h2>
          <p className="school-rekap-subtitle">
            Ringkasan seluruh riwayat pesanan barang seragam & buku untuk{' '}
            <strong>{user?.schoolName || user?.name || 'Sekolah'}</strong>, beserta rincian modal Koperasi dan margin fee sekolah.
          </p>
        </div>

        <div className="school-rekap-actions">
          <button
            className="btn-rekap-refresh"
            onClick={() => fetchRekapData(true)}
            disabled={loading}
            title="Muat ulang data terbaru"
          >
            <span>🔄</span> Refresh
          </button>

          <button
            className="btn-export-excel"
            onClick={handleDownloadExcel}
            disabled={loading || isExportingExcel || filteredRows.length === 0}
            title="Download seluruh data terfilter ke format Excel (.xlsx)"
          >
            <span>📗</span> {isExportingExcel ? 'Menyiapkan Excel...' : 'Export Excel'}
          </button>

          <button
            className="btn-export-pdf"
            onClick={handleDownloadPDF}
            disabled={loading || isExportingPDF || filteredRows.length === 0}
            title="Download format dokumen resmi PDF (.pdf)"
          >
            <span>📕</span> {isExportingPDF ? 'Menyiapkan PDF...' : 'Export PDF'}
          </button>
        </div>
      </div>

      {/* 2. THE 4 STAT CARDS */}
      <div className="rekap-cards-grid">
        {/* Card 1: Kuantitas */}
        <div className="rekap-card card-quantity">
          <div className="rekap-card-top">
            <span className="rekap-card-label">Total Kuantitas Barang</span>
            <div className="rekap-card-icon">📦</div>
          </div>
          <div className="rekap-card-value">{loading ? '...' : `${totalQuantity.toLocaleString('id-ID')} pcs`}</div>
          <div className="rekap-card-footer">
            <span>{loading ? 'Menghitung...' : `Dari ${filteredRows.length} item (${uniqueOrdersCount} berkas pesanan)`}</span>
          </div>
        </div>

        {/* Card 2: Modal Kopkar */}
        <div className="rekap-card card-kopkar">
          <div className="rekap-card-top">
            <span className="rekap-card-label">Belanja Modal Koperasi</span>
            <div className="rekap-card-icon">🏭</div>
          </div>
          <div className="rekap-card-value">{loading ? '...' : formatRupiah(totalRupiahKopkar)}</div>
          <div className="rekap-card-footer">
            <span>Biaya pengadaan HPP Koperasi</span>
          </div>
        </div>

        {/* Card 3: Fee Sekolah */}
        <div className="rekap-card card-fee">
          <div className="rekap-card-top">
            <span className="rekap-card-label">Fee Sekolah (Hak Margin)</span>
            <div className="rekap-card-icon">🎁</div>
          </div>
          <div className="rekap-card-value">{loading ? '...' : formatRupiah(totalRupiahFee)}</div>
          <div className="rekap-card-footer">
            <span>Hak keuntungan untuk kas sekolah</span>
            <span className="rekap-card-badge badge-green">Hak Sekolah</span>
          </div>
        </div>

        {/* Card 4: Tagihan Siswa */}
        <div className="rekap-card card-student">
          <div className="rekap-card-top">
            <span className="rekap-card-label">Total Tagihan Siswa</span>
            <div className="rekap-card-icon">💰</div>
          </div>
          <div className="rekap-card-value">{loading ? '...' : formatRupiah(totalRupiahStudent)}</div>
          <div className="rekap-card-footer">
            <span>Nilai jual barang ke siswa (Kopkar + Fee)</span>
          </div>
        </div>
      </div>

      {/* 3. MODERN FILTER BAR CARD */}
      <div className="rekap-filter-card">
        <div className="rekap-filter-row">
          {/* Search Box */}
          <div className="rekap-search-wrap">
            <span className="rekap-search-icon">🔍</span>
            <input
              type="text"
              className="rekap-search-input"
              placeholder="Cari nama barang, ukuran, nomor pesanan, atau fase..."
              value={searchQuery}
              onChange={(e) => handleFilterChange(setSearchQuery, e.target.value)}
            />
            {searchQuery && (
              <button
                className="rekap-search-clear"
                onClick={() => handleFilterChange(setSearchQuery, '')}
                title="Hapus pencarian"
              >
                ✕
              </button>
            )}
          </div>

          {/* Dropdown Filters Group */}
          <div className="rekap-dropdown-group">
            {/* Status Filter */}
            <div className="rekap-filter-item">
              <label>Status Pesanan</label>
              <select
                className="rekap-select"
                value={statusFilter}
                onChange={(e) => handleFilterChange(setStatusFilter, e.target.value)}
              >
                <option value="all_active">Semua Aktif (Berjalan & Selesai)</option>
                <option value="received">✅ Selesai (Diterima)</option>
                <option value="shipped">🚚 Sedang Dikirim</option>
                <option value="approved">👍 Disetujui (Siap Kirim)</option>
                <option value="pending">⏳ Menunggu Persetujuan</option>
                <option value="all">Semua Status (Termasuk Batal)</option>
                <option value="cancelled">❌ Dibatalkan</option>
              </select>
            </div>

            {/* Fase Filter */}
            <div className="rekap-filter-item">
              <label>Fase Pemesanan</label>
              <select
                className="rekap-select"
                value={phaseFilter}
                onChange={(e) => handleFilterChange(setPhaseFilter, e.target.value)}
              >
                <option value="all">Semua Fase</option>
                <option value="Tahap 1">Tahap 1</option>
                <option value="Tambahan Tahap 1">Tambahan Tahap 1</option>
                <option value="Tahap 2">Tahap 2</option>
                <option value="Tambahan Tahap 2">Tambahan Tahap 2</option>
                <option value="Tambahan Mingguan">Tambahan Mingguan</option>
                <option value="On The Spot">On The Spot (Langsung)</option>
              </select>
            </div>

            {/* Kategori Filter */}
            <div className="rekap-filter-item">
              <label>Kategori</label>
              <select
                className="rekap-select"
                value={categoryFilter}
                onChange={(e) => handleFilterChange(setCategoryFilter, e.target.value)}
              >
                <option value="all">Semua Kategori</option>
                <option value="seragam">👕 Seragam</option>
                <option value="buku">📚 Buku</option>
              </select>
            </div>

            {/* Reset Filter Button */}
            {hasActiveFilters && (
              <button
                className="btn-reset-filters"
                onClick={handleResetFilters}
                title="Kembalikan semua filter ke awal"
              >
                <span>↺</span> Reset Filter
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 4. TABLE SECTION */}
      <div className="rekap-table-card">
        <div className="rekap-table-header-info">
          <div>
            Menampilkan <strong>{filteredRows.length === 0 ? 0 : (safeCurrentPage - 1) * itemsPerPage + 1}</strong> -{' '}
            <strong>{Math.min(safeCurrentPage * itemsPerPage, filteredRows.length)}</strong> dari{' '}
            <strong>{filteredRows.length}</strong> total baris barang
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>Tampilkan per halaman:</span>
            <select
              className="rekap-select"
              style={{ minWidth: '80px', padding: '4px 8px', fontSize: '0.8rem' }}
              value={itemsPerPage}
              onChange={(e) => {
                setItemsPerPage(Number(e.target.value));
                setCurrentPage(1);
              }}
            >
              <option value={15}>15</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
        </div>

        <div className="rekap-table-scroll">
          <table className="rekap-table">
            <thead>
              <tr>
                <th style={{ width: '40px', textAlign: 'center' }}>No</th>
                <th>Fase & Tanggal</th>
                <th>Nama Barang & Ukuran</th>
                <th>Kategori</th>
                <th>Status</th>
                <th style={{ textAlign: 'center' }}>Kuantitas</th>
                <th style={{ textAlign: 'right' }}>Harga Modal (Kopkar)</th>
                <th style={{ textAlign: 'right' }}>Fee Sekolah</th>
                <th style={{ textAlign: 'right' }}>Harga Siswa</th>
                <th style={{ textAlign: 'right' }}>Total Tagihan (Siswa)</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={10} style={{ textAlign: 'center', padding: '48px', color: '#64748b' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', fontSize: '0.95rem' }}>
                      <span>⏳</span> Memuat rekapitulasi data pesanan...
                    </div>
                  </td>
                </tr>
              ) : paginatedRows.length > 0 ? (
                paginatedRows.map((row, idx) => {
                  const statusInfo = getStatusBadge(row.status);
                  const rowNumber = (safeCurrentPage - 1) * itemsPerPage + idx + 1;

                  return (
                    <tr key={`${row.orderId}-${row.name}-${row.size}-${idx}`}>
                      <td style={{ textAlign: 'center', color: '#64748b', fontSize: '0.8rem' }}>{rowNumber}</td>
                      <td>
                        <div className="rekap-phase-badge">{row.phase}</div>
                        <div style={{ fontSize: '0.74rem', color: '#8494a8', marginTop: '3px' }}>
                          {formatDateShort(row.orderDate)}
                        </div>
                      </td>
                      <td>
                        <span style={{ fontWeight: 600, color: '#1e2d42' }}>{row.name}</span>
                        {row.size && <span className="rekap-size-tag">[{row.size}]</span>}
                        <div style={{ fontSize: '0.74rem', color: '#8494a8', marginTop: '2px' }}>
                          ID: {row.orderId.substring(0, 12)}...
                        </div>
                      </td>
                      <td>
                        <span className={`rekap-category-badge ${row.type === 'seragam' ? 'category-seragam' : 'category-buku'}`}>
                          {row.type === 'seragam' ? '👕 Seragam' : '📚 Buku'}
                        </span>
                      </td>
                      <td>
                        <span className={`rekap-status-pill ${statusInfo.class}`}>{statusInfo.label}</span>
                      </td>
                      <td style={{ textAlign: 'center', fontWeight: 700, fontSize: '0.92rem' }}>
                        {row.quantity.toLocaleString('id-ID')}{' '}
                        <span style={{ fontSize: '0.74rem', fontWeight: 400, color: '#64748b' }}>{row.unit || 'pcs'}</span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '0.85rem' }}>{formatRupiah(row.priceKopkar)}</div>
                        <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Sub: {formatRupiah(row.totalKopkar)}</div>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '0.85rem', color: '#047857', fontWeight: 600 }}>
                          +{formatRupiah(row.feeSchool)}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: '#059669' }}>Sub: {formatRupiah(row.totalFee)}</div>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '0.85rem' }}>{formatRupiah(row.priceStudent)}</div>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ fontWeight: 700, color: '#1e2d42', fontSize: '0.92rem' }}>
                          {formatRupiah(row.totalStudent)}
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={10}>
                    <div className="rekap-empty-state">
                      <div className="rekap-empty-icon">📦</div>
                      <h4 className="rekap-empty-title">Tidak ada data pesanan yang cocok</h4>
                      <p className="rekap-empty-text">
                        Tidak ada riwayat barang yang sesuai dengan filter atau kata kunci yang dipilih saat ini.
                      </p>
                      {hasActiveFilters && (
                        <button className="btn-reset-filters" onClick={handleResetFilters} style={{ alignSelf: 'center' }}>
                          <span>↺</span> Reset Semua Filter
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* 5. PAGINATION CONTROLS */}
        {!loading && filteredRows.length > 0 && (
          <div className="rekap-pagination-bar">
            <div className="rekap-pagination-info">
              Halaman <strong>{safeCurrentPage}</strong> dari <strong>{totalPages}</strong> (Total {filteredRows.length} item)
            </div>

            <div className="rekap-pagination-controls">
              <button
                className="btn-page-nav"
                disabled={safeCurrentPage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              >
                ← Sebelumnya
              </button>

              {/* Numbered Page Buttons */}
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum: number;
                if (totalPages <= 5) {
                  pageNum = i + 1;
                } else if (safeCurrentPage <= 3) {
                  pageNum = i + 1;
                } else if (safeCurrentPage >= totalPages - 2) {
                  pageNum = totalPages - 4 + i;
                } else {
                  pageNum = safeCurrentPage - 2 + i;
                }

                return (
                  <button
                    key={pageNum}
                    className={`btn-page-number ${safeCurrentPage === pageNum ? 'active' : ''}`}
                    onClick={() => setCurrentPage(pageNum)}
                  >
                    {pageNum}
                  </button>
                );
              })}

              <button
                className="btn-page-nav"
                disabled={safeCurrentPage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              >
                Selanjutnya →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SchoolRekap;
