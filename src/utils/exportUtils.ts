import type { Order } from '../types';

const padRight = (str: string, length: number) => {
  if (str.length >= length) return str.substring(0, length);
  return str + ' '.repeat(length - str.length);
};

const centerText = (str: string, length: number) => {
  if (str.length >= length) return str.substring(0, length);
  const leftPad = Math.floor((length - str.length) / 2);
  const rightPad = length - str.length - leftPad;
  return ' '.repeat(leftPad) + str + ' '.repeat(rightPad);
};

export const exportSuratJalanToText = (order: Order) => {
  const today = new Date().toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  });

  const LINE_WIDTH = 80;
  const separator = '='.repeat(LINE_WIDTH);
  const thinSeparator = '-'.repeat(LINE_WIDTH);

  let text = "";
  
  // Header
  text += separator + "\n";
  text += centerText("KOPERASI KONSUMEN KARYAWAN BPK PENABUR JAKARTA", LINE_WIDTH) + "\n";
  text += separator + "\n\n";

  // Info
  text += padRight("Kepada Yth,", 45) + `Tanggal     : ${today}\n`;
  text += padRight(`Bapak/Ibu ${order.schoolName}`, 45) + `No. Pesanan : ${order.id}\n`;
  text += "di Tempat\n\n";

  // Table Header
  text += thinSeparator + "\n";
  text += "No | Nama Barang                                       | Size     | Qty       \n";
  text += thinSeparator + "\n";

  // Table Body
  order.items.forEach((item, index) => {
    const no = padRight((index + 1).toString(), 2);
    const namaFull = `[${item.type}] ${item.name}`;
    const nama = padRight(namaFull, 47);
    const size = padRight(item.size || "-", 8);
    const qty = padRight(item.quantity.toString(), 9);
    
    text += `${no} | ${nama} | ${size} | ${qty}\n`;
  });

  text += thinSeparator + "\n\n";

  // Catatan
  text += "Catatan:\n";
  text += "1. Mohon lembar 1 (Putih) dikembalikan ke Koperasi\n";
  text += "2. Barang yang telah diterima tolong dicek kembali.\n";
  text += "3. Pembayaran langsung di Koperasi\n";
  text += "4. Rek BCA 0760256757 a/n Koperasi Konsumen Karyawan BPK Penabur\n\n\n";

  // Signatures
  text += padRight("             Diterima oleh,", 50) + "Pengirim,\n\n\n\n\n";
  text += padRight("             (____________)", 50) + "(Sri Mulyani)\n";
  
  text += separator + "\n";

  // Create Blob and trigger download
  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = `Surat_Jalan_${order.id}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};
