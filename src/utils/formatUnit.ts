/**
 * Helper utility untuk menentukan satuan barang (unit):
 * - Seragam / Umum: 'pcs' (jika jumlah > 1 atau umum) dan 'pc' (jika jumlah 1)
 * - Buku Tulis: 'pack'
 * - Kaos Kaki / Sepatu: 'psg' (pasang)
 */

export function resolveItemUnit(
  item: { name?: string; category?: string; type?: string; unit?: string } | null | undefined,
  quantity: number = 1
): string {
  if (!item) return quantity === 1 ? 'pc' : 'pcs';

  const rawUnit = (item.unit || '').trim().toLowerCase();

  // Jika unit sudah terdefinisi secara eksplisit
  if (rawUnit) {
    if (rawUnit === 'pcs' || rawUnit === 'pc' || rawUnit === 'piece' || rawUnit === 'pieces') {
      return quantity === 1 ? 'pc' : 'pcs';
    }
    return item.unit!.trim();
  }

  // Fallback deteksi otomatis berdasarkan nama atau kategori barang
  const name = (item.name || '').toLowerCase();
  const category = (item.category || item.type || '').toLowerCase();

  // 1. Kaos Kaki atau Sepatu -> psg
  if (name.includes('kaos kaki') || name.includes('sepatu') || name.includes('sock') || name.includes('shoe')) {
    return 'psg';
  }

  // 2. Buku -> pack
  if (category === 'buku' || name.includes('buku') || name.includes('pack')) {
    return 'pack';
  }

  // 3. Seragam / Lainnya -> pc jika 1, pcs jika > 1
  return quantity === 1 ? 'pc' : 'pcs';
}

/**
 * Mendapatkan nilai default unit saat memilih kategori / input nama di form master barang
 */
export function getDefaultUnit(name: string = '', category: string = 'seragam'): 'pcs' | 'pack' | 'psg' {
  const lowerName = name.toLowerCase();
  if (lowerName.includes('kaos kaki') || lowerName.includes('sepatu') || lowerName.includes('sock')) {
    return 'psg';
  }
  if (category === 'buku' || lowerName.includes('buku')) {
    return 'pack';
  }
  return 'pcs';
}
