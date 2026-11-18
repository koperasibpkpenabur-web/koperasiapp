import { useState, useMemo, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { useSettings } from '../../context/SettingsContext';
import { useProducts } from '../../context/ProductContext';
import { buildAcademicYearOptions, resolveAcademicYear } from '../../utils/academicYear';
import { fetchAllSupabasePaged } from '../../utils/supabasePagination';
import { normalizeLevel, splitClothingTypes, type ForecastItem } from './KopkarPrediksiProduksi';
import './kopkar.css';

type GarmentType = 'kemeja' | 'celana' | 'rok' | 'rompi';
type JenjangLevel = 'TK' | 'SD' | 'SMP' | 'SMA' | 'SPK-SD' | 'SPK-SMP' | 'SPK-SMA';
type JenjangFilter = 'SEMUA' | JenjangLevel;
type SizeTemplateType = 'letter' | 'number' | 'single';

interface SizeRatio {
  id: string;
  name: string;
  data: Record<string, number>;
  ratio: number;
}

interface SizeChartEntry {
  name: string;
  data: Record<string, number>;
  ratio: number;
}

interface PresetDef {
  key: string;
  label: string;
  type: GarmentType;
  levels: JenjangLevel[];
  groupLabel: string;
  isCustom?: boolean;
  headers: { key: string; label: string }[];
  sizes: SizeChartEntry[];
}

interface CustomPresetMeta {
  __meta: true;
  label: string;
  level: JenjangLevel;
  type: GarmentType;
  headers: { key: string; label: string }[];
}

const JENJANG_OPTIONS: JenjangLevel[] = ['TK', 'SD', 'SMP', 'SMA', 'SPK-SD', 'SPK-SMP', 'SPK-SMA'];

const JENJANG_FILTER_LIST: { value: JenjangFilter; label: string }[] = [
  { value: 'SEMUA', label: 'Semua' },
  { value: 'TK', label: 'TK' },
  { value: 'SD', label: 'SD' },
  { value: 'SMP', label: 'SMP' },
  { value: 'SMA', label: 'SMA' },
  { value: 'SPK-SD', label: 'SPK-SD' },
  { value: 'SPK-SMP', label: 'SPK-SMP' },
  { value: 'SPK-SMA', label: 'SPK-SMA' },
];

const GROUP_ORDER = [
  'TK',
  'SD',
  'SPK-SD',
  'SMP',
  'SPK-SMP',
  'SMA & SPK-SMA',
  'SMA',
  'SPK-SMA',
  'SMP / SMA / SPK',
];

const GARMENT_TYPE_META: Record<
  GarmentType,
  { label: string; formulaDesc: string; headers: { key: string; label: string }[] }
> = {
  kemeja: {
    label: 'Kemeja / Baju Atasan Lengan',
    formulaDesc: 'Kebutuhan kain = Panjang Baju + Panjang Lengan + 15 cm kampuh',
    headers: [
      { key: 'panjangLengan', label: 'Panjang Lengan' },
      { key: 'lebarBahu', label: 'Lebar Bahu' },
      { key: 'panjangBaju', label: 'Panjang Baju' },
      { key: 'lebarDada', label: 'Lebar Dada' },
    ],
  },
  rompi: {
    label: 'Rompi / Atasan Tanpa Lengan',
    formulaDesc: 'Kebutuhan kain = Panjang Baju + 15 cm kampuh',
    headers: [
      { key: 'lebarBahu', label: 'Lebar Bahu' },
      { key: 'lebarDada', label: 'Lebar Dada' },
      { key: 'panjangBaju', label: 'Panjang Baju' },
    ],
  },
  celana: {
    label: 'Celana Pendek / Panjang',
    formulaDesc: 'Kebutuhan kain = Panjang Celana + 20 cm kampuh',
    headers: [
      { key: 'lebarPinggang', label: 'Lebar Pinggang' },
      { key: 'panjangCelana', label: 'Panjang Celana' },
      { key: 'lebarPaha', label: 'Lebar Paha' },
      { key: 'lebarKaki', label: 'Lebar Kaki' },
    ],
  },
  rok: {
    label: 'Rok / Kulot',
    formulaDesc: 'Kebutuhan kain = Panjang Rok + 15 cm kampuh',
    headers: [
      { key: 'lebarPinggang', label: 'Lebar Pinggang' },
      { key: 'panjangRok', label: 'Panjang Rok' },
      { key: 'lebarPinggul', label: 'Lebar Pinggul' },
    ],
  },
};

function buildStarterSizes(
  headers: { key: string; label: string }[],
  template: SizeTemplateType
): SizeChartEntry[] {
  const emptyData: Record<string, number> = {};
  headers.forEach(h => {
    emptyData[h.key] = 0;
  });

  if (template === 'number') {
    const nums = ['25', '26', '27', '28', '29', '30', '31', '32', '33', '34'];
    return nums.map(name => ({
      name,
      ratio: ['28', '29', '30', '31', '32'].includes(name) ? 2 : 1,
      data: { ...emptyData },
    }));
  }

  if (template === 'single') {
    return [{ name: 'S', ratio: 1, data: { ...emptyData } }];
  }

  const letters = ['SS', 'S', 'M', 'L', 'XL', '3L', '4L'];
  return letters.map(name => ({
    name,
    ratio: ['M', 'L', 'XL'].includes(name) ? 2 : 1,
    data: { ...emptyData },
  }));
}

function toSizeRows(presetKey: string, entries: SizeChartEntry[], suffix = 'row'): SizeRatio[] {
  return entries.map((s, idx) => ({
    id: `${presetKey}-${suffix}-${idx}`,
    name: String(s.name ?? ''),
    ratio: Math.max(0, Number(s.ratio) || 0),
    data: s.data && typeof s.data === 'object' ? { ...s.data } : {},
  }));
}

function createCustomPresetKey(level: JenjangLevel, label: string): string {
  const levelSlug = level.toLowerCase().replace(/[^a-z0-9]/g, '_');
  const nameSlug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32);
  return `custom_${levelSlug}_${nameSlug || 'item'}_${Date.now()}`;
}

function parseSavedChartRow(
  presetKey: string,
  raw: unknown
): { meta: CustomPresetMeta | null; sizes: SizeChartEntry[] } {
  const normalizeEntry = (item: any): SizeChartEntry => {
    const cleanData: Record<string, number> = {};
    if (item?.data && typeof item.data === 'object') {
      Object.entries(item.data).forEach(([k, v]) => {
        cleanData[k] = Math.max(0, Number(v) || 0);
      });
    }
    return {
      name: String(item?.name ?? ''),
      ratio: Math.max(0, Number(item?.ratio) || 0),
      data: cleanData,
    };
  };

  if (Array.isArray(raw)) {
    const metaRaw = raw.find((entry: any) => entry && entry.__meta === true);
    const sizeEntries = raw
      .filter((entry: any) => entry && entry.__meta !== true)
      .map(normalizeEntry);
    const meta =
      metaRaw && metaRaw.label && metaRaw.type
        ? ({
            __meta: true,
            label: String(metaRaw.label),
            level: (JENJANG_OPTIONS.includes(metaRaw.level) ? metaRaw.level : 'SD') as JenjangLevel,
            type: (['kemeja', 'celana', 'rok', 'rompi'].includes(metaRaw.type)
              ? metaRaw.type
              : 'kemeja') as GarmentType,
            headers:
              Array.isArray(metaRaw.headers) && metaRaw.headers.length > 0
                ? metaRaw.headers
                : GARMENT_TYPE_META.kemeja.headers,
          } satisfies CustomPresetMeta)
        : null;
    return { meta, sizes: sizeEntries };
  }

  if (raw && typeof raw === 'object') {
    const obj = raw as any;
    const rawSizes = Array.isArray(obj.sizes) ? obj.sizes : [];
    const sizeEntries = rawSizes.map(normalizeEntry);
    const meta =
      obj.__meta === true && obj.label && obj.type
        ? ({
            __meta: true,
            label: String(obj.label),
            level: (JENJANG_OPTIONS.includes(obj.level) ? obj.level : 'SD') as JenjangLevel,
            type: (['kemeja', 'celana', 'rok', 'rompi'].includes(obj.type)
              ? obj.type
              : 'kemeja') as GarmentType,
            headers:
              Array.isArray(obj.headers) && obj.headers.length > 0
                ? obj.headers
                : GARMENT_TYPE_META.kemeja.headers,
          } satisfies CustomPresetMeta)
        : null;
    if (meta || sizeEntries.length > 0) {
      return { meta, sizes: sizeEntries };
    }
  }

  console.warn(`Format size chart tidak dikenali untuk preset ${presetKey}`);
  return { meta: null, sizes: [] };
}

const PRESETS: PresetDef[] = [
  // =================== SD ===================
  {
    key: 'baju_sd',
    label: 'Baju Putra/Putri SD',
    type: 'kemeja',
    levels: ['SD'],
    groupLabel: 'SD',
    headers: [
      { key: 'panjangLengan', label: 'Panjang Lengan' },
      { key: 'lebarBahu', label: 'Lebar Bahu' },
      { key: 'panjangBaju', label: 'Panjang Baju' },
      { key: 'lebarDada', label: 'Lebar Dada' }
    ],
    sizes: [
      { name: 'SS', ratio: 1, data: { panjangLengan: 16, lebarBahu: 30, panjangBaju: 50, lebarDada: 36 } },
      { name: 'S', ratio: 1, data: { panjangLengan: 17, lebarBahu: 32, panjangBaju: 52, lebarDada: 38 } },
      { name: 'M', ratio: 2, data: { panjangLengan: 18, lebarBahu: 34, panjangBaju: 54, lebarDada: 40 } },
      { name: 'L', ratio: 2, data: { panjangLengan: 19, lebarBahu: 36, panjangBaju: 56, lebarDada: 42 } },
      { name: 'XL', ratio: 2, data: { panjangLengan: 20, lebarBahu: 38, panjangBaju: 58, lebarDada: 44 } },
      { name: '3L', ratio: 1, data: { panjangLengan: 21, lebarBahu: 40, panjangBaju: 60, lebarDada: 46 } },
      { name: '4L', ratio: 1, data: { panjangLengan: 22, lebarBahu: 42, panjangBaju: 62, lebarDada: 48 } },
    ]
  },
  {
    key: 'rompi_sd',
    label: 'Rompi Kotak Putra/Putri SD',
    type: 'rompi',
    levels: ['SD'],
    groupLabel: 'SD',
    headers: [
      { key: 'lebarBahu', label: 'Lebar Bahu' },
      { key: 'lebarDada', label: 'Lebar Dada' },
      { key: 'panjangBaju', label: 'Panjang Baju' }
    ],
    sizes: [
      { name: 'SS', ratio: 1, data: { lebarBahu: 25, lebarDada: 38, panjangBaju: 46 } },
      { name: 'S', ratio: 1, data: { lebarBahu: 26, lebarDada: 40, panjangBaju: 48 } },
      { name: 'M', ratio: 2, data: { lebarBahu: 27, lebarDada: 42, panjangBaju: 50 } },
      { name: 'L', ratio: 2, data: { lebarBahu: 28, lebarDada: 44, panjangBaju: 52 } },
      { name: 'XL', ratio: 2, data: { lebarBahu: 29, lebarDada: 46, panjangBaju: 54 } },
      { name: '3L', ratio: 1, data: { lebarBahu: 30, lebarDada: 48, panjangBaju: 56 } },
      { name: '4L', ratio: 1, data: { lebarBahu: 31, lebarDada: 50, panjangBaju: 58 } },
    ]
  },
  {
    key: 'celana_sd',
    label: 'Celana Merah/Kotak/Pramuka SD',
    type: 'celana',
    levels: ['SD'],
    groupLabel: 'SD',
    headers: [
      { key: 'lebarPinggang', label: 'Lebar Pinggang' },
      { key: 'panjangCelana', label: 'Panjang Celana' },
      { key: 'lebarPaha', label: 'Lebar Paha' },
      { key: 'lebarKaki', label: 'Lebar Kaki' }
    ],
    sizes: [
      { name: 'SS', ratio: 1, data: { lebarPinggang: 23, panjangCelana: 35, lebarPaha: 26, lebarKaki: 21 } },
      { name: 'S', ratio: 1, data: { lebarPinggang: 25, panjangCelana: 37, lebarPaha: 27, lebarKaki: 22 } },
      { name: 'M', ratio: 2, data: { lebarPinggang: 27, panjangCelana: 39, lebarPaha: 28, lebarKaki: 23 } },
      { name: 'L', ratio: 2, data: { lebarPinggang: 29, panjangCelana: 41, lebarPaha: 29, lebarKaki: 24 } },
      { name: 'XL', ratio: 2, data: { lebarPinggang: 31, panjangCelana: 43, lebarPaha: 30, lebarKaki: 25 } },
      { name: '3L', ratio: 1, data: { lebarPinggang: 33, panjangCelana: 45, lebarPaha: 31, lebarKaki: 26 } },
      { name: '4L', ratio: 1, data: { lebarPinggang: 35, panjangCelana: 47, lebarPaha: 32, lebarKaki: 27 } },
    ]
  },
  {
    key: 'rok_sd',
    label: 'Rok Remple/Kulot SD',
    type: 'rok',
    levels: ['SD'],
    groupLabel: 'SD',
    headers: [
      { key: 'lebarPinggang', label: 'Lebar Pinggang' },
      { key: 'panjangRok', label: 'Panjang Rok' },
      { key: 'pesak', label: 'Pesak' }
    ],
    sizes: [
      { name: 'SS', ratio: 1, data: { lebarPinggang: 23, panjangRok: 42, pesak: 33 } },
      { name: 'S', ratio: 1, data: { lebarPinggang: 25, panjangRok: 44, pesak: 33 } },
      { name: 'M', ratio: 2, data: { lebarPinggang: 27, panjangRok: 46, pesak: 35 } },
      { name: 'L', ratio: 2, data: { lebarPinggang: 29, panjangRok: 48, pesak: 35 } },
      { name: 'XL', ratio: 2, data: { lebarPinggang: 31, panjangRok: 50, pesak: 37 } },
      { name: '3L', ratio: 1, data: { lebarPinggang: 33, panjangRok: 52, pesak: 37 } },
      { name: '4L', ratio: 1, data: { lebarPinggang: 35, panjangRok: 54, pesak: 39 } },
    ]
  },
  {
    key: 'baju_pramuka_siaga_sd',
    label: 'Baju Pramuka Siaga SD',
    type: 'kemeja',
    levels: ['SD'],
    groupLabel: 'SD',
    headers: [
      { key: 'panjangLengan', label: 'Panjang Lengan' },
      { key: 'lebarBahu', label: 'Lebar Bahu' },
      { key: 'panjangBaju', label: 'Panjang Baju' },
      { key: 'lebarDada', label: 'Lebar Dada' }
    ],
    sizes: [
      { name: 'SS', ratio: 1, data: { panjangLengan: 16, lebarBahu: 33.5, panjangBaju: 50, lebarDada: 39 } },
      { name: 'S', ratio: 1, data: { panjangLengan: 17, lebarBahu: 35, panjangBaju: 52, lebarDada: 41 } },
      { name: 'M', ratio: 2, data: { panjangLengan: 18, lebarBahu: 36.5, panjangBaju: 54, lebarDada: 43 } },
      { name: 'L', ratio: 2, data: { panjangLengan: 19, lebarBahu: 38, panjangBaju: 56, lebarDada: 45 } },
      { name: 'XL', ratio: 2, data: { panjangLengan: 20, lebarBahu: 39.5, panjangBaju: 58, lebarDada: 47 } },
      { name: '3L', ratio: 1, data: { panjangLengan: 21, lebarBahu: 41, panjangBaju: 60, lebarDada: 49 } },
      { name: '4L', ratio: 1, data: { panjangLengan: 22, lebarBahu: 42.5, panjangBaju: 62, lebarDada: 51 } },
    ]
  },
  
  // =================== SMP & SMA & SPK ===================
  {
    key: 'baju_smp_sma',
    label: 'Baju Putra/Putri SMP / SMA / SPK',
    type: 'kemeja',
    levels: ['SMP', 'SMA', 'SPK-SMP', 'SPK-SMA'],
    groupLabel: 'SMP / SMA / SPK',
    headers: [
      { key: 'panjangLengan', label: 'Panjang Lengan' },
      { key: 'lebarBahu', label: 'Lebar Bahu' },
      { key: 'panjangBaju', label: 'Panjang Baju' },
      { key: 'lebarDada', label: 'Lebar Dada' }
    ],
    sizes: [
      { name: 'SS', ratio: 1, data: { panjangLengan: 21, lebarBahu: 40, panjangBaju: 65, lebarDada: 45 } },
      { name: 'S', ratio: 1, data: { panjangLengan: 22, lebarBahu: 42, panjangBaju: 67, lebarDada: 49 } },
      { name: 'M', ratio: 2, data: { panjangLengan: 23, lebarBahu: 44, panjangBaju: 69, lebarDada: 51 } },
      { name: 'L', ratio: 2, data: { panjangLengan: 24, lebarBahu: 46, panjangBaju: 71, lebarDada: 53 } },
      { name: 'XL', ratio: 2, data: { panjangLengan: 25, lebarBahu: 48, panjangBaju: 73, lebarDada: 55 } },
      { name: '3L', ratio: 1, data: { panjangLengan: 26, lebarBahu: 50, panjangBaju: 75, lebarDada: 59 } },
      { name: '4L', ratio: 1, data: { panjangLengan: 27, lebarBahu: 52, panjangBaju: 77, lebarDada: 61 } },
    ]
  },
  {
    key: 'rompi_smp_sma',
    label: 'Rompi Kotak SMP / SMA / SPK',
    type: 'rompi',
    levels: ['SMP', 'SMA', 'SPK-SMP', 'SPK-SMA'],
    groupLabel: 'SMP / SMA / SPK',
    headers: [
      { key: 'lebarBahu', label: 'Lebar Bahu' },
      { key: 'lebarDada', label: 'Lebar Dada' },
      { key: 'panjangBaju', label: 'Panjang Baju' }
    ],
    sizes: [
      { name: 'SS', ratio: 1, data: { lebarBahu: 30, lebarDada: 44, panjangBaju: 61 } },
      { name: 'S', ratio: 1, data: { lebarBahu: 31, lebarDada: 46, panjangBaju: 63 } },
      { name: 'M', ratio: 2, data: { lebarBahu: 32, lebarDada: 48, panjangBaju: 65 } },
      { name: 'L', ratio: 2, data: { lebarBahu: 33, lebarDada: 50, panjangBaju: 68 } },
      { name: 'XL', ratio: 2, data: { lebarBahu: 35, lebarDada: 52, panjangBaju: 70 } },
      { name: '3L', ratio: 1, data: { lebarBahu: 38.5, lebarDada: 54, panjangBaju: 72 } },
      { name: '4L', ratio: 1, data: { lebarBahu: 41, lebarDada: 57, panjangBaju: 73 } },
    ]
  },
  {
    key: 'celana_smp',
    label: 'Celana Pendek Biru/Pramuka SMP',
    type: 'celana',
    levels: ['SMP'],
    groupLabel: 'SMP',
    headers: [
      { key: 'lebarPinggang', label: 'Lebar Pinggang' },
      { key: 'panjangCelana', label: 'Panjang Celana' },
      { key: 'lebarPaha', label: 'Lebar Paha' },
      { key: 'lebarKaki', label: 'Lebar Kaki' }
    ],
    sizes: [
      { name: '25', ratio: 1, data: { lebarPinggang: 32, panjangCelana: 46, lebarPaha: 26.5, lebarKaki: 20.5 } },
      { name: '26', ratio: 1, data: { lebarPinggang: 33, panjangCelana: 47, lebarPaha: 27, lebarKaki: 21 } },
      { name: '27', ratio: 1, data: { lebarPinggang: 34, panjangCelana: 48, lebarPaha: 27.5, lebarKaki: 21.5 } },
      { name: '28', ratio: 2, data: { lebarPinggang: 36, panjangCelana: 49, lebarPaha: 28.5, lebarKaki: 22.5 } },
      { name: '29', ratio: 2, data: { lebarPinggang: 37, panjangCelana: 50, lebarPaha: 29, lebarKaki: 23 } },
      { name: '30', ratio: 2, data: { lebarPinggang: 38, panjangCelana: 51, lebarPaha: 29.5, lebarKaki: 23.5 } },
      { name: '31', ratio: 2, data: { lebarPinggang: 39, panjangCelana: 52, lebarPaha: 30, lebarKaki: 24 } },
      { name: '32', ratio: 2, data: { lebarPinggang: 41, panjangCelana: 53, lebarPaha: 31, lebarKaki: 25 } },
      { name: '33', ratio: 1, data: { lebarPinggang: 42, panjangCelana: 54, lebarPaha: 31.5, lebarKaki: 25.5 } },
      { name: '34', ratio: 1, data: { lebarPinggang: 43, panjangCelana: 55, lebarPaha: 32, lebarKaki: 26 } },
    ]
  },
  {
    key: 'celana_sma',
    label: 'Celana Panjang Abu/Pramuka SMA & SPK',
    type: 'celana',
    levels: ['SMA', 'SPK-SMA'],
    groupLabel: 'SMA & SPK-SMA',
    headers: [
      { key: 'lebarPinggang', label: 'Lebar Pinggang' },
      { key: 'lebarPaha', label: 'Lebar Paha' },
      { key: 'panjangCelana', label: 'Panjang Celana' },
      { key: 'lebarKaki', label: 'Lebar Kaki' }
    ],
    sizes: [
      { name: '27', ratio: 1, data: { lebarPinggang: 34.5, lebarPaha: 30.5, panjangCelana: 104, lebarKaki: 20 } },
      { name: '28', ratio: 1, data: { lebarPinggang: 36, lebarPaha: 31, panjangCelana: 104, lebarKaki: 20 } },
      { name: '29', ratio: 2, data: { lebarPinggang: 37, lebarPaha: 31.5, panjangCelana: 104, lebarKaki: 20.5 } },
      { name: '30', ratio: 2, data: { lebarPinggang: 38.5, lebarPaha: 32.5, panjangCelana: 105, lebarKaki: 21 } },
      { name: '31', ratio: 2, data: { lebarPinggang: 41, lebarPaha: 33, panjangCelana: 105, lebarKaki: 21 } },
      { name: '32', ratio: 2, data: { lebarPinggang: 42, lebarPaha: 33.5, panjangCelana: 105, lebarKaki: 21.5 } },
      { name: '33', ratio: 2, data: { lebarPinggang: 43.5, lebarPaha: 34.5, panjangCelana: 106, lebarKaki: 22 } },
      { name: '34', ratio: 1, data: { lebarPinggang: 44.5, lebarPaha: 35, panjangCelana: 106, lebarKaki: 22 } },
      { name: '35', ratio: 1, data: { lebarPinggang: 46, lebarPaha: 35.5, panjangCelana: 106, lebarKaki: 23 } },
      { name: '36', ratio: 1, data: { lebarPinggang: 47, lebarPaha: 36, panjangCelana: 107, lebarKaki: 23 } },
    ]
  },
  {
    key: 'rok_kulot_smp_sma',
    label: 'Rok Kulot Putri SMP / SMA / SPK',
    type: 'rok',
    levels: ['SMP', 'SMA', 'SPK-SMP', 'SPK-SMA'],
    groupLabel: 'SMP / SMA / SPK',
    headers: [
      { key: 'lebarPinggang', label: 'Lebar Pinggang' },
      { key: 'panjangRok', label: 'Panjang Rok' },
      { key: 'lebarPinggul', label: 'Lebar Pinggul' }
    ],
    sizes: [
      { name: 'SS', ratio: 1, data: { lebarPinggang: 29, panjangRok: 56, lebarPinggul: 42 } },
      { name: 'S', ratio: 1, data: { lebarPinggang: 31, panjangRok: 58, lebarPinggul: 44 } },
      { name: 'M', ratio: 2, data: { lebarPinggang: 33, panjangRok: 60, lebarPinggul: 45 } },
      { name: 'L', ratio: 2, data: { lebarPinggang: 35, panjangRok: 61, lebarPinggul: 47 } },
      { name: 'XL', ratio: 2, data: { lebarPinggang: 37, panjangRok: 62, lebarPinggul: 49 } },
      { name: '3L', ratio: 1, data: { lebarPinggang: 40, panjangRok: 63, lebarPinggul: 51 } },
      { name: '4L', ratio: 1, data: { lebarPinggang: 42, panjangRok: 64, lebarPinggul: 54 } },
    ]
  },
  {
    key: 'baju_pramuka_putra_smp_sma',
    label: 'Baju Pramuka Putra SMP / SMA / SPK',
    type: 'kemeja',
    levels: ['SMP', 'SMA', 'SPK-SMP', 'SPK-SMA'],
    groupLabel: 'SMP / SMA / SPK',
    headers: [
      { key: 'panjangLengan', label: 'Panjang Lengan' },
      { key: 'lebarBahu', label: 'Lebar Bahu' },
      { key: 'panjangBaju', label: 'Panjang Baju' },
      { key: 'lebarDada', label: 'Lebar Dada' }
    ],
    sizes: [
      { name: 'SS', ratio: 1, data: { panjangLengan: 21, lebarBahu: 40, panjangBaju: 60, lebarDada: 45 } },
      { name: 'S', ratio: 1, data: { panjangLengan: 22, lebarBahu: 41.5, panjangBaju: 63, lebarDada: 47 } },
      { name: 'M', ratio: 2, data: { panjangLengan: 23, lebarBahu: 43, panjangBaju: 66, lebarDada: 49 } },
      { name: 'L', ratio: 2, data: { panjangLengan: 24, lebarBahu: 44.5, panjangBaju: 69, lebarDada: 51 } },
      { name: 'XL', ratio: 2, data: { panjangLengan: 25, lebarBahu: 46, panjangBaju: 72, lebarDada: 53 } },
      { name: '3L', ratio: 1, data: { panjangLengan: 26, lebarBahu: 47.5, panjangBaju: 72, lebarDada: 55 } },
      { name: '4L', ratio: 1, data: { panjangLengan: 27, lebarBahu: 49, panjangBaju: 75, lebarDada: 57 } },
    ]
  },
  {
    key: 'baju_pramuka_putri_sma',
    label: 'Baju Pramuka Putri SMA / SPK Upper Sec',
    type: 'kemeja',
    levels: ['SMA', 'SPK-SMA'],
    groupLabel: 'SMA & SPK-SMA',
    headers: [
      { key: 'panjangLengan', label: 'Panjang Lengan' },
      { key: 'lebarBahu', label: 'Lebar Bahu' },
      { key: 'panjangBaju', label: 'Panjang Baju' },
      { key: 'lebarDada', label: 'Lebar Dada' },
      { key: 'lebarPinggul', label: 'Lebar Pinggul' }
    ],
    sizes: [
      { name: 'SS', ratio: 1, data: { panjangLengan: 22, lebarBahu: 34, panjangBaju: 63, lebarDada: 46, lebarPinggul: 50 } },
      { name: 'S', ratio: 1, data: { panjangLengan: 23, lebarBahu: 35.5, panjangBaju: 64, lebarDada: 48, lebarPinggul: 52 } },
      { name: 'M', ratio: 2, data: { panjangLengan: 23, lebarBahu: 37, panjangBaju: 65, lebarDada: 50, lebarPinggul: 54 } },
      { name: 'L', ratio: 2, data: { panjangLengan: 24, lebarBahu: 38.5, panjangBaju: 66, lebarDada: 52, lebarPinggul: 56 } },
      { name: 'XL', ratio: 2, data: { panjangLengan: 24, lebarBahu: 40, panjangBaju: 67, lebarDada: 54, lebarPinggul: 58 } },
      { name: '3L', ratio: 1, data: { panjangLengan: 25, lebarBahu: 41.5, panjangBaju: 68, lebarDada: 56, lebarPinggul: 60 } },
      { name: '4L', ratio: 1, data: { panjangLengan: 25, lebarBahu: 43, panjangBaju: 69, lebarDada: 58, lebarPinggul: 62 } },
    ]
  },
  {
    key: 'rok_kulot_pramuka_smp_sma',
    label: 'Rok Kulot Pramuka SMP / SMA / SPK',
    type: 'rok',
    levels: ['SMP', 'SMA', 'SPK-SMP', 'SPK-SMA'],
    groupLabel: 'SMP / SMA / SPK',
    headers: [
      { key: 'lebarPinggang', label: 'Lebar Pinggang' },
      { key: 'panjangRok', label: 'Panjang Rok' }
    ],
    sizes: [
      { name: 'SS', ratio: 1, data: { lebarPinggang: 30, panjangRok: 58 } },
      { name: 'S', ratio: 1, data: { lebarPinggang: 32, panjangRok: 60 } },
      { name: 'M', ratio: 2, data: { lebarPinggang: 34, panjangRok: 60 } },
      { name: 'L', ratio: 2, data: { lebarPinggang: 36, panjangRok: 62 } },
      { name: 'XL', ratio: 2, data: { lebarPinggang: 38, panjangRok: 62 } },
      { name: '3L', ratio: 1, data: { lebarPinggang: 40, panjangRok: 64 } },
      { name: '4L', ratio: 1, data: { lebarPinggang: 42, panjangRok: 64 } },
    ]
  }
];

