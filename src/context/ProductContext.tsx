import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import type { ProductItem, SchoolLevel } from '../types';

interface ProductContextType {
  products: ProductItem[];
  getProductsByLevel: (level?: SchoolLevel) => ProductItem[];
  addProduct: (product: Omit<ProductItem, 'id'>) => { success: boolean; error?: string };
  updateProduct: (id: string, product: Partial<ProductItem>) => void;
  deleteProduct: (id: string) => void;
  adjustStock: (id: string, delta: number) => void;
  setProductStock: (id: string, newStock: number) => void;
  restockProduct: (id: string, quantity: number) => void;
  importProductsFromCsv: (csvContent: string) => { success: boolean; count?: number; updatedCount?: number; error?: string };
  downloadTemplateCsv: () => void;
  exportProductsCsv: () => void;
}

const ProductContext = createContext<ProductContextType | null>(null);

const PRODUCTS_KEY = 'koperasi_products_v3';

// Seed catalog master barang dengan 8 atribut lengkap + stock fisik awal
const INITIAL_PRODUCTS: ProductItem[] = [
  // --- JENJANG TK ---
  {
    id: 'PRD-TK-01',
    code: 'SRG-TK-01',
    name: 'Seragam Kotak-Kotak TK (Setelan)',
    category: 'seragam',
    level: 'TK',
    priceKopkar: 85000,
    feeSchool: 15000,
    priceStudent: 100000,
    stock: 85,
    minStock: 20,
  },
  {
    id: 'PRD-TK-02',
    code: 'SRG-TK-02',
    name: 'Seragam Olahraga TK (Kaos + Training)',
    category: 'seragam',
    level: 'TK',
    priceKopkar: 70000,
    feeSchool: 15000,
    priceStudent: 85000,
    stock: 60,
    minStock: 15,
  },
  {
    id: 'PRD-TK-03',
    code: 'BK-TK-01',
    name: 'Paket Buku Tematik TK Kelompok A & B (Semester 1 & 2)',
    category: 'buku',
    level: 'TK',
    priceKopkar: 110000,
    feeSchool: 20000,
    priceStudent: 130000,
    stock: 120,
    minStock: 25,
  },

  // --- JENJANG SD ---
  {
    id: 'PRD-SD-01',
    code: 'SRG-SD-01',
    name: 'Seragam Nasional Putih Merah SD (Baju + Celana/Rok)',
    category: 'seragam',
    level: 'SD',
    priceKopkar: 95000,
    feeSchool: 15000,
    priceStudent: 110000,
    stock: 140,
    minStock: 25,
  },
  {
    id: 'PRD-SD-02',
    code: 'SRG-SD-02',
    name: 'Seragam Batik Khas BPK PENABUR SD',
    category: 'seragam',
    level: 'SD',
    priceKopkar: 90000,
    feeSchool: 20000,
    priceStudent: 110000,
    stock: 75,
    minStock: 20,
  },
  {
    id: 'PRD-SD-03',
    code: 'SRG-SD-03',
    name: 'Seragam Olahraga SD (Lengkap)',
    category: 'seragam',
    level: 'SD',
    priceKopkar: 80000,
    feeSchool: 15000,
    priceStudent: 95000,
    stock: 50,
    minStock: 20,
  },
  {
    id: 'PRD-SD-04',
    code: 'BK-SD-01',
    name: 'Buku Matematika Kurikulum Merdeka SD Kelas 1-6',
    category: 'buku',
    level: 'SD',
    priceKopkar: 65000,
    feeSchool: 10000,
    priceStudent: 75000,
    stock: 150,
    minStock: 30,
  },
  {
    id: 'PRD-SD-05',
    code: 'BK-SD-02',
    name: 'Buku Bahasa Inggris My Next Words SD',
    category: 'buku',
    level: 'SD',
    priceKopkar: 60000,
    feeSchool: 10000,
    priceStudent: 70000,
    stock: 95,
    minStock: 20,
  },

  // --- JENJANG SMP ---
  {
    id: 'PRD-SMP-01',
    code: 'SRG-SMP-01',
    name: 'Seragam Putih Biru SMP PENABUR (Atasan + Bawahan)',
    category: 'seragam',
    level: 'SMP',
    priceKopkar: 105000,
    feeSchool: 20000,
    priceStudent: 125000,
    stock: 110,
    minStock: 25,
  },
  {
    id: 'PRD-SMP-02',
    code: 'SRG-SMP-02',
    name: 'Seragam Pramuka SMP PENABUR (Lengkap)',
    category: 'seragam',
    level: 'SMP',
    priceKopkar: 110000,
    feeSchool: 20000,
    priceStudent: 130000,
    stock: 45,
    minStock: 15,
  },
  {
    id: 'PRD-SMP-03',
    code: 'SRG-SMP-03',
    name: 'Seragam Olahraga SMP PENABUR',
    category: 'seragam',
    level: 'SMP',
    priceKopkar: 90000,
    feeSchool: 15000,
    priceStudent: 105000,
    stock: 15, // Low stock demo
    minStock: 20,
  },
  {
    id: 'PRD-SMP-04',
    code: 'BK-SMP-01',
    name: 'Buku Siswa Matematika Kelas 7 SMP',
    category: 'buku',
    level: 'SMP',
    priceKopkar: 75000,
    feeSchool: 15000,
    priceStudent: 90000,
    stock: 80,
    minStock: 20,
  },
  {
    id: 'PRD-SMP-05',
    code: 'BK-SMP-02',
    name: 'Buku Siswa Ilmu Pengetahuan Alam (IPA) Kelas 7 SMP',
    category: 'buku',
    level: 'SMP',
    priceKopkar: 75000,
    feeSchool: 15000,
    priceStudent: 90000,
    stock: 0, // Out of stock demo
    minStock: 20,
  },

  // --- JENJANG SMA ---
  {
    id: 'PRD-SMA-01',
    code: 'SRG-SMA-01',
    name: 'Seragam Putih Abu-Abu SMA PENABUR (Atasan + Bawahan)',
    category: 'seragam',
    level: 'SMA',
    priceKopkar: 115000,
    feeSchool: 25000,
    priceStudent: 140000,
    stock: 90,
    minStock: 20,
  },
  {
    id: 'PRD-SMA-02',
    code: 'SRG-SMA-02',
    name: 'Seragam Batik Nasional SMA PENABUR',
    category: 'seragam',
    level: 'SMA',
    priceKopkar: 100000,
    feeSchool: 20000,
    priceStudent: 120000,
    stock: 65,
    minStock: 15,
  },
  {
    id: 'PRD-SMA-03',
    code: 'BK-SMA-01',
    name: 'Buku Fisika SMA Kelas 10 Kurikulum Merdeka',
    category: 'buku',
    level: 'SMA',
    priceKopkar: 85000,
    feeSchool: 15000,
    priceStudent: 100000,
    stock: 70,
    minStock: 15,
  },
  {
    id: 'PRD-SMA-04',
    code: 'BK-SMA-02',
    name: 'Buku Kimia SMA Kelas 10 Kurikulum Merdeka',
    category: 'buku',
    level: 'SMA',
    priceKopkar: 85000,
    feeSchool: 15000,
    priceStudent: 100000,
    stock: 55,
    minStock: 15,
  },
];

