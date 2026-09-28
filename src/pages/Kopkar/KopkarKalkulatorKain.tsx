import { useState, useMemo } from 'react';

type GarmentType = 'kemeja_pendek' | 'kemeja_panjang' | 'celana_pendek' | 'celana_panjang' | 'rok';

interface SizeRatio {
  id: string;
  name: string;
  panjangBaju: number;
  panjangLengan: number; // untuk celana/rok, ini bernilai 0 atau diabaikan tapi kita pakai field ini sbg panjang tambahan
  ratio: number;
const presetSizeCharts = {
  'baju_sd': [
    { id: '1', name: 'SS', panjangBaju: 50, panjangLengan: 16, ratio: 1 },
    { id: '2', name: 'S', panjangBaju: 52, panjangLengan: 17, ratio: 1 },
    { id: '3', name: 'M', panjangBaju: 54, panjangLengan: 18, ratio: 2 },
    { id: '4', name: 'L', panjangBaju: 56, panjangLengan: 19, ratio: 2 },
    { id: '5', name: 'XL', panjangBaju: 58, panjangLengan: 20, ratio: 2 },
    { id: '6', name: '3L', panjangBaju: 60, panjangLengan: 21, ratio: 1 },
    { id: '7', name: '4L', panjangBaju: 62, panjangLengan: 22, ratio: 1 },
  ],
  'baju_pramuka_penggalang_sd': [
    { id: '1', name: 'SS', panjangBaju: 54, panjangLengan: 18, ratio: 1 },
    { id: '2', name: 'S', panjangBaju: 56, panjangLengan: 19, ratio: 1 },
    { id: '3', name: 'M', panjangBaju: 58, panjangLengan: 20, ratio: 2 },
    { id: '4', name: 'L', panjangBaju: 60, panjangLengan: 21, ratio: 2 },
    { id: '5', name: 'XL', panjangBaju: 62, panjangLengan: 22, ratio: 2 },
    { id: '6', name: '3L', panjangBaju: 64, panjangLengan: 23, ratio: 1 },
    { id: '7', name: '4L', panjangBaju: 66, panjangLengan: 24, ratio: 1 },
  ],
  'celana_pendek_sd': [
    { id: '1', name: 'SS', panjangBaju: 35, panjangLengan: 0, ratio: 1 },
    { id: '2', name: 'S', panjangBaju: 37, panjangLengan: 0, ratio: 1 },
    { id: '3', name: 'M', panjangBaju: 39, panjangLengan: 0, ratio: 2 },
    { id: '4', name: 'L', panjangBaju: 41, panjangLengan: 0, ratio: 2 },
    { id: '5', name: 'XL', panjangBaju: 43, panjangLengan: 0, ratio: 2 },
    { id: '6', name: '3L', panjangBaju: 45, panjangLengan: 0, ratio: 1 },
    { id: '7', name: '4L', panjangBaju: 47, panjangLengan: 0, ratio: 1 },
  ],
  'rok_sd': [
    { id: '1', name: 'SS', panjangBaju: 42, panjangLengan: 0, ratio: 1 },
    { id: '2', name: 'S', panjangBaju: 44, panjangLengan: 0, ratio: 1 },
    { id: '3', name: 'M', panjangBaju: 46, panjangLengan: 0, ratio: 2 },
    { id: '4', name: 'L', panjangBaju: 48, panjangLengan: 0, ratio: 2 },
    { id: '5', name: 'XL', panjangBaju: 50, panjangLengan: 0, ratio: 2 },
    { id: '6', name: '3L', panjangBaju: 52, panjangLengan: 0, ratio: 1 },
    { id: '7', name: '4L', panjangBaju: 54, panjangLengan: 0, ratio: 1 },
  ],
};

const KopkarKalkulatorKain = () => {
  const [totalRolls, setTotalRolls] = useState<number>(1);
  const [yardsPerRoll, setYardsPerRoll] = useState<number>(60);
  const [fabricWidth] = useState<number>(150);
  const [defectTolerance, setDefectTolerance] = useState<number>(5); // 5%
  
  const [garmentType, setGarmentType] = useState<GarmentType>('kemeja_pendek');
  
  const [sizes, setSizes] = useState<SizeRatio[]>(presetSizeCharts['baju_sd']);

  const applyPreset = (presetKey: keyof typeof presetSizeCharts, type: GarmentType) => {
    setSizes(presetSizeCharts[presetKey].map(s => ({ ...s, id: Date.now().toString() + s.name })));
    setGarmentType(type);
  };

  const addSize = () => {
    setSizes([...sizes, { id: Date.now().toString(), name: '', panjangBaju: 0, panjangLengan: 0, ratio: 1 }]);
  };

  const removeSize = (id: string) => {
    setSizes(sizes.filter(s => s.id !== id));
  };

  const updateSize = (id: string, field: keyof SizeRatio, value: string | number) => {
    setSizes(sizes.map(s => s.id === id ? { ...s, [field]: value } : s));
  };

  // Logic Perhitungan
  const calculation = useMemo(() => {
    // 1 Yard = 91.44 cm
    const totalYards = totalRolls * yardsPerRoll;
    const grossLengthCm = totalYards * 91.44;
    
    // Potong persentase toleransi cacat kain & pinggiran
    const netLengthCm = grossLengthCm * (1 - (defectTolerance / 100));

    // Menghitung kebutuhan kain per pcs untuk masing-masing size
    // Asumsi: Lebar kain 150cm cukup untuk pola depan+belakang ditaruh bersebelahan.
    const sizesWithUsage = sizes.map(size => {
      let usageCm = 0;
      // Tambahan jahitan/kampuh/keliman
      const seamAllowance = 15; 
      
      switch (garmentType) {
        case 'kemeja_pendek':
          usageCm = size.panjangBaju + size.panjangLengan + seamAllowance;
          break;
        case 'kemeja_panjang':
          usageCm = size.panjangBaju + size.panjangLengan + (seamAllowance + 5);
          break;
        case 'celana_pendek':
        case 'rok':
          usageCm = size.panjangBaju + seamAllowance; // panjangLengan tidak dipakai
          break;
        case 'celana_panjang':
          usageCm = size.panjangBaju + (seamAllowance + 5); // panjangLengan tidak dipakai
          break;
      }
      return { ...size, usageCm };
    });

    // Menghitung panjang 1 SET (berdasarkan rasio)
    // Misal rasio S:2, M:4, L:2 -> 1 SET = 2pcs S + 4pcs M + 2pcs L
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

  }, [totalRolls, yardsPerRoll, defectTolerance, garmentType, sizes]);

  return (
    <div className="kopkar-container">
      <div className="kopkar-header">
        <div>
          <h2 className="kopkar-title">Kalkulator Efisiensi Kain</h2>
          <p className="kopkar-subtitle">Prediksi akurat jumlah seragam yang bisa dijahit dari gulungan kain, anti-kecurangan vendor.</p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
        {/* KOLOM INPUT */}
        <div style={{ flex: '1 1 400px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          <div style={{ background: '#fff', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
            <h3 style={{ marginTop: 0, marginBottom: '16px', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>📏</span> 1. Data Gulungan Kain
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div className="form-group">
                <label>Jml Gulungan (Roll)</label>
                <input type="number" min="1" value={totalRolls} onChange={e => setTotalRolls(Number(e.target.value))} />
              </div>
              <div className="form-group">
                <label>Yard per Gulung</label>
                <input type="number" min="1" value={yardsPerRoll} onChange={e => setYardsPerRoll(Number(e.target.value))} />
              </div>
              <div className="form-group">
                <label>Lebar Kain (cm)</label>
                <input type="number" value={fabricWidth} disabled style={{ background: '#f1f5f9' }} />
                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>*Asumsi standar bidang 150cm</span>
              </div>
              <div className="form-group">
                <label>Toleransi Cacat (%)</label>
                <input type="number" min="0" max="100" value={defectTolerance} onChange={e => setDefectTolerance(Number(e.target.value))} />
              </div>
            </div>
          </div>

          <div style={{ background: '#fff', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>👕</span> 2. Data Model & Size Chart
              </h3>
              <div className="form-group" style={{ margin: 0 }}>
                <select 
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === 'baju_sd') applyPreset('baju_sd', 'kemeja_pendek');
                    if (val === 'baju_pramuka_penggalang_sd') applyPreset('baju_pramuka_penggalang_sd', 'kemeja_pendek');
                    if (val === 'celana_pendek_sd') applyPreset('celana_pendek_sd', 'celana_pendek');
                    if (val === 'rok_sd') applyPreset('rok_sd', 'rok');
                  }}
                  style={{ padding: '6px 12px', fontSize: '0.85rem', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '6px' }}
                >
                  <option value="">-- Load Size Chart Otomatis --</option>
                  <option value="baju_sd">Baju SD / Pramuka Siaga</option>
                  <option value="baju_pramuka_penggalang_sd">Baju Pramuka Penggalang SD</option>
                  <option value="celana_pendek_sd">Celana Pendek SD (Semua)</option>
                  <option value="rok_sd">Rok / Kulot SD (Siaga)</option>
                </select>
              </div>
            </div>
            
            <div className="form-group" style={{ marginBottom: '20px' }}>
              <label>Jenis Pakaian</label>
              <select value={garmentType} onChange={e => setGarmentType(e.target.value as GarmentType)}>
                <option value="kemeja_pendek">Atasan / Kemeja (Lengan Pendek)</option>
                <option value="kemeja_panjang">Atasan / Kemeja (Lengan Panjang)</option>
                <option value="celana_pendek">Celana Pendek</option>
                <option value="celana_panjang">Celana Panjang</option>
                <option value="rok">Rok</option>
              </select>
            </div>

            <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '60px 1fr 1fr 60px 40px', gap: '8px', marginBottom: '8px', fontWeight: 600, fontSize: '0.8rem', color: '#475569' }}>
                <div>Size</div>
                <div>P. Baju (cm)</div>
                <div>P. Lengan (cm)</div>
                <div>Rasio</div>
                <div></div>
              </div>
              
              {sizes.map((s) => (
                <div key={s.id} style={{ display: 'grid', gridTemplateColumns: '60px 1fr 1fr 60px 40px', gap: '8px', marginBottom: '8px' }}>
                  <input type="text" value={s.name} placeholder="S/M/L" onChange={e => updateSize(s.id, 'name', e.target.value)} />
                  <input type="number" value={s.panjangBaju || ''} placeholder="0" onChange={e => updateSize(s.id, 'panjangBaju', Number(e.target.value))} />
                  <input 
                    type="number" 
                    value={s.panjangLengan || ''} 
                    placeholder="0" 
                    onChange={e => updateSize(s.id, 'panjangLengan', Number(e.target.value))} 
                    disabled={garmentType.includes('celana') || garmentType === 'rok'}
                    style={{ opacity: (garmentType.includes('celana') || garmentType === 'rok') ? 0.5 : 1 }}
                  />
                  <input type="number" min="1" value={s.ratio || ''} onChange={e => updateSize(s.id, 'ratio', Number(e.target.value))} />
                  <button onClick={() => removeSize(s.id)} style={{ background: '#fee2e2', color: '#ef4444', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>✕</button>
                </div>
              ))}
              <button onClick={addSize} style={{ width: '100%', padding: '8px', marginTop: '8px', background: '#e2e8f0', border: '1px dashed #94a3b8', borderRadius: '6px', color: '#475569', cursor: 'pointer', fontWeight: 600 }}>
                + Tambah Size
              </button>
            </div>
          </div>
        </div>

        {/* KOLOM HASIL */}
        <div style={{ flex: '1 1 350px' }}>
          <div style={{ background: '#0f172a', padding: '24px', borderRadius: '12px', color: '#fff', position: 'sticky', top: '24px' }}>
            <h3 style={{ marginTop: 0, marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid #334155', paddingBottom: '16px' }}>
              <span>🎯</span> Prediksi Hasil Vendor
            </h3>

            <div style={{ marginBottom: '24px' }}>
              <div style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: '4px' }}>Total Pakaian Jadi (Estimasi)</div>
              <div style={{ fontSize: '3rem', fontWeight: 800, color: '#10b981', lineHeight: '1.1' }}>
                {calculation.totalPcs} <span style={{ fontSize: '1.2rem', fontWeight: 500, color: '#94a3b8' }}>pcs</span>
              </div>
            </div>

            <div style={{ background: '#1e293b', borderRadius: '8px', padding: '16px', marginBottom: '24px' }}>
              <div style={{ fontSize: '0.85rem', color: '#cbd5e1', marginBottom: '12px', fontWeight: 600, borderBottom: '1px solid #334155', paddingBottom: '8px' }}>
                Rincian Per Size (Rasio)
              </div>
              {calculation.results.map((res, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '0.95rem' }}>
                  <span>Size {res.name || '?'} <span style={{ color: '#64748b', fontSize: '0.8rem' }}>(butuh {res.usageCm}cm)</span></span>
                  <span style={{ fontWeight: 700, color: '#38bdf8' }}>{res.qty} pcs</span>
                </div>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '0.8rem' }}>
              <div style={{ background: '#1e293b', padding: '12px', borderRadius: '6px' }}>
                <div style={{ color: '#94a3b8', marginBottom: '4px' }}>Kain Kotor (Kirim)</div>
                <div style={{ fontWeight: 600 }}>{(calculation.grossLengthCm / 100).toFixed(2)} Meter</div>
              </div>
              <div style={{ background: '#1e293b', padding: '12px', borderRadius: '6px' }}>
                <div style={{ color: '#94a3b8', marginBottom: '4px' }}>Kain Bersih (-{defectTolerance}%)</div>
                <div style={{ fontWeight: 600 }}>{(calculation.netLengthCm / 100).toFixed(2)} Meter</div>
              </div>
              <div style={{ background: '#1e293b', padding: '12px', borderRadius: '6px' }}>
                <div style={{ color: '#94a3b8', marginBottom: '4px' }}>Terpakai Baju</div>
                <div style={{ fontWeight: 600 }}>{(calculation.usedLengthCm / 100).toFixed(2)} Meter</div>
              </div>
              <div style={{ background: '#1e293b', padding: '12px', borderRadius: '6px' }}>
                <div style={{ color: '#94a3b8', marginBottom: '4px' }}>Sisa / Perca</div>
                <div style={{ fontWeight: 600, color: '#fbbf24' }}>{(calculation.remainingLengthCm / 100).toFixed(2)} Meter</div>
              </div>
            </div>
            
            <div style={{ marginTop: '24px', fontSize: '0.75rem', color: '#64748b', lineHeight: '1.4' }}>
              *Kalkulasi ini menggunakan standar industri (bidang kain 150cm) dimana pola badan muat berdampingan, lalu ditambah margin kampuh/keliman potong 15-20cm per baju. Gunakan ini sbg target/acuan vendor.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default KopkarKalkulatorKain;
