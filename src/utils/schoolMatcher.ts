/**
 * Utility Pembersih & Pencocokan Cerdas Nama Sekolah BPK PENABUR
 * Menghubungkan nama sekolah dari Aksara dan Kanvas tanpa bentrok penulisan wilayah / tanda kurung
 */

export function cleanSchoolName(name?: string | null): string {
  if (!name) return '';
  return name.replace(/\s*\([^)]*\)/g, '').trim();
}

export function isSchoolMatch(schoolA?: string | null, schoolB?: string | null): boolean {
  if (!schoolA || !schoolB) return false;
  const cleanA = cleanSchoolName(schoolA).toLowerCase().replace(/\s+/g, ' ');
  const cleanB = cleanSchoolName(schoolB).toLowerCase().replace(/\s+/g, ' ');
  if (!cleanA || !cleanB) return false;
  return cleanA === cleanB || cleanA.includes(cleanB) || cleanB.includes(cleanA);
}
