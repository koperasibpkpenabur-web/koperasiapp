import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import type { ProductItem, SchoolLevel } from '../types';
import { supabase } from '../lib/supabase';
import { resolveItemUnit } from '../utils/formatUnit';
import { fetchAllSupabasePaged } from '../utils/supabasePagination';
import { getWibDateString } from '../utils/dateWib';
import * as XLSX from 'xlsx';

interface ProductContextType {
  products: ProductItem[];
  getProductsByLevel: (level?: SchoolLevel) => ProductItem[];
  addProduct: (product: Omit<ProductItem, 'id'>) => Promise<{ success: boolean; error?: string }>;
  updateProduct: (id: string, product: Partial<ProductItem>) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;
  deleteAllProducts: () => Promise<{ success: boolean; error?: string }>;
  resetAllStock: (ids?: string[]) => Promise<{ success: boolean; error?: string }>;
  adjustStock: (id: string, delta: number) => Promise<void>;
  setProductStock: (id: string, newStock: number, newStockVendor?: number) => Promise<void>;
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
    try {
      const { data: allData, error } = await fetchAllSupabasePaged((from, to) =>
        supabase
          .from('products')
          .select('*')
          .order('code', { ascending: true })
          .range(from, to)
      );

      if (error) {
        console.error('Error fetching products:', error);
        return;
      }

      const mapped = allData.map(d => ({
        id: d.id,
        code: d.code,
        name: d.name,
        category: d.category as any,
        level: d.level as any,
        priceKopkar: d.price_kopkar,
        feeSchool: d.fee_school,
        priceStudent: d.price_student,
        stock: d.stock,
        stockRusak: d.stock_rusak || 0,
        stockVendor: d.stock_vendor || 0,
        minStock: d.min_stock,
        size: d.size,
        unit: d.unit || resolveItemUnit({ name: d.name, category: d.category }),
        storageLocation: d.storage_location,
        supplierName: d.supplier_name,
        schoolName: d.school_name,
        imageUrl: d.image_url,
        description: d.description,
        variantGroup: d.variant_group,
        isKanvasActive: Boolean(d.is_kanvas_active)
      }));
      mapped.sort((a, b) => (a.code || '').localeCompare(b.code || '', 'id', { numeric: true, sensitivity: 'base' }));
      setProducts(mapped);
    } catch (err) {
      console.error('Exception in fetchProducts:', err);
    }
  }, []);

  useEffect(() => {
    fetchProducts();

    // Realtime subscription for products (stock, price, catalog updates)
    const channel = supabase
      .channel('products_realtime_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'products' },
        () => {
          fetchProducts();
        }
      )
      .subscribe();

    const handleFocus = () => {
      fetchProducts();
    };
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleFocus);

    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleFocus);
    };
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
    const newProduct: Record<string, any> = {
      id: newId,
      code: productData.code,
      name: productData.name,
      category: productData.category,
      level: productData.level,
      price_kopkar: productData.priceKopkar,
      fee_school: productData.feeSchool,
      price_student: productData.priceStudent || productData.priceKopkar + productData.feeSchool,
      stock: productData.stock !== undefined ? productData.stock : 50,
      stock_vendor: productData.stockVendor !== undefined ? productData.stockVendor : 0,
      min_stock: productData.minStock || 15,
      size: productData.size,
      unit: productData.unit || resolveItemUnit({ name: productData.name, category: productData.category }),
      storage_location: productData.storageLocation,
      supplier_name: productData.supplierName,
      school_name: productData.schoolName
    };
    if (productData.imageUrl !== undefined) newProduct.image_url = productData.imageUrl;
    if (productData.description !== undefined) newProduct.description = productData.description;
    if (productData.variantGroup !== undefined) newProduct.variant_group = productData.variantGroup;
    if (productData.isKanvasActive !== undefined) newProduct.is_kanvas_active = productData.isKanvasActive;

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
    if (updated.stockVendor !== undefined) updates.stock_vendor = updated.stockVendor;
    if (updated.stockRusak !== undefined) updates.stock_rusak = updated.stockRusak;
    if (updated.minStock !== undefined) updates.min_stock = updated.minStock;
    if (updated.size !== undefined) updates.size = updated.size;
    if (updated.unit !== undefined) updates.unit = updated.unit;
    if (updated.storageLocation !== undefined) updates.storage_location = updated.storageLocation;
    if (updated.supplierName !== undefined) updates.supplier_name = updated.supplierName;
    if (updated.schoolName !== undefined) updates.school_name = updated.schoolName;
    if (updated.imageUrl !== undefined) updates.image_url = updated.imageUrl;
    if (updated.description !== undefined) updates.description = updated.description;
    if (updated.variantGroup !== undefined) updates.variant_group = updated.variantGroup;
    if (updated.isKanvasActive !== undefined) updates.is_kanvas_active = updated.isKanvasActive;

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

  const deleteAllProducts = useCallback(async () => {
    const { error } = await supabase.from('products').delete().neq('id', 'PLACEHOLDER_NEVER_MATCH');
    if (error) {
      console.error('Error deleting all products:', error);
      return { success: false, error: error.message };
    }
    await fetchProducts();
    return { success: true };
  }, [fetchProducts]);

  const resetAllStock = useCallback(async (ids?: string[]) => {
    let query = supabase.from('products').update({ stock: 0, stock_vendor: 0 });
    if (ids && ids.length > 0) {
      query = query.in('id', ids);
    } else {
      query = query.neq('id', 'PLACEHOLDER_NEVER_MATCH');
    }
    const { error } = await query;
    if (error) {
      console.error('Error resetting stock:', error);
      return { success: false, error: error.message };
    }
    await fetchProducts();
    return { success: true };
  }, [fetchProducts]);

  const adjustStock = useCallback(async (id: string, delta: number) => {
    const { data, error } = await supabase.rpc('adjust_product_stock_atomic', {
      p_product_id: id,
      p_delta: delta,
      p_ref_type: 'manual_adjust',
      p_notes: delta >= 0 ? 'Penambahan stok manual' : 'Pengurangan stok manual'
    });

    if (error) {
      if (error.code === 'PGRST202') {
        const p = products.find(prod => prod.id === id);
        if (!p) return;
        const newStock = Math.max(0, (p.stock || 0) + delta);
        const { error: upErr } = await supabase.from('products').update({ stock: newStock }).eq('id', id);
        if (!upErr) await fetchProducts();
        return;
      }
      console.error('Error adjusting stock atomically:', error);
      return;
    }

    if (data?.success) {
      await fetchProducts();
    } else if (data?.error) {
      console.error('Error adjusting stock:', data.error);
    }
  }, [products, fetchProducts]);

  const setProductStock = useCallback(async (id: string, newStock: number, newStockVendor?: number) => {
    const updates: any = { stock: Math.max(0, newStock) };
    if (newStockVendor !== undefined) {
      updates.stock_vendor = Math.max(0, newStockVendor);
    }
    const { error } = await supabase.from('products').update(updates).eq('id', id);
    if (!error) await fetchProducts();
  }, [fetchProducts]);

  const restockProduct = useCallback(async (id: string, quantity: number) => {
    const safeQty = Math.max(0, quantity);
    if (safeQty === 0) return;

    const { data, error } = await supabase.rpc('adjust_product_stock_atomic', {
      p_product_id: id,
      p_delta: safeQty,
      p_ref_type: 'restock',
      p_notes: 'Restock barang masuk gudang'
    });

    if (error) {
      if (error.code === 'PGRST202') {
        const p = products.find(prod => prod.id === id);
        if (!p) return;
        const newStock = (p.stock || 0) + safeQty;
        const { error: upErr } = await supabase.from('products').update({ stock: newStock }).eq('id', id);
        if (!upErr) await fetchProducts();
        return;
      }
      console.error('Error restocking product atomically:', error);
      return;
    }

    if (data?.success) {
      await fetchProducts();
    } else if (data?.error) {
      console.error('Error restocking product:', data.error);
    }
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

      // Detect columns with priority ordering to avoid collisions
      // 'Kode Barang' must be found before 'Nama Barang' check uses 'barang'
      const codeIdx = header.findIndex((h) => h.includes('kode'));
      // 'Nama Barang' — prefer exact 'nama barang' first, then fallback
      const nameIdx = (() => {
        const exact = header.findIndex((h) => h.includes('nama barang') || h === 'nama');
        if (exact !== -1) return exact;
        // fallback: column that has 'nama' but NOT 'sekolah'
        return header.findIndex((h) => h.includes('nama') && !h.includes('sekolah'));
      })();
      const catIdx = header.findIndex((h) => h.includes('kategori') || h.includes('category') || h.includes('jenis'));
      const levelIdx = header.findIndex((h) => h.includes('jenjang') || h.includes('level'));
      // 'Harga Koperasi' — must NOT include 'siswa'
      const kopkarIdx = header.findIndex((h) => (h.includes('kopkar') || h.includes('koperasi') || h.includes('modal') || h.includes('hpp')) && !h.includes('siswa'));
      // 'Fee Sekolah' — prefer column that has 'fee', then 'komisi', avoid 'nama sekolah'
      const feeIdx = (() => {
        const feeCol = header.findIndex((h) => h.includes('fee'));
        if (feeCol !== -1) return feeCol;
        return header.findIndex((h) => h.includes('komisi'));
      })();
      const studentIdx = header.findIndex((h) => h.includes('siswa') || h.includes('jual') || h.includes('student'));

      const sizeIdx = header.findIndex((h) => h.includes('ukuran'));
      const unitIdx = header.findIndex((h) => h.includes('satuan') || h.includes('unit'));
      const stockIdx = header.findIndex((h) => h.includes('stock gudang') || h.includes('stok gudang') || h === 'stock' || h === 'stok');
      const locationIdx = header.findIndex((h) => h.includes('lokasi') || h.includes('penyimpanan'));
      const supplierIdx = header.findIndex((h) => h.includes('supplier') || h.includes('penjahit'));
      // 'Nama Sekolah' column — must have 'sekolah' but NOT 'fee'
      const schoolIdx = header.findIndex((h) => h.includes('sekolah') && !h.includes('fee'));

      if (nameIdx === -1 || kopkarIdx === -1 || feeIdx === -1) {
        return {
          success: false,
          error: `Format kolom tidak sesuai! Kolom wajib: Nama Barang, Harga Koperasi, Fee Sekolah. (Terdeteksi: nama=${nameIdx}, kopkar=${kopkarIdx}, fee=${feeIdx})`,
        };
      }

      const parsePrice = (val: any) => {
        if (!val) return 0;
        if (typeof val === 'number') return val;
        const clean = String(val).replace(/[^\d]/g, '');
        return parseInt(clean, 10) || 0;
      };

      const upsertMap = new Map<string, any>();
      const workingCatalog: ProductItem[] = [...products];
      let autoCodeCount = 0;
      let newItemsAdded = 0;
      let itemsUpdated = 0;

      const norm = (val?: string) => (val || '').trim().toLowerCase();

      for (let i = 1; i < data.length; i++) {
        const row = data[i];
        if (!row || row.length === 0) continue;

        const name = row[nameIdx] ? String(row[nameIdx]).trim() : '';
        if (!name) continue;

        const rawCategory = catIdx !== -1 && row[catIdx] ? String(row[catIdx]).toLowerCase() : 'seragam';
        const category = rawCategory.includes('buku') ? 'buku' : 'seragam';

        const rawLevel = levelIdx !== -1 && row[levelIdx] ? String(row[levelIdx]).trim().toUpperCase() : 'SEMUA';
        const validLevels = ['TK', 'SD', 'SMP', 'SMA', 'SPK-SD', 'SPK-SMP', 'SPK-SMA', 'SEMUA'];
        const level = (validLevels.includes(rawLevel) ? rawLevel : 'SEMUA') as any;

        const priceKopkar = parsePrice(row[kopkarIdx]);
        const feeSchool = parsePrice(row[feeIdx]);
        const priceStudent = studentIdx !== -1 && row[studentIdx] ? parsePrice(row[studentIdx]) || priceKopkar + feeSchool : priceKopkar + feeSchool;

        let inputCode = codeIdx !== -1 && row[codeIdx] ? String(row[codeIdx]).trim() : '';
        const size = sizeIdx !== -1 && row[sizeIdx] ? String(row[sizeIdx]).trim() : undefined;
        const unit = unitIdx !== -1 && row[unitIdx] ? String(row[unitIdx]).trim() : resolveItemUnit({ name, category });
        const stock = stockIdx !== -1 && row[stockIdx] !== undefined && row[stockIdx] !== '' ? parseInt(String(row[stockIdx]), 10) || 0 : 0;
        const storageLocation = locationIdx !== -1 && row[locationIdx] ? String(row[locationIdx]).trim() : undefined;
        const supplierName = supplierIdx !== -1 && row[supplierIdx] ? String(row[supplierIdx]).trim() : undefined;
        const schoolName = schoolIdx !== -1 && row[schoolIdx] ? String(row[schoolIdx]).trim() : undefined;

        if (!inputCode) {
          inputCode = generateProductCode(category, level, workingCatalog, autoCodeCount);
          autoCodeCount++;
        }

        // Pencocokan SKU unik komposit: Nama Barang + Jenjang + Ukuran + Sekolah (aman untuk model dengan code yang sama lintas ukuran).
        // Fallback ke Kode Barang hanya jika Jenjang + Ukuran + Sekolah juga sama agar varian S/M/L tidak saling menimpa.
        const existing =
          workingCatalog.find(
            (p) =>
              norm(p.name) === norm(name) &&
              p.level === level &&
              norm(p.size) === norm(size) &&
              norm(p.schoolName) === norm(schoolName)
          ) ||
          workingCatalog.find(
            (p) =>
              inputCode &&
              norm(p.code) === norm(inputCode) &&
              p.level === level &&
              norm(p.size) === norm(size) &&
              norm(p.schoolName) === norm(schoolName)
          );

        if (existing) {
          const alreadyInBatch = upsertMap.has(existing.id);
          upsertMap.set(existing.id, {
            id: existing.id,
            code: inputCode || existing.code,
            name,
            category,
            level,
            price_kopkar: priceKopkar,
            fee_school: feeSchool,
            price_student: priceStudent,
            size,
            unit: unit || existing.unit || resolveItemUnit({ name, category }),
            storage_location: storageLocation,
            supplier_name: supplierName,
            school_name: schoolName,
            stock: stockIdx !== -1 && row[stockIdx] !== undefined && row[stockIdx] !== '' ? stock : existing.stock,
            stock_vendor: existing.stockVendor || 0,
            stock_rusak: existing.stockRusak || 0,
            min_stock: existing.minStock,
            image_url: existing.imageUrl ?? null,
            description: existing.description ?? null,
            variant_group: existing.variantGroup ?? null,
            is_kanvas_active: existing.isKanvasActive ?? false
          });
          if (!alreadyInBatch) itemsUpdated++;
        } else {
          const newId = `PRD-${Date.now()}-${i}-${Math.random().toString(36).substring(2, 6)}`;
          const newRow = {
            id: newId,
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
            unit: unit || resolveItemUnit({ name, category }),
            storage_location: storageLocation,
            supplier_name: supplierName,
            school_name: schoolName,
          };
          upsertMap.set(newId, newRow);
          workingCatalog.push({
            id: newId,
            code: inputCode,
            name,
            category,
            level,
            priceKopkar,
            feeSchool,
            priceStudent,
            stock,
            minStock: 20,
            size,
            unit: unit || resolveItemUnit({ name, category }),
            storageLocation,
            supplierName,
            schoolName
          });
          newItemsAdded++;
        }
      }

      const itemsToUpsert = Array.from(upsertMap.values());
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
      { No: 1, 'Kode Barang': 'SRG-TK-01', 'Nama Barang': 'Seragam Olahraga TK', Ukuran: 'M', Satuan: 'pcs', Kategori: 'seragam', Jenjang: 'TK', 'Harga Koperasi': 75000, 'Fee Sekolah': 15000, 'Harga Siswa': 90000, 'Stock Gudang': 50, 'Lokasi Penyimpanan': 'Gudang A', Supplier: 'Andryna', Sekolah: '' },
      { No: 2, 'Kode Barang': '', 'Nama Barang': 'Buku Mewarnai TK', Ukuran: '', Satuan: 'pack', Kategori: 'buku', Jenjang: 'TK', 'Harga Koperasi': 25000, 'Fee Sekolah': 5000, 'Harga Siswa': 30000, 'Stock Gudang': 100, 'Lokasi Penyimpanan': 'Rak 1', Supplier: '', Sekolah: '' },
      { No: 3, 'Kode Barang': 'SRG-SD-01', 'Nama Barang': 'Kaos Kaki Putih SD', Ukuran: 'L', Satuan: 'psg', Kategori: 'seragam', Jenjang: 'SD', 'Harga Koperasi': 15000, 'Fee Sekolah': 5000, 'Harga Siswa': 20000, 'Stock Gudang': 75, 'Lokasi Penyimpanan': 'Gudang A', Supplier: 'Berkat', Sekolah: '' },
      { No: 4, 'Kode Barang': '', 'Nama Barang': 'Buku Tulis Garis SD', Ukuran: '', Satuan: 'pack', Kategori: 'buku', Jenjang: 'SD', 'Harga Koperasi': 35000, 'Fee Sekolah': 5000, 'Harga Siswa': 40000, 'Stock Gudang': 40, 'Lokasi Penyimpanan': 'Rak 2', Supplier: '', Sekolah: '' },
      { No: 5, 'Kode Barang': 'SRG-SMP-01', 'Nama Barang': 'Seragam Putih Biru SMP', Ukuran: 'XL', Satuan: 'pcs', Kategori: 'seragam', Jenjang: 'SMP', 'Harga Koperasi': 105000, 'Fee Sekolah': 20000, 'Harga Siswa': 125000, 'Stock Gudang': 60, 'Lokasi Penyimpanan': 'Gudang B', Supplier: 'Harmoni', Sekolah: '' },
      { No: 6, 'Kode Barang': '', 'Nama Barang': 'Sepatu Kets Hitam SMP', Ukuran: '39', Satuan: 'psg', Kategori: 'seragam', Jenjang: 'SMP', 'Harga Koperasi': 120000, 'Fee Sekolah': 15000, 'Harga Siswa': 135000, 'Stock Gudang': 55, 'Lokasi Penyimpanan': 'Gudang B', Supplier: 'Jemima', Sekolah: '' },
      { No: 7, 'Kode Barang': 'SRG-SMA-01', 'Nama Barang': 'Seragam Putih Abu SMA', Ukuran: 'L', Satuan: 'pcs', Kategori: 'seragam', Jenjang: 'SMA', 'Harga Koperasi': 115000, 'Fee Sekolah': 25000, 'Harga Siswa': 140000, 'Stock Gudang': 45, 'Lokasi Penyimpanan': 'Gudang C', Supplier: 'Loki', Sekolah: 'SMAK 1 PENABUR' },
      { No: 8, 'Kode Barang': '', 'Nama Barang': 'Buku Fisika SMA Kelas 10', Ukuran: '', Satuan: 'pack', Kategori: 'buku', Jenjang: 'SMA', 'Harga Koperasi': 85000, 'Fee Sekolah': 15000, 'Harga Siswa': 100000, 'Stock Gudang': 30, 'Lokasi Penyimpanan': 'Rak 3', Supplier: '', Sekolah: '' },
    ];
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Template');
    XLSX.writeFile(workbook, 'Template_Master_Barang_Koperasi.xlsx');
  }, []);

  const exportProductsCsv = useCallback(() => {
    const LEVEL_RANK: Record<string, number> = {
      'TK': 1,
      'SD': 2,
      'SMP': 3,
      'SMA': 4,
      'SPK-SD': 5,
      'SPK-SMP': 6,
      'SPK-SMA': 7,
      'SEMUA': 8
    };

    const LETTER_SIZE_ORDER = [
      'SS', 'XS', 'S', 'M', 'L',
      'XL', 'XXL', '2XL', '2L',
      '3XL', '3L', '4XL', '4L',
      '5XL', '5L', '6XL', '6L',
      '7XL', '7L', '8XL', '8L',
      '9XL', '9L', '10XL', '10L',
      'KHUSUS', 'CUSTOM'
    ];

    const compareSize = (a?: string, b?: string): number => {
      const sA = (a || '').trim().toUpperCase();
      const sB = (b || '').trim().toUpperCase();

      if (sA === sB) return 0;
      if (!sA || sA === 'ALL SIZE' || sA === 'SEMUA UKURAN') return -1;
      if (!sB || sB === 'ALL SIZE' || sB === 'SEMUA UKURAN') return 1;

      // Cek apakah angka numerik (misal '28', '29', '1', '2')
      const numA = Number(sA);
      const numB = Number(sB);
      const isNumA = !isNaN(numA) && !isNaN(parseFloat(sA)) && String(numA) === sA;
      const isNumB = !isNaN(numB) && !isNaN(parseFloat(sB)) && String(numB) === sB;

      if (isNumA && isNumB) {
        return numA - numB;
      }
      if (isNumA) return -1;
      if (isNumB) return 1;

      // Keduanya berupa teks / huruf
      const idxA = LETTER_SIZE_ORDER.indexOf(sA);
      const idxB = LETTER_SIZE_ORDER.indexOf(sB);

      if (idxA !== -1 && idxB !== -1) {
        return idxA - idxB;
      }
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;

      return sA.localeCompare(sB, undefined, { numeric: true });
    };

    // Tentukan kode barang pertama untuk setiap kelompok nama barang agar urutan kelompok stabil
    const nameFirstCodeMap = new Map<string, string>();
    products.forEach((p) => {
      const currentMin = nameFirstCodeMap.get(p.name);
      if (!currentMin || (p.code && p.code.localeCompare(currentMin, 'id', { numeric: true }) < 0)) {
        nameFirstCodeMap.set(p.name, p.code || '');
      }
    });

    const sortedProducts = [...products].sort((a, b) => {
      // 1. Kunci Utama: Tingkatan Jenjang
      const rankA = LEVEL_RANK[a.level] || 99;
      const rankB = LEVEL_RANK[b.level] || 99;
      if (rankA !== rankB) {
        return rankA - rankB;
      }

      // 2. Kunci Kedua: Kelompok Nama Barang
      if (a.name !== b.name) {
        const codeA = nameFirstCodeMap.get(a.name) || a.code || '';
        const codeB = nameFirstCodeMap.get(b.name) || b.code || '';
        const codeCompare = codeA.localeCompare(codeB, 'id', { numeric: true, sensitivity: 'base' });
        if (codeCompare !== 0) return codeCompare;
        return a.name.localeCompare(b.name, 'id', { numeric: true, sensitivity: 'base' });
      }

      // 3. Kunci Ketiga: Urutan Ukuran (Size)
      return compareSize(a.size, b.size);
    });

    const data = sortedProducts.map((p, idx) => ({
      No: idx + 1,
      'Kode Barang': p.code,
      'Nama Barang': p.name,
      Ukuran: p.size || '',
      Satuan: p.unit || resolveItemUnit(p),
      Kategori: p.category,
      Jenjang: p.level,
      'Harga Koperasi': p.priceKopkar,
      'Fee Sekolah': p.feeSchool,
      'Harga Siswa': p.priceStudent,
      'Stock Gudang': p.stock,
      'Lokasi Penyimpanan': p.storageLocation || '',
      Supplier: p.supplierName || '',
      Sekolah: p.schoolName || ''
    }));
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Katalog');
    XLSX.writeFile(workbook, `Katalog_Master_Barang_Koperasi_${getWibDateString()}.xlsx`);
  }, [products]);

  return (
    <ProductContext.Provider
      value={{
        products,
        getProductsByLevel,
        addProduct,
        updateProduct,
        deleteProduct,
        deleteAllProducts,
        resetAllStock,
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
