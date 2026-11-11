import { useState, useMemo, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import './kopkar.css';

type GarmentType = 'kemeja' | 'celana' | 'rok' | 'rompi';

interface SizeRatio {
  id: string;
  name: string;
  data: Record<string, number>;
  ratio: number;
}

interface PresetDef {
  key: string;
  label: string;
  type: GarmentType;
  headers: { key: string; label: string }[];
  sizes: { name: string; data: Record<string, number>; ratio: number }[];
}

const PRESETS: PresetDef[] = [
  // =================== SD ===================
  {
    key: 'baju_sd',
    label: 'Baju Putra/Putri SD',
    type: 'kemeja',
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
  
  // =================== SMP & SMA ===================
  {
    key: 'baju_smp_sma',
    label: 'Baju Putra/Putri SMP / SMA / SPK',
    type: 'kemeja',
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
  
  const [selectedPresetKey, setSelectedPresetKey] = useState<string>(PRESETS[0].key);
  const currentPreset = useMemo(
    () => PRESETS.find(p => p.key === selectedPresetKey) || PRESETS[0],
    [selectedPresetKey]
  );
  const [sizes, setSizes] = useState<SizeRatio[]>(() =>
    PRESETS[0].sizes.map((s, idx) => ({ ...s, id: `${PRESETS[0].key}-${idx}` }))
  );

  useEffect(() => {
    let active = true;
    const preset = PRESETS.find(p => p.key === selectedPresetKey) || PRESETS[0];

    const loadFromSupabase = async () => {
      try {
        const { data, error } = await supabase
          .from('kalkulator_size_charts')
          .select('sizes_data')
          .eq('preset_key', preset.key)
          .single();

        if (error && error.code !== 'PGRST116') {
          throw error;
        }

        if (!active) return;
        if (data && data.sizes_data) {
          setSizes(data.sizes_data.map((s: any, idx: number) => ({ ...s, id: `${preset.key}-db-${idx}` })));
        } else {
          setSizes(preset.sizes.map((s, idx) => ({ ...s, id: `${preset.key}-${idx}` })));
        }
      } catch (err) {
        console.error('Error fetching size chart from supabase:', err);
        if (active) {
          setSizes(preset.sizes.map((s, idx) => ({ ...s, id: `${preset.key}-${idx}` })));
        }
      }
    };

    loadFromSupabase();
    return () => {
      active = false;
    };
  }, [selectedPresetKey]);

  const savePresetToSupabase = async () => {
    if (readOnly) return;
    const presetData = sizes.map(s => ({ name: s.name, ratio: s.ratio, data: s.data }));
    try {
      // Upsert: update if exists, insert if not. Supabase uses the unique preset_key to resolve conflict.
      const { error } = await supabase
        .from('kalkulator_size_charts')
        .upsert({ preset_key: selectedPresetKey, sizes_data: presetData }, { onConflict: 'preset_key' });
      
      if (error) throw error;
      alert('Size Chart berhasil disimpan ke database (Supabase)!');
    } catch (err: any) {
      alert('Gagal menyimpan: ' + err.message);
      console.error(err);
    }
  };

  const resetPresetToDefault = async () => {
    if (readOnly) return;
    if (!window.confirm('Kembalikan size chart ini ke pengaturan awal? Data di database juga akan dihapus.')) return;
    const preset = PRESETS.find(p => p.key === selectedPresetKey) || PRESETS[0];
    setSizes(preset.sizes.map(s => ({ ...s, id: Math.random().toString() })));
    
    try {
      await supabase.from('kalkulator_size_charts').delete().eq('preset_key', selectedPresetKey);
    } catch (err) {
      console.error(err);
    }
  };

  const updateSize = (id: string, field: string, value: string | number) => {
    setSizes(sizes.map(s => {
      if (s.id !== id) return s;
      if (field === 'name') {
        return { ...s, name: String(value) };
      }
      const cleanNumber = Math.max(0, Number(value) || 0);
      if (field === 'ratio') {
        return { ...s, ratio: cleanNumber };
      }
      return { ...s, data: { ...s.data, [field]: cleanNumber } };
    }));
  };

  const removeSize = (id: string) => {
    setSizes(sizes.filter(s => s.id !== id));
  };

  const addSize = () => {
    const emptyData: Record<string, number> = {};
    currentPreset.headers.forEach(h => { emptyData[h.key] = 0; });
    setSizes([...sizes, { id: Math.random().toString(), name: '', ratio: 1, data: emptyData }]);
  };

  // Logic Perhitungan
  const calculation = useMemo(() => {
    const totalYards = totalRolls * yardsPerRoll;
    const grossLengthCm = totalYards * 91.44;
    const netLengthCm = grossLengthCm * (1 - (defectTolerance / 100));

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

    const lengthPerSet = sizesWithUsage.reduce((acc, curr) => acc + (curr.usageCm * curr.ratio), 0);
    const totalRatioParts = sizesWithUsage.reduce((acc, curr) => acc + curr.ratio, 0);

    let maxSets = 0;
    let results: { name: string; qty: number; usageCm: number; totalUsageCm: number }[] = [];
    
    if (lengthPerSet > 0) {
      maxSets = Math.floor(netLengthCm / lengthPerSet);
      
      results = sizesWithUsage.map(s => {
        const qty = maxSets * s.ratio;
        return {
          name: s.name,
          qty: qty,
          usageCm: s.usageCm,
          totalUsageCm: qty * s.usageCm
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
      totalPcs: maxSets * totalRatioParts
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
              <span>👕</span> 2. Data Model & Size Chart
            </h3>
            {!readOnly && (
              <div className="kain-card-actions">
                <button type="button" onClick={resetPresetToDefault} className="kain-btn-reset">
                  ↺ Reset
                </button>
                <button type="button" onClick={savePresetToSupabase} className="kain-btn-save">
                  💾 Simpan Perubahan
                </button>
              </div>
            )}
          </div>

          <div className="kain-field kain-preset-field">
            <label htmlFor="kain-preset-select">Load Size Chart Otomatis (Sesuai Standar PDF Koperasi)</label>
            <select
              id="kain-preset-select"
              className="kain-select"
              value={selectedPresetKey}
              onChange={(e) => setSelectedPresetKey(e.target.value)}
            >
              <optgroup label="Seragam SD">
                {PRESETS.filter(p => p.key.includes('_sd')).map(p => (
                  <option key={p.key} value={p.key}>{p.label}</option>
                ))}
              </optgroup>
              <optgroup label="Seragam SMP & SMA & SPK">
                {PRESETS.filter(p => !p.key.includes('_sd')).map(p => (
                  <option key={p.key} value={p.key}>{p.label}</option>
                ))}
              </optgroup>
            </select>
          </div>

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
                            value={s.data[h.key] === 0 ? '' : s.data[h.key]}
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
    </div>
  );
};

export default KopkarKalkulatorKain;
