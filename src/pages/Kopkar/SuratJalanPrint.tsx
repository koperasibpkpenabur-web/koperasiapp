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
        margin: 0; /* Hindari header/footer */
      }
      body {
        margin: 0;
        -webkit-print-color-adjust: exact;
        padding-top: 5mm;
        padding-left: 5mm;
      }
      .print-surat-jalan {
        font-family: Arial, Helvetica, sans-serif !important;
        color: #000 !important;
        font-size: 11px !important;
      }
      .print-surat-jalan table {
        width: 100%;
        table-layout: fixed;
        border-collapse: collapse;
      }
      .print-surat-jalan table th, .print-surat-jalan table td {
        border: 1px solid #000 !important;
        font-size: 11px !important;
        padding: 2px 4px !important; 
        word-wrap: break-word;
        overflow-wrap: break-word;
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
    <div className="print-only print-surat-jalan" style={{ margin: '0', padding: '0', width: '100%' }}>
      <style>{pageStyle}</style>
      
      {pages.map((pageItems, pageIndex) => (
        <div 
          key={pageIndex} 
          className={pageIndex < pages.length - 1 ? 'page-break' : ''} 
          style={{ 
            width: '190mm', // Aman dari margin dan lubang kertas (maksimal kertas 215mm)
            height: '130mm', // Maksimal setengah kertas (A5) 139mm
            overflow: 'hidden', // Potong paksa jika ada lebih agar tidak lari ke halaman ke-2
            boxSizing: 'border-box' 
          }}
        >
          {/* Header / Kop Surat */}
          <div className="print-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
            <div>
              <h2 style={{ margin: '0 0 4px 0', fontSize: '12px', fontWeight: 'bold' }}>
                KOPERASI KONSUMEN KARYAWAN BPK PENABUR JAKARTA
              </h2>
              <div style={{ fontSize: '11px', lineHeight: '1.2' }}>
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

          <div style={{ textAlign: 'center', marginBottom: '6px' }}>
            <h3 style={{ margin: '0', fontSize: '13px', textDecoration: 'underline' }}>Surat Jalan</h3>
            <div style={{ fontSize: '11px', marginTop: '2px' }}>No. Pesanan: {order.id}</div>
          </div>

          {/* Tabel Barang (Tanpa Harga) */}
          <div style={{ marginBottom: '6px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
              <thead>
                <tr>
                  <th style={{ border: '1px solid #000', padding: '2px', width: '5%' }}>No</th>
                  <th style={{ border: '1px solid #000', padding: '2px', textAlign: 'left' }}>Nama Barang</th>
                  <th style={{ border: '1px solid #000', padding: '2px', width: '15%', textAlign: 'center' }}>Size</th>
                  <th style={{ border: '1px solid #000', padding: '2px', width: '10%', textAlign: 'center' }}>Qty</th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((item, idx) => {
                  const absoluteIndex = pageIndex * itemsPerPage + idx + 1;
                  return (
                    <tr key={idx}>
                      <td style={{ border: '1px solid #000', padding: '2px', textAlign: 'center' }}>{absoluteIndex}</td>
                      <td style={{ border: '1px solid #000', padding: '2px' }}>
                        [{item.type}] {item.name}
                      </td>
                      <td style={{ border: '1px solid #000', padding: '2px', textAlign: 'center' }}>{item.size || '-'}</td>
                      <td style={{ border: '1px solid #000', padding: '2px', textAlign: 'center' }}>{item.quantity}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Catatan */}
          <div style={{ fontSize: '11px', marginBottom: '8px' }}>
            <strong>Catatan:</strong>
            <ol style={{ margin: '2px 0 0 0', paddingLeft: '16px', lineHeight: '1.2' }}>
              <li>Mohon lembar 1(Putih) dikembalikan ke Koperasi</li>
              <li>Barang yang telah diterima tolong dicek kembali.</li>
              <li>Pembayaran langsung di Koperasi</li>
              <li>Rek BCA 0760256757 a/n Koperasi Konsumen Karyawan BPK Penabur</li>
            </ol>
          </div>

          {/* Tanda Tangan */}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
            <div style={{ textAlign: 'center', width: '140px' }}>
              <div>Diterima oleh,</div>
              <div style={{ marginTop: '30px', borderBottom: '1px solid #000' }}></div>
            </div>
            <div style={{ textAlign: 'center', width: '140px' }}>
              <div>Pengirim,</div>
              <div style={{ marginTop: '30px', borderBottom: '1px solid #000' }}></div>
              <div style={{ marginTop: '2px' }}>Sri Mulyani</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default SuratJalanPrint;
