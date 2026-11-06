import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { ReturnRequest, ProductItem } from '../types';

export interface ReturnPdfOptions {
  ret: ReturnRequest;
  schoolName: string;
  recipientName: string; // "Bapak/Ibu ......"
  senderName: string;    // "Pengirim Retur"
  documentDate: string;  // e.g. "2026-11-06"
  products: ProductItem[];
  action?: 'download' | 'print';
}

const formatRupiah = (num: number) => {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(num);
};

const formatDateIndo = (dateStr?: string) => {
  if (!dateStr) return new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
};

export async function generateReturnPdf(options: ReturnPdfOptions): Promise<void> {
  const {
    ret,
    schoolName,
    recipientName,
    senderName,
    documentDate,
    products,
    action = 'download',
  } = options;

  const doc = new jsPDF('portrait', 'mm', 'a4');

  // 1. Logo BPK Penabur / Koperasi
  try {
    const logoUrl = `${import.meta.env.BASE_URL}logo_koperasi2.png`;
    const resp = await fetch(logoUrl);
    const blob = await resp.blob();
    const base64Logo = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });
    doc.addImage(base64Logo, 'PNG', 14, 12, 16, 16);
  } catch {
    // Lanjut jika logo tidak dapat dimuat
  }

  // 2. Header Sekolah (di samping logo)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(schoolName || 'BPK PENABUR JAKARTA', 34, 22);

  // 3. Kepada Yth di Koperasi BPK PENABUR
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text('Kepada Yth,', 14, 38);
  doc.text(`Bapak/Ibu ${recipientName || '.......'}`, 14, 43.5);
  doc.text('Di Koperasi BPK PENABUR', 14, 49);

  // 4. Judul Dokumen (Tengah)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('TANDA TERIMA RETUR', 105, 61, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(80, 80, 80);
  doc.text(`No. Dokumen: ${ret.id}   •   Tanggal: ${formatDateIndo(documentDate)}`, 105, 66, { align: 'center' });
  doc.setTextColor(0, 0, 0);

  // 5. Rincian Barang
  let totalQty = 0;
  let totalAmount = 0;

  const bodyRows = ret.items.map((it, idx) => {
    const prod = products.find((p) => p.id === it.productId);
    const size = prod?.size || (it as any).size || '-';
    const qty = it.quantity || 0;
    const price = prod?.priceKopkar || 0;
    const subtotal = qty * price;

    totalQty += qty;
    totalAmount += subtotal;

    return [
      String(idx + 1),
      it.productName,
      size,
      String(qty),
      'Pcs',
      formatRupiah(price),
      formatRupiah(subtotal),
    ];
  });

  // Footer baris TOTAL
  const footRow = [
    { content: 'TOTAL', colSpan: 3, styles: { halign: 'center' as const, fontStyle: 'bold' as const } },
    { content: String(totalQty), styles: { halign: 'center' as const, fontStyle: 'bold' as const } },
    '',
    '',
    { content: formatRupiah(totalAmount), styles: { halign: 'right' as const, fontStyle: 'bold' as const } },
  ];

  autoTable(doc, {
    startY: 71,
    margin: { left: 14, right: 14 },
    head: [['NO', 'NAMA BARANG', 'SIZE', 'QTY', 'SATUAN', 'HARGA SATUAN', 'JUMLAH']],
    body: bodyRows,
    foot: [footRow],
    theme: 'grid',
    headStyles: {
      fillColor: [241, 245, 249],
      textColor: [0, 0, 0],
      fontStyle: 'bold',
      fontSize: 8.5,
      halign: 'center',
      valign: 'middle',
      lineWidth: 0.2,
      lineColor: [0, 0, 0],
    },
    bodyStyles: {
      textColor: [0, 0, 0],
      fontSize: 8.5,
      lineWidth: 0.2,
      lineColor: [0, 0, 0],
    },
    footStyles: {
      fillColor: [248, 250, 252],
      textColor: [0, 0, 0],
      fontSize: 8.5,
      fontStyle: 'bold',
      lineWidth: 0.2,
      lineColor: [0, 0, 0],
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: 12 },
      1: { halign: 'left', cellWidth: 'auto' },
      2: { halign: 'center', cellWidth: 18 },
      3: { halign: 'center', cellWidth: 16 },
      4: { halign: 'center', cellWidth: 18 },
      5: { halign: 'right', cellWidth: 32 },
      6: { halign: 'right', cellWidth: 34 },
    },
  });

  // 6. Tanda Tangan
  const finalY = (doc as any).lastAutoTable?.finalY || 160;
  const sigY = Math.min(finalY + 16, 245);

  // Kiri: Diterima
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text('Diterima', 38, sigY, { align: 'center' });

  doc.text('( ...................................................... )', 38, sigY + 26, { align: 'center' });
  if (ret.koperasiDiterimaByName) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(ret.koperasiDiterimaByName, 38, sigY + 31, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text('Koperasi BPK PENABUR', 38, sigY + 35, { align: 'center' });
  } else {
    doc.setFontSize(8);
    doc.text('( Staf Koperasi )', 38, sigY + 31, { align: 'center' });
  }

  // Kanan: Pengirim Retur
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text('Pengirim Retur', 162, sigY, { align: 'center' });

  doc.text(`( ${senderName || '......................................................'} )`, 162, sigY + 26, { align: 'center' });
  doc.setFontSize(8);
  doc.text(schoolName, 162, sigY + 31, { align: 'center' });

  // Output
  if (action === 'print') {
    doc.autoPrint();
    const blobUrl = doc.output('bloburl');
    window.open(blobUrl, '_blank');
  } else {
    const cleanId = ret.id.replace(/[^a-zA-Z0-9_-]/g, '_');
    const cleanSchool = (schoolName || 'Sekolah').replace(/\s+/g, '_');
    doc.save(`Tanda_Terima_Retur_${cleanId}_${cleanSchool}.pdf`);
  }
}

