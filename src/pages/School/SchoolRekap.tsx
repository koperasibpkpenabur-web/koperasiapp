import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';


const SchoolRekap = () => {
  const { user } = useAuth();
  
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filters
  const [statusFilter, setStatusFilter] = useState('all_active');
  const [phaseFilter, setPhaseFilter] = useState('all');

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      if (!user?.id) return;
      const { data, error } = await supabase
        .from('orders')
        .select('*, order_items(*)')
        .eq('school_user_id', user.id);
        
      if (!error && data) {
        setOrders(data.map((row: any) => ({
          id: row.id,
          orderPhase: row.order_phase,
          status: row.status,
          items: (row.order_items || []).map((it: any) => ({
            name: it.name,
            type: it.type,
            quantity: it.quantity,
            priceStudent: Number(it.price_student) || 0,
            priceKopkar: Number(it.price_kopkar) || 0,
            feeSchool: Number(it.fee_school) || 0,
          }))
        })));
      }
      setLoading(false);
    };
    fetchData();
  }, [user?.id]);

  const recapData = useMemo(() => {
    const filteredOrders = orders.filter((o: any) => {
      if (statusFilter === 'all_active') {
        if (o.status === 'cancelled' || o.status === 'rejected' || o.status === 'cancellation_requested') return false;
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
      phase: string;
      itemName: string;
      itemType: string;
      quantity: number;
      priceStudent: number;
      priceKopkar: number;
      feeSchool: number;
      totalStudent: number;
      totalKopkar: number;
      totalFee: number;
      status: string;
    }

    const rows: RecapRow[] = [];
    filteredOrders.forEach((o: any) => {
      o.items.forEach((it: any) => {
        if (it.quantity > 0) {
          rows.push({
            phase: o.orderPhase || '-',
            itemName: it.name,
            itemType: it.type,
            quantity: it.quantity,
            priceStudent: it.priceStudent,
            priceKopkar: it.priceKopkar,
            feeSchool: it.feeSchool,
            totalStudent: it.quantity * it.priceStudent,
            totalKopkar: it.quantity * it.priceKopkar,
            totalFee: it.quantity * it.feeSchool,
            status: o.status,
          });
        }
      });
    });

    rows.sort((a, b) => {
      if (a.phase !== b.phase) return a.phase.localeCompare(b.phase);
      return a.itemName.localeCompare(b.itemName);
    });

    return rows;
  }, [orders, statusFilter, phaseFilter]);

  const totalQuantity = recapData.reduce((acc, row) => acc + row.quantity, 0);
  const totalRupiahStudent = recapData.reduce((acc, row) => acc + row.totalStudent, 0);
  const totalRupiahKopkar = recapData.reduce((acc, row) => acc + row.totalKopkar, 0);
  const totalRupiahFee = recapData.reduce((acc, row) => acc + row.totalFee, 0);

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
      'Fase Pesanan': row.phase,
      'Nama Barang': row.itemName,
      'Kategori': row.itemType,
      'Status Pesanan': row.status.toUpperCase(),
      'Kuantitas (pcs)': row.quantity,
      'Harga Modal (Kopkar)': row.priceKopkar,
      'Total Modal (Kopkar)': row.totalKopkar,
      'Fee Sekolah': row.feeSchool,
      'Total Fee Sekolah': row.totalFee,
      'Harga Jual (Siswa)': row.priceStudent,
      'Total Penjualan (Siswa)': row.totalStudent,
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    
    const wscols = [
      { wch: 5 },
      { wch: 20 },
      { wch: 35 },
      { wch: 15 },
      { wch: 15 },
      { wch: 15 },
      { wch: 20 },
      { wch: 20 },
      { wch: 20 },
      { wch: 20 },
      { wch: 20 },
      { wch: 20 },
    ];
    worksheet['!cols'] = wscols;

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Rekap_Pesanan_Sekolah');
    XLSX.writeFile(workbook, `Rekap_Pesanan_${user?.name}_${new Date().getTime()}.xlsx`);
  };

  const handleDownloadPDF = () => {
    if (recapData.length === 0) {
      alert('Tidak ada data untuk didownload');
      return;
    }

    const doc = new jsPDF('landscape');
    
    doc.setFontSize(16);
    doc.text(`Rekapitulasi Pesanan - ${user?.name}`, 14, 15);
    doc.setFontSize(10);
    doc.text(`Dicetak pada: ${new Date().toLocaleString('id-ID')}`, 14, 22);
    doc.text(`Filter Status: ${statusFilter} | Filter Fase: ${phaseFilter}`, 14, 28);

    const tableColumn = ["No", "Fase", "Barang", "Status", "Qty", "H.Kopkar", "T.Kopkar", "Fee", "T.Fee", "H.Siswa", "T.Siswa"];
    const tableRows: any[] = [];

    recapData.forEach((row, index) => {
      const dataRow = [
        index + 1,
        row.phase,
        row.itemName,
        row.status,
        row.quantity,
        formatRupiah(row.priceKopkar),
        formatRupiah(row.totalKopkar),
        formatRupiah(row.feeSchool),
        formatRupiah(row.totalFee),
        formatRupiah(row.priceStudent),
        formatRupiah(row.totalStudent)
      ];
      tableRows.push(dataRow);
    });

    // Add footer row
    tableRows.push([
      '', '', 'TOTAL', '',
      totalQuantity,
      '', formatRupiah(totalRupiahKopkar),
      '', formatRupiah(totalRupiahFee),
      '', formatRupiah(totalRupiahStudent)
    ]);

    (doc as any).autoTable({
      head: [tableColumn],
      body: tableRows,
      startY: 35,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [30, 64, 175] },
      didParseCell: function(data: any) {
        if (data.row.index === tableRows.length - 1) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = [241, 245, 249];
        }
      }
    });

    doc.save(`Rekap_Pesanan_${user?.name}_${new Date().getTime()}.pdf`);
  };

  return (
    <div className="kopkar-dashboard">
      <h2>📊 Rekapitulasi Pesanan</h2>
      <p style={{ color: '#64748b', marginBottom: '24px' }}>
        Lihat dan unduh ringkasan seluruh pesanan sekolah Anda beserta rincian harganya.
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
            <option value="Tahap 1">Tahap 1</option>
            <option value="Tambahan Tahap 1">Tambahan Tahap 1</option>
            <option value="Tahap 2">Tahap 2</option>
            <option value="Tambahan Tahap 2">Tambahan Tahap 2</option>
            <option value="Tambahan Mingguan">Tambahan Mingguan</option>
          </select>
        </div>
        
        <div style={{ display: 'flex', gap: '12px' }}>
          <button 
            onClick={handleDownloadExcel} 
            style={{
              background: '#059669', 
              color: 'white', 
              border: 'none', 
              padding: '10px 16px', 
              borderRadius: '8px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: '0 4px 6px rgba(5, 150, 105, 0.2)'
            }}
          >
            <span>📗</span> Excel
          </button>
          
          <button 
            onClick={handleDownloadPDF} 
            style={{
              background: '#dc2626', 
              color: 'white', 
              border: 'none', 
              padding: '10px 16px', 
              borderRadius: '8px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: '0 4px 6px rgba(220, 38, 38, 0.2)'
            }}
          >
            <span>📕</span> PDF
          </button>
        </div>
      </div>

      {loading ? <p style={{ padding: '20px', textAlign: 'center' }}>Memuat rekap data...</p> : (
      <>
      <div className="kopkar-stats" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', marginBottom: '24px' }}>
        <div className="kopkar-stat-card">
          <div className="stat-icon">📦</div>
          <div className="stat-label">Total Kuantitas</div>
          <div className="stat-value">{totalQuantity} pcs</div>
        </div>
        <div className="kopkar-stat-card">
          <div className="stat-icon">💳</div>
          <div className="stat-label">Total Belanja (Harga Koperasi)</div>
          <div className="stat-value">{formatRupiah(totalRupiahKopkar)}</div>
        </div>
        <div className="kopkar-stat-card">
          <div className="stat-icon">🎁</div>
          <div className="stat-label">Total Potensi Fee Sekolah</div>
          <div className="stat-value" style={{ color: '#059669' }}>{formatRupiah(totalRupiahFee)}</div>
        </div>
        <div className="kopkar-stat-card">
          <div className="stat-icon">💰</div>
          <div className="stat-label">Total Tagihan (Ke Siswa)</div>
          <div className="stat-value">{formatRupiah(totalRupiahStudent)}</div>
        </div>
      </div>

      <div className="kopkar-table-container">
        <table className="kopkar-table">
          <thead>
            <tr>
              <th>Fase</th>
              <th>Nama Barang</th>
              <th style={{ textAlign: 'center' }}>Kuantitas</th>
              <th style={{ textAlign: 'right' }}>Total Tagihan (Siswa)</th>
            </tr>
          </thead>
          <tbody>
            {recapData.length > 0 ? (
              recapData.map((row, idx) => (
                <tr key={idx}>
                  <td>
                    <strong>{row.phase}</strong>
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
                    <div style={{ fontWeight: 600 }}>{formatRupiah(row.totalStudent)}</div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                      Kopkar: {formatRupiah(row.totalKopkar)} | Fee: {formatRupiah(row.totalFee)}
                    </div>
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
      </>
      )}
    </div>
  );
};

export default SchoolRekap;
