import { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { useOrders } from '../../context/OrderContext';
import './kopkar.css';

const KopkarRekap = () => {
  const { orders } = useOrders();

  const [statusFilter, setStatusFilter] = useState<string>('all_active');
  const [phaseFilter, setPhaseFilter] = useState<string>('all');

  const recapData = useMemo(() => {
    const filteredOrders = orders.filter((o) => {
      if (statusFilter === 'all_active') {
        if (o.status === 'cancelled' || o.status === 'rejected') return false;
      } else if (statusFilter === 'pending') {
        if (o.status !== 'pending') return false;
      } else if (statusFilter === 'approved') {
        if (o.status !== 'approved') return false;
      } else if (statusFilter === 'shipped') {
        if (o.status !== 'shipped') return false;
      } else if (statusFilter === 'received') {
        if (o.status !== 'received') return false;
      }

      if (phaseFilter !== 'all' && o.orderPhase !== phaseFilter) {
        return false;
      }

      return true;
    });

    interface RecapRow {
      schoolName: string;
      level: string;
      phase: string;
      itemName: string;
      itemType: string;
      quantity: number;
      priceStudent: number;
      totalStudent: number;
      status: string;
    }

    const rows: RecapRow[] = [];
    filteredOrders.forEach((o) => {
      o.items.forEach((it) => {
        if (it.quantity > 0) {
          rows.push({
            schoolName: o.schoolName,
            level: o.schoolLevel || '-',
            phase: o.orderPhase || '-',
            itemName: it.name,
            itemType: it.type,
            quantity: it.quantity,
            priceStudent: it.priceStudent,
            totalStudent: it.quantity * it.priceStudent,
            status: o.status,
          });
        }
      });
    });

    rows.sort((a, b) => {
      if (a.schoolName !== b.schoolName) return a.schoolName.localeCompare(b.schoolName);
      if (a.phase !== b.phase) return a.phase.localeCompare(b.phase);
      return a.itemName.localeCompare(b.itemName);
    });

    return rows;
  }, [orders, statusFilter, phaseFilter]);

  const totalQuantity = recapData.reduce((acc, row) => acc + row.quantity, 0);
  const totalRupiah = recapData.reduce((acc, row) => acc + row.totalStudent, 0);

  const formatRupiah = (num: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0,
    }).format(num);
  };

  const handleDownloadExcel = () => {
    if (recapData.length === 0) {
      alert('Tidak ada data untuk didownload');
      return;
    }

    const exportData = recapData.map((row, index) => ({
      'No': index + 1,
      'Nama Sekolah': row.schoolName,
      'Jenjang': row.level,
      'Fase Pesanan': row.phase,
      'Nama Barang': row.itemName,
      'Kategori': row.itemType,
      'Status Pesanan': row.status.toUpperCase(),
      'Kuantitas (pcs)': row.quantity,
      'Harga Satuan (Siswa)': row.priceStudent,
      'Total Harga (Siswa)': row.totalStudent,
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    
    const wscols = [
      { wch: 5 },
      { wch: 30 },
      { wch: 10 },
      { wch: 15 },
      { wch: 35 },
      { wch: 15 },
      { wch: 15 },
      { wch: 15 },
      { wch: 20 },
      { wch: 20 },
    ];
    worksheet['!cols'] = wscols;

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Rekap_Pesanan');
    XLSX.writeFile(workbook, `Rekap_Pesanan_Koperasi_${new Date().getTime()}.xlsx`);
  };

  return (
    <div className="kopkar-dashboard">
      <h2>📊 Rekapitulasi Pesanan Sekolah</h2>
      <p style={{ color: '#64748b', marginBottom: '24px' }}>
        Lihat dan unduh ringkasan seluruh pesanan berdasarkan sekolah dan fase pesanan.
      </p>

      <div className="kopkar-toolbar">
        <div className="kopkar-filters">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all_active">Semua Aktif (Berjalan & Selesai)</option>
            <option value="pending">Hanya Menunggu Persetujuan</option>
            <option value="approved">Hanya Disetujui (Siap Kirim)</option>
            <option value="shipped">Hanya Sedang Dikirim</option>
            <option value="received">Hanya Selesai (Diterima)</option>
          </select>

          <select value={phaseFilter} onChange={(e) => setPhaseFilter(e.target.value)}>
            <option value="all">Semua Fase</option>
            <option value="Tahap 1">Hanya Tahap 1</option>
            <option value="Tahap 2">Hanya Tahap 2</option>
            <option value="Tambahan">Hanya Tambahan</option>
          </select>
        </div>
        
        <button 
          onClick={handleDownloadExcel} 
          style={{
            background: '#059669', 
            color: 'white', 
            border: 'none', 
            padding: '10px 20px', 
            borderRadius: '8px',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            boxShadow: '0 4px 6px rgba(5, 150, 105, 0.2)'
          }}
        >
          <span>📥</span> Download Excel (.xlsx)
        </button>
      </div>

      <div className="kopkar-stats" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', marginBottom: '24px' }}>
        <div className="kopkar-stat-card">
          <div className="stat-icon">📦</div>
          <div className="stat-label">Total Kuantitas Barang</div>
          <div className="stat-value">{totalQuantity} pcs</div>
        </div>
        <div className="kopkar-stat-card">
          <div className="stat-icon">💰</div>
          <div className="stat-label">Total Nilai Pesanan (Siswa)</div>
          <div className="stat-value">{formatRupiah(totalRupiah)}</div>
        </div>
      </div>

      <div className="kopkar-table-container">
        <table className="kopkar-table">
          <thead>
            <tr>
              <th>Sekolah & Fase</th>
              <th>Nama Barang</th>
              <th style={{ textAlign: 'center' }}>Kuantitas</th>
              <th style={{ textAlign: 'right' }}>Total (Rp)</th>
            </tr>
          </thead>
          <tbody>
            {recapData.length > 0 ? (
              recapData.map((row, idx) => (
                <tr key={idx}>
                  <td>
                    <strong>{row.schoolName}</strong>
                    <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '4px' }}>
                      <span className={`badge-level ${row.level}`}>{row.level}</span>
                      <span style={{ marginLeft: '8px', fontWeight: 600, color: '#1e40af' }}>{row.phase}</span>
                    </div>
                  </td>
                  <td>
                    {row.itemName}
                    <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                      {row.itemType} • {row.status}
                    </div>
                  </td>
                  <td style={{ textAlign: 'center', fontWeight: 'bold' }}>
                    {row.quantity}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    {formatRupiah(row.totalStudent)}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={4} style={{ textAlign: 'center', padding: '32px', color: '#64748b' }}>
                  Tidak ada data pesanan yang cocok dengan filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default KopkarRekap;
