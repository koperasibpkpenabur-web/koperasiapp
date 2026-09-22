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

  const formatRupiah = (num: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0,
    }).format(num);
  };

  return (
    <div className="print-only print-surat-jalan">
      <div className="print-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
        <div>
          <h2 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: 'bold' }}>
            KOPERASI KONSUMEN KARYAWAN BPK PENABUR JAKARTA
          </h2>
          <div style={{ fontSize: '14px', lineHeight: '1.5' }}>
            Kepada Yth,<br />
            Bapak/Ibu <strong>{order.schoolName}</strong><br />
            di Tempat
          </div>
        </div>
        <div style={{ fontSize: '14px' }}>
          Tanggal: {today}
        </div>
      </div>

      <div style={{ textAlign: 'center', marginBottom: '20px' }}>
        <h3 style={{ margin: '0', fontSize: '18px', textDecoration: 'underline' }}>Tanda Terima</h3>
        <div style={{ fontSize: '12px' }}>No. Pesanan: {order.id}</div>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '20px', fontSize: '14px' }}>
        <thead>
          <tr>
            <th style={{ border: '1px solid #000', padding: '8px', width: '5%' }}>No</th>
            <th style={{ border: '1px solid #000', padding: '8px', textAlign: 'left' }}>Nama Barang</th>
            <th style={{ border: '1px solid #000', padding: '8px', width: '10%' }}>Qty</th>
            <th style={{ border: '1px solid #000', padding: '8px', width: '20%', textAlign: 'right' }}>Harga Satuan</th>
            <th style={{ border: '1px solid #000', padding: '8px', width: '20%', textAlign: 'right' }}>Jumlah</th>
          </tr>
        </thead>
        <tbody>
          {order.items.map((item, index) => (
            <tr key={index}>
              <td style={{ border: '1px solid #000', padding: '8px', textAlign: 'center' }}>{index + 1}</td>
              <td style={{ border: '1px solid #000', padding: '8px' }}>
                [{item.type}] {item.name}
              </td>
              <td style={{ border: '1px solid #000', padding: '8px', textAlign: 'center' }}>{item.quantity}</td>
              <td style={{ border: '1px solid #000', padding: '8px', textAlign: 'right' }}>{formatRupiah(item.priceStudent)}</td>
              <td style={{ border: '1px solid #000', padding: '8px', textAlign: 'right' }}>{formatRupiah(item.priceStudent * item.quantity)}</td>
            </tr>
          ))}
          <tr>
            <td colSpan={4} style={{ border: '1px solid #000', padding: '8px', textAlign: 'right', fontWeight: 'bold' }}>Total</td>
            <td style={{ border: '1px solid #000', padding: '8px', textAlign: 'right', fontWeight: 'bold' }}>{formatRupiah(order.totalPriceStudent)}</td>
          </tr>
        </tbody>
      </table>

      <div style={{ fontSize: '14px', marginBottom: '40px' }}>
        <strong>Catatan:</strong>
        <ol style={{ margin: '4px 0 0 0', paddingLeft: '20px', lineHeight: '1.5' }}>
          <li>Mohon lembar 1(Putih) dikembalikan ke Koperasi</li>
          <li>Barang yang telah diterima tolong dicek kembali.</li>
          <li>Pembayaran langsung di Koperasi</li>
          <li>Rek BCA 0760256757 a/n Koperasi Konsumen Karyawan BPK Penabur</li>
        </ol>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '40px', fontSize: '14px' }}>
        <div style={{ textAlign: 'center', width: '200px' }}>
          <div>Diterima oleh,</div>
          <div style={{ marginTop: '80px', borderBottom: '1px solid #000' }}></div>
        </div>
        <div style={{ textAlign: 'center', width: '200px' }}>
          <div>Pengirim,</div>
          <div style={{ marginTop: '80px', borderBottom: '1px solid #000' }}></div>
          <div style={{ marginTop: '4px' }}>Sri Mulyani</div>
        </div>
      </div>
    </div>
  );
};

export default SuratJalanPrint;
