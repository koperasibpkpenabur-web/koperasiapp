import React from 'react';
import type { Order } from '../../types';
import { resolveAcademicYear } from '../../utils/academicYear';
import { resolveItemUnit } from '../../utils/formatUnit';
import { findMatchingOrderLine } from '../../utils/orderItemMatch';

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

  const shippedItems = order.shippingInfo?.shippedItems || [];
  
  const kopkarItems: any[] = [];
  const vendorItems: any[] = [];
  let totalKopkar = 0;
  let totalVendor = 0;

  if (shippedItems.length > 0) {
    order.items.forEach(it => {
      const si = findMatchingOrderLine(shippedItems, it);
      if (!si) return;
      if (si.kopkarQty && si.kopkarQty > 0) {
        kopkarItems.push({ ...it, renderQty: si.kopkarQty });
        totalKopkar += (it.priceStudent || 0) * si.kopkarQty;
      }
      if (si.vendorQty && si.vendorQty > 0) {
        vendorItems.push({ ...it, renderQty: si.vendorQty });
        totalVendor += (it.priceStudent || 0) * si.vendorQty;
      }
    });
  } else {
    // Legacy orders without split breakdown
    const isVendor = order.shippingInfo?.source === 'vendor';
    order.items.forEach(it => {
      if (it.quantity > 0) {
        if (isVendor) {
          vendorItems.push({ ...it, renderQty: it.quantity });
          totalVendor += (it.priceStudent || 0) * it.quantity;
        } else {
          kopkarItems.push({ ...it, renderQty: it.quantity });
          totalKopkar += (it.priceStudent || 0) * it.quantity;
        }
      }
    });
  }

  const isMixed = kopkarItems.length > 0 && vendorItems.length > 0;
  const grandTotal = totalKopkar + totalVendor;

  const renderTableRows = (items: any[]) => {
    return items.map((item, idx) => {
      const harga = item.priceStudent || 0;
      const jumlah = harga * item.renderQty;
      const unit = resolveItemUnit(item, item.renderQty);
      return (
        <tr key={idx}>
          <td style={{ border: '1px solid #000', padding: '3px 5px', textAlign: 'center' }}>{idx + 1}</td>
          <td style={{ border: '1px solid #000', padding: '3px 5px' }}>
            [{item.type}] {item.name}
          </td>
          <td style={{ border: '1px solid #000', padding: '3px 5px', textAlign: 'center' }}>{item.size || '-'}</td>
          <td style={{ border: '1px solid #000', padding: '3px 5px', textAlign: 'center', fontWeight: 'bold' }}>{item.renderQty}</td>
          <td style={{ border: '1px solid #000', padding: '3px 5px', textAlign: 'center' }}>{unit}</td>
          <td style={{ border: '1px solid #000', padding: '3px 5px', textAlign: 'right' }}>{formatRupiah(harga)}</td>
          <td style={{ border: '1px solid #000', padding: '3px 5px', textAlign: 'right', fontWeight: 'bold' }}>{formatRupiah(jumlah)}</td>
        </tr>
      );
    });
  };

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
        font-family: 'Times New Roman', Times, serif !important;
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
        color: #000000 !important;
        font-size: 13.5px !important;
        line-height: 1.3;
      }
      .print-surat-jalan h1,
      .print-surat-jalan h2,
      .print-surat-jalan h3,
      .print-surat-jalan h4,
      .print-surat-jalan h5,
      .print-surat-jalan h6 {
        font-family: 'Times New Roman', Times, serif !important;
        color: #000000 !important;
      }
      .print-surat-jalan table {
        width: 100%;
        border-collapse: collapse;
      }
      .print-surat-jalan table th, .print-surat-jalan table td {
        border: 1px solid #000000 !important;
        font-size: 13.5px !important;
        padding: 3px 5px !important; 
        color: #000000 !important;
        word-wrap: break-word;
        overflow-wrap: break-word;
      }
      .print-surat-jalan table th {
        font-weight: bold;
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
      <div className="print-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <img 
            src={`${import.meta.env.BASE_URL}logo_koperasi_mono.png`} 
            alt="Logo Koperasi" 
            style={{ width: '46px', height: 'auto', display: 'block' }} 
          />
          <div>
            <h2 style={{ margin: '0 0 4px 0', fontSize: '15px', fontWeight: 'bold', letterSpacing: '0.2px' }}>
              KOPERASI KONSUMEN KARYAWAN BPK PENABUR JAKARTA
            </h2>
            <div style={{ fontSize: '13.5px', lineHeight: '1.25' }}>
              Kepada Yth,<br />
              Bapak/Ibu <strong>{order.schoolName}</strong><br />
              di Tempat
            </div>
          </div>
        </div>
        <div style={{ fontSize: '13.5px', textAlign: 'right' }}>
          <div>Tanggal: {today}</div>
          <div>Tahun Ajaran: <strong>{resolveAcademicYear(order.academicYear)}</strong></div>
        </div>
      </div>

      <div style={{ textAlign: 'center', marginBottom: '8px' }}>
        <h3 style={{ margin: '0', fontSize: '15px', textDecoration: 'underline', fontWeight: 'bold' }}>Surat Jalan</h3>
        <div style={{ fontSize: '13.5px', marginTop: '2px', fontWeight: 'bold' }}>No. Pesanan: {order.id}</div>
      </div>

      {/* Tabel Barang */}
      {!isMixed ? (
        <div style={{ marginBottom: '6px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13.5px' }}>
            <thead>
              <tr>
                <th style={{ border: '1px solid #000', padding: '3px 5px', width: '5%', textAlign: 'center' }}>No</th>
                <th style={{ border: '1px solid #000', padding: '3px 5px', textAlign: 'left' }}>Nama Barang</th>
                <th style={{ border: '1px solid #000', padding: '3px 5px', width: '10%', textAlign: 'center' }}>Size</th>
                <th style={{ border: '1px solid #000', padding: '3px 5px', width: '6%', textAlign: 'center' }}>Qty</th>
                <th style={{ border: '1px solid #000', padding: '3px 5px', width: '8%', textAlign: 'center' }}>Satuan</th>
                <th style={{ border: '1px solid #000', padding: '3px 5px', width: '15%', textAlign: 'right' }}>Harga</th>
                <th style={{ border: '1px solid #000', padding: '3px 5px', width: '17%', textAlign: 'right' }}>Jumlah</th>
              </tr>
            </thead>
            <tbody>
              {renderTableRows(kopkarItems.length > 0 ? kopkarItems : vendorItems)}
              <tr>
                <td colSpan={6} style={{ border: '1px solid #000', padding: '4px 6px', textAlign: 'right', fontWeight: 'bold' }}>Total Keseluruhan</td>
                <td style={{ border: '1px solid #000', padding: '4px 6px', textAlign: 'right', fontWeight: 'bold' }}>{formatRupiah(grandTotal)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : (
        <>
          <div style={{ marginBottom: '8px' }}>
            <div style={{ fontSize: '13.5px', fontWeight: 'bold', marginBottom: '3px' }}>A. DIKIRIM DARI GUDANG KOPERASI</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13.5px' }}>
              <thead>
                <tr>
                  <th style={{ border: '1px solid #000', padding: '3px 5px', width: '5%', textAlign: 'center' }}>No</th>
                  <th style={{ border: '1px solid #000', padding: '3px 5px', textAlign: 'left' }}>Nama Barang</th>
                  <th style={{ border: '1px solid #000', padding: '3px 5px', width: '10%', textAlign: 'center' }}>Size</th>
                  <th style={{ border: '1px solid #000', padding: '3px 5px', width: '6%', textAlign: 'center' }}>Qty</th>
                  <th style={{ border: '1px solid #000', padding: '3px 5px', width: '8%', textAlign: 'center' }}>Satuan</th>
                  <th style={{ border: '1px solid #000', padding: '3px 5px', width: '15%', textAlign: 'right' }}>Harga</th>
                  <th style={{ border: '1px solid #000', padding: '3px 5px', width: '17%', textAlign: 'right' }}>Jumlah</th>
                </tr>
              </thead>
              <tbody>
                {renderTableRows(kopkarItems)}
                <tr>
                  <td colSpan={6} style={{ border: '1px solid #000', padding: '4px 6px', textAlign: 'right', fontWeight: 'bold' }}>Sub-Total Koperasi</td>
                  <td style={{ border: '1px solid #000', padding: '4px 6px', textAlign: 'right', fontWeight: 'bold' }}>{formatRupiah(totalKopkar)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div style={{ marginBottom: '8px' }}>
            <div style={{ fontSize: '13.5px', fontWeight: 'bold', marginBottom: '3px' }}>B. DIKIRIM LANGSUNG DARI VENDOR PENJAHIT/PENERBIT</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13.5px' }}>
              <thead>
                <tr>
                  <th style={{ border: '1px solid #000', padding: '3px 5px', width: '5%', textAlign: 'center' }}>No</th>
                  <th style={{ border: '1px solid #000', padding: '3px 5px', textAlign: 'left' }}>Nama Barang</th>
                  <th style={{ border: '1px solid #000', padding: '3px 5px', width: '10%', textAlign: 'center' }}>Size</th>
                  <th style={{ border: '1px solid #000', padding: '3px 5px', width: '6%', textAlign: 'center' }}>Qty</th>
                  <th style={{ border: '1px solid #000', padding: '3px 5px', width: '8%', textAlign: 'center' }}>Satuan</th>
                  <th style={{ border: '1px solid #000', padding: '3px 5px', width: '15%', textAlign: 'right' }}>Harga</th>
                  <th style={{ border: '1px solid #000', padding: '3px 5px', width: '17%', textAlign: 'right' }}>Jumlah</th>
                </tr>
              </thead>
              <tbody>
                {renderTableRows(vendorItems)}
                <tr>
                  <td colSpan={6} style={{ border: '1px solid #000', padding: '4px 6px', textAlign: 'right', fontWeight: 'bold' }}>Sub-Total Vendor</td>
                  <td style={{ border: '1px solid #000', padding: '4px 6px', textAlign: 'right', fontWeight: 'bold' }}>{formatRupiah(totalVendor)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          
          <div style={{ fontSize: '13.5px', fontWeight: 'bold', textAlign: 'right', marginBottom: '8px', padding: '4px 6px', border: '1px solid #000' }}>
            TOTAL KESELURUHAN (A + B): {formatRupiah(grandTotal)}
          </div>
        </>
      )}

      <div style={{ fontSize: '13.5px', fontStyle: 'italic', marginBottom: '8px', fontWeight: 'bold' }}>
        Terbilang: {terbilang(grandTotal)} Rupiah
      </div>

      {/* Catatan */}
      <div style={{ fontSize: '13px', marginBottom: '8px', pageBreakInside: 'avoid' }}>
        <strong>Catatan:</strong>
        <ol style={{ margin: '2px 0 0 0', paddingLeft: '16px', lineHeight: '1.25' }}>
          <li>Mohon lembar 1(Putih) dikembalikan ke Koperasi</li>
          <li>Rek BCA 0760256757 a/n Koperasi Konsumen Karyawan BPK Penabur</li>
          {order.shippingInfo?.source === 'vendor' && !order.shippingInfo?.shippedItems && (
            <li><strong>Catatan:</strong> Pesanan ini dikirim langsung dari Gudang Vendor Penjahit/Penerbit.</li>
          )}
        </ol>
      </div>

      {/* Tanda Tangan */}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13.5px', marginTop: '16px', pageBreakInside: 'avoid' }}>
        <div style={{ textAlign: 'center', width: '140px' }}>
          <div>Diterima oleh,</div>
          <div style={{ marginTop: '30px', borderBottom: '1px solid #000' }}></div>
        </div>
        <div style={{ textAlign: 'center', width: '140px' }}>
          <div>Pengirim,</div>
          <div style={{ marginTop: '30px', borderBottom: '1px solid #000' }}></div>
          <div style={{ marginTop: '2px', fontWeight: 'bold' }}>Sri Mulyani</div>
        </div>
      </div>
    </div>
  );
};

export default SuratJalanPrint;
