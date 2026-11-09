import * as ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import type { Order } from '../types';
import { resolveItemUnit } from './formatUnit';

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

export const generateSuratJalanExcel = async (order: Order) => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Surat Jalan');

  const today = new Date().toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  // Base font style
  const fontStyle = { name: 'Times New Roman', size: 11 };
  const boldFontStyle = { name: 'Times New Roman', size: 11, bold: true };
  const titleFontStyle = { name: 'Times New Roman', size: 12, bold: true };

  // Set column widths
  worksheet.columns = [
    { width: 5 },   // A: No
    { width: 42 },  // B: Nama Barang
    { width: 14 },  // C: Size
    { width: 8 },   // D: Qty
    { width: 10 },  // E: Satuan
    { width: 18 },  // F: Harga
    { width: 20 },  // G: Jumlah
  ];

  // Title
  worksheet.mergeCells('A1:E1');
  const cellA1 = worksheet.getCell('A1');
  cellA1.value = 'KOPERASI KONSUMEN KARYAWAN BPK PENABUR JAKARTA';
  cellA1.font = titleFontStyle;

  worksheet.mergeCells('F1:G1');
  const cellF1 = worksheet.getCell('F1');
  cellF1.value = `Tanggal: ${today}`;
  cellF1.font = fontStyle;
  cellF1.alignment = { horizontal: 'right' };

  // Kepada Yth
  worksheet.getCell('A2').value = 'Kepada Yth,';
  worksheet.getCell('A2').font = fontStyle;
  
  worksheet.getCell('A3').value = 'Bapak/Ibu';
  worksheet.getCell('A3').font = fontStyle;
  worksheet.getCell('B3').value = order.schoolName;
  worksheet.getCell('B3').font = boldFontStyle;
  
  worksheet.getCell('A4').value = 'di Tempat';
  worksheet.getCell('A4').font = fontStyle;

  // Surat Jalan Center
  worksheet.mergeCells('A6:G6');
  const titleCell = worksheet.getCell('A6');
  titleCell.value = 'Surat Jalan';
  titleCell.font = { ...titleFontStyle, underline: true };
  titleCell.alignment = { horizontal: 'center' };

  worksheet.mergeCells('A7:G7');
  const orderIdCell = worksheet.getCell('A7');
  orderIdCell.value = `No. Pesanan: ${order.id}`;
  orderIdCell.font = fontStyle;
  orderIdCell.alignment = { horizontal: 'center' };

  // Empty row before table
  worksheet.addRow([]);

  // Table Headers
  const headerRow = worksheet.addRow(['No', 'Nama Barang', 'Size', 'Qty', 'Satuan', 'Harga', 'Jumlah']);
  headerRow.eachCell((cell) => {
    cell.font = boldFontStyle;
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' }
    };
  });

  // Table Data
  order.items.forEach((item, idx) => {
    const harga = item.priceStudent || 0;
    const jumlah = harga * item.quantity;
    const unit = resolveItemUnit(item, item.quantity);
    
    const row = worksheet.addRow([
      idx + 1,
      `[${item.type}] ${item.name}`,
      item.size || '-',
      item.quantity,
      unit,
      harga,
      jumlah
    ]);

    row.getCell(1).alignment = { horizontal: 'center' };
    row.getCell(3).alignment = { horizontal: 'center' };
    row.getCell(4).alignment = { horizontal: 'center' };
    row.getCell(5).alignment = { horizontal: 'center' };
    
    // Formatting currency
    row.getCell(6).numFmt = '"Rp"#,##0';
    row.getCell(7).numFmt = '"Rp"#,##0';

    row.eachCell((cell) => {
      cell.font = fontStyle;
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
    });
  });

  // Total Row
  const totalRowIndex = worksheet.rowCount + 1;
  worksheet.mergeCells(`A${totalRowIndex}:F${totalRowIndex}`);
  const totalLabelCell = worksheet.getCell(`A${totalRowIndex}`);
  totalLabelCell.value = 'Total Keseluruhan';
  totalLabelCell.font = boldFontStyle;
  totalLabelCell.alignment = { horizontal: 'right', vertical: 'middle' };
  
  const totalValueCell = worksheet.getCell(`G${totalRowIndex}`);
  totalValueCell.value = order.totalPriceStudent || 0;
  totalValueCell.numFmt = '"Rp"#,##0';
  totalValueCell.font = boldFontStyle;

  // Add borders for total row
  for (let i = 1; i <= 7; i++) {
    worksheet.getCell(totalRowIndex, i).border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' }
    };
  }

  // Terbilang
  const terbilangRowIdx = worksheet.rowCount + 2;
  worksheet.mergeCells(`A${terbilangRowIdx}:G${terbilangRowIdx}`);
  const terbilangCell = worksheet.getCell(`A${terbilangRowIdx}`);
  terbilangCell.value = `Terbilang: ${terbilang(order.totalPriceStudent || 0)} Rupiah`;
  terbilangCell.font = { name: 'Times New Roman', size: 11, bold: true, italic: true };

  // Catatan
  const notesRowIdx = worksheet.rowCount + 2;
  worksheet.getCell(`A${notesRowIdx}`).value = 'Catatan:';
  worksheet.getCell(`A${notesRowIdx}`).font = boldFontStyle;
  
  worksheet.mergeCells(`B${notesRowIdx}:G${notesRowIdx}`);
  worksheet.getCell(`B${notesRowIdx}`).value = '1. Mohon lembar 1(Putih) dikembalikan ke Koperasi';
  worksheet.getCell(`B${notesRowIdx}`).font = fontStyle;

  const notesRowIdx2 = worksheet.rowCount + 1;
  worksheet.mergeCells(`B${notesRowIdx2}:G${notesRowIdx2}`);
  worksheet.getCell(`B${notesRowIdx2}`).value = '2. Rek BCA 0760256757 a/n Koperasi Konsumen Karyawan BPK Penabur';
  worksheet.getCell(`B${notesRowIdx2}`).font = fontStyle;

  // Signatures
  const sigRowIdx1 = worksheet.rowCount + 3;
  worksheet.getCell(`B${sigRowIdx1}`).value = 'Diterima oleh,';
  worksheet.getCell(`B${sigRowIdx1}`).font = fontStyle;
  worksheet.getCell(`B${sigRowIdx1}`).alignment = { horizontal: 'center' };

  worksheet.mergeCells(`F${sigRowIdx1}:G${sigRowIdx1}`);
  worksheet.getCell(`F${sigRowIdx1}`).value = 'Pengirim,';
  worksheet.getCell(`F${sigRowIdx1}`).font = fontStyle;
  worksheet.getCell(`F${sigRowIdx1}`).alignment = { horizontal: 'center' };

  // Space for signature
  const sigRowIdx2 = worksheet.rowCount + 4;
  worksheet.getCell(`B${sigRowIdx2}`).value = ' ';
  
  const sigRowIdx3 = worksheet.rowCount + 1;
  worksheet.getCell(`B${sigRowIdx3}`).value = '___________________';
  worksheet.getCell(`B${sigRowIdx3}`).font = fontStyle;
  worksheet.getCell(`B${sigRowIdx3}`).alignment = { horizontal: 'center' };

  worksheet.mergeCells(`F${sigRowIdx3}:G${sigRowIdx3}`);
  worksheet.getCell(`F${sigRowIdx3}`).value = '___________________';
  worksheet.getCell(`F${sigRowIdx3}`).font = fontStyle;
  worksheet.getCell(`F${sigRowIdx3}`).alignment = { horizontal: 'center' };

  const sigRowIdx4 = worksheet.rowCount + 1;
  worksheet.mergeCells(`F${sigRowIdx4}:G${sigRowIdx4}`);
  worksheet.getCell(`F${sigRowIdx4}`).value = 'Sri Mulyani';
  worksheet.getCell(`F${sigRowIdx4}`).font = fontStyle;
  worksheet.getCell(`F${sigRowIdx4}`).alignment = { horizontal: 'center' };

  // Write and download
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  saveAs(blob, `Surat_Jalan_${order.id}.xlsx`);
};
