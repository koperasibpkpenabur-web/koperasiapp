import { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '../../lib/supabase';
import './kopkar.css';

interface OrderItemRecap {
  name: string;
  type: string;
  quantity: number;
  priceStudent: number;
  priceKopkar: number;
  feeSchool: number;
}

interface OrderRecap {
  id: string;
  schoolName: string;
  schoolLevel: string;
  orderPhase: string;
  status: string;
  createdAt: string;
  totalPriceStudent: number;
  totalPriceKopkar: number;
  totalFeeSchool: number;
  items: OrderItemRecap[];
}

interface RecapRow {
  orderId: string;
  orderDate: string;
  schoolName: string;
  level: string;
  phase: string;
  itemName: string;
  itemType: string;
  quantity: number;
  priceKopkar: number;
  feeSchool: number;
  priceStudent: number;
  totalKopkar: number;
  totalFee: number;
  totalStudent: number;
  status: string;
}

const KopkarRekap = () => {
  const [statusFilter, setStatusFilter] = useState<string>('all_active');
  const [phaseFilter, setPhaseFilter] = useState<string>('all');
  const [levelFilter, setLevelFilter] = useState<string>('all');
  const [periodFilter, setPeriodFilter] = useState<string>('all');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const [orders, setOrders] = useState<OrderRecap[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;

  // Hitung rentang tanggal berdasarkan periodFilter
  const { filterStartDate, filterEndDate } = useMemo(() => {
    const now = new Date();
    if (periodFilter === 'this_month') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return { filterStartDate: start.toISOString(), filterEndDate: '' };
    }
    if (periodFilter === 'last_month') {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
      return { filterStartDate: start.toISOString(), filterEndDate: end.toISOString() };
    }
    if (periodFilter === 'this_year') {
      const start = new Date(now.getFullYear(), 0, 1);
      return { filterStartDate: start.toISOString(), filterEndDate: '' };
    }
    if (periodFilter === 'custom') {
      const start = customStartDate ? new Date(`${customStartDate}T00:00:00`).toISOString() : '';
      const end = customEndDate ? new Date(`${customEndDate}T23:59:59`).toISOString() : '';
      return { filterStartDate: start, filterEndDate: end };
    }
    return { filterStartDate: '', filterEndDate: '' };
  }, [periodFilter, customStartDate, customEndDate]);

  // Fetch data dengan pagination bertahap (range) agar tidak terpotong batas 1.000 data Supabase
  useEffect(() => {
    let isCancelled = false;

    const fetchData = async () => {
      setLoading(true);
      try {
        const PAGE_SIZE = 1000;
        let allRows: any[] = [];
        let from = 0;
        let hasMore = true;

        while (hasMore && !isCancelled) {
          let query = supabase
            .from('orders')
            .select('id, school_name, school_level, order_phase, status, created_at, total_price_student, total_price_kopkar, total_fee_school, order_items(name, type, quantity, price_student, price_kopkar, fee_school)')
            .order('created_at', { ascending: false });

          if (filterStartDate) {
            query = query.gte('created_at', filterStartDate);
          }
          if (filterEndDate) {
            query = query.lte('created_at', filterEndDate);
          }

          const { data, error } = await query.range(from, from + PAGE_SIZE - 1);

          if (error) {
            console.error('Error fetching rekap data:', error);
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

        if (!isCancelled) {
          setOrders(
            allRows.map((row: any) => ({
              id: row.id,
              schoolName: row.school_name || '-',
              schoolLevel: row.school_level || '-',
              orderPhase: row.order_phase || '-',
              status: row.status || 'pending',
              createdAt: row.created_at || '',
              totalPriceStudent: Number(row.total_price_student) || 0,
              totalPriceKopkar: Number(row.total_price_kopkar) || 0,
              totalFeeSchool: Number(row.total_fee_school) || 0,
              items: (row.order_items || []).map((it: any) => ({
                name: it.name || '-',
                type: it.type || 'seragam',
                quantity: Number(it.quantity) || 0,
                priceStudent: Number(it.price_student) || 0,
                priceKopkar: Number(it.price_kopkar) || 0,
                feeSchool: Number(it.fee_school) || 0,
              })),
            }))
          );
        }
      } catch (err) {
        console.error('Failed to load orders for recap:', err);
      } finally {
        if (!isCancelled) setLoading(false);
      }
    };

    fetchData();

    return () => {
      isCancelled = true;
    };
  }, [filterStartDate, filterEndDate]);

  // Transform dan filter baris rekap
  const recapData = useMemo(() => {
    const qLower = searchQuery.trim().toLowerCase();

    const filteredOrders = orders.filter((o) => {
      // 1. Filter Status
      if (statusFilter === 'all_active') {
        if (o.status === 'cancelled' || o.status === 'rejected') return false;
      } else if (statusFilter !== 'all' && o.status !== statusFilter) {
        return false;
      }

      // 2. Filter Fase
      if (phaseFilter !== 'all' && o.orderPhase !== phaseFilter) {
        return false;
      }

      // 3. Filter Jenjang
      if (levelFilter !== 'all') {
        const oLvl = (o.schoolLevel || '').toUpperCase().trim();
        const fLvl = levelFilter.toUpperCase().trim();
        if (oLvl !== fLvl && !oLvl.startsWith(fLvl)) return false;
      }

      return true;
    });

    const rows: RecapRow[] = [];

    filteredOrders.forEach((o) => {
      const formattedDate = o.createdAt
        ? new Date(o.createdAt).toLocaleDateString('id-ID', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
          })
        : '-';

      o.items.forEach((it) => {
        if (it.quantity > 0) {
          // Filter Search Query (Nama Sekolah atau Nama Barang atau ID Pesanan)
          if (qLower) {
            const matchSchool = o.schoolName.toLowerCase().includes(qLower);
            const matchItem = it.name.toLowerCase().includes(qLower);
            const matchId = o.id.toLowerCase().includes(qLower);
            if (!matchSchool && !matchItem && !matchId) return;
          }

          rows.push({
            orderId: o.id,
            orderDate: formattedDate,
            schoolName: o.schoolName,
            level: o.schoolLevel || '-',
            phase: o.orderPhase || '-',
            itemName: it.name,
            itemType: it.type,
            quantity: it.quantity,
            priceKopkar: it.priceKopkar,
            feeSchool: it.feeSchool,
            priceStudent: it.priceStudent,
            totalKopkar: it.quantity * it.priceKopkar,
            totalFee: it.quantity * it.feeSchool,
            totalStudent: it.quantity * it.priceStudent,
            status: o.status,
          });
        }
      });
    });

    rows.sort((a, b) => {
      if (a.schoolName !== b.schoolName)
        return a.schoolName.localeCompare(b.schoolName, 'id', { numeric: true, sensitivity: 'base' });
      if (a.phase !== b.phase)
        return a.phase.localeCompare(b.phase, 'id', { numeric: true, sensitivity: 'base' });
      return a.itemName.localeCompare(b.itemName, 'id', { numeric: true, sensitivity: 'base' });
    });

    return rows;
  }, [orders, statusFilter, phaseFilter, levelFilter, searchQuery]);

  // Statistik agregasi
  const totalQuantity = useMemo(() => recapData.reduce((acc, row) => acc + row.quantity, 0), [recapData]);
  const totalRupiahStudent = useMemo(() => recapData.reduce((acc, row) => acc + row.totalStudent, 0), [recapData]);
  const totalRupiahKopkar = useMemo(() => recapData.reduce((acc, row) => acc + row.totalKopkar, 0), [recapData]);
  const totalRupiahFee = useMemo(() => recapData.reduce((acc, row) => acc + row.totalFee, 0), [recapData]);
  const uniqueOrdersCount = useMemo(() => new Set(recapData.map((r) => r.orderId)).size, [recapData]);

  // Paginasi tabel tampilan
  const totalPages = Math.max(1, Math.ceil(recapData.length / itemsPerPage));
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return recapData.slice(start, start + itemsPerPage);
  }, [recapData, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter, phaseFilter, levelFilter, periodFilter, searchQuery]);

  const formatRupiah = (num: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0,
    }).format(num);
  };

  const handleDownloadExcel = () => {
    if (recapData.length === 0) {
      alert('Tidak ada data rekap untuk didownload dengan filter saat ini.');
      return;
    }

    const exportData = recapData.map((row, index) => ({
      No: index + 1,
      'No. Pesanan': row.orderId,
      'Tanggal Pesan': row.orderDate,
      'Nama Sekolah': row.schoolName,
      Jenjang: row.level,
      'Fase Pesanan': row.phase,
      'Nama Barang': row.itemName,
      Kategori: row.itemType.toUpperCase(),
      'Status Pesanan': row.status.toUpperCase(),
      'Kuantitas (pcs)': row.quantity,
      'Modal Satuan (Kopkar)': row.priceKopkar,
      'Fee Satuan (Sekolah)': row.feeSchool,
      'Harga Satuan (Siswa)': row.priceStudent,
      'Total Modal Kopkar (Rp)': row.totalKopkar,
      'Total Hak Fee Sekolah (Rp)': row.totalFee,
      'Total Nilai Siswa (Rp)': row.totalStudent,
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);

    const wscols = [
      { wch: 6 },  // No
      { wch: 20 }, // No Pesanan
      { wch: 15 }, // Tanggal
      { wch: 32 }, // Nama Sekolah
      { wch: 10 }, // Jenjang
      { wch: 18 }, // Fase
      { wch: 38 }, // Nama Barang
      { wch: 14 }, // Kategori
      { wch: 16 }, // Status
      { wch: 14 }, // Qty
      { wch: 18 }, // Modal
      { wch: 18 }, // Fee
      { wch: 18 }, // Harga Siswa
      { wch: 22 }, // Total Kopkar
      { wch: 22 }, // Total Fee
      { wch: 22 }, // Total Siswa
    ];
    worksheet['!cols'] = wscols;

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Rekap_Pesanan');
    XLSX.writeFile(workbook, `Rekap_Pesanan_Koperasi_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="kopkar-dashboard">
      <h2>📊 Rekapitulasi Pesanan Sekolah</h2>
      <p style={{ color: '#64748b', marginBottom: '20px' }}>
        Lihat dan unduh ringkasan transaksi pesanan seluruh sekolah secara lengkap, terfilter, dan aman dari batas data.
      </p>

      {/* FILTER PANEL */}
      <div
        className="kopkar-toolbar"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          background: '#ffffff',
          padding: '16px',
          borderRadius: '12px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
          marginBottom: '20px',
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
          {/* Filter Status */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.9rem' }}
          >
            <option value="all_active">Semua Aktif (Berjalan & Selesai)</option>
            <option value="all">Semua Status (Termasuk Dibatalkan)</option>
            <option value="pending">Hanya Menunggu Persetujuan</option>
            <option value="approved">Hanya Disetujui (Siap Kirim)</option>
            <option value="shipped">Hanya Sedang Dikirim</option>
            <option value="received">Hanya Selesai (Diterima)</option>
            <option value="cancelled">Hanya Dibatalkan</option>
          </select>

          {/* Filter Fase */}
          <select
            value={phaseFilter}
            onChange={(e) => setPhaseFilter(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.9rem' }}
          >
            <option value="all">Semua Fase Pesanan</option>
            <option value="Tahap 1">Tahap 1</option>
            <option value="Tambahan Tahap 1">Tambahan Tahap 1</option>
            <option value="Tahap 2">Tahap 2</option>
            <option value="Tambahan Tahap 2">Tambahan Tahap 2</option>
            <option value="Tambahan Mingguan">Tambahan Mingguan</option>
            <option value="On The Spot">On The Spot (Langsung di Koperasi)</option>
          </select>

          {/* Filter Jenjang */}
          <select
            value={levelFilter}
            onChange={(e) => setLevelFilter(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.9rem' }}
          >
            <option value="all">Semua Jenjang</option>
            <option value="TK">TK</option>
            <option value="SD">SD</option>
            <option value="SMP">SMP</option>
            <option value="SMA">SMA</option>
            <option value="SPK-SD">SPK-SD</option>
            <option value="SPK-SMP">SPK-SMP</option>
            <option value="SPK-SMA">SPK-SMA</option>
          </select>

          {/* Filter Periode / Waktu */}
          <select
            value={periodFilter}
            onChange={(e) => setPeriodFilter(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.9rem' }}
          >
            <option value="all">Semua Periode Tanggal</option>
            <option value="this_month">Bulan Ini</option>
            <option value="last_month">Bulan Lalu</option>
            <option value="this_year">Tahun Berjalan Ini</option>
            <option value="custom">Rentang Tanggal Kustom...</option>
          </select>

          {/* Input Tanggal Kustom */}
          {periodFilter === 'custom' && (
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                style={{ padding: '7px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
              />
              <span style={{ fontSize: '0.85rem', color: '#64748b' }}>s/d</span>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                style={{ padding: '7px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
              />
            </div>
          )}

          {/* Input Pencarian */}
          <div style={{ flex: '1 1 200px', minWidth: '180px' }}>
            <input
              type="text"
              placeholder="🔍 Cari nama sekolah / barang / no. order..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 14px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                fontSize: '0.9rem',
              }}
            />
          </div>

          {/* Tombol Download Excel */}
          <button
            onClick={handleDownloadExcel}
            style={{
              background: '#059669',
              color: 'white',
              border: 'none',
              padding: '9px 18px',
              borderRadius: '8px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: '0 2px 4px rgba(5, 150, 105, 0.25)',
              fontSize: '0.9rem',
              whiteSpace: 'nowrap',
            }}
          >
            <span>📥</span> Download Excel (.xlsx)
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
          <p style={{ fontSize: '1.1rem' }}>⏳ Memuat seluruh data pesanan dari database...</p>
          <p style={{ fontSize: '0.85rem', color: '#94a3b8' }}>Menerapkan pagination bertahap agar tidak ada data yang terpotong.</p>
        </div>
      ) : (
        <>
          {/* KARTU STATISTIK AGREGASI */}
          <div
            className="kopkar-stats"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
              gap: '14px',
              marginBottom: '20px',
            }}
          >
            <div className="kopkar-stat-card">
              <div className="stat-icon">📦</div>
              <div className="stat-label">Total Kuantitas Barang</div>
              <div className="stat-value">{totalQuantity.toLocaleString('id-ID')} pcs</div>
              <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '4px' }}>
                Dari {uniqueOrdersCount} berkas pesanan
              </div>
            </div>

            <div className="kopkar-stat-card">
              <div className="stat-icon">💰</div>
              <div className="stat-label">Total Tagihan Siswa</div>
              <div className="stat-value" style={{ color: '#0f766e' }}>
                {formatRupiah(totalRupiahStudent)}
              </div>
              <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '4px' }}>
                Omset kotor seragam & buku
              </div>
            </div>

            <div className="kopkar-stat-card">
              <div className="stat-icon">🏭</div>
              <div className="stat-label">Modal Bersih Koperasi</div>
              <div className="stat-value" style={{ color: '#1e40af' }}>
                {formatRupiah(totalRupiahKopkar)}
              </div>
              <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '4px' }}>
                Hak modal pengadaan Koperasi
              </div>
            </div>

            <div className="kopkar-stat-card">
              <div className="stat-icon">🏫</div>
              <div className="stat-label">Total Hak Fee Sekolah</div>
              <div className="stat-value" style={{ color: '#b45309' }}>
                {formatRupiah(totalRupiahFee)}
              </div>
              <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '4px' }}>
                Margin pencairan untuk sekolah
              </div>
            </div>
          </div>

          {/* TABEL DATA REKAP */}
          <div className="kopkar-table-container" style={{ background: '#ffffff', borderRadius: '12px', overflow: 'hidden' }}>
            <div
              style={{
                padding: '12px 16px',
                borderBottom: '1px solid #f1f5f9',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: '#f8fafc',
              }}
            >
              <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#334155' }}>
                Daftar Rincian Item ({recapData.length.toLocaleString('id-ID')} baris data ditemukan)
              </div>
              {recapData.length > itemsPerPage && (
                <div style={{ fontSize: '0.85rem', color: '#64748b' }}>
                  Halaman {currentPage} dari {totalPages}
                </div>
              )}
            </div>

            <table className="kopkar-table">
              <thead>
                <tr>
                  <th style={{ width: '40px', textAlign: 'center' }}>No</th>
                  <th>Sekolah & Fase</th>
                  <th>Nama Barang</th>
                  <th style={{ textAlign: 'center' }}>Kuantitas</th>
                  <th style={{ textAlign: 'right' }}>Modal Kopkar</th>
                  <th style={{ textAlign: 'right' }}>Fee Sekolah</th>
                  <th style={{ textAlign: 'right' }}>Total Siswa (Rp)</th>
                </tr>
              </thead>
              <tbody>
                {paginatedRows.length > 0 ? (
                  paginatedRows.map((row, idx) => {
                    const rowNumber = (currentPage - 1) * itemsPerPage + idx + 1;
                    return (
                      <tr key={`${row.orderId}-${row.itemName}-${idx}`}>
                        <td style={{ textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>{rowNumber}</td>
                        <td>
                          <strong>{row.schoolName}</strong>
                          <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '4px' }}>
                            <span className={`badge-level ${row.level}`}>{row.level}</span>
                            <span style={{ marginLeft: '6px', fontWeight: 600, color: '#1e40af' }}>{row.phase}</span>
                            <span style={{ marginLeft: '6px', color: '#94a3b8' }}>• {row.orderDate}</span>
                          </div>
                        </td>
                        <td>
                          <strong>{row.itemName}</strong>
                          <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                            {row.itemType.toUpperCase()} • <span style={{ textTransform: 'capitalize' }}>{row.status}</span> • No: {row.orderId}
                          </div>
                        </td>
                        <td style={{ textAlign: 'center', fontWeight: 'bold' }}>
                          {row.quantity.toLocaleString('id-ID')}
                        </td>
                        <td style={{ textAlign: 'right', color: '#475569', fontSize: '0.9rem' }}>
                          {formatRupiah(row.totalKopkar)}
                        </td>
                        <td style={{ textAlign: 'right', color: '#b45309', fontSize: '0.9rem' }}>
                          {formatRupiah(row.totalFee)}
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 600, color: '#0f766e' }}>
                          {formatRupiah(row.totalStudent)}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '36px', color: '#64748b' }}>
                      Tidak ada data pesanan yang cocok dengan kriteria filter saat ini.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            {/* NAVIGASI PAGINASI TABEL */}
            {totalPages > 1 && (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px 18px',
                  background: '#f8fafc',
                  borderTop: '1px solid #e2e8f0',
                }}
              >
                <div style={{ fontSize: '0.85rem', color: '#64748b' }}>
                  Menampilkan {(currentPage - 1) * itemsPerPage + 1} -{' '}
                  {Math.min(currentPage * itemsPerPage, recapData.length)} dari {recapData.length} baris
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    style={{
                      padding: '6px 14px',
                      borderRadius: '6px',
                      border: '1px solid #cbd5e1',
                      background: currentPage === 1 ? '#f1f5f9' : '#ffffff',
                      color: currentPage === 1 ? '#94a3b8' : '#334155',
                      cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                      fontSize: '0.85rem',
                      fontWeight: 600,
                    }}
                  >
                    ◀ Sebelumnya
                  </button>
                  <span style={{ display: 'flex', alignItems: 'center', fontSize: '0.85rem', color: '#475569', padding: '0 8px' }}>
                    {currentPage} / {totalPages}
                  </span>
                  <button
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    style={{
                      padding: '6px 14px',
                      borderRadius: '6px',
                      border: '1px solid #cbd5e1',
                      background: currentPage === totalPages ? '#f1f5f9' : '#ffffff',
                      color: currentPage === totalPages ? '#94a3b8' : '#334155',
                      cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                      fontSize: '0.85rem',
                      fontWeight: 600,
                    }}
                  >
                    Selanjutnya ▶
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default KopkarRekap;
