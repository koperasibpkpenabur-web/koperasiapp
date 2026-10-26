import React, { useState, useEffect, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import * as ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import jsPDF from 'jspdf';
import autoTable, { applyPlugin } from 'jspdf-autotable';

// Pastikan plugin terpasang pada prototype jsPDF
try {
  applyPlugin(jsPDF);
} catch {
  // plugin may already be attached
}
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
  schoolBreakdown?: Record<string, Record<string, number>>;
  schoolsForItem?: string[];
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

// Standar urutan resmi jenjang sekolah: TK, SD, SMP, SMA, SPK-SD, SPK-SMP, SPK-SMA
export const LEVEL_ORDER = [
  'TK',
  'SD',
  'SMP',
  'SMA',
  'SPK-SD',
  'SPK-SMP',
  'SPK-SMA',
];

export const getLevelRank = (lvl: string): number => {
  const u = (lvl || '').toUpperCase().trim();
  if (u === 'TK' || u === 'TKK') return 1;
  if (u === 'SD' || u === 'SDK') return 2;
  if (u === 'SMP' || u === 'SMPK') return 3;
  if (u === 'SMA' || u === 'SMAK' || u === 'SMK' || u === 'SMKF') return 4;
  if (u === 'SPK-SD' || u === 'SD-SPK' || u.includes('PRIMARY')) return 5;
  if (u === 'SPK-SMP' || u === 'SMP-SPK' || u.includes('LOWER')) return 6;
  if (u === 'SPK-SMA' || u === 'SMA-SPK' || u.includes('UPPER')) return 7;
  return 99;
};

export const normalizeLevel = (lvl: string): string => {
  const u = (lvl || '').toUpperCase().trim();
  if (u === 'TK' || u === 'TKK') return 'TK';
  if (u === 'SD' || u === 'SDK') return 'SD';
  if (u === 'SMP' || u === 'SMPK') return 'SMP';
  if (u === 'SMA' || u === 'SMAK' || u === 'SMK' || u === 'SMKF') return 'SMA';
  if (u === 'SD-SPK' || u === 'SPK-SD' || u.includes('PRIMARY')) return 'SPK-SD';
  if (u === 'SMP-SPK' || u === 'SPK-SMP' || u.includes('LOWER')) return 'SPK-SMP';
  if (u === 'SMA-SPK' || u === 'SPK-SMA' || u.includes('UPPER')) return 'SPK-SMA';
  return u;
};

export const getLevelDisplayTitle = (lvl: string): string => {
  const u = (lvl || '').toUpperCase().trim();
  if (u === 'SPK-SD' || u === 'SD-SPK') return 'SPK-SD (Primary)';
  if (u === 'SPK-SMP' || u === 'SMP-SPK') return 'SPK-SMP (Lower Secondary)';
  if (u === 'SPK-SMA' || u === 'SMA-SPK') return 'SPK-SMA (Upper Secondary)';
  return u;
};

export const splitClothingTypes = (raw?: string): string[] => {
  if (!raw) return [];
  return raw
    .split(/,(?![^(]*\))/)
    .map((s) => s.trim())
    .filter(Boolean);
};

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
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);
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
            const hasCorrupt = parsed.some((it: any) => Number(it.total) > 100000000 || Object.values(it.sizes || {}).some((s: any) => Number(s) > 100000000));
            if (!hasCorrupt) {
              setForecastItems(parsed);
              setLoading(false);
              return;
            } else {
              // Hapus data korup dari database
              await supabase.from('app_settings').delete().eq('key', storageKey);
            }
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
            const hasCorrupt = parsedLocal.some((it: any) => Number(it.total) > 100000000 || Object.values(it.sizes || {}).some((s: any) => Number(s) > 100000000));
            if (!hasCorrupt) {
              setForecastItems(parsedLocal);
            } else {
              localStorage.removeItem(storageKey);
              setForecastItems([]);
            }
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
  // 1. HELPER PENCATATAN, JENJANG, KODE SEKOLAH & PENCOCOKAN JENIS BARANG
  // =========================================================================
  const resolveSchoolLevel = (schoolName: string, email?: string, existingLevel?: string): string => {
    const n = (schoolName || '').toUpperCase();
    const e = (email || '').toLowerCase();

    // Prioritas 1: SPK / International (Primary, Lower, Upper)
    if (n.includes('PRIMARY') || n.includes('SPK-SD') || n.includes('SD-SPK') || e.includes('primary')) return 'SPK-SD';
    if (n.includes('LOWER') || n.includes('SPK-SMP') || n.includes('SMP-SPK') || e.includes('lower')) return 'SPK-SMP';
    if (n.includes('UPPER') || n.includes('SPK-SMA') || n.includes('SMA-SPK') || e.includes('upper')) return 'SPK-SMA';

    // Prioritas 2: Awalan nama resmi & email sekolah BPK PENABUR
    if (n.startsWith('TKK') || n.includes('TKK ') || n.includes('TK ') || e.includes('tkk') || e.includes('penjualan.k')) return 'TK';
    if (n.startsWith('SDK') || n.includes('SDK ') || n.includes('SD ') || e.includes('sdk') || e.includes('penjualan.d')) return 'SD';
    if (n.startsWith('SMPK') || n.includes('SMPK ') || n.includes('SMP ') || e.includes('smpk') || e.includes('penjualan.p')) return 'SMP';
    if (n.startsWith('SMAK') || n.startsWith('SMKF') || n.includes('SMAK ') || n.includes('SMA ') || n.includes('SMK') || e.includes('smak') || e.includes('penjualan.a')) return 'SMA';

    // Prioritas 2: Level yang sudah ada
    const cleanLvl = (existingLevel || '').toUpperCase().trim();
    if (cleanLvl) {
      if (cleanLvl === 'SPK-SD' || cleanLvl === 'SD-SPK') return 'SPK-SD';
      if (cleanLvl === 'SPK-SMP' || cleanLvl === 'SMP-SPK') return 'SPK-SMP';
      if (cleanLvl === 'SPK-SMA' || cleanLvl === 'SMA-SPK') return 'SPK-SMA';
      return cleanLvl;
    }

    return '';
  };

  const getLevelPrefix = (level?: string, schoolName?: string): string => {
    const lvl = (level || '').toUpperCase().trim();
    const n = (schoolName || '').toLowerCase().trim();

    if (lvl.includes('TK') || lvl.includes('TKK') || n.startsWith('tkk') || n.includes(' tk ') || n.startsWith('tk ')) return 'K';
    if (lvl.includes('SD') || lvl.includes('SDK') || n.startsWith('sdk') || n.includes(' sd ') || n.startsWith('sd ')) return 'D';
    if (lvl.includes('SMP') || lvl.includes('SMPK') || n.startsWith('smpk') || n.includes(' smp ') || n.startsWith('smp ')) return 'P';
    if (lvl.includes('SMA') || lvl.includes('SMAK') || lvl.includes('SMK') || n.startsWith('smak') || n.startsWith('smk') || n.includes(' sma ') || n.startsWith('sma ')) return 'A';

    return 'D';
  };

  const getSchoolDisplayCode = (schoolName: string, email?: string, level?: string): string => {
    const n = (schoolName || '').toLowerCase().trim();
    const e = (email || '').toLowerCase().trim();
    const prefix = getLevelPrefix(level, schoolName);

    // 1. PIS (PENABUR International School): PIS KG untuk Kelapa Gading dan PIS TD untuk Tanjung Duren
    if (n.includes('international') || n.includes('pis') || e.includes('pis')) {
      if (n.includes('gading') || e.includes('pis.kg') || e.includes('pis_kg')) return 'PIS KG';
      if (n.includes('duren') || e.includes('pis.td') || e.includes('pis_td')) return 'PIS TD';
      return 'PIS';
    }

    // 2. Tirtamarta: Tirtamarta 1 = TM 1, Tirtamarta 2 = TM 2
    if (n.includes('tirtamarta 1') || n.includes('pondok indah') || e.includes('tirtamarta1') || e.includes('tirtamarta_1')) return 'TM 1';
    if (n.includes('tirtamarta 2') || n.includes('cinere') || e.includes('tirtamarta2') || e.includes('tirtamarta_2')) return 'TM 2';
    if (n.includes('tirtamarta')) return 'TM 1';

    // 3. SMK Farmasi & Kelapa Gading Indah
    if (n.includes('farmasi') || e.includes('smkf')) return 'SMKF';
    if (n.includes('kelapa gading indah') || e.includes('dkgi') || e.includes('kgi')) return 'DKGI';

    // 4. Cabang Daerah dengan awalan jenjang (K: TK, D: SD, P: SMP, A: SMA):
    // Gading Serpong: KGS, DGS, PGS, AGS
    if (n.includes('gading serpong') || e.includes('dgs') || e.includes('kgs') || e.includes('pgs') || e.includes('ags')) return prefix + 'GS';
    // Bintaro Jaya: KBJ, DBJ, PBJ, ABJ
    if (n.includes('bintaro jaya') || e.includes('dbj') || e.includes('kbj') || e.includes('pbj') || e.includes('abj')) return prefix + 'BJ';
    // Kota Wisata: KKW, DKW, PKW, AKW
    if (n.includes('kota wisata') || e.includes('dkw') || e.includes('kkw') || e.includes('pkw') || e.includes('akw') || e.includes('kowis')) return prefix + 'KW';
    // Harapan Indah: KHI, DHI, PHI, AHI
    if (n.includes('harapan indah') || e.includes('dhi') || e.includes('khi') || e.includes('phi') || e.includes('ahi')) return prefix + 'HI';
    // Kota Modern: KKM, DKM, PKM, AKM
    if (n.includes('kota modern') || e.includes('dkm') || e.includes('kkm') || e.includes('pkm') || e.includes('akm')) return prefix + 'KM';
    // Agus Salim: KAG (TK), DAS (SD), PAS (SMP), AAS (SMA)
    if (n.includes('agus salim') || e.includes('das') || e.includes('kas') || e.includes('pas') || e.includes('aas')) {
      if (prefix === 'K') return 'KAG';
      return prefix + 'AS';
    }
    // Depok: KDP, DDP, PDP, ADP
    if (n.includes('depok') || e.includes('ddp') || e.includes('kdp') || e.includes('pdp') || e.includes('adp')) return prefix + 'DP';
    // Summarecon Bekasi: KSB, DSB, PSB, ASB
    if (n.includes('summarecon') || n.includes('sumarecon') || e.includes('dsb') || e.includes('ksb') || e.includes('psb') || e.includes('asb') || e.includes('sumbek')) return prefix + 'SB';
    // Kota Jababeka: KKJ, DKJ, PKJ, AKJ
    if (n.includes('jababeka') || e.includes('dkj') || e.includes('kkj') || e.includes('pkj') || e.includes('akj')) return prefix + 'KJ';
    // Kota Tangerang: AKT
    if (n.includes('kota tangerang') || e.includes('akt')) return prefix + 'KT';

    // 5. Nomor urut: TKK 1 = K01, SDK 1 = D01, SMPK 1 = P01, SMAK 1 = A01
    const nameMatch = n.match(/(tkk|sdk|smpk|smak|tk|sd|smp|sma)\s*(\d+)/i);
    if (nameMatch) {
      const num = parseInt(nameMatch[2], 10);
      const numPad = num < 10 ? '0' + num : String(num);
      return prefix + numPad;
    }

    const emailMatch = e.match(/penjualan\.([a-z0-9]+)@/);
    if (emailMatch) {
      const code = emailMatch[1].toUpperCase();
      const numMatch = code.match(/(\d+)/);
      if (numMatch) {
        const num = parseInt(numMatch[1], 10);
        const numPad = num < 10 ? '0' + num : String(num);
        return prefix + numPad;
      }
    }

    return schoolName.replace(/[^a-zA-Z0-9]/g, '').slice(0, 6).toUpperCase() || schoolName;
  };

  const getVendorShortCode = (name: string): string => {
    const n = (name || '').trim().toUpperCase();
    if (n.includes('SUMBER MAKMUR')) return 'Sumak';
    if (n.includes('LOKI')) return 'Loki';
    if (n.includes('ANDRYNA')) return 'Andryna';
    if (n.includes('APRESIASI')) return 'Apresiasi';
    if (n.includes('FORTUNA')) return 'Fortuna';
    if (n.includes('VANIA')) return 'Vania';
    if (n.includes('KANIO')) return 'Kanio';
    if (n.includes('DELTARA')) return 'Deltara';
    if (n.includes('HARMONI')) return 'Harmoni';
    if (n.includes('SUPATNO')) return 'Supatno';
    if (n.includes('YONGKY')) return 'Yongky';
    if (n.includes('BERKAT')) return 'Berkat';
    if (n.includes('FENDY')) return 'Fendy';
    if (n.includes('JEMIMA')) return 'Jemima';
    if (n.includes('SUGANDI')) return 'Sugandi';
    if (n.includes('ANUGERAH')) return 'Anugerah';
    if (n.includes('SUSANTO')) return 'Susanto';
    if (n.includes('INTAN JAYA')) return 'Intan';
    return (name || '').split(' ')[0] || name;
  };

  const isItemAllowedForLevel = (rawItemName: string, level: string): boolean => {
    const u = (rawItemName || '').toUpperCase();
    const lvl = normalizeLevel(level);

    // Level TK: Hanya KOTAK-KOTAK PUTRA/PUTRI, 1 SET OLAHRAGA, TOPI KUNING, RENANG
    if (lvl === 'TK') {
      if (u.includes('SIAGA') || u.includes('PENGGALANG') || u.includes('PENEGAK') || u.includes('AMBALAN')) return false;
      if (u.includes('KLS') || u.includes('KELAS')) return false;
      if (u.includes('MERAH') || u.includes('BIRU') || u.includes('ABU')) return false;
      if (u.includes('JAS LAB')) return false;
      if (u.includes('ROMPI')) return false;
      if (u.includes('KAOS OLAHRAGA') || u.includes('CELANA OR')) return false;
      return true;
    }

    // Level SD (Reguler): Tidak boleh ada seragam TK, SMP (BIRU), SMA (ABU), JAS LAB
    if (lvl === 'SD') {
      if (u.includes('KOTAK-KOTAK PUTRA') || u.includes('KOTAK-KOTAK PUTRI') || u.includes('KOTAK PUTRA') || u.includes('KOTAK PUTRI')) return false;
      if (u.includes('1 SET SERGM') || u.includes('1 SET SERAGAM')) return false;
      if (u.includes('SET OLAHRAGA') || (u.includes('OLAHRAGA') && !u.includes('KAOS') && !u.includes('CELANA'))) return false;
      if (u.includes('TOPI KUNING')) return false;
      if (u.includes('BIRU') || u.includes('ABU')) return false;
      if (u.includes('PENEGAK') || u.includes('AMBALAN') || u.includes('JAS LAB')) return false;
      if (u.includes('KLS 7') || u.includes('KLS 8') || u.includes('KLS 9') || u.includes('KLS 10') || u.includes('KLS 11') || u.includes('KLS 12')) return false;
      return true;
    }

    // Level SPK-SD (Primary): Memperbolehkan JAS LAB untuk lab sains internasional
    if (lvl === 'SPK-SD') {
      if (u.includes('KOTAK-KOTAK PUTRA') || u.includes('KOTAK-KOTAK PUTRI') || u.includes('KOTAK PUTRA') || u.includes('KOTAK PUTRI')) return false;
      if (u.includes('1 SET SERGM') || u.includes('1 SET SERAGAM')) return false;
      if (u.includes('SET OLAHRAGA') || (u.includes('OLAHRAGA') && !u.includes('KAOS') && !u.includes('CELANA'))) return false;
      if (u.includes('TOPI KUNING')) return false;
      if (u.includes('BIRU') || u.includes('ABU')) return false;
      if (u.includes('PENEGAK') || u.includes('AMBALAN')) return false;
      if (u.includes('KLS 7') || u.includes('KLS 8') || u.includes('KLS 9') || u.includes('KLS 10') || u.includes('KLS 11') || u.includes('KLS 12')) return false;
      return true;
    }

    // Level SMP (termasuk SPK-SMP): Hanya seragam SMP (BIRU), TIDAK BOLEH ABU atau MERAH
    if (lvl === 'SMP' || lvl === 'SPK-SMP') {
      if (u.includes('KOTAK-KOTAK PUTRA') || u.includes('KOTAK-KOTAK PUTRI') || u.includes('KOTAK PUTRA') || u.includes('KOTAK PUTRI')) return false;
      if (u.includes('1 SET SERGM') || u.includes('1 SET SERAGAM')) return false;
      if (u.includes('SET OLAHRAGA') || (u.includes('OLAHRAGA') && !u.includes('KAOS') && !u.includes('CELANA'))) return false;
      if (u.includes('TOPI KUNING')) return false;
      if (u.includes('SIAGA')) return false;
      if (u.includes('KLS 1') || u.includes('KLS 2') || u.includes('KLS 3-6') || u.includes('KLS 3-4') || u.includes('KLS 5-6')) return false;
      if (u.includes('MERAH') || u.includes('ABU')) return false;
      if (u.includes('PENEGAK')) return false;
      return true;
    }

    // Level SMA (termasuk SPK-SMA): Hanya seragam SMA (ABU), TIDAK BOLEH BIRU atau MERAH
    if (lvl === 'SMA' || lvl === 'SPK-SMA') {
      if (u.includes('KOTAK-KOTAK PUTRA') || u.includes('KOTAK-KOTAK PUTRI') || u.includes('KOTAK PUTRA') || u.includes('KOTAK PUTRI')) return false;
      if (u.includes('1 SET SERGM') || u.includes('1 SET SERAGAM')) return false;
      if (u.includes('SET OLAHRAGA') || (u.includes('OLAHRAGA') && !u.includes('KAOS') && !u.includes('CELANA'))) return false;
      if (u.includes('TOPI KUNING')) return false;
      if (u.includes('SIAGA') || u.includes('PENGGALANG')) return false;
      if (u.includes('KLS 1-2') || u.includes('KLS 3-6') || u.includes('KLS 1-4') || u.includes('KLS 5-6') || u.includes('KLS 7') || u.includes('KLS 8') || u.includes('KLS 9')) return false;
      if (u.includes('MERAH') || u.includes('BIRU')) return false;
      return true;
    }

    return true;
  };

  const getStandardItemsForLevel = (level: string): string[] => {
    const lvl = normalizeLevel(level);

    // Ambil jenis seragam unik secara dinamis langsung dari Master Manajemen Barang (props products)
    const dbItems = (products || [])
      .filter((p) => {
        const isSeragam = !p.category || p.category.toLowerCase() === 'seragam';
        if (!isSeragam) return false;
        const pLvl = normalizeLevel(p.level || '');
        return pLvl === lvl || pLvl === 'SEMUA';
      })
      .map((p) => (p.name || '').trim())
      .filter(Boolean);

    const uniqueSet = new Set<string>();

    if (dbItems.length > 0) {
      dbItems.forEach((name) => {
        if (isItemAllowedForLevel(name, lvl)) {
          uniqueSet.add(formatItemDisplayName(name, lvl));
        }
      });
    }

    // Jika di Master Manajemen Barang belum ada produk terinput untuk jenjang ini (misal SPK belum diisi di database),
    // baru gunakan fallback standar baku agar tampilan awal dan ekspor tetap memiliki struktur lengkap
    if (uniqueSet.size === 0) {
      if (lvl === 'TK') {
        ['Kotak - Kotak Putri', 'Kotak - Kotak Putra', '1 Set Olahraga'].forEach((it) => uniqueSet.add(it));
      } else if (lvl === 'SD' || lvl === 'SPK-SD') {
        [
          'Kemeja Putih',
          'Celana Kotak',
          'Celana Polos',
          'Rok Kotak kls 1-2',
          'Rok Polos kls 1-2',
          'Kulot Kotak kls 3-6',
          'Kulot Polos kls 3-6',
          'Rompi Kotak',
          'Kemeja Pramuka Siaga Putra',
          'Kemeja Pramuka Siaga Putri',
          'Celana Pramuka Siaga',
          'Rok Pramuka Siaga kls 1-2',
          'Kulot Pramuka Siaga kls 3-4',
          'Kemeja Pramuka Penggalang Putra',
          'Kemeja Pramuka Penggalang Putri',
          'Celana Pramuka Penggalang',
          'Kulot Pramuka Penggalang',
          'Kaos Olahraga',
          'Celana OR Putra',
          'Celana OR Putri',
        ].forEach((it) => uniqueSet.add(it));
      } else if (lvl === 'SMP' || lvl === 'SPK-SMP') {
        [
          'Kemeja Putih',
          'Celana Biru',
          'Celana Panjang Biru',
          'Kulot Biru',
          'Rompi Kotak',
          'Kemeja Pramuka Penggalang Putra',
          'Kemeja Pramuka Penggalang Putri',
          'Celana Pramuka Penggalang',
          'Kulot Pramuka Penggalang',
          'Kaos Olahraga',
          'Celana OR Putra',
          'Celana OR Putri',
        ].forEach((it) => uniqueSet.add(it));
      } else if (lvl === 'SMA' || lvl === 'SPK-SMA') {
        [
          'Kemeja Putih',
          'Celana Panjang Abu',
          'Kulot Abu',
          'Rompi Kotak',
          'Kemeja Pramuka Putra + Ambalan',
          'Kemeja Pramuka Putri + Ambalan',
          'Celana Panjang Pramuka',
          'Kulot Pramuka',
          'Jas Lab',
          'Kaos Olahraga',
          'Celana OR Putra',
          'Celana OR Putri',
        ].forEach((it) => uniqueSet.add(it));
      }
    }

    return Array.from(uniqueSet).sort((a, b) => {
      const prioA = getItemPriority(a, lvl);
      const prioB = getItemPriority(b, lvl);
      if (prioA !== prioB) return prioA - prioB;
      return a.localeCompare(b);
    });
  };

  const formatItemDisplayName = (itemName: string, level?: string): string => {
    const raw = (itemName || '').trim();
    const u = raw.toUpperCase();
    const lvl = (level || '').toUpperCase().trim();

    const normLvl = normalizeLevel(lvl);

    if (normLvl === 'TK') {
      if (u.includes('PUTRI') && (u.includes('KOTAK') || u.includes('SERGM') || u.includes('SERAGAM'))) return 'Kotak - Kotak Putri';
      if (u.includes('PUTRA') && (u.includes('KOTAK') || u.includes('SERGM') || u.includes('SERAGAM'))) return 'Kotak - Kotak Putra';
      if (u.includes('OLAHRAGA')) return '1 Set Olahraga';
      if (u.includes('TOPI KUNING')) return 'Topi Kuning';
      if (u.includes('BAJU RENANG')) return 'Baju Renang TK';
      return raw;
    }

    if (normLvl === 'SD' || normLvl === 'SPK-SD') {
      if (u.includes('KAOS OLAHRAGA') || u === 'KAOS OR') return 'Kaos Olahraga';
      if (u.includes('CELANA OR PUTRA') || (u.includes('CELANA') && u.includes('PUTRA') && (u.includes('OR') || u.includes('OLAHRAGA')))) return 'Celana OR Putra';
      if (u.includes('CELANA OR PUTRI') || (u.includes('CELANA') && u.includes('PUTRI') && (u.includes('OR') || u.includes('OLAHRAGA')))) return 'Celana OR Putri';
      if (u === 'KEMEJA PUTIH' || u.includes('KEMEJA PUTIH PENDEK') || u.includes('KEMEJA PUTIH PANJANG') || u === 'KEMEJA') return 'Kemeja Putih';
      if (u.includes('CELANA KOTAK')) return 'Celana Kotak';
      if (u.includes('CELANA POLOS') || u.includes('CELANA MERAH')) return 'Celana Polos';
      if (u.includes('ROK KOTAK')) return 'Rok Kotak kls 1-2';
      if (u.includes('ROK POLOS') || u.includes('ROK MERAH')) return 'Rok Polos kls 1-2';
      if (u.includes('KULOT KOTAK')) return 'Kulot Kotak kls 3-6';
      if (u.includes('KULOT POLOS') || u.includes('KULOT MERAH')) return 'Kulot Polos kls 3-6';
      if (u.includes('ROMPI KOTAK') || u === 'ROMPI') return 'Rompi Kotak';
      if (u.includes('PRAMUKA') && u.includes('SIAGA') && u.includes('PUTRA')) return 'Kemeja Pramuka Siaga Putra';
      if (u.includes('PRAMUKA') && u.includes('SIAGA') && u.includes('PUTRI')) return 'Kemeja Pramuka Siaga Putri';
      if (u.includes('CELANA') && u.includes('PRAMUKA') && u.includes('SIAGA')) return 'Celana Pramuka Siaga';
      if (u.includes('ROK') && u.includes('PRAMUKA') && u.includes('SIAGA')) return 'Rok Pramuka Siaga kls 1-2';
      if (u.includes('KULOT') && u.includes('PRAMUKA') && u.includes('SIAGA')) return 'Kulot Pramuka Siaga kls 3-4';
      if (u.includes('PRAMUKA') && u.includes('PENGGALANG') && u.includes('PUTRA')) return 'Kemeja Pramuka Penggalang Putra';
      if (u.includes('PRAMUKA') && u.includes('PENGGALANG') && u.includes('PUTRI')) return 'Kemeja Pramuka Penggalang Putri';
      if (u.includes('CELANA') && u.includes('PRAMUKA') && u.includes('PENGGALANG')) return 'Celana Pramuka Penggalang';
      if (u.includes('KULOT') && u.includes('PRAMUKA') && u.includes('PENGGALANG')) return 'Kulot Pramuka Penggalang';
      if (u.includes('BATIK')) return 'Batik SD';
      if (u.includes('JAS LAB')) return 'Jas Lab';
      return raw;
    }

    if (normLvl === 'SMP' || normLvl === 'SPK-SMP') {
      if (u.includes('KAOS OLAHRAGA') || u === 'KAOS OR') return 'Kaos Olahraga';
      if (u.includes('CELANA OR PUTRA') || (u.includes('CELANA') && u.includes('PUTRA') && (u.includes('OR') || u.includes('OLAHRAGA')))) return 'Celana OR Putra';
      if (u.includes('CELANA OR PUTRI') || (u.includes('CELANA') && u.includes('PUTRI') && (u.includes('OR') || u.includes('OLAHRAGA')))) return 'Celana OR Putri';
      if (u === 'KEMEJA PUTIH' || u.includes('KEMEJA PUTIH PENDEK') || u.includes('KEMEJA PUTIH PANJANG') || u === 'KEMEJA') return 'Kemeja Putih';
      if (u.includes('CELANA PANJANG BIRU')) return 'Celana Panjang Biru';
      if (u.includes('CELANA BIRU') || u.includes('CELANA PENDEK BIRU')) return 'Celana Biru';
      if (u.includes('ROK BIRU')) return 'Rok Biru';
      if (u.includes('KULOT BIRU')) return 'Kulot Biru';
      if (u.includes('ROMPI KOTAK') || u === 'ROMPI') return 'Rompi Kotak';
      if (u.includes('PRAMUKA') && u.includes('PUTRA') && u.includes('KEMEJA')) return 'Kemeja Pramuka Penggalang Putra';
      if (u.includes('PRAMUKA') && u.includes('PUTRI') && u.includes('KEMEJA')) return 'Kemeja Pramuka Penggalang Putri';
      if (u.includes('CELANA') && u.includes('PRAMUKA')) return 'Celana Pramuka Penggalang';
      if (u.includes('KULOT') && u.includes('PRAMUKA')) return 'Kulot Pramuka Penggalang';
      if (u.includes('BATIK')) return 'Batik SMP';
      if (u.includes('JAS LAB')) return 'Jas Lab';
      return raw;
    }

    if (normLvl === 'SMA' || normLvl === 'SPK-SMA') {
      if (u.includes('KAOS OLAHRAGA') || u === 'KAOS OR') return 'Kaos Olahraga';
      if (u.includes('CELANA OR PUTRA') || (u.includes('CELANA') && u.includes('PUTRA') && (u.includes('OR') || u.includes('OLAHRAGA')))) return 'Celana OR Putra';
      if (u.includes('CELANA OR PUTRI') || (u.includes('CELANA') && u.includes('PUTRI') && (u.includes('OR') || u.includes('OLAHRAGA')))) return 'Celana OR Putri';
      if (u === 'KEMEJA PUTIH' || u.includes('KEMEJA PUTIH PENDEK') || u.includes('KEMEJA PUTIH PANJANG') || u === 'KEMEJA') return 'Kemeja Putih';
      if (u.includes('CELANA PANJANG ABU') || u.includes('CELANA ABU')) return 'Celana Panjang Abu';
      if (u.includes('ROK ABU')) return 'Rok Abu';
      if (u.includes('KULOT ABU')) return 'Kulot Abu';
      if (u.includes('ROMPI KOTAK') || u === 'ROMPI') return 'Rompi Kotak';
      if (u.includes('PRAMUKA') && u.includes('PUTRA') && u.includes('KEMEJA')) return 'Kemeja Pramuka Putra + Ambalan';
      if (u.includes('PRAMUKA') && u.includes('PUTRI') && u.includes('KEMEJA')) return 'Kemeja Pramuka Putri + Ambalan';
      if (u.includes('CELANA') && u.includes('PRAMUKA')) return 'Celana Panjang Pramuka';
      if (u.includes('KULOT') && u.includes('PRAMUKA')) return 'Kulot Pramuka';
      if (u.includes('JAS LAB')) return 'Jas Lab';
      if (u.includes('BATIK')) return 'Batik SMA';
      return raw;
    }

    if (u.includes('NAME TAG')) return 'Name Tag 1set=6 ( coklat 1, putih 5)';
    if (u.includes('CLEMEK')) return 'Clemek (Tata Boga)';
    if (u.includes('KACU')) return 'Kacu Katun + Ring Rotan';
    if (u.includes('TOPI PRAMUKA PUTRA')) return 'Topi Pramuka Putra';
    if (u.includes('TOPI PRAMUKA PUTRI')) return 'Topi Pramuka Putri';
    if (u.includes('TOPI KUNING')) return 'Topi Kuning';
    if (u.includes('TOPI MERAH')) return 'Topi Merah';
    if (u.includes('TOPI BIRU')) return 'Topi Biru';
    if (u.includes('TOPI ABU')) return 'Topi Abu';
    if (u.includes('DASI MERAH')) return 'Dasi Merah';
    if (u.includes('DASI BIRU')) return 'Dasi Biru';
    if (u.includes('DASI ABU PUTRA')) return 'Dasi Abu Putra';
    if (u.includes('DASI ABU PUTRI')) return 'Dasi Abu Putri';
    if (u.includes('DASI ABU')) return 'Dasi Abu';
    if (u.includes('SEPATU')) return u.includes('VELCRO') ? 'Sepatu Velcro' : 'Sepatu Phantom';
    if (u.includes('KAOS KAKI HITAM')) return 'Kaos Kaki Hitam';
    if (u.includes('KAOS KAKI PUTIH')) return 'Kaos Kaki Putih';
    if (u.includes('AMBALAN') && !u.includes('KEMEJA')) return 'Gudep Ambalan';

    return raw;
  };

  const getItemPriority = (item: string, level?: string): number => {
    const s = item.toUpperCase();
    const lvl = (level || '').toUpperCase().trim();

    if (lvl === 'TK') {
      if (s.includes('PUTRI')) return 1;
      if (s.includes('PUTRA')) return 2;
      if (s.includes('OLAHRAGA')) return 3;
      if (s.includes('TOPI')) return 4;
      return 10;
    }

    if (s.includes('KEMEJA PUTIH') || s === 'KEMEJA') return 10;
    if (s.includes('CELANA KOTAK')) return 11;
    if (s.includes('CELANA POLOS') || s.includes('CELANA BIRU') || s.includes('CELANA ABU')) return 12;
    if (s.includes('CELANA PANJANG')) return 12.5;
    if (s.includes('ROK KOTAK')) return 13;
    if (s.includes('ROK POLOS') || s.includes('ROK BIRU') || s.includes('ROK ABU')) return 14;
    if (s.includes('KULOT KOTAK')) return 15;
    if (s.includes('KULOT POLOS') || s.includes('KULOT BIRU') || s.includes('KULOT ABU')) return 16;
    if (s.includes('ROMPI')) return 17;
    if (s.includes('SIAGA') && s.includes('PUTRA')) return 20;
    if (s.includes('SIAGA') && s.includes('PUTRI')) return 21;
    if (s.includes('CELANA') && s.includes('SIAGA')) return 22;
    if (s.includes('ROK') && s.includes('SIAGA')) return 23;
    if (s.includes('KULOT') && s.includes('SIAGA')) return 24;
    if ((s.includes('PENGGALANG') || s.includes('PENEGAK')) && s.includes('PUTRA')) return 25;
    if ((s.includes('PENGGALANG') || s.includes('PENEGAK')) && s.includes('PUTRI')) return 26;
    if (s.includes('CELANA') && (s.includes('PENGGALANG') || s.includes('PENEGAK') || s.includes('PRAMUKA'))) return 27;
    if (s.includes('KULOT') && (s.includes('PENGGALANG') || s.includes('PENEGAK') || s.includes('PRAMUKA'))) return 28;
    if (s.includes('JAS LAB')) return 35;
    if (s.includes('BATIK')) return 38;
    if (s.includes('KACU')) return 40;
    if (s.includes('NAME TAG')) return 50;
    if (s.includes('GUDEP')) return 51;
    if (s.includes('KAOS OLAHRAGA')) return 90;
    if (s.includes('CELANA OR PUTRA') || s.includes('CELANA OLAHRAGA PUTRA')) return 91;
    if (s.includes('CELANA OR PUTRI') || s.includes('CELANA OLAHRAGA PUTRI')) return 92;
    if (s.includes('SET OLAHRAGA') || s.includes('OLAHRAGA')) return 93;
    return 30;
  };

  const normalizeItemName = (str: string): string => {
    return (str || '')
      .toUpperCase()
      .replace(/\bSET\b/g, '')
      .replace(/\b1\s+SET\b/g, '')
      .replace(/[-_()/+]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  };

  const isClothingTypeMatch = (targetUniform: string, plottedType: string): boolean => {
    if (!targetUniform || !plottedType) return false;
    const tRaw = targetUniform.trim().toUpperCase();
    const pRaw = plottedType.trim().toUpperCase();

    if (pRaw === 'SEMUA JENIS BAJU' || tRaw === 'SEMUA JENIS BAJU') return true;

    const tNorm = normalizeItemName(targetUniform);
    const pNorm = normalizeItemName(plottedType);

    if (!tNorm || !pNorm) return false;
    if (tNorm === pNorm) return true;

    // 0. Cegah pencocokan silang Pramuka vs Non-Pramuka
    const isPramukaT = tNorm.includes('PRAMUKA');
    const isPramukaP = pNorm.includes('PRAMUKA');
    if (isPramukaT !== isPramukaP) {
      const isAccPramukaT =
        tNorm.includes('BARET') ||
        tNorm.includes('LAKEN') ||
        tNorm.includes('KACU') ||
        tNorm.includes('SIAGA') ||
        tNorm.includes('PENGGALANG') ||
        tNorm.includes('PENEGAK') ||
        tNorm.includes('AMBALAN');
      const isAccPramukaP =
        pNorm.includes('BARET') ||
        pNorm.includes('LAKEN') ||
        pNorm.includes('KACU') ||
        pNorm.includes('SIAGA') ||
        pNorm.includes('PENGGALANG') ||
        pNorm.includes('PENEGAK') ||
        pNorm.includes('AMBALAN');
      if (!isAccPramukaT && !isAccPramukaP) {
        return false;
      }
    }

    // 0a. Cegah pencocokan silang warna jenjang yang berbeda: MERAH (SD) vs BIRU (SMP) vs ABU (SMA)
    const hasMerahT = tNorm.includes('MERAH');
    const hasBiruT = tNorm.includes('BIRU');
    const hasAbuT = tNorm.includes('ABU');

    const hasMerahP = pNorm.includes('MERAH');
    const hasBiruP = pNorm.includes('BIRU');
    const hasAbuP = pNorm.includes('ABU');

    if ((hasMerahT && (hasBiruP || hasAbuP)) || (hasBiruT && (hasMerahP || hasAbuP)) || (hasAbuT && (hasMerahP || hasBiruP))) {
      return false;
    }

    // 0b. Cegah pencocokan silang tingkatan Pramuka yang berbeda: SIAGA (SD) vs PENEGAK (SMA)
    const hasSiagaT = tNorm.includes('SIAGA');
    const hasPenegakT = tNorm.includes('PENEGAK');
    const hasSiagaP = pNorm.includes('SIAGA');
    const hasPenegakP = pNorm.includes('PENEGAK');

    if ((hasSiagaT && hasPenegakP) || (hasPenegakT && hasSiagaP)) {
      return false;
    }

    // 0c. TK Kotak - Kotak Putra / Putri
    if (
      tNorm.includes('PUTRI') &&
      (tNorm.includes('KOTAK') || tNorm.includes('SERGM') || tNorm.includes('SERAGAM')) &&
      pNorm.includes('PUTRI') &&
      (pNorm.includes('KOTAK') || pNorm.includes('SERGM') || pNorm.includes('SERAGAM'))
    ) {
      return true;
    }
    if (
      tNorm.includes('PUTRA') &&
      (tNorm.includes('KOTAK') || tNorm.includes('SERGM') || tNorm.includes('SERAGAM')) &&
      pNorm.includes('PUTRA') &&
      (pNorm.includes('KOTAK') || pNorm.includes('SERGM') || pNorm.includes('SERAGAM'))
    ) {
      return true;
    }

    // Kotak Putra / Putri (e.g. SET KOTAK PUTRA <-> KOTAK-KOTAK PUTRA)
    if (tNorm.includes('KOTAK PUTRA') && pNorm.includes('KOTAK PUTRA')) return true;
    if (tNorm.includes('KOTAK PUTRI') && pNorm.includes('KOTAK PUTRI')) return true;
    if (tNorm.includes('ROMPI KOTAK') && pNorm.includes('ROMPI KOTAK')) return true;

    // Celana / Rok / Kulot Merah (SD)
    if (tNorm.includes('CELANA MERAH') && (pNorm.includes('CELANA MERAH') || pNorm.includes('CELANA POLOS MERAH'))) return true;
    if (tNorm.includes('CELANA POLOS') && (pNorm.includes('CELANA POLOS') || pNorm.includes('CELANA MERAH') || pNorm.includes('CELANA POLOS MERAH'))) return true;
    if (tNorm.includes('KULOT MERAH') && (pNorm.includes('KULOT MERAH') || pNorm.includes('KULOT POLOS MERAH'))) return true;
    if (tNorm.includes('KULOT POLOS') && (pNorm.includes('KULOT POLOS') || pNorm.includes('KULOT MERAH') || pNorm.includes('KULOT POLOS MERAH'))) return true;
    if (tNorm.includes('ROK MERAH') && (pNorm.includes('ROK MERAH') || pNorm.includes('ROK POLOS MERAH'))) return true;
    if (tNorm.includes('ROK POLOS') && (pNorm.includes('ROK POLOS') || pNorm.includes('ROK MERAH') || pNorm.includes('ROK POLOS MERAH'))) return true;

    if (tNorm.includes('CELANA KOTAK') && pNorm.includes('CELANA KOTAK')) return true;
    if (tNorm.includes('ROK KOTAK') && pNorm.includes('ROK KOTAK')) return true;
    if (tNorm.includes('KULOT KOTAK') && pNorm.includes('KULOT KOTAK')) return true;

    if (tNorm.includes('KEMEJA PUTIH') && pNorm.includes('KEMEJA PUTIH')) return true;

    // Celana / Rok / Kulot Biru (SMP)
    if (tNorm.includes('CELANA BIRU') && pNorm.includes('CELANA BIRU')) return true;
    if (tNorm.includes('ROK BIRU') && pNorm.includes('ROK BIRU')) return true;
    if (tNorm.includes('KULOT BIRU') && pNorm.includes('KULOT BIRU')) return true;

    // Celana / Rok / Kulot Abu (SMA)
    if (tNorm.includes('CELANA ABU') && (pNorm.includes('CELANA ABU') || pNorm.includes('CELANA PANJANG ABU'))) return true;
    if (tNorm.includes('ROK ABU') && pNorm.includes('ROK ABU')) return true;
    if (tNorm.includes('KULOT ABU') && pNorm.includes('KULOT ABU')) return true;

    // Kaos Kaki (Loki, Vania, Christy)
    if (tNorm.includes('KAOS KAKI PUTIH') && pNorm.includes('KAOS KAKI PUTIH')) return true;
    if (tNorm.includes('KAOS KAKI HITAM') && pNorm.includes('KAOS KAKI HITAM')) return true;
    if (tNorm === 'KAOS KAKI' && pNorm.includes('KAOS KAKI')) return true;

    // Sepatu (Yongky)
    if (tNorm.includes('SEPATU') && pNorm.includes('SEPATU')) {
      if (tNorm.includes('VELCRO') && pNorm.includes('VELCRO')) return true;
      if (tNorm.includes('PHANTOM') && pNorm.includes('PHANTOM')) return true;
      if (!tNorm.includes('VELCRO') && !tNorm.includes('PHANTOM')) return true;
    }

    // Olahraga (TK: 1 Set Olahraga vs SD/SMP/SMA: Kaos Olahraga, Celana OR Putra, Celana OR Putri)
    const isOrT =
      tRaw.includes('OLAHRAGA') ||
      tRaw.includes(' OR ') ||
      tRaw.endsWith(' OR') ||
      tRaw.startsWith('OR ') ||
      tRaw.includes('CELANA OR') ||
      tRaw.includes('KAOS OR');
    const isOrP =
      pRaw.includes('OLAHRAGA') ||
      pRaw.includes(' OR ') ||
      pRaw.endsWith(' OR') ||
      pRaw.startsWith('OR ') ||
      pRaw.includes('CELANA OR') ||
      pRaw.includes('KAOS OR');

    if (isOrT || isOrP) {
      if (!isOrT || !isOrP) return false;

      const isSetT = (tRaw.includes('SET') || tRaw === 'OLAHRAGA') && !tRaw.includes('KAOS') && !tRaw.includes('CELANA');
      const isSetP = (pRaw.includes('SET') || pRaw === 'OLAHRAGA') && !pRaw.includes('KAOS') && !pRaw.includes('CELANA');

      const isKaosT = tRaw.includes('KAOS');
      const isKaosP = pRaw.includes('KAOS');

      const isCelanaT = tRaw.includes('CELANA');
      const isCelanaP = pRaw.includes('CELANA');

      const isPutraT = tRaw.includes('PUTRA');
      const isPutraP = pRaw.includes('PUTRA');
      const isPutriT = tRaw.includes('PUTRI');
      const isPutriP = pRaw.includes('PUTRI');

      // 1 Set Olahraga (khusus TK) - TIDAK BOLEH mencocokkan Kaos atau Celana Olahraga
      if (isSetT && isSetP) return true;
      if (isSetT || isSetP) return false;

      // Kaos Olahraga (SD / SMP / SMA) - TIDAK BOLEH mencocokkan Celana Olahraga
      if (isKaosT && isKaosP) return true;
      if (isKaosT || isKaosP) return false;

      // Celana OR Putra / Putri (SD / SMP / SMA)
      if (isCelanaT && isCelanaP) {
        if (isPutraT && isPutriP) return false;
        if (isPutriT && isPutraP) return false;
        if (isPutraT && isPutraP) return true;
        if (isPutriT && isPutriP) return true;
        return true;
      }

      return false;
    }

    // Topi Pramuka (Putra & Putri)
    if (tNorm.includes('TOPI PRAMUKA PUTRA') && pNorm.includes('TOPI PRAMUKA PUTRA')) return true;
    if (tNorm.includes('TOPI PRAMUKA PUTRI') && pNorm.includes('TOPI PRAMUKA PUTRI')) return true;
    if (tNorm === 'TOPI PRAMUKA' && pNorm.includes('TOPI PRAMUKA')) return true;

    // Topi Reguler (Kuning, Merah, Biru, Abu)
    if (tNorm.includes('TOPI KUNING') && pNorm.includes('TOPI KUNING')) return true;
    if (tNorm.includes('TOPI MERAH') && pNorm.includes('TOPI MERAH')) return true;
    if (tNorm.includes('TOPI BIRU') && pNorm.includes('TOPI BIRU')) return true;
    if (tNorm.includes('TOPI ABU') && pNorm.includes('TOPI ABU')) return true;

    // Topi Siaga (SD)
    if (tNorm.includes('TOPI SIAGA PUTRA') && pNorm.includes('TOPI SIAGA PUTRA')) return true;
    if (tNorm.includes('TOPI SIAGA PUTRI') && pNorm.includes('TOPI SIAGA PUTRI')) return true;

    // Dasi Reguler
    if (tNorm.includes('DASI MERAH') && pNorm.includes('DASI MERAH')) return true;
    if (tNorm.includes('DASI BIRU') && pNorm.includes('DASI BIRU')) return true;
    if (tNorm.includes('DASI ABU PUTRA') && pNorm.includes('DASI ABU PUTRA')) return true;
    if (tNorm.includes('DASI ABU PUTRI') && pNorm.includes('DASI ABU PUTRI')) return true;
    if (tNorm.includes('DASI ABU') && pNorm.includes('DASI ABU')) return true;

    // Dasi Spesifik SPK
    if (tNorm.includes('DASI MERAH TUMPUL') && pNorm.includes('DASI MERAH TUMPUL')) return true;
    if (tNorm.includes('DASI KOTAK TUMPUL') && pNorm.includes('DASI KOTAK TUMPUL')) return true;
    if (tNorm.includes('DASI KOTAK') && pNorm.includes('DASI KOTAK')) {
      if (tNorm.includes('PUTRA') && pNorm.includes('PUTRA')) return true;
      if (tNorm.includes('PUTRI') && pNorm.includes('PUTRI')) return true;
      if (!tNorm.includes('PUTRA') && !tNorm.includes('PUTRI')) return true;
    }

    // Pramuka
    if (tNorm.includes('PRAMUKA') && pNorm.includes('PRAMUKA')) {
      if (tNorm.includes('KEMEJA') && pNorm.includes('KEMEJA')) {
        if (tNorm.includes('PUTRA') && pNorm.includes('PUTRI')) return false;
        if (tNorm.includes('PUTRI') && pNorm.includes('PUTRA')) return false;
        return true;
      }
      if (tNorm.includes('CELANA') && pNorm.includes('CELANA')) return true;
      if (tNorm.includes('ROK') && pNorm.includes('ROK')) return true;
      if (tNorm.includes('KULOT') && pNorm.includes('KULOT')) return true;
    }

    if (tNorm.includes('BARET') && pNorm.includes('BARET')) return true;
    if (tNorm.includes('LAKEN') && pNorm.includes('LAKEN')) return true;
    if (tNorm.includes('KACU') && pNorm.includes('KACU')) return true;
    if (tNorm.includes('NAME TAG') && pNorm.includes('NAME TAG')) return true;
    if (tNorm.includes('CLEMEK') && pNorm.includes('CLEMEK')) return true;
    if (tNorm.includes('AMBALAN') && pNorm.includes('AMBALAN')) return true;

    if (tNorm.includes('JAS LAB') && pNorm.includes('JAS LAB')) return true;
    if (tNorm.includes('BAJU RENANG') && pNorm.includes('BAJU RENANG')) return true;

    // Substring fallback HANYA jika bukan TOPI / DASI (karena topi/dasi memiliki nama spesifik per warna)
    if (!tNorm.includes('TOPI') && !pNorm.includes('TOPI') && !tNorm.includes('DASI') && !pNorm.includes('DASI')) {
      if (tNorm.length >= 7 && pNorm.length >= 7) {
        if (tNorm.includes(pNorm) || pNorm.includes(tNorm)) return true;
      }
    }

    return false;
  };

  // Plottings yang diperkaya dengan nama dan jenjang sekolah valid dari master schools
  const effectivePlottings = useMemo(() => {
    return plottings.map((p) => {
      let sName = p.app_users?.school_name || '';
      let sEmail = p.app_users?.username || '';
      let sLvl = p.app_users?.school_level || '';
      const sch = schools.find((s) => s.id === p.school_user_id);
      if (sch) {
        if (!sName) sName = sch.school_name;
        if (!sEmail) sEmail = sch.email || '';
        if (!sLvl) sLvl = sch.level || '';
      }
      const resolvedLvl = resolveSchoolLevel(sName, sEmail, sLvl);
      return {
        ...p,
        app_users: {
          school_name: sName,
          username: sEmail,
          school_level: resolvedLvl,
        },
      };
    });
  }, [plottings, schools]);

  // =========================================================================
  // 2. ENGINE DISTRIBUSI KE VENDOR BERDASARKAN PLOTTING & JENIS BARANG
  // =========================================================================
  const vendorAllocations = useMemo(() => {
    if (forecastItems.length === 0 || vendors.length === 0) return [];

    // Inisialisasi struktur alokasi per vendor
    const allocationByVendor = new Map<string, VendorAllocation>();
    vendors.forEach((v) => {
      allocationByVendor.set(v.id, {
        vendorId: v.id,
        vendorName: v.name,
        contactPerson: v.contact_person || '-',
        phone: v.phone || '-',
        schoolNames: [],
        items: [],
        grandTotalPcs: 0,
      });
    });

    // Alokasikan tiap ForecastItem HANYA ke vendor yang di-plot untuk barang tersebut
    forecastItems.forEach((fcItem) => {
      const itemLevel = fcItem.level.toUpperCase().trim();

      // Cari plotting-plotting yang sesuai jenjang DAN jenis barang ini
      const matchedPlottings = effectivePlottings.filter((p) => {
        const pLevel = normalizeLevel(p.app_users?.school_level || '');
        const iLevel = normalizeLevel(itemLevel);
        if (pLevel !== iLevel) return false;

        const plottedTypes = splitClothingTypes(p.clothing_type);

        return plottedTypes.some((pt) => pt === 'Semua Jenis Baju' || isClothingTypeMatch(fcItem.uniformName, pt));
      });

      if (matchedPlottings.length === 0) {
        // Belum ada vendor yang di-plot untuk barang ini di jenjang ini
        return;
      }

      // Hitung jumlah sekolah yang dilayani tiap vendor KHUSUS untuk barang ini
      const schoolsByVendor = new Map<string, Set<string>>();
      const schoolNamesByVendor = new Map<string, Set<string>>();

      matchedPlottings.forEach((p) => {
        const vId = p.vendor_id;
        const sId = p.school_user_id;
        const sName = p.app_users?.school_name || '';

        if (!schoolsByVendor.has(vId)) schoolsByVendor.set(vId, new Set());
        schoolsByVendor.get(vId)!.add(sId);

        if (!schoolNamesByVendor.has(vId)) schoolNamesByVendor.set(vId, new Set());
        if (sName) schoolNamesByVendor.get(vId)!.add(sName);
      });

      const activeVendorsForItem: Array<{
        vendorId: string;
        schoolCount: number;
        schoolNames: Set<string>;
      }> = [];

      schoolsByVendor.forEach((schoolsSet, vId) => {
        if (schoolsSet.size > 0) {
          activeVendorsForItem.push({
            vendorId: vId,
            schoolCount: schoolsSet.size,
            schoolNames: schoolNamesByVendor.get(vId) || new Set(),
          });
        }
      });

      // Total sekolah yang di-plot untuk barang ini lintas vendor yang kompeten
      const totalSchoolsForItem = activeVendorsForItem.reduce((sum, av) => sum + av.schoolCount, 0);
      if (totalSchoolsForItem === 0) return;

      const allocatedSizesByVendor = new Map<string, Record<string, number>>();
      const schoolBreakdownByVendor = new Map<string, Record<string, Record<string, number>>>();
      activeVendorsForItem.forEach((av) => {
        allocatedSizesByVendor.set(av.vendorId, {});
        schoolBreakdownByVendor.set(av.vendorId, {});
      });

      // Cek apakah data ini memiliki rincian per sekolah (schoolBreakdown)
      const hasBreakdown = fcItem.schoolBreakdown && Object.keys(fcItem.schoolBreakdown).length > 0;
      let matchedBySchool = false;

      if (hasBreakdown) {
        // Alokasikan langsung ke vendor yang menaungi sekolah tersebut untuk barang ini
        Object.entries(fcItem.schoolBreakdown!).forEach(([schoolName, schoolSizes]) => {
          const sClean = schoolName.toLowerCase().replace(/[^a-z0-9]/g, '');
          const targetPlot = matchedPlottings.find((p) => {
            const pSchoolClean = (p.app_users?.school_name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
            return pSchoolClean === sClean || pSchoolClean.includes(sClean) || sClean.includes(pSchoolClean);
          });

          if (targetPlot) {
            matchedBySchool = true;
            const vSizes = allocatedSizesByVendor.get(targetPlot.vendor_id);
            if (vSizes) {
              Object.entries(schoolSizes).forEach(([sz, qty]) => {
                vSizes[sz] = (vSizes[sz] || 0) + qty;
              });
            }

            const vSchoolBd = schoolBreakdownByVendor.get(targetPlot.vendor_id);
            if (vSchoolBd) {
              const canonicalName = targetPlot.app_users?.school_name || schoolName;
              if (!vSchoolBd[canonicalName]) vSchoolBd[canonicalName] = {};
              Object.entries(schoolSizes).forEach(([sz, qty]) => {
                vSchoolBd[canonicalName][sz] = (vSchoolBd[canonicalName][sz] || 0) + qty;
              });
            }
          }
        });
      }

      // Jika tidak ada data per sekolah atau mode rencana global (tanpa rincian sekolah)
      if (!matchedBySchool) {
        Object.entries(fcItem.sizes).forEach(([sizeName, totalQtyForSize]) => {
          if (totalQtyForSize <= 0) return;

          let allocatedSum = 0;
          let maxVendorId = activeVendorsForItem[0]?.vendorId || '';
          let maxVendorCount = -1;

          activeVendorsForItem.forEach((av) => {
            const ratio = av.schoolCount / totalSchoolsForItem;
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

        // Distribusikan proporsional ke sekolah-sekolah yang dilayani vendor ini untuk barang ini
        activeVendorsForItem.forEach((av) => {
          const vSizes = allocatedSizesByVendor.get(av.vendorId) || {};
          const vSchoolBd = schoolBreakdownByVendor.get(av.vendorId);
          const schoolNamesList = Array.from(av.schoolNames);
          const numSchools = schoolNamesList.length;

          if (vSchoolBd && numSchools > 0) {
            Object.entries(vSizes).forEach(([sz, totalSzQty]) => {
              if (totalSzQty <= 0) return;
              const baseQty = Math.floor(totalSzQty / numSchools);
              let rem = totalSzQty % numSchools;

              schoolNamesList.forEach((sn) => {
                if (!vSchoolBd[sn]) vSchoolBd[sn] = {};
                const addQty = baseQty + (rem > 0 ? 1 : 0);
                if (rem > 0) rem--;
                vSchoolBd[sn][sz] = addQty;
              });
            });
          }
        });
      }

      // Masukkan ke struktur alokasi masing-masing vendor yang berhak
      activeVendorsForItem.forEach((av) => {
        const vendorSizes = allocatedSizesByVendor.get(av.vendorId) || {};
        const itemTotal = Object.values(vendorSizes).reduce((a, b) => a + b, 0);
        if (itemTotal === 0 && !matchedBySchool) return;

        const sharePct = (av.schoolCount / totalSchoolsForItem) * 100;

        const alloc = allocationByVendor.get(av.vendorId);
        if (alloc) {
          alloc.items.push({
            level: fcItem.level,
            uniformName: fcItem.uniformName,
            sizes: vendorSizes,
            total: itemTotal,
            sharePercentage: Math.round(sharePct * 10) / 10,
            schoolCount: av.schoolCount,
            totalSchoolsInLevel: totalSchoolsForItem,
            schoolBreakdown: schoolBreakdownByVendor.get(av.vendorId) || {},
            schoolsForItem: Array.from(av.schoolNames),
          });
          alloc.grandTotalPcs += itemTotal;

          av.schoolNames.forEach((sn) => {
            if (!alloc.schoolNames.includes(sn)) {
              alloc.schoolNames.push(sn);
            }
          });
        }
      });
    });

    const result = Array.from(allocationByVendor.values()).filter(
      (a) => a.items.length > 0 && a.grandTotalPcs > 0
    );

    // Urutkan rincian item tiap vendor secara baku: TK, SD, SMP, SMA, SD-SPK, SMP-SPK, SMA-SPK
    result.forEach((alloc) => {
      alloc.items.sort((a, b) => {
        const rankA = getLevelRank(a.level);
        const rankB = getLevelRank(b.level);
        if (rankA !== rankB) return rankA - rankB;
        const pA = getItemPriority(a.uniformName, a.level);
        const pB = getItemPriority(b.uniformName, b.level);
        if (pA !== pB) return pA - pB;
        return a.uniformName.localeCompare(b.uniformName);
      });
    });

    return result.sort((a, b) => a.vendorName.localeCompare(b.vendorName, 'id', { numeric: true, sensitivity: 'base' }));
  }, [forecastItems, vendors, effectivePlottings, schools]);

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

        // Parser angka aman yang tidak merusak angka desimal/koma (menghindari bug 411.233 -> 4 kuadriliun)
        const parseCellNumber = (val: any): number => {
          if (val === null || val === undefined || val === '') return 0;
          if (typeof val === 'number') return isNaN(val) ? 0 : Math.round(val);
          if (typeof val === 'string') {
            const trimmed = val.trim();
            if (!trimmed) return 0;
            if (trimmed.includes('+')) {
              const parts = trimmed.split('+').map((p) => parseFloat(p.trim().replace(',', '.'))).filter((n) => !isNaN(n));
              if (parts.length > 0) return Math.round(parts.reduce((a, b) => a + b, 0));
            }
            const clean = trimmed.replace(/[^0-9.,-]/g, '').replace(',', '.');
            const num = parseFloat(clean);
            return isNaN(num) ? 0 : Math.round(num);
          }
          return 0;
        };

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
            let lastUniformName = '';

            rawRows.forEach((row) => {
              const nameRaw =
                row['Nama Barang'] ||
                row['NAMA BARANG'] ||
                row['Nama Seragam'] ||
                row['Jenis Baju'] ||
                row['Item'] ||
                row['Barang'] ||
                row['NAMA'] ||
                row['Nama'] ||
                row['JENIS'] ||
                row['Jenis'] ||
                row['JENIS SERAGAM'] ||
                '';
              const trimmedName = String(nameRaw).trim();
              if (trimmedName && !trimmedName.toLowerCase().startsWith('barang') && !trimmedName.toLowerCase().startsWith('jenis barang')) {
                lastUniformName = trimmedName;
              }
              const uniformName = (trimmedName && !trimmedName.toLowerCase().startsWith('barang') && !trimmedName.toLowerCase().startsWith('jenis barang')) ? trimmedName : lastUniformName;
              if (!uniformName) return;

              const sizeRaw =
                row['Size'] ||
                row['SIZE'] ||
                row['Ukuran'] ||
                row['UKURAN'] ||
                '';
              let size = String(sizeRaw).trim().toUpperCase();
              if (!size || size === 'BARANG' || size === 'UKURAN' || size === 'SIZE') return;

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

              // 1. Cek apakah baris ini memiliki kolom PO (misal file rekap pesanan/PO TM)
              let poVal = 0;
              let hasPoCol = false;
              for (const [k, v] of Object.entries(row)) {
                const lk = k.trim().toLowerCase();
                if (lk === 'po' || lk.startsWith('po ') || lk.startsWith('po_') || lk === 'order') {
                  hasPoCol = true;
                  if (typeof v === 'number') {
                    poVal = v;
                  } else if (typeof v === 'string') {
                    // Mendukung format gabungan seperti '12++4' atau '30+6'
                    const parts = v.split('+').map((p) => parseInt(p.trim(), 10)).filter((n) => !isNaN(n));
                    if (parts.length > 0) poVal = parts.reduce((a, b) => a + b, 0);
                  }
                }
              }

              if (hasPoCol && poVal > 0) {
                // Gunakan angka murni dari PO (bukan nominal harga atau total rupiah)
                item.sizes[size] = (item.sizes[size] || 0) + poVal;
                item.total += poVal;
              } else {
                // 2. Mode Kolom Sekolah (Template Resmi Prediksi)
                let schoolSum = 0;
                Object.entries(row).forEach(([colKey, val]) => {
                  const cleanKey = colKey.trim();
                  const lowerKey = cleanKey.toLowerCase();

                  // Filter ketat: abaikan kolom nomor, identitas barang, finansial (harga/rupiah/setoran), dan logistik (kirim/surat jalan)
                  if (
                    [
                      'no', 'no.', 'nomor', '__empty',
                      'jenjang', 'level', 'tingkat',
                      'nama seragam', 'jenis baju', 'nama barang', 'barang', 'item', 'nama', 'jenis', 'jenis seragam',
                      'size', 'ukuran',
                      'po', 'harga', 'price', 'rp', 'rupiah', 'setor', 'setor kop', 'setor koperasi',
                      'kirim', 's. jalan', 'surat jalan', 'cek', 'cek s. jalan',
                      'total', 'total ', 'total (pcs)', 'total pcs', 'total rencana', 'keterangan'
                    ].includes(lowerKey) ||
                    lowerKey.startsWith('kirim') ||
                    lowerKey.startsWith('__empty') ||
                    lowerKey.includes('jalan') ||
                    lowerKey.includes('setor') ||
                    lowerKey.includes('harga')
                  ) {
                    return;
                  }

                  const numVal = parseCellNumber(val);
                  if (numVal > 0) {
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

                // Jika kolom sekolah kosong dan bukan PO, ambil dari kolom TOTAL Rencana
                if (schoolSum === 0) {
                  const totalRaw =
                    row['TOTAL (PCS)'] ||
                    row['TOTAL RENCANA'] ||
                    row['Total (Pcs)'] ||
                    row['Total Pcs'] ||
                    row['Total Rencana'] ||
                    row['TOTAL/SIZE'] ||
                    row['TOTAL / SIZE'] ||
                    row['Total/Size'] ||
                    row['Total / Size'] ||
                    row['TOTAL'] ||
                    row['Total'] ||
                    '';
                  const totalNum = parseCellNumber(totalRaw);
                  if (totalNum > 0) {
                    item.sizes[size] = (item.sizes[size] || 0) + totalNum;
                    item.total += totalNum;
                  }
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

                const numVal = parseCellNumber(val);
                if (numVal > 0) {
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

    // Buat sheet terurut: TK, SD, SMP, SMA, SD-SPK, SMP-SPK, SMA-SPK
    const sheetOrder = ['TK', 'SD', 'SMP', 'SMA', 'SD-SPK', 'SMP-SPK', 'SMA-SPK'];

    sheetOrder.forEach((lvl) => {
      const fbKey = (lvl === 'SD-SPK' || lvl === 'SPK-SD') ? 'SPK-SD' : (lvl === 'SMP-SPK' || lvl === 'SPK-SMP') ? 'SPK-SMP' : (lvl === 'SMA-SPK' || lvl === 'SPK-SMA') ? 'SPK-SMA' : lvl;
      const schoolList = getSchoolsForLevel(lvl, fallbackSchools[fbKey] || fallbackSchools[lvl]);

      // Ambil seluruh produk (seragam, kaos kaki, sepatu, topi, dasi, aksesoris) kecuali buku langsung dari database barang (props products)
      const dbItemsForLevel = products.filter((p) => {
        const isBuku = p.category && p.category.toLowerCase() === 'buku';
        if (isBuku) return false;
        const pLvl = (p.level || '').toUpperCase().trim();
        const pName = (p.name || '').toUpperCase();

        if (lvl === 'SD-SPK' || lvl === 'SPK-SD') {
          return pLvl === 'SD-SPK' || pLvl === 'SPK-SD' || (pLvl.includes('SPK') && (pLvl.includes('SD') || pLvl.includes('PRIMARY') || pName.includes('PRIMARY') || pName.includes('SD')));
        }
        if (lvl === 'SMP-SPK' || lvl === 'SPK-SMP') {
          return pLvl === 'SMP-SPK' || pLvl === 'SPK-SMP' || (pLvl.includes('SPK') && (pLvl.includes('SMP') || pLvl.includes('LOWER') || pName.includes('LOWER') || pName.includes('SMP')));
        }
        if (lvl === 'SMA-SPK' || lvl === 'SPK-SMA') {
          return pLvl === 'SMA-SPK' || pLvl === 'SPK-SMA' || (pLvl.includes('SPK') && (pLvl.includes('SMA') || pLvl.includes('UPPER') || pName.includes('UPPER') || pName.includes('SMA') || pName.includes('JC')));
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
  // 4. EKSPOR SPK VENDOR KE EXCEL (.XLSX) - OPSI A (PER JENJANG PER SHEET)
  //    Baris: Jenis Barang (di-merge vertikal) & Ukuran
  //    Kolom: Sekolah-sekolah jenjang terkait & TOTAL (PCS)
  //    Sheet: Dibagi per jenjang agar kolom sekolah tidak terlalu banyak/lebar
  // =========================================================================

  // Helper untuk mendapatkan sekolah-sekolah yang dilayani vendor pada jenjang tertentu
  const getSchoolsForVendorLevel = (
    va: VendorAllocation,
    lvl: string,
    levelItems: VendorAllocatedItem[]
  ): string[] => {
    const levelSchoolsSet = new Set<string>();

    // 1. Dari rincian barang jenjang ini (schoolsForItem & schoolBreakdown)
    levelItems.forEach((it) => {
      if (it.schoolsForItem) {
        it.schoolsForItem.forEach((s) => levelSchoolsSet.add(s));
      }
      if (it.schoolBreakdown) {
        Object.keys(it.schoolBreakdown).forEach((s) => levelSchoolsSet.add(s));
      }
    });

    // 2. Dari plottings database untuk vendor ini pada jenjang ini
    effectivePlottings.forEach((p) => {
      if (p.vendor_id === va.vendorId) {
        const pLvl = normalizeLevel(p.app_users?.school_level || '');
        const sName = p.app_users?.school_name || '';
        if (sName && pLvl === normalizeLevel(lvl)) {
          levelSchoolsSet.add(sName);
        }
      }
    });

    // 3. Dari va.schoolNames yang cocok dengan jenjang ini
    va.schoolNames.forEach((sName) => {
      const schObj = schools.find((s) => s.school_name === sName);
      const sLvl = resolveSchoolLevel(sName, schObj?.email, schObj?.level);
      if (sLvl === lvl) {
        levelSchoolsSet.add(sName);
      }
    });

    return Array.from(levelSchoolsSet)
      .filter((s) => s && s.trim() !== '')
      .sort((a, b) => a.localeCompare(b, 'id', { numeric: true, sensitivity: 'base' }));
  };

  // Helper untuk membuat 1 sheet SPK vendor per jenjang tertentu
  const buildVendorLevelSPKWorksheet = (
    workbook: ExcelJS.Workbook,
    sheetName: string,
    vendorAlloc: VendorAllocation,
    level: string,
    targetYearStr: string,
    levelItems: VendorAllocatedItem[],
    levelSchools: string[]
  ) => {
    const numSchools = levelSchools.length;
    const hasSchools = numSchools > 0;
    const totalColIdx = hasSchools ? 3 + numSchools : 3;

    const worksheet = workbook.addWorksheet(sheetName, {
      views: [{ showGridLines: true }],
    });

    const thinBorder: Partial<ExcelJS.Borders> = {
      top: { style: 'thin', color: { argb: 'FF000000' } },
      left: { style: 'thin', color: { argb: 'FF000000' } },
      bottom: { style: 'thin', color: { argb: 'FF000000' } },
      right: { style: 'thin', color: { argb: 'FF000000' } },
    };

    const headerFill: ExcelJS.Fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF8FAFC' },
    };

    const subHeaderFill: ExcelJS.Fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF1F5F9' },
    };

    const totalFill: ExcelJS.Fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF1F5F9' },
    };

    // 1. Informasi Header SPK
    worksheet.getCell(1, 1).value = `SURAT PERINTAH KERJA (SPK) PRODUKSI - JENJANG ${getLevelDisplayTitle(level)}`;
    worksheet.getCell(1, 1).font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FF1E293B' } };

    worksheet.getCell(2, 1).value = `Tahun Ajaran: ${targetYearStr}`;
    worksheet.getCell(2, 1).font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF334155' } };

    worksheet.getCell(3, 1).value = `Vendor / Mitra: ${vendorAlloc.vendorName.toUpperCase()}`;
    worksheet.getCell(3, 1).font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF0F172A' } };

    worksheet.getCell(4, 1).value = `PIC: ${vendorAlloc.contactPerson || '-'} | No. Telp: ${vendorAlloc.phone || '-'}`;
    worksheet.getCell(4, 1).font = { name: 'Calibri', size: 10, color: { argb: 'FF475569' } };

    const schoolSubtitle = hasSchools
      ? `Sekolah Jenjang ${getLevelDisplayTitle(level)} yang Dilayani (${levelSchools.length} Sekolah): ${levelSchools.join(', ')}`
      : `Sekolah Jenjang ${getLevelDisplayTitle(level)} yang Dilayani: Seluruh Sekolah Terdaftar`;
    worksheet.getCell(5, 1).value = schoolSubtitle;
    worksheet.getCell(5, 1).font = { name: 'Calibri', size: 9, italic: true, color: { argb: 'FF64748B' } };

    // 2. Header Tabel (Baris 7 & 8)
    const headerRow1 = 7;
    const headerRow2 = 8;
    worksheet.getRow(headerRow1).height = 24;
    worksheet.getRow(headerRow2).height = 28;

    worksheet.getCell(headerRow1, 1).value = 'JENIS BARANG';
    worksheet.mergeCells(headerRow1, 1, headerRow2, 1);

    worksheet.getCell(headerRow1, 2).value = 'UKURAN';
    worksheet.mergeCells(headerRow1, 2, headerRow2, 2);

    if (hasSchools) {
      worksheet.getCell(headerRow1, 3).value = `RINCIAN ALOKASI SEKOLAH (${getLevelDisplayTitle(level)})`;
      if (numSchools > 1) {
        worksheet.mergeCells(headerRow1, 3, headerRow1, 2 + numSchools);
      }
      levelSchools.forEach((schoolName, sIdx) => {
        worksheet.getCell(headerRow2, 3 + sIdx).value = schoolName;
      });
      worksheet.getCell(headerRow1, totalColIdx).value = 'TOTAL (PCS)';
      worksheet.mergeCells(headerRow1, totalColIdx, headerRow2, totalColIdx);
    } else {
      worksheet.getCell(headerRow1, 3).value = 'TOTAL (PCS)';
      worksheet.mergeCells(headerRow1, 3, headerRow2, 3);
    }

    for (let r = headerRow1; r <= headerRow2; r++) {
      for (let c = 1; c <= totalColIdx; c++) {
        const cell = worksheet.getCell(r, c);
        cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF000000' } };
        cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
        cell.border = thinBorder;
        cell.fill = r === headerRow1 ? headerFill : subHeaderFill;
      }
    }

    // 3. Rincian Data Barang & Ukuran
    let currentRow = 9;
    const schoolColumnTotals = new Array(numSchools).fill(0);
    let grandPcsSum = 0;

    levelItems.forEach((it) => {
      const rawSizes = Object.keys(it.sizes).filter((s) => s && s.trim() !== '' && s !== 'TOTAL');
      const sortedSizes = rawSizes.sort((a, b) => {
        const idxA = STANDARD_SIZE_ORDER.indexOf(a);
        const idxB = STANDARD_SIZE_ORDER.indexOf(b);
        if (idxA !== -1 && idxB !== -1) return idxA - idxB;
        if (idxA !== -1) return -1;
        if (idxB !== -1) return 1;
        return a.localeCompare(b, undefined, { numeric: true });
      });

      const sizesToRender = sortedSizes.length > 0 ? sortedSizes : ['ALL SIZE'];
      const startItemRow = currentRow;

      sizesToRender.forEach((sz) => {
        const row = worksheet.getRow(currentRow);
        row.height = 20;

        // Kolom 1: Nama Barang
        const cellA = worksheet.getCell(currentRow, 1);
        cellA.value = it.uniformName;
        cellA.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF000000' } };
        cellA.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
        cellA.border = thinBorder;

        // Kolom 2: Ukuran
        const cellB = worksheet.getCell(currentRow, 2);
        cellB.value = sz;
        cellB.font = { name: 'Calibri', size: 10, color: { argb: 'FF000000' } };
        cellB.alignment = { vertical: 'middle', horizontal: 'center' };
        cellB.border = thinBorder;

        // Kolom Sekolah-sekolah
        let rowSum = 0;
        if (hasSchools) {
          levelSchools.forEach((schoolName, sIdx) => {
            const colIdx = 3 + sIdx;

            let qty = it.schoolBreakdown?.[schoolName]?.[sz] || 0;
            if (!qty && it.schoolBreakdown) {
              const cleanTarget = schoolName.toLowerCase().replace(/[^a-z0-9]/g, '');
              for (const [sKey, szMap] of Object.entries(it.schoolBreakdown)) {
                const cleanKey = sKey.toLowerCase().replace(/[^a-z0-9]/g, '');
                if (cleanKey === cleanTarget || cleanKey.includes(cleanTarget) || cleanTarget.includes(cleanKey)) {
                  qty = szMap[sz] || 0;
                  break;
                }
              }
            }

            rowSum += qty;
            schoolColumnTotals[sIdx] += qty;

            const cellV = worksheet.getCell(currentRow, colIdx);
            cellV.value = qty > 0 ? qty : '';
            cellV.font = { name: 'Calibri', size: 10, color: { argb: 'FF000000' } };
            cellV.alignment = { vertical: 'middle', horizontal: 'right' };
            cellV.border = thinBorder;
            if (qty > 0) cellV.numFmt = '#,##0';
          });

          // Remainder check fallback
          const expectedSizeTotal = it.sizes[sz] || 0;
          if (rowSum < expectedSizeTotal) {
            const diff = expectedSizeTotal - rowSum;
            let targetIdx = 0;
            if (it.schoolsForItem && it.schoolsForItem.length > 0) {
              const fIdx = levelSchools.findIndex((sn) => it.schoolsForItem!.includes(sn));
              if (fIdx !== -1) targetIdx = fIdx;
            }
            const currentCell = worksheet.getCell(currentRow, 3 + targetIdx);
            const currentVal = typeof currentCell.value === 'number' ? currentCell.value : 0;
            const newVal = currentVal + diff;
            currentCell.value = newVal > 0 ? newVal : '';
            if (newVal > 0) currentCell.numFmt = '#,##0';
            schoolColumnTotals[targetIdx] += diff;
            rowSum += diff;
          }

          const finalRowTotal = expectedSizeTotal > 0 ? expectedSizeTotal : rowSum;
          grandPcsSum += finalRowTotal;

          const cellTot = worksheet.getCell(currentRow, totalColIdx);
          cellTot.value = finalRowTotal > 0 ? finalRowTotal : '';
          cellTot.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF000000' } };
          cellTot.alignment = { vertical: 'middle', horizontal: 'right' };
          cellTot.border = thinBorder;
          if (finalRowTotal > 0) cellTot.numFmt = '#,##0';
        } else {
          const finalRowTotal = it.sizes[sz] || 0;
          grandPcsSum += finalRowTotal;
          const cellTot = worksheet.getCell(currentRow, 3);
          cellTot.value = finalRowTotal > 0 ? finalRowTotal : '';
          cellTot.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF000000' } };
          cellTot.alignment = { vertical: 'middle', horizontal: 'right' };
          cellTot.border = thinBorder;
          if (finalRowTotal > 0) cellTot.numFmt = '#,##0';
        }

        currentRow++;
      });

      // Merge Vertikal Kolom 1 (JENIS BARANG)
      const endItemRow = currentRow - 1;
      if (endItemRow > startItemRow) {
        worksheet.mergeCells(startItemRow, 1, endItemRow, 1);
        const mergedCell = worksheet.getCell(startItemRow, 1);
        mergedCell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      }
    });

    // 4. Baris TOTAL KESELURUHAN (PCS) di Bagian Bawah
    const grandRow = currentRow;
    worksheet.getRow(grandRow).height = 24;

    worksheet.getCell(grandRow, 1).value = 'TOTAL KESELURUHAN (PCS)';
    worksheet.mergeCells(grandRow, 1, grandRow, 2);

    const grandLabelCell = worksheet.getCell(grandRow, 1);
    grandLabelCell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF000000' } };
    grandLabelCell.alignment = { vertical: 'middle', horizontal: 'center' };
    grandLabelCell.border = thinBorder;
    grandLabelCell.fill = totalFill;

    worksheet.getCell(grandRow, 2).border = thinBorder;
    worksheet.getCell(grandRow, 2).fill = totalFill;

    if (hasSchools) {
      levelSchools.forEach((_, sIdx) => {
        const colIdx = 3 + sIdx;
        const sTot = schoolColumnTotals[sIdx] || 0;
        const cellS = worksheet.getCell(grandRow, colIdx);
        cellS.value = sTot > 0 ? sTot : '';
        cellS.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF000000' } };
        cellS.alignment = { vertical: 'middle', horizontal: 'right' };
        cellS.border = thinBorder;
        cellS.fill = totalFill;
        if (sTot > 0) cellS.numFmt = '#,##0';
      });

      const cellGrand = worksheet.getCell(grandRow, totalColIdx);
      cellGrand.value = grandPcsSum > 0 ? grandPcsSum : '';
      cellGrand.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF000000' } };
      cellGrand.alignment = { vertical: 'middle', horizontal: 'right' };
      cellGrand.border = thinBorder;
      cellGrand.fill = totalFill;
      if (grandPcsSum > 0) cellGrand.numFmt = '#,##0';
    } else {
      const cellGrand = worksheet.getCell(grandRow, 3);
      cellGrand.value = grandPcsSum > 0 ? grandPcsSum : '';
      cellGrand.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF000000' } };
      cellGrand.alignment = { vertical: 'middle', horizontal: 'right' };
      cellGrand.border = thinBorder;
      cellGrand.fill = totalFill;
      if (grandPcsSum > 0) cellGrand.numFmt = '#,##0';
    }

    // 5. Atur Lebar Kolom
    worksheet.getColumn(1).width = 30; // JENIS BARANG
    worksheet.getColumn(2).width = 12; // UKURAN
    if (hasSchools) {
      for (let sIdx = 0; sIdx < numSchools; sIdx++) {
        worksheet.getColumn(3 + sIdx).width = 22; // Tiap Sekolah
      }
      worksheet.getColumn(totalColIdx).width = 16; // TOTAL (PCS)
    } else {
      worksheet.getColumn(3).width = 16;
    }

    // 6. Tanda Tangan / Pengesahan SPK di Bawah Tabel
    const signStartRow = grandRow + 3;
    const midCol = Math.max(2, Math.floor(totalColIdx / 2));
    const rightCol = Math.max(3, totalColIdx - 1);

    worksheet.getCell(signStartRow, 1).value = 'Dibuat Oleh:';
    worksheet.getCell(signStartRow, midCol).value = 'Menyetujui:';
    worksheet.getCell(signStartRow, rightCol).value = 'Menerima:';

    worksheet.getCell(signStartRow + 1, 1).value = 'Bagian Pengadaan & Produksi';
    worksheet.getCell(signStartRow + 1, midCol).value = 'Pengurus Koperasi';
    worksheet.getCell(signStartRow + 1, rightCol).value = 'Pihak Vendor / Mitra';

    for (const c of [1, midCol, rightCol]) {
      worksheet.getCell(signStartRow, c).font = { name: 'Calibri', size: 10, color: { argb: 'FF334155' } };
      worksheet.getCell(signStartRow + 1, c).font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF0F172A' } };
    }

    worksheet.getCell(signStartRow + 5, 1).value = '( .................................................... )';
    worksheet.getCell(signStartRow + 5, midCol).value = '( .................................................... )';
    worksheet.getCell(signStartRow + 5, rightCol).value = `( ${vendorAlloc.vendorName.toUpperCase()} )`;

    for (const c of [1, midCol, rightCol]) {
      worksheet.getCell(signStartRow + 5, c).font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF000000' } };
    }
  };

  // Ekspor SPK Tunggal Vendor (Dibagi per sheet per jenjang)
  const handleExportVendorSPK = async (vendorAlloc: VendorAllocation) => {
    if (vendorAlloc.items.length === 0) {
      alert(`Vendor "${vendorAlloc.vendorName}" belum memiliki alokasi produksi.`);
      return;
    }

    const availableLevels = Array.from(new Set(vendorAlloc.items.map((it) => it.level.toUpperCase().trim())));
    availableLevels.sort((a, b) => {
      const rankA = getLevelRank(a);
      const rankB = getLevelRank(b);
      if (rankA !== rankB) return rankA - rankB;
      return a.localeCompare(b);
    });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Koperasi Konsumen Karyawan BPK PENABUR Jakarta';
    workbook.created = new Date();

    const thinBorder: Partial<ExcelJS.Borders> = {
      top: { style: 'thin', color: { argb: 'FF000000' } },
      left: { style: 'thin', color: { argb: 'FF000000' } },
      bottom: { style: 'thin', color: { argb: 'FF000000' } },
      right: { style: 'thin', color: { argb: 'FF000000' } },
    };

    const headerFill: ExcelJS.Fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF8FAFC' },
    };

    const totalFill: ExcelJS.Fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF1F5F9' },
    };

    // Jika vendor memiliki lebih dari 1 jenjang, buat Sheet Ringkasan di awal
    if (availableLevels.length > 1) {
      const summarySheet = workbook.addWorksheet('Ringkasan_Jenjang', {
        views: [{ showGridLines: true }],
      });

      summarySheet.getCell(1, 1).value = `REKAPITULASI SPK PRODUKSI PER JENJANG - ${vendorAlloc.vendorName.toUpperCase()}`;
      summarySheet.getCell(1, 1).font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FF1E293B' } };

      summarySheet.getCell(2, 1).value = `Tahun Ajaran: ${targetYear} | PIC: ${vendorAlloc.contactPerson || '-'} | No. Telp: ${vendorAlloc.phone || '-'}`;
      summarySheet.getCell(2, 1).font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF475569' } };

      const headers = ['NO', 'JENJANG', 'NAMA SHEET', 'JUMLAH SEKOLAH', 'DAFTAR SEKOLAH', 'JUMLAH ITEM', 'TOTAL TARGET (PCS)'];
      summarySheet.getRow(4).height = 24;
      headers.forEach((h, idx) => {
        const cell = summarySheet.getCell(4, idx + 1);
        cell.value = h;
        cell.font = { name: 'Calibri', size: 10, bold: true };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.border = thinBorder;
        cell.fill = headerFill;
      });

      let sRow = 5;
      let totalPcsAllLevels = 0;

      availableLevels.forEach((lvl, idx) => {
        const levelItems = vendorAlloc.items.filter((it) => it.level.toUpperCase().trim() === lvl);
        const levelSchools = getSchoolsForVendorLevel(vendorAlloc, lvl, levelItems);
        const levelPcs = levelItems.reduce((sum, it) => sum + (it.total || 0), 0);
        totalPcsAllLevels += levelPcs;

        const schoolList = levelSchools.length > 0 ? levelSchools : ['-'];
        const rowCount = schoolList.length;
        const startRow = sRow;
        const endRow = startRow + rowCount - 1;

        schoolList.forEach((sName, subIdx) => {
          const r = startRow + subIdx;
          summarySheet.getRow(r).height = 20;

          // Siapkan seluruh cell di baris r dengan border dan font dasar
          for (let c = 1; c <= 7; c++) {
            const cell = summarySheet.getCell(r, c);
            cell.font = { name: 'Calibri', size: 10 };
            cell.border = thinBorder;
          }

          // Kolom 5: Daftar Sekolah (tiap sekolah di baris/cell sendiri)
          const cellSch = summarySheet.getCell(r, 5);
          cellSch.value = sName;
          cellSch.alignment = { vertical: 'middle', horizontal: 'left' };
        });

        // Set value dan styling untuk kolom data di baris pertama (startRow)
        const cellNo = summarySheet.getCell(startRow, 1);
        cellNo.value = idx + 1;
        cellNo.alignment = { vertical: 'middle', horizontal: 'center' };

        const cellLvl = summarySheet.getCell(startRow, 2);
        cellLvl.value = getLevelDisplayTitle(lvl);
        cellLvl.font = { name: 'Calibri', size: 10, bold: true };
        cellLvl.alignment = { vertical: 'middle', horizontal: 'center' };

        const cellSheet = summarySheet.getCell(startRow, 3);
        cellSheet.value = lvl;
        cellSheet.font = { name: 'Calibri', size: 10, italic: true };
        cellSheet.alignment = { vertical: 'middle', horizontal: 'center' };

        const cellCount = summarySheet.getCell(startRow, 4);
        cellCount.value = levelSchools.length;
        cellCount.alignment = { vertical: 'middle', horizontal: 'center' };

        const cellItems = summarySheet.getCell(startRow, 6);
        cellItems.value = levelItems.length;
        cellItems.alignment = { vertical: 'middle', horizontal: 'center' };

        const cellPcs = summarySheet.getCell(startRow, 7);
        cellPcs.value = levelPcs;
        cellPcs.font = { name: 'Calibri', size: 10, bold: true };
        cellPcs.alignment = { vertical: 'middle', horizontal: 'right' };
        cellPcs.numFmt = '#,##0';

        // Jika jumlah sekolah > 1, merge vertikal kolom 1, 2, 3, 4, 6, 7
        if (endRow > startRow) {
          summarySheet.mergeCells(startRow, 1, endRow, 1);
          summarySheet.mergeCells(startRow, 2, endRow, 2);
          summarySheet.mergeCells(startRow, 3, endRow, 3);
          summarySheet.mergeCells(startRow, 4, endRow, 4);
          // Kolom 5 (Daftar Sekolah) sengaja TIDAK di-merge agar tiap sekolah menempati cell baris sendiri
          summarySheet.mergeCells(startRow, 6, endRow, 6);
          summarySheet.mergeCells(startRow, 7, endRow, 7);
        }

        sRow = endRow + 1;
      });

      // Total row
      summarySheet.getRow(sRow).height = 22;
      summarySheet.getCell(sRow, 1).value = 'TOTAL KESELURUHAN';
      summarySheet.mergeCells(sRow, 1, sRow, 6);
      const totLabel = summarySheet.getCell(sRow, 1);
      totLabel.font = { name: 'Calibri', size: 10, bold: true };
      totLabel.alignment = { vertical: 'middle', horizontal: 'center' };
      totLabel.fill = totalFill;
      totLabel.border = thinBorder;
      for (let c = 2; c <= 6; c++) {
        summarySheet.getCell(sRow, c).fill = totalFill;
        summarySheet.getCell(sRow, c).border = thinBorder;
      }

      const totValCell = summarySheet.getCell(sRow, 7);
      totValCell.value = totalPcsAllLevels;
      totValCell.font = { name: 'Calibri', size: 10, bold: true };
      totValCell.alignment = { vertical: 'middle', horizontal: 'right' };
      totValCell.fill = totalFill;
      totValCell.border = thinBorder;
      totValCell.numFmt = '#,##0';

      summarySheet.getColumn(1).width = 6;
      summarySheet.getColumn(2).width = 12;
      summarySheet.getColumn(3).width = 14;
      summarySheet.getColumn(4).width = 18;
      summarySheet.getColumn(5).width = 45;
      summarySheet.getColumn(6).width = 16;
      summarySheet.getColumn(7).width = 22;
    }

    // Buat Sheet per Jenjang untuk vendor ini (SD, SMP, SMA, TK, dll)
    const usedSheetNames = new Set<string>();
    if (availableLevels.length > 1) {
      usedSheetNames.add('ringkasan_jenjang');
    }

    availableLevels.forEach((lvl) => {
      const levelItems = vendorAlloc.items.filter((it) => it.level.toUpperCase().trim() === lvl);
      if (levelItems.length === 0) return;
      const levelSchools = getSchoolsForVendorLevel(vendorAlloc, lvl, levelItems);

      let sheetName = lvl.replace(/[\\/?*[\]:]/g, '').trim().slice(0, 31) || 'SPK';
      let candidate = sheetName;
      let counter = 1;
      while (usedSheetNames.has(candidate.toLowerCase())) {
        candidate = `${sheetName.slice(0, 28)}_${counter}`;
        counter++;
      }
      usedSheetNames.add(candidate.toLowerCase());

      buildVendorLevelSPKWorksheet(workbook, candidate, vendorAlloc, lvl, targetYear, levelItems, levelSchools);
    });

    const buffer = await workbook.xlsx.writeBuffer();
    saveAs(
      new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
      `SPK_${vendorAlloc.vendorName.replace(/[/\\?*[\]:\s]/g, '_')}_${targetYear.replace(/[/\\?*[\]:]/g, '_')}.xlsx`
    );
  };

  // Ekspor Rekap Semua Vendor Sekaligus (Multi-Sheet: Ringkasan + Matriks per Vendor per Jenjang, misal: Andryna-TK, Andryna-SD, dst.)
  const handleExportAllVendors = async () => {
    if (vendorAllocations.length === 0) {
      alert('Tidak ada alokasi vendor untuk diekspor.');
      return;
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Koperasi Konsumen Karyawan BPK PENABUR Jakarta';
    workbook.created = new Date();

    const thinBorder: Partial<ExcelJS.Borders> = {
      top: { style: 'thin', color: { argb: 'FF000000' } },
      left: { style: 'thin', color: { argb: 'FF000000' } },
      bottom: { style: 'thin', color: { argb: 'FF000000' } },
      right: { style: 'thin', color: { argb: 'FF000000' } },
    };

    const headerFill: ExcelJS.Fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF8FAFC' },
    };

    const totalFill: ExcelJS.Fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF1F5F9' },
    };

    // 1. Sheet Ringkasan Semua Vendor
    const summarySheet = workbook.addWorksheet('Ringkasan_Vendor', {
      views: [{ showGridLines: true }],
    });

    summarySheet.getCell(1, 1).value = 'REKAPITULASI ALOKASI PRODUKSI SELURUH VENDOR';
    summarySheet.getCell(1, 1).font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FF1E293B' } };

    summarySheet.getCell(2, 1).value = `Tahun Ajaran: ${targetYear}`;
    summarySheet.getCell(2, 1).font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF475569' } };

    const headers = [
      'NO',
      'NAMA VENDOR',
      'KONTAK PERSON',
      'NO. TELEPON',
      'JUMLAH SEKOLAH',
      'DAFTAR SEKOLAH',
      'TOTAL ITEM SERAGAM',
      'TOTAL TARGET (PCS)',
    ];

    summarySheet.getRow(4).height = 24;
    headers.forEach((h, idx) => {
      const cell = summarySheet.getCell(4, idx + 1);
      cell.value = h;
      cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF000000' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = thinBorder;
      cell.fill = headerFill;
    });

    let sRow = 5;
    let grandAllVendorsPcs = 0;

    vendorAllocations.forEach((va, idx) => {
      const schoolList = va.schoolNames && va.schoolNames.length > 0 ? va.schoolNames : ['-'];
      const rowCount = schoolList.length;
      const startRow = sRow;
      const endRow = startRow + rowCount - 1;

      schoolList.forEach((sName, subIdx) => {
        const r = startRow + subIdx;
        summarySheet.getRow(r).height = 20;

        for (let c = 1; c <= 8; c++) {
          const cell = summarySheet.getCell(r, c);
          cell.font = { name: 'Calibri', size: 10 };
          cell.border = thinBorder;
        }

        // Kolom 6: Daftar Sekolah (tiap sekolah di baris/cell sendiri)
        const cellSch = summarySheet.getCell(r, 6);
        cellSch.value = sName;
        cellSch.alignment = { vertical: 'middle', horizontal: 'left' };
      });

      // Data utama di baris startRow
      const cellNo = summarySheet.getCell(startRow, 1);
      cellNo.value = idx + 1;
      cellNo.alignment = { vertical: 'middle', horizontal: 'center' };

      const cellVendor = summarySheet.getCell(startRow, 2);
      cellVendor.value = va.vendorName;
      cellVendor.font = { name: 'Calibri', size: 10, bold: true };
      cellVendor.alignment = { vertical: 'middle', horizontal: 'left' };

      const cellPic = summarySheet.getCell(startRow, 3);
      cellPic.value = va.contactPerson || '-';
      cellPic.alignment = { vertical: 'middle', horizontal: 'left' };

      const cellPhone = summarySheet.getCell(startRow, 4);
      cellPhone.value = va.phone || '-';
      cellPhone.alignment = { vertical: 'middle', horizontal: 'left' };

      const cellSchCount = summarySheet.getCell(startRow, 5);
      cellSchCount.value = va.schoolNames.length;
      cellSchCount.alignment = { vertical: 'middle', horizontal: 'center' };

      const cellItems = summarySheet.getCell(startRow, 7);
      cellItems.value = va.items.length;
      cellItems.alignment = { vertical: 'middle', horizontal: 'center' };

      const cellPcs = summarySheet.getCell(startRow, 8);
      cellPcs.value = va.grandTotalPcs;
      cellPcs.font = { name: 'Calibri', size: 10, bold: true };
      cellPcs.alignment = { vertical: 'middle', horizontal: 'right' };
      cellPcs.numFmt = '#,##0';

      grandAllVendorsPcs += va.grandTotalPcs;

      // Jika jumlah sekolah > 1, merge vertikal kolom 1, 2, 3, 4, 5, 7, 8
      if (endRow > startRow) {
        summarySheet.mergeCells(startRow, 1, endRow, 1);
        summarySheet.mergeCells(startRow, 2, endRow, 2);
        summarySheet.mergeCells(startRow, 3, endRow, 3);
        summarySheet.mergeCells(startRow, 4, endRow, 4);
        summarySheet.mergeCells(startRow, 5, endRow, 5);
        // Kolom 6 (Daftar Sekolah) sengaja TIDAK di-merge agar tiap sekolah menempati cell baris sendiri
        summarySheet.mergeCells(startRow, 7, endRow, 7);
        summarySheet.mergeCells(startRow, 8, endRow, 8);
      }

      sRow = endRow + 1;
    });

    // Baris Total di Ringkasan
    summarySheet.getRow(sRow).height = 22;
    summarySheet.getCell(sRow, 1).value = 'TOTAL KESELURUHAN';
    summarySheet.mergeCells(sRow, 1, sRow, 7);

    const sTotLabel = summarySheet.getCell(sRow, 1);
    sTotLabel.font = { name: 'Calibri', size: 10, bold: true };
    sTotLabel.alignment = { vertical: 'middle', horizontal: 'center' };
    sTotLabel.fill = totalFill;
    sTotLabel.border = thinBorder;
    for (let c = 2; c <= 7; c++) {
      summarySheet.getCell(sRow, c).border = thinBorder;
      summarySheet.getCell(sRow, c).fill = totalFill;
    }

    const sGrandCell = summarySheet.getCell(sRow, 8);
    sGrandCell.value = grandAllVendorsPcs;
    sGrandCell.font = { name: 'Calibri', size: 10, bold: true };
    sGrandCell.alignment = { vertical: 'middle', horizontal: 'right' };
    sGrandCell.fill = totalFill;
    sGrandCell.border = thinBorder;
    sGrandCell.numFmt = '#,##0';

    summarySheet.getColumn(1).width = 6;
    summarySheet.getColumn(2).width = 28;
    summarySheet.getColumn(3).width = 20;
    summarySheet.getColumn(4).width = 18;
    summarySheet.getColumn(5).width = 18;
    summarySheet.getColumn(6).width = 45;
    summarySheet.getColumn(7).width = 20;
    summarySheet.getColumn(8).width = 22;

    // 2. Satu Sheet per Vendor per Jenjang (misal: Andryna-TK, Andryna-SD, Loki-SD, dst.)
    const usedSheetNames = new Set<string>(['ringkasan_vendor']);

    vendorAllocations.forEach((va) => {
      const vendorLevels = Array.from(new Set(va.items.map((it) => it.level.toUpperCase().trim())));
      vendorLevels.sort((a, b) => {
        const rankA = getLevelRank(a);
        const rankB = getLevelRank(b);
        if (rankA !== rankB) return rankA - rankB;
        return a.localeCompare(b);
      });

      vendorLevels.forEach((lvl) => {
        const levelItems = va.items.filter((it) => it.level.toUpperCase().trim() === lvl);
        if (levelItems.length === 0) return;

        const levelSchools = getSchoolsForVendorLevel(va, lvl, levelItems);

        // Format nama sheet: NamaVendor-Jenjang, misal Andryna-TK, Andryna-SD
        const rawBase = `${va.vendorName}-${lvl}`.replace(/[\\/?*[\]:]/g, '').trim();
        let candidate = rawBase.slice(0, 31);
        let counter = 1;
        while (usedSheetNames.has(candidate.toLowerCase())) {
          const suffix = `_${counter}`;
          candidate = `${rawBase.slice(0, 31 - suffix.length)}${suffix}`;
          counter++;
        }
        usedSheetNames.add(candidate.toLowerCase());

        buildVendorLevelSPKWorksheet(workbook, candidate, va, lvl, targetYear, levelItems, levelSchools);
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    saveAs(
      new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
      `Semua_SPK_Vendor_${targetYear.replace(/[/\\?*[\]:]/g, '_')}.xlsx`
    );
  };

  // =========================================================================
  // 4B. EKSPOR LAMPIRAN SPK VENDOR KE PDF (FORMAT MATRIKS PER SEKOLAH)
  //     Format persis sesuai lampiran SPK resmi BPK PENABUR:
  //     Header kolom: JENIS | Kode Sekolah (KGS, KBJ, D08, D09, D10, TM1, TM2, DKGI, dll)
  //     Sel: Singkatan nama vendor (misal "Sumak") jika di-plot
  //     Merge row: "Semua Sekolah TKK" jika mencakup seluruh sekolah
  // =========================================================================
  const handleExportVendorSPKPdf = (vendorAlloc: VendorAllocation) => {
    try {
      // 1. Ambil penugasan vendor dari effectivePlottings (yang sudah diperkaya nama & jenjang sekolah)
      const vPlottings = effectivePlottings.filter((p) => p.vendor_id === vendorAlloc.vendorId);
      if (vPlottings.length === 0 && vendorAlloc.items.length === 0) {
        alert(`Vendor "${vendorAlloc.vendorName}" belum memiliki data penugasan plotting sekolah.`);
        return;
      }

      const doc = new jsPDF('landscape', 'mm', 'a4');
      const vendorLabel = getVendorShortCode(vendorAlloc.vendorName);

      const jenjangOrder = ['TK', 'SD', 'SMP', 'SMA', 'SPK-SD', 'SPK-SMP', 'SPK-SMA'];
      const activeLevels = jenjangOrder.filter((lvl) => {
        const curNorm = normalizeLevel(lvl);
        const hasPlottings = vPlottings.some((p) => normalizeLevel(p.app_users?.school_level || '') === curNorm);
        const hasAlloc = vendorAlloc.items.some((it) => normalizeLevel(it.level) === curNorm);
        return hasPlottings || hasAlloc;
      });

      if (activeLevels.length === 0) {
        alert(`Tidak ada jenjang sekolah yang aktif untuk vendor "${vendorAlloc.vendorName}".`);
        return;
      }

      let currentY = 14;

      // Header Dokumen
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.text(`${vendorAlloc.vendorName.toUpperCase()} TA ${targetYear}`, 14, currentY);
      currentY += 5;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(80, 80, 80);
      doc.text(
        `Lampiran Surat Perintah Kerja (SPK) - Matriks Penugasan Seragam per Sekolah | PIC: ${vendorAlloc.contactPerson || '-'} | Telp: ${vendorAlloc.phone || '-'}`,
        14,
        currentY
      );
      currentY += 7;

      let tablesCreated = 0;

      activeLevels.forEach((lvl) => {
        const curNormLvl = normalizeLevel(lvl);
        const headerTitle =
          curNormLvl === 'TK' ? 'TKK' :
          curNormLvl === 'SD' ? 'SDK' :
          curNormLvl === 'SMP' ? 'SMPK' :
          curNormLvl === 'SMA' ? 'SMAK' :
          curNormLvl === 'SPK-SD' ? 'SPK-SD (Primary)' :
          curNormLvl === 'SPK-SMP' ? 'SPK-SMP (Lower Secondary)' :
          curNormLvl === 'SPK-SMA' ? 'SPK-SMA (Upper Secondary)' : curNormLvl;
        const lvlPlottings = vPlottings.filter((p) => normalizeLevel(p.app_users?.school_level || '') === curNormLvl);

        // Kumpulkan sekolah untuk header kolom pada jenjang ini
        const schoolMap = new Map<string, { id: string; name: string; email: string; code: string }>();

        lvlPlottings.forEach((p) => {
          const sName = p.app_users?.school_name || '';
          const sEmail = p.app_users?.username || '';
          const sId = p.school_user_id || sName;
          if (sName && !schoolMap.has(sId)) {
            schoolMap.set(sId, {
              id: sId,
              name: sName,
              email: sEmail,
              code: getSchoolDisplayCode(sName, sEmail, curNormLvl),
            });
          }
        });

        vendorAlloc.items
          .filter((it) => normalizeLevel(it.level) === curNormLvl)
          .forEach((it) => {
            (it.schoolsForItem || []).forEach((sName) => {
              const schObj = schools.find((s) => s.school_name === sName);
              const sEmail = schObj?.email || '';
              const detectedLvl = resolveSchoolLevel(sName, sEmail, schObj?.level);
              if (normalizeLevel(detectedLvl) !== curNormLvl) return;

              const sId = schObj?.id || sName;
              if (sName && !schoolMap.has(sId)) {
                schoolMap.set(sId, {
                  id: sId,
                  name: sName,
                  email: sEmail,
                  code: getSchoolDisplayCode(sName, sEmail, curNormLvl),
                });
              }
            });
          });

        const schoolList = Array.from(schoolMap.values());
        if (schoolList.length === 0) return;

        // Urutkan kolom sekolah: angka (P01, P02...), cabang (PGS, BJ, KW...), TM 1/TM 2, PIS KG/TD, DKGI
        schoolList.sort((a, b) => {
          const isDkgiA = a.code === 'DKGI';
          const isDkgiB = b.code === 'DKGI';
          if (isDkgiA) return 1;
          if (isDkgiB) return -1;

          const isPisA = a.code.startsWith('PIS');
          const isPisB = b.code.startsWith('PIS');
          if (isPisA && !isPisB) return 1;
          if (!isPisA && isPisB) return -1;

          const isTmA = a.code.startsWith('TM');
          const isTmB = b.code.startsWith('TM');
          if (isTmA && !isTmB) return 1;
          if (!isTmA && isTmB) return -1;

          const isNumA = /^[A-Z]\d+$/.test(a.code);
          const isNumB = /^[A-Z]\d+$/.test(b.code);
          if (isNumA && !isNumB) return -1;
          if (!isNumA && isNumB) return 1;

          return a.code.localeCompare(b.code, 'id', { numeric: true });
        });

        // 1. Kumpulkan seluruh candidate items yang berpotensi dikerjakan vendor ini
        const itemMap = new Map<string, string>(); // formattedName -> originalName

        const addItemToMap = (rawItem: string) => {
          const trimmed = (rawItem || '').trim();
          if (!trimmed || !isItemAllowedForLevel(trimmed, lvl)) return;
          const formatted = formatItemDisplayName(trimmed, lvl);
          if (!isItemAllowedForLevel(formatted, lvl)) return;

          // Cek apakah item sudah ada di itemMap (secara nama tampilan, case-insensitive, atau kecocokan seragam)
          const alreadyExists = Array.from(itemMap.keys()).some(
            (k) =>
              k.toLowerCase() === formatted.toLowerCase() ||
              normalizeItemName(k) === normalizeItemName(formatted) ||
              isClothingTypeMatch(k, formatted)
          );

          if (!alreadyExists) {
            itemMap.set(formatted, trimmed);
          }
        };

        // Masukkan item dari lvlPlottings
        lvlPlottings.forEach((p) => {
          if (p.clothing_type === 'Semua Jenis Baju') {
            getStandardItemsForLevel(lvl).forEach((std) => {
              addItemToMap(std);
            });
          } else if (p.clothing_type) {
            splitClothingTypes(p.clothing_type).forEach((raw) => {
              addItemToMap(raw);
            });
          }
        });

        // Masukkan item dari vendorAlloc.items
        vendorAlloc.items
          .filter((it) => normalizeLevel(it.level) === curNormLvl)
          .forEach((it) => {
            addItemToMap(it.uniformName);
          });

        if (itemMap.size === 0) return;

        // Helper pengecekan apakah item ditugaskan ke vendor ini pada sekolah tertentu
        const checkIsAssigned = (sch: { id: string; name: string }, formattedName: string, origName: string): boolean => {
          const pMatch = lvlPlottings.find(
            (p) =>
              p.school_user_id === sch.id ||
              (p.app_users?.school_name && p.app_users.school_name.toLowerCase().trim() === sch.name.toLowerCase().trim())
          );

          if (pMatch) {
            if (pMatch.clothing_type === 'Semua Jenis Baju') {
              return true;
            } else if (pMatch.clothing_type) {
              const types = splitClothingTypes(pMatch.clothing_type);
              const match = types.some(
                (pt) =>
                  pt === 'Semua Jenis Baju' ||
                  isClothingTypeMatch(origName, pt) ||
                  isClothingTypeMatch(formattedName, pt)
              );
              if (match) return true;
            }
          }

          const allocItem = vendorAlloc.items.find(
            (it) =>
              normalizeLevel(it.level) === curNormLvl &&
              (it.uniformName.toLowerCase() === origName.toLowerCase() ||
                formatItemDisplayName(it.uniformName, curNormLvl) === formattedName ||
                isClothingTypeMatch(it.uniformName, origName) ||
                isClothingTypeMatch(it.uniformName, formattedName))
          );
          if (allocItem && allocItem.schoolsForItem?.some((sn) => sn.toLowerCase().trim() === sch.name.toLowerCase().trim())) {
            return true;
          }

          return false;
        };

        // 2. Evaluasi kecocokan item dan sekolah:
        //    HANYA simpan baris & kolom yang BENAR-BENAR dikerjakan oleh vendor ini (tanpa baris/kolom kosong)
        const candidateItems = Array.from(itemMap.keys()).sort((a, b) => {
          const pA = getItemPriority(a, lvl);
          const pB = getItemPriority(b, lvl);
          if (pA !== pB) return pA - pB;
          return a.localeCompare(b);
        });

        const activeSchoolIds = new Set<string>();
        const validItemRows: Array<{ formattedName: string; origName: string; assignedSchoolIds: Set<string> }> = [];

        candidateItems.forEach((formattedName) => {
          const origName = itemMap.get(formattedName) || formattedName;
          const assignedSchools = new Set<string>();

          schoolList.forEach((sch) => {
            if (checkIsAssigned(sch, formattedName, origName)) {
              assignedSchools.add(sch.id);
              activeSchoolIds.add(sch.id);
            }
          });

          // HANYA masukkan jika vendor ini BENAR-BENAR mengerjakan seragam ini pada setidaknya satu sekolah
          if (assignedSchools.size > 0) {
            validItemRows.push({
              formattedName,
              origName,
              assignedSchoolIds: assignedSchools,
            });
          }
        });

        // Jika tidak ada satu pun seragam yang dikerjakan vendor di jenjang ini, jangan buat tabelnya sama sekali!
        if (validItemRows.length === 0 || activeSchoolIds.size === 0) return;

        // Filter kolom sekolah: HANYA sertakan sekolah yang memang memesan seragam ke vendor ini
        const activeSchoolList = schoolList.filter((sch) => activeSchoolIds.has(sch.id));
        if (activeSchoolList.length === 0) return;

        const headColumns = ['JENIS', ...activeSchoolList.map((s) => s.code)];
        const tableRows: any[] = [];

        validItemRows.forEach(({ formattedName, assignedSchoolIds }) => {
          const rowCells: any[] = [formattedName];

          activeSchoolList.forEach((sch) => {
            if (assignedSchoolIds.has(sch.id)) {
              rowCells.push(vendorLabel);
            } else {
              rowCells.push('');
            }
          });

          tableRows.push(rowCells);
        });

        if (tableRows.length === 0) return;

        // Cek sisa tinggi halaman, bila kurang dari 65mm buat halaman baru
        if (currentY > 140 && tablesCreated > 0) {
          doc.addPage();
          currentY = 14;
        }

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10.5);
        doc.setTextColor(0, 0, 0);
        doc.text(headerTitle, 14, currentY);
        currentY += 2;

        autoTable(doc, {
          head: [headColumns],
          body: tableRows,
          startY: currentY,
          theme: 'grid',
          styles: {
            font: 'helvetica',
            fontSize: 7.5,
            cellPadding: 1.4,
            lineColor: [0, 0, 0],
            lineWidth: 0.2,
            textColor: [0, 0, 0],
          },
          headStyles: {
            fillColor: [255, 255, 255],
            textColor: [0, 0, 0],
            fontStyle: 'bold',
            halign: 'center',
            lineWidth: 0.2,
            lineColor: [0, 0, 0],
          },
          columnStyles: {
            0: { halign: 'left', fontStyle: 'bold', cellWidth: 55 },
          },
          didParseCell: (data: any) => {
            if (data.section === 'head' && data.column.index > 0) {
              const colCode = headColumns[data.column.index];
              if (colCode === 'DKGI') {
                data.cell.styles.fillColor = [254, 240, 138];
              }
            }
            if (data.section === 'body' && data.column.index > 0) {
              data.cell.styles.halign = 'center';
            }
          },
          margin: { left: 14, right: 14 },
        });

        tablesCreated++;
        const lastTable = (doc as any).lastAutoTable;
        currentY = (lastTable ? lastTable.finalY : currentY + 30) + 8;
      });

      if (tablesCreated === 0) {
        alert(`Vendor "${vendorAlloc.vendorName}" belum memiliki data plotting sekolah yang dapat diekspor.`);
        return;
      }

      // Nomor Halaman & Footer Resmi
      const pageCount = (doc as any).internal.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(7.5);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(120, 120, 120);
        doc.text(
          `Koperasi Konsumen Karyawan BPK PENABUR Jakarta • Lampiran SPK: ${vendorAlloc.vendorName.toUpperCase()} • Hal ${i} dari ${pageCount}`,
          14,
          202
        );
      }

      const cleanVendor = vendorAlloc.vendorName.replace(/[^a-zA-Z0-9]/g, '_');
      const cleanYear = targetYear.replace(/[^a-zA-Z0-9]/g, '_');
      const fileName = `${cleanVendor}_TA_${cleanYear}_Lampiran_SPK.pdf`;

      try {
        doc.save(fileName);
      } catch (saveErr) {
        console.warn('doc.save() failed, using saveAs blob fallback:', saveErr);
        const blob = doc.output('blob');
        saveAs(blob, fileName);
      }
    } catch (err: any) {
      console.error('Error saat membuat PDF Lampiran SPK:', err);
      alert('Gagal membuat PDF Lampiran SPK: ' + (err?.message || String(err)));
    }
  };

  // Helper styling warna latar sel per vendor untuk Excel (persis nuansa spreadsheet referensi)
  const getVendorExcelStyle = (vendorName: string): { fgColor: string; fontColor: string; bold?: boolean } => {
    const v = (vendorName || '').toUpperCase();
    if (v.includes('ANDRYNA')) return { fgColor: 'FFD59B9B', fontColor: 'FF000000', bold: true };
    if (v.includes('FENDY')) return { fgColor: 'FF00E5FF', fontColor: 'FF000000', bold: true };
    if (v.includes('SUMBER MAKMUR') || v.includes('SUMAK')) return { fgColor: 'FF9EBA6A', fontColor: 'FF000000', bold: true };
    if (v.includes('FORTUNA')) return { fgColor: 'FF00E676', fontColor: 'FF000000', bold: true };
    if (v.includes('INTAN')) return { fgColor: 'FF7B1FA2', fontColor: 'FFFFEB3B', bold: true };
    if (v.includes('ANUGERAH') || v.includes('ANUGRAH')) return { fgColor: 'FFFF9800', fontColor: 'FF000000', bold: true };
    if (v.includes('BERKAT')) return { fgColor: 'FFFFD54F', fontColor: 'FF000000', bold: true };
    if (v.includes('LOKI')) return { fgColor: 'FF81D4FA', fontColor: 'FF000000', bold: true };
    if (v.includes('VANIA')) return { fgColor: 'FFF48FB1', fontColor: 'FF000000', bold: true };
    if (v.includes('KANIO')) return { fgColor: 'FFAED581', fontColor: 'FF000000', bold: true };
    if (v.includes('DELTARA')) return { fgColor: 'FFFFAB91', fontColor: 'FF000000', bold: true };
    if (v.includes('HARMONI')) return { fgColor: 'FFB0BEC5', fontColor: 'FF000000', bold: true };
    if (v.includes('JEMIMA')) return { fgColor: 'FFCE93D8', fontColor: 'FF000000', bold: true };
    if (v.includes('SUGANDI')) return { fgColor: 'FF80CBC4', fontColor: 'FF000000', bold: true };
    if (v.includes('SUPATNO')) return { fgColor: 'FFFFE082', fontColor: 'FF000000', bold: true };
    if (v.includes('SUSANTO')) return { fgColor: 'FFBCAAA4', fontColor: 'FF000000', bold: true };
    if (v.includes('YONGKY')) return { fgColor: 'FFE6EE9C', fontColor: 'FF000000', bold: true };
    if (v.includes('CHRISTY')) return { fgColor: 'FF80DEEA', fontColor: 'FF000000', bold: true };
    return { fgColor: 'FFE2E8F0', fontColor: 'FF1E293B', bold: true };
  };

  // =========================================================================
  // 5. EKSPOR MATRIKS PENUGASAN VENDOR SUPPLIER PER SEKOLAH PER JENJANG
  //    Format: 1 Sheet 1 Jenjang (Urutan baku: TK, SD, SMP, SMA, SPK...)
  //    Header Baris 1: No. | Jenis Seragam | [Nama Sekolah 1] | [Nama Sekolah 2] ...
  //    Baris: No urut, Nama Seragam baku/Supabase, Kolom Sekolah berisikan nama vendor
  // =========================================================================
  const handleExportSupplierMatrixExcel = async () => {
    // 1. Kumpulkan semua jenjang yang ada di sekolah maupun plottings
    const activeLevelSet = new Set<string>();

    schools.forEach((s) => {
      const lvl = resolveSchoolLevel(s.school_name, s.email, s.level);
      if (lvl) activeLevelSet.add(normalizeLevel(lvl));
    });

    effectivePlottings.forEach((p) => {
      const lvl = p.app_users?.school_level;
      if (lvl) activeLevelSet.add(normalizeLevel(lvl));
    });

    forecastItems.forEach((it) => {
      if (it.level) activeLevelSet.add(normalizeLevel(it.level));
    });

    const sortedLevels = Array.from(activeLevelSet).sort((a, b) => {
      const rankA = getLevelRank(a);
      const rankB = getLevelRank(b);
      if (rankA !== rankB) return rankA - rankB;
      return a.localeCompare(b);
    });

    if (sortedLevels.length === 0) {
      alert('Belum ada data sekolah atau plotting vendor untuk diekspor.');
      return;
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Koperasi Konsumen Karyawan BPK PENABUR Jakarta';
    workbook.created = new Date();

    const thinBorder: Partial<ExcelJS.Borders> = {
      top: { style: 'thin', color: { argb: 'FF000000' } },
      left: { style: 'thin', color: { argb: 'FF000000' } },
      bottom: { style: 'thin', color: { argb: 'FF000000' } },
      right: { style: 'thin', color: { argb: 'FF000000' } },
    };

    let totalSheetsCreated = 0;

    sortedLevels.forEach((level) => {
      // 1. Kumpulkan seluruh sekolah untuk jenjang ini
      const levelSchoolsMap = new Map<string, { id: string; school_name: string; email?: string }>();

      schools.forEach((s) => {
        const sLvl = normalizeLevel(resolveSchoolLevel(s.school_name, s.email, s.level) || s.level || '');
        if (sLvl === level) {
          levelSchoolsMap.set(s.school_name.toUpperCase().trim(), {
            id: s.id,
            school_name: s.school_name,
            email: s.email,
          });
        }
      });

      effectivePlottings.forEach((p) => {
        const pLvl = normalizeLevel(p.app_users?.school_level || '');
        if (pLvl === level && p.app_users?.school_name) {
          const key = p.app_users.school_name.toUpperCase().trim();
          if (!levelSchoolsMap.has(key)) {
            levelSchoolsMap.set(key, {
              id: p.school_user_id,
              school_name: p.app_users.school_name,
              email: p.app_users.username,
            });
          }
        }
      });

      const levelSchools = Array.from(levelSchoolsMap.values());
      if (levelSchools.length === 0) return;

      // Urutkan sekolah secara natural: nomor urut lebih dulu (1, 2, 3.. 11), lalu cabang daerah, lalu Tirta Marta
      levelSchools.sort((a, b) => {
        const numA = a.school_name.match(/(?:tkk|sdk|smpk|smak)\s+(\d+)/i);
        const numB = b.school_name.match(/(?:tkk|sdk|smpk|smak)\s+(\d+)/i);
        if (numA && numB) {
          return parseInt(numA[1], 10) - parseInt(numB[1], 10);
        }
        if (numA) return -1;
        if (numB) return 1;

        const isTmA = a.school_name.toLowerCase().includes('tirtamarta') || a.school_name.toLowerCase().includes('tirta marta');
        const isTmB = b.school_name.toLowerCase().includes('tirtamarta') || b.school_name.toLowerCase().includes('tirta marta');
        if (isTmA && !isTmB) return 1;
        if (!isTmA && isTmB) return -1;

        return a.school_name.localeCompare(b.school_name, 'id', { numeric: true, sensitivity: 'base' });
      });

      // 2. Kumpulkan seluruh jenis seragam untuk jenjang ini
      const uniformSet = new Set<string>();

      // A. Standar baku seragam jenjang ini
      getStandardItemsForLevel(level).forEach((it) => uniformSet.add(it));

      // B. Dari forecast items jenjang ini jika ada
      forecastItems
        .filter((it) => normalizeLevel(it.level) === level)
        .forEach((it) => {
          if (isItemAllowedForLevel(it.uniformName, level)) {
            uniformSet.add(formatItemDisplayName(it.uniformName, level));
          }
        });

      // C. Dari effectivePlottings jenjang ini
      effectivePlottings
        .filter((p) => normalizeLevel(p.app_users?.school_level || '') === level)
        .forEach((p) => {
          const types = splitClothingTypes(p.clothing_type);
          types.forEach((t) => {
            if (t !== 'Semua Jenis Baju' && isItemAllowedForLevel(t, level)) {
              uniformSet.add(formatItemDisplayName(t, level));
            }
          });
        });

      const uniformList = Array.from(uniformSet).sort((a, b) => {
        const prioA = getItemPriority(a, level);
        const prioB = getItemPriority(b, level);
        if (prioA !== prioB) return prioA - prioB;
        return a.localeCompare(b);
      });

      if (uniformList.length === 0) return;

      // 3. Buat Sheet untuk Jenjang ini
      const safeSheetName = level.replace(/[\\/?*[\]:]/g, '').slice(0, 31);
      const worksheet = workbook.addWorksheet(safeSheetName, {
        views: [{ showGridLines: true, state: 'frozen', xSplit: 2, ySplit: 1 }],
      });

      totalSheetsCreated++;

      // 4. Header Baris 1: No. | Jenis Seragam | [Nama Sekolah 1] | [Nama Sekolah 2] ...
      const headerRow = worksheet.getRow(1);
      headerRow.height = 32;

      // Col 1: No.
      const cellNo = worksheet.getCell(1, 1);
      cellNo.value = 'No.';
      cellNo.font = { name: 'Calibri', size: 10.5, bold: true, color: { argb: 'FF0F172A' } };
      cellNo.alignment = { vertical: 'middle', horizontal: 'center' };
      cellNo.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
      cellNo.border = thinBorder;

      // Col 2: Jenis Seragam
      const cellUniform = worksheet.getCell(1, 2);
      cellUniform.value = 'Jenis Seragam';
      cellUniform.font = { name: 'Calibri', size: 10.5, bold: true, color: { argb: 'FF0F172A' } };
      cellUniform.alignment = { vertical: 'middle', horizontal: 'center' };
      cellUniform.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
      cellUniform.border = thinBorder;

      // Col 3..N: Nama Sekolah (mengikuti tabel di Supabase)
      levelSchools.forEach((school, sIdx) => {
        const colIdx = 3 + sIdx;
        const cell = worksheet.getCell(1, colIdx);
        cell.value = school.school_name;
        cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF0F172A' } };
        cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
        cell.border = thinBorder;
      });

      // 5. Isi Baris: Tiap Jenis Seragam dan Plotting Vendor di Setiap Sekolah
      uniformList.forEach((uniformItem, uIdx) => {
        const rowIdx = 2 + uIdx;
        const row = worksheet.getRow(rowIdx);
        row.height = 24;

        // Col 1: No. urut
        const cNo = worksheet.getCell(rowIdx, 1);
        cNo.value = uIdx + 1;
        cNo.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF000000' } };
        cNo.alignment = { vertical: 'middle', horizontal: 'center' };
        cNo.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
        cNo.border = thinBorder;

        // Col 2: Jenis Seragam
        const cItem = worksheet.getCell(rowIdx, 2);
        cItem.value = uniformItem;
        cItem.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF000000' } };
        cItem.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
        cItem.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
        cItem.border = thinBorder;

        // Col 3..N: Vendor untuk masing-masing sekolah
        levelSchools.forEach((school, sIdx) => {
          const colIdx = 3 + sIdx;
          const cVendor = worksheet.getCell(rowIdx, colIdx);

          // Cari plotting yang cocok untuk sekolah dan seragam ini
          const matchedPlottings = effectivePlottings.filter((p) => {
            const pLvl = normalizeLevel(p.app_users?.school_level || '');
            if (pLvl !== level) return false;

            const isSchoolMatch =
              (p.school_user_id && String(p.school_user_id) === String(school.id)) ||
              (p.app_users?.school_name &&
                p.app_users.school_name.toUpperCase().trim() === school.school_name.toUpperCase().trim());

            if (!isSchoolMatch) return false;

            const plottedTypes = splitClothingTypes(p.clothing_type);

            return plottedTypes.some(
              (pt) =>
                pt === 'Semua Jenis Baju' ||
                isClothingTypeMatch(uniformItem, pt) ||
                pt.toUpperCase() === uniformItem.toUpperCase()
            );
          });

          if (matchedPlottings.length > 0) {
            // Ambil nama vendor unik
            const vendorNames = Array.from(
              new Set(
                matchedPlottings
                  .map((p) => p.vendors?.name || vendors.find((v) => v.id === p.vendor_id)?.name || '')
                  .filter(Boolean)
              )
            );

            const displayedVendor = vendorNames.join(' / ');
            const primaryVendor = vendorNames[0] || '';
            const style = getVendorExcelStyle(primaryVendor);

            cVendor.value = displayedVendor;
            cVendor.font = {
              name: 'Calibri',
              size: 10,
              bold: style.bold ?? true,
              color: { argb: style.fontColor },
            };
            cVendor.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
            cVendor.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: style.fgColor },
            };
            cVendor.border = thinBorder;
          } else {
            // Tidak ada plotting vendor untuk barang ini di sekolah ini
            cVendor.value = '';
            cVendor.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFFFFFFF' },
            };
            cVendor.border = thinBorder;
          }
        });
      });

      // 6. Atur Lebar Kolom
      worksheet.getColumn(1).width = 6;
      worksheet.getColumn(2).width = 30;
      levelSchools.forEach((school, sIdx) => {
        const colIdx = 3 + sIdx;
        const colLen = school.school_name.length;
        worksheet.getColumn(colIdx).width = Math.max(16, Math.min(26, colLen + 2));
      });
    });

    if (totalSheetsCreated === 0) {
      alert('Tidak ada data sekolah atau seragam yang dapat diekspor untuk matriks supplier.');
      return;
    }

    const buffer = await workbook.xlsx.writeBuffer();
    saveAs(
      new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
      `Matriks_Supplier_Per_Sekolah_${targetYear.replace(/[/\\?*[\]:]/g, '_')}.xlsx`
    );
  };

  // Filter items untuk tampilan (diurutkan baku: TK, SD, SMP, SMA, SD-SPK, SMP-SPK, SMA-SPK)
  const filteredForecastItems = useMemo(() => {
    const list = forecastItems.filter((it) => {
      const matchesLevel =
        selectedLevelFilter === 'ALL' ||
        it.level.toUpperCase() === selectedLevelFilter.toUpperCase() ||
        getLevelRank(it.level) === getLevelRank(selectedLevelFilter);
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch = !q || it.uniformName.toLowerCase().includes(q) || it.level.toLowerCase().includes(q);
      return matchesLevel && matchesSearch;
    });

    return list.sort((a, b) => {
      const rankA = getLevelRank(a.level);
      const rankB = getLevelRank(b.level);
      if (rankA !== rankB) return rankA - rankB;
      const pA = getItemPriority(a.uniformName, a.level);
      const pB = getItemPriority(b.uniformName, b.level);
      if (pA !== pB) return pA - pB;
      return a.uniformName.localeCompare(b.uniformName);
    });
  }, [forecastItems, selectedLevelFilter, searchQuery]);

  // Pagination untuk Tab 1 (Rencana Global & Skala)
  const totalPages = Math.ceil(filteredForecastItems.length / itemsPerPage);
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const paginatedForecastItems = useMemo(() => {
    return filteredForecastItems.slice(indexOfFirstItem, indexOfLastItem);
  }, [filteredForecastItems, indexOfFirstItem, indexOfLastItem]);

  // Reset halaman saat filter / search / tahun berubah
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedLevelFilter, searchQuery, targetYear]);

  // Cegah currentPage out of bounds
  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(1);
    }
  }, [totalPages, currentPage]);

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
                  <option value="SD-SPK">SD-SPK</option>
                  <option value="SMP-SPK">SMP-SPK</option>
                  <option value="SMA-SPK">SMA-SPK</option>
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
                  onClick={handleExportSupplierMatrixExcel}
                  disabled={vendorAllocations.length === 0 && effectivePlottings.length === 0}
                  style={{
                    background: vendorAllocations.length === 0 && effectivePlottings.length === 0 ? '#94a3b8' : '#0284c7',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '8px 14px',
                    fontSize: '0.86rem',
                    fontWeight: 600,
                    cursor: vendorAllocations.length === 0 && effectivePlottings.length === 0 ? 'not-allowed' : 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
                  }}
                  title="Ekspor matriks penugasan vendor supplier per sekolah per jenjang dalam format Excel resmi (.xlsx)"
                >
                  <span>📊</span> Ekspor Matriks Supplier (.xlsx)
                </button>

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

                {selectedVendorFilter !== 'ALL' && (
                  <button
                    type="button"
                    onClick={() => {
                      const va = vendorAllocations.find((v) => v.vendorId === selectedVendorFilter);
                      if (va) handleExportVendorSPKPdf(va);
                    }}
                    style={{
                      background: '#dc2626',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '8px',
                      padding: '8px 14px',
                      fontSize: '0.86rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
                    }}
                    title="Ekspor Lampiran SPK (PDF) untuk vendor terpilih"
                  >
                    <span>📄</span> Ekspor Lampiran SPK (.pdf)
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* ISI TAB 1: RENCANA GLOBAL & SKALA UKURAN */}
        {activeSubTab === 'input' && (
          <div>
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
                    {paginatedForecastItems.map((item, idx) => {
                      const rowNumber = indexOfFirstItem + idx + 1;
                      return (
                        <tr key={item.id} style={{ background: idx % 2 === 0 ? '#fff' : '#fafafa' }}>
                          <td style={{ textAlign: 'center', color: '#64748b', fontWeight: 600 }}>{rowNumber}</td>
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
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Kontrol Pagination untuk Tab Rencana Global */}
            {filteredForecastItems.length > 0 && (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '14px 18px',
                  borderTop: '1px solid #e2e8f0',
                  background: '#ffffff',
                  flexWrap: 'wrap',
                  gap: '12px',
                }}
              >
                <div style={{ fontSize: '0.85rem', color: '#64748b' }}>
                  Menampilkan {indexOfFirstItem + 1}-
                  {Math.min(indexOfLastItem, filteredForecastItems.length)} dari{' '}
                  {filteredForecastItems.length} jenis seragam
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.85rem', color: '#64748b', marginRight: '6px' }}>
                    Baris per halaman:
                    <select
                      value={itemsPerPage}
                      onChange={(e) => {
                        setItemsPerPage(Number(e.target.value));
                        setCurrentPage(1);
                      }}
                      style={{
                        marginLeft: '8px',
                        padding: '4px 8px',
                        borderRadius: '6px',
                        border: '1px solid #cbd5e1',
                        background: '#fff',
                        fontSize: '0.84rem',
                        outline: 'none',
                      }}
                    >
                      <option value={10}>10</option>
                      <option value={25}>25</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                    </select>
                  </span>
                  <button
                    type="button"
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                    style={{
                      padding: '5px 12px',
                      cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                      background: currentPage === 1 ? '#f8fafc' : '#ffffff',
                      color: currentPage === 1 ? '#94a3b8' : '#1e293b',
                      border: '1px solid #cbd5e1',
                      borderRadius: '6px',
                      fontSize: '0.85rem',
                      fontWeight: 600,
                    }}
                    title="Halaman sebelumnya"
                  >
                    &lt;
                  </button>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#334155' }}>
                    Halaman {currentPage} dari {totalPages || 1}
                  </span>
                  <button
                    type="button"
                    disabled={currentPage === totalPages || totalPages === 0}
                    onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                    style={{
                      padding: '5px 12px',
                      cursor: currentPage === totalPages || totalPages === 0 ? 'not-allowed' : 'pointer',
                      background: currentPage === totalPages || totalPages === 0 ? '#f8fafc' : '#ffffff',
                      color: currentPage === totalPages || totalPages === 0 ? '#94a3b8' : '#1e293b',
                      border: '1px solid #cbd5e1',
                      borderRadius: '6px',
                      fontSize: '0.85rem',
                      fontWeight: 600,
                    }}
                    title="Halaman berikutnya"
                  >
                    &gt;
                  </button>
                </div>
              </div>
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
                          title="Unduh SPK kerja untuk vendor ini dalam format Excel (.xlsx)"
                        >
                          <span>📥</span> Ekspor SPK (.xlsx)
                        </button>

                        <button
                          type="button"
                          onClick={() => handleExportVendorSPKPdf(va)}
                          style={{
                            background: '#dc2626',
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
                          title="Unduh Lampiran SPK (Matriks Penugasan per Sekolah) dalam format PDF resmi BPK PENABUR"
                        >
                          <span>📄</span> Ekspor Lampiran SPK (.pdf)
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
