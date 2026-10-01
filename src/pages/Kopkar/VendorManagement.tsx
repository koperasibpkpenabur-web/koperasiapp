import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useProducts } from '../../context/ProductContext';
import KopkarKalkulatorKain from './KopkarKalkulatorKain';
import './kopkar.css';

interface Vendor {
  id: string;
  name: string;
  contact_person: string;
  phone: string;
  address: string;
  created_at: string;
}

interface Plotting {
  id: string;
  vendor_id: string;
  school_user_id: string;
  vendors?: { name: string };
  app_users?: { school_name: string };
}

interface VendorStock {
  id: string;
  vendor_id: string;
  product_id: string;
  quantity: number;
  last_updated: string;
  vendors?: { name: string };
  products?: { name: string; level: string; type: string };
}

const VendorManagement = () => {
  const { products } = useProducts();
  const [activeTab, setActiveTab] = useState<'vendors' | 'plotting' | 'stock' | 'calculator'>('vendors');
  const [loading, setLoading] = useState(false);

  // Data
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [plottings, setPlottings] = useState<Plotting[]>([]);
  const [stocks, setStocks] = useState<VendorStock[]>([]);
  const [schools, setSchools] = useState<any[]>([]);

  // Modals
  const [showAddVendor, setShowAddVendor] = useState(false);
  const [showAddPlotting, setShowAddPlotting] = useState(false);
  const [showAddStock, setShowAddStock] = useState(false);

  // Form Vendor
  const [vendorName, setVendorName] = useState('');
  const [vendorContact, setVendorContact] = useState('');
  const [vendorPhone, setVendorPhone] = useState('');
  const [vendorAddress, setVendorAddress] = useState('');

  // Form Plotting
  const [plotVendorId, setPlotVendorId] = useState('');
  const [plotSchoolId, setPlotSchoolId] = useState('');

  // Form Stock
  const [stockVendorId, setStockVendorId] = useState('');
  const [stockProductId, setStockProductId] = useState('');
  const [stockQty, setStockQty] = useState(0);

  useEffect(() => {
    fetchVendors();
    fetchSchools();
  }, []);

  useEffect(() => {
    if (activeTab === 'plotting') fetchPlottings();
    if (activeTab === 'stock') fetchStocks();
  }, [activeTab]);

  const fetchVendors = async () => {
    setLoading(true);
    const { data } = await supabase.from('vendors').select('*').order('created_at', { ascending: false });
    if (data) setVendors(data);
    setLoading(false);
  };

  const fetchSchools = async () => {
    const { data } = await supabase.from('app_users').select('id, school_name').eq('role', 'sekolah');
    if (data) setSchools(data);
  };

  const fetchPlottings = async () => {
    setLoading(true);
    const { data } = await supabase.from('vendor_school_assignments').select('*, vendors(name), app_users(school_name)');
    if (data) setPlottings(data);
    setLoading(false);
  };

  const fetchStocks = async () => {
    setLoading(true);
    const { data } = await supabase.from('vendor_stocks').select('*, vendors(name), products(name, level, type)');
    if (data) setStocks(data);
    setLoading(false);
  };

  const handleAddVendor = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.from('vendors').insert({
      name: vendorName,
      contact_person: vendorContact,
      phone: vendorPhone,
      address: vendorAddress
    });
    if (!error) {
      alert('Vendor berhasil ditambahkan!');
      setShowAddVendor(false);
      setVendorName(''); setVendorContact(''); setVendorPhone(''); setVendorAddress('');
      fetchVendors();
    } else {
      alert('Gagal menambah vendor: ' + error.message);
    }
  };

  const handleAddPlotting = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!plotVendorId || !plotSchoolId) return;
    const { error } = await supabase.from('vendor_school_assignments').insert({
      vendor_id: plotVendorId,
      school_user_id: plotSchoolId
    });
    if (!error) {
      alert('Plotting berhasil disimpan!');
      setShowAddPlotting(false);
      setPlotSchoolId('');
      fetchPlottings();
    } else {
      alert('Gagal (mungkin sekolah ini sudah diplot ke vendor tersebut): ' + error.message);
    }
  };

  const handleAddStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stockVendorId || !stockProductId || stockQty <= 0) return;
    
    // Check if stock already exists for this vendor and product
    const existing = stocks.find(s => s.vendor_id === stockVendorId && s.product_id === stockProductId);
    
    if (existing) {
      const { error } = await supabase.from('vendor_stocks')
        .update({ quantity: existing.quantity + stockQty, last_updated: new Date().toISOString() })
        .eq('id', existing.id);
      if (!error) {
        alert('Stok vendor berhasil ditambahkan!');
        setShowAddStock(false);
        setStockQty(0);
        fetchStocks();
      }
    } else {
      const { error } = await supabase.from('vendor_stocks').insert({
        vendor_id: stockVendorId,
        product_id: stockProductId,
        quantity: stockQty
      });
      if (!error) {
        alert('Stok baru vendor berhasil dicatat!');
        setShowAddStock(false);
        setStockQty(0);
        fetchStocks();
      } else {
        alert('Gagal menambah stok: ' + error.message);
      }
    }
  };

  const handleDeleteVendor = async (id: string) => {
    if(!window.confirm('Hapus vendor ini? Semua plotting dan stok terkait akan terhapus.')) return;
    await supabase.from('vendors').delete().eq('id', id);
    fetchVendors();
  };

  const handleDeletePlotting = async (id: string) => {
    if(!window.confirm('Hapus plotting ini?')) return;
    await supabase.from('vendor_school_assignments').delete().eq('id', id);
    fetchPlottings();
  };

  return (
    <div className="kopkar-dashboard">
      <div className="kopkar-header" style={{ marginBottom: '24px' }}>
        <h2 className="kopkar-title">🏭 Manajemen Vendor</h2>
        <p className="kopkar-subtitle">Pusat kendali plotting penjahit ke sekolah, penerimaan stok, dan kalkulasi kain.</p>
      </div>

      {/* Tabs */}
      <div className="kopkar-tabs" style={{ marginBottom: '24px', display: 'flex', gap: '16px', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px', flexWrap: 'wrap' }}>
        <button className={`btn-tab ${activeTab === 'vendors' ? 'active' : ''}`} onClick={() => setActiveTab('vendors')} style={{ fontWeight: activeTab === 'vendors' ? 'bold' : 'normal', background: 'none', border: 'none', cursor: 'pointer', color: activeTab === 'vendors' ? '#0284c7' : '#64748b' }}>
          🏢 Daftar Vendor
        </button>
        <button className={`btn-tab ${activeTab === 'plotting' ? 'active' : ''}`} onClick={() => setActiveTab('plotting')} style={{ fontWeight: activeTab === 'plotting' ? 'bold' : 'normal', background: 'none', border: 'none', cursor: 'pointer', color: activeTab === 'plotting' ? '#0284c7' : '#64748b' }}>
          🔗 Plotting Sekolah
        </button>
        <button className={`btn-tab ${activeTab === 'stock' ? 'active' : ''}`} onClick={() => setActiveTab('stock')} style={{ fontWeight: activeTab === 'stock' ? 'bold' : 'normal', background: 'none', border: 'none', cursor: 'pointer', color: activeTab === 'stock' ? '#0284c7' : '#64748b' }}>
          📦 Stok Barang Jadi
        </button>
        <button className={`btn-tab ${activeTab === 'calculator' ? 'active' : ''}`} onClick={() => setActiveTab('calculator')} style={{ fontWeight: activeTab === 'calculator' ? 'bold' : 'normal', background: 'none', border: 'none', cursor: 'pointer', color: activeTab === 'calculator' ? '#0284c7' : '#64748b' }}>
          🧮 Kalkulator Kain
        </button>
      </div>

      {/* VENDORS TAB */}
      {activeTab === 'vendors' && (
        <div className="kopkar-table-container">
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
            <button className="btn-primary" onClick={() => setShowAddVendor(true)}>+ Tambah Vendor Baru</button>
          </div>
          <table className="kopkar-table">
            <thead>
              <tr>
                <th>Nama Vendor</th>
                <th>Kontak / PIC</th>
                <th>Telepon</th>
                <th>Alamat</th>
                <th style={{ textAlign: 'center' }}>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading ? <tr><td colSpan={5} style={{textAlign:'center'}}>Memuat...</td></tr> : 
               vendors.length === 0 ? <tr><td colSpan={5} style={{textAlign:'center'}}>Belum ada vendor terdaftar</td></tr> :
               vendors.map(v => (
                 <tr key={v.id}>
                   <td><strong>{v.name}</strong></td>
                   <td>{v.contact_person || '-'}</td>
                   <td>{v.phone || '-'}</td>
                   <td>{v.address || '-'}</td>
                   <td style={{ textAlign: 'center' }}>
                     <button className="btn-danger" onClick={() => handleDeleteVendor(v.id)} style={{ padding: '4px 8px', fontSize: '0.8rem' }}>Hapus</button>
                   </td>
                 </tr>
               ))
              }
            </tbody>
          </table>
        </div>
      )}

      {/* PLOTTING TAB */}
      {activeTab === 'plotting' && (
        <div className="kopkar-table-container">
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
            <button className="btn-primary" onClick={() => setShowAddPlotting(true)}>+ Plot Sekolah Baru</button>
          </div>
          <table className="kopkar-table">
            <thead>
              <tr>
                <th>Nama Vendor (Penjahit)</th>
                <th>Sekolah yang Dilayani</th>
                <th style={{ textAlign: 'center' }}>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading ? <tr><td colSpan={3} style={{textAlign:'center'}}>Memuat...</td></tr> : 
               plottings.length === 0 ? <tr><td colSpan={3} style={{textAlign:'center'}}>Belum ada plotting</td></tr> :
               plottings.map(p => (
                 <tr key={p.id}>
                   <td><strong>{p.vendors?.name}</strong></td>
                   <td><span style={{ background: '#e0f2fe', color: '#0369a1', padding: '4px 8px', borderRadius: '4px', fontWeight: 600 }}>{p.app_users?.school_name}</span></td>
                   <td style={{ textAlign: 'center' }}>
                     <button className="btn-danger" onClick={() => handleDeletePlotting(p.id)} style={{ padding: '4px 8px', fontSize: '0.8rem' }}>Hapus</button>
                   </td>
                 </tr>
               ))
              }
            </tbody>
          </table>
        </div>
      )}

      {/* STOCK TAB */}
      {activeTab === 'stock' && (
        <div className="kopkar-table-container">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <p style={{ color: '#64748b' }}>Stok fisik yang sudah selesai dijahit dan *masih berada di lokasi vendor*.</p>
            <button className="btn-primary" onClick={() => setShowAddStock(true)}>+ Terima Barang Jadi</button>
          </div>
          <table className="kopkar-table">
            <thead>
              <tr>
                <th>Nama Vendor</th>
                <th>Nama Barang (Kategori)</th>
                <th style={{ textAlign: 'center' }}>Kuantitas Tersedia</th>
                <th>Update Terakhir</th>
              </tr>
            </thead>
            <tbody>
              {loading ? <tr><td colSpan={4} style={{textAlign:'center'}}>Memuat...</td></tr> : 
               stocks.length === 0 ? <tr><td colSpan={4} style={{textAlign:'center'}}>Belum ada stok dari vendor</td></tr> :
               stocks.map(s => (
                 <tr key={s.id}>
                   <td><strong>{s.vendors?.name}</strong></td>
                   <td>{s.products?.name} <span style={{fontSize:'0.8rem', color:'#64748b', display:'block'}}>{s.products?.type} - {s.products?.level}</span></td>
                   <td style={{ textAlign: 'center' }}>
                     <span style={{ fontSize: '1.2rem', fontWeight: 'bold', color: s.quantity > 0 ? '#15803d' : '#dc2626' }}>{s.quantity}</span> pcs
                   </td>
                   <td>{new Date(s.last_updated).toLocaleString('id-ID')}</td>
                 </tr>
               ))
              }
            </tbody>
          </table>
        </div>
      )}

      {/* CALCULATOR TAB */}
      {activeTab === 'calculator' && (
        <div style={{ marginTop: '-24px' }}>
          <KopkarKalkulatorKain />
        </div>
      )}

      {/* MODALS */}
      {showAddVendor && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '500px' }}>
            <h3>Tambah Vendor Baru</h3>
            <form onSubmit={handleAddVendor} style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '16px' }}>
              <div>
                <label>Nama Vendor (Wajib)</label>
                <input required type="text" value={vendorName} onChange={e => setVendorName(e.target.value)} className="form-input" />
              </div>
              <div>
                <label>Nama Kontak (PIC)</label>
                <input type="text" value={vendorContact} onChange={e => setVendorContact(e.target.value)} className="form-input" />
              </div>
              <div>
                <label>Nomor Telepon</label>
                <input type="text" value={vendorPhone} onChange={e => setVendorPhone(e.target.value)} className="form-input" />
              </div>
              <div>
                <label>Alamat Lengkap</label>
                <textarea value={vendorAddress} onChange={e => setVendorAddress(e.target.value)} className="form-input" rows={3}></textarea>
              </div>
              <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
                <button type="submit" className="btn-primary" style={{ flex: 1 }}>Simpan Vendor</button>
                <button type="button" className="btn-secondary" onClick={() => setShowAddVendor(false)} style={{ flex: 1 }}>Batal</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showAddPlotting && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '500px' }}>
            <h3>Plotting Vendor ke Sekolah</h3>
            <p style={{ fontSize: '0.9rem', color: '#64748b', marginBottom: '16px' }}>Pilih vendor mana yang akan mengerjakan seragam untuk sekolah mana.</p>
            <form onSubmit={handleAddPlotting} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label>Pilih Vendor</label>
                <select required value={plotVendorId} onChange={e => setPlotVendorId(e.target.value)} className="form-input">
                  <option value="">-- Pilih Vendor --</option>
                  {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              </div>
              <div>
                <label>Pilih Sekolah</label>
                <select required value={plotSchoolId} onChange={e => setPlotSchoolId(e.target.value)} className="form-input">
                  <option value="">-- Pilih Sekolah --</option>
                  {schools.map(s => <option key={s.id} value={s.id}>{s.school_name}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
                <button type="submit" className="btn-primary" style={{ flex: 1 }}>Simpan Plotting</button>
                <button type="button" className="btn-secondary" onClick={() => setShowAddPlotting(false)} style={{ flex: 1 }}>Batal</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showAddStock && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '500px' }}>
            <h3>Terima Barang Jadi dari Vendor</h3>
            <p style={{ fontSize: '0.9rem', color: '#64748b', marginBottom: '16px' }}>Catat penambahan stok fisik barang yang sudah siap di vendor.</p>
            <form onSubmit={handleAddStock} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label>Pilih Vendor Penghasil</label>
                <select required value={stockVendorId} onChange={e => setStockVendorId(e.target.value)} className="form-input">
                  <option value="">-- Pilih Vendor --</option>
                  {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              </div>
              <div>
                <label>Pilih Barang / Produk</label>
                <select required value={stockProductId} onChange={e => setStockProductId(e.target.value)} className="form-input">
                  <option value="">-- Pilih Barang --</option>
                  {products.map(p => <option key={p.id} value={p.id}>{p.name} ({p.level})</option>)}
                </select>
              </div>
              <div>
                <label>Jumlah Barang Selesai (pcs)</label>
                <input required type="number" min="1" value={stockQty || ''} onChange={e => setStockQty(Number(e.target.value))} className="form-input" />
              </div>
              <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
                <button type="submit" className="btn-primary" style={{ flex: 1 }}>Simpan Stok</button>
                <button type="button" className="btn-secondary" onClick={() => setShowAddStock(false)} style={{ flex: 1 }}>Batal</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default VendorManagement;
