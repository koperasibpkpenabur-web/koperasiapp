// Helper pembuatan token QR & URL konfirmasi penerimaan barang Surat Jalan

const POD_SALT = 'PENABUR_KOPKAR_POD_VERIFIED_2026';

/**
 * Menghasilkan token acak deterministik (anti-tamper) khusus untuk pesanan tertentu.
 */
export function generateOrderQrToken(orderId: string): string {
  const cleanId = String(orderId || '').trim();
  let hash1 = 0x811c9dc5;
  let hash2 = 0x5bd1e995;
  const input = `${cleanId}:::${POD_SALT}`;

  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i);
    hash1 ^= code;
    hash1 = Math.imul(hash1, 0x01000193);
    hash2 ^= code;
    hash2 = Math.imul(hash2, 0x5bd1e995);
  }

  const hex1 = (hash1 >>> 0).toString(16).padStart(8, '0');
  const hex2 = (hash2 >>> 0).toString(16).padStart(8, '0');
  return `pod_${hex1}${hex2}`.slice(0, 16);
}

/**
 * Membangun URL lengkap untuk di-encode ke dalam QR Code surat jalan.
 */
export function buildOrderReceiveUrl(orderId: string): string {
  const token = generateOrderQrToken(orderId);
  const origin =
    typeof window !== 'undefined' && window.location.origin
      ? window.location.origin
      : 'https://koperasibpkpenabur-web.github.io';
  const baseUrl = (import.meta.env.BASE_URL || '/koperasiapp/').replace(/\/$/, '');
  return `${origin}${baseUrl}/terima-barang?id=${encodeURIComponent(orderId)}&token=${token}`;
}

/**
 * Verifikasi token URL saat link di-scan kamera HP.
 */
export function verifyOrderQrToken(orderId: string, token: string): boolean {
  if (!orderId || !token) return false;
  const expected = generateOrderQrToken(orderId);
  return expected === token;
}

/**
 * Menghasilkan 4-digit PIN default sekolah berdasarkan nama sekolah
 * (Digunakan sebagai lapis proteksi kedua agar pihak luar / kurir tidak bisa sembarangan klik terima)
 */
export function getSchoolDefaultPin(schoolName?: string): string {
  const clean = String(schoolName || '').trim().toUpperCase();
  if (!clean) return '1234';

  let hash = 5381;
  for (let i = 0; i < clean.length; i++) {
    hash = ((hash << 5) + hash + clean.charCodeAt(i)) & 0xffffffff;
  }
  const positive = Math.abs(hash) % 10000;
  // Pastikan selalu 4 digit (misal: 0821, 1234, dsb)
  return String(positive).padStart(4, '0');
}