interface KainVendor {
  id: string;
  name: string;
  contact_person?: string;
  phone?: string;
}

interface KainSchool {
  id: string;
  email: string;
  school_name: string;
  level: string;
}

interface KainPlotting {
  id: string;
  vendor_id: string;
  school_user_id: string;
  clothing_type?: string;
  academic_year?: string;
  vendors?: { name: string; contact_person?: string; phone?: string };
  app_users?: { school_name: string; username?: string; school_level?: string };
}

interface RawForecastEntry {
  id?: string;
  level?: string;
  uniformName?: string;
  sizes?: Record<string, unknown>;
  total?: unknown;
  schoolBreakdown?: Record<string, Record<string, unknown>>;
}

interface CalcSizeResult {
  name: string;
  qty: number;
  ratio: number;
  forecastPct: number | null;
  actualPct: number;
  usageCm: number;
  totalUsageCm: number;
}

interface UnmatchedForecastSize {
  name: string;
  qty: number;
  pct: number;
}

interface VendorCalcDistribution {
  vendorId: string;
  vendorName: string;
  contactPerson: string;
  phone: string;
  schoolCount: number;
  totalSchoolsInLevel: number;
  sharePercentage: number;
  shareRatio: number;
  allocRolls: number;
  allocNetMeters: number;
  calcTotalPcs: number;
  calcSizes: Record<string, number>;
  spkTotalPcs: number;
  spkSizes: Record<string, number>;
  neededRolls: number;
}

export interface VendorFabricMutation {
  id: string;
  created_at?: string;
  academic_year: string;
  vendor_id: string;
  date: string;
  mutation_type: 'inbound' | 'usage' | 'initial' | 'adjustment';
  fabric_type: string;
  supplier_name?: string | null;
  document_no?: string | null;
  rolls: number;
  length_yards: number;
  length_meters: number;
  garment_pcs: number;
  system_expected_yards: number;
  notes?: string | null;
  created_by?: string | null;
  vendors?: { name: string } | null;
}

const STANDARD_FABRIC_TYPES: string[] = [
  'Kain Putih TC (Kemeja Putih SD/SMP/SMA)',
  'Kain Famatex Biru (SMP)',
  'Kain Famatex Abu (SMA)',
  'Kain Merah (SD)',
  'Kain Kotak SD (Rompi/Rok/Celana)',
  'Kain Kotak SMP (Rompi)',
  'Kain Kotak SMA (Rompi)',
  'Kain Pramuka Siaga (SD)',
  'Kain Pramuka Penggalang (SMP)',
  'Kain Pramuka Penegak (SMA)',
  'Kain Batik',
  'Lainnya / Khusus',
];

// Pemetaan Resmi Pola Size Chart -> SKU Manajemen Barang (SSOT)
const SIZECHART_TO_SSOT_MAPPING: Record<string, string[]> = {
  // SD
  baju_sd: ['Kemeja Putih'],
  rompi_sd: ['Rompi Kotak'],
  celana_sd: ['Celana Polos (Merah)', 'Celana Kotak', 'Celana Pramuka Siaga', 'Celana Pramuka Penggalang', 'Celana Merah'],
  rok_sd: ['Rok Polos Kls 1-2 (Merah)', 'Rok Kotak Kls 1-2', 'Rok Merah'],
  baju_pramuka_siaga_sd: ['Kemeja Pramuka Siaga Putra Kls 1-4', 'Kemeja Pramuka Siaga Putri Kls 1-4', 'Pramuka Siaga'],
  // SMP
  baju_smp_sma: ['Kemeja Putih'],
  rompi_smp_sma: ['Rompi Kotak'],
  celana_smp: ['Celana Biru', 'Celana Pendek Pramuka'],
  rok_kulot_smp_sma: ['Kulot Biru', 'Rok Kulot'],
  baju_pramuka_putra_smp_sma: ['Kemeja Pramuka Putra + Ambalan', 'Kemeja Pramuka Putra'],
  rok_kulot_pramuka_smp_sma: ['Kulot Pramuka', 'Rok Kulot Pramuka'],
  // SMA
  celana_sma: ['Celana Panjang Abu', 'Celana Panjang Pramuka', 'Celana Abu'],
  baju_pramuka_putri_sma: ['Kemeja Pramuka Putri'],
};

const PRESET_UNIFORM_HINTS: Record<string, string> = {
  baju_sd: 'Kemeja Putih',
  rompi_sd: 'Rompi Kotak',
  celana_sd: 'Celana Polos / Kotak / Pramuka',
  rok_sd: 'Rok Polos / Kotak Kls 1-2',
  baju_pramuka_siaga_sd: 'Pramuka Siaga Putra/Putri',
  baju_smp_sma: 'Kemeja Putih',
  rompi_smp_sma: 'Rompi Kotak',
  celana_smp: 'Celana Biru / Pramuka',
  celana_sma: 'Celana Abu / Pramuka',
  rok_kulot_smp_sma: 'Kulot Biru',
  baju_pramuka_putra_smp_sma: 'Kemeja Pramuka Putra + Ambalan',
  baju_pramuka_putri_sma: 'Kemeja Pramuka Putri',
  rok_kulot_pramuka_smp_sma: 'Kulot Pramuka',
};

const SIZE_ALIASES: Record<string, string[]> = {
  '2L': ['XXL'],
  XXL: ['2L'],
  '3L': ['XXXL'],
  XXXL: ['3L'],
  '4L': ['XXXXL'],
  XXXXL: ['4L'],
};

function getForecastStorageKey(year: string): string {
  return `production_forecast_${resolveAcademicYear(year).replace(/[^a-zA-Z0-9]/g, '_')}`;
}

function getForecastItemKey(item: Pick<ForecastItem, 'level' | 'uniformName'>): string {
  return `${normalizeLevel(item.level)}___${(item.uniformName || '').trim().toUpperCase()}`;
}

function normalizeSizeKey(raw: string): string {
  return (raw || '').toUpperCase().replace(/^SIZE\s+/i, '').trim();
}

function getForecastQtyForSize(forecastSizes: Record<string, number>, sizeName: string): number {
  const cleanTarget = normalizeSizeKey(sizeName);
  if (!cleanTarget) return 0;

  for (const [k, v] of Object.entries(forecastSizes)) {
    if (normalizeSizeKey(k) === cleanTarget) {
      return Number(v) || 0;
    }
  }

  const aliases = SIZE_ALIASES[cleanTarget] || [];
  for (const alias of aliases) {
    for (const [k, v] of Object.entries(forecastSizes)) {
      if (normalizeSizeKey(k) === alias) {
        return Number(v) || 0;
      }
    }
  }
  return 0;
}

function gcdTwo(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x || 1;
}

function getCanonicalForecastProductName(
  rawName: string,
  level: string,
  products: Array<{ name?: string; level?: string }>
): string {
  const cleanRaw = (rawName || '').trim();
  if (!cleanRaw) return '';
  const upperKey = cleanRaw.toUpperCase();
  const normLvl = level ? normalizeLevel(level) : '';

  if (products && products.length > 0) {
    if (normLvl) {
      const matchedWithLvl = products.find(
        p =>
          (p.name || '').trim().toUpperCase() === upperKey &&
          (normalizeLevel(p.level || '') === normLvl || normalizeLevel(p.level || '') === 'SEMUA')
      );
      if (matchedWithLvl?.name) return matchedWithLvl.name.trim();
    }
    const matched = products.find(p => (p.name || '').trim().toUpperCase() === upperKey);
    if (matched?.name) return matched.name.trim();
  }
  return cleanRaw;
}

function normalizeForecastItems(
  rawItems: RawForecastEntry[],
  products: Array<{ name?: string; level?: string }>
): ForecastItem[] {
  const itemMap = new Map<string, ForecastItem>();

  rawItems.forEach((it, idx) => {
    if (!it.uniformName || !it.level) return;
    const uLevel = normalizeLevel(it.level);
    const canonicalName = getCanonicalForecastProductName(String(it.uniformName).trim(), uLevel, products);
    const key = `${uLevel}___${canonicalName.toUpperCase()}`;

    const cleanSizes: Record<string, number> = {};
    Object.entries(it.sizes || {}).forEach(([sz, qty]) => {
      cleanSizes[sz] = Number(qty) || 0;
    });

    if (!itemMap.has(key)) {
      const cleanBreakdown: Record<string, Record<string, number>> = {};
      if (it.schoolBreakdown && typeof it.schoolBreakdown === 'object') {
        Object.entries(it.schoolBreakdown).forEach(([sch, bdSizes]) => {
          cleanBreakdown[sch] = {};
          Object.entries(bdSizes || {}).forEach(([sz, qty]) => {
            cleanBreakdown[sch][sz] = Number(qty) || 0;
          });
        });
      }
      const computedTotal = Object.values(cleanSizes).reduce((sum, n) => sum + n, 0);
      itemMap.set(key, {
        id: it.id ? String(it.id) : `${key}-${idx}`,
        level: uLevel,
        uniformName: canonicalName,
        sizes: cleanSizes,
        total: computedTotal > 0 ? computedTotal : Number(it.total) || 0,
        schoolBreakdown: cleanBreakdown,
      });
    } else {
      const existing = itemMap.get(key)!;
      Object.entries(cleanSizes).forEach(([sz, qty]) => {
        existing.sizes[sz] = (existing.sizes[sz] || 0) + qty;
      });
      existing.total = Object.values(existing.sizes).reduce((sum, n) => sum + n, 0);

      if (it.schoolBreakdown && typeof it.schoolBreakdown === 'object') {
        if (!existing.schoolBreakdown) existing.schoolBreakdown = {};
        Object.entries(it.schoolBreakdown).forEach(([sch, bdSizes]) => {
          if (!existing.schoolBreakdown![sch]) existing.schoolBreakdown![sch] = {};
          Object.entries(bdSizes || {}).forEach(([sz, qty]) => {
            existing.schoolBreakdown![sch][sz] =
              (existing.schoolBreakdown![sch][sz] || 0) + (Number(qty) || 0);
          });
        });
      }
    }
  });

  return Array.from(itemMap.values());
}

function resolveKainSchoolLevel(schoolName: string, email?: string, existingLevel?: string): string {
  const n = (schoolName || '').toUpperCase();
  const e = (email || '').toLowerCase();

  if (n.includes('PRIMARY') || n.includes('SPK-SD') || n.includes('SD-SPK') || e.includes('primary')) return 'SPK-SD';
  if (n.includes('LOWER') || n.includes('SPK-SMP') || n.includes('SMP-SPK') || e.includes('lower')) return 'SPK-SMP';
  if (n.includes('UPPER') || n.includes('SPK-SMA') || n.includes('SMA-SPK') || e.includes('upper')) return 'SPK-SMA';

  if (n.startsWith('TKK') || n.includes('TKK ') || n.includes('TK ') || e.includes('tkk') || e.includes('penjualan.k')) return 'TK';
  if (n.startsWith('SDK') || n.includes('SDK ') || n.includes('SD ') || e.includes('sdk') || e.includes('penjualan.d')) return 'SD';
  if (n.startsWith('SMPK') || n.includes('SMPK ') || n.includes('SMP ') || e.includes('smpk') || e.includes('penjualan.p')) return 'SMP';
  if (n.startsWith('SMAK') || n.includes('SMKF') || n.includes('SMAK ') || n.includes('SMA ') || n.includes('SMK') || e.includes('smak') || e.includes('penjualan.a')) return 'SMA';

  const cleanLvl = (existingLevel || '').toUpperCase().trim();
  if (cleanLvl === 'SD-SPK' || cleanLvl === 'SPK-SD') return 'SPK-SD';
  if (cleanLvl === 'SMP-SPK' || cleanLvl === 'SPK-SMP') return 'SPK-SMP';
  if (cleanLvl === 'SMA-SPK' || cleanLvl === 'SPK-SMA') return 'SPK-SMA';
  return cleanLvl;
}

function getKainLevelPrefix(level?: string, schoolName?: string): string {
  const lvl = (level || '').toUpperCase().trim();
  const n = (schoolName || '').toLowerCase().trim();
  if (lvl.includes('TK') || lvl.includes('TKK') || n.startsWith('tkk') || n.includes(' tk ') || n.startsWith('tk ')) return 'K';
  if (lvl.includes('SD') || lvl.includes('SDK') || n.startsWith('sdk') || n.includes(' sd ') || n.startsWith('sd ')) return 'D';
  if (lvl.includes('SMP') || lvl.includes('SMPK') || n.startsWith('smpk') || n.includes(' smp ') || n.startsWith('smp ')) return 'P';
  if (lvl.includes('SMA') || lvl.includes('SMAK') || lvl.includes('SMK') || n.startsWith('smak') || n.includes('smk') || n.includes(' sma ') || n.startsWith('sma ')) return 'A';
  return 'D';
}

const BRANCH_CODES: Array<{ tokens: string[]; emailTokens: string[]; suffix: string; overrideK?: string }> = [
  { tokens: ['gading serpong'], emailTokens: ['dgs', 'kgs', 'pgs', 'ags'], suffix: 'GS' },
  { tokens: ['bintaro jaya'], emailTokens: ['dbj', 'kbj', 'pbj', 'abj'], suffix: 'BJ' },
  { tokens: ['kota wisata'], emailTokens: ['dkw', 'kkw', 'pkw', 'akw', 'kowis'], suffix: 'KW' },
  { tokens: ['harapan indah'], emailTokens: ['dhi', 'khi', 'phi', 'ahi'], suffix: 'HI' },
  { tokens: ['kota modern'], emailTokens: ['dkm', 'kkm', 'pkm', 'akm'], suffix: 'KM' },
  { tokens: ['agus salim'], emailTokens: ['das', 'kas', 'pas', 'aas'], suffix: 'AS', overrideK: 'KAG' },
  { tokens: ['depok'], emailTokens: ['ddp', 'kdp', 'pdp', 'adp'], suffix: 'DP' },
  { tokens: ['summarecon', 'sumarecon'], emailTokens: ['dsb', 'ksb', 'psb', 'asb', 'sumbek'], suffix: 'SB' },
  { tokens: ['jababeka'], emailTokens: ['dkj', 'kkj', 'pkj', 'akj'], suffix: 'KJ' },
  { tokens: ['kota tangerang'], emailTokens: ['akt'], suffix: 'KT' },
];

function getKainSchoolDisplayCode(schoolName: string, email?: string, level?: string): string {
  const n = (schoolName || '').toLowerCase().trim();
  const e = (email || '').toLowerCase().trim();
  const prefix = getKainLevelPrefix(level, schoolName);

  if (n.includes('international') || n.includes('pis') || e.includes('pis')) {
    if (n.includes('gading') || e.includes('pis.kg') || e.includes('pis_kg')) return 'PIS KG';
    if (n.includes('duren') || e.includes('pis.td') || e.includes('pis_td')) return 'PIS TD';
    return 'PIS';
  }
  if (n.includes('tirtamarta 1') || n.includes('pondok indah') || e.includes('tirtamarta1') || e.includes('tirtamarta_1')) return 'TM 1';
  if (n.includes('tirtamarta 2') || n.includes('cinere') || e.includes('tirtamarta2') || e.includes('tirtamarta_2')) return 'TM 2';
  if (n.includes('tirtamarta')) return 'TM 1';
  if (n.includes('farmasi') || e.includes('smkf')) return 'SMKF';
  if (n.includes('kelapa gading indah') || e.includes('dkgi') || e.includes('kgi')) return 'DKGI';

  for (const b of BRANCH_CODES) {
    if (b.tokens.some(t => n.includes(t)) || b.emailTokens.some(t => e.includes(t))) {
      if (b.overrideK && prefix === 'K') return b.overrideK;
      return prefix + b.suffix;
    }
  }

  const nameMatch = n.match(/(tkk|sdk|smpk|smak|tk|sd|smp|sma)\s*(\d+)/i);
  if (nameMatch) {
    const num = parseInt(nameMatch[2], 10);
    return prefix + (num < 10 ? `0${num}` : String(num));
  }

  const emailMatch = e.match(/penjualan\.([a-z0-9]+)@/);
  if (emailMatch) {
    const numMatch = emailMatch[1].toUpperCase().match(/(\d+)/);
    if (numMatch) {
      const num = parseInt(numMatch[1], 10);
      return prefix + (num < 10 ? `0${num}` : String(num));
    }
  }

  return schoolName.replace(/[^a-zA-Z0-9]/g, '').slice(0, 6).toUpperCase() || schoolName;
}

