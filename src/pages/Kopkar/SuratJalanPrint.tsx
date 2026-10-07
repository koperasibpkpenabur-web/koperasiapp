import React from 'react';
import type { Order } from '../../types';

const formatRupiah = (angka: number) => {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(angka);
};

const terbilang = (angka: number): string => {
  const huruf = ["", "Satu", "Dua", "Tiga", "Empat", "Lima", "Enam", "Tujuh", "Delapan", "Sembilan", "Sepuluh", "Sebelas"];
  let hasil = "";
  if (angka < 12) {
    hasil = huruf[angka];
  } else if (angka < 20) {
    hasil = terbilang(angka - 10) + " Belas";
  } else if (angka < 100) {
    hasil = terbilang(Math.floor(angka / 10)) + " Puluh " + terbilang(angka % 10);
  } else if (angka < 200) {
    hasil = "Seratus " + terbilang(angka - 100);
  } else if (angka < 1000) {
    hasil = terbilang(Math.floor(angka / 100)) + " Ratus " + terbilang(angka % 100);
  } else if (angka < 2000) {
    hasil = "Seribu " + terbilang(angka - 1000);
  } else if (angka < 1000000) {
    hasil = terbilang(Math.floor(angka / 1000)) + " Ribu " + terbilang(angka % 1000);
  } else if (angka < 1000000000) {
    hasil = terbilang(Math.floor(angka / 1000000)) + " Juta " + terbilang(angka % 1000000);
  } else if (angka < 1000000000000) {
    hasil = terbilang(Math.floor(angka / 1000000000)) + " Milyar " + terbilang(angka % 1000000000);
  }
  return hasil.trim();
};

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
        font-family: 'Courier New', Courier, monospace !important;
        -webkit-font-smoothing: none;
        color: #000 !important;
        font-size: 13px !important;
      }
      .print-surat-jalan h1,
      .print-surat-jalan h2,
      .print-surat-jalan h3,
      .print-surat-jalan h4,
      .print-surat-jalan h5,
      .print-surat-jalan h6 {
        font-family: inherit !important;
      }
      .print-surat-jalan table {
        width: 100%;
        border-collapse: collapse;
      }
      .print-surat-jalan table th, .print-surat-jalan table td {
        border: 1px solid #000 !important;
        font-size: 13px !important;
        padding: 2px 4px !important; 
        word-wrap: break-word;
        overflow-wrap: break-word;
      }
      .print-surat-jalan table tr {
        page-break-inside: avoid; /* Jangan memotong baris setengah di lipatan kertas */
      }
    }
  `;

  return (
    <div className="print-only print-surat-jalan" style={{ margin: '0', padding: '0', width: '190mm', boxSizing: 'border-box' }}>
      <style>{pageStyle}</style>
      
      {/* Header / Kop Surat (Hanya muncul sekali di paling atas) */}
      <div className="print-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
        <div>
          <h2 style={{ margin: '0 0 4px 0', fontSize: '14px', fontWeight: 'bold' }}>
            KOPERASI KONSUMEN KARYAWAN BPK PENABUR JAKARTA
          </h2>
          <div style={{ fontSize: '13px', lineHeight: '1.2' }}>
            Kepada Yth,<br />
            Bapak/Ibu <strong>{order.schoolName}</strong><br />
            di Tempat
          </div>
        </div>
        <div style={{ fontSize: '13px', textAlign: 'right' }}>
          <div>Tanggal: {today}</div>
        </div>
      </div>

      <div style={{ textAlign: 'center', marginBottom: '6px' }}>
        <h3 style={{ margin: '0', fontSize: '14px', textDecoration: 'underline', fontWeight: 'bold' }}>Surat Jalan</h3>
        <div style={{ fontSize: '13px', marginTop: '2px' }}>No. Pesanan: {order.id}</div>
      </div>

      {/* Tabel Barang (Bisa mengalir otomatis ke halaman 2, 3, dst.) */}
      <div style={{ marginBottom: '4px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr>
              <th style={{ border: '1px solid #000', padding: '2px', width: '5%' }}>No</th>
              <th style={{ border: '1px solid #000', padding: '2px', textAlign: 'left' }}>Nama Barang</th>
              <th style={{ border: '1px solid #000', padding: '2px', width: '10%', textAlign: 'center' }}>Size</th>
              <th style={{ border: '1px solid #000', padding: '2px', width: '5%', textAlign: 'center' }}>Qty</th>
              <th style={{ border: '1px solid #000', padding: '2px', width: '15%', textAlign: 'right' }}>Harga</th>
              <th style={{ border: '1px solid #000', padding: '2px', width: '18%', textAlign: 'right' }}>Jumlah</th>
            </tr>
          </thead>
          <tbody>
            {(() => {
              let totalCetak = 0;
              let rowNum = 1;
              const rows = order.items.map((item, idx) => {
                const shippedIt = order.shippingInfo?.shippedItems?.find(si => si.name === item.name && si.type === item.type);
                const renderQty = shippedIt !== undefined ? shippedIt.shippedQty : item.quantity;
                
                if (renderQty <= 0) return null;
                
                const harga = item.priceStudent || 0;
                const jumlah = harga * renderQty;
                totalCetak += jumlah;

                return (
                  <tr key={idx}>
                    <td style={{ border: '1px solid #000', padding: '2px', textAlign: 'center' }}>{rowNum++}</td>
                    <td style={{ border: '1px solid #000', padding: '2px' }}>
                      [{item.type}] {item.name}
                    </td>
                    <td style={{ border: '1px solid #000', padding: '2px', textAlign: 'center' }}>{item.size || '-'}</td>
                    <td style={{ border: '1px solid #000', padding: '2px', textAlign: 'center' }}>{renderQty}</td>
                    <td style={{ border: '1px solid #000', padding: '2px', textAlign: 'right' }}>{formatRupiah(harga)}</td>
                    <td style={{ border: '1px solid #000', padding: '2px', textAlign: 'right' }}>{formatRupiah(jumlah)}</td>
                  </tr>
                );
              });
              
              return (
                <>
                  {rows}
                  <tr>
                    <td colSpan={5} style={{ border: '1px solid #000', padding: '2px', textAlign: 'right', fontWeight: 'bold' }}>Total Keseluruhan</td>
                    <td style={{ border: '1px solid #000', padding: '2px', textAlign: 'right', fontWeight: 'bold' }}>{formatRupiah(totalCetak)}</td>
                  </tr>
                </>
              );
            })()}
          </tbody>
        </table>
      </div>

      <div style={{ fontSize: '13px', fontStyle: 'italic', marginBottom: '6px', fontWeight: 'bold' }}>
        Terbilang: {(() => {
          let total = 0;
          order.items.forEach(it => {
            const shippedIt = order.shippingInfo?.shippedItems?.find(si => si.name === it.name && si.type === it.type);
            const renderQty = shippedIt !== undefined ? shippedIt.shippedQty : it.quantity;
            total += (it.priceStudent || 0) * renderQty;
          });
          return terbilang(total);
        })()} Rupiah
      </div>

      {/* Catatan */}
      <div style={{ fontSize: '13px', marginBottom: '8px', pageBreakInside: 'avoid' }}>
        <strong>Catatan:</strong>
        <ol style={{ margin: '2px 0 0 0', paddingLeft: '16px', lineHeight: '1.2' }}>
          <li>Mohon lembar 1(Putih) dikembalikan ke Koperasi</li>
          <li>Rek BCA 0760256757 a/n Koperasi Konsumen Karyawan BPK Penabur</li>
          {order.shippingInfo?.sourceVendorNotes && (
            <li><strong>Dikirim dari Vendor Penjahit:</strong> {order.shippingInfo.sourceVendorNotes}</li>
          )}
          {order.shippingInfo?.sourceKopkarNotes && (
            <li><strong>Dikirim dari Gudang Koperasi:</strong> {order.shippingInfo.sourceKopkarNotes}</li>
          )}
          {!order.shippingInfo?.sourceVendorNotes && order.shippingInfo?.source === 'vendor' && (
            <li><strong>Catatan:</strong> Pesanan ini dikirim langsung dari Gudang Vendor Penjahit/Penerbit.</li>
          )}
        </ol>
      </div>

      {/* Tanda Tangan */}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginTop: '16px', pageBreakInside: 'avoid' }}>
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
  );
};

export default SuratJalanPrint;
