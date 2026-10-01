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

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);
  const [totalCount, setTotalCount] = useState(0);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      if (!user?.id) return;
      
      let query = supabase
        .from('orders')
        .select('*, order_items(*)', { count: 'exact' })
        .eq('school_user_id', user.id);
        
      if (statusFilter === 'all_active') {
        query = query.in('status', ['pending', 'approved', 'shipped', 'received']);
      } else {
        query = query.eq('status', statusFilter);
      }
      
      if (phaseFilter !== 'all') {
        query = query.eq('order_phase', phaseFilter);
      }
      
      // Pagination range
      const from = (currentPage - 1) * itemsPerPage;
      const to = from + itemsPerPage - 1;
      query = query.order('created_at', { ascending: false }).range(from, to);

      const { data, count, error } = await query;
        
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
        if (count !== null) setTotalCount(count);
      }
      setLoading(false);
    };
    fetchData();
  }, [user?.id, statusFilter, phaseFilter, currentPage]);

  const recapData = useMemo(() => {
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
    orders.forEach((o: any) => {
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
  }, [orders]);

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

  const fetchAllForExport = async () => {
    if (!user?.id) return [];
    
    let query = supabase
      .from('orders')
      .select('*, order_items(*)')
      .eq('school_user_id', user.id);
      
    if (statusFilter === 'all_active') {
      query = query.in('status', ['pending', 'approved', 'shipped', 'received']);
    } else {
      query = query.eq('status', statusFilter);
    }
    
    if (phaseFilter !== 'all') {
      query = query.eq('order_phase', phaseFilter);
    }
    
    const { data, error } = await query;
    if (error || !data) return [];
    
    const rows: any[] = [];
    data.forEach((o: any) => {
      (o.order_items || []).forEach((it: any) => {
        if (it.quantity > 0) {
          rows.push({
            phase: o.order_phase || '-',
            itemName: it.name,
            itemType: it.type,
            quantity: it.quantity,
            priceStudent: Number(it.price_student) || 0,
            priceKopkar: Number(it.price_kopkar) || 0,
            feeSchool: Number(it.fee_school) || 0,
            totalStudent: it.quantity * (Number(it.price_student) || 0),
            totalKopkar: it.quantity * (Number(it.price_kopkar) || 0),
            totalFee: it.quantity * (Number(it.fee_school) || 0),
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
  };

  const handleDownloadExcel = async () => {
    const allData = await fetchAllForExport();
    if (allData.length === 0) {
      alert('Tidak ada data untuk didownload');
      return;
    }

    const exportData = allData.map((row, index) => ({
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
      { wch: 5 }, { wch: 20 }, { wch: 35 }, { wch: 15 }, { wch: 15 },
      { wch: 15 }, { wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 20 },
      { wch: 20 }, { wch: 20 },
    ];
    worksheet['!cols'] = wscols;

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Rekap_Pesanan_Sekolah');
    XLSX.writeFile(workbook, `Rekap_Pesanan_${user?.name}_${new Date().getTime()}.xlsx`);
  };

  const handleDownloadPDF = async () => {
    const allData = await fetchAllForExport();
    if (allData.length === 0) {
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
    
    let sumQty = 0;
    let sumKopkar = 0;
    let sumFee = 0;
    let sumStudent = 0;

    allData.forEach((row, index) => {
      sumQty += row.quantity;
      sumKopkar += row.totalKopkar;
      sumFee += row.totalFee;
      sumStudent += row.totalStudent;
      
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
      sumQty,
      '', formatRupiah(sumKopkar),
      '', formatRupiah(sumFee),
      '', formatRupiah(sumStudent)
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

  const handleFilterChange = (setter: any, val: any) => {
    setter(val);
    setCurrentPage(1);
  };

  return (
    <div className="kopkar-dashboard">
      <h2>📊 Rekapitulasi Pesanan</h2>
      <p style={{ color: '#64748b', marginBottom: '24px' }}>
        Lihat dan unduh ringkasan seluruh pesanan sekolah Anda beserta rincian harganya.
      </p>

      <div className="kopkar-toolbar">
        <div className="kopkar-filters">
          <select value={statusFilter} onChange={(e) => handleFilterChange(setStatusFilter, e.target.value)}>
            <option value="all_active">Semua Aktif (Berjalan & Selesai)</option>
            <option value="pending">Hanya Menunggu Persetujuan</option>
            <option value="approved">Hanya Disetujui (Siap Kirim)</option>
            <option value="shipped">Hanya Sedang Dikirim</option>
            <option value="received">Hanya Selesai (Diterima)</option>
          </select>

          <select value={phaseFilter} onChange={(e) => handleFilterChange(setPhaseFilter, e.target.value)}>
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
              background: '#059669', color: 'white', border: 'none', padding: '10px 16px', borderRadius: '8px',
              fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px',
              boxShadow: '0 4px 6px rgba(5, 150, 105, 0.2)'
            }}
          >
            <span>📗</span> Export Semua ke Excel
          </button>
          
          <button 
            onClick={handleDownloadPDF} 
            style={{
              background: '#dc2626', color: 'white', border: 'none', padding: '10px 16px', borderRadius: '8px',
              fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px',
              boxShadow: '0 4px 6px rgba(220, 38, 38, 0.2)'
            }}
          >
            <span>📕</span> Export Semua ke PDF
          </button>
        </div>
      </div>

      {loading ? <p style={{ padding: '20px', textAlign: 'center' }}>Memuat rekap data...</p> : (
      <>
      <div className="kopkar-stats" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', marginBottom: '24px' }}>
        <div className="kopkar-stat-card">
          <div className="stat-icon">📦</div>
          <div className="stat-label">Kuantitas (Halaman Ini)</div>
          <div className="stat-value">{totalQuantity} pcs</div>
        </div>
        <div className="kopkar-stat-card">
          <div className="stat-icon">💳</div>
          <div className="stat-label">Belanja Kopkar (Halaman Ini)</div>
          <div className="stat-value">{formatRupiah(totalRupiahKopkar)}</div>
        </div>
        <div className="kopkar-stat-card">
          <div className="stat-icon">🎁</div>
          <div className="stat-label">Fee Sekolah (Halaman Ini)</div>
          <div className="stat-value" style={{ color: '#059669' }}>{formatRupiah(totalRupiahFee)}</div>
        </div>
        <div className="kopkar-stat-card">
          <div className="stat-icon">💰</div>
          <div className="stat-label">Tagihan Siswa (Halaman Ini)</div>
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
      </>
      )}
    </div>
  );
};

export default SchoolRekap;
