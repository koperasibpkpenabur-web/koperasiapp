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

const KwitansiPrint: React.FC<Props> = ({ order }) => {
  if (!order) return null;

  const orderDate = order.createdAt ? new Date(order.createdAt) : new Date();
  const formattedDate = orderDate.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  const grandTotal = order.totalPriceStudent || 0;

  const pageStyle = `
    @media print {
      @page {
        margin: 0;
      }
      body {
        margin: 0;
        -webkit-print-color-adjust: exact;
        padding-top: 5mm;
        padding-left: 5mm;
      }
      .print-kwitansi {
        font-family: 'Courier New', Courier, monospace !important;
        -webkit-font-smoothing: none;
        color: #000 !important;
        font-size: 13px !important;
      }
      .print-kwitansi h1,
      .print-kwitansi h2,
      .print-kwitansi h3,
      .print-kwitansi h4,
      .print-kwitansi h5,
      .print-kwitansi h6 {
        font-family: inherit !important;
      }
      .print-kwitansi table {
        width: 100%;
        border-collapse: collapse;
      }
      .print-kwitansi table th, .print-kwitansi table td {
        border: 1px solid #000 !important;
        font-size: 13px !important;
        padding: 3px 5px !important; 
        word-wrap: break-word;
        overflow-wrap: break-word;
      }
      .print-kwitansi table tr {
        page-break-inside: avoid;
      }
    }
  `;

  return (
    <div className="print-only print-kwitansi" style={{ margin: '0', padding: '0', width: '190mm', boxSizing: 'border-box' }}>
      <style>{pageStyle}</style>

      {/* Header / Kop Kwitansi */}
      <div className="print-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
          <img src={`${import.meta.env.BASE_URL}logo_koperasi2.png`} alt="Logo" style={{ width: '40px', height: 'auto', filter: 'grayscale(100%)', marginTop: '2px' }} />
          <div>
            <h2 style={{ margin: '0 0 2px 0', fontSize: '14px', fontWeight: 'bold' }}>
              KOPERASI KONSUMEN KARYAWAN BPK PENABUR JAKARTA
            </h2>
            <div style={{ fontSize: '11px', color: '#444' }}>
              Jl. Tanjung Duren Raya No. 4, Grogol Petamburan, Jakarta Barat
            </div>
          </div>
        </div>
        <div style={{ fontSize: '12px', textAlign: 'right' }}>
          <div>Tanggal: {formattedDate}</div>
        </div>
      </div>

      <div style={{ borderBottom: '2px solid #000', marginBottom: '10px' }}></div>

      {/* Judul Kwitansi */}
      <div style={{ textAlign: 'center', marginBottom: '12px' }}>
        <h3 style={{ margin: '0', fontSize: '16px', textDecoration: 'underline', fontWeight: 'bold', letterSpacing: '2px' }}>
          KWITANSI
        </h3>
        <div style={{ fontSize: '12px', marginTop: '3px' }}>
          No. Pesanan: <strong>{order.id}</strong> {order.orderPhase ? `(${order.orderPhase})` : ''}
        </div>
      </div>

      {/* Kotak Keterangan Kwitansi Sesuai Arahan User */}
      <div style={{ border: '1px solid #000', padding: '10px 14px', marginBottom: '14px', lineHeight: '1.8', fontSize: '13px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start' }}>
          <div style={{ width: '190px', fontWeight: 'bold' }}>Telah diterima dari</div>
          <div style={{ width: '15px', fontWeight: 'bold' }}>:</div>
          <div style={{ flex: 1, borderBottom: '1px dotted #000', minHeight: '22px' }}>
            {/* Dari nya dikosongkan untuk diisi manual */}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-start', marginTop: '6px' }}>
          <div style={{ width: '190px', fontWeight: 'bold' }}>Uang sejumlah</div>
          <div style={{ width: '15px', fontWeight: 'bold' }}>:</div>
          <div style={{ flex: 1, fontWeight: 'bold', fontSize: '14px' }}>
            {formatRupiah(grandTotal)}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-start', marginTop: '4px' }}>
          <div style={{ width: '190px', fontWeight: 'bold', fontStyle: 'italic' }}>Terbilang</div>
          <div style={{ width: '15px', fontWeight: 'bold' }}>:</div>
          <div style={{ flex: 1, fontStyle: 'italic', background: '#f5f5f5', padding: '2px 8px', border: '1px solid #ccc' }}>
            # {terbilang(grandTotal)} Rupiah #
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-start', marginTop: '6px' }}>
          <div style={{ width: '190px', fontWeight: 'bold' }}>Untuk pemesanan</div>
          <div style={{ width: '15px', fontWeight: 'bold' }}>:</div>
          <div style={{ flex: 1 }}>
            Pemesanan Barang {order.schoolName ? `— ${order.schoolName}` : ''}
            {order.notes ? ` (Catatan: ${order.notes})` : ''}
          </div>
        </div>
      </div>

      {/* Rincian Barang yang Dipesan */}
      <div style={{ marginBottom: '12px' }}>
        <div style={{ fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' }}>Rincian Barang yang Dipesan:</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
          <thead>
            <tr>
              <th style={{ border: '1px solid #000', padding: '3px', width: '5%', textAlign: 'center' }}>No</th>
              <th style={{ border: '1px solid #000', padding: '3px', textAlign: 'left' }}>Nama Barang</th>
              <th style={{ border: '1px solid #000', padding: '3px', width: '10%', textAlign: 'center' }}>Size</th>
              <th style={{ border: '1px solid #000', padding: '3px', width: '8%', textAlign: 'center' }}>Qty</th>
              <th style={{ border: '1px solid #000', padding: '3px', width: '18%', textAlign: 'right' }}>Harga Satuan</th>
              <th style={{ border: '1px solid #000', padding: '3px', width: '20%', textAlign: 'right' }}>Jumlah</th>
            </tr>
          </thead>
          <tbody>
            {(order.items || []).map((item, idx) => {
              const harga = item.priceStudent || (item.priceKopkar + (item.feeSchool || 0));
              const subtotal = harga * item.quantity;
              return (
                <tr key={idx}>
                  <td style={{ border: '1px solid #000', padding: '3px', textAlign: 'center' }}>{idx + 1}</td>
                  <td style={{ border: '1px solid #000', padding: '3px' }}>
                    [{item.type}] {item.name}
                  </td>
                  <td style={{ border: '1px solid #000', padding: '3px', textAlign: 'center' }}>{item.size || '-'}</td>
                  <td style={{ border: '1px solid #000', padding: '3px', textAlign: 'center' }}>{item.quantity}</td>
                  <td style={{ border: '1px solid #000', padding: '3px', textAlign: 'right' }}>{formatRupiah(harga)}</td>
                  <td style={{ border: '1px solid #000', padding: '3px', textAlign: 'right' }}>{formatRupiah(subtotal)}</td>
                </tr>
              );
            })}
            <tr>
              <td colSpan={5} style={{ border: '1px solid #000', padding: '4px', textAlign: 'right', fontWeight: 'bold' }}>
                TOTAL PEMBAYARAN
              </td>
              <td style={{ border: '1px solid #000', padding: '4px', textAlign: 'right', fontWeight: 'bold' }}>
                {formatRupiah(grandTotal)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Bagian Tanda Tangan */}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginTop: '20px', pageBreakInside: 'avoid' }}>
        <div style={{ textAlign: 'center', width: '180px' }}>
          <div>Penyetor / Pembeli,</div>
          <div style={{ marginTop: '55px', borderBottom: '1px solid #000' }}></div>
          <div style={{ marginTop: '3px', fontSize: '11px', color: '#555' }}>( Nama Jelas & TTD )</div>
        </div>
        <div style={{ textAlign: 'center', width: '180px' }}>
          <div>Jakarta, {formattedDate}</div>
          <div style={{ marginTop: '4px' }}>Penerima / Kasir Koperasi,</div>
          <div style={{ marginTop: '38px', borderBottom: '1px solid #000' }}></div>
          <div style={{ marginTop: '3px', fontWeight: 'bold' }}>Sri Mulyani / Kasir</div>
        </div>
      </div>
    </div>
  );
};

export default KwitansiPrint;