function isSchoolBreakdownMatch(schoolNameA: string, schoolNameB: string): boolean {
  const cleanA = (schoolNameA || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const cleanB = (schoolNameB || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!cleanA || !cleanB) return false;
  if (cleanA === cleanB) return true;

  const genericTerms = [
    'sekolahpenabur',
    'bpkpenabur',
    'penabur',
    'sekolah',
    'bpk',
    'sdpenabur',
    'tkkpenabur',
    'smpkpenabur',
    'smakpenabur',
  ];
  if (genericTerms.includes(cleanA) || genericTerms.includes(cleanB)) return false;

  const isTmA = cleanA.includes('tirtamarta') || cleanA.includes('tm1') || cleanA.includes('tm2') || cleanA.startsWith('tm');
  const isTmB = cleanB.includes('tirtamarta') || cleanB.includes('tm1') || cleanB.includes('tm2') || cleanB.startsWith('tm');
  if (isTmA !== isTmB) return false;

  const getLvl = (s: string): string => {
    const low = s.toLowerCase();
    if (low.includes('tkk') || low.startsWith('tk') || low.startsWith('k0') || low.startsWith('k1')) return 'TK';
    if (low.includes('sdk') || low.startsWith('sd') || low.startsWith('d0') || low.startsWith('d1')) return 'SD';
    if (low.includes('smpk') || low.startsWith('smp') || low.startsWith('p0') || low.startsWith('p1')) return 'SMP';
    if (low.includes('smak') || low.startsWith('sma') || low.startsWith('smk') || low.startsWith('a0') || low.startsWith('a1')) return 'SMA';
    return '';
  };
  const lvlA = getLvl(cleanA);
  const lvlB = getLvl(cleanB);
  if (lvlA && lvlB && lvlA !== lvlB) return false;

  const codeA = getKainSchoolDisplayCode(schoolNameA).toUpperCase();
  const codeB = getKainSchoolDisplayCode(schoolNameB).toUpperCase();
  if (codeA && codeB && codeA === codeB && !codeA.startsWith('SEKOL') && !codeB.startsWith('SEKOL')) return true;
  if (codeA && codeA.replace(/[^A-Z0-9]/g, '') === cleanB.toUpperCase()) return true;
  if (codeB && codeB.replace(/[^A-Z0-9]/g, '') === cleanA.toUpperCase()) return true;

  const numA = (cleanA.match(/(?:tkk|sdk|smpk|smak|d|k|p|a)?(\d{1,2})/i) || [])[1];
  const numB = (cleanB.match(/(?:tkk|sdk|smpk|smak|d|k|p|a)?(\d{1,2})/i) || [])[1];
  if (numA && numB) return parseInt(numA, 10) === parseInt(numB, 10);
  if ((numA && !numB) || (!numA && numB)) return false;

  if (cleanA.length >= 6 && cleanB.length >= 6) {
    return cleanA.includes(cleanB) || cleanB.includes(cleanA);
  }
  return false;
}

function normalizeItemName(str: string): string {
  return (str || '')
    .toUpperCase()
    .replace(/\bSET\b/g, '')
    .replace(/\b1\s+SET\b/g, '')
    .replace(/[-_()/+]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isClothingTypeMatch(targetUniform: string, plottedType: string): boolean {
  if (!targetUniform || !plottedType) return false;
  const tRaw = targetUniform.trim().toUpperCase();
  const pRaw = plottedType.trim().toUpperCase();
  if (pRaw === 'SEMUA JENIS BAJU' || tRaw === 'SEMUA JENIS BAJU') return true;

  const tNorm = normalizeItemName(targetUniform);
  const pNorm = normalizeItemName(plottedType);
  if (!tNorm || !pNorm) return false;
  if (tNorm === pNorm) return true;

  const isPramukaT = tNorm.includes('PRAMUKA');
  const isPramukaP = pNorm.includes('PRAMUKA');
  if (isPramukaT !== isPramukaP) {
    const accTokens = ['BARET', 'LAKEN', 'KACU', 'SIAGA', 'PENGGALANG', 'PENEGAK', 'AMBALAN'];
    if (!accTokens.some(k => tNorm.includes(k)) && !accTokens.some(k => pNorm.includes(k))) {
      return false;
    }
  }

  const exclusiveGroups = [
    ['MERAH', 'BIRU', 'ABU'],
    ['PUTRA', 'PUTRI'],
    ['PANJANG', 'PENDEK'],
    ['ROK', 'KULOT', 'CELANA'],
  ];
  for (const grp of exclusiveGroups) {
    for (const token of grp) {
      if (tNorm.includes(token) && grp.some(other => other !== token && pNorm.includes(other))) {
        return false;
      }
    }
  }

  const hasSiagaT = tNorm.includes('SIAGA');
  const hasPenggalangT = tNorm.includes('PENGGALANG');
  const hasPenegakT = tNorm.includes('PENEGAK') || tNorm.includes('AMBALAN');
  const hasSiagaP = pNorm.includes('SIAGA');
  const hasPenggalangP = pNorm.includes('PENGGALANG');
  const hasPenegakP = pNorm.includes('PENEGAK') || pNorm.includes('AMBALAN');

  if (
    (hasSiagaT && (hasPenggalangP || hasPenegakP)) ||
    (hasSiagaP && (hasPenggalangT || hasPenegakT)) ||
    (hasPenggalangT && (hasSiagaP || hasPenegakP)) ||
    (hasPenggalangP && (hasSiagaT || hasPenegakT))
  ) {
    return false;
  }

  if (isPramukaT || isPramukaP) {
    if (hasSiagaT && !hasSiagaP && (pNorm.includes('PENDEK') || pNorm.includes('PANJANG') || pNorm.includes('AMBALAN'))) return false;
    if (hasSiagaP && !hasSiagaT && (tNorm.includes('PENDEK') || tNorm.includes('PANJANG') || tNorm.includes('AMBALAN'))) return false;
    if (hasPenggalangT && !hasPenggalangP && (pNorm.includes('PANJANG') || pNorm.includes('AMBALAN'))) return false;
    if (hasPenggalangP && !hasPenggalangT && (tNorm.includes('PANJANG') || tNorm.includes('AMBALAN'))) return false;
  }

  if (
    (tNorm.includes('CELANA') || tNorm.includes('ROK') || tNorm.includes('KULOT')) &&
    (pNorm.includes('CELANA') || pNorm.includes('ROK') || pNorm.includes('KULOT'))
  ) {
    const isPolosT = tNorm.includes('POLOS') || tNorm.includes('MERAH');
    const isPolosP = pNorm.includes('POLOS') || pNorm.includes('MERAH');
    if ((tNorm.includes('KOTAK') && isPolosP) || (pNorm.includes('KOTAK') && isPolosT)) {
      return false;
    }
  }

  if (tNorm.includes('PUTRI') && (tNorm.includes('KOTAK') || tNorm.includes('SERGM') || tNorm.includes('SERAGAM')) && pNorm.includes('PUTRI') && (pNorm.includes('KOTAK') || pNorm.includes('SERGM') || pNorm.includes('SERAGAM'))) return true;
  if (tNorm.includes('PUTRA') && (tNorm.includes('KOTAK') || tNorm.includes('SERGM') || tNorm.includes('SERAGAM')) && pNorm.includes('PUTRA') && (pNorm.includes('KOTAK') || pNorm.includes('SERGM') || pNorm.includes('SERAGAM'))) return true;

  if (tNorm.includes('KOTAK PUTRA') && pNorm.includes('KOTAK PUTRA')) return true;
  if (tNorm.includes('KOTAK PUTRI') && pNorm.includes('KOTAK PUTRI')) return true;
  if (tNorm.includes('ROMPI KOTAK') && pNorm.includes('ROMPI KOTAK')) return true;

  if (tNorm.includes('CELANA MERAH') && (pNorm.includes('CELANA MERAH') || pNorm.includes('CELANA POLOS MERAH'))) return true;
  if (tNorm.includes('CELANA POLOS') && (pNorm.includes('CELANA POLOS') || pNorm.includes('CELANA MERAH') || pNorm.includes('CELANA POLOS MERAH'))) return true;
  if (tNorm.includes('KULOT MERAH') && (pNorm.includes('KULOT MERAH') || pNorm.includes('KULOT POLOS MERAH'))) return true;
  if (tNorm.includes('KULOT POLOS') && (pNorm.includes('KULOT POLOS') || pNorm.includes('KULOT MERAH') || pNorm.includes('KULOT POLOS MERAH'))) return true;
  if (tNorm.includes('ROK MERAH') && (pNorm.includes('ROK MERAH') || pNorm.includes('ROK POLOS MERAH'))) return true;
  if (tNorm.includes('ROK POLOS') && (pNorm.includes('ROK POLOS') || pNorm.includes('ROK MERAH') || pNorm.includes('ROK POLOS MERAH'))) return true;

  const exactPhrasePairs = [
    'CELANA KOTAK', 'ROK KOTAK', 'KULOT KOTAK', 'KEMEJA PUTIH',
    'CELANA BIRU', 'ROK BIRU', 'KULOT BIRU',
    'ROK ABU', 'KULOT ABU',
  ];
  for (const phrase of exactPhrasePairs) {
    if (tNorm.includes(phrase) && pNorm.includes(phrase)) return true;
  }
  if (tNorm.includes('CELANA ABU') && (pNorm.includes('CELANA ABU') || pNorm.includes('CELANA PANJANG ABU'))) return true;

  const isOlahragaStr = (raw: string) =>
    raw.includes('OLAHRAGA') ||
    raw.includes(' OR ') ||
    raw.endsWith(' OR') ||
    raw.startsWith('OR ') ||
    raw.includes('CELANA OR') ||
    raw.includes('KAOS OR');
  const isOrT = isOlahragaStr(tRaw);
  const isOrP = isOlahragaStr(pRaw);
  if (isOrT || isOrP) {
    if (!isOrT || !isOrP) return false;
    const isSetT = (tRaw.includes('SET') || tRaw === 'OLAHRAGA') && !tRaw.includes('KAOS') && !tRaw.includes('CELANA');
    const isSetP = (pRaw.includes('SET') || pRaw === 'OLAHRAGA') && !pRaw.includes('KAOS') && !pRaw.includes('CELANA');
    if (isSetT && isSetP) return true;
    if (isSetT || isSetP) return false;

    const isKaosT = tRaw.includes('KAOS');
    const isKaosP = pRaw.includes('KAOS');
    if (isKaosT && isKaosP) return true;
    if (isKaosT || isKaosP) return false;

    if (tRaw.includes('CELANA') && pRaw.includes('CELANA')) {
      if ((tRaw.includes('PUTRA') && pRaw.includes('PUTRI')) || (tRaw.includes('PUTRI') && pRaw.includes('PUTRA'))) {
        return false;
      }
      return true;
    }
    return false;
  }

  if (tNorm.includes('PRAMUKA') && pNorm.includes('PRAMUKA')) {
    if (tNorm.includes('TOPI') !== pNorm.includes('TOPI')) return false;
    if (tNorm.includes('KEMEJA') !== pNorm.includes('KEMEJA')) return false;
    if (tNorm.includes('CELANA') !== pNorm.includes('CELANA')) return false;
    if (tNorm.includes('ROK') !== pNorm.includes('ROK')) return false;
    if (tNorm.includes('KULOT') !== pNorm.includes('KULOT')) return false;
    if (tNorm.includes('KEMEJA') || tNorm.includes('CELANA') || tNorm.includes('ROK') || tNorm.includes('KULOT') || tNorm.includes('TOPI')) {
      return true;
    }
    return false;
  }

  for (const acc of ['BARET', 'LAKEN', 'KACU', 'NAME TAG', 'CLEMEK', 'JAS LAB', 'BAJU RENANG']) {
    if (tNorm.includes(acc) && pNorm.includes(acc)) return true;
  }
  if (tNorm.includes('AMBALAN') && pNorm.includes('AMBALAN')) {
    return tNorm.includes('KEMEJA') === pNorm.includes('KEMEJA');
  }

  if (!tNorm.includes('TOPI') && !pNorm.includes('TOPI') && !tNorm.includes('DASI') && !pNorm.includes('DASI')) {
    if (tNorm.length >= 7 && pNorm.length >= 7 && (tNorm.includes(pNorm) || pNorm.includes(tNorm))) {
      return true;
    }
  }
  return false;
}

const NON_FABRIC_FORECAST_TOKENS = [
  'BUKU', 'AGENDA', 'KERTAS', 'MAP', 'TOPI', 'DASI', 'KAOS KAKI',
  'SEPATU', 'GESPER', 'SABUK', 'KACU', 'BARET', 'LAKEN', 'NAME TAG',
];

function scorePresetToForecastMatch(
  preset: PresetDef,
  levelFilter: JenjangFilter,
  item: ForecastItem
): number {
  const fUpper = (item.uniformName || '').toUpperCase();
  if (!fUpper || NON_FABRIC_FORECAST_TOKENS.some(t => fUpper.includes(t))) {
    return -100;
  }

  const fcLevel = normalizeLevel(item.level || '');
  const presetLevels = preset.levels.map(l => normalizeLevel(l));
  let score = 0;

  if (levelFilter !== 'SEMUA') {
    score += fcLevel === levelFilter ? 45 : -60;
  } else if (presetLevels.includes(fcLevel)) {
    score += 30;
    if (fcLevel === presetLevels[0]) score += 5;
  } else {
    score -= 50;
  }

  const pUpper = (preset.label || '').toUpperCase();
  const pPramuka = pUpper.includes('PRAMUKA') || pUpper.includes('SIAGA');
  const fPramuka =
    fUpper.includes('PRAMUKA') ||
    fUpper.includes('SIAGA') ||
    fUpper.includes('PENGGALANG') ||
    fUpper.includes('PENEGAK') ||
    fUpper.includes('AMBALAN');

  if (pPramuka !== fPramuka) return -80;
  if (pPramuka) score += 25;

  const isRompiF = fUpper.includes('ROMPI');
  const isCelanaF = fUpper.includes('CELANA');
  const isRokOrKulotF = fUpper.includes('ROK') || fUpper.includes('KULOT');
  const isTopF =
    !isRompiF &&
    !isCelanaF &&
    !isRokOrKulotF &&
    (fUpper.includes('KEMEJA') ||
      fUpper.includes('BAJU') ||
      fUpper.includes('ATASAN') ||
      fUpper.includes('KOTAK PUTRA') ||
      fUpper.includes('KOTAK PUTRI') ||
      fUpper.includes('BATIK') ||
      fUpper.includes('KAOS') ||
      fUpper.includes('OLAHRAGA') ||
      fUpper.includes('JAS'));

  if (preset.type === 'rompi') score += isRompiF ? 30 : -45;
  else if (preset.type === 'celana') score += isCelanaF ? 30 : -45;
  else if (preset.type === 'rok') score += isRokOrKulotF ? 30 : -45;
  else if (preset.type === 'kemeja') score += isTopF ? 25 : -45;

  const pStrictPutra = pUpper.includes('PUTRA') && !pUpper.includes('PUTRI');
  const pStrictPutri = pUpper.includes('PUTRI') && !pUpper.includes('PUTRA');
  if (pStrictPutra) score += fUpper.includes('PUTRA') ? 15 : fUpper.includes('PUTRI') ? -25 : 0;
  if (pStrictPutri) score += fUpper.includes('PUTRI') ? 15 : fUpper.includes('PUTRA') ? -25 : 0;

  for (const kw of ['SIAGA', 'MERAH', 'BIRU', 'ABU', 'KOTAK', 'KULOT', 'PANJANG', 'PENDEK', 'BATIK']) {
    if (pUpper.includes(kw) && fUpper.includes(kw)) score += 10;
  }
  if (!pUpper.includes('BATIK') && !fUpper.includes('BATIK')) score += 8;
  if (!pPramuka && !pUpper.includes('KOTAK') && fUpper.includes('PUTIH')) score += 8;

  // Pencocokan langsung berdasarkan Kamus Resmi Sizechart -> SSOT Manajemen Barang
  const mappedNames = SIZECHART_TO_SSOT_MAPPING[preset.key] || [];
  for (const mName of mappedNames) {
    const cleanM = mName.toUpperCase();
    if (fUpper === cleanM || fUpper.includes(cleanM) || cleanM.includes(fUpper)) {
      score += 70;
      break;
    }
  }

  return score;
}

interface KalkulatorKainProps {
  readOnly?: boolean;
}

export interface FabricBatch {
  id: string;
  label: string;
  rolls: number;
  lengthPerRoll: number;
  unit: 'yard' | 'meter';
}

const KopkarKalkulatorKain = ({ readOnly = false }: KalkulatorKainProps) => {
  const { activeAcademicYear, academicYears } = useSettings();
  const { products } = useProducts();

  // Multi-Supplier & Variable Rolls di Bagian 1
  const [fabricBatches, setFabricBatches] = useState<FabricBatch[]>([
    { id: 'batch-1', label: 'Supplier Kain A', rolls: 1, lengthPerRoll: 60, unit: 'yard' },
  ]);
  const [fabricWidth, setFabricWidth] = useState<number>(150);
  const [defectTolerance, setDefectTolerance] = useState<number>(5);

  const fabricTotals = useMemo(() => {
    let totalRolls = 0;
    let totalYards = 0;
    let totalMeters = 0;

    fabricBatches.forEach(b => {
      const r = Math.max(0, Number(b.rolls) || 0);
      const len = Math.max(0, Number(b.lengthPerRoll) || 0);
      totalRolls += r;
      if (b.unit === 'meter') {
        const m = r * len;
        totalMeters += m;
        totalYards += m / 0.9144;
      } else {
        const y = r * len;
        totalYards += y;
        totalMeters += y * 0.9144;
      }
    });

    const avgYardsPerRoll = totalRolls > 0 ? totalYards / totalRolls : 0;
    const avgMetersPerRoll = totalRolls > 0 ? totalMeters / totalRolls : 0;

    return {
      totalRolls,
      totalYards,
      totalMeters,
      avgYardsPerRoll,
      avgMetersPerRoll,
    };
  }, [fabricBatches]);

  const totalRolls = fabricTotals.totalRolls;
  const yardsPerRoll = fabricTotals.avgYardsPerRoll;

  const setTotalRolls = (newRolls: number) => {
    setFabricBatches(prev => {
      if (prev.length === 0) {
        return [{ id: `batch-${Date.now()}`, label: 'Supplier Kain A', rolls: newRolls, lengthPerRoll: 60, unit: 'yard' }];
      }
      return [{ ...prev[0], rolls: newRolls }, ...prev.slice(1)];
    });
  };

  const handleAddFabricBatch = () => {
    if (readOnly) return;
    const nextIdx = fabricBatches.length + 1;
    const nextChar = String.fromCharCode(64 + ((nextIdx - 1) % 26) + 1);
    setFabricBatches(prev => [
      ...prev,
      {
        id: `batch-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        label: `Supplier Kain ${nextChar}`,
        rolls: 1,
        lengthPerRoll: 60,
        unit: 'yard',
      },
    ]);
  };

  const handleUpdateFabricBatch = (id: string, updates: Partial<FabricBatch>) => {
    if (readOnly) return;
    setFabricBatches(prev => prev.map(b => (b.id === id ? { ...b, ...updates } : b)));
  };

  const handleRemoveFabricBatch = (id: string) => {
    if (readOnly) return;
    if (fabricBatches.length <= 1) {
      setFabricBatches([
        { id: 'batch-1', label: 'Supplier Kain A', rolls: 1, lengthPerRoll: 60, unit: 'yard' },
      ]);
      return;
    }
    setFabricBatches(prev => prev.filter(b => b.id !== id));
  };

  // State Tahun Ajaran & Integrasi Persentase Prediksi Produksi
  const [forecastAcademicYear, setForecastAcademicYear] = useState<string>('2027/2028');
  const [calcMode, setCalcMode] = useState<'forecast' | 'manual'>('forecast');
  const [manualForecastSelection, setManualForecastSelection] = useState<{ scope: string; key: string }>({
    scope: '',
    key: '',
  });
  const [vendorFilterSelection, setVendorFilterSelection] = useState<{ scope: string; vendorId: string }>({
    scope: '',
    vendorId: 'ALL',
  });
  const [forecastItems, setForecastItems] = useState<ForecastItem[]>([]);
  const [forecastLoading, setForecastLoading] = useState<boolean>(false);
  const [vendors, setVendors] = useState<KainVendor[]>([]);
  const [plottings, setPlottings] = useState<KainPlotting[]>([]);
  const [schools, setSchools] = useState<KainSchool[]>([]);
  const [vendorDataLoading, setVendorDataLoading] = useState<boolean>(false);

  const [selectedLevel, setSelectedLevel] = useState<JenjangFilter>('SEMUA');
  const [customPresets, setCustomPresets] = useState<PresetDef[]>([]);
  const [savedOverrides, setSavedOverrides] = useState<Record<string, SizeChartEntry[]>>({});
  const [selectedPresetKey, setSelectedPresetKey] = useState<string>(PRESETS[0].key);
  const [sizes, setSizes] = useState<SizeRatio[]>(() => toSizeRows(PRESETS[0].key, PRESETS[0].sizes, 'init'));
  const [isDirty, setIsDirty] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Sub-Tab Navigasi: 'simulasi' | 'buku_kain'
  const [activeKainSubTab, setActiveKainSubTab] = useState<'simulasi' | 'buku_kain'>('simulasi');

  // State Buku Mutasi & Sisa Kain Vendor
  const [fabricMutations, setFabricMutations] = useState<VendorFabricMutation[]>([]);
  const [fabricMutationsLoading, setFabricMutationsLoading] = useState<boolean>(false);
  const [bookAcademicYear, setBookAcademicYear] = useState<string>('2026/2027');
  const [bookVendorId, setBookVendorId] = useState<string>('ALL');
  const [bookFabricFilter, setBookFabricFilter] = useState<string>('ALL');
  const [searchMutationQuery, setSearchMutationQuery] = useState<string>('');

  // Modal 1: Catat Kain Masuk dari Supplier
  const [showInboundModal, setShowInboundModal] = useState<boolean>(false);
  const [inboundVendorId, setInboundVendorId] = useState<string>('');
  const [inboundAcademicYear, setInboundAcademicYear] = useState<string>('2026/2027');
  const [inboundFabricType, setInboundFabricType] = useState<string>(STANDARD_FABRIC_TYPES[0]);
  const [inboundCustomFabricType, setInboundCustomFabricType] = useState<string>('');
  const [inboundDate, setInboundDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [inboundSupplierName, setInboundSupplierName] = useState<string>('');
  const [inboundDocNo, setInboundDocNo] = useState<string>('');
  const [inboundRolls, setInboundRolls] = useState<number>(1);
  const [inboundLengthYards, setInboundLengthYards] = useState<number>(60);
  const [inboundLengthMeters, setInboundLengthMeters] = useState<number>(54.86);
  const [inboundNotes, setInboundNotes] = useState<string>('');
  const [inboundSaving, setInboundSaving] = useState<boolean>(false);

  // Modal 2: Catat Laporan Setor Baju & Sisa Vendor
  const [showUsageModal, setShowUsageModal] = useState<boolean>(false);
  const [usageVendorId, setUsageVendorId] = useState<string>('');
  const [usageAcademicYear, setUsageAcademicYear] = useState<string>('2026/2027');
  const [usageFabricType, setUsageFabricType] = useState<string>(STANDARD_FABRIC_TYPES[0]);
  const [usageDate, setUsageDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [usageDocNo, setUsageDocNo] = useState<string>('');
  const [usageGarmentPcs, setUsageGarmentPcs] = useState<number>(0);
  const [usageLengthYards, setUsageLengthYards] = useState<number>(0);
  const [usageLengthMeters, setUsageLengthMeters] = useState<number>(0);
  const [usageClaimRemainingYards, setUsageClaimRemainingYards] = useState<string>('');
  const [usageNotes, setUsageNotes] = useState<string>('');
  const [usageSaving, setUsageSaving] = useState<boolean>(false);

  // Modal 3: Catat Saldo Awal / Opname Penyesuaian
  const [showInitialModal, setShowInitialModal] = useState<boolean>(false);
  const [initialVendorId, setInitialVendorId] = useState<string>('');
  const [initialAcademicYear, setInitialAcademicYear] = useState<string>('2026/2027');
  const [initialFabricType, setInitialFabricType] = useState<string>(STANDARD_FABRIC_TYPES[0]);
  const [initialType, setInitialType] = useState<'initial' | 'adjustment'>('initial');
  const [initialDate, setInitialDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [initialRolls, setInitialRolls] = useState<number>(0);
  const [initialLengthYards, setInitialLengthYards] = useState<number>(0);
  const [initialLengthMeters, setInitialLengthMeters] = useState<number>(0);
  const [initialNotes, setInitialNotes] = useState<string>('');
  const [initialSaving, setInitialSaving] = useState<boolean>(false);

  // Modal Tambah Item Model Baru
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [newItemLevel, setNewItemLevel] = useState<JenjangLevel>('SD');
  const [newItemLabel, setNewItemLabel] = useState<string>('');
  const [newItemType, setNewItemType] = useState<GarmentType>('kemeja');
  const [newItemTemplate, setNewItemTemplate] = useState<SizeTemplateType>('letter');
  const [modalError, setModalError] = useState<string>('');

  const selectedKeyRef = useRef<string>(selectedPresetKey);
  const rowSeqRef = useRef<number>(1);

  useEffect(() => {
    selectedKeyRef.current = selectedPresetKey;
  }, [selectedPresetKey]);

  const selectionScope = `${selectedPresetKey}__${selectedLevel}__${forecastAcademicYear}`;
  const manualForecastKey =
    manualForecastSelection.scope === selectionScope ? manualForecastSelection.key : '';
  const selectedVendorFilter =
    vendorFilterSelection.scope === selectionScope ? vendorFilterSelection.vendorId : 'ALL';

  const forecastYearOptions = useMemo(
    () =>
      buildAcademicYearOptions(
        academicYears,
        ['2027/2028', ...plottings.map(p => p.academic_year)],
        activeAcademicYear
      ),
    [academicYears, plottings, activeAcademicYear]
  );

  // Fetch master vendor, plotting, dan sekolah untuk kalkulasi porsi (%) vendor per TA
  useEffect(() => {
    let active = true;

    const loadVendorAndPlottingData = async () => {
      if (active) setVendorDataLoading(true);
      try {
        const [vendorsRes, assignmentsRes, whitelistRes, appUsersRes] = await Promise.all([
          fetchAllSupabasePaged<KainVendor>((from, to) =>
            supabase.from('vendors').select('id, name, contact_person, phone').order('name', { ascending: true }).range(from, to)
          ),
          fetchAllSupabasePaged<Record<string, unknown>>((from, to) =>
            supabase
              .from('vendor_school_assignments')
              .select('id, vendor_id, school_user_id, clothing_type, academic_year, vendors(name, contact_person, phone), app_users(school_name, username, school_level)')
              .range(from, to)
          ),
          fetchAllSupabasePaged((from, to) =>
            supabase.from('school_whitelist').select('*').range(from, to)
          ),
          fetchAllSupabasePaged((from, to) =>
            supabase.from('app_users').select('id, username, name, school_name, school_level, role').eq('role', 'sekolah').range(from, to)
          ),
        ]);

        if (!active) return;

        const wlData = whitelistRes.data || [];
        const appUsersData = appUsersRes.data || [];

        const userMap = new Map<string, { id: string; school_name: string; school_level: string }>();
        appUsersData.forEach((u: Record<string, unknown>) => {
          const uname = typeof u.username === 'string' ? u.username.toLowerCase().trim() : '';
          if (uname) {
            userMap.set(uname, {
              id: String(u.id || ''),
              school_name: String(u.school_name || ''),
              school_level: String(u.school_level || ''),
            });
          }
        });

        const schoolList: KainSchool[] = [];
        const addedSchoolKeys = new Set<string>();
        const wlMap = new Map<string, Record<string, unknown>>();

        wlData.forEach((w: Record<string, unknown>) => {
          wlMap.set(String(w.id || ''), w);
          const emailClean = typeof w.email === 'string' ? w.email.toLowerCase().trim() : '';
          if (!emailClean) return;
          wlMap.set(emailClean, w);

          const appUser = userMap.get(emailClean);
          if (appUser) {
            const rawJenjang = String(w.Jenjang || w.jenjang || appUser.school_level || 'SD').trim();
            const sName = String(w.nama_sekolah || w.Nama_Sekolah || appUser.school_name || emailClean).trim();
            schoolList.push({
              id: appUser.id,
              email: emailClean,
              school_name: sName,
              level: rawJenjang,
            });
            addedSchoolKeys.add(sName.toLowerCase().replace(/[^a-z0-9]/g, ''));
          }
        });

        appUsersData.forEach((u: Record<string, unknown>) => {
          if (u.role === 'guru_ots') return;
          const schoolName = String(u.school_name || u.name || '').trim();
          if (!schoolName) return;
          const lowerName = schoolName.toLowerCase();
          const lowerUser = String(u.username || '').toLowerCase();
          if (
            lowerName.includes('on the spot') ||
            lowerName.includes('guru ots') ||
            lowerName.includes('guru on the spot') ||
            lowerName === 'sekolah penabur' ||
            lowerName === 'bpk penabur' ||
            lowerUser.includes('spot') ||
            lowerUser.includes('guru_ots')
          ) {
            return;
          }
          const key = schoolName.toLowerCase().replace(/[^a-z0-9]/g, '');
          if (!addedSchoolKeys.has(key)) {
            schoolList.push({
              id: String(u.id || ''),
              email: String(u.username || ''),
              school_name: schoolName,
              level: String(u.school_level || 'SD').trim(),
            });
            addedSchoolKeys.add(key);
          }
        });

        const loadedVendors = (vendorsRes.data || []).slice().sort((a, b) =>
          (a.name || '').localeCompare(b.name || '', 'id', { numeric: true, sensitivity: 'base' })
        );

        const loadedPlottings: KainPlotting[] = (assignmentsRes.data || []).map(row => {
          const vendorRelRaw = Array.isArray(row.vendors) ? row.vendors[0] : row.vendors;
          const appUserRelRaw = Array.isArray(row.app_users) ? row.app_users[0] : row.app_users;
          const vendorRel =
            vendorRelRaw && typeof vendorRelRaw === 'object'
              ? {
                  name: String((vendorRelRaw as Record<string, unknown>).name || ''),
                  contact_person: (vendorRelRaw as Record<string, unknown>).contact_person
                    ? String((vendorRelRaw as Record<string, unknown>).contact_person)
                    : undefined,
                  phone: (vendorRelRaw as Record<string, unknown>).phone
                    ? String((vendorRelRaw as Record<string, unknown>).phone)
                    : undefined,
                }
              : undefined;

          const baseAppUser =
            appUserRelRaw && typeof appUserRelRaw === 'object'
              ? {
                  school_name: String((appUserRelRaw as Record<string, unknown>).school_name || ''),
                  username: (appUserRelRaw as Record<string, unknown>).username
                    ? String((appUserRelRaw as Record<string, unknown>).username)
                    : undefined,
                  school_level: (appUserRelRaw as Record<string, unknown>).school_level
                    ? String((appUserRelRaw as Record<string, unknown>).school_level)
                    : undefined,
                }
              : undefined;

          const basePlotting: KainPlotting = {
            id: String(row.id || ''),
            vendor_id: String(row.vendor_id || ''),
            school_user_id: String(row.school_user_id || ''),
            clothing_type: row.clothing_type ? String(row.clothing_type) : undefined,
            academic_year: row.academic_year ? String(row.academic_year) : undefined,
            vendors: vendorRel,
            app_users: baseAppUser,
          };

          if (!basePlotting.app_users?.school_name) {
            const sch = schoolList.find(s => s.id === basePlotting.school_user_id);
            const wlSch = wlMap.get(String(basePlotting.school_user_id));
            if (sch) {
              return {
                ...basePlotting,
                app_users: {
                  school_name: sch.school_name,
                  username: sch.email || '',
                  school_level: normalizeLevel(sch.level || ''),
                },
              };
            }
            if (wlSch) {
              return {
                ...basePlotting,
                app_users: {
                  school_name: String(wlSch.nama_sekolah || wlSch.Nama_Sekolah || ''),
                  username: String(wlSch.email || ''),
                  school_level: normalizeLevel(String(wlSch.Jenjang || wlSch.jenjang || '')),
                },
              };
            }
          } else if (basePlotting.app_users.school_level) {
            return {
              ...basePlotting,
              app_users: {
                ...basePlotting.app_users,
                school_level: normalizeLevel(basePlotting.app_users.school_level),
              },
            };
          }
          return basePlotting;
        });

        setVendors(loadedVendors);
        setSchools(schoolList);
        setPlottings(loadedPlottings);
      } catch (err) {
        console.warn('Gagal memuat data vendor & plotting untuk kalkulator kain:', err);
      } finally {
        if (active) setVendorDataLoading(false);
      }
    };

    loadVendorAndPlottingData();

    const channel = supabase
      .channel('kalkulator_vendor_plotting_sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vendors' }, () => {
        loadVendorAndPlottingData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vendor_school_assignments' }, () => {
        loadVendorAndPlottingData();
      })
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, []);

  // Fetch data persentase item dari tab Prediksi Produksi berdasarkan Tahun Ajaran terpilih
  useEffect(() => {
    let active = true;
    const storageKey = getForecastStorageKey(forecastAcademicYear);

    const loadForecastForYear = async () => {
      if (active) setForecastLoading(true);
      try {
        const { data, error } = await supabase
          .from('app_settings')
          .select('value')
          .eq('key', storageKey)
          .maybeSingle();

        if (!active) return;

        if (!error && data?.value) {
          try {
            const parsed = JSON.parse(data.value);
            if (Array.isArray(parsed) && parsed.length > 0) {
              const hasCorrupt = parsed.some(
                (it: RawForecastEntry) =>
                  Number(it.total) > 100000000 ||
                  Object.values(it.sizes || {}).some(s => Number(s) > 100000000)
              );
              if (!hasCorrupt) {
                setForecastItems(normalizeForecastItems(parsed, products));
                if (active) setForecastLoading(false);
                return;
              }
            }
          } catch (parseErr) {
            console.warn('Gagal parse JSON prediksi produksi dari DB:', parseErr);
          }
        }

        const localRaw = localStorage.getItem(storageKey);
        if (localRaw) {
          try {
            const parsedLocal = JSON.parse(localRaw);
            if (Array.isArray(parsedLocal) && parsedLocal.length > 0) {
              setForecastItems(normalizeForecastItems(parsedLocal, products));
              if (active) setForecastLoading(false);
              return;
            }
          } catch (localErr) {
            console.warn('Gagal parse JSON prediksi produksi lokal:', localErr);
          }
        }

        setForecastItems([]);
      } catch (err) {
        console.warn('Error loading forecast for year', forecastAcademicYear, err);
        if (active) setForecastItems([]);
      } finally {
        if (active) setForecastLoading(false);
      }
    };

    loadForecastForYear();

    const settingsChannel = supabase
      .channel(`kalkulator_forecast_sync_${storageKey}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'app_settings', filter: `key=eq.${storageKey}` },
        () => {
          loadForecastForYear();
        }
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(settingsChannel);
    };
  }, [forecastAcademicYear, products]);

  const allPresets = useMemo<PresetDef[]>(
    () => [...PRESETS, ...customPresets],
    [customPresets]
  );

  const levelCounts = useMemo(() => {
    const counts: Record<JenjangFilter, number> = {
      SEMUA: allPresets.length,
      TK: 0,
      SD: 0,
      SMP: 0,
      SMA: 0,
      'SPK-SD': 0,
      'SPK-SMP': 0,
      'SPK-SMA': 0,
    };
    allPresets.forEach(p => {
      p.levels.forEach(lvl => {
        counts[lvl] = (counts[lvl] || 0) + 1;
      });
    });
    return counts;
  }, [allPresets]);

  const filteredPresets = useMemo(
    () =>
      selectedLevel === 'SEMUA'
        ? allPresets
        : allPresets.filter(p => p.levels.includes(selectedLevel)),
    [allPresets, selectedLevel]
  );

  const groupedOptions = useMemo(() => {
    if (selectedLevel !== 'SEMUA') {
      const builtIn = filteredPresets.filter(p => !p.isCustom);
      const custom = filteredPresets.filter(p => p.isCustom);
      const groups: { label: string; items: PresetDef[] }[] = [];
      if (builtIn.length > 0) {
        groups.push({ label: `Standar Koperasi (${selectedLevel})`, items: builtIn });
      }
      if (custom.length > 0) {
        groups.push({ label: `Item Tambahan (${selectedLevel})`, items: custom });
      }
      return groups;
    }

    const buckets = new Map<string, PresetDef[]>();
    filteredPresets.forEach(p => {
      const key = p.groupLabel || p.levels[0] || 'Lainnya';
      const arr = buckets.get(key) || [];
      arr.push(p);
      buckets.set(key, arr);
    });

    const orderedLabels = [
      ...GROUP_ORDER.filter(g => buckets.has(g)),
      ...Array.from(buckets.keys()).filter(g => !GROUP_ORDER.includes(g)),
    ];
    return orderedLabels.map(label => ({
      label,
      items: buckets.get(label) || [],
    }));
  }, [filteredPresets, selectedLevel]);

  const currentPreset = useMemo<PresetDef | null>(
    () => filteredPresets.find(p => p.key === selectedPresetKey) || filteredPresets[0] || null,
    [filteredPresets, selectedPresetKey]
  );

  useEffect(() => {
    let active = true;

    const loadAllFromSupabase = async () => {
      try {
        const { data, error } = await supabase
          .from('kalkulator_size_charts')
          .select('preset_key, sizes_data');

        if (error) {
          throw error;
        }
        if (!active || !data) return;

        const overrides: Record<string, SizeChartEntry[]> = {};
        const loadedCustom: PresetDef[] = [];

        data.forEach((row: { preset_key: string; sizes_data: unknown }) => {
          const parsed = parseSavedChartRow(row.preset_key, row.sizes_data);
          const isBuiltIn = PRESETS.some(p => p.key === row.preset_key);

          if (!isBuiltIn && parsed.meta) {
            const customPreset: PresetDef = {
              key: row.preset_key,
              label: parsed.meta.label,
              type: parsed.meta.type,
              levels: [parsed.meta.level],
              groupLabel: parsed.meta.level,
              isCustom: true,
              headers: parsed.meta.headers,
              sizes: parsed.sizes,
            };
            loadedCustom.push(customPreset);
            overrides[row.preset_key] = parsed.sizes;
          } else if (parsed.sizes.length > 0) {
            overrides[row.preset_key] = parsed.sizes;
          }
        });

        loadedCustom.sort((a, b) => a.label.localeCompare(b.label, 'id'));
        setSavedOverrides(overrides);
        setCustomPresets(loadedCustom);

        const activeKey = selectedKeyRef.current;
        if (overrides[activeKey]) {
          setSizes(toSizeRows(activeKey, overrides[activeKey], 'db'));
          setIsDirty(false);
        }
      } catch (err) {
        console.error('Error fetching size charts from supabase:', err);
      }
    };

    loadAllFromSupabase();
    return () => {
      active = false;
    };
  }, []);

  const selectAndLoadPreset = (
    preset: PresetDef | null,
    overridesMap: Record<string, SizeChartEntry[]> = savedOverrides
  ) => {
    if (!preset) {
      setSelectedPresetKey('');
      setSizes([]);
      setIsDirty(false);
      return;
    }
    setSelectedPresetKey(preset.key);
    const sourceSizes = overridesMap[preset.key] || preset.sizes;
    setSizes(toSizeRows(preset.key, sourceSizes, `sw-${rowSeqRef.current++}`));
    setIsDirty(false);
  };

  const handleLevelChange = (level: JenjangFilter) => {
    setSelectedLevel(level);
    setFeedback(null);
    const nextList =
      level === 'SEMUA' ? allPresets : allPresets.filter(p => p.levels.includes(level));
    const currentStillExists = nextList.find(p => p.key === selectedPresetKey);
    if (currentStillExists) {
      return;
    }
    selectAndLoadPreset(nextList[0] || null);
  };

  const handlePresetChange = (key: string) => {
    setFeedback(null);
    const found = allPresets.find(p => p.key === key) || null;
    selectAndLoadPreset(found);
  };

  const openAddItemModal = (preferredLevel?: JenjangLevel) => {
    const defaultLvl: JenjangLevel =
      preferredLevel || (selectedLevel !== 'SEMUA' ? selectedLevel : 'SD');
    setNewItemLevel(defaultLvl);
    setNewItemLabel('');
    setNewItemType('kemeja');
    setNewItemTemplate('letter');
    setModalError('');
    setShowAddModal(true);
  };

  const handleCreateCustomItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (readOnly || isSaving) return;

    const cleanLabel = newItemLabel.trim();
    if (!cleanLabel) {
      setModalError('Nama item / model seragam wajib diisi.');
      return;
    }

    const duplicate = allPresets.some(
      p =>
        p.label.trim().toLowerCase() === cleanLabel.toLowerCase() &&
        p.levels.includes(newItemLevel)
    );
    if (duplicate) {
      setModalError(`Model "${cleanLabel}" pada jenjang ${newItemLevel} sudah ada.`);
      return;
    }

    const typeMeta = GARMENT_TYPE_META[newItemType];
    const starterSizes = buildStarterSizes(typeMeta.headers, newItemTemplate);
    const newKey = createCustomPresetKey(newItemLevel, cleanLabel);

    const metaEntry: CustomPresetMeta = {
      __meta: true,
      label: cleanLabel,
      level: newItemLevel,
      type: newItemType,
      headers: typeMeta.headers,
    };
    const dbPayload = [metaEntry, ...starterSizes];

    setIsSaving(true);
    setModalError('');
    try {
      const { error } = await supabase
        .from('kalkulator_size_charts')
        .upsert({ preset_key: newKey, sizes_data: dbPayload }, { onConflict: 'preset_key' });

      if (error) throw error;

      const createdPreset: PresetDef = {
        key: newKey,
        label: cleanLabel,
        type: newItemType,
        levels: [newItemLevel],
        groupLabel: newItemLevel,
        isCustom: true,
        headers: typeMeta.headers,
        sizes: starterSizes,
      };

      const nextOverrides = { ...savedOverrides, [newKey]: starterSizes };
      setCustomPresets(prev =>
        [...prev, createdPreset].sort((a, b) => a.label.localeCompare(b.label, 'id'))
      );
      setSavedOverrides(nextOverrides);

      if (selectedLevel !== 'SEMUA' && selectedLevel !== newItemLevel) {
        setSelectedLevel(newItemLevel);
      }
      selectAndLoadPreset(createdPreset, nextOverrides);
      setShowAddModal(false);
      setFeedback({
        type: 'success',
        text: `Item "${cleanLabel}" (${newItemLevel}) berhasil ditambahkan! Isi ukuran (cm) & rasio lalu klik Simpan Perubahan.`,
      });
    } catch (err: any) {
      setModalError('Gagal menambahkan item ke database: ' + (err?.message || 'Unknown error'));
    } finally {
      setIsSaving(false);
    }
  };

  const savePresetToSupabase = async () => {
    if (readOnly || !currentPreset || isSaving) return;
    const cleanEntries: SizeChartEntry[] = sizes.map(s => ({
      name: s.name,
      ratio: s.ratio,
      data: s.data,
    }));

    const dbPayload = currentPreset.isCustom
      ? [
          {
            __meta: true as const,
            label: currentPreset.label,
            level: currentPreset.levels[0] || 'SD',
            type: currentPreset.type,
            headers: currentPreset.headers,
          },
          ...cleanEntries,
        ]
      : cleanEntries;

    setIsSaving(true);
    setFeedback(null);
    try {
      const { error } = await supabase
        .from('kalkulator_size_charts')
        .upsert({ preset_key: currentPreset.key, sizes_data: dbPayload }, { onConflict: 'preset_key' });

      if (error) throw error;

      setSavedOverrides(prev => ({ ...prev, [currentPreset.key]: cleanEntries }));
      if (currentPreset.isCustom) {
        setCustomPresets(prev =>
          prev.map(p => (p.key === currentPreset.key ? { ...p, sizes: cleanEntries } : p))
        );
      }
      setIsDirty(false);
      setFeedback({
        type: 'success',
        text: `Size Chart "${currentPreset.label}" berhasil disimpan ke database.`,
      });
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: 'Gagal menyimpan size chart: ' + (err?.message || 'Unknown error'),
      });
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  const resetPresetToDefault = async () => {
    if (readOnly || !currentPreset || currentPreset.isCustom || isSaving) return;
    if (!window.confirm('Kembalikan size chart ini ke pengaturan awal? Data kustom di database juga akan dihapus.')) return;

    const builtIn = PRESETS.find(p => p.key === currentPreset.key) || PRESETS[0];
    setIsSaving(true);
    setFeedback(null);
    try {
      const { error } = await supabase
        .from('kalkulator_size_charts')
        .delete()
        .eq('preset_key', builtIn.key);
      if (error) throw error;

      setSavedOverrides(prev => {
        const next = { ...prev };
        delete next[builtIn.key];
        return next;
      });
      setSizes(toSizeRows(builtIn.key, builtIn.sizes, `rst-${rowSeqRef.current++}`));
      setIsDirty(false);
      setFeedback({
        type: 'success',
        text: `Size Chart "${builtIn.label}" dikembalikan ke standar awal.`,
      });
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: 'Gagal mereset size chart: ' + (err?.message || 'Unknown error'),
      });
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteCustomItem = async () => {
    if (readOnly || !currentPreset || !currentPreset.isCustom || isSaving) return;
    if (!window.confirm(`Hapus item "${currentPreset.label}" secara permanen dari daftar kalkulator kain?`)) {
      return;
    }

    const deletedKey = currentPreset.key;
    const deletedLabel = currentPreset.label;
    setIsSaving(true);
    setFeedback(null);
    try {
      const { error } = await supabase
        .from('kalkulator_size_charts')
        .delete()
        .eq('preset_key', deletedKey);
      if (error) throw error;

      const nextCustom = customPresets.filter(p => p.key !== deletedKey);
      const nextOverrides = { ...savedOverrides };
      delete nextOverrides[deletedKey];

      setCustomPresets(nextCustom);
      setSavedOverrides(nextOverrides);

      const remainingPool = [...PRESETS, ...nextCustom].filter(
        p => selectedLevel === 'SEMUA' || p.levels.includes(selectedLevel)
      );
      selectAndLoadPreset(remainingPool[0] || null, nextOverrides);
      setFeedback({
        type: 'success',
        text: `Item "${deletedLabel}" berhasil dihapus.`,
      });
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: 'Gagal menghapus item: ' + (err?.message || 'Unknown error'),
      });
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  const updateSize = (id: string, field: string, value: string | number) => {
    setIsDirty(true);
    setSizes(prev =>
      prev.map(s => {
        if (s.id !== id) return s;
        if (field === 'name') {
          return { ...s, name: String(value) };
        }
        const cleanNumber = Math.max(0, Number(value) || 0);
        if (field === 'ratio') {
          return { ...s, ratio: cleanNumber };
        }
        return { ...s, data: { ...s.data, [field]: cleanNumber } };
      })
    );
  };

  const removeSize = (id: string) => {
    setIsDirty(true);
    setSizes(prev => prev.filter(s => s.id !== id));
  };

  const addSize = () => {
    if (!currentPreset) return;
    const emptyData: Record<string, number> = {};
    currentPreset.headers.forEach(h => {
      emptyData[h.key] = 0;
    });
    setIsDirty(true);
    setSizes(prev => [
      ...prev,
      { id: `${currentPreset.key}-new-${rowSeqRef.current++}`, name: '', ratio: 1, data: emptyData },
    ]);
  };

  // Urutkan & cocokkan item dari tab Prediksi Produksi terhadap model yang sedang dipilih
  const sortedForecastOptions = useMemo(() => {
    const items = forecastItems.filter(it => {
      const upper = (it.uniformName || '').toUpperCase();
      return !['BUKU', 'AGENDA', 'KERTAS', 'MAP'].some(tok => upper.includes(tok));
    });

    return items
      .map(item => ({
        key: getForecastItemKey(item),
        item,
        score: currentPreset ? scorePresetToForecastMatch(currentPreset, selectedLevel, item) : 0,
      }))
      .sort(
        (a, b) =>
          b.score - a.score ||
          b.item.total - a.item.total ||
          a.item.uniformName.localeCompare(b.item.uniformName, 'id')
      );
  }, [forecastItems, currentPreset, selectedLevel]);

  const matchedForecastItem = useMemo<ForecastItem | null>(() => {
    if (manualForecastKey) {
      const manualMatch = forecastItems.find(it => getForecastItemKey(it) === manualForecastKey);
      if (manualMatch) return manualMatch;
    }
    if (sortedForecastOptions.length > 0 && sortedForecastOptions[0].score >= 20) {
      return sortedForecastOptions[0].item;
    }
    return null;
  }, [manualForecastKey, forecastItems, sortedForecastOptions]);

  // Logic Perhitungan (terintegrasi proporsi % Prediksi Produksi per Tahun Ajaran)
  const calculation = useMemo(() => {
    const totalYards = fabricTotals.totalYards;
    const widthFactor = (fabricWidth > 0 ? fabricWidth : 150) / 150;
    const grossLengthCm = totalYards * 91.44 * widthFactor;
    const netLengthCm = grossLengthCm * (1 - defectTolerance / 100);

    if (!currentPreset) {
      return {
        grossLengthCm,
        netLengthCm,
        lengthPerSet: 0,
        totalRatioParts: 0,
        maxSets: 0,
        avgUsageCm: 0,
        modeUsed: 'manual' as 'forecast' | 'manual',
        fallbackReason: '',
        unmatchedForecastSizes: [] as UnmatchedForecastSize[],
        results: [] as CalcSizeResult[],
        usedLengthCm: 0,
        remainingLengthCm: netLengthCm,
        totalPcs: 0,
      };
    }

    const sizesWithUsage = sizes.map(size => {
      let usageCm = 0;
      const seamAllowance = 15;
      const { data } = size;
      const type = currentPreset.type;

      if (type === 'kemeja') {
        usageCm = (data.panjangBaju || 0) + (data.panjangLengan || 0) + seamAllowance;
      } else if (type === 'rompi') {
        usageCm = (data.panjangBaju || 0) + seamAllowance;
      } else if (type === 'celana') {
        usageCm = (data.panjangCelana || 0) + seamAllowance + 5;
      } else if (type === 'rok') {
        usageCm = (data.panjangRok || 0) + seamAllowance;
      }

      return { ...size, usageCm };
    });

    let modeUsed: 'forecast' | 'manual' = 'manual';
    let fallbackReason = '';
    let unmatchedForecastSizes: UnmatchedForecastSize[] = [];
    let results: CalcSizeResult[] = [];
    let usedLengthCm = 0;
    let totalPcs = 0;
    let maxSets = 0;
    let lengthPerSet = 0;
    let totalRatioParts = 0;
    let avgUsageCm = 0;

    if (calcMode === 'forecast') {
      if (!matchedForecastItem) {
        fallbackReason =
          forecastItems.length === 0
            ? `Belum ada data Prediksi Produksi tersimpan untuk TA ${forecastAcademicYear}. Menggunakan Rasio Manual Size Chart.`
            : `Belum ada item Prediksi Produksi TA ${forecastAcademicYear} yang cocok/dipilih. Menggunakan Rasio Manual Size Chart.`;
      } else {
        const seenNormalizedNames = new Set<string>();
        const matchedEntries = sizesWithUsage.map(s => {
          const normName = normalizeSizeKey(s.name);
          const isDuplicate = !normName || seenNormalizedNames.has(normName);
          if (normName && !isDuplicate) seenNormalizedNames.add(normName);

          const fcQty = isDuplicate ? 0 : getForecastQtyForSize(matchedForecastItem.sizes, s.name);
          return {
            size: s,
            fcQty,
            isActive: s.usageCm > 0 && fcQty > 0,
          };
        });

        const chartSizeNames = new Set(
          sizesWithUsage.map(s => normalizeSizeKey(s.name)).filter(Boolean)
        );
        unmatchedForecastSizes = Object.entries(matchedForecastItem.sizes)
          .filter(([szName, qty]) => {
            const num = Number(qty) || 0;
            if (num <= 0) return false;
            const cleanSz = normalizeSizeKey(szName);
            if (chartSizeNames.has(cleanSz)) return false;
            const aliases = SIZE_ALIASES[cleanSz] || [];
            return !aliases.some(a => chartSizeNames.has(a));
          })
          .map(([szName, qty]) => {
            const num = Number(qty) || 0;
            return {
              name: szName,
              qty: num,
              pct: matchedForecastItem.total > 0 ? (num / matchedForecastItem.total) * 100 : 0,
            };
          });

        const matchedQtySum = matchedEntries.reduce(
          (sum, e) => (e.isActive ? sum + e.fcQty : sum),
          0
        );

        if (matchedQtySum <= 0) {
          fallbackReason = `Nama ukuran di [${matchedForecastItem.level}] ${matchedForecastItem.uniformName} belum cocok dengan kolom Size pada Size Chart. Menggunakan Rasio Manual.`;
        } else {
          modeUsed = 'forecast';
          const weightedItems = matchedEntries.map(e => ({
            ...e,
            weight: e.isActive ? e.fcQty / matchedQtySum : 0,
          }));

          avgUsageCm = weightedItems.reduce(
            (sum, e) => (e.isActive ? sum + e.weight * e.size.usageCm : sum),
            0
          );

          const allocatedQtys = weightedItems.map(() => 0);

          if (avgUsageCm > 0 && netLengthCm > 0) {
            const theoreticalTotal = netLengthCm / avgUsageCm;

            weightedItems.forEach((item, idx) => {
              if (!item.isActive) return;
              allocatedQtys[idx] = Math.floor(theoreticalTotal * item.weight);
            });

            usedLengthCm = weightedItems.reduce(
              (sum, item, idx) => sum + allocatedQtys[idx] * item.size.usageCm,
              0
            );

            while (usedLengthCm > netLengthCm + 1e-6) {
              let trimIdx = -1;
              let smallestFrac = Infinity;
              weightedItems.forEach((item, idx) => {
                if (!item.isActive || allocatedQtys[idx] <= 0) return;
                const frac = theoreticalTotal * item.weight - allocatedQtys[idx];
                if (frac < smallestFrac) {
                  smallestFrac = frac;
                  trimIdx = idx;
                }
              });
              if (trimIdx === -1) break;
              allocatedQtys[trimIdx] -= 1;
              usedLengthCm -= weightedItems[trimIdx].size.usageCm;
            }

            const remainderOrder = weightedItems
              .map((item, idx) => ({
                idx,
                frac: item.isActive ? theoreticalTotal * item.weight - allocatedQtys[idx] : -1,
                weight: item.weight,
              }))
              .filter(r => r.frac >= 0)
              .sort((a, b) => b.frac - a.frac || b.weight - a.weight || a.idx - b.idx);

            for (const entry of remainderOrder) {
              const need = weightedItems[entry.idx].size.usageCm;
              if (usedLengthCm + need <= netLengthCm + 1e-6) {
                allocatedQtys[entry.idx] += 1;
                usedLengthCm += need;
              }
            }
          }

          totalPcs = allocatedQtys.reduce((a, b) => a + b, 0);
          usedLengthCm = weightedItems.reduce(
            (sum, item, idx) => sum + allocatedQtys[idx] * item.size.usageCm,
            0
          );

          results = weightedItems.map((item, idx) => {
            const qty = allocatedQtys[idx];
            return {
              name: item.size.name,
              qty,
              ratio: item.size.ratio,
              forecastPct: item.isActive ? item.weight * 100 : 0,
              actualPct: totalPcs > 0 ? (qty / totalPcs) * 100 : 0,
              usageCm: item.size.usageCm,
              totalUsageCm: qty * item.size.usageCm,
            };
          });
        }
      }
    }

    if (modeUsed === 'manual') {
      lengthPerSet = sizesWithUsage.reduce((acc, curr) => acc + curr.usageCm * curr.ratio, 0);
      totalRatioParts = sizesWithUsage.reduce((acc, curr) => acc + curr.ratio, 0);
      avgUsageCm = totalRatioParts > 0 ? lengthPerSet / totalRatioParts : 0;

      if (lengthPerSet > 0) {
        maxSets = Math.floor(netLengthCm / lengthPerSet);
        totalPcs = maxSets * totalRatioParts;
        usedLengthCm = maxSets * lengthPerSet;

        results = sizesWithUsage.map(s => {
          const qty = maxSets * s.ratio;
          return {
            name: s.name,
            qty,
            ratio: s.ratio,
            forecastPct: null,
            actualPct: totalPcs > 0 ? (qty / totalPcs) * 100 : 0,
            usageCm: s.usageCm,
            totalUsageCm: qty * s.usageCm,
          };
        });
      }
    }

    const remainingLengthCm = Math.max(0, netLengthCm - usedLengthCm);

    return {
      grossLengthCm,
      netLengthCm,
      lengthPerSet,
      totalRatioParts,
      maxSets,
      avgUsageCm,
      modeUsed,
      fallbackReason,
      unmatchedForecastSizes,
      results,
      usedLengthCm,
      remainingLengthCm,
      totalPcs,
    };
  }, [
    fabricTotals,
    fabricWidth,
    defectTolerance,
    currentPreset,
    sizes,
    calcMode,
    matchedForecastItem,
    forecastItems.length,
    forecastAcademicYear,
  ]);

  // Engine porsi alokasi vendor sesuai rumus tab Prediksi Produksi pada Tahun Ajaran terpilih
  const vendorSummary = useMemo(() => {
    const targetLevel = matchedForecastItem
      ? normalizeLevel(matchedForecastItem.level)
      : currentPreset
        ? selectedLevel !== 'SEMUA'
          ? selectedLevel
          : normalizeLevel(currentPreset.levels[0] || 'SD')
        : '';

    const targetUniformName = matchedForecastItem
      ? matchedForecastItem.uniformName
      : currentPreset
        ? PRESET_UNIFORM_HINTS[currentPreset.key] || currentPreset.label
        : '';

    const widthFactor = (fabricWidth > 0 ? fabricWidth : 150) / 150;
    const netCmPerRoll = yardsPerRoll * 91.44 * widthFactor * (1 - defectTolerance / 100);
    const totalNeededRolls =
      matchedForecastItem && calculation.avgUsageCm > 0 && netCmPerRoll > 0
        ? (matchedForecastItem.total * calculation.avgUsageCm) / netCmPerRoll
        : 0;

    if (!targetLevel || !targetUniformName || plottings.length === 0) {
      return {
        targetLevel,
        targetUniformName,
        totalSchoolsForItem: 0,
        totalNeededRolls,
        vendors: [] as VendorCalcDistribution[],
      };
    }

    const effectivePlottings = plottings
      .filter(p => resolveAcademicYear(p.academic_year) === forecastAcademicYear)
      .map(p => {
        let sName = p.app_users?.school_name || '';
        let sEmail = p.app_users?.username || '';
        let sLvl = p.app_users?.school_level || '';
        const sch = schools.find(s => s.id === p.school_user_id);
        if (sch) {
          if (!sName) sName = sch.school_name;
          if (!sEmail) sEmail = sch.email || '';
          if (!sLvl) sLvl = sch.level || '';
        }
        const resolvedLvl = resolveKainSchoolLevel(sName, sEmail, sLvl);
        return {
          ...p,
          resolvedSchoolName: sName,
          resolvedSchoolLevel: normalizeLevel(resolvedLvl),
        };
      });

    const upperUniform = targetUniformName.toUpperCase();
    const isBookItem =
      upperUniform.includes('BUKU') ||
      upperUniform.includes('AGENDA') ||
      upperUniform.includes('KERTAS') ||
      upperUniform.includes('MAP');

    const matchedPlottings = effectivePlottings.filter(p => {
      if (p.resolvedSchoolLevel !== normalizeLevel(targetLevel)) return false;
      const plottedTypes = splitClothingTypes(p.clothing_type);
      return plottedTypes.some(pt => {
        if (pt === 'Semua Jenis Baju') return !isBookItem;
        return isClothingTypeMatch(targetUniformName, pt);
      });
    });

    const schoolsByVendor = new Map<string, Set<string>>();
    matchedPlottings.forEach(p => {
      if (!schoolsByVendor.has(p.vendor_id)) schoolsByVendor.set(p.vendor_id, new Set());
      schoolsByVendor.get(p.vendor_id)!.add(p.school_user_id);
    });

    const activeVendors = Array.from(schoolsByVendor.entries())
      .filter(([, sSet]) => sSet.size > 0)
      .map(([vendorId, sSet]) => ({ vendorId, schoolCount: sSet.size }));

    const totalSchoolsForItem = activeVendors.reduce((sum, av) => sum + av.schoolCount, 0);
    if (totalSchoolsForItem === 0) {
      return {
        targetLevel,
        targetUniformName,
        totalSchoolsForItem: 0,
        totalNeededRolls,
        vendors: [] as VendorCalcDistribution[],
      };
    }

    let maxVendorId = activeVendors[0].vendorId;
    let maxVendorCount = -1;
    activeVendors.forEach(av => {
      if (av.schoolCount > maxVendorCount) {
        maxVendorCount = av.schoolCount;
        maxVendorId = av.vendorId;
      }
    });

    // Bagi hasil potong kain saat ini ke vendor sesuai % porsi plotting (sama dg Prediksi Produksi)
    const calcSizesByVendor = new Map<string, Record<string, number>>();
    activeVendors.forEach(av => calcSizesByVendor.set(av.vendorId, {}));

    calculation.results.forEach(res => {
      if (res.qty <= 0 || !res.name) return;
      let allocatedSum = 0;
      activeVendors.forEach(av => {
        const ratio = av.schoolCount / totalSchoolsForItem;
        const vQty = Math.round(res.qty * ratio);
        calcSizesByVendor.get(av.vendorId)![res.name] =
          (calcSizesByVendor.get(av.vendorId)![res.name] || 0) + vQty;
        allocatedSum += vQty;
      });
      const diff = res.qty - allocatedSum;
      if (diff !== 0 && maxVendorId) {
        calcSizesByVendor.get(maxVendorId)![res.name] =
          (calcSizesByVendor.get(maxVendorId)![res.name] || 0) + diff;
      }
    });

    // Hitung target SPK vendor dari Prediksi Produksi (prioritaskan schoolBreakdown jika tersedia)
    const spkSizesByVendor = new Map<string, Record<string, number>>();
    activeVendors.forEach(av => spkSizesByVendor.set(av.vendorId, {}));

    if (matchedForecastItem) {
      let matchedBySchool = false;
      const bd = matchedForecastItem.schoolBreakdown;
      if (bd && Object.keys(bd).length > 0) {
        Object.entries(bd).forEach(([schoolName, schoolSizes]) => {
          const targetPlot = matchedPlottings.find(p =>
            isSchoolBreakdownMatch(schoolName, p.resolvedSchoolName)
          );
          if (targetPlot) {
            matchedBySchool = true;
            const vMap = spkSizesByVendor.get(targetPlot.vendor_id);
            if (vMap) {
              Object.entries(schoolSizes).forEach(([sz, qty]) => {
                vMap[sz] = (vMap[sz] || 0) + (Number(qty) || 0);
              });
            }
          }
        });
      }

      if (!matchedBySchool) {
        Object.entries(matchedForecastItem.sizes).forEach(([sz, totalSzQty]) => {
          const cleanQty = Number(totalSzQty) || 0;
          if (cleanQty <= 0) return;
          let allocatedSum = 0;
          activeVendors.forEach(av => {
            const ratio = av.schoolCount / totalSchoolsForItem;
            const qty = Math.round(cleanQty * ratio);
            spkSizesByVendor.get(av.vendorId)![sz] = qty;
            allocatedSum += qty;
          });
          const diff = cleanQty - allocatedSum;
          if (diff !== 0 && maxVendorId) {
            spkSizesByVendor.get(maxVendorId)![sz] =
              (spkSizesByVendor.get(maxVendorId)![sz] || 0) + diff;
          }
        });
      }
    }

    const distributions: VendorCalcDistribution[] = activeVendors.map(av => {
      const vMeta = vendors.find(v => v.id === av.vendorId);
      const plotMeta = matchedPlottings.find(p => p.vendor_id === av.vendorId);
      const shareRatio = av.schoolCount / totalSchoolsForItem;
      const sharePercentage = Math.round(shareRatio * 1000) / 10;
      const calcSizes = calcSizesByVendor.get(av.vendorId) || {};
      const calcTotalPcs = Object.values(calcSizes).reduce((sum, q) => sum + q, 0);
      const spkSizes = spkSizesByVendor.get(av.vendorId) || {};
      const spkTotalPcs = Object.values(spkSizes).reduce((sum, q) => sum + q, 0);
      const neededRolls =
        spkTotalPcs > 0 && calculation.avgUsageCm > 0 && netCmPerRoll > 0
          ? (spkTotalPcs * calculation.avgUsageCm) / netCmPerRoll
          : 0;

      return {
        vendorId: av.vendorId,
        vendorName: vMeta?.name || plotMeta?.vendors?.name || 'Vendor',
        contactPerson: vMeta?.contact_person || plotMeta?.vendors?.contact_person || '-',
        phone: vMeta?.phone || plotMeta?.vendors?.phone || '-',
        schoolCount: av.schoolCount,
        totalSchoolsInLevel: totalSchoolsForItem,
        sharePercentage,
        shareRatio,
        allocRolls: totalRolls * shareRatio,
        allocNetMeters: (calculation.netLengthCm / 100) * shareRatio,
        calcTotalPcs,
        calcSizes,
        spkTotalPcs,
        spkSizes,
        neededRolls,
      };
    });

    distributions.sort(
      (a, b) =>
        b.sharePercentage - a.sharePercentage ||
        a.vendorName.localeCompare(b.vendorName, 'id', { numeric: true, sensitivity: 'base' })
    );

    return {
      targetLevel,
      targetUniformName,
      totalSchoolsForItem,
      totalNeededRolls,
      vendors: distributions,
    };
  }, [
    matchedForecastItem,
    currentPreset,
    selectedLevel,
    yardsPerRoll,
    fabricWidth,
    defectTolerance,
    calculation.avgUsageCm,
    calculation.results,
    calculation.netLengthCm,
    plottings,
    forecastAcademicYear,
    schools,
    vendors,
    totalRolls,
  ]);

  const activeSimulasiVendorId = useMemo(() => {
    if (selectedVendorFilter && selectedVendorFilter !== 'ALL') {
      return selectedVendorFilter;
    }
    return vendorSummary.vendors.length > 0 ? vendorSummary.vendors[0].vendorId : '';
  }, [selectedVendorFilter, vendorSummary.vendors]);

  const handleApplyForecastRatiosToTable = () => {
    if (readOnly || !matchedForecastItem) return;
    const roundedWeights = sizes.map(s => {
      const fcQty = getForecastQtyForSize(matchedForecastItem.sizes, s.name);
      if (fcQty <= 0 || matchedForecastItem.total <= 0) return 0;
      return Math.max(1, Math.round((fcQty / matchedForecastItem.total) * 100));
    });
    const positiveVals = roundedWeights.filter(v => v > 0);
    if (positiveVals.length === 0) return;

    const commonDivisor = positiveVals.reduce((acc, v) => gcdTwo(acc, v), positiveVals[0]);
    setIsDirty(true);
    setSizes(prev =>
      prev.map((row, idx) => ({
        ...row,
        ratio: roundedWeights[idx] > 0 ? Math.max(1, Math.round(roundedWeights[idx] / commonDivisor)) : 0,
      }))
    );
    setFeedback({
      type: 'success',
      text: `Proporsi persentase dari [${matchedForecastItem.level}] ${matchedForecastItem.uniformName} (TA ${forecastAcademicYear}) disalin ke kolom Rasio tabel.`,
    });
  };

  // Fetch data mutasi kain dari Supabase
  const loadFabricMutations = async () => {
    try {
      const { data, error } = await supabase
        .from('vendor_fabric_mutations')
        .select('*, vendors(name)')
        .order('date', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching vendor_fabric_mutations:', error);
      } else if (data) {
        setFabricMutations(data as VendorFabricMutation[]);
      }
    } catch (err) {
      console.error('Failed to load fabric mutations:', err);
    } finally {
      setFabricMutationsLoading(false);
    }
  };

  useEffect(() => {
    let active = true;

    const loadInitial = async () => {
      try {
        const { data, error } = await supabase
          .from('vendor_fabric_mutations')
          .select('*, vendors(name)')
          .order('date', { ascending: false })
          .order('created_at', { ascending: false });

        if (!active) return;
        if (error) {
          console.error('Error fetching vendor_fabric_mutations:', error);
        } else if (data) {
          setFabricMutations(data as VendorFabricMutation[]);
        }
      } catch (err) {
        console.error('Failed to load fabric mutations on mount:', err);
      } finally {
        if (active) setFabricMutationsLoading(false);
      }
    };

    loadInitial();
    return () => {
      active = false;
    };
  }, []);

  const openInboundFromCalculator = () => {
    if (!activeSimulasiVendorId) {
      setFeedback({
        type: 'error',
        text: 'Pilih Target Vendor terlebih dahulu di panel kanan sebelum mencatat kirim kain.',
      });
      return;
    }
    setInboundVendorId(activeSimulasiVendorId);
    setInboundAcademicYear(forecastAcademicYear);

    // Tebak jenis kain dari preset model
    let suggestedFabric = STANDARD_FABRIC_TYPES[0];
    const pKey = selectedPresetKey.toLowerCase();
    if (pKey.includes('celana_smp') || pKey.includes('kulot_smp')) {
      suggestedFabric = 'Kain Famatex Biru (SMP)';
    } else if (pKey.includes('celana_sma')) {
      suggestedFabric = 'Kain Famatex Abu (SMA)';
    } else if (pKey.includes('celana_sd') || pKey.includes('rok_sd')) {
      suggestedFabric = 'Kain Merah (SD)';
    } else if (pKey.includes('rompi')) {
      suggestedFabric = pKey.includes('sd') ? 'Kain Kotak SD (Rompi/Rok/Celana)' : 'Kain Kotak SMP (Rompi)';
    } else if (pKey.includes('pramuka')) {
      suggestedFabric = pKey.includes('sd') ? 'Kain Pramuka Siaga (SD)' : 'Kain Pramuka Penggalang (SMP)';
    }
    setInboundFabricType(suggestedFabric);
    setInboundCustomFabricType('');
    setInboundSupplierName(fabricBatches[0]?.label || 'Supplier Kain');
    setInboundDocNo('');
    setInboundRolls(fabricTotals.totalRolls);
    setInboundLengthYards(Number(fabricTotals.totalYards.toFixed(2)));
    setInboundLengthMeters(Number(fabricTotals.totalMeters.toFixed(2)));
    setInboundNotes(
      `Kirim kain untuk SPK ${matchedForecastItem ? `[${matchedForecastItem.level}] ${matchedForecastItem.uniformName}` : currentPreset?.label || 'seragam'}`
    );
    setShowInboundModal(true);
  };

  const handleSaveInboundMutation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inboundVendorId) {
      alert('Pilih vendor penerima kain!');
      return;
    }
    const finalFabricType =
      inboundFabricType === 'Lainnya / Khusus'
        ? inboundCustomFabricType.trim() || 'Kain Khusus'
        : inboundFabricType;

    setInboundSaving(true);
    try {
      const payload = {
        academic_year: inboundAcademicYear,
        vendor_id: inboundVendorId,
        date: inboundDate,
        mutation_type: 'inbound',
        fabric_type: finalFabricType,
        supplier_name: inboundSupplierName.trim() || null,
        document_no: inboundDocNo.trim() || null,
        rolls: Number(inboundRolls) || 0,
        length_yards: Number(inboundLengthYards) || 0,
        length_meters: Number(inboundLengthMeters) || 0,
        garment_pcs: 0,
        system_expected_yards: 0,
        notes: inboundNotes.trim() || null,
      };

      const { data, error } = await supabase
        .from('vendor_fabric_mutations')
        .insert(payload)
        .select('*, vendors(name)')
        .single();

      if (error) throw error;

      if (data) {
        setFabricMutations(prev => [data as VendorFabricMutation, ...prev]);
      }
      setShowInboundModal(false);
      setFeedback({
        type: 'success',
        text: `Berhasil mencatat kiriman kain ${inboundLengthYards} Yard ke ${vendors.find(v => v.id === inboundVendorId)?.name || 'vendor'}!`,
      });
      setActiveKainSubTab('buku_kain');
      setBookAcademicYear(inboundAcademicYear);
      setBookVendorId(inboundVendorId);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(`Gagal menyimpan mutasi kain: ${msg}`);
    } finally {
      setInboundSaving(false);
    }
  };

  const handleSaveUsageMutation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!usageVendorId) {
      alert('Pilih vendor penjahit!');
      return;
    }

    setUsageSaving(true);
    try {
      const approxUsagePerPcsYards =
        calculation.avgUsageCm > 0 ? calculation.avgUsageCm / 91.44 : 1.25;
      const expectedYards =
        Number(usageGarmentPcs) > 0
          ? Number((Number(usageGarmentPcs) * approxUsagePerPcsYards).toFixed(2))
          : 0;

      const payload = {
        academic_year: usageAcademicYear,
        vendor_id: usageVendorId,
        date: usageDate,
        mutation_type: 'usage',
        fabric_type: usageFabricType,
        supplier_name: null,
        document_no: usageDocNo.trim() || null,
        rolls: 0,
        length_yards: Number(usageLengthYards) || 0,
        length_meters: Number(usageLengthMeters) || 0,
        garment_pcs: Number(usageGarmentPcs) || 0,
        system_expected_yards: expectedYards,
        notes:
          [
            usageNotes.trim(),
            usageClaimRemainingYards ? `Klaim sisa di vendor: ${usageClaimRemainingYards} yd` : '',
          ]
            .filter(Boolean)
            .join(' • ') || null,
      };

      const { data, error } = await supabase
        .from('vendor_fabric_mutations')
        .insert(payload)
        .select('*, vendors(name)')
        .single();

      if (error) throw error;

      if (data) {
        setFabricMutations(prev => [data as VendorFabricMutation, ...prev]);
      }
      setShowUsageModal(false);
      setFeedback({
        type: 'success',
        text: `Laporan setoran ${usageGarmentPcs} pcs dari ${vendors.find(v => v.id === usageVendorId)?.name || 'vendor'} berhasil dicatat!`,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(`Gagal menyimpan laporan setoran vendor: ${msg}`);
    } finally {
      setUsageSaving(false);
    }
  };

  const handleSaveInitialMutation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!initialVendorId) {
      alert('Pilih vendor!');
      return;
    }

    setInitialSaving(true);
    try {
      const payload = {
        academic_year: initialAcademicYear,
        vendor_id: initialVendorId,
        date: initialDate,
        mutation_type: initialType,
        fabric_type: initialFabricType,
        supplier_name: null,
        document_no: initialType === 'initial' ? 'SALDO AWAL' : 'OPNAME FISIK',
        rolls: Number(initialRolls) || 0,
        length_yards: Number(initialLengthYards) || 0,
        length_meters: Number(initialLengthMeters) || 0,
        garment_pcs: 0,
        system_expected_yards: 0,
        notes: initialNotes.trim() || null,
      };

      const { data, error } = await supabase
        .from('vendor_fabric_mutations')
        .insert(payload)
        .select('*, vendors(name)')
        .single();

      if (error) throw error;

      if (data) {
        setFabricMutations(prev => [data as VendorFabricMutation, ...prev]);
      }
      setShowInitialModal(false);
      setFeedback({
        type: 'success',
        text: `Saldo awal / penyesuaian kain berhasil dicatat!`,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(`Gagal menyimpan saldo awal: ${msg}`);
    } finally {
      setInitialSaving(false);
    }
  };

  const handleDeleteMutation = async (id: string) => {
    if (readOnly) return;
    if (
      !window.confirm(
        'Hapus transaksi mutasi kain ini? Saldo sisa kain akan dihitung ulang secara otomatis.'
      )
    ) {
      return;
    }
    try {
      const { error } = await supabase.from('vendor_fabric_mutations').delete().eq('id', id);
      if (error) throw error;
      setFabricMutations(prev => prev.filter(m => m.id !== id));
      setFeedback({ type: 'success', text: 'Transaksi mutasi kain berhasil dihapus.' });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(`Gagal menghapus mutasi kain: ${msg}`);
    }
  };

  // Perhitungan Saldo Sisa Kain per Vendor & Jenis Kain (Berkelanjutan Antar-TA)
  const fabricBalances = useMemo(() => {
    const allFiltered = fabricMutations.filter(m => {
      const matchVendor = bookVendorId === 'ALL' || m.vendor_id === bookVendorId;
      const matchFabric = bookFabricFilter === 'ALL' || m.fabric_type === bookFabricFilter;
      const matchSearch =
        !searchMutationQuery ||
        (m.fabric_type && m.fabric_type.toLowerCase().includes(searchMutationQuery.toLowerCase())) ||
        (m.supplier_name && m.supplier_name.toLowerCase().includes(searchMutationQuery.toLowerCase())) ||
        (m.document_no && m.document_no.toLowerCase().includes(searchMutationQuery.toLowerCase())) ||
        (m.notes && m.notes.toLowerCase().includes(searchMutationQuery.toLowerCase())) ||
        (m.vendors?.name && m.vendors.name.toLowerCase().includes(searchMutationQuery.toLowerCase()));
      return matchVendor && matchFabric && matchSearch;
    });

    const fabricTypeSet = new Set<string>();
    fabricMutations.forEach(m => {
      if (m.fabric_type) fabricTypeSet.add(m.fabric_type);
    });
    STANDARD_FABRIC_TYPES.forEach(t => {
      if (t !== 'Lainnya / Khusus') fabricTypeSet.add(t);
    });

    const targetYear = bookAcademicYear;

    const summaryByType: Record<
      string,
      {
        fabricType: string;
        prevCarryOverYards: number;
        inboundYards: number;
        inboundMeters: number;
        inboundRolls: number;
        usageYards: number;
        usageMeters: number;
        garmentPcs: number;
        systemExpectedYards: number;
        adjustmentYards: number;
        balanceYards: number;
        balanceMeters: number;
      }
    > = {};

    Array.from(fabricTypeSet).forEach(ft => {
      summaryByType[ft] = {
        fabricType: ft,
        prevCarryOverYards: 0,
        inboundYards: 0,
        inboundMeters: 0,
        inboundRolls: 0,
        usageYards: 0,
        usageMeters: 0,
        garmentPcs: 0,
        systemExpectedYards: 0,
        adjustmentYards: 0,
        balanceYards: 0,
        balanceMeters: 0,
      };
    });

    fabricMutations
      .filter(m => bookVendorId === 'ALL' || m.vendor_id === bookVendorId)
      .forEach(m => {
        const ft = m.fabric_type || 'Lainnya';
        if (!summaryByType[ft]) {
          summaryByType[ft] = {
            fabricType: ft,
            prevCarryOverYards: 0,
            inboundYards: 0,
            inboundMeters: 0,
            inboundRolls: 0,
            usageYards: 0,
            usageMeters: 0,
            garmentPcs: 0,
            systemExpectedYards: 0,
            adjustmentYards: 0,
            balanceYards: 0,
            balanceMeters: 0,
          };
        }

        const item = summaryByType[ft];
        const isPastYear = m.academic_year < targetYear;
        const isCurrentYear = m.academic_year === targetYear;

        if (isPastYear) {
          if (m.mutation_type === 'inbound' || m.mutation_type === 'initial') {
            item.prevCarryOverYards += Number(m.length_yards) || 0;
          } else if (m.mutation_type === 'usage') {
            item.prevCarryOverYards -= Number(m.length_yards) || 0;
          } else if (m.mutation_type === 'adjustment') {
            item.prevCarryOverYards += Number(m.length_yards) || 0;
          }
        } else if (isCurrentYear) {
          if (m.mutation_type === 'inbound') {
            item.inboundYards += Number(m.length_yards) || 0;
            item.inboundMeters += Number(m.length_meters) || 0;
            item.inboundRolls += Number(m.rolls) || 0;
          } else if (m.mutation_type === 'initial') {
            item.prevCarryOverYards += Number(m.length_yards) || 0;
          } else if (m.mutation_type === 'usage') {
            item.usageYards += Number(m.length_yards) || 0;
            item.usageMeters += Number(m.length_meters) || 0;
            item.garmentPcs += Number(m.garment_pcs) || 0;
            item.systemExpectedYards += Number(m.system_expected_yards) || 0;
          } else if (m.mutation_type === 'adjustment') {
            item.adjustmentYards += Number(m.length_yards) || 0;
          }
        }
      });

    Object.values(summaryByType).forEach(it => {
      it.balanceYards =
        it.prevCarryOverYards + it.inboundYards - it.usageYards + it.adjustmentYards;
      it.balanceMeters = it.balanceYards * 0.9144;
    });

    const activeSummaries = Object.values(summaryByType).filter(
      it =>
        it.balanceYards !== 0 ||
        it.inboundYards > 0 ||
        it.usageYards > 0 ||
        it.prevCarryOverYards !== 0 ||
        bookFabricFilter === it.fabricType
    );

    return {
      summaries: activeSummaries,
      currentYearMutations: allFiltered.filter(m => m.academic_year === targetYear),
    };
  }, [fabricMutations, bookAcademicYear, bookVendorId, bookFabricFilter, searchMutationQuery]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* SUB-NAVIGASI UTAMA KALKULATOR KAIN */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '12px',
          flexWrap: 'wrap',
          background: 'rgba(15, 23, 42, 0.6)',
          border: '1px solid rgba(71, 85, 105, 0.5)',
          borderRadius: '12px',
          padding: '10px 14px',
        }}
      >
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => setActiveKainSubTab('simulasi')}
            style={{
              padding: '8px 16px',
              borderRadius: '9px',
              border:
                activeKainSubTab === 'simulasi'
                  ? '1px solid #38bdf8'
                  : '1px solid rgba(100, 116, 139, 0.4)',
              background:
                activeKainSubTab === 'simulasi'
                  ? 'rgba(56, 189, 248, 0.22)'
                  : 'rgba(30, 41, 59, 0.6)',
              color: activeKainSubTab === 'simulasi' ? '#e0f2fe' : '#94a3b8',
              fontSize: '0.84rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '7px',
            }}
          >
            <span>🧮</span> Simulasi Hitung Kain
          </button>
          <button
            type="button"
            onClick={() => setActiveKainSubTab('buku_kain')}
            style={{
              padding: '8px 16px',
              borderRadius: '9px',
              border:
                activeKainSubTab === 'buku_kain'
                  ? '1px solid #10b981'
                  : '1px solid rgba(100, 116, 139, 0.4)',
              background:
                activeKainSubTab === 'buku_kain'
                  ? 'rgba(16, 185, 129, 0.22)'
                  : 'rgba(30, 41, 59, 0.6)',
              color: activeKainSubTab === 'buku_kain' ? '#d1fae5' : '#94a3b8',
              fontSize: '0.84rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '7px',
            }}
          >
            <span>📖</span> Buku Mutasi & Sisa Kain Vendor
            {fabricMutations.length > 0 && (
              <span
                style={{
                  fontSize: '0.68rem',
                  background: '#059669',
                  color: '#ffffff',
                  padding: '2px 7px',
                  borderRadius: '999px',
                  fontWeight: 800,
                }}
              >
                {fabricMutations.length}
              </span>
            )}
          </button>
        </div>

        {activeKainSubTab === 'simulasi' && activeSimulasiVendorId && (
          <button
            type="button"
            onClick={openInboundFromCalculator}
            style={{
              padding: '7px 13px',
              borderRadius: '8px',
              border: '1px solid #059669',
              background: 'rgba(5, 150, 105, 0.22)',
              color: '#6ee7b7',
              fontSize: '0.78rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
            title="Catat gulungan kain yang disimulasikan saat ini langsung ke Buku Mutasi Kain vendor terpilih"
          >
            <span>📥</span> Catat Kirim Kain ke Vendor ({fabricTotals.totalRolls} Roll)
          </button>
        )}
      </div>

      {feedback && (
        <div
          style={{
            padding: '10px 14px',
            borderRadius: '9px',
            fontSize: '0.82rem',
            fontWeight: 600,
            background:
              feedback.type === 'success' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
            border: feedback.type === 'success' ? '1px solid #10b981' : '1px solid #ef4444',
            color: feedback.type === 'success' ? '#6ee7b7' : '#fca5a5',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>{feedback.text}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            style={{
              background: 'none',
              border: 'none',
              color: 'inherit',
              cursor: 'pointer',
              fontSize: '1rem',
            }}
          >
            &times;
          </button>
        </div>
      )}

      {/* TAMPILAN 1: SIMULASI HITUNG KAIN */}
      {activeKainSubTab === 'simulasi' && (
        <div className="kain-calculator">
      {/* SECTION 1: DATA GULUNGAN KAIN (MULTI-SUPPLIER & ROLL VARIATIF) */}
      <div className="kain-card">
        <div className="kain-card-header kain-card-header--split">
          <div>
            <h3 className="kain-card-title">
              <span>📏</span> 1. Data Gulungan Kain
            </h3>
            <p className="kain-card-subtitle">
              Input gulungan kain dari berbagai supplier. Panjang yard/meter dapat berbeda per kelompok roll.
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                fontSize: '0.78rem',
                padding: '4px 10px',
                borderRadius: '6px',
                background: 'rgba(56, 189, 248, 0.14)',
                border: '1px solid rgba(56, 189, 248, 0.35)',
                color: '#7dd3fc',
                fontWeight: 600,
              }}
            >
              Total: {fabricTotals.totalRolls} Roll &bull; {fabricTotals.totalYards.toFixed(1)} Yard ({fabricTotals.totalMeters.toFixed(1)} m)
            </span>
          </div>
        </div>

        {/* TABEL BATCH SUPPLIER */}
        <div style={{ overflowX: 'auto', marginBottom: '14px' }}>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: '0.82rem',
              textAlign: 'left',
            }}
          >
            <thead>
              <tr style={{ background: 'rgba(15, 23, 42, 0.75)', color: '#94a3b8', borderBottom: '1px solid rgba(71, 85, 105, 0.6)' }}>
                <th style={{ padding: '8px 10px', fontWeight: 600 }}>No / Asal Supplier</th>
                <th style={{ padding: '8px 10px', fontWeight: 600, width: '130px' }}>Jml Gulungan</th>
                <th style={{ padding: '8px 10px', fontWeight: 600, width: '150px' }}>Panjang per Roll</th>
                <th style={{ padding: '8px 10px', fontWeight: 600, width: '110px' }}>Satuan</th>
                <th style={{ padding: '8px 10px', fontWeight: 600, width: '170px' }}>Subtotal</th>
                {!readOnly && (
                  <th style={{ padding: '8px 10px', fontWeight: 600, width: '50px', textAlign: 'center' }}>
                    ✕
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {fabricBatches.map((batch, idx) => {
                const subYards =
                  batch.unit === 'meter'
                    ? (batch.rolls * batch.lengthPerRoll) / 0.9144
                    : batch.rolls * batch.lengthPerRoll;
                const subMeters = subYards * 0.9144;

                return (
                  <tr
                    key={batch.id}
                    style={{
                      borderBottom: '1px solid rgba(51, 65, 85, 0.45)',
                      background: idx % 2 === 0 ? 'rgba(30, 41, 59, 0.25)' : 'transparent',
                    }}
                  >
                    <td style={{ padding: '8px 10px' }}>
                      <input
                        type="text"
                        disabled={readOnly}
                        value={batch.label}
                        onChange={e => handleUpdateFabricBatch(batch.id, { label: e.target.value })}
                        placeholder={`Supplier Kain ${String.fromCharCode(65 + idx)}`}
                        style={{
                          width: '100%',
                          background: 'rgba(15, 23, 42, 0.6)',
                          border: '1px solid rgba(71, 85, 105, 0.5)',
                          borderRadius: '6px',
                          color: '#f8fafc',
                          padding: '6px 8px',
                          fontSize: '0.8rem',
                        }}
                      />
                    </td>
                    <td style={{ padding: '8px 10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <input
                          type="number"
                          min={0}
                          disabled={readOnly}
                          value={batch.rolls === 0 ? '' : batch.rolls}
                          onFocus={e => e.target.select()}
                          onChange={e =>
                            handleUpdateFabricBatch(batch.id, {
                              rolls: Math.max(0, Number(e.target.value) || 0),
                            })
                          }
                          style={{
                            width: '75px',
                            background: 'rgba(15, 23, 42, 0.6)',
                            border: '1px solid rgba(71, 85, 105, 0.5)',
                            borderRadius: '6px',
                            color: '#f8fafc',
                            padding: '6px 8px',
                            fontSize: '0.8rem',
                            textAlign: 'right',
                          }}
                        />
                        <span style={{ fontSize: '0.74rem', color: '#94a3b8' }}>Roll</span>
                      </div>
                    </td>
                    <td style={{ padding: '8px 10px' }}>
                      <input
                        type="number"
                        min={0}
                        step="any"
                        disabled={readOnly}
                        value={batch.lengthPerRoll === 0 ? '' : batch.lengthPerRoll}
                        onFocus={e => e.target.select()}
                        onChange={e =>
                          handleUpdateFabricBatch(batch.id, {
                            lengthPerRoll: Math.max(0, Number(e.target.value) || 0),
                          })
                        }
                        style={{
                          width: '90px',
                          background: 'rgba(15, 23, 42, 0.6)',
                          border: '1px solid rgba(71, 85, 105, 0.5)',
                          borderRadius: '6px',
                          color: '#f8fafc',
                          padding: '6px 8px',
                          fontSize: '0.8rem',
                          textAlign: 'right',
                        }}
                      />
                    </td>
                    <td style={{ padding: '8px 10px' }}>
                      <select
                        disabled={readOnly}
                        value={batch.unit}
                        onChange={e =>
                          handleUpdateFabricBatch(batch.id, {
                            unit: e.target.value as 'yard' | 'meter',
                          })
                        }
                        style={{
                          background: '#f8fafc',
                          color: '#0f172a',
                          border: '1px solid #475569',
                          borderRadius: '6px',
                          padding: '5px 8px',
                          fontSize: '0.78rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        <option value="yard" style={{ background: '#ffffff', color: '#0f172a' }}>
                          Yard
                        </option>
                        <option value="meter" style={{ background: '#ffffff', color: '#0f172a' }}>
                          Meter
                        </option>
                      </select>
                    </td>
                    <td style={{ padding: '8px 10px', color: '#e2e8f0', fontSize: '0.78rem' }}>
                      <strong>{subYards.toFixed(1)}</strong> Yard{' '}
                      <span style={{ color: '#94a3b8' }}>({subMeters.toFixed(1)} m)</span>
                    </td>
                    {!readOnly && (
                      <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                        {fabricBatches.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveFabricBatch(batch.id)}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: '#ef4444',
                              cursor: 'pointer',
                              fontSize: '0.88rem',
                              padding: '2px 6px',
                            }}
                            title="Hapus baris gulungan ini"
                          >
                            ✕
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* TOMBOL TAMBAH BARIS BATCH */}
        {!readOnly && (
          <div style={{ marginBottom: '14px' }}>
            <button
              type="button"
              onClick={handleAddFabricBatch}
              style={{
                background: 'rgba(56, 189, 248, 0.12)',
                border: '1px dashed rgba(56, 189, 248, 0.45)',
                color: '#38bdf8',
                padding: '6px 14px',
                borderRadius: '8px',
                fontSize: '0.78rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <span>+</span> Tambah Baris Gulungan (Beda Supplier / Panjang)
            </button>
          </div>
        )}

        {/* SETTING GLOBAL KAIN: LEBAR KAIN & TOLERANSI CACAT */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '12px',
            paddingTop: '12px',
            borderTop: '1px solid rgba(71, 85, 105, 0.4)',
          }}
        >
          <div className="kain-field">
            <label htmlFor="kain-fabric-width">Lebar Kain (cm)</label>
            <div className={`kain-input-group ${readOnly ? 'is-disabled' : ''}`}>
              <input
                id="kain-fabric-width"
                type="number"
                min={50}
                max={300}
                disabled={readOnly}
                value={fabricWidth === 0 ? '' : fabricWidth}
                onFocus={e => e.target.select()}
                onChange={e => setFabricWidth(Math.max(50, Number(e.target.value) || 150))}
                className="kain-field-input"
              />
              <span className="kain-input-unit">cm</span>
            </div>
            <span className="kain-field-hint">*Standar bidang 150cm (skala luas bidang otomatis dihitung)</span>
          </div>

          <div className="kain-field">
            <label htmlFor="kain-defect-tolerance">Toleransi Cacat (%)</label>
            <div className={`kain-input-group ${readOnly ? 'is-disabled' : ''}`}>
              <input
                id="kain-defect-tolerance"
                type="number"
                min={0}
                max={100}
                disabled={readOnly}
                className="kain-field-input"
                value={defectTolerance}
                onFocus={e => e.target.select()}
                onChange={e => setDefectTolerance(Math.min(100, Math.max(0, Number(e.target.value) || 0)))}
              />
              <span className="kain-input-unit">%</span>
            </div>
            <span className="kain-field-hint">*Potongan kain susut/rusak sebelum dijahit</span>
          </div>
        </div>
      </div>

      {/* SECTION 2 & 3: DATA MODEL & HASIL VENDOR */}
      <div className="kain-workspace">
        {/* KOLOM KIRI: DATA MODEL */}
        <div className="kain-card">
          <div className="kain-card-header kain-card-header--split">
            <h3 className="kain-card-title">
              <span>👕</span> 2. Data Model &amp; Size Chart
            </h3>
            {!readOnly && currentPreset && (
              <div className="kain-card-actions">
                {currentPreset.isCustom ? (
                  <button
                    type="button"
                    onClick={handleDeleteCustomItem}
                    disabled={isSaving}
                    className="kain-btn-delete-item"
                  >
                    🗑️ Hapus Item
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={resetPresetToDefault}
                    disabled={isSaving}
                    className="kain-btn-reset"
                  >
                    ↺ Reset
                  </button>
                )}
                <button
                  type="button"
                  onClick={savePresetToSupabase}
                  disabled={isSaving}
                  className="kain-btn-save"
                >
                  {isSaving ? 'Menyimpan...' : '💾 Simpan Perubahan'}
                </button>
              </div>
            )}
          </div>

          {feedback && (
            <div className={`kain-feedback-banner ${feedback.type === 'success' ? 'is-success' : 'is-error'}`}>
              <span>{feedback.text}</span>
              <button
                type="button"
                className="kain-feedback-close"
                aria-label="Tutup notifikasi"
                onClick={() => setFeedback(null)}
              >
                ✕
              </button>
            </div>
          )}

          {/* Klasifikasi Jenjang */}
          <div className="kain-level-filter">
            <span className="kain-level-filter-label">Klasifikasi Jenjang</span>
            <div className="kain-level-pills">
              {JENJANG_FILTER_LIST.map(lvl => (
                <button
                  key={lvl.value}
                  type="button"
                  onClick={() => handleLevelChange(lvl.value)}
                  className={`kain-level-pill ${selectedLevel === lvl.value ? 'is-active' : ''}`}
                >
                  <span>{lvl.label}</span>
                  <span className="kain-level-count">{levelCounts[lvl.value]}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="kain-field kain-preset-field">
            <label htmlFor="kain-preset-select">
              Pilih Data Model &amp; Size Chart ({filteredPresets.length} model tersedia)
            </label>
            <div className="kain-model-selector-row">
              <select
                id="kain-preset-select"
                className="kain-select"
                value={currentPreset?.key || ''}
                disabled={filteredPresets.length === 0}
                onChange={(e) => handlePresetChange(e.target.value)}
              >
                {filteredPresets.length === 0 ? (
                  <option value="">Belum ada item untuk jenjang {selectedLevel}</option>
                ) : (
                  groupedOptions.map(group => (
                    <optgroup key={group.label} label={group.label}>
                      {group.items.map(p => (
                        <option key={p.key} value={p.key}>
                          {p.label}{p.isCustom ? ' ★' : ''}
                        </option>
                      ))}
                    </optgroup>
                  ))
                )}
              </select>
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => openAddItemModal()}
                  className="kain-btn-add-item"
                >
                  + Tambah Item
                </button>
              )}
            </div>

            {currentPreset && (
              <div className="kain-model-badges">
                {currentPreset.levels.map(lvl => (
                  <span key={lvl} className="kain-badge kain-badge--level">
                    {lvl}
                  </span>
                ))}
                <span className="kain-badge kain-badge--type">
                  Potongan: {GARMENT_TYPE_META[currentPreset.type].label}
                </span>
                {currentPreset.isCustom && (
                  <span className="kain-badge kain-badge--custom">Item Tambahan</span>
                )}
                {isDirty && !readOnly && (
                  <span className="kain-badge kain-badge--dirty">● Belum disimpan</span>
                )}
              </div>
            )}
          </div>

          {!currentPreset ? (
            <div className="kain-empty-level">
              <p>
                Belum ada daftar model seragam untuk jenjang <strong>{selectedLevel}</strong>.
              </p>
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => openAddItemModal(selectedLevel === 'SEMUA' ? 'SD' : selectedLevel)}
                  className="kain-btn-save"
                >
                  + Tambah Item Jenjang {selectedLevel}
                </button>
              )}
            </div>
          ) : (
            <div className="kain-table-box">
              <div className="kain-table-scroll">
                <table className="kain-size-table">
                  <thead>
                    <tr>
                      <th className="kain-th-size">Size</th>
                      {currentPreset.headers.map(h => (
                        <th key={h.key}>
                          {h.label}
                          <span className="kain-th-unit">(cm)</span>
                        </th>
                      ))}
                      <th className="kain-th-ratio">Rasio</th>
                      {!readOnly && <th className="kain-th-action"></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {sizes.map((s) => (
                      <tr key={s.id}>
                        <td>
                          <input
                            type="text"
                            disabled={readOnly}
                            value={s.name}
                            placeholder="Size"
                            aria-label="Nama Size"
                            onChange={e => updateSize(s.id, 'name', e.target.value)}
                            className="kain-cell-input kain-cell-input--size"
                          />
                        </td>
                        {currentPreset.headers.map(h => (
                          <td key={h.key}>
                            <input
                              type="number"
                              min={0}
                              disabled={readOnly}
                              value={s.data[h.key] === 0 || s.data[h.key] === undefined ? '' : s.data[h.key]}
                              placeholder="0"
                              aria-label={`${h.label} (${s.name || 'Size'})`}
                              onFocus={e => e.target.select()}
                              onChange={e => updateSize(s.id, h.key, e.target.value)}
                              className="kain-cell-input"
                            />
                          </td>
                        ))}
                        <td>
                          <input
                            type="number"
                            min={0}
                            disabled={readOnly}
                            value={s.ratio === 0 ? '' : s.ratio}
                            placeholder="0"
                            aria-label={`Rasio (${s.name || 'Size'})`}
                            onFocus={e => e.target.select()}
                            onChange={e => updateSize(s.id, 'ratio', e.target.value)}
                            className="kain-cell-input kain-cell-input--ratio"
                          />
                        </td>
                        {!readOnly && (
                          <td className="kain-td-action">
                            <button
                              type="button"
                              onClick={() => removeSize(s.id)}
                              className="kain-btn-remove-row"
                              title="Hapus baris size"
                              aria-label={`Hapus size ${s.name || ''}`}
                            >
                              ✕
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {!readOnly && (
                <button type="button" onClick={addSize} className="kain-btn-add-row">
                  + Tambah Baris Size
                </button>
              )}
            </div>
          )}
        </div>

        {/* KOLOM KANAN: PREDIKSI HASIL */}
        <div className="kain-summary-card">
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '10px',
              flexWrap: 'wrap',
              paddingBottom: '14px',
              marginBottom: '16px',
              borderBottom: '1px solid rgba(148, 163, 184, 0.22)',
            }}
          >
            <h3 className="kain-summary-title" style={{ margin: 0, paddingBottom: 0, borderBottom: 'none' }}>
              <span>🎯</span> Prediksi Hasil Vendor
            </h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <label
                htmlFor="kain-forecast-year"
                style={{ fontSize: '0.74rem', color: '#94a3b8', fontWeight: 600 }}
              >
                Tahun Ajaran:
              </label>
              <select
                id="kain-forecast-year"
                value={forecastAcademicYear}
                onChange={e => setForecastAcademicYear(e.target.value)}
                style={{
                  background: '#f8fafc',
                  color: '#0f172a',
                  border: '1px solid #475569',
                  borderRadius: '8px',
                  padding: '5px 10px',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {forecastYearOptions.map(yr => (
                  <option key={yr} value={yr} style={{ background: '#ffffff', color: '#0f172a' }}>
                    TA {yr}{yr === '2027/2028' ? ' (Target)' : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* KONTROL INTEGRASI PERSENTASE PREDIKSI PRODUKSI */}
          <div
            style={{
              background: 'rgba(15, 23, 42, 0.55)',
              border: '1px solid rgba(71, 85, 105, 0.6)',
              borderRadius: '11px',
              padding: '12px',
              marginBottom: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
          >
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => setCalcMode('forecast')}
                style={{
                  flex: 1,
                  minWidth: '140px',
                  padding: '6px 10px',
                  borderRadius: '8px',
                  border: calcMode === 'forecast' ? '1px solid #38bdf8' : '1px solid rgba(100, 116, 139, 0.5)',
                  background: calcMode === 'forecast' ? 'rgba(56, 189, 248, 0.18)' : 'rgba(30, 41, 59, 0.65)',
                  color: calcMode === 'forecast' ? '#e0f2fe' : '#94a3b8',
                  fontSize: '0.76rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                📊 % Prediksi Produksi
              </button>
              <button
                type="button"
                onClick={() => setCalcMode('manual')}
                style={{
                  flex: 1,
                  minWidth: '120px',
                  padding: '6px 10px',
                  borderRadius: '8px',
                  border: calcMode === 'manual' ? '1px solid #10b981' : '1px solid rgba(100, 116, 139, 0.5)',
                  background: calcMode === 'manual' ? 'rgba(16, 185, 129, 0.18)' : 'rgba(30, 41, 59, 0.65)',
                  color: calcMode === 'manual' ? '#d1fae5' : '#94a3b8',
                  fontSize: '0.76rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                ✏️ Rasio Manual Size Chart
              </button>
            </div>

            {calcMode === 'forecast' && (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label
                      htmlFor="kain-forecast-item"
                      style={{ fontSize: '0.74rem', color: '#cbd5e1', fontWeight: 600 }}
                    >
                      Item Acuan Prediksi Produksi (TA {forecastAcademicYear}):
                    </label>
                    {forecastLoading && (
                      <span style={{ fontSize: '0.7rem', color: '#38bdf8' }}>Memuat...</span>
                    )}
                  </div>
                  <select
                    id="kain-forecast-item"
                    value={matchedForecastItem ? getForecastItemKey(matchedForecastItem) : ''}
                    onChange={e =>
                      setManualForecastSelection({ scope: selectionScope, key: e.target.value })
                    }
                    disabled={forecastItems.length === 0}
                    style={{
                      width: '100%',
                      background: '#f8fafc',
                      color: '#0f172a',
                      border: '1px solid #475569',
                      borderRadius: '8px',
                      padding: '7px 10px',
                      fontSize: '0.79rem',
                      fontWeight: 600,
                      cursor: forecastItems.length === 0 ? 'not-allowed' : 'pointer',
                      opacity: forecastItems.length === 0 ? 0.7 : 1,
                    }}
                  >
                    <option value="" style={{ background: '#ffffff', color: '#0f172a' }}>
                      {forecastItems.length === 0
                        ? `-- Belum ada data Prediksi Produksi TA ${forecastAcademicYear} --`
                        : `-- Auto / Pilih Item Prediksi (${sortedForecastOptions.length} item tersedia) --`}
                    </option>
                    {sortedForecastOptions.map(opt => (
                      <option
                        key={opt.key}
                        value={opt.key}
                        style={{ background: '#ffffff', color: '#0f172a' }}
                      >
                        [{opt.item.level}] {opt.item.uniformName} ({opt.item.total.toLocaleString('id-ID')} pcs)
                      </option>
                    ))}
                  </select>
                </div>

                {matchedForecastItem && (
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '8px',
                      flexWrap: 'wrap',
                      fontSize: '0.74rem',
                      color: '#cbd5e1',
                    }}
                  >
                    <span>
                      Target Rencana:{' '}
                      <strong style={{ color: '#6ee7b7' }}>
                        {matchedForecastItem.total.toLocaleString('id-ID')} pcs
                      </strong>
                      {vendorSummary.totalNeededRolls > 0 && (
                        <>
                          {' '}
                          (&asymp;{' '}
                          <strong style={{ color: '#38bdf8' }}>
                            {vendorSummary.totalNeededRolls.toFixed(1)} roll
                          </strong>
                          )
                        </>
                      )}
                    </span>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      {!readOnly && calculation.modeUsed === 'forecast' && (
                        <button
                          type="button"
                          onClick={handleApplyForecastRatiosToTable}
                          style={{
                            padding: '3px 8px',
                            borderRadius: '6px',
                            border: '1px solid rgba(56, 189, 248, 0.45)',
                            background: 'rgba(56, 189, 248, 0.14)',
                            color: '#bae6fd',
                            fontSize: '0.7rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                          title="Salin proporsi persentase Prediksi Produksi ke kolom Rasio di tabel Size Chart"
                        >
                          📋 Salin % ke Rasio
                        </button>
                      )}
                      {!readOnly && vendorSummary.totalNeededRolls > 0 && (
                        <button
                          type="button"
                          onClick={() => setTotalRolls(Math.max(1, Math.ceil(vendorSummary.totalNeededRolls)))}
                          style={{
                            padding: '3px 8px',
                            borderRadius: '6px',
                            border: '1px solid rgba(16, 185, 129, 0.45)',
                            background: 'rgba(16, 185, 129, 0.16)',
                            color: '#6ee7b7',
                            fontSize: '0.7rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                          title="Simulasikan jumlah roll pada Bagian 1 agar mencukupi 100% target Prediksi Produksi"
                        >
                          ⚡ Isi {Math.ceil(vendorSummary.totalNeededRolls)} Roll
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {calculation.fallbackReason && (
                  <div
                    style={{
                      fontSize: '0.73rem',
                      color: '#fde68a',
                      background: 'rgba(245, 158, 11, 0.12)',
                      border: '1px solid rgba(245, 158, 11, 0.3)',
                      borderRadius: '7px',
                      padding: '6px 9px',
                      lineHeight: 1.4,
                    }}
                  >
                    ℹ️ {calculation.fallbackReason}
                  </div>
                )}

                {calculation.unmatchedForecastSizes.length > 0 && calculation.modeUsed === 'forecast' && (
                  <div
                    style={{
                      fontSize: '0.72rem',
                      color: '#fde68a',
                      background: 'rgba(245, 158, 11, 0.12)',
                      border: '1px solid rgba(245, 158, 11, 0.3)',
                      borderRadius: '7px',
                      padding: '6px 9px',
                      lineHeight: 1.4,
                    }}
                  >
                    ⚠️ Ukuran{' '}
                    {calculation.unmatchedForecastSizes
                      .map(u => `${u.name} (${u.pct.toFixed(1)}%)`)
                      .join(', ')}{' '}
                    belum ada di tabel Size Chart; proporsi otomatis dinormalisasi ke ukuran yang tersedia.
                  </div>
                )}
              </>
            )}
          </div>

          <div className="kain-summary-hero">
            <div className="kain-summary-hero-label">Total Pakaian Jadi (Estimasi)</div>
            <div className="kain-summary-hero-value">
              {calculation.totalPcs.toLocaleString('id-ID')}
              <span className="kain-summary-hero-unit">pcs</span>
            </div>
            <div className="kain-summary-hero-meta">
              {calculation.modeUsed === 'forecast' ? (
                <>
                  📊 Proporsi % Prediksi TA {forecastAcademicYear} &bull; rata²{' '}
                  {calculation.avgUsageCm.toFixed(1)} cm/pcs
                </>
              ) : (
                <>
                  {calculation.maxSets} set produksi &times; {calculation.totalRatioParts} pcs/set
                </>
              )}
            </div>
          </div>

          <div className="kain-breakdown-box">
            <div className="kain-breakdown-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>
                Rincian Per Size ({calculation.modeUsed === 'forecast' ? '% Prediksi Produksi' : 'Rasio'})
              </span>
              {calculation.modeUsed === 'forecast' && (
                <span style={{ fontSize: '0.72rem', color: '#38bdf8', fontWeight: 700 }}>100% Kain Bersih</span>
              )}
            </div>
            <div className="kain-breakdown-list">
              {calculation.results.length > 0 ? (
                calculation.results.map((res, i) => (
                  <div key={i} className="kain-breakdown-row">
                    <span className="kain-breakdown-name" style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                      <span>Size {res.name || '?'}</span>
                      <span className="kain-breakdown-need">(butuh {res.usageCm}cm)</span>
                      {res.forecastPct !== null ? (
                        <span
                          style={{
                            fontSize: '0.7rem',
                            padding: '1px 6px',
                            borderRadius: '999px',
                            background: res.forecastPct > 0 ? 'rgba(56, 189, 248, 0.16)' : 'rgba(100, 116, 139, 0.22)',
                            color: res.forecastPct > 0 ? '#7dd3fc' : '#94a3b8',
                            fontWeight: 700,
                          }}
                        >
                          {res.forecastPct.toFixed(1)}%
                        </span>
                      ) : res.actualPct > 0 ? (
                        <span
                          style={{
                            fontSize: '0.7rem',
                            padding: '1px 6px',
                            borderRadius: '999px',
                            background: 'rgba(16, 185, 129, 0.14)',
                            color: '#6ee7b7',
                            fontWeight: 600,
                          }}
                        >
                          {res.actualPct.toFixed(1)}%
                        </span>
                      ) : null}
                    </span>
                    <span className="kain-breakdown-qty">{res.qty.toLocaleString('id-ID')} pcs</span>
                  </div>
                ))
              ) : (
                <div style={{ fontSize: '0.82rem', color: '#94a3b8' }}>
                  Isi panjang pola, ukuran, dan jumlah gulungan kain untuk melihat rincian hasil.
                </div>
              )}
            </div>
          </div>

          {/* PORSI VENDOR BERDASARKAN RUMUS PLOTTING PREDIKSI PRODUKSI */}
          <div className="kain-breakdown-box">
            <div
              className="kain-breakdown-header"
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '8px',
                flexWrap: 'wrap',
              }}
            >
              <span>🏭 Porsi Hasil Vendor (TA {forecastAcademicYear})</span>
              {vendorSummary.vendors.length > 0 && (
                <select
                  aria-label="Filter vendor"
                  value={
                    vendorSummary.vendors.some(v => v.vendorId === selectedVendorFilter)
                      ? selectedVendorFilter
                      : 'ALL'
                  }
                  onChange={e =>
                    setVendorFilterSelection({ scope: selectionScope, vendorId: e.target.value })
                  }
                  style={{
                    background: '#f8fafc',
                    color: '#0f172a',
                    border: '1px solid #475569',
                    borderRadius: '7px',
                    padding: '3px 8px',
                    fontSize: '0.74rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    maxWidth: '185px',
                  }}
                >
                  <option value="ALL" style={{ background: '#ffffff', color: '#0f172a' }}>
                    Semua Vendor ({vendorSummary.vendors.length})
                  </option>
                  {vendorSummary.vendors.map(v => (
                    <option key={v.vendorId} value={v.vendorId} style={{ background: '#ffffff', color: '#0f172a' }}>
                      {v.vendorName} ({v.sharePercentage}%)
                    </option>
                  ))}
                </select>
              )}
            </div>

            {vendorSummary.targetUniformName && (
              <div style={{ fontSize: '0.73rem', color: '#94a3b8', marginBottom: '10px' }}>
                Plotting: <strong style={{ color: '#e2e8f0' }}>[{vendorSummary.targetLevel}] {vendorSummary.targetUniformName}</strong>
                {vendorSummary.totalSchoolsForItem > 0 && (
                  <> &bull; Total {vendorSummary.totalSchoolsForItem} sekolah ter-plot</>
                )}
              </div>
            )}

            {vendorDataLoading ? (
              <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Memuat data plotting vendor...</div>
            ) : vendorSummary.vendors.length === 0 ? (
              <div style={{ fontSize: '0.8rem', color: '#94a3b8', lineHeight: 1.45 }}>
                Belum ada plotting vendor di TA {forecastAcademicYear} untuk [{vendorSummary.targetLevel || '-'}]{' '}
                {vendorSummary.targetUniformName || 'model ini'}.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {(selectedVendorFilter !== 'ALL' &&
                vendorSummary.vendors.some(v => v.vendorId === selectedVendorFilter)
                  ? vendorSummary.vendors.filter(v => v.vendorId === selectedVendorFilter)
                  : vendorSummary.vendors
                ).map(v => {
                  const sizeChips = Object.entries(v.calcSizes).filter(([, qty]) => qty > 0);
                  return (
                    <div
                      key={v.vendorId}
                      style={{
                        background: 'rgba(15, 23, 42, 0.55)',
                        border: '1px solid rgba(71, 85, 105, 0.5)',
                        borderRadius: '9px',
                        padding: '10px 11px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: '8px',
                          flexWrap: 'wrap',
                        }}
                      >
                        <strong style={{ fontSize: '0.86rem', color: '#f8fafc' }}>{v.vendorName}</strong>
                        <span
                          style={{
                            background: 'rgba(14, 165, 233, 0.18)',
                            border: '1px solid rgba(56, 189, 248, 0.35)',
                            color: '#7dd3fc',
                            padding: '2px 8px',
                            borderRadius: '999px',
                            fontSize: '0.73rem',
                            fontWeight: 700,
                          }}
                        >
                          {v.sharePercentage}% ({v.schoolCount}/{v.totalSchoolsInLevel} Sek.)
                        </span>
                      </div>

                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          fontSize: '0.79rem',
                          color: '#cbd5e1',
                          gap: '8px',
                          flexWrap: 'wrap',
                        }}
                      >
                        <span>
                          Dari {totalRolls} roll: <strong style={{ color: '#38bdf8' }}>{v.calcTotalPcs.toLocaleString('id-ID')} pcs</strong>
                        </span>
                        <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>
                          {v.allocRolls.toFixed(2)} roll &bull; {v.allocNetMeters.toFixed(1)} m bersih
                        </span>
                      </div>

                      {sizeChips.length > 0 && (
                        <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                          {sizeChips.map(([sz, qty]) => (
                            <span
                              key={sz}
                              style={{
                                fontSize: '0.71rem',
                                padding: '2px 6px',
                                borderRadius: '5px',
                                background: 'rgba(30, 41, 59, 0.9)',
                                border: '1px solid rgba(71, 85, 105, 0.5)',
                                color: '#e2e8f0',
                              }}
                            >
                              {sz}: <strong style={{ color: '#38bdf8' }}>{qty}</strong>
                            </span>
                          ))}
                        </div>
                      )}

                      {matchedForecastItem && v.spkTotalPcs > 0 && (
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            gap: '8px',
                            flexWrap: 'wrap',
                            paddingTop: '5px',
                            borderTop: '1px dashed rgba(148, 163, 184, 0.2)',
                            fontSize: '0.73rem',
                            color: '#94a3b8',
                          }}
                        >
                          <span>
                            Target SPK TA {forecastAcademicYear}:{' '}
                            <strong style={{ color: '#6ee7b7' }}>{v.spkTotalPcs.toLocaleString('id-ID')} pcs</strong>
                            {v.neededRolls > 0 && <> (&asymp; {v.neededRolls.toFixed(2)} roll)</>}
                          </span>
                          {!readOnly && v.neededRolls > 0 && (
                            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                              <button
                                type="button"
                                onClick={() => setTotalRolls(Math.max(1, Math.ceil(v.neededRolls)))}
                                style={{
                                  padding: '2px 7px',
                                  borderRadius: '5px',
                                  border: '1px solid rgba(16, 185, 129, 0.4)',
                                  background: 'rgba(16, 185, 129, 0.14)',
                                  color: '#6ee7b7',
                                  fontSize: '0.69rem',
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                }}
                                title={`Ubah Jml Gulungan di Bagian 1 menjadi ${Math.ceil(v.neededRolls)} roll`}
                              >
                                Hitung {Math.ceil(v.neededRolls)} Roll
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setVendorFilterSelection({ scope: selectionScope, vendorId: v.vendorId });
                                  setInboundVendorId(v.vendorId);
                                  openInboundFromCalculator();
                                }}
                                style={{
                                  padding: '2px 7px',
                                  borderRadius: '5px',
                                  border: '1px solid rgba(56, 189, 248, 0.4)',
                                  background: 'rgba(56, 189, 248, 0.14)',
                                  color: '#7dd3fc',
                                  fontSize: '0.69rem',
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                }}
                                title={`Catat kirim kain khusus untuk vendor ${v.vendorName}`}
                              >
                                📥 Kirim Kain
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* AKSI CEPAT KIRIM KAIN */}
                {!readOnly && (
                  <div style={{ marginTop: '10px' }}>
                    <button
                      type="button"
                      onClick={openInboundFromCalculator}
                      style={{
                        width: '100%',
                        padding: '9px 14px',
                        borderRadius: '8px',
                        border: '1px solid #10b981',
                        background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.25), rgba(5, 150, 105, 0.35))',
                        color: '#a7f3d0',
                        fontSize: '0.82rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                      }}
                      title="Salin hasil simulasi ini langsung ke Buku Mutasi & Sisa Kain Vendor"
                    >
                      <span>📥</span> Catat Kirim Kain ke Vendor Ini
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="kain-metrics-grid">
            <div className="kain-metric-item">
              <div className="kain-metric-label">Kain Kotor (Kirim)</div>
              <div className="kain-metric-value">{(calculation.grossLengthCm / 100).toFixed(2)} Meter</div>
            </div>
            <div className="kain-metric-item">
              <div className="kain-metric-label">Kain Bersih (-{defectTolerance}%)</div>
              <div className="kain-metric-value">{(calculation.netLengthCm / 100).toFixed(2)} Meter</div>
            </div>
            <div className="kain-metric-item">
              <div className="kain-metric-label">Terpakai Baju</div>
              <div className="kain-metric-value">{(calculation.usedLengthCm / 100).toFixed(2)} Meter</div>
            </div>
            <div className="kain-metric-item">
              <div className="kain-metric-label">Sisa / Perca</div>
              <div className="kain-metric-value is-amber">{(calculation.remainingLengthCm / 100).toFixed(2)} Meter</div>
            </div>
          </div>

          <div className="kain-summary-note">
            *Kalkulasi memakai lebar kain <strong>{fabricWidth}cm</strong> (faktor skala {(fabricWidth / 150).toFixed(2)}x bidang kain) + kampuh potong 15-20cm/baju. Pada Mode A, 100% kain kiriman dihitung untuk vendor terpilih lalu dievaluasi terhadap target SPK TA {forecastAcademicYear}.
          </div>
        </div>
      </div>
    </div>
  )}

      {/* TAMPILAN 2: BUKU MUTASI & SISA KAIN VENDOR */}
      {activeKainSubTab === 'buku_kain' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* FILTER & AKSI BAR */}
          <div
            style={{
              background: '#1e293b',
              border: '1px solid rgba(71, 85, 105, 0.6)',
              borderRadius: '12px',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '12px',
                flexWrap: 'wrap',
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: '1.08rem', color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>📖</span> Buku Mutasi &amp; Sisa Kain Vendor
                </h3>
                <p style={{ margin: '4px 0 0 0', fontSize: '0.78rem', color: '#94a3b8' }}>
                  Pencatatan saldo kain masuk supplier, pemakaian jahit, dan sisa bahan di bengkel vendor (berkelanjutan antar Tahun Ajaran).
                </p>
              </div>

              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={loadFabricMutations}
                  disabled={fabricMutationsLoading}
                  style={{
                    padding: '7px 12px',
                    borderRadius: '8px',
                    border: '1px solid rgba(148, 163, 184, 0.4)',
                    background: 'rgba(30, 41, 59, 0.6)',
                    color: '#94a3b8',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                  title="Muat ulang mutasi kain dari database"
                >
                  {fabricMutationsLoading ? 'Memuat...' : '↺ Refresh'}
                </button>
                {!readOnly && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setInboundVendorId(bookVendorId !== 'ALL' ? bookVendorId : vendors[0]?.id || '');
                        setInboundAcademicYear(bookAcademicYear);
                        setShowInboundModal(true);
                      }}
                    style={{
                      padding: '7px 12px',
                      borderRadius: '8px',
                      border: '1px solid #0284c7',
                      background: 'rgba(2, 132, 199, 0.22)',
                      color: '#bae6fd',
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                    }}
                  >
                    <span>+</span> Catat Kain Masuk Supplier
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setUsageVendorId(bookVendorId !== 'ALL' ? bookVendorId : vendors[0]?.id || '');
                      setUsageAcademicYear(bookAcademicYear);
                      setShowUsageModal(true);
                    }}
                    style={{
                      padding: '7px 12px',
                      borderRadius: '8px',
                      border: '1px solid #10b981',
                      background: 'rgba(16, 185, 129, 0.2)',
                      color: '#d1fae5',
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                    }}
                  >
                    <span>+</span> Laporan Setor Baju &amp; Sisa
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setInitialVendorId(bookVendorId !== 'ALL' ? bookVendorId : vendors[0]?.id || '');
                      setInitialAcademicYear(bookAcademicYear);
                      setShowInitialModal(true);
                    }}
                    style={{
                      padding: '7px 12px',
                      borderRadius: '8px',
                      border: '1px solid #f59e0b',
                      background: 'rgba(245, 158, 11, 0.2)',
                      color: '#fef3c7',
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                    }}
                  >
                    <span>⚖️</span> Saldo Awal / Opname
                  </button>
                </>
              )}
            </div>
            </div>

            {/* BARIS KONTROL FILTER */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '10px',
                paddingTop: '12px',
                borderTop: '1px solid rgba(148, 163, 184, 0.2)',
              }}
            >
              <div>
                <label style={{ display: 'block', fontSize: '0.74rem', color: '#94a3b8', marginBottom: '4px', fontWeight: 600 }}>
                  Tahun Ajaran:
                </label>
                <select
                  value={bookAcademicYear}
                  onChange={e => setBookAcademicYear(e.target.value)}
                  style={{
                    width: '100%',
                    background: '#f8fafc',
                    color: '#0f172a',
                    border: '1px solid #475569',
                    borderRadius: '8px',
                    padding: '6px 10px',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {forecastYearOptions.map(yr => (
                    <option key={yr} value={yr} style={{ background: '#ffffff', color: '#0f172a' }}>
                      TA {yr}{yr === '2027/2028' ? ' (Target)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.74rem', color: '#94a3b8', marginBottom: '4px', fontWeight: 600 }}>
                  Filter Vendor:
                </label>
                <select
                  value={bookVendorId}
                  onChange={e => setBookVendorId(e.target.value)}
                  style={{
                    width: '100%',
                    background: '#f8fafc',
                    color: '#0f172a',
                    border: '1px solid #475569',
                    borderRadius: '8px',
                    padding: '6px 10px',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  <option value="ALL" style={{ background: '#ffffff', color: '#0f172a' }}>
                    -- Semua Vendor ({vendors.length}) --
                  </option>
                  {vendors.map(v => (
                    <option key={v.id} value={v.id} style={{ background: '#ffffff', color: '#0f172a' }}>
                      {v.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.74rem', color: '#94a3b8', marginBottom: '4px', fontWeight: 600 }}>
                  Filter Jenis Kain:
                </label>
                <select
                  value={bookFabricFilter}
                  onChange={e => setBookFabricFilter(e.target.value)}
                  style={{
                    width: '100%',
                    background: '#f8fafc',
                    color: '#0f172a',
                    border: '1px solid #475569',
                    borderRadius: '8px',
                    padding: '6px 10px',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  <option value="ALL" style={{ background: '#ffffff', color: '#0f172a' }}>
                    -- Semua Jenis Kain --
                  </option>
                  {STANDARD_FABRIC_TYPES.map(ft => (
                    <option key={ft} value={ft} style={{ background: '#ffffff', color: '#0f172a' }}>
                      {ft}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.74rem', color: '#94a3b8', marginBottom: '4px', fontWeight: 600 }}>
                  Cari Dokumen / Catatan:
                </label>
                <input
                  type="text"
                  placeholder="Cari supplier, no. DO, vendor..."
                  value={searchMutationQuery}
                  onChange={e => setSearchMutationQuery(e.target.value)}
                  style={{
                    width: '100%',
                    background: '#f8fafc',
                    color: '#0f172a',
                    border: '1px solid #475569',
                    borderRadius: '8px',
                    padding: '6px 10px',
                    fontSize: '0.8rem',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            </div>
          </div>

          {/* KARTU SALDO SISA KAIN BERKELANJUTAN */}
          <div
            style={{
              background: '#1e293b',
              border: '1px solid rgba(71, 85, 105, 0.6)',
              borderRadius: '12px',
              padding: '16px',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '12px',
                flexWrap: 'wrap',
                gap: '8px',
              }}
            >
              <h4 style={{ margin: 0, fontSize: '0.94rem', color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>📦</span> Saldo Sisa Kain Tersimpan di Vendor (TA {bookAcademicYear})
              </h4>
              <span style={{ fontSize: '0.74rem', color: '#38bdf8' }}>
                {bookVendorId === 'ALL'
                  ? 'Akumulasi Seluruh Vendor'
                  : vendors.find(v => v.id === bookVendorId)?.name || 'Vendor Terpilih'}
              </span>
            </div>

            <div
              style={{
                fontSize: '0.73rem',
                color: '#cbd5e1',
                background: 'rgba(15, 23, 42, 0.6)',
                border: '1px solid rgba(56, 189, 248, 0.25)',
                borderRadius: '8px',
                padding: '8px 12px',
                lineHeight: 1.45,
                marginBottom: '14px',
              }}
            >
              💡 <strong>Saldo Berkelanjutan:</strong> Sisa kain di akhir TA sebelumnya otomatis menjadi Saldo Awal di TA {bookAcademicYear}. Perhitungan sisa kain dihitung dari <em>Saldo Awal + Kain Masuk Supplier - Pemakaian Baju Jadi + Penyesuaian Opname</em>.
            </div>

            {fabricBalances.summaries.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px 16px', color: '#94a3b8', fontSize: '0.85rem' }}>
                Belum ada mutasi atau saldo kain yang tercatat untuk filter ini. Klik <strong>+ Catat Kain Masuk Supplier</strong> di atas untuk memulai.
              </div>
            ) : (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                  gap: '12px',
                }}
              >
                {fabricBalances.summaries.map(it => {
                  const isPositive = it.balanceYards > 0;
                  const isZero = it.balanceYards === 0;
                  const statusBg = isPositive
                    ? 'rgba(16, 185, 129, 0.15)'
                    : isZero
                      ? 'rgba(100, 116, 139, 0.15)'
                      : 'rgba(239, 68, 68, 0.15)';
                  const statusBorder = isPositive
                    ? 'rgba(16, 185, 129, 0.4)'
                    : isZero
                      ? 'rgba(100, 116, 139, 0.4)'
                      : 'rgba(239, 68, 68, 0.4)';
                  const statusColor = isPositive ? '#6ee7b7' : isZero ? '#cbd5e1' : '#fca5a5';

                  return (
                    <div
                      key={it.fabricType}
                      style={{
                        background: 'rgba(15, 23, 42, 0.65)',
                        border: `1px solid ${statusBorder}`,
                        borderRadius: '10px',
                        padding: '12px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '6px' }}>
                        <strong style={{ fontSize: '0.84rem', color: '#f8fafc', lineHeight: 1.35 }}>
                          {it.fabricType}
                        </strong>
                        <span
                          style={{
                            background: statusBg,
                            color: statusColor,
                            fontSize: '0.68rem',
                            fontWeight: 700,
                            padding: '2px 7px',
                            borderRadius: '999px',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {isPositive ? 'Tersedia' : isZero ? 'Habis' : 'Defisit'}
                        </span>
                      </div>

                      <div
                        style={{
                          background: 'rgba(30, 41, 59, 0.6)',
                          borderRadius: '8px',
                          padding: '8px 10px',
                          textAlign: 'center',
                        }}
                      >
                        <div style={{ fontSize: '0.69rem', color: '#94a3b8' }}>Sisa Kain di Vendor Saat Ini</div>
                        <div style={{ fontSize: '1.25rem', fontWeight: 800, color: statusColor }}>
                          {it.balanceYards.toFixed(1)} <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>Yard</span>
                        </div>
                        <div style={{ fontSize: '0.74rem', color: '#94a3b8' }}>
                          &asymp; {it.balanceMeters.toFixed(2)} Meter
                        </div>
                      </div>

                      <div style={{ fontSize: '0.72rem', color: '#cbd5e1', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: '#94a3b8' }}>Bawaan TA Lalu:</span>
                          <strong style={{ color: it.prevCarryOverYards >= 0 ? '#93c5fd' : '#fca5a5' }}>
                            {it.prevCarryOverYards >= 0 ? '+' : ''}{it.prevCarryOverYards.toFixed(1)} yd
                          </strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: '#94a3b8' }}>Kain Masuk TA Ini:</span>
                          <strong style={{ color: '#6ee7b7' }}>
                            +{it.inboundYards.toFixed(1)} yd ({it.inboundRolls} roll)
                          </strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: '#94a3b8' }}>Terpakai Jahit:</span>
                          <strong style={{ color: '#fca5a5' }}>
                            -{it.usageYards.toFixed(1)} yd ({it.garmentPcs} pcs)
                          </strong>
                        </div>
                        {it.adjustmentYards !== 0 && (
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: '#94a3b8' }}>Penyesuaian Opname:</span>
                            <strong style={{ color: it.adjustmentYards >= 0 ? '#fde68a' : '#fca5a5' }}>
                              {it.adjustmentYards >= 0 ? '+' : ''}{it.adjustmentYards.toFixed(1)} yd
                            </strong>
                          </div>
                        )}
                        {it.systemExpectedYards > 0 && it.usageYards > 0 && (
                          <div
                            style={{
                              marginTop: '4px',
                              paddingTop: '4px',
                              borderTop: '1px dashed rgba(148, 163, 184, 0.2)',
                              display: 'flex',
                              justifyContent: 'space-between',
                              fontSize: '0.7rem',
                            }}
                          >
                            <span style={{ color: '#94a3b8' }}>Audit Efisiensi:</span>
                            <span
                              style={{
                                color: it.systemExpectedYards >= it.usageYards ? '#6ee7b7' : '#fde68a',
                                fontWeight: 700,
                              }}
                            >
                              {it.systemExpectedYards >= it.usageYards
                                ? `Hemat ${(it.systemExpectedYards - it.usageYards).toFixed(1)} yd`
                                : `Boros +${(it.usageYards - it.systemExpectedYards).toFixed(1)} yd`}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* TABEL MUTASI KAIN & JEJAK AUDIT */}
          <div
            style={{
              background: '#1e293b',
              border: '1px solid rgba(71, 85, 105, 0.6)',
              borderRadius: '12px',
              padding: '16px',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '12px',
                flexWrap: 'wrap',
                gap: '8px',
              }}
            >
              <h4 style={{ margin: 0, fontSize: '0.94rem', color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>📋</span> Riwayat Mutasi Kain &amp; Audit Vendor (TA {bookAcademicYear})
              </h4>
              <span style={{ fontSize: '0.74rem', color: '#94a3b8' }}>
                Total {fabricBalances.currentYearMutations.length} transaksi di TA ini
              </span>
            </div>

            {fabricMutationsLoading ? (
              <div style={{ textAlign: 'center', padding: '24px', color: '#94a3b8', fontSize: '0.85rem' }}>
                Memuat buku mutasi kain...
              </div>
            ) : fabricBalances.currentYearMutations.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px', color: '#94a3b8', fontSize: '0.85rem' }}>
                Belum ada transaksi mutasi kain yang tercatat di TA {bookAcademicYear}.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem', color: '#e2e8f0' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(148, 163, 184, 0.25)', color: '#94a3b8', textAlign: 'left' }}>
                      <th style={{ padding: '8px 6px' }}>Tanggal</th>
                      <th style={{ padding: '8px 6px' }}>Vendor</th>
                      <th style={{ padding: '8px 6px' }}>Tipe</th>
                      <th style={{ padding: '8px 6px' }}>Jenis Kain</th>
                      <th style={{ padding: '8px 6px' }}>Dokumen / Keterangan</th>
                      <th style={{ padding: '8px 6px', textAlign: 'center' }}>Roll</th>
                      <th style={{ padding: '8px 6px', textAlign: 'right' }}>Yard</th>
                      <th style={{ padding: '8px 6px', textAlign: 'right' }}>Meter</th>
                      <th style={{ padding: '8px 6px', textAlign: 'right' }}>Baju (pcs)</th>
                      <th style={{ padding: '8px 6px', textAlign: 'center' }}>Audit Standar</th>
                      {!readOnly && <th style={{ padding: '8px 6px', textAlign: 'center' }}>Aksi</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {fabricBalances.currentYearMutations.map(m => {
                      const isMinus = m.mutation_type === 'usage';
                      const typeLabel =
                        m.mutation_type === 'inbound'
                          ? '📥 Masuk Supplier'
                          : m.mutation_type === 'usage'
                            ? '✂️ Setor & Pakai'
                            : m.mutation_type === 'initial'
                              ? '📦 Saldo Awal'
                              : '⚖️ Opname';
                      const typeBg =
                        m.mutation_type === 'inbound'
                          ? 'rgba(2, 132, 199, 0.2)'
                          : m.mutation_type === 'usage'
                            ? 'rgba(239, 68, 68, 0.2)'
                            : m.mutation_type === 'initial'
                              ? 'rgba(56, 189, 248, 0.2)'
                              : 'rgba(245, 158, 11, 0.2)';
                      const typeColor =
                        m.mutation_type === 'inbound'
                          ? '#7dd3fc'
                          : m.mutation_type === 'usage'
                            ? '#fca5a5'
                            : m.mutation_type === 'initial'
                              ? '#bae6fd'
                              : '#fde68a';

                      return (
                        <tr key={m.id} style={{ borderBottom: '1px dashed rgba(148, 163, 184, 0.15)' }}>
                          <td style={{ padding: '8px 6px', whiteSpace: 'nowrap' }}>
                            {m.date ? new Date(m.date).toLocaleDateString('id-ID') : '-'}
                          </td>
                          <td style={{ padding: '8px 6px', fontWeight: 600, color: '#f8fafc' }}>
                            {m.vendors?.name || '-'}
                          </td>
                          <td style={{ padding: '8px 6px', whiteSpace: 'nowrap' }}>
                            <span
                              style={{
                                background: typeBg,
                                color: typeColor,
                                padding: '2px 7px',
                                borderRadius: '999px',
                                fontSize: '0.7rem',
                                fontWeight: 700,
                              }}
                            >
                              {typeLabel}
                            </span>
                          </td>
                          <td style={{ padding: '8px 6px' }}>{m.fabric_type}</td>
                          <td style={{ padding: '8px 6px', color: '#cbd5e1' }}>
                            <div>{m.document_no || m.supplier_name || '-'}</div>
                            {m.notes && <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{m.notes}</div>}
                          </td>
                          <td style={{ padding: '8px 6px', textAlign: 'center' }}>
                            {m.rolls > 0 ? `${m.rolls} roll` : '-'}
                          </td>
                          <td
                            style={{
                              padding: '8px 6px',
                              textAlign: 'right',
                              fontWeight: 700,
                              color: isMinus ? '#fca5a5' : '#6ee7b7',
                            }}
                          >
                            {isMinus ? '-' : '+'}{Number(m.length_yards).toFixed(1)} yd
                          </td>
                          <td style={{ padding: '8px 6px', textAlign: 'right', color: '#cbd5e1' }}>
                            {isMinus ? '-' : '+'}{Number(m.length_meters).toFixed(2)} m
                          </td>
                          <td style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 600 }}>
                            {m.garment_pcs > 0 ? `${m.garment_pcs} pcs` : '-'}
                          </td>
                          <td style={{ padding: '8px 6px', textAlign: 'center' }}>
                            {m.system_expected_yards > 0 ? (
                              <div style={{ fontSize: '0.71rem' }}>
                                <span style={{ color: '#94a3b8' }}>Std: {m.system_expected_yards.toFixed(1)} yd</span>
                                <br />
                                <strong
                                  style={{
                                    color: m.system_expected_yards >= m.length_yards ? '#6ee7b7' : '#fca5a5',
                                  }}
                                >
                                  {m.system_expected_yards >= m.length_yards
                                    ? `Hemat ${(m.system_expected_yards - m.length_yards).toFixed(1)} yd`
                                    : `Boros +${(m.length_yards - m.system_expected_yards).toFixed(1)} yd`}
                                </strong>
                              </div>
                            ) : (
                              <span style={{ color: '#64748b' }}>-</span>
                            )}
                          </td>
                          {!readOnly && (
                            <td style={{ padding: '8px 6px', textAlign: 'center' }}>
                              <button
                                type="button"
                                onClick={() => handleDeleteMutation(m.id)}
                                style={{
                                  background: 'rgba(239, 68, 68, 0.15)',
                                  border: '1px solid rgba(239, 68, 68, 0.3)',
                                  color: '#fca5a5',
                                  padding: '3px 7px',
                                  borderRadius: '6px',
                                  fontSize: '0.7rem',
                                  cursor: 'pointer',
                                }}
                                title="Hapus mutasi kain ini"
                              >
                                Hapus
                              </button>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL TAMBAH ITEM MODEL SERAGAM */}
      {showAddModal && !readOnly && (
        <div
          className="modal-overlay"
          onClick={() => {
            if (!isSaving) setShowAddModal(false);
          }}
        >
          <div className="modal kain-modal" onClick={e => e.stopPropagation()}>
            <h3>+ Tambah Item Model Seragam</h3>
            <p className="kain-modal-desc">
              Tambahkan model pakaian baru untuk jenjang tertentu beserta kolom ukuran standarnya ke Kalkulator Kain.
            </p>

            <form onSubmit={handleCreateCustomItem} className="modal-form">
              {modalError && <div className="modal-error">{modalError}</div>}

              <div className="kain-modal-row">
                <div className="form-group">
                  <label htmlFor="kain-new-level">Jenjang</label>
                  <select
                    id="kain-new-level"
                    value={newItemLevel}
                    onChange={e => setNewItemLevel(e.target.value as JenjangLevel)}
                    disabled={isSaving}
                  >
                    {JENJANG_OPTIONS.map(lvl => (
                      <option key={lvl} value={lvl}>{lvl}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="kain-new-label">Nama Item / Model Seragam</label>
                  <input
                    id="kain-new-label"
                    type="text"
                    required
                    disabled={isSaving}
                    placeholder="Contoh: Baju Olahraga / Batik TK"
                    value={newItemLabel}
                    onChange={e => setNewItemLabel(e.target.value)}
                    autoFocus
                  />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="kain-new-type">Jenis Potongan (Rumus Hitung Kain)</label>
                <select
                  id="kain-new-type"
                  value={newItemType}
                  onChange={e => setNewItemType(e.target.value as GarmentType)}
                  disabled={isSaving}
                >
                  {(Object.keys(GARMENT_TYPE_META) as GarmentType[]).map(typeKey => (
                    <option key={typeKey} value={typeKey}>
                      {GARMENT_TYPE_META[typeKey].label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="kain-formula-preview">
                <strong>Kolom &amp; Rumus Otomatis:</strong> {GARMENT_TYPE_META[newItemType].formulaDesc}
                <br />
                <span>
                  Kolom ukuran: {GARMENT_TYPE_META[newItemType].headers.map(h => h.label).join(', ')}
                </span>
              </div>

              <div className="form-group">
                <label htmlFor="kain-new-template">Template Baris Ukuran Awal</label>
                <select
                  id="kain-new-template"
                  value={newItemTemplate}
                  onChange={e => setNewItemTemplate(e.target.value as SizeTemplateType)}
                  disabled={isSaving}
                >
                  <option value="letter">Ukuran Huruf Standar (SS, S, M, L, XL, 3L, 4L)</option>
                  <option value="number">Ukuran Angka Celana (25 s/d 34)</option>
                  <option value="single">1 Baris Awal (Size S)</option>
                </select>
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="kain-btn-reset"
                  onClick={() => setShowAddModal(false)}
                  disabled={isSaving}
                >
                  Batal
                </button>
                <button type="submit" className="kain-btn-save" disabled={isSaving}>
                  {isSaving ? 'Menyimpan...' : '✓ Tambah & Simpan Item'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 1: CATAT KAIN MASUK DARI SUPPLIER */}
      {showInboundModal && !readOnly && (
        <div
          className="modal-overlay"
          onClick={() => {
            if (!inboundSaving) setShowInboundModal(false);
          }}
        >
          <div className="modal kain-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '560px' }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>📥</span> Catat Kain Masuk dari Supplier
            </h3>
            <p className="kain-modal-desc">
              Catat penerimaan kain dari supplier yang dikirimkan ke bengkel vendor penjahit.
            </p>

            <form onSubmit={handleSaveInboundMutation} className="modal-form">
              <div className="kain-modal-row">
                <div className="form-group flex-1">
                  <label htmlFor="inbound-vendor">Vendor Penerima Kain *</label>
                  <select
                    id="inbound-vendor"
                    value={inboundVendorId}
                    onChange={e => setInboundVendorId(e.target.value)}
                    required
                    style={{ background: '#f8fafc', color: '#0f172a' }}
                  >
                    <option value="" style={{ background: '#ffffff', color: '#0f172a' }}>
                      -- Pilih Vendor Penerima --
                    </option>
                    {vendors.map(v => (
                      <option key={v.id} value={v.id} style={{ background: '#ffffff', color: '#0f172a' }}>
                        {v.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group" style={{ width: '150px' }}>
                  <label htmlFor="inbound-year">Tahun Ajaran *</label>
                  <select
                    id="inbound-year"
                    value={inboundAcademicYear}
                    onChange={e => setInboundAcademicYear(e.target.value)}
                    required
                    style={{ background: '#f8fafc', color: '#0f172a' }}
                  >
                    {forecastYearOptions.map(yr => (
                      <option key={yr} value={yr} style={{ background: '#ffffff', color: '#0f172a' }}>
                        {yr}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="inbound-fabric">Jenis Bahan Kain *</label>
                <select
                  id="inbound-fabric"
                  value={inboundFabricType}
                  onChange={e => setInboundFabricType(e.target.value)}
                  required
                  style={{ background: '#f8fafc', color: '#0f172a' }}
                >
                  {STANDARD_FABRIC_TYPES.map(ft => (
                    <option key={ft} value={ft} style={{ background: '#ffffff', color: '#0f172a' }}>
                      {ft}
                    </option>
                  ))}
                </select>
              </div>

              {inboundFabricType === 'Lainnya / Khusus' && (
                <div className="form-group">
                  <label htmlFor="inbound-custom-fabric">Ketik Nama Bahan Kain Khusus *</label>
                  <input
                    id="inbound-custom-fabric"
                    type="text"
                    placeholder="mis. Kain Drill Hitam / Kotak Khusus TK"
                    value={inboundCustomFabricType}
                    onChange={e => setInboundCustomFabricType(e.target.value)}
                    required
                    style={{ background: '#f8fafc', color: '#0f172a' }}
                  />
                </div>
              )}

              <div className="kain-modal-row">
                <div className="form-group flex-1">
                  <label htmlFor="inbound-date">Tanggal Kirim / Terima *</label>
                  <input
                    id="inbound-date"
                    type="date"
                    value={inboundDate}
                    onChange={e => setInboundDate(e.target.value)}
                    required
                    style={{ background: '#f8fafc', color: '#0f172a' }}
                  />
                </div>
                <div className="form-group flex-1">
                  <label htmlFor="inbound-doc">No. Surat Jalan / DO / Faktur</label>
                  <input
                    id="inbound-doc"
                    type="text"
                    placeholder="mis. SJ-TXT-2027-01"
                    value={inboundDocNo}
                    onChange={e => setInboundDocNo(e.target.value)}
                    style={{ background: '#f8fafc', color: '#0f172a' }}
                  />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="inbound-supplier">Asal Supplier Kain</label>
                <input
                  id="inbound-supplier"
                  type="text"
                  placeholder="mis. Toko Kain Sentosa / PT Grand Textile"
                  value={inboundSupplierName}
                  onChange={e => setInboundSupplierName(e.target.value)}
                  style={{ background: '#f8fafc', color: '#0f172a' }}
                />
              </div>

              <div className="kain-modal-row">
                <div className="form-group" style={{ width: '130px' }}>
                  <label htmlFor="inbound-rolls">Jml Gulungan</label>
                  <input
                    id="inbound-rolls"
                    type="number"
                    min="0"
                    value={inboundRolls}
                    onChange={e => setInboundRolls(Math.max(0, parseInt(e.target.value) || 0))}
                    style={{ background: '#f8fafc', color: '#0f172a' }}
                  />
                </div>

                <div className="form-group flex-1">
                  <label htmlFor="inbound-yards">Panjang (Yard) *</label>
                  <input
                    id="inbound-yards"
                    type="number"
                    step="0.1"
                    min="0"
                    value={inboundLengthYards}
                    onChange={e => {
                      const val = Math.max(0, parseFloat(e.target.value) || 0);
                      setInboundLengthYards(val);
                      setInboundLengthMeters(Number((val * 0.9144).toFixed(2)));
                    }}
                    required
                    style={{ background: '#f8fafc', color: '#0f172a', fontWeight: 700 }}
                  />
                </div>

                <div className="form-group flex-1">
                  <label htmlFor="inbound-meters">Panjang (Meter)</label>
                  <input
                    id="inbound-meters"
                    type="number"
                    step="0.1"
                    min="0"
                    value={inboundLengthMeters}
                    onChange={e => {
                      const val = Math.max(0, parseFloat(e.target.value) || 0);
                      setInboundLengthMeters(val);
                      setInboundLengthYards(Number((val / 0.9144).toFixed(2)));
                    }}
                    style={{ background: '#f8fafc', color: '#0f172a' }}
                  />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="inbound-notes">Catatan Tambahan</label>
                <textarea
                  id="inbound-notes"
                  rows={2}
                  placeholder="mis. Dikirim 2 tahap, kain warna putih bersih untuk kemeja SD"
                  value={inboundNotes}
                  onChange={e => setInboundNotes(e.target.value)}
                  style={{ background: '#f8fafc', color: '#0f172a', borderRadius: '8px', padding: '8px' }}
                />
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="kain-btn-reset"
                  onClick={() => setShowInboundModal(false)}
                  disabled={inboundSaving}
                >
                  Batal
                </button>
                <button type="submit" className="kain-btn-save" disabled={inboundSaving}>
                  {inboundSaving ? 'Menyimpan...' : '✓ Simpan Kain Masuk'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: CATAT LAPORAN SETOR BAJU & PEMAKAIAN KAIN VENDOR */}
      {showUsageModal && !readOnly && (
        <div
          className="modal-overlay"
          onClick={() => {
            if (!usageSaving) setShowUsageModal(false);
          }}
        >
          <div className="modal kain-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '560px' }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>✂️</span> Laporan Setor Baju &amp; Pemakaian Kain
            </h3>
            <p className="kain-modal-desc">
              Catat laporan hasil jahit baju jadi dari vendor untuk memotong saldo kain dan menguji efisiensi pemotongan bahan.
            </p>

            <form onSubmit={handleSaveUsageMutation} className="modal-form">
              <div className="kain-modal-row">
                <div className="form-group flex-1">
                  <label htmlFor="usage-vendor">Vendor Penjahit *</label>
                  <select
                    id="usage-vendor"
                    value={usageVendorId}
                    onChange={e => setUsageVendorId(e.target.value)}
                    required
                    style={{ background: '#f8fafc', color: '#0f172a' }}
                  >
                    <option value="" style={{ background: '#ffffff', color: '#0f172a' }}>
                      -- Pilih Vendor --
                    </option>
                    {vendors.map(v => (
                      <option key={v.id} value={v.id} style={{ background: '#ffffff', color: '#0f172a' }}>
                        {v.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group" style={{ width: '150px' }}>
                  <label htmlFor="usage-year">Tahun Ajaran *</label>
                  <select
                    id="usage-year"
                    value={usageAcademicYear}
                    onChange={e => setUsageAcademicYear(e.target.value)}
                    required
                    style={{ background: '#f8fafc', color: '#0f172a' }}
                  >
                    {forecastYearOptions.map(yr => (
                      <option key={yr} value={yr} style={{ background: '#ffffff', color: '#0f172a' }}>
                        {yr}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="usage-fabric">Jenis Bahan Kain Terpakai *</label>
                <select
                  id="usage-fabric"
                  value={usageFabricType}
                  onChange={e => setUsageFabricType(e.target.value)}
                  required
                  style={{ background: '#f8fafc', color: '#0f172a' }}
                >
                  {STANDARD_FABRIC_TYPES.map(ft => (
                    <option key={ft} value={ft} style={{ background: '#ffffff', color: '#0f172a' }}>
                      {ft}
                    </option>
                  ))}
                </select>
              </div>

              <div className="kain-modal-row">
                <div className="form-group flex-1">
                  <label htmlFor="usage-date">Tanggal Setor Baju *</label>
                  <input
                    id="usage-date"
                    type="date"
                    value={usageDate}
                    onChange={e => setUsageDate(e.target.value)}
                    required
                    style={{ background: '#f8fafc', color: '#0f172a' }}
                  />
                </div>
                <div className="form-group flex-1">
                  <label htmlFor="usage-doc">No. SPK / Bukti Setor</label>
                  <input
                    id="usage-doc"
                    type="text"
                    placeholder="mis. SPK-2027-01 / BAST-05"
                    value={usageDocNo}
                    onChange={e => setUsageDocNo(e.target.value)}
                    style={{ background: '#f8fafc', color: '#0f172a' }}
                  />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="usage-garment-pcs">Jumlah Baju Jadi yang Disetor (pcs) *</label>
                <input
                  id="usage-garment-pcs"
                  type="number"
                  min="1"
                  placeholder="mis. 500"
                  value={usageGarmentPcs || ''}
                  onChange={e => {
                    const pcs = Math.max(0, parseInt(e.target.value) || 0);
                    setUsageGarmentPcs(pcs);
                    if (pcs > 0 && usageLengthYards === 0) {
                      const estYd = Number((pcs * 1.25).toFixed(1));
                      setUsageLengthYards(estYd);
                      setUsageLengthMeters(Number((estYd * 0.9144).toFixed(2)));
                    }
                  }}
                  required
                  style={{ background: '#f8fafc', color: '#0f172a', fontWeight: 700 }}
                />
              </div>

              <div className="kain-modal-row">
                <div className="form-group flex-1">
                  <label htmlFor="usage-yards">Kain yang Terpakai (Yard) *</label>
                  <input
                    id="usage-yards"
                    type="number"
                    step="0.1"
                    min="0"
                    value={usageLengthYards || ''}
                    onChange={e => {
                      const val = Math.max(0, parseFloat(e.target.value) || 0);
                      setUsageLengthYards(val);
                      setUsageLengthMeters(Number((val * 0.9144).toFixed(2)));
                    }}
                    required
                    style={{ background: '#f8fafc', color: '#0f172a', fontWeight: 700 }}
                  />
                </div>

                <div className="form-group flex-1">
                  <label htmlFor="usage-meters">Kain yang Terpakai (Meter)</label>
                  <input
                    id="usage-meters"
                    type="number"
                    step="0.1"
                    min="0"
                    value={usageLengthMeters || ''}
                    onChange={e => {
                      const val = Math.max(0, parseFloat(e.target.value) || 0);
                      setUsageLengthMeters(val);
                      setUsageLengthYards(Number((val / 0.9144).toFixed(2)));
                    }}
                    style={{ background: '#f8fafc', color: '#0f172a' }}
                  />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="usage-claim-remain">Klaim Sisa Kain Riil di Vendor (Opsional)</label>
                <input
                  id="usage-claim-remain"
                  type="text"
                  placeholder="mis. Vendor melapor sisa 35 yard di rak bengkel"
                  value={usageClaimRemainingYards}
                  onChange={e => setUsageClaimRemainingYards(e.target.value)}
                  style={{ background: '#f8fafc', color: '#0f172a' }}
                />
              </div>

              <div className="form-group">
                <label htmlFor="usage-notes">Catatan Tambahan</label>
                <textarea
                  id="usage-notes"
                  rows={2}
                  placeholder="Catatan hasil potong vendor / kondisi sisa kain..."
                  value={usageNotes}
                  onChange={e => setUsageNotes(e.target.value)}
                  style={{ background: '#f8fafc', color: '#0f172a', borderRadius: '8px', padding: '8px' }}
                />
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="kain-btn-reset"
                  onClick={() => setShowUsageModal(false)}
                  disabled={usageSaving}
                >
                  Batal
                </button>
                <button type="submit" className="kain-btn-save" disabled={usageSaving}>
                  {usageSaving ? 'Menyimpan...' : '✓ Simpan Laporan Setor'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: CATAT SALDO AWAL / OPNAME PENYESUAIAN */}
      {showInitialModal && !readOnly && (
        <div
          className="modal-overlay"
          onClick={() => {
            if (!initialSaving) setShowInitialModal(false);
          }}
        >
          <div className="modal kain-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '560px' }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>⚖️</span> Saldo Awal / Opname Fisik Kain Vendor
            </h3>
            <p className="kain-modal-desc">
              Masukkan saldo awal sisa kain bawaan secara manual atau sesuaikan angka opname fisik di bengkel vendor.
            </p>

            <form onSubmit={handleSaveInitialMutation} className="modal-form">
              <div className="kain-modal-row">
                <div className="form-group flex-1">
                  <label htmlFor="initial-vendor">Vendor *</label>
                  <select
                    id="initial-vendor"
                    value={initialVendorId}
                    onChange={e => setInitialVendorId(e.target.value)}
                    required
                    style={{ background: '#f8fafc', color: '#0f172a' }}
                  >
                    <option value="" style={{ background: '#ffffff', color: '#0f172a' }}>
                      -- Pilih Vendor --
                    </option>
                    {vendors.map(v => (
                      <option key={v.id} value={v.id} style={{ background: '#ffffff', color: '#0f172a' }}>
                        {v.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group" style={{ width: '150px' }}>
                  <label htmlFor="initial-year">Tahun Ajaran *</label>
                  <select
                    id="initial-year"
                    value={initialAcademicYear}
                    onChange={e => setInitialAcademicYear(e.target.value)}
                    required
                    style={{ background: '#f8fafc', color: '#0f172a' }}
                  >
                    {forecastYearOptions.map(yr => (
                      <option key={yr} value={yr} style={{ background: '#ffffff', color: '#0f172a' }}>
                        {yr}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="kain-modal-row">
                <div className="form-group flex-1">
                  <label htmlFor="initial-type">Tipe Catatan *</label>
                  <select
                    id="initial-type"
                    value={initialType}
                    onChange={e => setInitialType(e.target.value as 'initial' | 'adjustment')}
                    required
                    style={{ background: '#f8fafc', color: '#0f172a' }}
                  >
                    <option value="initial">📦 Saldo Awal TA</option>
                    <option value="adjustment">⚖️ Penyesuaian Opname Fisik</option>
                  </select>
                </div>

                <div className="form-group flex-1">
                  <label htmlFor="initial-fabric">Jenis Bahan Kain *</label>
                  <select
                    id="initial-fabric"
                    value={initialFabricType}
                    onChange={e => setInitialFabricType(e.target.value)}
                    required
                    style={{ background: '#f8fafc', color: '#0f172a' }}
                  >
                    {STANDARD_FABRIC_TYPES.map(ft => (
                      <option key={ft} value={ft} style={{ background: '#ffffff', color: '#0f172a' }}>
                        {ft}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="kain-modal-row">
                <div className="form-group flex-1">
                  <label htmlFor="initial-date">Tanggal *</label>
                  <input
                    id="initial-date"
                    type="date"
                    value={initialDate}
                    onChange={e => setInitialDate(e.target.value)}
                    required
                    style={{ background: '#f8fafc', color: '#0f172a' }}
                  />
                </div>
                <div className="form-group" style={{ width: '130px' }}>
                  <label htmlFor="initial-rolls">Jumlah Roll</label>
                  <input
                    id="initial-rolls"
                    type="number"
                    value={initialRolls}
                    onChange={e => setInitialRolls(parseInt(e.target.value) || 0)}
                    style={{ background: '#f8fafc', color: '#0f172a' }}
                  />
                </div>
              </div>

              <div className="kain-modal-row">
                <div className="form-group flex-1">
                  <label htmlFor="initial-yards">Panjang (Yard) *</label>
                  <input
                    id="initial-yards"
                    type="number"
                    step="0.1"
                    value={initialLengthYards || ''}
                    onChange={e => {
                      const val = parseFloat(e.target.value) || 0;
                      setInitialLengthYards(val);
                      setInitialLengthMeters(Number((val * 0.9144).toFixed(2)));
                    }}
                    required
                    style={{ background: '#f8fafc', color: '#0f172a', fontWeight: 700 }}
                  />
                </div>

                <div className="form-group flex-1">
                  <label htmlFor="initial-meters">Panjang (Meter)</label>
                  <input
                    id="initial-meters"
                    type="number"
                    step="0.1"
                    value={initialLengthMeters || ''}
                    onChange={e => {
                      const val = parseFloat(e.target.value) || 0;
                      setInitialLengthMeters(val);
                      setInitialLengthYards(Number((val / 0.9144).toFixed(2)));
                    }}
                    style={{ background: '#f8fafc', color: '#0f172a' }}
                  />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="initial-notes">Keterangan / Alasan Penyesuaian</label>
                <textarea
                  id="initial-notes"
                  rows={2}
                  placeholder="mis. Saldo sisa fisik dihitung bersama mandor tanggal sekian..."
                  value={initialNotes}
                  onChange={e => setInitialNotes(e.target.value)}
                  style={{ background: '#f8fafc', color: '#0f172a', borderRadius: '8px', padding: '8px' }}
                />
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="kain-btn-reset"
                  onClick={() => setShowInitialModal(false)}
                  disabled={initialSaving}
                >
                  Batal
                </button>
                <button type="submit" className="kain-btn-save" disabled={initialSaving}>
                  {initialSaving ? 'Menyimpan...' : '✓ Simpan Saldo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default KopkarKalkulatorKain;