function loadProducts(): ProductItem[] {
  try {
    const raw = localStorage.getItem(PRODUCTS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {
    // fallback
  }
  localStorage.setItem(PRODUCTS_KEY, JSON.stringify(INITIAL_PRODUCTS));
  return INITIAL_PRODUCTS;
}

function saveProducts(products: ProductItem[]) {
  localStorage.setItem(PRODUCTS_KEY, JSON.stringify(products));
}

// Generate code otomatis untuk barang yang tidak memiliki kode di Excel
function generateProductCode(
  category: 'seragam' | 'buku',
  level: SchoolLevel,
  existingProducts: ProductItem[],
  offsetIndex: number
): string {
  const prefix = (category === 'buku' ? 'BK' : 'SRG') + '-' + (level === 'SEMUA' ? 'GEN' : level);
  // Cari nomor tertinggi yang sudah dipakai untuk prefix ini
  let maxNum = 0;
  existingProducts.forEach((p) => {
    if (p.code && p.code.startsWith(prefix)) {
      const match = p.code.match(/-(\d+)$/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxNum) maxNum = num;
      }
    }
  });

  const nextNum = maxNum + offsetIndex + 1;
  return `${prefix}-${String(nextNum).padStart(2, '0')}`;
}

export function ProductProvider({ children }: { children: ReactNode }) {
  const [products, setProducts] = useState<ProductItem[]>(() => loadProducts());

  useEffect(() => {
    saveProducts(products);
  }, [products]);

  const getProductsByLevel = useCallback(
    (level?: SchoolLevel) => {
      if (!level || level === 'SEMUA') return products;
      return products.filter((p) => p.level === level || p.level === 'SEMUA');
    },
    [products]
  );

  const addProduct = useCallback((productData: Omit<ProductItem, 'id'>) => {
    const newProduct: ProductItem = {
      ...productData,
      id: `PRD-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
      priceStudent: productData.priceStudent || productData.priceKopkar + productData.feeSchool,
      stock: productData.stock !== undefined ? productData.stock : 50,
      minStock: productData.minStock || 15,
    };
    setProducts((prev) => [newProduct, ...prev]);
    return { success: true };
  }, []);

  const updateProduct = useCallback((id: string, updated: Partial<ProductItem>) => {
    setProducts((prev) =>
      prev.map((p) => {
        if (p.id === id) {
          const priceKopkar = updated.priceKopkar !== undefined ? updated.priceKopkar : p.priceKopkar;
          const feeSchool = updated.feeSchool !== undefined ? updated.feeSchool : p.feeSchool;
          const priceStudent =
            updated.priceStudent !== undefined ? updated.priceStudent : priceKopkar + feeSchool;
          return {
            ...p,
            ...updated,
            priceKopkar,
            feeSchool,
            priceStudent,
          };
        }
        return p;
      })
    );
  }, []);

  const deleteProduct = useCallback((id: string) => {
    setProducts((prev) => prev.filter((p) => p.id !== id));
  }, []);

  // Tambah / Kurang Stok barang
  const adjustStock = useCallback((id: string, delta: number) => {
    setProducts((prev) =>
      prev.map((p) => {
        if (p.id === id) {
          const newStock = Math.max(0, (p.stock || 0) + delta);
          return { ...p, stock: newStock };
        }
        return p;
      })
    );
  }, []);

  // Set nilai stok langsung
  const setProductStock = useCallback((id: string, newStock: number) => {
    setProducts((prev) =>
      prev.map((p) => {
        if (p.id === id) {
          return { ...p, stock: Math.max(0, newStock) };
        }
        return p;
      })
    );
  }, []);

  // Tambah stok kembali (restock dari retur)
  const restockProduct = useCallback((id: string, quantity: number) => {
    setProducts((prev) =>
      prev.map((p) => {
        if (p.id === id) {
          return { ...p, stock: (p.stock || 0) + Math.max(0, quantity) };
        }
        return p;
      })
    );
  }, []);

  // Import from CSV text (kompatibel dengan format 8 kolom Excel)
  // Kolom 1: No.
  // Kolom 2: Kode Barang (automation jika kosong)
  // Kolom 3: Nama Barang
  // Kolom 4: Kategori (seragam / buku)
  // Kolom 5: Jenjang (TK / SD / SMP / SMA / SEMUA)
  // Kolom 6: Harga Koperasi
  // Kolom 7: Fee Sekolah
  // Kolom 8: Harga Siswa
  const importProductsFromCsv = useCallback((csvContent: string) => {
    try {
      const lines = csvContent
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.length > 0);

      if (lines.length < 2) {
        return {
          success: false,
          error: 'File Excel / CSV tidak berisi data yang cukup (minimal 1 baris judul kolom dan 1 baris data)',
        };
      }

      // Deteksi delimiter (titik koma ; atau koma ,)
      const delimiter = lines[0].includes(';') ? ';' : ',';
      const header = lines[0].split(delimiter).map((h) => h.replace(/["']/g, '').trim().toLowerCase());

      // Mapping kolom
      const codeIdx = header.findIndex((h) => h.includes('kode') || h.includes('code'));
      const nameIdx = header.findIndex((h) => h.includes('nama') || h.includes('name') || h.includes('barang'));
      const catIdx = header.findIndex((h) => h.includes('kategori') || h.includes('category') || h.includes('jenis'));
      const levelIdx = header.findIndex((h) => h.includes('jenjang') || h.includes('level'));
      const kopkarIdx = header.findIndex((h) => h.includes('kopkar') || h.includes('koperasi') || h.includes('modal') || h.includes('hpp'));
      const feeIdx = header.findIndex((h) => h.includes('fee') || h.includes('sekolah') || h.includes('komisi'));
      const studentIdx = header.findIndex((h) => h.includes('siswa') || h.includes('jual') || h.includes('student'));

      if (nameIdx === -1 || kopkarIdx === -1 || feeIdx === -1) {
        return {
          success: false,
          error: 'Format kolom tidak sesuai! Kolom wajib: Nama Barang, Harga Koperasi, Fee Sekolah.',
        };
      }

      // Helper pembersih angka harga
      const parsePrice = (str?: string) => {
        if (!str) return 0;
        const clean = str.replace(/[^\d]/g, '');
        return parseInt(clean, 10) || 0;
      };

      setProducts((currentProducts) => {
        const workingList = [...currentProducts];
        let autoCodeCount = 0;
        let newItemsAdded = 0;
        let itemsUpdated = 0;

        for (let i = 1; i < lines.length; i++) {
          const row = lines[i].split(delimiter).map((val) => val.replace(/^["']|["']$/g, '').trim());
          if (row.length <= 1) continue;

          const name = row[nameIdx];
          if (!name) continue;

          const rawCategory = catIdx !== -1 && row[catIdx] ? row[catIdx].toLowerCase() : 'seragam';
          const category: 'seragam' | 'buku' = rawCategory.includes('buku') ? 'buku' : 'seragam';

          const rawLevel = levelIdx !== -1 && row[levelIdx] ? row[levelIdx].toUpperCase() : 'SEMUA';
          const level: SchoolLevel =
            rawLevel === 'TK' || rawLevel === 'SD' || rawLevel === 'SMP' || rawLevel === 'SMA'
              ? rawLevel
              : 'SEMUA';

          const priceKopkar = parsePrice(row[kopkarIdx]);
          const feeSchool = parsePrice(row[feeIdx]);
          const priceStudent =
            studentIdx !== -1 && row[studentIdx]
              ? parsePrice(row[studentIdx]) || priceKopkar + feeSchool
              : priceKopkar + feeSchool;

          // Cek apakah kode barang ada di Excel
          let inputCode = codeIdx !== -1 && row[codeIdx] ? row[codeIdx].trim() : '';

          // Jika kosong: automation generate kode unik
          if (!inputCode) {
            inputCode = generateProductCode(category, level, workingList, autoCodeCount);
            autoCodeCount++;
          }

          // Cek apakah barang sudah ada (berdasarkan kode ATAU nama + jenjang)
          const existingIndex = workingList.findIndex(
            (p) =>
              p.code.toLowerCase() === inputCode.toLowerCase() ||
              (p.name.toLowerCase() === name.toLowerCase() && p.level === level)
          );

          if (existingIndex >= 0) {
            // Update barang yang sudah ada, tetap pertahankan stok yang sudah terakumulasi
            const existing = workingList[existingIndex];
            workingList[existingIndex] = {
              ...existing,
              name,
              category,
              level,
              priceKopkar,
              feeSchool,
              priceStudent,
              // Jika ada perubahan harga, stok tetap aman & terakumulasi
            };
            itemsUpdated++;
          } else {
            // Tambah barang baru
            workingList.push({
              id: `PRD-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
              code: inputCode,
              name,
              category,
              level,
              priceKopkar,
              feeSchool,
              priceStudent,
              stock: 50, // Default stock fisik awal barang baru
              minStock: 20,
            });
            newItemsAdded++;
          }
        }

        return workingList;
      });

      return { success: true };
    } catch (err) {
      return { success: false, error: 'Gagal memproses file Excel: ' + String(err) };
    }
  }, []);

  // 1. Download Template
  const downloadTemplateCsv = useCallback(() => {
    const header = 'No.,Kode Barang,Nama Barang,Kategori,Jenjang,Harga Koperasi (HPP),Fee Sekolah,Harga Siswa\n';
    const sampleRows = [
      '1,SRG-TK-01,"Seragam Olahraga TK",seragam,TK,75000,15000,90000',
      '2,,"Buku Mewarnai TK",buku,TK,25000,5000,30000',
      '3,SRG-SD-01,"Seragam Pramuka SD",seragam,SD,85000,15000,100000',
      '4,,"Buku Bahasa Inggris SD",buku,SD,60000,10000,70000',
      '5,SRG-SMP-01,"Seragam Putih Biru SMP",seragam,SMP,105000,20000,125000',
      '6,,"Seragam Pramuka SMP",seragam,SMP,95000,15000,110000',
      '7,SRG-SMA-01,"Seragam Putih Abu SMA",seragam,SMA,115000,25000,140000',
      '8,,"Buku Fisika SMA Kelas 10",buku,SMA,85000,15000,100000',
    ].join('\n');
    const blob = new Blob([header + sampleRows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'Template_Master_Barang_Koperasi.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, []);

  // 2. Export current catalog
  const exportProductsCsv = useCallback(() => {
    const header = 'No.,Kode Barang,Nama Barang,Kategori,Jenjang,Harga Koperasi,Fee Sekolah,Harga Siswa\n';
    const rows = products
      .map((p, idx) =>
        `${idx + 1},${p.code},"${p.name.replace(/"/g, '""')}",${p.category},${p.level},${p.priceKopkar},${p.feeSchool},${p.priceStudent}`
      )
      .join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Katalog_Master_Barang_Koperasi_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [products]);

  return (
    <ProductContext.Provider
      value={{
        products,
        getProductsByLevel,
        addProduct,
        updateProduct,
        deleteProduct,
        adjustStock,
        setProductStock,
        restockProduct,
        importProductsFromCsv,
        downloadTemplateCsv,
        exportProductsCsv,
      }}
    >
      {children}
    </ProductContext.Provider>
  );
}

export function useProducts() {
  const context = useContext(ProductContext);
  if (!context) {
    throw new Error('useProducts must be used within a ProductProvider');
  }
  return context;
}
