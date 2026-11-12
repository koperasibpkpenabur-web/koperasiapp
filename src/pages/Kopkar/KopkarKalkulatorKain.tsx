import { useState, useMemo, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
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

interface KalkulatorKainProps {
  readOnly?: boolean;
}

const KopkarKalkulatorKain = ({ readOnly = false }: KalkulatorKainProps) => {
  const [totalRolls, setTotalRolls] = useState<number>(1);
  const [yardsPerRoll, setYardsPerRoll] = useState<number>(60);
  const [fabricWidth] = useState<number>(150);
  const [defectTolerance, setDefectTolerance] = useState<number>(5);

  const [selectedLevel, setSelectedLevel] = useState<JenjangFilter>('SEMUA');
  const [customPresets, setCustomPresets] = useState<PresetDef[]>([]);
  const [savedOverrides, setSavedOverrides] = useState<Record<string, SizeChartEntry[]>>({});
  const [selectedPresetKey, setSelectedPresetKey] = useState<string>(PRESETS[0].key);
  const [sizes, setSizes] = useState<SizeRatio[]>(() => toSizeRows(PRESETS[0].key, PRESETS[0].sizes, 'init'));
  const [isDirty, setIsDirty] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

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

  // Logic Perhitungan
  const calculation = useMemo(() => {
    const totalYards = totalRolls * yardsPerRoll;
    const grossLengthCm = totalYards * 91.44;
    const netLengthCm = grossLengthCm * (1 - defectTolerance / 100);

    if (!currentPreset) {
      return {
        grossLengthCm,
        netLengthCm,
        lengthPerSet: 0,
        totalRatioParts: 0,
        maxSets: 0,
        results: [] as { name: string; qty: number; usageCm: number; totalUsageCm: number }[],
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
        const pBaju = data.panjangBaju || 0;
        const pLengan = data.panjangLengan || 0;
        usageCm = pBaju + pLengan + seamAllowance;
      } else if (type === 'rompi') {
        const pBaju = data.panjangBaju || 0;
        usageCm = pBaju + seamAllowance;
      } else if (type === 'celana') {
        const pCelana = data.panjangCelana || 0;
        usageCm = pCelana + seamAllowance + 5;
      } else if (type === 'rok') {
        const pRok = data.panjangRok || 0;
        usageCm = pRok + seamAllowance;
      }

      return { ...size, usageCm };
    });

    const lengthPerSet = sizesWithUsage.reduce((acc, curr) => acc + curr.usageCm * curr.ratio, 0);
    const totalRatioParts = sizesWithUsage.reduce((acc, curr) => acc + curr.ratio, 0);

    let maxSets = 0;
    let results: { name: string; qty: number; usageCm: number; totalUsageCm: number }[] = [];

    if (lengthPerSet > 0) {
      maxSets = Math.floor(netLengthCm / lengthPerSet);

      results = sizesWithUsage.map(s => {
        const qty = maxSets * s.ratio;
        return {
          name: s.name,
          qty,
          usageCm: s.usageCm,
          totalUsageCm: qty * s.usageCm,
        };
      });
    }

    const usedLengthCm = maxSets * lengthPerSet;
    const remainingLengthCm = netLengthCm - usedLengthCm;

    return {
      grossLengthCm,
      netLengthCm,
      lengthPerSet,
      totalRatioParts,
      maxSets,
      results,
      usedLengthCm,
      remainingLengthCm,
      totalPcs: maxSets * totalRatioParts,
    };
  }, [totalRolls, yardsPerRoll, defectTolerance, currentPreset, sizes]);

  return (
    <div className="kain-calculator">
      {/* SECTION 1: DATA GULUNGAN KAIN */}
      <div className="kain-card">
        <div className="kain-card-header">
          <h3 className="kain-card-title">
            <span>📏</span> 1. Data Gulungan Kain
          </h3>
          <p className="kain-card-subtitle">
            Masukkan jumlah roll kain, panjang per gulungan, dan toleransi cacat kain sebelum dipotong vendor.
          </p>
        </div>

        <div className="kain-roll-grid">
          <div className="kain-field">
            <label htmlFor="kain-total-rolls">Jml Gulungan (Roll)</label>
            <div className={`kain-input-group ${readOnly ? 'is-disabled' : ''}`}>
              <input
                id="kain-total-rolls"
                type="number"
                min={1}
                disabled={readOnly}
                className="kain-field-input"
                placeholder="1"
                value={totalRolls === 0 ? '' : totalRolls}
                onFocus={e => e.target.select()}
                onChange={e => setTotalRolls(Math.max(0, Number(e.target.value) || 0))}
              />
              <span className="kain-input-unit">Roll</span>
            </div>
          </div>

          <div className="kain-field">
            <label htmlFor="kain-yards-roll">Yard per Gulung</label>
            <div className={`kain-input-group ${readOnly ? 'is-disabled' : ''}`}>
              <input
                id="kain-yards-roll"
                type="number"
                min={1}
                disabled={readOnly}
                className="kain-field-input"
                placeholder="60"
                value={yardsPerRoll === 0 ? '' : yardsPerRoll}
                onFocus={e => e.target.select()}
                onChange={e => setYardsPerRoll(Math.max(0, Number(e.target.value) || 0))}
              />
              <span className="kain-input-unit">Yard</span>
            </div>
          </div>

          <div className="kain-field">
            <label htmlFor="kain-fabric-width">Lebar Kain (cm)</label>
            <div className="kain-input-group is-disabled">
              <input
                id="kain-fabric-width"
                type="number"
                value={fabricWidth}
                disabled
                className="kain-field-input"
              />
              <span className="kain-input-unit">cm</span>
            </div>
            <span className="kain-field-hint">*Standar bidang 150cm</span>
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
          <h3 className="kain-summary-title">
            <span>🎯</span> Prediksi Hasil Vendor
          </h3>

          <div className="kain-summary-hero">
            <div className="kain-summary-hero-label">Total Pakaian Jadi (Estimasi)</div>
            <div className="kain-summary-hero-value">
              {calculation.totalPcs}
              <span className="kain-summary-hero-unit">pcs</span>
            </div>
            <div className="kain-summary-hero-meta">
              {calculation.maxSets} set produksi &times; {calculation.totalRatioParts} pcs/set
            </div>
          </div>

          <div className="kain-breakdown-box">
            <div className="kain-breakdown-header">
              Rincian Per Size (Rasio)
            </div>
            <div className="kain-breakdown-list">
              {calculation.results.length > 0 ? (
                calculation.results.map((res, i) => (
                  <div key={i} className="kain-breakdown-row">
                    <span className="kain-breakdown-name">
                      Size {res.name || '?'}
                      <span className="kain-breakdown-need">(butuh {res.usageCm}cm)</span>
                    </span>
                    <span className="kain-breakdown-qty">{res.qty} pcs</span>
                  </div>
                ))
              ) : (
                <div style={{ fontSize: '0.82rem', color: '#94a3b8' }}>
                  Isi panjang pola, rasio ukuran, dan jumlah gulungan kain untuk melihat rincian hasil.
                </div>
              )}
            </div>
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
            *Kalkulasi ini menggunakan standar industri (bidang kain 150cm) dimana pola badan muat berdampingan, lalu ditambah margin kampuh/keliman potong 15-20cm per baju. Hitungan kebutuhan kain hanya mengambil data Panjang Baju &amp; Panjang Lengan/Celana. Gunakan ini sbg target/acuan vendor.
          </div>
        </div>
      </div>

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
    </div>
  );
};

export default KopkarKalkulatorKain;
