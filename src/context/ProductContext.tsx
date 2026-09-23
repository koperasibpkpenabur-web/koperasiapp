import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import type { ProductItem, SchoolLevel } from '../types';
import { supabase } from '../lib/supabase';
import * as XLSX from 'xlsx';

interface ProductContextType {
  products: ProductItem[];
  getProductsByLevel: (level?: SchoolLevel) => ProductItem[];
  addProduct: (product: Omit<ProductItem, 'id'>) => Promise<{ success: boolean; error?: string }>;
  updateProduct: (id: string, product: Partial<ProductItem>) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;
  adjustStock: (id: string, delta: number) => Promise<void>;
  setProductStock: (id: string, newStock: number) => Promise<void>;
  restockProduct: (id: string, quantity: number) => Promise<void>;
  importProductsFromExcel: (buffer: ArrayBuffer) => Promise<{ success: boolean; count?: number; updatedCount?: number; error?: string }>;
  downloadTemplateCsv: () => void;
  exportProductsCsv: () => void;
}

const ProductContext = createContext<ProductContextType | null>(null);

// Generate code otomatis untuk barang yang tidak memiliki kode di Excel
function generateProductCode(
  category: 'seragam' | 'buku',
  level: SchoolLevel,
  existingProducts: ProductItem[],
  offsetIndex: number
): string {
  const prefix = (category === 'buku' ? 'BK' : 'SRG') + '-' + (level === 'SEMUA' ? 'GEN' : level);
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
  const [products, setProducts] = useState<ProductItem[]>([]);

  const fetchProducts = useCallback(async () => {
    const { data, error } = await supabase.from('products').select('*').order('code', { ascending: true });
    if (error) {
      console.error('Error fetching products:', error);
      return;
    }
    const mapped = data.map(d => ({
      id: d.id,
      code: d.code,
      name: d.name,
      category: d.category as any,
      level: d.level as any,
      priceKopkar: d.price_kopkar,
      feeSchool: d.fee_school,
      priceStudent: d.price_student,
      stock: d.stock,
      minStock: d.min_stock,
      size: d.size,
      storageLocation: d.storage_location
    }));
    setProducts(mapped);
  }, []);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const getProductsByLevel = useCallback(
    (level?: SchoolLevel) => {
      if (!level || level === 'SEMUA') return products;
      return products.filter((p) => p.level === level || p.level === 'SEMUA');
    },
    [products]
  );

  const addProduct = useCallback(async (productData: Omit<ProductItem, 'id'>) => {
    const newId = `PRD-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`;
    const newProduct = {
      id: newId,
      code: productData.code,
      name: productData.name,
      category: productData.category,
      level: productData.level,
      price_kopkar: productData.priceKopkar,
      fee_school: productData.feeSchool,
      price_student: productData.priceStudent || productData.priceKopkar + productData.feeSchool,
      stock: productData.stock !== undefined ? productData.stock : 50,
      min_stock: productData.minStock || 15,
      size: productData.size,
      storage_location: productData.storageLocation
    };

    const { error } = await supabase.from('products').insert([newProduct]);
    if (error) {
      console.error('Error adding product:', error);
      return { success: false, error: error.message };
    }
    await fetchProducts();
    return { success: true };
  }, [fetchProducts]);

  const updateProduct = useCallback(async (id: string, updated: Partial<ProductItem>) => {
    const p = products.find(prod => prod.id === id);
    if (!p) return;
    
    const priceKopkar = updated.priceKopkar !== undefined ? updated.priceKopkar : p.priceKopkar;
    const feeSchool = updated.feeSchool !== undefined ? updated.feeSchool : p.feeSchool;
    const priceStudent = updated.priceStudent !== undefined ? updated.priceStudent : priceKopkar + feeSchool;

    const updates: any = {
      price_kopkar: priceKopkar,
      fee_school: feeSchool,
      price_student: priceStudent,
    };
    if (updated.code !== undefined) updates.code = updated.code;
    if (updated.name !== undefined) updates.name = updated.name;
    if (updated.category !== undefined) updates.category = updated.category;
    if (updated.level !== undefined) updates.level = updated.level;
    if (updated.stock !== undefined) updates.stock = updated.stock;
    if (updated.minStock !== undefined) updates.min_stock = updated.minStock;
    if (updated.size !== undefined) updates.size = updated.size;
    if (updated.storageLocation !== undefined) updates.storage_location = updated.storageLocation;

    const { error } = await supabase.from('products').update(updates).eq('id', id);
    if (error) {
      console.error('Error updating product:', error);
      return;
    }
    await fetchProducts();
  }, [products, fetchProducts]);

  const deleteProduct = useCallback(async (id: string) => {
    const { error } = await supabase.from('products').delete().eq('id', id);
    if (error) {
      console.error('Error deleting product:', error);
      return;
    }
    await fetchProducts();
  }, [fetchProducts]);

  const adjustStock = useCallback(async (id: string, delta: number) => {
    const p = products.find(prod => prod.id === id);
    if (!p) return;
    const newStock = Math.max(0, (p.stock || 0) + delta);
    const { error } = await supabase.from('products').update({ stock: newStock }).eq('id', id);
    if (!error) await fetchProducts();
  }, [products, fetchProducts]);

  const setProductStock = useCallback(async (id: string, newStock: number) => {
    const { error } = await supabase.from('products').update({ stock: Math.max(0, newStock) }).eq('id', id);
    if (!error) await fetchProducts();
  }, [fetchProducts]);

  const restockProduct = useCallback(async (id: string, quantity: number) => {
    const p = products.find(prod => prod.id === id);
    if (!p) return;
    const newStock = (p.stock || 0) + Math.max(0, quantity);
    const { error } = await supabase.from('products').update({ stock: newStock }).eq('id', id);
    if (!error) await fetchProducts();
  }, [products, fetchProducts]);

  const importProductsFromExcel = useCallback(async (buffer: ArrayBuffer) => {
    try {
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
      
      if (data.length < 2) {
        return { success: false, error: 'File Excel tidak berisi data yang cukup (minimal 1 baris judul kolom dan 1 baris data)' };
      }

      const header = data[0].map((h: any) => String(h || '').trim().toLowerCase());

      const codeIdx = header.findIndex((h) => h.includes('kode') || h.includes('code'));
      const nameIdx = header.findIndex((h) => h.includes('nama') || h.includes('name') || h.includes('barang'));
      const catIdx = header.findIndex((h) => h.includes('kategori') || h.includes('category') || h.includes('jenis'));
      const levelIdx = header.findIndex((h) => h.includes('jenjang') || h.includes('level'));
      const kopkarIdx = header.findIndex((h) => h.includes('kopkar') || h.includes('koperasi') || h.includes('modal') || h.includes('hpp'));
      const feeIdx = header.findIndex((h) => h.includes('fee') || h.includes('sekolah') || h.includes('komisi'));
      const studentIdx = header.findIndex((h) => h.includes('siswa') || h.includes('jual') || h.includes('student'));

      const sizeIdx = header.findIndex((h) => h.includes('ukuran'));
      const stockIdx = header.findIndex((h) => h.includes('stock') || h.includes('stok'));
      const locationIdx = header.findIndex((h) => h.includes('lokasi') || h.includes('penyimpanan'));

      if (nameIdx === -1 || kopkarIdx === -1 || feeIdx === -1) {
        return {
          success: false,
          error: 'Format kolom tidak sesuai! Kolom wajib: Nama Barang, Harga Koperasi, Fee Sekolah.',
        };
      }

      const parsePrice = (val: any) => {
        if (!val) return 0;
        if (typeof val === 'number') return val;
        const clean = String(val).replace(/[^\d]/g, '');
        return parseInt(clean, 10) || 0;
      };

      const itemsToUpsert = [];
      let autoCodeCount = 0;
      let newItemsAdded = 0;
      let itemsUpdated = 0;

      for (let i = 1; i < data.length; i++) {
        const row = data[i];
        if (!row || row.length === 0) continue;

        const name = row[nameIdx] ? String(row[nameIdx]).trim() : '';
        if (!name) continue;

        const rawCategory = catIdx !== -1 && row[catIdx] ? String(row[catIdx]).toLowerCase() : 'seragam';
        const category = rawCategory.includes('buku') ? 'buku' : 'seragam';

        const rawLevel = levelIdx !== -1 && row[levelIdx] ? String(row[levelIdx]).toUpperCase() : 'SEMUA';
        const level = rawLevel === 'TK' || rawLevel === 'SD' || rawLevel === 'SMP' || rawLevel === 'SMA' ? rawLevel : 'SEMUA';

        const priceKopkar = parsePrice(row[kopkarIdx]);
        const feeSchool = parsePrice(row[feeIdx]);
        const priceStudent = studentIdx !== -1 && row[studentIdx] ? parsePrice(row[studentIdx]) || priceKopkar + feeSchool : priceKopkar + feeSchool;

        let inputCode = codeIdx !== -1 && row[codeIdx] ? String(row[codeIdx]).trim() : '';
        const size = sizeIdx !== -1 && row[sizeIdx] ? String(row[sizeIdx]).trim() : undefined;
        const stock = stockIdx !== -1 && row[stockIdx] ? parseInt(String(row[stockIdx]), 10) || 50 : 50;
        const storageLocation = locationIdx !== -1 && row[locationIdx] ? String(row[locationIdx]).trim() : undefined;

        if (!inputCode) {
          inputCode = generateProductCode(category, level, products, autoCodeCount);
          autoCodeCount++;
        }

        const existing = products.find(
          (p) =>
            p.code.toLowerCase() === inputCode.toLowerCase() ||
            (p.name.toLowerCase() === name.toLowerCase() && p.level === level)
        );

        if (existing) {
          itemsToUpsert.push({
            id: existing.id,
            code: existing.code,
            name,
            category,
            level,
            price_kopkar: priceKopkar,
            fee_school: feeSchool,
            price_student: priceStudent,
            size,
            storage_location: storageLocation,
            stock: existing.stock, // keep existing stock
            min_stock: existing.minStock
          });
          itemsUpdated++;
        } else {
          itemsToUpsert.push({
            id: `PRD-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            code: inputCode,
            name,
            category,
            level,
            price_kopkar: priceKopkar,
            fee_school: feeSchool,
            price_student: priceStudent,
            stock: stock,
            min_stock: 20,
            size,
            storage_location: storageLocation,
          });
          newItemsAdded++;
        }
      }

      if (itemsToUpsert.length > 0) {
        const { error } = await supabase.from('products').upsert(itemsToUpsert);
        if (error) {
          console.error('Error upserting products:', error);
          return { success: false, error: 'Database error: ' + error.message };
        }
        await fetchProducts();
      }

      return { success: true, count: newItemsAdded + itemsUpdated, updatedCount: itemsUpdated };
    } catch (err) {
      return { success: false, error: 'Gagal memproses file Excel: ' + String(err) };
    }
  }, [products, fetchProducts]);

  const downloadTemplateCsv = useCallback(() => {
    const data = [
      { No: 1, 'Kode Barang': 'SRG-TK-01', 'Nama Barang': 'Seragam Olahraga TK', Ukuran: 'M', Kategori: 'seragam', Jenjang: 'TK', 'Harga Koperasi': 75000, 'Fee Sekolah': 15000, 'Harga Siswa': 90000, Stock: 50, 'Lokasi Penyimpanan': 'Gudang A' },
      { No: 2, 'Kode Barang': '', 'Nama Barang': 'Buku Mewarnai TK', Ukuran: '', Kategori: 'buku', Jenjang: 'TK', 'Harga Koperasi': 25000, 'Fee Sekolah': 5000, 'Harga Siswa': 30000, Stock: 100, 'Lokasi Penyimpanan': 'Rak 1' },
      { No: 3, 'Kode Barang': 'SRG-SD-01', 'Nama Barang': 'Seragam Pramuka SD', Ukuran: 'L', Kategori: 'seragam', Jenjang: 'SD', 'Harga Koperasi': 85000, 'Fee Sekolah': 15000, 'Harga Siswa': 100000, Stock: 75, 'Lokasi Penyimpanan': 'Gudang A' },
      { No: 4, 'Kode Barang': '', 'Nama Barang': 'Buku Bahasa Inggris SD', Ukuran: '', Kategori: 'buku', Jenjang: 'SD', 'Harga Koperasi': 60000, 'Fee Sekolah': 10000, 'Harga Siswa': 70000, Stock: 40, 'Lokasi Penyimpanan': 'Rak 2' },
      { No: 5, 'Kode Barang': 'SRG-SMP-01', 'Nama Barang': 'Seragam Putih Biru SMP', Ukuran: 'XL', Kategori: 'seragam', Jenjang: 'SMP', 'Harga Koperasi': 105000, 'Fee Sekolah': 20000, 'Harga Siswa': 125000, Stock: 60, 'Lokasi Penyimpanan': 'Gudang B' },
      { No: 6, 'Kode Barang': '', 'Nama Barang': 'Seragam Pramuka SMP', Ukuran: 'M', Kategori: 'seragam', Jenjang: 'SMP', 'Harga Koperasi': 95000, 'Fee Sekolah': 15000, 'Harga Siswa': 110000, Stock: 55, 'Lokasi Penyimpanan': 'Gudang B' },
      { No: 7, 'Kode Barang': 'SRG-SMA-01', 'Nama Barang': 'Seragam Putih Abu SMA', Ukuran: 'L', Kategori: 'seragam', Jenjang: 'SMA', 'Harga Koperasi': 115000, 'Fee Sekolah': 25000, 'Harga Siswa': 140000, Stock: 45, 'Lokasi Penyimpanan': 'Gudang C' },
      { No: 8, 'Kode Barang': '', 'Nama Barang': 'Buku Fisika SMA Kelas 10', Ukuran: '', Kategori: 'buku', Jenjang: 'SMA', 'Harga Koperasi': 85000, 'Fee Sekolah': 15000, 'Harga Siswa': 100000, Stock: 30, 'Lokasi Penyimpanan': 'Rak 3' },
    ];
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Template');
    XLSX.writeFile(workbook, 'Template_Master_Barang_Koperasi.xlsx');
  }, []);

  const exportProductsCsv = useCallback(() => {
    const data = products.map((p, idx) => ({
      No: idx + 1,
      'Kode Barang': p.code,
      'Nama Barang': p.name,
      Ukuran: p.size || '',
      Kategori: p.category,
      Jenjang: p.level,
      'Harga Koperasi': p.priceKopkar,
      'Fee Sekolah': p.feeSchool,
      'Harga Siswa': p.priceStudent,
      Stock: p.stock,
      'Lokasi Penyimpanan': p.storageLocation || ''
    }));
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Katalog');
    XLSX.writeFile(workbook, `Katalog_Master_Barang_Koperasi_${new Date().toISOString().slice(0, 10)}.xlsx`);
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
        importProductsFromExcel,
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
