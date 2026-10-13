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
  clothing_type?: string;
  created_at?: string;
  vendors?: { name: string };
  app_users?: { school_name: string; username?: string; school_level?: string };
}

interface VendorStock {
  id: string;
  vendor_id: string;
  product_id: string;
  quantity: number;
  last_updated: string;
  vendors?: { name: string };
  products?: { name: string; level: string; category?: string; size?: string };
}

interface SchoolItem {
  id: string; // ID dari app_users untuk relasi foreign key
  email: string;
  school_name: string;
  level: string;
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 14px',
  borderRadius: '8px',
  border: '1px solid #cbd5e1',
  fontSize: '0.95rem',
  boxSizing: 'border-box',
  marginTop: '4px',
  color: '#1e293b',
  backgroundColor: '#fff',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.85rem',
  fontWeight: 600,
  color: '#475569',
  marginBottom: '2px',
};

const ActionMenu = ({
  onEdit,
  onDetail,
  onDelete,
  onAddStock,
}: {
  onEdit?: () => void;
  onDetail?: () => void;
  onDelete?: () => void;
  onAddStock?: () => void;
}) => {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        onBlur={() => setTimeout(() => setOpen(false), 250)}
        style={{
          background: '#f1f5f9',
          border: '1px solid #e2e8f0',
          borderRadius: '6px',
          cursor: 'pointer',
          fontSize: '1.1rem',
          padding: '4px 10px',
          color: '#475569',
          lineHeight: 1,
        }}
        title="Opsi Aksi"
      >
        ⋮
      </button>
      {open && (
        <div
          style={{
            position: 'absolute',
            right: 0,
            top: '110%',
            background: '#fff',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            boxShadow: '0 10px 25px -5px rgba(0,0,0,0.15)',
            zIndex: 100,
            minWidth: '145px',
            overflow: 'hidden',
          }}
        >
          {onDetail && (
            <button
              type="button"
              onMouseDown={onDetail}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '9px 16px',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: '0.85rem',
                color: '#334155',
              }}
              onMouseOver={(e) => (e.currentTarget.style.background = '#f8fafc')}
              onMouseOut={(e) => (e.currentTarget.style.background = 'none')}
            >
              👁️ Detail
            </button>
          )}
          {onAddStock && (
            <button
              type="button"
              onMouseDown={onAddStock}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '9px 16px',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: '0.85rem',
                color: '#0284c7',
                fontWeight: 600,
              }}
              onMouseOver={(e) => (e.currentTarget.style.background = '#f0f9ff')}
              onMouseOut={(e) => (e.currentTarget.style.background = 'none')}
            >
              📦 Input Stok
            </button>
          )}
          {onEdit && (
            <button
              type="button"
              onMouseDown={onEdit}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '9px 16px',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: '0.85rem',
                color: '#334155',
              }}
              onMouseOver={(e) => (e.currentTarget.style.background = '#f8fafc')}
              onMouseOut={(e) => (e.currentTarget.style.background = 'none')}
            >
              ✏️ Edit
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onMouseDown={onDelete}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '9px 16px',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: '0.85rem',
                color: '#ef4444',
                borderTop: onEdit || onDetail || onAddStock ? '1px solid #f1f5f9' : 'none',
              }}
              onMouseOver={(e) => (e.currentTarget.style.background = '#fef2f2')}
              onMouseOut={(e) => (e.currentTarget.style.background = 'none')}
            >
              🗑️ Hapus
            </button>
          )}
        </div>
      )}
    </div>
  );
};

