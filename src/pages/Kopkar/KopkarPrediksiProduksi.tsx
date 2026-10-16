import React, { useState, useEffect, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '../../lib/supabase';

export interface ForecastItem {
  id: string;
  level: string; // TK, SD, SMP, SMA, SPK-SD, dll.
  uniformName: string; // e.g. Kemeja Putih, Celana Merah, dll.
  sizes: Record<string, number>; // e.g. { SS: 500, S: 750, M: 1250, ... }
  total: number;
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
      }> = [];

      vendors.forEach((v) => {
        const vSchools = vendorLevelSchools.get(v.id)?.get(itemLevel);
        const count = vSchools ? vSchools.size : 0;
        if (count > 0) {
          activeVendorsForLevel.push({ vendorId: v.id, schoolCount: count });
        }
      });

      // Total sekolah yang di-plot pada jenjang ini lintas semua vendor
      const totalSchoolsInLevel = activeVendorsForLevel.reduce((sum, av) => sum + av.schoolCount, 0);

      if (totalSchoolsInLevel === 0) {
        // Belum ada vendor yang di-plot untuk jenjang ini
        return;
      }

      // Distribusikan tiap ukuran ke masing-masing vendor
      // Kita hitung per ukuran dan lakukan perataan sisa pembulatan (remainder balancing)
      const allocatedSizesByVendor = new Map<string, Record<string, number>>();
      activeVendorsForLevel.forEach((av) => {
        allocatedSizesByVendor.set(av.vendorId, {});
      });

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

      // Masukkan ke struktur alokasi masing-masing vendor
      activeVendorsForLevel.forEach((av) => {
        const vendorSizes = allocatedSizesByVendor.get(av.vendorId) || {};
        const itemTotal = Object.values(vendorSizes).reduce((a, b) => a + b, 0);
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

    return Array.from(allocationByVendor.values()).filter((a) => a.items.length > 0 || a.schoolNames.length > 0);
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
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];

        // Konversi ke format JSON array of objects
        const rawRows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet);

        if (rawRows.length === 0) {
          alert('File Excel kosong atau format tabel tidak terbaca.');
          setLoading(false);
          return;
        }

        const parsedItems: ForecastItem[] = [];

        rawRows.forEach((row, idx) => {
          // Deteksi kolom jenjang
          const levelRaw =
            row['Jenjang'] ||
            row['jenjang'] ||
            row['Level'] ||
            row['level'] ||
            row['Tingkat'] ||
            'SEMUA';
          const level = String(levelRaw).toUpperCase().trim();

          // Deteksi kolom nama barang
          const nameRaw =
            row['Nama Seragam'] ||
            row['nama seragam'] ||
            row['Jenis Baju'] ||
            row['Nama Barang'] ||
            row['Barang'] ||
            row['Item'] ||
            '';
          const uniformName = String(nameRaw).trim();

          if (!uniformName) return; // Lewati baris tanpa nama seragam

          // Kumpulkan kolom ukuran
          const sizes: Record<string, number> = {};
          let rowTotal = 0;

          Object.entries(row).forEach(([colKey, val]) => {
            const cleanKey = colKey.trim();
            // Abaikan kolom non-ukuran
            if (
              [
                'no',
                'no.',
                'nomor',
                'jenjang',
                'level',
                'tingkat',
                'nama seragam',
                'jenis baju',
                'nama barang',
                'barang',
                'item',
                'total',
                'total pcs',
                'total rencana',
                'keterangan',
                'tipe ukuran',
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
            parsedItems.push({
              id: `fc-${Date.now()}-${idx}`,
              level,
              uniformName,
              sizes,
              total: rowTotal,
            });
          }
        });

        if (parsedItems.length === 0) {
          alert('Tidak ada angka ukuran seragam yang valid (> 0) dalam file Excel tersebut.');
        } else {
          setForecastItems(parsedItems);
          handleSaveForecast(parsedItems);
          setSaveSuccessMessage(`🎉 Berhasil memuat ${parsedItems.length} jenis seragam dari file "${file.name}"!`);
          setTimeout(() => setSaveSuccessMessage(null), 5000);
        }
      } catch (err: any) {
        console.error('Error parsing Excel:', err);
        alert('Gagal membaca file Excel. Pastikan format kolom sesuai template: ' + (err.message || ''));
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
  // 3. GENERATOR TEMPLATE EXCEL RESMI DENGAN DAFTAR SERAGAM DATABASE
  // =========================================================================
  const handleDownloadTemplate = () => {
    // Ambil semua seragam unik dari produk database
    const seragamProducts = products.filter((p) => p.category === 'seragam');

    // Buat peta unik: level + name -> daftar ukuran yang terdaftar
    const uniformMap = new Map<string, { level: string; name: string; registeredSizes: Set<string> }>();

    seragamProducts.forEach((p) => {
      const lvl = (p.level || 'SEMUA').toUpperCase().trim();
      const name = p.name.trim();
      const key = `${lvl}___${name}`;

      if (!uniformMap.has(key)) {
        uniformMap.set(key, { level: lvl, name, registeredSizes: new Set() });
      }
      if (p.size) uniformMap.get(key)!.registeredSizes.add(p.size.trim());
    });

    // Jika database kosong, sediakan daftar seragam standar Penabur
    const uniformList = Array.from(uniformMap.values());
    if (uniformList.length === 0) {
      const defaultSamples = [
        { level: 'TK', name: 'Kotak-Kotak Putra', registeredSizes: new Set(['SS', 'S', 'M', 'L', 'XL', '3L']) },
        { level: 'TK', name: 'Kotak-Kotak Putri', registeredSizes: new Set(['SS', 'S', 'M', 'L', 'XL', '3L']) },
        { level: 'SD', name: 'Kemeja Putih', registeredSizes: new Set(['SS', 'S', 'M', 'L', 'XL', '3L', '4L']) },
        { level: 'SD', name: 'Celana Merah', registeredSizes: new Set(['SS', 'S', 'M', 'L', 'XL', '3L', '4L']) },
        { level: 'SD', name: 'Kulot Merah', registeredSizes: new Set(['SS', 'S', 'M', 'L', 'XL', '3L', '4L']) },
        { level: 'SD', name: 'Rompi Kotak', registeredSizes: new Set(['SS', 'S', 'M', 'L', 'XL', '3L', '4L']) },
        { level: 'SMP', name: 'Kemeja Putih', registeredSizes: new Set(['SS', 'S', 'M', 'L', 'XL', '3L', '4L']) },
        { level: 'SMP', name: 'Celana Biru', registeredSizes: new Set(['25', '26', '27', '28', '29', '30', '31', '32', '33', '34']) },
        { level: 'SMA', name: 'Kemeja Putih', registeredSizes: new Set(['SS', 'S', 'M', 'L', 'XL', '3L', '4L']) },
        { level: 'SMA', name: 'Celana Abu', registeredSizes: new Set(['27', '28', '29', '30', '31', '32', '33', '34', '35', '36']) },
      ];
      uniformList.push(...defaultSamples);
    }

    // Urutkan berdasarkan jenjang: TK -> SD -> SMP -> SMA -> SPK
    const levelOrder = ['TK', 'SD', 'SMP', 'SMA', 'SPK-SD', 'SPK-SMP', 'SPK-SMA', 'SEMUA'];
    uniformList.sort((a, b) => {
      const idxA = levelOrder.indexOf(a.level);
      const idxB = levelOrder.indexOf(b.level);
      if (idxA !== idxB) return (idxA === -1 ? 99 : idxA) - (idxB === -1 ? 99 : idxB);
      return a.name.localeCompare(b.name, 'id', { numeric: true });
    });

    // Susun baris template
    const templateRows = uniformList.map((u, idx) => {
      const row: Record<string, any> = {
        No: idx + 1,
        Jenjang: u.level,
        'Nama Seragam': u.name,
      };

      // Tentukan apakah seragam ini cenderung ukuran angka (celana SMP/SMA) atau ukuran huruf
      const isNumberSized = Array.from(u.registeredSizes).some((s) => /^\d+$/.test(s));

      if (isNumberSized) {
        // Kolom ukuran celana nomor
        const numSizes = ['25', '26', '27', '28', '29', '30', '31', '32', '33', '34', '35', '36', '37', '38', '39', '40', 'KHUSUS'];
        numSizes.forEach((sz) => {
          row[sz] = '';
        });
      } else {
        // Kolom ukuran huruf
        const letterSizes = ['SS', 'S', 'M', 'L', 'XL', '2L', '3L', '4L', '5L', '6L', 'KHUSUS'];
        letterSizes.forEach((sz) => {
          row[sz] = '';
        });
      }

      return row;
    });

    const worksheet = XLSX.utils.json_to_sheet(templateRows);

    // Styling lebar kolom
    worksheet['!cols'] = [
      { wch: 6 }, // No
      { wch: 12 }, // Jenjang
      { wch: 34 }, // Nama Seragam
      ...Array(20).fill({ wch: 8 }), // Kolom-kolom ukuran
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Rencana_Produksi');
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
