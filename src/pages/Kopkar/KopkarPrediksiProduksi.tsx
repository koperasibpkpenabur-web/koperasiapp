import React, { useState, useEffect, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '../../lib/supabase';

export interface ForecastItem {
  id: string;
  level: string; // TK, SD, SMP, SMA, SPK-SD, dll.
  uniformName: string; // e.g. Kemeja Putih, Celana Merah, dll.
  sizes: Record<string, number>; // e.g. { SS: 500, S: 750, M: 1250, ... }
  total: number;
  schoolBreakdown?: Record<string, Record<string, number>>; // schoolName -> { size: qty }
}

export interface VendorAllocatedItem {
  level: string;
  uniformName: string;
  sizes: Record<string, number>;
  total: number;
  sharePercentage: number;
  schoolCount: number;
  totalSchoolsInLevel: number;
}

export interface VendorAllocation {
  vendorId: string;
  vendorName: string;
  contactPerson: string;
  phone: string;
  schoolNames: string[];
  items: VendorAllocatedItem[];
  grandTotalPcs: number;
}

interface Props {
  vendors: Array<{ id: string; name: string; contact_person?: string; phone?: string; address?: string }>;
  plottings: Array<{
    id: string;
    vendor_id: string;
    school_user_id: string;
    clothing_type?: string;
    vendors?: { name: string; contact_person?: string; phone?: string };
    app_users?: { school_name: string; username?: string; school_level?: string };
  }>;
  schools: Array<{ id: string; school_name: string; level: string; email?: string }>;
  products: Array<{ id: string; name: string; level: string; category?: string; size?: string }>;
}

// Standar urutan ukuran umum untuk penyusunan kolom
const STANDARD_SIZE_ORDER = [
  'SS', 'S', 'M', 'L', 'XL', '2L', '3L', '4L', '5L', '6L', '7L', '8L', '9L', '10L',
  '25', '26', '27', '28', '29', '30', '31', '32', '33', '34', '35', '36', '37', '38', '39', '40', '41', '42', '43', '44', '45',
  'ALL SIZE', 'KHUSUS'
];

export const KopkarPrediksiProduksi: React.FC<Props> = ({
  vendors,
  plottings,
  schools,
  products,
}) => {
  const [targetYear, setTargetYear] = useState('2027/2028');
  const [forecastItems, setForecastItems] = useState<ForecastItem[]>([]);
  const [activeSubTab, setActiveSubTab] = useState<'input' | 'allocation'>('input');
  const [selectedVendorFilter, setSelectedVendorFilter] = useState('ALL');
  const [selectedLevelFilter, setSelectedLevelFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load data awal dari Supabase (app_settings) atau localStorage
  useEffect(() => {
    loadSavedForecast();
  }, [targetYear]);

  const loadSavedForecast = async () => {
    setLoading(true);
    try {
      const storageKey = `production_forecast_${targetYear.replace(/[^a-zA-Z0-9]/g, '_')}`;
      const { data, error } = await supabase
        .from('app_settings')
        .select('*')
        .eq('key', storageKey)
        .single();

      if (!error && data?.value) {
        try {
          const parsed = JSON.parse(data.value);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setForecastItems(parsed);
            setLoading(false);
            return;
          }
        } catch (e) {
          console.error('Error parsing forecast json from DB:', e);
        }
      }

      // Fallback ke localStorage
      const local = localStorage.getItem(storageKey);
      if (local) {
        try {
          const parsedLocal = JSON.parse(local);
          if (Array.isArray(parsedLocal) && parsedLocal.length > 0) {
            setForecastItems(parsedLocal);
          }
        } catch (e) {
          console.error('Error parsing forecast json from local:', e);
        }
      }
    } catch (err) {
      console.error('Error loading forecast:', err);
    } finally {
      setLoading(false);
    }
  };

  // Simpan data forecast ke Supabase & localStorage
  const handleSaveForecast = async (itemsToSave = forecastItems) => {
    try {
      const storageKey = `production_forecast_${targetYear.replace(/[^a-zA-Z0-9]/g, '_')}`;
      const valueStr = JSON.stringify(itemsToSave);

      // Simpan di localStorage
      localStorage.setItem(storageKey, valueStr);

      // Simpan di Supabase app_settings
      await supabase.from('app_settings').upsert({
        key: storageKey,
        value: valueStr,
      });

      setSaveSuccessMessage('✅ Data rencana produksi berhasil disimpan ke database!');
      setTimeout(() => setSaveSuccessMessage(null), 4000);
    } catch (err) {
      console.error('Gagal menyimpan forecast:', err);
      alert('Gagal menyimpan data rencana produksi.');
    }
  };

  // Daftar ukuran aktif yang terdeteksi di forecast
  const detectedSizes = useMemo(() => {
    const sizeSet = new Set<string>();
    forecastItems.forEach((item) => {
      Object.keys(item.sizes).forEach((s) => sizeSet.add(s));
    });

    // Urutkan berdasarkan STANDARD_SIZE_ORDER, sisa ukuran ditaruh di akhir
    return Array.from(sizeSet).sort((a, b) => {
      const idxA = STANDARD_SIZE_ORDER.indexOf(a);
      const idxB = STANDARD_SIZE_ORDER.indexOf(b);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.localeCompare(b, undefined, { numeric: true });
    });
  }, [forecastItems]);

  // Statistik Ringkas
  const stats = useMemo(() => {
    const totalPcs = forecastItems.reduce((acc, it) => acc + it.total, 0);
    const totalItems = forecastItems.length;
    const uniqueLevels = new Set(forecastItems.map((it) => it.level)).size;
    return { totalPcs, totalItems, uniqueLevels };
  }, [forecastItems]);

  // =========================================================================
  // 1. ENGINE DISTRIBUSI KE VENDOR MURNI PROPORSI JUMLAH SEKOLAH
  // =========================================================================
  const vendorAllocations = useMemo(() => {
    if (forecastItems.length === 0 || vendors.length === 0) return [];

    // 1. Petakan sekolah-sekolah aktif per jenjang
    const schoolsByLevel = new Map<string, Set<string>>();
    schools.forEach((s) => {
      const lvl = (s.level || '').toUpperCase().trim();
      if (!schoolsByLevel.has(lvl)) schoolsByLevel.set(lvl, new Set());
      schoolsByLevel.get(lvl)!.add(s.id);
    });

    // 2. Petakan plotting per vendor & jenjang
    // vendorLevelSchools: Map<vendorId, Map<level, Set<schoolId>>>
    const vendorLevelSchools = new Map<string, Map<string, Set<string>>>();
    const vendorSchoolNames = new Map<string, Set<string>>();

    plottings.forEach((p) => {
      const vId = p.vendor_id;
      const sId = p.school_user_id;
      const lvl = (p.app_users?.school_level || '').toUpperCase().trim();
      const sName = p.app_users?.school_name || '';

      if (!vendorLevelSchools.has(vId)) vendorLevelSchools.set(vId, new Map());
      const vLvlMap = vendorLevelSchools.get(vId)!;
      if (!vLvlMap.has(lvl)) vLvlMap.set(lvl, new Set());
      vLvlMap.get(lvl)!.add(sId);

      if (!vendorSchoolNames.has(vId)) vendorSchoolNames.set(vId, new Set());
      if (sName) vendorSchoolNames.get(vId)!.add(sName);
    });

    // 3. Alokasikan setiap ForecastItem ke masing-masing vendor
    const allocationByVendor = new Map<string, VendorAllocation>();

    vendors.forEach((v) => {
      allocationByVendor.set(v.id, {
        vendorId: v.id,
        vendorName: v.name,
        contactPerson: v.contact_person || '-',
        phone: v.phone || '-',
        schoolNames: Array.from(vendorSchoolNames.get(v.id) || []),
        items: [],
        grandTotalPcs: 0,
      });
    });

    forecastItems.forEach((fcItem) => {
      const itemLevel = fcItem.level.toUpperCase().trim();

      // Cari vendor-vendor yang memegang sekolah pada jenjang ini
      const activeVendorsForLevel: Array<{
        vendorId: string;
        schoolCount: number;
        schoolNames: Set<string>;
      }> = [];

      vendors.forEach((v) => {
        const vSchools = vendorLevelSchools.get(v.id)?.get(itemLevel);
        const count = vSchools ? vSchools.size : 0;
        if (count > 0) {
          activeVendorsForLevel.push({
            vendorId: v.id,
            schoolCount: count,
            schoolNames: vendorSchoolNames.get(v.id) || new Set(),
          });
        }
      });

      // Total sekolah yang di-plot pada jenjang ini lintas semua vendor
      const totalSchoolsInLevel = activeVendorsForLevel.reduce((sum, av) => sum + av.schoolCount, 0);

      if (totalSchoolsInLevel === 0) {
        // Belum ada vendor yang di-plot untuk jenjang ini
        return;
      }

      // Distribusikan tiap ukuran ke masing-masing vendor
      const allocatedSizesByVendor = new Map<string, Record<string, number>>();
      activeVendorsForLevel.forEach((av) => {
        allocatedSizesByVendor.set(av.vendorId, {});
      });

      // Cek apakah data ini memiliki rincian per sekolah (schoolBreakdown)
      const hasBreakdown = fcItem.schoolBreakdown && Object.keys(fcItem.schoolBreakdown).length > 0;
      let matchedBySchool = false;

      if (hasBreakdown) {
        // Alokasikan langsung ke vendor yang menaungi sekolah tersebut
        Object.entries(fcItem.schoolBreakdown!).forEach(([schoolName, schoolSizes]) => {
          const sClean = schoolName.toLowerCase().replace(/[^a-z0-9]/g, '');
          const targetVendor = activeVendorsForLevel.find((av) =>
            Array.from(av.schoolNames).some((sn) => {
              const snClean = sn.toLowerCase().replace(/[^a-z0-9]/g, '');
              return snClean === sClean || snClean.includes(sClean) || sClean.includes(snClean);
            })
          );

          if (targetVendor) {
            matchedBySchool = true;
            const vSizes = allocatedSizesByVendor.get(targetVendor.vendorId)!;
            Object.entries(schoolSizes).forEach(([sz, qty]) => {
              vSizes[sz] = (vSizes[sz] || 0) + qty;
            });
          }
        });
      }

      // Jika tidak ada data per sekolah atau sekolah tidak ada yang cocok dengan plotting,
      // fallback ke perhitungan proporsi rasio jumlah sekolah per vendor
      if (!matchedBySchool) {
        Object.entries(fcItem.sizes).forEach(([sizeName, totalQtyForSize]) => {
          if (totalQtyForSize <= 0) return;

          let allocatedSum = 0;
          let maxVendorId = activeVendorsForLevel[0]?.vendorId || '';
          let maxVendorCount = -1;

          activeVendorsForLevel.forEach((av) => {
            const ratio = av.schoolCount / totalSchoolsInLevel;
            const qty = Math.round(totalQtyForSize * ratio);
            allocatedSizesByVendor.get(av.vendorId)![sizeName] = qty;
            allocatedSum += qty;

            if (av.schoolCount > maxVendorCount) {
              maxVendorCount = av.schoolCount;
              maxVendorId = av.vendorId;
            }
          });

          // Remainder adjustment agar total alokasi per ukuran persis sama dengan total input
          const diff = totalQtyForSize - allocatedSum;
          if (diff !== 0 && maxVendorId) {
            allocatedSizesByVendor.get(maxVendorId)![sizeName] += diff;
          }
        });
      }

      // Masukkan ke struktur alokasi masing-masing vendor
      activeVendorsForLevel.forEach((av) => {
        const vendorSizes = allocatedSizesByVendor.get(av.vendorId) || {};
        const itemTotal = Object.values(vendorSizes).reduce((a, b) => a + b, 0);
        if (itemTotal === 0 && !matchedBySchool) return;

        const sharePct = (av.schoolCount / totalSchoolsInLevel) * 100;

        const alloc = allocationByVendor.get(av.vendorId);
        if (alloc) {
          alloc.items.push({
            level: fcItem.level,
            uniformName: fcItem.uniformName,
            sizes: vendorSizes,
            total: itemTotal,
            sharePercentage: Math.round(sharePct * 10) / 10,
            schoolCount: av.schoolCount,
            totalSchoolsInLevel,
          });
          alloc.grandTotalPcs += itemTotal;
        }
      });
    });

    return Array.from(allocationByVendor.values())
      .filter((a) => a.items.length > 0 || a.schoolNames.length > 0)
      .sort((a, b) => a.vendorName.localeCompare(b.vendorName, 'id', { numeric: true, sensitivity: 'base' }));
  }, [forecastItems, vendors, plottings, schools]);

  // =========================================================================
  // 2. PARSER FILE EXCEL (DRAG & DROP / FILE INPUT)
  // =========================================================================
  const processExcelFile = (file: File) => {
    setLoading(true);
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const buffer = e.target?.result as ArrayBuffer;
        const workbook = XLSX.read(buffer, { type: 'array' });

        if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
          alert('File Excel kosong atau format tabel tidak terbaca.');
          setLoading(false);
          return;
        }

        // Map unik: `${level}___${uniformName}` -> ForecastItem
        const itemMap = new Map<string, ForecastItem>();

        workbook.SheetNames.forEach((sheetName) => {
          const sheet = workbook.Sheets[sheetName];
          if (!sheet) return;

          // Deteksi jenjang dari nama sheet (contoh: "SD", "SMP", "SMA", "TK", "SPK-SD", "SPK-SMP", "SPK-SMA")
          let defaultLevel = 'SD';
          const cleanSheet = sheetName.toUpperCase().trim();
          if (cleanSheet.includes('SPK')) {
            if (cleanSheet.includes('SD') || cleanSheet.includes('PRIMARY')) {
              defaultLevel = 'SPK-SD';
            } else if (cleanSheet.includes('SMP') || cleanSheet.includes('LOWER')) {
              defaultLevel = 'SPK-SMP';
            } else if (cleanSheet.includes('SMA') || cleanSheet.includes('UPPER')) {
              defaultLevel = 'SPK-SMA';
            } else {
              defaultLevel = 'SPK-SD';
            }
          } else if (cleanSheet.includes('SD') && !cleanSheet.includes('SMP') && !cleanSheet.includes('SMA')) {
            defaultLevel = 'SD';
          } else if (cleanSheet.includes('SMP')) {
            defaultLevel = 'SMP';
          } else if (cleanSheet.includes('SMA') || cleanSheet.includes('SMK')) {
            defaultLevel = 'SMA';
          } else if (cleanSheet.includes('TK')) {
            defaultLevel = 'TK';
          } else {
            defaultLevel = cleanSheet || 'SEMUA';
          }

          const rawRows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet);
          if (rawRows.length === 0) return;

          // Cek apakah sheet ini memakai FORMAT BARU (kolom SIZE/Ukuran, kolom-kolomnya adalah Sekolah)
          // atau FORMAT LAMA (kolomnya adalah Ukuran seperti SS, S, M, L)
          const firstRow = rawRows[0];
          const hasSizeCol = Object.keys(firstRow).some((k) =>
            ['size', 'ukuran'].includes(k.trim().toLowerCase())
          );

          if (hasSizeCol) {
            // ========================================================
            // FORMAT BARU: Baris = Barang + Ukuran, Kolom = Sekolah
            // ========================================================
            rawRows.forEach((row) => {
              const nameRaw =
                row['Nama Barang'] ||
                row['NAMA BARANG'] ||
                row['Nama Seragam'] ||
                row['Jenis Baju'] ||
                row['Item'] ||
                row['Barang'] ||
                '';
              const uniformName = String(nameRaw).trim();
              if (!uniformName) return;

              const sizeRaw =
                row['Size'] ||
                row['SIZE'] ||
                row['Ukuran'] ||
                row['UKURAN'] ||
                'ALL SIZE';
              const size = String(sizeRaw).trim().toUpperCase();

              const levelRaw = row['Jenjang'] || row['Level'] || defaultLevel;
              const level = String(levelRaw).toUpperCase().trim();

              const key = `${level}___${uniformName.toUpperCase()}`;
              if (!itemMap.has(key)) {
                itemMap.set(key, {
                  id: `fc-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
                  level,
                  uniformName,
                  sizes: {},
                  total: 0,
                  schoolBreakdown: {},
                });
              }

              const item = itemMap.get(key)!;
              if (!item.sizes[size]) item.sizes[size] = 0;
              if (!item.schoolBreakdown) item.schoolBreakdown = {};

              // Kolom selain nama barang, ukuran, dan total dianggap nama sekolah
              let schoolSum = 0;
              Object.entries(row).forEach(([colKey, val]) => {
                const cleanKey = colKey.trim();
                const lowerKey = cleanKey.toLowerCase();
                if (
                  [
                    'no', 'no.', 'nomor',
                    'jenjang', 'level', 'tingkat',
                    'nama seragam', 'jenis baju', 'nama barang', 'barang', 'item',
                    'size', 'ukuran',
                    'total', 'total (pcs)', 'total pcs', 'total rencana', 'keterangan'
                  ].includes(lowerKey)
                ) {
                  return;
                }

                const numVal = parseInt(String(val).replace(/[^0-9]/g, ''), 10);
                if (!isNaN(numVal) && numVal > 0) {
                  schoolSum += numVal;
                  item.sizes[size] = (item.sizes[size] || 0) + numVal;
                  item.total += numVal;

                  if (!item.schoolBreakdown![cleanKey]) {
                    item.schoolBreakdown![cleanKey] = {};
                  }
                  item.schoolBreakdown![cleanKey][size] =
                    (item.schoolBreakdown![cleanKey][size] || 0) + numVal;
                }
              });

              // Jika kolom-kolom sekolah kosong, cek apakah user langsung menginput angka di kolom TOTAL:
              if (schoolSum === 0) {
                const totalRaw =
                  row['TOTAL (PCS)'] ||
                  row['TOTAL'] ||
                  row['Total'] ||
                  row['Total (Pcs)'] ||
                  row['Total Pcs'] ||
                  row['TOTAL RENCANA'] ||
                  row['Total Rencana'] ||
                  '';
                const totalNum = parseInt(String(totalRaw).replace(/[^0-9]/g, ''), 10);
                if (!isNaN(totalNum) && totalNum > 0) {
                  item.sizes[size] = (item.sizes[size] || 0) + totalNum;
                  item.total += totalNum;
                }
              }
            });
          } else {
            // ========================================================
            // FORMAT LAMA: Baris = Nama Seragam, Kolom = Ukuran (SS, S, M...)
            // ========================================================
            rawRows.forEach((row, idx) => {
              const levelRaw = row['Jenjang'] || row['Level'] || defaultLevel;
              const level = String(levelRaw).toUpperCase().trim();

              const nameRaw =
                row['Nama Seragam'] ||
                row['Nama Barang'] ||
                row['Jenis Baju'] ||
                row['Item'] ||
                '';
              const uniformName = String(nameRaw).trim();
              if (!uniformName) return;

              const sizes: Record<string, number> = {};
              let rowTotal = 0;

              Object.entries(row).forEach(([colKey, val]) => {
                const cleanKey = colKey.trim();
                if (
                  [
                    'no', 'no.', 'nomor',
                    'jenjang', 'level', 'tingkat',
                    'nama seragam', 'jenis baju', 'nama barang', 'barang', 'item',
                    'total', 'total (pcs)', 'total pcs', 'total rencana', 'keterangan', 'tipe ukuran'
                  ].includes(cleanKey.toLowerCase())
                ) {
                  return;
                }

                const numVal = parseInt(String(val).replace(/[^0-9]/g, ''), 10);
                if (!isNaN(numVal) && numVal > 0) {
                  sizes[cleanKey] = numVal;
                  rowTotal += numVal;
                }
              });

              if (rowTotal > 0) {
                const key = `${level}___${uniformName.toUpperCase()}`;
                if (itemMap.has(key)) {
                  const existing = itemMap.get(key)!;
                  Object.entries(sizes).forEach(([sz, q]) => {
                    existing.sizes[sz] = (existing.sizes[sz] || 0) + q;
                  });
                  existing.total += rowTotal;
                } else {
                  itemMap.set(key, {
                    id: `fc-${Date.now()}-${idx}`,
                    level,
                    uniformName,
                    sizes,
                    total: rowTotal,
                  });
                }
              }
            });
          }
        });

        const parsedItems = Array.from(itemMap.values()).filter((it) => it.total > 0);

        if (parsedItems.length === 0) {
          alert('Tidak ada angka perkiraan seragam yang valid (> 0) dalam file Excel tersebut.');
        } else {
          setForecastItems(parsedItems);
          handleSaveForecast(parsedItems);
          setSaveSuccessMessage(`🎉 Berhasil memuat ${parsedItems.length} jenis seragam dari file "${file.name}"!`);
          setTimeout(() => setSaveSuccessMessage(null), 5000);
        }
      } catch (err: any) {
        console.error('Error parsing Excel:', err);
        alert('Gagal membaca file Excel: ' + (err.message || ''));
      } finally {
        setLoading(false);
      }
    };

    reader.onerror = () => {
      alert('Gagal membaca file.');
      setLoading(false);
    };

    reader.readAsArrayBuffer(file);
  };

  // Drag and drop event handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls') || file.name.endsWith('.csv')) {
        processExcelFile(file);
      } else {
        alert('Silakan unggah file dengan format .xlsx atau .xls');
      }
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processExcelFile(e.target.files[0]);
    }
  };

  // =========================================================================
  // 3. GENERATOR TEMPLATE EXCEL RESMI MULTI-SHEET (SD, SMP, SMA, TK)
  //    Format: Baris = Item per Ukuran, Kolom = Nama Sekolah
  // =========================================================================
  const handleDownloadTemplate = () => {
    // 1. Ambil daftar sekolah unik per jenjang dari database (props schools)
    const getSchoolsForLevel = (levelKey: string, fallbackList: string[]): string[] => {
      const filtered = schools.filter((s) => {
        const lvl = (s.level || '').toUpperCase().trim();
        const sName = (s.school_name || '').toUpperCase().trim();
        const isSpk = lvl.startsWith('SPK') || sName.includes('PIS') || sName.includes('INTERNATIONAL');

        if (levelKey === 'SPK-SD') {
          return lvl === 'SPK-SD' || (isSpk && (lvl.includes('SD') || lvl.includes('PRIMARY') || sName.includes('PRIMARY') || sName.includes('SD')));
        }
        if (levelKey === 'SPK-SMP') {
          return lvl === 'SPK-SMP' || (isSpk && (lvl.includes('SMP') || lvl.includes('LOWER') || sName.includes('LOWER') || sName.includes('SMP')));
        }
        if (levelKey === 'SPK-SMA') {
          return lvl === 'SPK-SMA' || (isSpk && (lvl.includes('SMA') || lvl.includes('UPPER') || sName.includes('UPPER') || sName.includes('SMA') || sName.includes('JC')));
        }

        // Untuk jenjang Nasional, jangan masukkan sekolah SPK / International
        if (isSpk) return false;

        if (levelKey === 'SD') {
          return lvl === 'SD' || sName.includes('SDK ') || sName.includes('SD ');
        }
        if (levelKey === 'SMP') {
          return lvl === 'SMP' || sName.includes('SMPK ') || sName.includes('SMP ');
        }
        if (levelKey === 'SMA') {
          return lvl === 'SMA' || lvl.includes('SMK') || sName.includes('SMAK ') || sName.includes('SMA ') || sName.includes('SMK ');
        }
        if (levelKey === 'TK') {
          return lvl === 'TK' || lvl.includes('KINDER') || sName.includes('TKK ') || sName.includes('TK ');
        }
        return lvl === levelKey;
      });

      if (filtered.length > 0) {
        // Urutkan secara natural (angka kecil ke besar, misal SDK 1 sebelum SDK 2 dst)
        const uniqueNames = Array.from(new Set(filtered.map((s) => s.school_name.trim())));
        return uniqueNames.sort((a, b) => a.localeCompare(b, 'id', { numeric: true, sensitivity: 'base' }));
      }
      return fallbackList;
    };

    // Sekolah fallback jika database sekolah belum terisi
    const fallbackSchools: Record<string, string[]> = {
      SD: [
        'SDK 1 PENABUR', 'SDK 2 PENABUR', 'SDK 3 PENABUR', 'SDK 4 PENABUR', 'SDK 6 PENABUR',
        'SDK 8 PENABUR', 'SDK 9 PENABUR', 'SDK 10 PENABUR', 'SDK 11 PENABUR',
        'SDK PENABUR Depok', 'SDK PENABUR Bintaro Jaya', 'SDK PENABUR Gading Serpong',
        'SDK PENABUR Kota Modern', 'SDK PENABUR Kota Wisata', 'SDK PENABUR Harapan Indah',
        'SDK PENABUR Summarecon Bekasi', 'SDK PENABUR Agus Salim', 'SDK PENABUR Kota Jababeka',
        'SDK Tirtamarta 1', 'SDK Tirtamarta 2'
      ],
      SMP: [
        'SMPK 1 PENABUR Jakarta', 'SMPK 2 PENABUR Jakarta', 'SMPK 3 PENABUR Jakarta',
        'SMPK 4 PENABUR Jakarta', 'SMPK 5 PENABUR Jakarta', 'SMPK 6 PENABUR Jakarta',
        'SMPK 7 PENABUR Jakarta', 'SMPK PENABUR Bintaro Jaya', 'SMPK PENABUR Gading Serpong',
        'SMPK PENABUR Kota Modern', 'SMPK PENABUR Harapan Indah', 'SMPK PENABUR Kota Wisata',
        'SMPK PENABUR Kota Depok', 'SMPK PENABUR Kota Jababeka', 'SMPK PENABUR Summarecon Bekasi',
        'SMPK Tirtamarta 1', 'SMPK Tirtamarta 2'
      ],
      SMA: [
        'SMAK 1 PENABUR', 'SMAK 2 PENABUR', 'SMAK 3 PENABUR', 'SMAK 4 PENABUR',
        'SMAK 5 PENABUR', 'SMAK 6 PENABUR', 'SMAK 7 PENABUR', 'SMAK SUMMARECON BEKASI',
        'SMAK KOTA JABABEKA', 'SMAK HARAPAN INDAH', 'SMAK KOTA TANGERANG',
        'SMAK BINTARO JAYA', 'SMAK GADING SERPONG', 'SMAK KOTA WISATA', 'SMK FARMASI PENABUR',
        'SMAK Tirtamarta 1', 'SMAK Tirtamarta 2'
      ],
      TK: [
        'TKK 1 PENABUR', 'TKK 2 PENABUR', 'TKK 3 PENABUR', 'TKK 5 PENABUR',
        'TKK 6 PENABUR', 'TKK 7 PENABUR', 'TKK 8 PENABUR', 'TKK 9 PENABUR',
        'TKK 10 PENABUR', 'TKK 11 PENABUR', 'TKK PENABUR Bintaro Jaya',
        'TKK PENABUR Gading Serpong', 'TKK PENABUR Kota Modern', 'TKK PENABUR Kota Jababeka',
        'TKK PENABUR Harapan Indah', 'TKK PENABUR Bekasi Agus Salim', 'TKK PENABUR Kota Wisata',
        'TKK PENABUR Summarecon Bekasi', 'TKK PENABUR Depok',
        'TKK Tirtamarta 1', 'TKK Tirtamarta 2'
      ],
      'SPK-SD': [
        'PIS Kelapa Gading (Primary)'
      ],
      'SPK-SMP': [
        'PIS Kelapa Gading (Lower Secondary)',
        'PIS Tanjung Duren (Lower Secondary)'
      ],
      'SPK-SMA': [
        'PIS Kelapa Gading (Upper Secondary)',
        'PIS Tanjung Duren (Upper Secondary)'
      ]
    };

    // 2. Daftar seragam dan rentang ukuran standar per jenjang
    const standardLetterSizes = ['SS', 'S', 'M', 'L', 'XL', '2L', '3L', '4L', '5L', '6L', 'KHUSUS'];
    const standardPantsSizes = ['25', '26', '27', '28', '29', '30', '31', '32', '33', '34', '35', '36', '37', '38', '39', '40', 'KHUSUS'];

    // 2. Daftar seragam fallback jika database barang belum terisi untuk jenjang tertentu
    const fallbackUniformDefinitions: Record<string, Array<{ name: string; sizes: string[] }>> = {
      SD: [
        { name: 'KEMEJA PUTIH', sizes: standardLetterSizes },
        { name: 'CELANA MERAH', sizes: standardLetterSizes },
        { name: 'KULOT MERAH', sizes: standardLetterSizes },
        { name: 'ROMPI KOTAK', sizes: standardLetterSizes },
        { name: 'KEMEJA PRAMUKA SD', sizes: standardLetterSizes },
        { name: 'CELANA PRAMUKA SD', sizes: standardLetterSizes },
        { name: 'KULOT PRAMUKA SD', sizes: standardLetterSizes },
        { name: 'KAOS OLAHRAGA SD', sizes: standardLetterSizes },
      ],
      SMP: [
        { name: 'KEMEJA PUTIH', sizes: standardLetterSizes },
        { name: 'CELANA BIRU', sizes: standardPantsSizes },
        { name: 'ROK BIRU', sizes: standardLetterSizes },
        { name: 'KEMEJA PRAMUKA SMP', sizes: standardLetterSizes },
        { name: 'CELANA PRAMUKA SMP', sizes: standardPantsSizes },
        { name: 'ROK PRAMUKA SMP', sizes: standardLetterSizes },
        { name: 'KAOS OLAHRAGA SMP', sizes: standardLetterSizes },
      ],
      SMA: [
        { name: 'KEMEJA PUTIH', sizes: standardLetterSizes },
        { name: 'CELANA ABU', sizes: ['27', '28', '29', '30', '31', '32', '33', '34', '35', '36', '37', '38', '39', '40', 'KHUSUS'] },
        { name: 'ROK ABU', sizes: standardLetterSizes },
        { name: 'KEMEJA PRAMUKA SMA', sizes: standardLetterSizes },
        { name: 'CELANA PRAMUKA SMA', sizes: ['27', '28', '29', '30', '31', '32', '33', '34', '35', '36', '37', '38', '39', '40', 'KHUSUS'] },
        { name: 'ROK PRAMUKA SMA', sizes: standardLetterSizes },
        { name: 'KAOS OLAHRAGA SMA', sizes: standardLetterSizes },
      ],
      TK: [
        { name: 'KOTAK-KOTAK PUTRA', sizes: ['SS', 'S', 'M', 'L', 'XL', '2L', '3L', 'KHUSUS'] },
        { name: 'KOTAK-KOTAK PUTRI', sizes: ['SS', 'S', 'M', 'L', 'XL', '2L', '3L', 'KHUSUS'] },
        { name: 'KAOS OLAHRAGA TK', sizes: ['SS', 'S', 'M', 'L', 'XL', '2L', '3L', 'KHUSUS'] },
        { name: 'BAJU RENANG TK', sizes: ['SS', 'S', 'M', 'L', 'XL', '2L', '3L', 'KHUSUS'] },
      ],
      'SPK-SD': [],
      'SPK-SMP': [],
      'SPK-SMA': [],
    };

    const workbook = XLSX.utils.book_new();

    // Buat sheet terurut: SD, SMP, SMA, TK, SPK-SD, SPK-SMP, SPK-SMA
    const sheetOrder = ['SD', 'SMP', 'SMA', 'TK', 'SPK-SD', 'SPK-SMP', 'SPK-SMA'];

    sheetOrder.forEach((lvl) => {
      const schoolList = getSchoolsForLevel(lvl, fallbackSchools[lvl]);

      // Ambil produk seragam ASLI langsung dari database barang (props products)
      const dbItemsForLevel = products.filter((p) => {
        const isSeragam = !p.category || p.category.toLowerCase() === 'seragam';
        if (!isSeragam) return false;
        const pLvl = (p.level || '').toUpperCase().trim();
        const pName = (p.name || '').toUpperCase();

        if (lvl === 'SPK-SD') {
          return pLvl === 'SPK-SD' || (pLvl.includes('SPK') && (pLvl.includes('SD') || pLvl.includes('PRIMARY') || pName.includes('PRIMARY') || pName.includes('SD')));
        }
        if (lvl === 'SPK-SMP') {
          return pLvl === 'SPK-SMP' || (pLvl.includes('SPK') && (pLvl.includes('SMP') || pLvl.includes('LOWER') || pName.includes('LOWER') || pName.includes('SMP')));
        }
        if (lvl === 'SPK-SMA') {
          return pLvl === 'SPK-SMA' || (pLvl.includes('SPK') && (pLvl.includes('SMA') || pLvl.includes('UPPER') || pName.includes('UPPER') || pName.includes('SMA') || pName.includes('JC')));
        }
        if (pLvl.includes('SPK') || pName.includes('SPK ') || pName.includes('PIS ')) return false;

        if (lvl === 'SD') return pLvl === 'SD';
        if (lvl === 'SMP') return pLvl === 'SMP';
        if (lvl === 'SMA') return pLvl === 'SMA' || pLvl === 'SMK';
        if (lvl === 'TK') return pLvl === 'TK';
        return pLvl === lvl;
      });

      let uniformList: Array<{ name: string; sizes: string[] }> = [];

      if (dbItemsForLevel.length > 0) {
        // Ambil nama barang unik dan kumpulkan seluruh ukuran fisik yang ada di database barang
        const groupedMap = new Map<string, Set<string>>();
        dbItemsForLevel.forEach((p) => {
          const pName = (p.name || '').toUpperCase().trim();
          if (!pName) return;
          if (!groupedMap.has(pName)) groupedMap.set(pName, new Set());
          if (p.size && p.size.trim()) {
            groupedMap.get(pName)!.add(p.size.trim().toUpperCase());
          }
        });

        groupedMap.forEach((sizesSet, pName) => {
          // Bersihkan variasi ukuran
          const cleanSizes = new Set<string>();
          sizesSet.forEach((s) => {
            const clean = s.trim().toUpperCase();
            if (clean && clean !== '-' && clean !== 'NULL' && clean !== 'UNDEFINED') {
              cleanSizes.add(clean);
            }
          });

          let sizesArray = Array.from(cleanSizes);
          if (sizesArray.length === 0) {
            // Jika di database barang memang tidak memiliki ukuran (misal: Baret & Emblem, Dasi, Topi, Sabuk, dll.),
            // cukup buat 1 baris saja dengan ukuran 'ALL SIZE' (bukan dipecah ke SS s/d 6L)
            sizesArray = ['ALL SIZE'];
          } else {
            sizesArray.sort((a, b) => {
              const idxA = STANDARD_SIZE_ORDER.indexOf(a);
              const idxB = STANDARD_SIZE_ORDER.indexOf(b);
              if (idxA !== -1 && idxB !== -1) return idxA - idxB;
              if (idxA !== -1) return -1;
              if (idxB !== -1) return 1;
              return a.localeCompare(b, undefined, { numeric: true });
            });
          }
          uniformList.push({ name: pName, sizes: sizesArray });
        });

        uniformList.sort((a, b) => a.name.localeCompare(b.name, 'id', { numeric: true, sensitivity: 'base' }));
      } else {
        // Hanya jika database barang benar-benar kosong untuk jenjang ini, gunakan fallback default
        uniformList = fallbackUniformDefinitions[lvl] || [];
      }

      const rows: any[] = [];

      uniformList.forEach((item) => {
        item.sizes.forEach((sz) => {
          const rowObj: Record<string, any> = {
            'NAMA BARANG': item.name,
            SIZE: sz,
          };
          schoolList.forEach((sName) => {
            rowObj[sName] = '';
          });
          rowObj['TOTAL (PCS)'] = '';
          rows.push(rowObj);
        });
      });

      const worksheet = XLSX.utils.json_to_sheet(rows);

      // Tambahkan formula penjumlahan SUM otomatis ke kolom TOTAL (PCS)
      // Kolom A = 0 (NAMA BARANG), Kolom B = 1 (SIZE)
      // Kolom C = 2 (Sekolah pertama)
      // Kolom terakhir sekolah = schoolList.length + 1
      // Kolom TOTAL = schoolList.length + 2
      const firstSchoolCol = 'C';
      const lastSchoolCol = XLSX.utils.encode_col(schoolList.length + 1);
      const totalCol = XLSX.utils.encode_col(schoolList.length + 2);

      rows.forEach((_, idx) => {
        const rowNum = idx + 2; // Row data mulai dari baris 2 (baris 1 header)
        const cellRef = `${totalCol}${rowNum}`;
        worksheet[cellRef] = {
          t: 'n',
          f: `SUM(${firstSchoolCol}${rowNum}:${lastSchoolCol}${rowNum})`,
        };
      });

      // Atur lebar kolom agar rapi dan teks sekolah tidak terpotong
      worksheet['!cols'] = [
        { wch: 28 }, // NAMA BARANG
        { wch: 10 }, // SIZE
        ...schoolList.map(() => ({ wch: 24 })), // Kolom sekolah-sekolah
        { wch: 15 }, // TOTAL (PCS)
      ];

      XLSX.utils.book_append_sheet(workbook, worksheet, lvl);
    });

    XLSX.writeFile(workbook, `Template_Prediksi_Produksi_${targetYear.replace('/', '_')}.xlsx`);
  };

  // =========================================================================
  // 4. EKSPOR SPK VENDOR KE EXCEL (.XLSX)
  // =========================================================================
  const handleExportVendorSPK = (vendorAlloc: VendorAllocation) => {
    if (vendorAlloc.items.length === 0) {
      alert(`Vendor "${vendorAlloc.vendorName}" belum memiliki alokasi produksi.`);
      return;
    }

    const exportRows: any[] = [];

    // Header SPK Informasi Vendor
    exportRows.push({ 'SURAT PERINTAH KERJA (SPK) PRODUKSI SERAGAM': '' });
    exportRows.push({ 'SURAT PERINTAH KERJA (SPK) PRODUKSI SERAGAM': `Tahun Ajaran: ${targetYear}` });
    exportRows.push({ 'SURAT PERINTAH KERJA (SPK) PRODUKSI SERAGAM': `Vendor / Penjahit: ${vendorAlloc.vendorName}` });
    exportRows.push({ 'SURAT PERINTAH KERJA (SPK) PRODUKSI SERAGAM': `PIC: ${vendorAlloc.contactPerson} | No. Telp: ${vendorAlloc.phone}` });
    exportRows.push({ 'SURAT PERINTAH KERJA (SPK) PRODUKSI SERAGAM': `Sekolah yang Dikerjakan (${vendorAlloc.schoolNames.length} sekolah): ${vendorAlloc.schoolNames.join(', ')}` });
    exportRows.push({}); // Baris kosong

    // Daftar kolom ukuran unik yang ada di vendor ini
    const vendorSizes = new Set<string>();
    vendorAlloc.items.forEach((it) => {
      Object.keys(it.sizes).forEach((s) => vendorSizes.add(s));
    });
    const sortedSizes = Array.from(vendorSizes).sort((a, b) => {
      const idxA = STANDARD_SIZE_ORDER.indexOf(a);
      const idxB = STANDARD_SIZE_ORDER.indexOf(b);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.localeCompare(b, undefined, { numeric: true });
    });

    // Tabel rincian barang
    vendorAlloc.items.forEach((it, idx) => {
      const row: Record<string, any> = {
        No: idx + 1,
        Jenjang: it.level,
        'Nama Seragam': it.uniformName,
        'Porsi Vendor': `${it.sharePercentage}% (${it.schoolCount}/${it.totalSchoolsInLevel} Sekolah)`,
      };

      sortedSizes.forEach((sz) => {
        row[sz] = it.sizes[sz] || 0;
      });

      row['TOTAL (PCS)'] = it.total;
      exportRows.push(row);
    });

    // Baris Grand Total
    const totalRow: Record<string, any> = {
      No: '',
      Jenjang: '',
      'Nama Seragam': 'GRAND TOTAL',
      'Porsi Vendor': '',
    };
    sortedSizes.forEach((sz) => {
      totalRow[sz] = vendorAlloc.items.reduce((sum, it) => sum + (it.sizes[sz] || 0), 0);
    });
    totalRow['TOTAL (PCS)'] = vendorAlloc.grandTotalPcs;
    exportRows.push(totalRow);

    const worksheet = XLSX.utils.json_to_sheet(exportRows);
    worksheet['!cols'] = [
      { wch: 6 },
      { wch: 12 },
      { wch: 32 },
      { wch: 24 },
      ...sortedSizes.map(() => ({ wch: 9 })),
      { wch: 14 },
    ];

    const workbook = XLSX.utils.book_new();
    const sheetName = vendorAlloc.vendorName.replace(/[\\/?*[\]]/g, '').slice(0, 31);
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
    XLSX.writeFile(
      workbook,
      `SPK_Produksi_${vendorAlloc.vendorName.replace(/\s+/g, '_')}_${targetYear.replace('/', '_')}.xlsx`
    );
  };

  // Ekspor Rekap Semua Vendor Sekaligus (Multi-Sheet)
  const handleExportAllVendors = () => {
    if (vendorAllocations.length === 0) {
      alert('Tidak ada alokasi vendor untuk diekspor.');
      return;
    }

    const workbook = XLSX.utils.book_new();

    // 1. Sheet Ringkasan Semua Vendor
    const summaryRows = vendorAllocations.map((va, idx) => ({
      No: idx + 1,
      'Nama Vendor': va.vendorName,
      'Kontak Person': va.contactPerson,
      'No. Telepon': va.phone,
      'Jumlah Sekolah Di-plot': va.schoolNames.length,
      'Daftar Sekolah': va.schoolNames.join(', '),
      'Total Penugasan Jenis Seragam': va.items.length,
      'Total Target Baju Jadi (Pcs)': va.grandTotalPcs,
    }));

    const summarySheet = XLSX.utils.json_to_sheet(summaryRows);
    summarySheet['!cols'] = [
      { wch: 6 },
      { wch: 28 },
      { wch: 18 },
      { wch: 18 },
      { wch: 22 },
      { wch: 45 },
      { wch: 26 },
      { wch: 25 },
    ];
    XLSX.utils.book_append_sheet(workbook, summarySheet, 'Ringkasan_Vendor');

    // 2. Satu Sheet per Vendor
    vendorAllocations.forEach((va) => {
      const vendorRows: any[] = [];
      const vendorSizes = new Set<string>();
      va.items.forEach((it) => Object.keys(it.sizes).forEach((s) => vendorSizes.add(s)));
      const sortedSizes = Array.from(vendorSizes).sort((a, b) => {
        const idxA = STANDARD_SIZE_ORDER.indexOf(a);
        const idxB = STANDARD_SIZE_ORDER.indexOf(b);
        if (idxA !== -1 && idxB !== -1) return idxA - idxB;
        if (idxA !== -1) return -1;
        if (idxB !== -1) return 1;
        return a.localeCompare(b, undefined, { numeric: true });
      });

      va.items.forEach((it, idx) => {
        const row: Record<string, any> = {
          No: idx + 1,
          Jenjang: it.level,
          'Nama Seragam': it.uniformName,
          'Porsi Vendor': `${it.sharePercentage}% (${it.schoolCount}/${it.totalSchoolsInLevel} Sekolah)`,
        };
        sortedSizes.forEach((sz) => {
          row[sz] = it.sizes[sz] || 0;
        });
        row['TOTAL (PCS)'] = it.total;
        vendorRows.push(row);
      });

      const totalRow: Record<string, any> = {
        No: '',
        Jenjang: '',
        'Nama Seragam': 'GRAND TOTAL',
        'Porsi Vendor': '',
      };
      sortedSizes.forEach((sz) => {
        totalRow[sz] = va.items.reduce((sum, it) => sum + (it.sizes[sz] || 0), 0);
      });
      totalRow['TOTAL (PCS)'] = va.grandTotalPcs;
      vendorRows.push(totalRow);

      const vSheet = XLSX.utils.json_to_sheet(vendorRows);
      vSheet['!cols'] = [
        { wch: 6 },
        { wch: 12 },
        { wch: 32 },
        { wch: 24 },
        ...sortedSizes.map(() => ({ wch: 8 })),
        { wch: 14 },
      ];
      const sheetName = va.vendorName.replace(/[\\/?*[\]]/g, '').slice(0, 31);
      XLSX.utils.book_append_sheet(workbook, vSheet, sheetName);
    });

    XLSX.writeFile(workbook, `Master_Alokasi_Produksi_Semua_Vendor_${targetYear.replace('/', '_')}.xlsx`);
  };

  // Filter items untuk tampilan
  const filteredForecastItems = useMemo(() => {
    return forecastItems.filter((it) => {
      const matchesLevel = selectedLevelFilter === 'ALL' || it.level.toUpperCase() === selectedLevelFilter.toUpperCase();
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch = !q || it.uniformName.toLowerCase().includes(q) || it.level.toLowerCase().includes(q);
      return matchesLevel && matchesSearch;
    });
  }, [forecastItems, selectedLevelFilter, searchQuery]);

  const filteredAllocations = useMemo(() => {
    if (selectedVendorFilter === 'ALL') return vendorAllocations;
    return vendorAllocations.filter((va) => va.vendorId === selectedVendorFilter);
  }, [vendorAllocations, selectedVendorFilter]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* HEADER & TAHUN AJARAN TARGET */}
      <div
        style={{
          background: '#ffffff',
          borderRadius: '12px',
          border: '1px solid #e2e8f0',
          padding: '20px 24px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '16px',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '1.6rem' }}>📊</span>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.25rem', color: '#0f172a' }}>
                Prediksi & Rencana Produksi Seragam ({targetYear})
              </h3>
              <p style={{ margin: '4px 0 0 0', fontSize: '0.86rem', color: '#64748b' }}>
                Kalkulasi otomatis target baju jadi per ukuran ke masing-masing vendor penjahit berdasarkan plotting sekolah.
              </p>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label style={{ fontSize: '0.86rem', fontWeight: 600, color: '#334155' }}>Tahun Target:</label>
            <select
              value={targetYear}
              onChange={(e) => setTargetYear(e.target.value)}
              style={{
                padding: '8px 12px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                fontSize: '0.88rem',
                fontWeight: 600,
                background: '#fff',
                color: '#0284c7',
                outline: 'none',
              }}
            >
              <option value="2027/2028">2027/2028</option>
              <option value="2028/2029">2028/2029</option>
              <option value="2029/2030">2029/2030</option>
              <option value="2026/2027">2026/2027</option>
            </select>
          </div>

          <button
            type="button"
            onClick={handleDownloadTemplate}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              border: '1px solid #0284c7',
              background: '#f0f9ff',
              color: '#0284c7',
              fontSize: '0.86rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.15s ease',
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.background = '#0284c7';
              e.currentTarget.style.color = '#ffffff';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = '#f0f9ff';
              e.currentTarget.style.color = '#0284c7';
            }}
            title="Unduh format Excel resmi untuk diisi rencana prediksi per ukuran"
          >
            <span>📥</span> Unduh Template Excel
          </button>
        </div>
      </div>

      {/* STATS CARDS */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
          gap: '14px',
        }}
      >
        <div
          style={{
            background: '#ffffff',
            padding: '14px 18px',
            borderRadius: '10px',
            border: '1px solid #e2e8f0',
            boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>Total Rencana Produksi</div>
            <div style={{ fontSize: '1.45rem', fontWeight: 700, color: '#0284c7', marginTop: '2px' }}>
              {stats.totalPcs.toLocaleString('id-ID')}{' '}
              <span style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: 400 }}>pcs</span>
            </div>
          </div>
          <span style={{ fontSize: '1.8rem', opacity: 0.85 }}>👕</span>
        </div>

        <div
          style={{
            background: '#ffffff',
            padding: '14px 18px',
            borderRadius: '10px',
            border: '1px solid #e2e8f0',
            boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>Jenis Seragam Terdata</div>
            <div style={{ fontSize: '1.45rem', fontWeight: 700, color: '#059669', marginTop: '2px' }}>
              {stats.totalItems}{' '}
              <span style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: 400 }}>seragam</span>
            </div>
          </div>
          <span style={{ fontSize: '1.8rem', opacity: 0.85 }}>📋</span>
        </div>

        <div
          style={{
            background: '#ffffff',
            padding: '14px 18px',
            borderRadius: '10px',
            border: '1px solid #e2e8f0',
            boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>Vendor Terlibat Alokasi</div>
            <div style={{ fontSize: '1.45rem', fontWeight: 700, color: '#3b82f6', marginTop: '2px' }}>
              {vendorAllocations.filter((v) => v.grandTotalPcs > 0).length}{' '}
              <span style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: 400 }}>vendor</span>
            </div>
          </div>
          <span style={{ fontSize: '1.8rem', opacity: 0.85 }}>🏭</span>
        </div>

        <div
          style={{
            background: '#ffffff',
            padding: '14px 18px',
            borderRadius: '10px',
            border: '1px solid #e2e8f0',
            boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>Jenjang Sekolah Tercover</div>
            <div style={{ fontSize: '1.45rem', fontWeight: 700, color: '#8b5cf6', marginTop: '2px' }}>
              {stats.uniqueLevels}{' '}
              <span style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: 400 }}>jenjang</span>
            </div>
          </div>
          <span style={{ fontSize: '1.8rem', opacity: 0.85 }}>🏫</span>
        </div>
      </div>

      {/* DROPZONE DRAG & DROP FILE EXCEL */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        style={{
          border: isDragging ? '2px dashed #0284c7' : '2px dashed #cbd5e1',
          background: isDragging ? '#f0f9ff' : '#f8fafc',
          borderRadius: '12px',
          padding: '28px 20px',
          textAlign: 'center',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
          boxShadow: isDragging ? '0 4px 12px rgba(2,132,199,0.1)' : 'none',
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={handleFileInputChange}
          style={{ display: 'none' }}
        />
        <div style={{ fontSize: '2.4rem', marginBottom: '8px' }}>📂</div>
        <div style={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b' }}>
          Tarik & Lepas (Drag & Drop) File Excel Rencana Produksi ke Sini
        </div>
        <p style={{ margin: '6px 0 0 0', fontSize: '0.85rem', color: '#64748b' }}>
          atau <span style={{ color: '#0284c7', textDecoration: 'underline', fontWeight: 600 }}>klik di sini</span> untuk memilih file dari komputer (.xlsx / .xls)
        </p>
        <p style={{ margin: '8px 0 0 0', fontSize: '0.78rem', color: '#94a3b8' }}>
          💡 Sistem akan otomatis membaca target per jenis seragam, per ukuran, dan langsung menghitung persentase alokasi tiap vendor.
        </p>
      </div>

      {/* NOTIFIKASI BERHASIL SIMPAN */}
      {saveSuccessMessage && (
        <div
          style={{
            background: '#f0fdf4',
            border: '1px solid #bbf7d0',
            color: '#166534',
            padding: '12px 18px',
            borderRadius: '8px',
            fontSize: '0.9rem',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            animation: 'fadeIn 0.2s ease',
          }}
        >
          {saveSuccessMessage}
        </div>
      )}

      {/* SUB-TABS: MATRIKS RENCANA GLOBAL vs HASIL ALOKASI VENDOR */}
      <div className="kopkar-table-container">
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '14px 18px',
            borderBottom: '1px solid #e2e8f0',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          {/* Tab Switcher */}
          <div
            style={{
              display: 'flex',
              background: '#f1f5f9',
              borderRadius: '8px',
              padding: '3px',
              border: '1px solid #e2e8f0',
            }}
          >
            <button
              type="button"
              onClick={() => setActiveSubTab('input')}
              style={{
                border: 'none',
                background: activeSubTab === 'input' ? '#ffffff' : 'transparent',
                color: activeSubTab === 'input' ? '#0284c7' : '#64748b',
                fontWeight: activeSubTab === 'input' ? 700 : 500,
                padding: '7px 16px',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '0.88rem',
                boxShadow: activeSubTab === 'input' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              📋 Rencana Global & Skala ({forecastItems.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveSubTab('allocation')}
              style={{
                border: 'none',
                background: activeSubTab === 'allocation' ? '#ffffff' : 'transparent',
                color: activeSubTab === 'allocation' ? '#0284c7' : '#64748b',
                fontWeight: activeSubTab === 'allocation' ? 700 : 500,
                padding: '7px 16px',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '0.88rem',
                boxShadow: activeSubTab === 'allocation' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              🏭 Hasil Alokasi Vendor (SPK)
            </button>
          </div>

          {/* Action & Filter Controls */}
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            {activeSubTab === 'input' && (
              <>
                <select
                  value={selectedLevelFilter}
                  onChange={(e) => setSelectedLevelFilter(e.target.value)}
                  style={{
                    padding: '7px 12px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '0.86rem',
                    background: '#fff',
                    color: '#1e293b',
                    outline: 'none',
                  }}
                >
                  <option value="ALL">Semua Jenjang</option>
                  <option value="TK">TK</option>
                  <option value="SD">SD</option>
                  <option value="SMP">SMP</option>
                  <option value="SMA">SMA</option>
                  <option value="SPK-SD">SPK-SD</option>
                  <option value="SPK-SMP">SPK-SMP</option>
                  <option value="SPK-SMA">SPK-SMA</option>
                </select>

                <input
                  type="text"
                  placeholder="🔍 Cari nama seragam..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    padding: '7px 12px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '0.86rem',
                    outline: 'none',
                    minWidth: '180px',
                  }}
                />

                {forecastItems.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm('Yakin ingin mengosongkan data rencana produksi ini?')) {
                        setForecastItems([]);
                        handleSaveForecast([]);
                      }
                    }}
                    style={{
                      background: '#fee2e2',
                      border: '1px solid #fca5a5',
                      color: '#dc2626',
                      padding: '7px 12px',
                      borderRadius: '8px',
                      fontSize: '0.84rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                    title="Kosongkan data"
                  >
                    🗑️ Reset
                  </button>
                )}
              </>
            )}

            {activeSubTab === 'allocation' && (
              <>
                <select
                  value={selectedVendorFilter}
                  onChange={(e) => setSelectedVendorFilter(e.target.value)}
                  style={{
                    padding: '7px 12px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '0.86rem',
                    background: '#fff',
                    color: '#1e293b',
                    outline: 'none',
                  }}
                >
                  <option value="ALL">Semua Vendor ({vendorAllocations.length})</option>
                  {vendorAllocations.map((va) => (
                    <option key={va.vendorId} value={va.vendorId}>
                      {va.vendorName} ({va.grandTotalPcs} pcs)
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={handleExportAllVendors}
                  disabled={vendorAllocations.length === 0}
                  style={{
                    background: vendorAllocations.length === 0 ? '#94a3b8' : '#10b981',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '8px 14px',
                    fontSize: '0.86rem',
                    fontWeight: 600,
                    cursor: vendorAllocations.length === 0 ? 'not-allowed' : 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
                  }}
                  title="Ekspor seluruh SPK vendor ke file Excel multi-sheet"
                >
                  <span>📥</span> Ekspor Semua SPK Vendor (.xlsx)
                </button>
              </>
            )}
          </div>
        </div>

        {/* ISI TAB 1: RENCANA GLOBAL & SKALA UKURAN */}
        {activeSubTab === 'input' && (
          <div style={{ overflowX: 'auto' }}>
            {loading ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
                Memuat data rencana produksi...
              </div>
            ) : filteredForecastItems.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: '#64748b' }}>
                <p style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, color: '#334155' }}>
                  Belum ada data rencana produksi untuk tahun {targetYear}.
                </p>
                <p style={{ margin: '6px 0 0 0', fontSize: '0.86rem' }}>
                  Silakan unduh template Excel di atas, isi angka per ukuran, lalu tarik & lepas (drag-and-drop) file Excel ke kotak di atas.
                </p>
              </div>
            ) : (
              <table className="kopkar-table" style={{ margin: 0, fontSize: '0.86rem' }}>
                <thead>
                  <tr>
                    <th style={{ width: '45px', textAlign: 'center' }}>No</th>
                    <th style={{ width: '85px', textAlign: 'center' }}>Jenjang</th>
                    <th style={{ minWidth: '220px' }}>Nama Jenis Seragam</th>
                    <th style={{ width: '100px', textAlign: 'center', background: '#f0f9ff', color: '#0369a1' }}>Total (Pcs)</th>
                    {detectedSizes.map((sz) => (
                      <th key={sz} style={{ width: '65px', textAlign: 'center' }}>
                        {sz}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredForecastItems.map((item, idx) => (
                    <tr key={item.id} style={{ background: idx % 2 === 0 ? '#fff' : '#fafafa' }}>
                      <td style={{ textAlign: 'center', color: '#64748b', fontWeight: 600 }}>{idx + 1}</td>
                      <td style={{ textAlign: 'center' }}>
                        <span
                          style={{
                            background: '#f1f5f9',
                            color: '#334155',
                            padding: '2px 8px',
                            borderRadius: '4px',
                            fontWeight: 700,
                            fontSize: '0.78rem',
                          }}
                        >
                          {item.level}
                        </span>
                      </td>
                      <td>
                        <strong style={{ color: '#0f172a' }}>{item.uniformName}</strong>
                      </td>
                      <td style={{ textAlign: 'center', background: '#f0f9ff', fontWeight: 700, color: '#0369a1' }}>
                        {item.total.toLocaleString('id-ID')}
                      </td>
                      {detectedSizes.map((sz) => {
                        const qty = item.sizes[sz] || 0;
                        const pct = item.total > 0 && qty > 0 ? Math.round((qty / item.total) * 100) : 0;
                        return (
                          <td key={sz} style={{ textAlign: 'center', verticalAlign: 'middle' }}>
                            {qty > 0 ? (
                              <div>
                                <span style={{ fontWeight: 700, color: '#1e293b' }}>{qty}</span>
                                <div style={{ fontSize: '0.7rem', color: '#0284c7', fontWeight: 600 }}>
                                  {pct}%
                                </div>
                              </div>
                            ) : (
                              <span style={{ color: '#cbd5e1' }}>-</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* ISI TAB 2: HASIL ALOKASI VENDOR (SPK PRODUKSI) */}
        {activeSubTab === 'allocation' && (
          <div style={{ padding: '18px 20px' }}>
            {filteredAllocations.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: '#64748b' }}>
                <p style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, color: '#334155' }}>
                  Belum ada vendor yang mendapatkan alokasi produksi.
                </p>
                <p style={{ margin: '6px 0 0 0', fontSize: '0.86rem' }}>
                  Pastikan data rencana produksi sudah di-drop, dan sekolah-sekolah di jenjang terkait sudah di-plot ke vendor di tab &quot;Plotting & Rekap Sekolah&quot;.
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                {filteredAllocations.map((va) => (
                  <div
                    key={va.vendorId}
                    style={{
                      background: '#ffffff',
                      borderRadius: '12px',
                      border: '1px solid #e2e8f0',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.03)',
                      overflow: 'hidden',
                    }}
                  >
                    {/* Header Vendor Card */}
                    <div
                      style={{
                        background: '#f8fafc',
                        padding: '16px 20px',
                        borderBottom: '1px solid #e2e8f0',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: '12px',
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span style={{ fontSize: '1.4rem' }}>🏢</span>
                          <strong style={{ fontSize: '1.15rem', color: '#0f172a' }}>{va.vendorName}</strong>
                          <span
                            style={{
                              background: '#f0fdf4',
                              color: '#166534',
                              border: '1px solid #bbf7d0',
                              padding: '2px 10px',
                              borderRadius: '999px',
                              fontWeight: 700,
                              fontSize: '0.78rem',
                            }}
                          >
                            {va.schoolNames.length} Sekolah Di-plot
                          </span>
                        </div>
                        <div style={{ fontSize: '0.82rem', color: '#64748b', marginTop: '4px', marginLeft: '32px' }}>
                          👤 PIC: <strong>{va.contactPerson}</strong> • 📞 Telp: <strong>{va.phone}</strong>
                        </div>
                        {va.schoolNames.length > 0 && (
                          <div style={{ fontSize: '0.8rem', color: '#475569', marginTop: '6px', marginLeft: '32px' }}>
                            🏫 <em>{va.schoolNames.join(', ')}</em>
                          </div>
                        )}
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600 }}>Total Alokasi Jahit</div>
                          <div style={{ fontSize: '1.35rem', fontWeight: 700, color: '#0284c7' }}>
                            {va.grandTotalPcs.toLocaleString('id-ID')}{' '}
                            <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 400 }}>pcs</span>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleExportVendorSPK(va)}
                          style={{
                            background: '#0284c7',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: '8px',
                            padding: '8px 14px',
                            fontSize: '0.84rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
                          }}
                          title="Unduh SPK kerja untuk vendor ini dalam format Excel"
                        >
                          <span>📥</span> Ekspor SPK (.xlsx)
                        </button>
                      </div>
                    </div>

                    {/* Tabel SPK Rincian Baju & Ukuran untuk Vendor Ini */}
                    <div style={{ overflowX: 'auto' }}>
                      <table className="kopkar-table" style={{ margin: 0, border: 'none', fontSize: '0.84rem' }}>
                        <thead style={{ background: '#ffffff' }}>
                          <tr>
                            <th style={{ width: '40px', textAlign: 'center' }}>No</th>
                            <th style={{ width: '75px', textAlign: 'center' }}>Jenjang</th>
                            <th style={{ minWidth: '200px' }}>Nama Jenis Seragam</th>
                            <th style={{ width: '130px', textAlign: 'center' }}>Porsi Plotting</th>
                            {detectedSizes.map((sz) => (
                              <th key={sz} style={{ width: '55px', textAlign: 'center' }}>
                                {sz}
                              </th>
                            ))}
                            <th style={{ width: '90px', textAlign: 'center', background: '#f0fdf4', color: '#166534' }}>
                              Total (Pcs)
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {va.items.length === 0 ? (
                            <tr>
                              <td colSpan={5 + detectedSizes.length} style={{ textAlign: 'center', padding: '20px', color: '#94a3b8' }}>
                                Tidak ada seragam yang dialokasikan untuk vendor ini pada rencana saat ini.
                              </td>
                            </tr>
                          ) : (
                            va.items.map((it, idx) => (
                              <tr key={idx} style={{ background: idx % 2 === 0 ? '#fff' : '#fafafa' }}>
                                <td style={{ textAlign: 'center', color: '#64748b' }}>{idx + 1}</td>
                                <td style={{ textAlign: 'center' }}>
                                  <span
                                    style={{
                                      background: '#f1f5f9',
                                      color: '#334155',
                                      padding: '2px 6px',
                                      borderRadius: '4px',
                                      fontWeight: 600,
                                      fontSize: '0.75rem',
                                    }}
                                  >
                                    {it.level}
                                  </span>
                                </td>
                                <td>
                                  <strong>{it.uniformName}</strong>
                                </td>
                                <td style={{ textAlign: 'center' }}>
                                  <span
                                    style={{
                                      background: '#e0f2fe',
                                      color: '#0369a1',
                                      padding: '3px 8px',
                                      borderRadius: '6px',
                                      fontSize: '0.76rem',
                                      fontWeight: 600,
                                    }}
                                  >
                                    {it.sharePercentage}% ({it.schoolCount}/{it.totalSchoolsInLevel} Sek.)
                                  </span>
                                </td>
                                {detectedSizes.map((sz) => {
                                  const qty = it.sizes[sz] || 0;
                                  return (
                                    <td key={sz} style={{ textAlign: 'center', fontWeight: qty > 0 ? 700 : 400, color: qty > 0 ? '#0f172a' : '#cbd5e1' }}>
                                      {qty > 0 ? qty : '-'}
                                    </td>
                                  );
                                })}
                                <td style={{ textAlign: 'center', background: '#f0fdf4', fontWeight: 700, color: '#166534' }}>
                                  {it.total.toLocaleString('id-ID')}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                        {va.items.length > 0 && (
                          <tfoot>
                            <tr style={{ background: '#f8fafc', fontWeight: 700 }}>
                              <td colSpan={4} style={{ textAlign: 'right', padding: '10px 14px' }}>
                                GRAND TOTAL VENDOR:
                              </td>
                              {detectedSizes.map((sz) => {
                                const totalCol = va.items.reduce((sum, it) => sum + (it.sizes[sz] || 0), 0);
                                return (
                                  <td key={sz} style={{ textAlign: 'center', color: '#0f172a' }}>
                                    {totalCol > 0 ? totalCol : '-'}
                                  </td>
                                );
                              })}
                              <td style={{ textAlign: 'center', background: '#dcfce7', color: '#15803d', fontSize: '0.92rem' }}>
                                {va.grandTotalPcs.toLocaleString('id-ID')}
                              </td>
                            </tr>
                          </tfoot>
                        )}
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default KopkarPrediksiProduksi;