const VendorManagement = () => {
  const { products } = useProducts();
  const [activeTab, setActiveTab] = useState<'vendors' | 'plotting' | 'stock' | 'calculator'>('vendors');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Data
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [plottings, setPlottings] = useState<Plotting[]>([]);
  const [stocks, setStocks] = useState<VendorStock[]>([]);
  const [schools, setSchools] = useState<SchoolItem[]>([]);

  // Search filter
  const [searchQuery, setSearchQuery] = useState('');

  // Modals Vendor
  const [showAddVendor, setShowAddVendor] = useState(false);
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);
  const [detailVendor, setDetailVendor] = useState<Vendor | null>(null);

  // Modals Plotting
  const [showAddPlotting, setShowAddPlotting] = useState(false);
  const [editingPlotting, setEditingPlotting] = useState<Plotting | null>(null);
  const [plotLevelFilter, setPlotLevelFilter] = useState('ALL');
  const [plotClothingType, setPlotClothingType] = useState('');

  // Form Plotting (Add)
  const [plotVendorId, setPlotVendorId] = useState('');
  const [plotSchoolId, setPlotSchoolId] = useState('');

  // Form Plotting (Edit)
  const [editPlotVendorId, setEditPlotVendorId] = useState('');
  const [editPlotSchoolId, setEditPlotSchoolId] = useState('');
  const [editPlotLevelFilter, setEditPlotLevelFilter] = useState('ALL');
  const [editPlotClothingType, setEditPlotClothingType] = useState('');

  // Modals Stock
  const [showAddStock, setShowAddStock] = useState(false);
  const [editingStock, setEditingStock] = useState<VendorStock | null>(null);

  // Form Vendor
  const [vendorName, setVendorName] = useState('');
  const [vendorContact, setVendorContact] = useState('');
  const [vendorPhone, setVendorPhone] = useState('');
  const [vendorAddress, setVendorAddress] = useState('');

  // Form Stock
  const [stockVendorId, setStockVendorId] = useState('');
  const [stockProductId, setStockProductId] = useState('');
  const [stockLevelFilter, setStockLevelFilter] = useState('ALL');
  const [stockQty, setStockQty] = useState(0);

  useEffect(() => {
    fetchVendors();
    fetchSchools();
  }, []);

  useEffect(() => {
    if (activeTab === 'vendors') fetchVendors();
    if (activeTab === 'plotting') fetchPlottings();
    if (activeTab === 'stock') fetchStocks();
  }, [activeTab]);

  const fetchVendors = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('vendors').select('*').order('created_at', { ascending: false });
    if (!error && data) setVendors(data);
    setLoading(false);
  };

  const fetchSchools = async () => {
    try {
      // 1. Ambil seluruh data sekolah dari school_whitelist (Google accounts BPK PENABUR)
      const { data: whitelistData, error: wlError } = await supabase
        .from('school_whitelist')
        .select('*')
        .order('nama_sekolah', { ascending: true });

      if (wlError || !whitelistData) {
        console.error('Error fetching school_whitelist:', wlError);
        return;
      }

      // 2. Ambil data app_users yang memiliki username berupa email
      const { data: appUsersData } = await supabase
        .from('app_users')
        .select('id, username, school_name, school_level')
        .ilike('username', '%@%');

      const userMap = new Map<string, { id: string; school_name: string; school_level: string }>();
      if (appUsersData) {
        appUsersData.forEach((u) => {
          userMap.set(u.username.toLowerCase().trim(), {
            id: u.id,
            school_name: u.school_name || '',
            school_level: u.school_level || '',
          });
        });
      }

      const list: SchoolItem[] = [];

      for (const w of whitelistData) {
        const emailClean = (w.email || '').toLowerCase().trim();
        if (!emailClean) continue;

        let appUser = userMap.get(emailClean);
        const rawJenjang = w.Jenjang || w.jenjang || appUser?.school_level || 'SMP';
        const cleanJenjang = typeof rawJenjang === 'string' ? rawJenjang.trim() : rawJenjang;
        const schoolName = (w.nama_sekolah || w.Nama_Sekolah || appUser?.school_name || emailClean).trim();

        // Jika belum ada di app_users, otomatis sinkronkan ke app_users
        if (!appUser) {
          const { data: newUser } = await supabase
            .from('app_users')
            .insert([{
              username: emailClean,
              password: '',
              name: schoolName,
              role: 'sekolah',
              school_name: schoolName,
              school_level: cleanJenjang,
            }])
            .select()
            .single();

          if (newUser) {
            appUser = {
              id: newUser.id,
              school_name: newUser.school_name || schoolName,
              school_level: newUser.school_level || cleanJenjang,
            };
            userMap.set(emailClean, appUser);
          }
        }

        if (appUser) {
          list.push({
            id: appUser.id,
            email: emailClean,
            school_name: schoolName,
            level: cleanJenjang,
          });
        }
      }

      // Urutkan berdasarkan nama sekolah secara alfabetis
      list.sort((a, b) => a.school_name.localeCompare(b.school_name));
      setSchools(list);
    } catch (err) {
      console.error('Error fetching schools from whitelist:', err);
    }
  };

  const fetchPlottings = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('vendor_school_assignments')
      .select('*, vendors(name), app_users(school_name, username, school_level)');

    if (!error && data) setPlottings(data);
    setLoading(false);
  };

  const fetchStocks = async () => {
    setLoading(true);
    // Join dengan products (name, level, category, size)
    const { data, error } = await supabase
      .from('vendor_stocks')
      .select('*, vendors(name), products(name, level, category, size)');

    if (!error && data) setStocks(data);
    setLoading(false);
  };

  // --- HANDLER VENDOR ---
  const handleAddVendor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vendorName.trim()) {
      alert('Nama Vendor wajib diisi');
      return;
    }

    setSubmitting(true);
    const { error } = await supabase.from('vendors').insert({
      name: vendorName.trim(),
      contact_person: vendorContact.trim(),
      phone: vendorPhone.trim(),
      address: vendorAddress.trim(),
    });
    setSubmitting(false);

    if (!error) {
      alert('Vendor berhasil ditambahkan!');
      setShowAddVendor(false);
      setVendorName('');
      setVendorContact('');
      setVendorPhone('');
      setVendorAddress('');
      fetchVendors();
    } else {
      alert('Gagal menambah vendor: ' + error.message);
    }
  };

  const handleUpdateVendor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingVendor || !editingVendor.name.trim()) {
      alert('Nama Vendor wajib diisi');
      return;
    }

    setSubmitting(true);
    const { error } = await supabase
      .from('vendors')
      .update({
        name: editingVendor.name.trim(),
        contact_person: editingVendor.contact_person?.trim() || '',
        phone: editingVendor.phone?.trim() || '',
        address: editingVendor.address?.trim() || '',
      })
      .eq('id', editingVendor.id);
    setSubmitting(false);

    if (!error) {
      alert('Data vendor berhasil diperbarui!');
      setEditingVendor(null);
      fetchVendors();
    } else {
      alert('Gagal memperbarui vendor: ' + error.message);
    }
  };

  const handleDeleteVendor = async (id: string, name: string) => {
    if (!window.confirm(`Yakin ingin menghapus vendor "${name}"? Semua plotting dan stok terkait vendor ini akan ikut terhapus.`)) return;

    setLoading(true);
    await supabase.from('vendor_school_assignments').delete().eq('vendor_id', id);
    await supabase.from('vendor_stocks').delete().eq('vendor_id', id);
    const { error } = await supabase.from('vendors').delete().eq('id', id);
    setLoading(false);

    if (!error) {
      alert('Vendor berhasil dihapus!');
      fetchVendors();
      fetchPlottings();
      fetchStocks();
    } else {
      alert('Gagal menghapus vendor: ' + error.message);
    }
  };

  // --- HANDLER PLOTTING ---
  const handleAddPlotting = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!plotVendorId || !plotSchoolId) {
      alert('Pilih vendor dan sekolah terlebih dahulu');
      return;
    }

    if (!plotClothingType) {
      alert('Pilih jenis baju yang diproduksi');
      return;
    }

    const alreadyExists = plottings.some(
      (p) =>
        p.vendor_id === plotVendorId &&
        p.school_user_id === plotSchoolId &&
        (p.clothing_type || 'Semua Jenis Baju') === plotClothingType
    );
    if (alreadyExists) {
      alert('Plotting dengan vendor, sekolah, dan jenis baju tersebut sudah terdaftar.');
      return;
    }

    setSubmitting(true);

    // Coba insert dengan field clothing_type
    let { error } = await supabase.from('vendor_school_assignments').insert({
      vendor_id: plotVendorId,
      school_user_id: plotSchoolId,
      clothing_type: plotClothingType,
    });

    // Fallback jika database belum menambahkan kolom clothing_type
    if (error && error.message.includes('clothing_type')) {
      const res = await supabase.from('vendor_school_assignments').insert({
        vendor_id: plotVendorId,
        school_user_id: plotSchoolId,
      });
      error = res.error;
    }

    setSubmitting(false);

    if (!error) {
      alert('Plotting sekolah berhasil disimpan!');
      setShowAddPlotting(false);
      setPlotSchoolId('');
      setPlotClothingType('');
      fetchPlottings();
    } else {
      alert('Gagal menyimpan plotting: ' + error.message);
    }
  };

  const handleOpenEditPlotting = (p: Plotting) => {
    setEditingPlotting(p);
    setEditPlotVendorId(p.vendor_id);
    setEditPlotSchoolId(p.school_user_id);
    setEditPlotClothingType(p.clothing_type || 'Semua Jenis Baju');
    const sch = schools.find((s) => s.id === p.school_user_id);
    if (sch) {
      setEditPlotLevelFilter(sch.level.toUpperCase());
    } else {
      setEditPlotLevelFilter('ALL');
    }
  };

  const handleUpdatePlotting = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPlotting) return;
    if (!editPlotVendorId || !editPlotSchoolId) {
      alert('Pilih vendor dan sekolah');
      return;
    }
    if (!editPlotClothingType) {
      alert('Pilih jenis baju yang diproduksi');
      return;
    }

    setSubmitting(true);
    let { error } = await supabase
      .from('vendor_school_assignments')
      .update({
        vendor_id: editPlotVendorId,
        school_user_id: editPlotSchoolId,
        clothing_type: editPlotClothingType,
      })
      .eq('id', editingPlotting.id);

    if (error && error.message.includes('clothing_type')) {
      const res = await supabase
        .from('vendor_school_assignments')
        .update({
          vendor_id: editPlotVendorId,
          school_user_id: editPlotSchoolId,
        })
        .eq('id', editingPlotting.id);
      error = res.error;
    }

    setSubmitting(false);

    if (!error) {
      alert('Plotting sekolah berhasil diperbarui!');
      setEditingPlotting(null);
      fetchPlottings();
    } else {
      alert('Gagal memperbarui plotting: ' + error.message);
    }
  };

  const handleDeletePlotting = async (id: string) => {
    if (!window.confirm('Hapus plotting sekolah ini?')) return;
    const { error } = await supabase.from('vendor_school_assignments').delete().eq('id', id);
    if (!error) {
      fetchPlottings();
    } else {
      alert('Gagal menghapus plotting: ' + error.message);
    }
  };

  // --- HANDLER STOCK ---
  const openAddStockModal = (preselectedVendorId?: string) => {
    if (preselectedVendorId) {
      setStockVendorId(preselectedVendorId);
    } else if (vendors.length > 0 && !stockVendorId) {
      setStockVendorId(vendors[0].id);
    }
    setStockProductId('');
    setStockLevelFilter('ALL');
    setStockQty(0);
    setShowAddStock(true);
  };

  const handleAddStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stockVendorId || !stockProductId || stockQty <= 0) {
      alert('Pilih vendor, barang, dan masukkan jumlah barang selesai yang valid (> 0)');
      return;
    }

    setSubmitting(true);
    const existing = stocks.find((s) => s.vendor_id === stockVendorId && s.product_id === stockProductId);

    let err: any = null;
    if (existing) {
      const newQty = existing.quantity + stockQty;
      const { error } = await supabase
        .from('vendor_stocks')
        .update({ quantity: newQty, last_updated: new Date().toISOString() })
        .eq('id', existing.id);
      err = error;
    } else {
      const { error } = await supabase.from('vendor_stocks').insert({
        vendor_id: stockVendorId,
        product_id: stockProductId,
        quantity: stockQty,
      });
      err = error;
    }

    setSubmitting(false);
    if (!err) {
      alert('Stok barang jadi vendor berhasil dicatat!');
      setShowAddStock(false);
      setStockQty(0);
      setStockProductId('');
      fetchStocks();
    } else {
      alert('Gagal menyimpan stok vendor: ' + err.message);
    }
  };

  const handleUpdateStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStock || editingStock.quantity < 0) {
      alert('Kuantitas stok tidak boleh bernilai negatif');
      return;
    }

    setSubmitting(true);
    const { error } = await supabase
      .from('vendor_stocks')
      .update({ quantity: editingStock.quantity, last_updated: new Date().toISOString() })
      .eq('id', editingStock.id);
    setSubmitting(false);

    if (!error) {
      alert('Stok vendor berhasil diperbarui!');
      setEditingStock(null);
      fetchStocks();
    } else {
      alert('Gagal memperbarui stok: ' + error.message);
    }
  };

  const handleDeleteStock = async (id: string) => {
    if (!window.confirm('Hapus pencatatan stok ini dari vendor?')) return;
    const { error } = await supabase.from('vendor_stocks').delete().eq('id', id);
    if (!error) {
      fetchStocks();
    } else {
      alert('Gagal menghapus stok: ' + error.message);
    }
  };

  // Filtered lists for search query
  const filteredVendors = vendors.filter(
    (v) =>
      v.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      v.contact_person?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      v.phone?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      v.address?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredPlottings = plottings.filter(
    (p) =>
      p.vendors?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.app_users?.school_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.app_users?.username?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.app_users?.school_level?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.clothing_type?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredStocks = stocks.filter(
    (s) =>
      s.vendors?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.products?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.products?.level?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.products?.category?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Products filtered by level for add stock modal
  const modalAvailableProducts =
    stockLevelFilter === 'ALL' ? products : products.filter((p) => p.level === stockLevelFilter);

  // Schools filtered by level for add plotting modal
  const filteredModalSchools =
    plotLevelFilter === 'ALL'
      ? schools
      : schools.filter((s) => s.level.toUpperCase() === plotLevelFilter);

  // Deteksi sekolah terpilih di modal tambah plotting untuk memanggil jenis baju sesuai jenjang
  const selectedPlotSchool = schools.find((s) => s.id === plotSchoolId);

  // Daftar jenis baju unik (tanpa ukuran) berdasarkan jenjang sekolah yang dipilih di modal tambah plotting
  const availableClothingTypes = Array.from(
    new Set(
      products
        .filter(
          (p) =>
            selectedPlotSchool &&
            p.level?.toUpperCase() === selectedPlotSchool.level?.toUpperCase() &&
            p.category === 'seragam'
        )
        .map((p) => p.name.trim())
    )
  ).sort();

  // Deteksi sekolah terpilih di modal edit plotting
  const selectedEditPlotSchool = schools.find((s) => s.id === editPlotSchoolId);

  // Daftar jenis baju unik (tanpa ukuran) berdasarkan jenjang sekolah yang dipilih di modal edit plotting
  const editAvailableClothingTypes = Array.from(
    new Set(
      products
        .filter(
          (p) =>
            selectedEditPlotSchool &&
            p.level?.toUpperCase() === selectedEditPlotSchool.level?.toUpperCase() &&
            p.category === 'seragam'
        )
        .map((p) => p.name.trim())
    )
  ).sort();

  // Filter sekolah di modal edit plotting
  const filteredEditModalSchools =
    editPlotLevelFilter === 'ALL'
      ? schools
      : schools.filter((s) => s.level.toUpperCase() === editPlotLevelFilter);

  return (
    <div className="kopkar-dashboard">
      <div className="kopkar-header" style={{ marginBottom: '24px' }}>
        <h2 className="kopkar-title">🏭 Manajemen Vendor</h2>
        <p className="kopkar-subtitle">Pusat kendali plotting penjahit ke sekolah, penerimaan stok barang jadi, dan kalkulasi kebutuhan kain.</p>
      </div>

      {/* Tabs */}
      <div
        className="kopkar-tabs"
        style={{
          marginBottom: '24px',
          display: 'flex',
          gap: '16px',
          borderBottom: '1px solid #e2e8f0',
          paddingBottom: '12px',
          flexWrap: 'wrap',
        }}
      >
        <button
          className={`btn-tab ${activeTab === 'vendors' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('vendors');
            setSearchQuery('');
          }}
          style={{
            fontWeight: activeTab === 'vendors' ? 'bold' : 'normal',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: activeTab === 'vendors' ? '#0284c7' : '#64748b',
          }}
        >
          🏢 Daftar Vendor ({vendors.length})
        </button>
        <button
          className={`btn-tab ${activeTab === 'plotting' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('plotting');
            setSearchQuery('');
          }}
          style={{
            fontWeight: activeTab === 'plotting' ? 'bold' : 'normal',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: activeTab === 'plotting' ? '#0284c7' : '#64748b',
          }}
        >
          🔗 Plotting Sekolah ({plottings.length})
        </button>
        <button
          className={`btn-tab ${activeTab === 'stock' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('stock');
            setSearchQuery('');
          }}
          style={{
            fontWeight: activeTab === 'stock' ? 'bold' : 'normal',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: activeTab === 'stock' ? '#0284c7' : '#64748b',
          }}
        >
          📦 Stok Barang Jadi ({stocks.length})
        </button>
        <button
          className={`btn-tab ${activeTab === 'calculator' ? 'active' : ''}`}
          onClick={() => setActiveTab('calculator')}
          style={{
            fontWeight: activeTab === 'calculator' ? 'bold' : 'normal',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: activeTab === 'calculator' ? '#0284c7' : '#64748b',
          }}
        >
          🧮 Kalkulator Kain
        </button>
      </div>

      {/* VENDORS TAB */}
      {activeTab === 'vendors' && (
        <div className="kopkar-table-container">
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '16px',
              flexWrap: 'wrap',
              gap: '12px',
            }}
          >
            <input
              type="text"
              placeholder="Cari nama vendor, PIC, telepon..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                padding: '8px 14px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                fontSize: '0.9rem',
                minWidth: '260px',
              }}
            />
            <button className="btn-primary" onClick={() => setShowAddVendor(true)}>
              + Tambah Vendor Baru
            </button>
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
              {loading ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '24px' }}>
                    Memuat data vendor...
                  </td>
                </tr>
              ) : filteredVendors.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '24px', color: '#64748b' }}>
                    {vendors.length === 0 ? 'Belum ada vendor terdaftar. Klik "+ Tambah Vendor Baru" untuk memulai.' : 'Tidak ada vendor yang cocok dengan pencarian.'}
                  </td>
                </tr>
              ) : (
                filteredVendors.map((v) => (
                  <tr key={v.id}>
                    <td>
                      <strong>{v.name}</strong>
                    </td>
                    <td>{v.contact_person || '-'}</td>
                    <td>{v.phone || '-'}</td>
                    <td>{v.address || '-'}</td>
                    <td style={{ textAlign: 'center' }}>
                      <ActionMenu
                        onDetail={() => setDetailVendor(v)}
                        onEdit={() => setEditingVendor(v)}
                        onAddStock={() => openAddStockModal(v.id)}
                        onDelete={() => handleDeleteVendor(v.id, v.name)}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* PLOTTING TAB */}
      {activeTab === 'plotting' && (
        <div className="kopkar-table-container">
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '16px',
              flexWrap: 'wrap',
              gap: '12px',
            }}
          >
            <input
              type="text"
              placeholder="Cari vendor, sekolah, jenis baju, atau email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                padding: '8px 14px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                fontSize: '0.9rem',
                minWidth: '260px',
              }}
            />
            <div>
              <button className="btn-primary" onClick={() => setShowAddPlotting(true)}>
                🔗 + Plot Sekolah Baru
              </button>
            </div>
          </div>

          <table className="kopkar-table">
            <thead>
              <tr>
                <th>Nama Vendor (Penjahit)</th>
                <th>Sekolah yang Dilayani (Google Penjualan)</th>
                <th>Jenis Baju yang Diproduksi</th>
                <th style={{ textAlign: 'center' }}>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', padding: '24px' }}>
                    Memuat data plotting...
                  </td>
                </tr>
              ) : filteredPlottings.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', padding: '24px', color: '#64748b' }}>
                    {plottings.length === 0 ? 'Belum ada plotting sekolah ke vendor.' : 'Tidak ada plotting yang cocok dengan pencarian.'}
                  </td>
                </tr>
              ) : (
                filteredPlottings.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <strong>{p.vendors?.name || 'Vendor Tidak Dikenal'}</strong>
                    </td>
                    <td>
                      <span
                        style={{
                          background: '#e0f2fe',
                          color: '#0369a1',
                          padding: '6px 12px',
                          borderRadius: '6px',
                          fontWeight: 600,
                          fontSize: '0.9rem',
                          display: 'inline-block',
                        }}
                      >
                        🏫 {p.app_users?.school_name || 'Sekolah'}
                      </span>
                      {p.app_users?.username && p.app_users.username.includes('@') && (
                        <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '4px' }}>
                          ✉️ {p.app_users.username} {p.app_users?.school_level ? `• Jenjang: ${p.app_users.school_level}` : ''}
                        </div>
                      )}
                    </td>
                    <td>
                      <span
                        style={{
                          background: '#f8fafc',
                          border: '1px solid #e2e8f0',
                          padding: '4px 10px',
                          borderRadius: '6px',
                          fontSize: '0.85rem',
                          fontWeight: 600,
                          color: '#1e293b',
                          display: 'inline-block',
                        }}
                      >
                        👔 {p.clothing_type || 'Semua Jenis Baju'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <ActionMenu
                        onEdit={() => handleOpenEditPlotting(p)}
                        onDelete={() => handleDeletePlotting(p.id)}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* STOCK TAB */}
      {activeTab === 'stock' && (
        <div className="kopkar-table-container">
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '16px',
              flexWrap: 'wrap',
              gap: '12px',
            }}
          >
            <div>
              <p style={{ color: '#64748b', margin: '0 0 8px 0', fontSize: '0.9rem' }}>
                Stok fisik seragam/barang jadi yang sudah selesai diproduksi dan <em>masih berada di lokasi vendor</em>.
              </p>
              <input
                type="text"
                placeholder="Cari nama vendor, barang, jenjang..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  padding: '8px 14px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  fontSize: '0.9rem',
                  minWidth: '260px',
                }}
              />
            </div>
            <button className="btn-primary" onClick={() => openAddStockModal()}>
              + Terima Barang Jadi
            </button>
          </div>

          <table className="kopkar-table">
            <thead>
              <tr>
                <th>Nama Vendor</th>
                <th>Nama Barang (Kategori & Ukuran)</th>
                <th style={{ textAlign: 'center' }}>Kuantitas Tersedia</th>
                <th>Update Terakhir</th>
                <th style={{ textAlign: 'center' }}>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '24px' }}>
                    Memuat data stok vendor...
                  </td>
                </tr>
              ) : filteredStocks.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '24px', color: '#64748b' }}>
                    {stocks.length === 0 ? 'Belum ada stok barang jadi yang tercatat dari vendor.' : 'Tidak ada stok yang cocok dengan pencarian.'}
                  </td>
                </tr>
              ) : (
                filteredStocks.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <strong>{s.vendors?.name || '-'}</strong>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, color: '#1e293b' }}>
                        {s.products?.name || 'Produk'}
                      </div>
                      <span style={{ fontSize: '0.8rem', color: '#64748b', display: 'block', marginTop: '2px' }}>
                        {s.products?.category ? s.products.category.toUpperCase() : ''}
                        {s.products?.size ? ` • Ukuran: ${s.products.size}` : ''}
                        {s.products?.level ? ` • Jenjang: ${s.products.level}` : ''}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span
                        style={{
                          fontSize: '1.2rem',
                          fontWeight: 'bold',
                          color: s.quantity > 0 ? '#15803d' : '#dc2626',
                        }}
                      >
                        {s.quantity}
                      </span>{' '}
                      pcs
                    </td>
                    <td style={{ fontSize: '0.85rem', color: '#64748b' }}>
                      {s.last_updated ? new Date(s.last_updated).toLocaleString('id-ID') : '-'}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <ActionMenu
                        onEdit={() => setEditingStock(s)}
                        onDelete={() => handleDeleteStock(s.id)}
                      />
                    </td>
                  </tr>
                ))
              )}
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

      {/* ================= MODALS ================= */}

      {/* MODAL TAMBAH VENDOR */}
      {showAddVendor && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: '520px' }}>
            <h3>Tambah Vendor Baru</h3>
            <p style={{ fontSize: '0.9rem', color: '#64748b', marginTop: '-8px', marginBottom: '16px' }}>
              Masukkan identitas vendor konveksi atau penjahit rekanan koperasi.
            </p>
            <form onSubmit={handleAddVendor} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={labelStyle}>Nama Vendor (Wajib)</label>
                <input
                  required
                  type="text"
                  placeholder="Contoh: CV Berkah Garment"
                  value={vendorName}
                  onChange={(e) => setVendorName(e.target.value)}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Nama Kontak (PIC)</label>
                <input
                  type="text"
                  placeholder="Contoh: Pak Budi"
                  value={vendorContact}
                  onChange={(e) => setVendorContact(e.target.value)}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Nomor Telepon / WhatsApp</label>
                <input
                  type="text"
                  placeholder="Contoh: 081234567890"
                  value={vendorPhone}
                  onChange={(e) => setVendorPhone(e.target.value)}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Alamat Lengkap</label>
                <textarea
                  placeholder="Alamat workshop / gudang vendor..."
                  value={vendorAddress}
                  onChange={(e) => setVendorAddress(e.target.value)}
                  style={{ ...inputStyle, resize: 'vertical' }}
                  rows={3}
                />
              </div>
              <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
                <button type="submit" className="btn-primary" style={{ flex: 1 }} disabled={submitting}>
                  {submitting ? 'Menyimpan...' : 'Simpan Vendor'}
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowAddVendor(false)}
                  style={{ flex: 1 }}
                  disabled={submitting}
                >
                  Batal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL EDIT VENDOR */}
      {editingVendor && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: '520px' }}>
            <h3>✏️ Edit Data Vendor</h3>
            <form onSubmit={handleUpdateVendor} style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '16px' }}>
              <div>
                <label style={labelStyle}>Nama Vendor (Wajib)</label>
                <input
                  required
                  type="text"
                  value={editingVendor.name}
                  onChange={(e) => setEditingVendor({ ...editingVendor, name: e.target.value })}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Nama Kontak (PIC)</label>
                <input
                  type="text"
                  value={editingVendor.contact_person || ''}
                  onChange={(e) => setEditingVendor({ ...editingVendor, contact_person: e.target.value })}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Nomor Telepon / WhatsApp</label>
                <input
                  type="text"
                  value={editingVendor.phone || ''}
                  onChange={(e) => setEditingVendor({ ...editingVendor, phone: e.target.value })}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Alamat Lengkap</label>
                <textarea
                  value={editingVendor.address || ''}
                  onChange={(e) => setEditingVendor({ ...editingVendor, address: e.target.value })}
                  style={{ ...inputStyle, resize: 'vertical' }}
                  rows={3}
                />
              </div>
              <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
                <button type="submit" className="btn-primary" style={{ flex: 1 }} disabled={submitting}>
                  {submitting ? 'Menyimpan...' : 'Simpan Perubahan'}
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setEditingVendor(null)}
                  style={{ flex: 1 }}
                  disabled={submitting}
                >
                  Batal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DETAIL VENDOR */}
      {detailVendor && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: '600px' }}>
            <h3>🏢 Detail Informasi Vendor</h3>
            <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '10px', marginBottom: '16px', border: '1px solid #e2e8f0' }}>
              <h4 style={{ margin: '0 0 8px 0', fontSize: '1.2rem', color: '#0f172a' }}>{detailVendor.name}</h4>
              <p style={{ margin: '4px 0', fontSize: '0.9rem', color: '#475569' }}>
                <strong>PIC:</strong> {detailVendor.contact_person || '-'}
              </p>
              <p style={{ margin: '4px 0', fontSize: '0.9rem', color: '#475569' }}>
                <strong>Telepon:</strong> {detailVendor.phone || '-'}
              </p>
              <p style={{ margin: '4px 0', fontSize: '0.9rem', color: '#475569' }}>
                <strong>Alamat:</strong> {detailVendor.address || '-'}
              </p>
            </div>

            <h5 style={{ margin: '16px 0 8px 0', fontSize: '1rem', color: '#334155' }}>
              🏫 Sekolah yang Dilayani ({plottings.filter((p) => p.vendor_id === detailVendor.id).length})
            </h5>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
              {plottings.filter((p) => p.vendor_id === detailVendor.id).length === 0 ? (
                <span style={{ fontSize: '0.85rem', color: '#94a3b8' }}>Belum ada sekolah yang di-plot ke vendor ini.</span>
              ) : (
                plottings
                  .filter((p) => p.vendor_id === detailVendor.id)
                  .map((p) => (
                    <span
                      key={p.id}
                      style={{
                        background: '#e0f2fe',
                        color: '#0369a1',
                        padding: '4px 10px',
                        borderRadius: '6px',
                        fontSize: '0.85rem',
                        fontWeight: 600,
                      }}
                    >
                      {p.app_users?.school_name} {p.clothing_type ? `(${p.clothing_type})` : ''}
                    </span>
                  ))
              )}
            </div>

            <h5 style={{ margin: '16px 0 8px 0', fontSize: '1rem', color: '#334155' }}>
              📦 Stok Barang Jadi di Vendor ({stocks.filter((s) => s.vendor_id === detailVendor.id).length} Item)
            </h5>
            <div style={{ maxHeight: '180px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px', marginBottom: '16px' }}>
              {stocks.filter((s) => s.vendor_id === detailVendor.id).length === 0 ? (
                <div style={{ padding: '16px', textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>
                  Belum ada stok fisik barang jadi di lokasi vendor ini.
                </div>
              ) : (
                <table style={{ width: '100%', fontSize: '0.85rem', borderCollapse: 'collapse' }}>
                  <thead style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    <tr>
                      <th style={{ padding: '8px', textAlign: 'left' }}>Nama Barang</th>
                      <th style={{ padding: '8px', textAlign: 'center' }}>Jumlah</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stocks
                      .filter((s) => s.vendor_id === detailVendor.id)
                      .map((s) => (
                        <tr key={s.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '8px' }}>
                            {s.products?.name} {s.products?.size ? `(${s.products.size})` : ''} - {s.products?.level}
                          </td>
                          <td style={{ padding: '8px', textAlign: 'center', fontWeight: 'bold', color: '#15803d' }}>
                            {s.quantity} pcs
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  const vId = detailVendor.id;
                  setDetailVendor(null);
                  openAddStockModal(vId);
                }}
              >
                + Input Stok Untuk Vendor Ini
              </button>
              <button type="button" className="btn-secondary" onClick={() => setDetailVendor(null)}>
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL TAMBAH PLOTTING SEKOLAH */}
      {showAddPlotting && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: '560px' }}>
            <h3>🔗 Plotting Vendor ke Sekolah</h3>
            <p style={{ fontSize: '0.9rem', color: '#64748b', marginTop: '-8px', marginBottom: '16px' }}>
              Tentukan vendor konveksi mana yang bertanggung jawab memproduksi seragam tertentu untuk sekolah yang dipilih.
            </p>
            <form onSubmit={handleAddPlotting} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={labelStyle}>Pilih Vendor (Penjahit)</label>
                <select
                  required
                  value={plotVendorId}
                  onChange={(e) => setPlotVendorId(e.target.value)}
                  style={inputStyle}
                >
                  <option value="">-- Pilih Vendor ({vendors.length} Vendor Tersedia) --</option>
                  {vendors.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <label style={labelStyle}>Pilih Sekolah (Akun Gmail Penjualan)</label>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    {['ALL', 'TK', 'SD', 'SMP', 'SMA'].map((lvl) => (
                      <button
                        key={lvl}
                        type="button"
                        onClick={() => {
                          setPlotLevelFilter(lvl);
                          setPlotSchoolId('');
                          setPlotClothingType('');
                        }}
                        style={{
                          padding: '2px 8px',
                          borderRadius: '4px',
                          border: '1px solid #cbd5e1',
                          background: plotLevelFilter === lvl ? '#0284c7' : '#f8fafc',
                          color: plotLevelFilter === lvl ? '#fff' : '#475569',
                          fontSize: '0.75rem',
                          cursor: 'pointer',
                          fontWeight: 600,
                        }}
                      >
                        {lvl === 'ALL' ? 'Semua' : lvl}
                      </button>
                    ))}
                  </div>
                </div>

                <select
                  required
                  value={plotSchoolId}
                  onChange={(e) => {
                    setPlotSchoolId(e.target.value);
                    setPlotClothingType('');
                  }}
                  style={inputStyle}
                >
                  <option value="">
                    -- Pilih Sekolah ({filteredModalSchools.length} Sekolah Google Terdaftar) --
                  </option>
                  {filteredModalSchools.map((s) => (
                    <option key={s.id} value={s.id}>
                      [{s.level}] {s.school_name} — ({s.email})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={labelStyle}>Jenis Baju yang Diproduksi</label>
                <select
                  required
                  value={plotClothingType}
                  onChange={(e) => setPlotClothingType(e.target.value)}
                  style={inputStyle}
                  disabled={!plotSchoolId}
                >
                  {!plotSchoolId ? (
                    <option value="">-- Pilih Sekolah Terlebih Dahulu --</option>
                  ) : (
                    <>
                      <option value="">
                        -- Pilih Jenis Baju ({availableClothingTypes.length} Jenis di Jenjang {selectedPlotSchool?.level}) --
                      </option>
                      <option value="Semua Jenis Baju">👕 Semua Jenis Baju (Full Seragam)</option>
                      {availableClothingTypes.map((item) => (
                        <option key={item} value={item}>
                          👔 {item}
                        </option>
                      ))}
                    </>
                  )}
                </select>
                {selectedPlotSchool && availableClothingTypes.length === 0 && (
                  <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: '#eab308' }}>
                    * Belum ada data produk seragam terdaftar untuk jenjang {selectedPlotSchool.level}. Pilihan "Semua Jenis Baju" tetap dapat digunakan.
                  </p>
                )}
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
                <button type="submit" className="btn-primary" style={{ flex: 1 }} disabled={submitting}>
                  {submitting ? 'Menyimpan...' : 'Simpan Plotting'}
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowAddPlotting(false)}
                  style={{ flex: 1 }}
                  disabled={submitting}
                >
                  Batal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL EDIT PLOTTING SEKOLAH */}
      {editingPlotting && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: '560px' }}>
            <h3>✏️ Edit Plotting Vendor ke Sekolah</h3>
            <p style={{ fontSize: '0.9rem', color: '#64748b', marginTop: '-8px', marginBottom: '16px' }}>
              Ubah vendor konveksi, sekolah yang dilayani, atau jenis baju yang diproduksi.
            </p>
            <form onSubmit={handleUpdatePlotting} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={labelStyle}>Pilih Vendor (Penjahit)</label>
                <select
                  required
                  value={editPlotVendorId}
                  onChange={(e) => setEditPlotVendorId(e.target.value)}
                  style={inputStyle}
                >
                  <option value="">-- Pilih Vendor --</option>
                  {vendors.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <label style={labelStyle}>Pilih Sekolah (Akun Gmail Penjualan)</label>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    {['ALL', 'TK', 'SD', 'SMP', 'SMA'].map((lvl) => (
                      <button
                        key={lvl}
                        type="button"
                        onClick={() => {
                          setEditPlotLevelFilter(lvl);
                        }}
                        style={{
                          padding: '2px 8px',
                          borderRadius: '4px',
                          border: '1px solid #cbd5e1',
                          background: editPlotLevelFilter === lvl ? '#0284c7' : '#f8fafc',
                          color: editPlotLevelFilter === lvl ? '#fff' : '#475569',
                          fontSize: '0.75rem',
                          cursor: 'pointer',
                          fontWeight: 600,
                        }}
                      >
                        {lvl === 'ALL' ? 'Semua' : lvl}
                      </button>
                    ))}
                  </div>
                </div>

                <select
                  required
                  value={editPlotSchoolId}
                  onChange={(e) => {
                    setEditPlotSchoolId(e.target.value);
                    setEditPlotClothingType('');
                  }}
                  style={inputStyle}
                >
                  <option value="">
                    -- Pilih Sekolah ({filteredEditModalSchools.length} Sekolah Google Terdaftar) --
                  </option>
                  {filteredEditModalSchools.map((s) => (
                    <option key={s.id} value={s.id}>
                      [{s.level}] {s.school_name} — ({s.email})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={labelStyle}>Jenis Baju yang Diproduksi</label>
                <select
                  required
                  value={editPlotClothingType}
                  onChange={(e) => setEditPlotClothingType(e.target.value)}
                  style={inputStyle}
                  disabled={!editPlotSchoolId}
                >
                  {!editPlotSchoolId ? (
                    <option value="">-- Pilih Sekolah Terlebih Dahulu --</option>
                  ) : (
                    <>
                      <option value="">
                        -- Pilih Jenis Baju ({editAvailableClothingTypes.length} Jenis di Jenjang {selectedEditPlotSchool?.level}) --
                      </option>
                      <option value="Semua Jenis Baju">👕 Semua Jenis Baju (Full Seragam)</option>
                      {editAvailableClothingTypes.map((item) => (
                        <option key={item} value={item}>
                          👔 {item}
                        </option>
                      ))}
                    </>
                  )}
                </select>
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
                <button type="submit" className="btn-primary" style={{ flex: 1 }} disabled={submitting}>
                  {submitting ? 'Menyimpan...' : 'Simpan Perubahan'}
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setEditingPlotting(null)}
                  style={{ flex: 1 }}
                  disabled={submitting}
                >
                  Batal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL INPUT STOK BARANG JADI */}
      {showAddStock && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: '560px' }}>
            <h3>📦 Terima Barang Jadi dari Vendor</h3>
            <p style={{ fontSize: '0.9rem', color: '#64748b', marginTop: '-8px', marginBottom: '16px' }}>
              Catat penambahan stok fisik barang/seragam yang sudah selesai diproduksi oleh vendor.
            </p>
            <form onSubmit={handleAddStock} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={labelStyle}>Pilih Vendor Penghasil</label>
                <select
                  required
                  value={stockVendorId}
                  onChange={(e) => setStockVendorId(e.target.value)}
                  style={inputStyle}
                >
                  <option value="">-- Pilih Vendor --</option>
                  {vendors.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <div style={{ width: '130px' }}>
                  <label style={labelStyle}>Filter Jenjang</label>
                  <select
                    value={stockLevelFilter}
                    onChange={(e) => {
                      setStockLevelFilter(e.target.value);
                      setStockProductId('');
                    }}
                    style={inputStyle}
                  >
                    <option value="ALL">Semua</option>
                    <option value="TK">TK</option>
                    <option value="SD">SD</option>
                    <option value="SMP">SMP</option>
                    <option value="SMA">SMA</option>
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Pilih Barang / Produk ({modalAvailableProducts.length} pilihan)</label>
                  <select
                    required
                    value={stockProductId}
                    onChange={(e) => setStockProductId(e.target.value)}
                    style={inputStyle}
                  >
                    <option value="">-- Pilih Barang / Seragam --</option>
                    {modalAvailableProducts.map((p) => (
                      <option key={p.id} value={p.id}>
                        [{p.level}] {p.name} {p.size ? `(Ukuran: ${p.size})` : ''} - {p.category}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label style={labelStyle}>Jumlah Barang Selesai (pcs)</label>
                <input
                  required
                  type="number"
                  min="1"
                  placeholder="Masukkan jumlah pcs selesai..."
                  value={stockQty || ''}
                  onChange={(e) => setStockQty(Number(e.target.value))}
                  style={inputStyle}
                />
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
                <button type="submit" className="btn-primary" style={{ flex: 1 }} disabled={submitting}>
                  {submitting ? 'Menyimpan...' : 'Simpan Stok Barang Jadi'}
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowAddStock(false)}
                  style={{ flex: 1 }}
                  disabled={submitting}
                >
                  Batal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL EDIT STOK */}
      {editingStock && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: '480px' }}>
            <h3>✏️ Ubah Kuantitas Stok Vendor</h3>
            <p style={{ fontSize: '0.9rem', color: '#64748b', marginTop: '-8px', marginBottom: '16px' }}>
              {editingStock.vendors?.name} - {editingStock.products?.name} ({editingStock.products?.level})
            </p>
            <form onSubmit={handleUpdateStock} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={labelStyle}>Kuantitas Stok Tersedia (pcs)</label>
                <input
                  required
                  type="number"
                  min="0"
                  value={editingStock.quantity}
                  onChange={(e) => setEditingStock({ ...editingStock, quantity: Number(e.target.value) })}
                  style={inputStyle}
                />
              </div>
              <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
                <button type="submit" className="btn-primary" style={{ flex: 1 }} disabled={submitting}>
                  {submitting ? 'Menyimpan...' : 'Simpan Perubahan'}
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setEditingStock(null)}
                  style={{ flex: 1 }}
                  disabled={submitting}
                >
                  Batal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default VendorManagement;
