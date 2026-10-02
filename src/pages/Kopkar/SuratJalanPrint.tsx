import React from 'react';
import type { Order } from '../../types';

interface Props {
  order: Order | null;
}

const SuratJalanPrint: React.FC<Props> = ({ order }) => {
  if (!order) return null;

  const today = new Date().toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  // Menggunakan ukuran spesifik untuk Continuous Form 9.5 x 5.5 inch (Half Letter)
  // Lebar area cetak (tanpa lubang perforasi) adalah 8.5 inch (215.9mm).
  // Tinggi kertas adalah 5.5 inch (139.7mm).
  const pageStyle = `
    @media print {
      @page {
        size: 215.9mm 139.7mm;
        margin: 0mm;
      }
      body {
        margin: 0;
        -webkit-print-color-adjust: exact;
      }
      .print-surat-jalan {
        font-family: Arial, Helvetica, sans-serif !important;
        color: #000 !important;
        font-size: 11px !important;
      }
      .print-surat-jalan table th, .print-surat-jalan table td {
        border: 1px solid #000 !important;
        font-size: 11px !important;
      }
      .page-break {
        page-break-after: always;
      }
    }
  `;

  // Chunking 5 items per physical page
  const itemsPerPage = 5;
  const pages = [];
  for (let i = 0; i < Math.max(1, order.items.length); i += itemsPerPage) {
    pages.push(order.items.slice(i, i + itemsPerPage));
  }

  return (
    <div className="print-only print-surat-jalan" style={{ fontSize: '11px' }}>
      <style>{pageStyle}</style>
      
      {pages.map((pageItems, pageIndex) => (
        <div 
          key={pageIndex} 
          className={pageIndex < pages.length - 1 ? 'page-break' : ''} 
          style={{ 
            padding: '5mm 5mm 5mm 2mm', // Tighter left margin
            boxSizing: 'border-box' 
          }}
        >
          {/* Header / Kop Surat */}
          <div className="print-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
            <div>
              <h2 style={{ margin: '0 0 6px 0', fontSize: '13px', fontWeight: 'bold' }}>
                KOPERASI KONSUMEN KARYAWAN BPK PENABUR JAKARTA
              </h2>
              <div style={{ fontSize: '11px', lineHeight: '1.3' }}>
                Kepada Yth,<br />
                Bapak/Ibu <strong>{order.schoolName}</strong><br />
                di Tempat
              </div>
            </div>
            <div style={{ fontSize: '11px', textAlign: 'right' }}>
              <div>Tanggal: {today}</div>
              {pages.length > 1 && (
                <div style={{ marginTop: '2px', fontWeight: 'bold' }}>
                  Hal. {pageIndex + 1} dari {pages.length}
                </div>
              )}
            </div>
          </div>

          <div style={{ textAlign: 'center', marginBottom: '8px' }}>
            <h3 style={{ margin: '0', fontSize: '14px', textDecoration: 'underline' }}>Surat Jalan</h3>
            <div style={{ fontSize: '11px', marginTop: '2px' }}>No. Pesanan: {order.id}</div>
          </div>

          {/* Tabel Barang (Tanpa Harga) */}
          <div style={{ marginBottom: '8px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
              <thead>
                <tr>
                  <th style={{ border: '1px solid #000', padding: '4px', width: '8%' }}>No</th>
                  <th style={{ border: '1px solid #000', padding: '4px', textAlign: 'left' }}>Nama Barang</th>
                  <th style={{ border: '1px solid #000', padding: '4px', width: '15%' }}>Qty</th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((item, idx) => {
                  const absoluteIndex = pageIndex * itemsPerPage + idx + 1;
                  return (
                    <tr key={idx}>
                      <td style={{ border: '1px solid #000', padding: '4px', textAlign: 'center' }}>{absoluteIndex}</td>
                      <td style={{ border: '1px solid #000', padding: '4px' }}>
                        [{item.type}] {item.name}
                      </td>
                      <td style={{ border: '1px solid #000', padding: '4px', textAlign: 'center' }}>{item.quantity}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Catatan */}
          <div style={{ fontSize: '11px', marginBottom: '10px' }}>
            <strong>Catatan:</strong>
            <ol style={{ margin: '2px 0 0 0', paddingLeft: '16px', lineHeight: '1.3' }}>
              <li>Mohon lembar 1(Putih) dikembalikan ke Koperasi</li>
              <li>Barang yang telah diterima tolong dicek kembali.</li>
              <li>Pembayaran langsung di Koperasi</li>
              <li>Rek BCA 0760256757 a/n Koperasi Konsumen Karyawan BPK Penabur</li>
            </ol>
          </div>

          {/* Tanda Tangan */}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
            <div style={{ textAlign: 'center', width: '150px' }}>
              <div>Diterima oleh,</div>
              <div style={{ marginTop: '40px', borderBottom: '1px solid #000' }}></div>
            </div>
            <div style={{ textAlign: 'center', width: '150px' }}>
              <div>Pengirim,</div>
              <div style={{ marginTop: '40px', borderBottom: '1px solid #000' }}></div>
              <div style={{ marginTop: '2px' }}>Sri Mulyani</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default SuratJalanPrint;
