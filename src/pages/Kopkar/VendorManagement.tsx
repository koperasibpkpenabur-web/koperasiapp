import React, { useState, useEffect, useMemo, useRef, Fragment } from 'react';
import * as XLSX from 'xlsx';
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
  vendors?: { name: string; contact_person?: string; phone?: string };
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
  const [activeTab, setActiveTab] = useState<'vendors' | 'plotting' | 'vendor_sekolah' | 'stock' | 'calculator'>('vendors');
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
  const [plotClothingTypes, setPlotClothingTypes] = useState<string[]>(['Semua Jenis Baju']);

  // Form Plotting (Add)
  const [plotVendorId, setPlotVendorId] = useState('');
  const [plotSchoolIds, setPlotSchoolIds] = useState<string[]>([]);
  const [plotSchoolSearch, setPlotSchoolSearch] = useState('');
  const [expandedPlotVendors, setExpandedPlotVendors] = useState<Record<string, boolean>>({});

  // Form Plotting (Edit)
  const [editPlotVendorId, setEditPlotVendorId] = useState('');
  const [editPlotSchoolId, setEditPlotSchoolId] = useState('');
  const [editPlotLevelFilter, setEditPlotLevelFilter] = useState('ALL');
  const [editPlotClothingTypes, setEditPlotClothingTypes] = useState<string[]>([]);

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

  const schoolsLoadedRef = useRef(false);

  useEffect(() => {
    // Sinkronisasi realtime Supabase antara role Karyawan (Kopkar) & Pengurus
    const channel = supabase
      .channel('vendor_realtime_sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vendors' }, () => {
        fetchVendors();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vendor_school_assignments' }, () => {
        fetchPlottings();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vendor_stocks' }, () => {
        fetchStocks();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Lazy load data sesuai tab yang sedang aktif
  useEffect(() => {
    if (activeTab === 'vendors') {
      fetchVendors();
    } else if (activeTab === 'plotting' || activeTab === 'vendor_sekolah') {
      fetchPlottings();
      if (!schoolsLoadedRef.current) {
        fetchSchools();
      }
    } else if (activeTab === 'stock') {
      fetchStocks();
    }
  }, [activeTab]);

  const fetchVendors = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('vendors').select('*').order('created_at', { ascending: false });
    if (!error && data) setVendors(data);
    setLoading(false);
  };

  const fetchSchools = async () => {
    try {
      // 1. Ambil data sekolah dari whitelist dan app_users secara paralel
      const [wlRes, appUsersRes] = await Promise.all([
        supabase.from('school_whitelist').select('*').order('nama_sekolah', { ascending: true }),
        supabase.from('app_users').select('id, username, school_name, school_level').ilike('username', '%@%'),
      ]);

      const whitelistData = wlRes.data;
      if (wlRes.error || !whitelistData) {
        console.error('Error fetching school_whitelist:', wlRes.error);
        return;
      }

      const appUsersData = appUsersRes.data;
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
      schoolsLoadedRef.current = true;
    } catch (err) {
      console.error('Error fetching schools from whitelist:', err);
    }
  };

  const fetchPlottings = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('vendor_school_assignments')
      .select('*, vendors(name, contact_person, phone), app_users(school_name, username, school_level)');

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
  const openAddPlottingModal = (preselectedVendorId?: string) => {
    if (!schoolsLoadedRef.current || schools.length === 0) {
      fetchSchools();
    }
    if (preselectedVendorId) {
      setPlotVendorId(preselectedVendorId);
    } else if (vendors.length > 0 && !plotVendorId) {
      setPlotVendorId(vendors[0].id);
    }
    setPlotSchoolIds([]);
    setPlotSchoolSearch('');
    setPlotLevelFilter('ALL');
    setPlotClothingTypes(['Semua Jenis Baju']);
    setShowAddPlotting(true);
  };

  const togglePlotVendor = (vendorId: string) => {
    setExpandedPlotVendors((prev) => ({
      ...prev,
      [vendorId]: !prev[vendorId],
    }));
  };

  const expandAllPlotVendors = () => {
    const all: Record<string, boolean> = {};
    vendors.forEach((v) => {
      all[v.id] = true;
    });
    plottings.forEach((p) => {
      all[p.vendor_id] = true;
    });
    setExpandedPlotVendors(all);
  };

  const collapseAllPlotVendors = () => {
    setExpandedPlotVendors({});
  };

  const toggleSelectSchool = (schoolId: string) => {
    setPlotSchoolIds((prev) =>
      prev.includes(schoolId) ? prev.filter((id) => id !== schoolId) : [...prev, schoolId]
    );
  };

  const handleSelectAllFilteredSchools = () => {
    const filteredIds = filteredModalSchools.map((s) => s.id);
    const allSelected = filteredIds.length > 0 && filteredIds.every((id) => plotSchoolIds.includes(id));
    if (allSelected) {
      setPlotSchoolIds((prev) => prev.filter((id) => !filteredIds.includes(id)));
    } else {
      setPlotSchoolIds((prev) => Array.from(new Set([...prev, ...filteredIds])));
    }
  };

  const toggleSelectClothingType = (type: string) => {
    if (type === 'Semua Jenis Baju') {
      setPlotClothingTypes(['Semua Jenis Baju']);
      return;
    }

    setPlotClothingTypes((prev) => {
      const clean = prev.filter((t) => t !== 'Semua Jenis Baju');
      if (clean.includes(type)) {
        const next = clean.filter((t) => t !== type);
        return next.length === 0 ? ['Semua Jenis Baju'] : next;
      } else {
        return [...clean, type];
      }
    });
  };

  const toggleEditSelectClothingType = (type: string) => {
    if (type === 'Semua Jenis Baju') {
      setEditPlotClothingTypes(['Semua Jenis Baju']);
      return;
    }

    setEditPlotClothingTypes((prev) => {
      const clean = prev.filter((t) => t !== 'Semua Jenis Baju');
      if (clean.includes(type)) {
        const next = clean.filter((t) => t !== type);
        return next.length === 0 ? ['Semua Jenis Baju'] : next;
      } else {
        return [...clean, type];
      }
    });
  };

  const handleAddPlotting = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!plotVendorId) {
      alert('Pilih vendor (penjahit) terlebih dahulu');
      return;
    }

    if (plotSchoolIds.length === 0) {
      alert('Pilih setidaknya satu sekolah');
      return;
    }

    if (plotClothingTypes.length === 0) {
      alert('Pilih setidaknya satu jenis baju yang diproduksi');
      return;
    }

    setSubmitting(true);

    const isAll = plotClothingTypes.includes('Semua Jenis Baju');
    let insertedCount = 0;
    let updatedCount = 0;
    let anyError: any = null;

    for (const schId of plotSchoolIds) {
      // Cek apakah penugasan vendor untuk sekolah ini sudah ada
      const existing = plottings.find(
        (p) => p.vendor_id === plotVendorId && p.school_user_id === schId
      );

      if (existing) {
        // Jika sudah ada, gabungkan (merge) jenis baju secara cerdas tanpa melanggar unique constraint
        let mergedClothingType = '';
        if (isAll) {
          mergedClothingType = 'Semua Jenis Baju';
        } else {
          const existingList = (existing.clothing_type || '')
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean);
          const cleanExisting = existingList.filter((t) => t !== 'Semua Jenis Baju');
          const mergedSet = new Set([...cleanExisting, ...plotClothingTypes]);
          mergedClothingType = Array.from(mergedSet).join(', ');
        }

        const { error } = await supabase
          .from('vendor_school_assignments')
          .update({ clothing_type: mergedClothingType })
          .eq('id', existing.id);

        if (error) anyError = error;
        else updatedCount++;
      } else {
        // Jika belum ada, lakukan insert penugasan baru
        const finalClothingType = isAll ? 'Semua Jenis Baju' : plotClothingTypes.join(', ');
        let { error } = await supabase.from('vendor_school_assignments').insert({
          vendor_id: plotVendorId,
          school_user_id: schId,
          clothing_type: finalClothingType,
        });

        if (error && error.message.includes('clothing_type')) {
          const res = await supabase.from('vendor_school_assignments').insert({
            vendor_id: plotVendorId,
            school_user_id: schId,
          });
          error = res.error;
        }

        if (error) anyError = error;
        else insertedCount++;
      }
    }

    setSubmitting(false);

    if (!anyError || insertedCount + updatedCount > 0) {
      const parts = [];
      if (insertedCount > 0) parts.push(`${insertedCount} sekolah baru ditambahkan`);
      if (updatedCount > 0) parts.push(`${updatedCount} sekolah diperbarui/ditambahkan jenis seragamnya`);
      alert(`Plotting berhasil disimpan! (${parts.join(', ')})`);
      setShowAddPlotting(false);
      setPlotSchoolIds([]);
      setPlotSchoolSearch('');
      setPlotClothingTypes(['Semua Jenis Baju']);
      fetchPlottings();
    } else {
      alert('Gagal menyimpan plotting: ' + (anyError?.message || 'Terjadi kesalahan sistem'));
    }
  };

  const handleOpenEditPlotting = (p: Plotting) => {
    if (!schoolsLoadedRef.current || schools.length === 0) {
      fetchSchools();
    }
    setEditingPlotting(p);
    setEditPlotVendorId(p.vendor_id);
    setEditPlotSchoolId(p.school_user_id);
    const raw = p.clothing_type || 'Semua Jenis Baju';
    const parsed = raw.split(',').map((s) => s.trim()).filter(Boolean);
    setEditPlotClothingTypes(parsed.length > 0 ? parsed : ['Semua Jenis Baju']);
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
    if (editPlotClothingTypes.length === 0) {
      alert('Pilih setidaknya satu jenis baju yang diproduksi');
      return;
    }

    const finalClothingType = editPlotClothingTypes.includes('Semua Jenis Baju')
      ? 'Semua Jenis Baju'
      : editPlotClothingTypes.join(', ');

    setSubmitting(true);
    let { error } = await supabase
      .from('vendor_school_assignments')
      .update({
        vendor_id: editPlotVendorId,
        school_user_id: editPlotSchoolId,
        clothing_type: finalClothingType,
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

  // Schools filtered by level and search for add plotting modal
  const filteredModalSchools = useMemo(() => {
    return schools.filter((s) => {
      const matchesLevel =
        plotLevelFilter === 'ALL' || (s.level || '').toUpperCase() === plotLevelFilter.toUpperCase();
      const q = plotSchoolSearch.toLowerCase().trim();
      const matchesSearch =
        !q ||
        (s.school_name || '').toLowerCase().includes(q) ||
        (s.email || '').toLowerCase().includes(q) ||
        (s.level || '').toLowerCase().includes(q);
      return matchesLevel && matchesSearch;
    });
  }, [schools, plotLevelFilter, plotSchoolSearch]);

  // Deteksi jenjang dari sekolah-sekolah yang dipilih di modal tambah plotting
  const selectedPlotLevels = useMemo(() => {
    if (plotSchoolIds.length > 0) {
      return Array.from(
        new Set(
          schools
            .filter((s) => plotSchoolIds.includes(s.id))
            .map((s) => (s.level || '').toUpperCase())
            .filter(Boolean)
        )
      );
    }
    if (plotLevelFilter !== 'ALL') {
      return [plotLevelFilter.toUpperCase()];
    }
    return [];
  }, [schools, plotSchoolIds, plotLevelFilter]);

  // Daftar jenis baju unik (tanpa ukuran) berdasarkan jenjang sekolah terpilih
  const availableClothingTypes = useMemo(() => {
    return Array.from(
      new Set(
        products
          .filter(
            (p) =>
              p.category === 'seragam' &&
              (selectedPlotLevels.length === 0 || selectedPlotLevels.includes((p.level || '').toUpperCase()))
          )
          .map((p) => p.name.trim())
      )
    ).sort();
  }, [products, selectedPlotLevels]);

  // Kelompokkan plottings per vendor untuk tampilan ringkas dengan hide/unhide
  const groupedPlottings = useMemo(() => {
    const map = new Map<
      string,
      {
        vendorId: string;
        vendorName: string;
        contactPerson?: string;
        phone?: string;
        items: Plotting[];
      }
    >();

    filteredPlottings.forEach((p) => {
      let entry = map.get(p.vendor_id);
      if (!entry) {
        const v = vendors.find((vend) => vend.id === p.vendor_id);
        entry = {
          vendorId: p.vendor_id,
          vendorName: p.vendors?.name || v?.name || 'Vendor Tidak Dikenal',
          contactPerson: p.vendors?.contact_person || v?.contact_person || '-',
          phone: p.vendors?.phone || v?.phone || '-',
          items: [],
        };
        map.set(p.vendor_id, entry);
      }
      entry.items.push(p);
    });

    return Array.from(map.values()).sort((a, b) => a.vendorName.localeCompare(b.vendorName));
  }, [filteredPlottings, vendors]);

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

  // --- REKAP VENDOR SEKOLAH STATES & LOGIC ---
  const [rekapVendorFilter, setRekapVendorFilter] = useState('ALL');
  const [rekapLevelFilter, setRekapLevelFilter] = useState('ALL');
  const [rekapSearchQuery, setRekapSearchQuery] = useState('');
  const [rekapViewMode, setRekapViewMode] = useState<'grouped' | 'table'>('grouped');

  // Filter data untuk tab Vendor Sekolah
  const filteredRekapPlottings = useMemo(() => {
    return plottings.filter((p) => {
      const matchesVendor = rekapVendorFilter === 'ALL' || p.vendor_id === rekapVendorFilter;
      const matchesLevel =
        rekapLevelFilter === 'ALL' ||
        (p.app_users?.school_level || '').toUpperCase() === rekapLevelFilter.toUpperCase();
      const q = rekapSearchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        (p.vendors?.name || '').toLowerCase().includes(q) ||
        (p.app_users?.school_name || '').toLowerCase().includes(q) ||
        (p.clothing_type || '').toLowerCase().includes(q) ||
        (p.app_users?.username || '').toLowerCase().includes(q) ||
        (p.app_users?.school_level || '').toLowerCase().includes(q);

      return matchesVendor && matchesLevel && matchesSearch;
    });
  }, [plottings, rekapVendorFilter, rekapLevelFilter, rekapSearchQuery]);

  // Kelompokkan per vendor untuk tampilan rekap
  const groupedByVendor = useMemo(() => {
    const map = new Map<
      string,
      { vendor: Vendor | undefined; vendorName: string; contactPerson?: string; phone?: string; assignments: Plotting[] }
    >();

    filteredRekapPlottings.forEach((p) => {
      let entry = map.get(p.vendor_id);
      if (!entry) {
        const v = vendors.find((vend) => vend.id === p.vendor_id);
        entry = {
          vendor: v,
          vendorName: p.vendors?.name || v?.name || 'Vendor Tidak Dikenal',
          contactPerson: p.vendors?.contact_person || v?.contact_person || '-',
          phone: p.vendors?.phone || v?.phone || '-',
          assignments: [],
        };
        map.set(p.vendor_id, entry);
      }
      entry.assignments.push(p);
    });

    return Array.from(map.values()).sort((a, b) => a.vendorName.localeCompare(b.vendorName));
  }, [filteredRekapPlottings, vendors]);

  // Export Excel untuk Rekap Vendor Sekolah
  const handleExportExcelVendorSekolah = () => {
    if (filteredRekapPlottings.length === 0) {
      alert('Tidak ada data penugasan vendor sekolah untuk diekspor.');
      return;
    }

    const exportData = filteredRekapPlottings.map((p, idx) => {
      const v = vendors.find((item) => item.id === p.vendor_id);
      return {
        No: idx + 1,
        'Nama Vendor (Penjahit)': p.vendors?.name || v?.name || '-',
        'PIC Vendor': p.vendors?.contact_person || v?.contact_person || '-',
        'No. Telepon Vendor': p.vendors?.phone || v?.phone || '-',
        'Sekolah yang Dikerjakan': p.app_users?.school_name || '-',
        Jenjang: p.app_users?.school_level || '-',
        'Email Akun Sekolah': p.app_users?.username || '-',
        'Jenis Barang yang Dikerjakan': p.clothing_type || 'Semua Jenis Baju',
        'Tanggal Plotting': p.created_at ? new Date(p.created_at).toLocaleDateString('id-ID') : '-',
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    worksheet['!cols'] = [
      { wch: 6 },
      { wch: 28 },
      { wch: 18 },
      { wch: 20 },
      { wch: 32 },
      { wch: 12 },
      { wch: 32 },
      { wch: 28 },
      { wch: 16 },
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Rekap_Vendor_Sekolah');
    XLSX.writeFile(workbook, `Rekap_Vendor_Sekolah_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

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
          className={`btn-tab ${activeTab === 'vendor_sekolah' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('vendor_sekolah');
            setRekapSearchQuery('');
          }}
          style={{
            fontWeight: activeTab === 'vendor_sekolah' ? 'bold' : 'normal',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: activeTab === 'vendor_sekolah' ? '#0284c7' : '#64748b',
          }}
        >
          🏫 Vendor Sekolah ({plottings.length})
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
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
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
              <button
                type="button"
                onClick={expandAllPlotVendors}
                style={{
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  background: '#f8fafc',
                  color: '#334155',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
                title="Tampilkan seluruh rincian sekolah semua vendor"
              >
                📂 Buka Semua
              </button>
              <button
                type="button"
                onClick={collapseAllPlotVendors}
                style={{
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  background: '#f8fafc',
                  color: '#334155',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
                title="Sembunyikan rincian sekolah semua vendor agar tabel lebih ringkas"
              >
                📁 Tutup Semua
              </button>
            </div>
            <div>
              <button className="btn-primary" onClick={() => openAddPlottingModal()}>
                🔗 + Plot Sekolah
              </button>
            </div>
          </div>

          <table className="kopkar-table">
            <thead>
              <tr>
                <th style={{ width: '45px', textAlign: 'center' }}>No</th>
                <th style={{ width: '250px' }}>Nama Vendor (Penjahit)</th>
                <th>Sekolah yang Dilayani & Jenis Baju</th>
                <th style={{ width: '130px', textAlign: 'center' }}>Total Sekolah</th>
                <th style={{ width: '180px', textAlign: 'center' }}>Aksi / Rincian</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '28px' }}>
                    Memuat data plotting...
                  </td>
                </tr>
              ) : groupedPlottings.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '28px', color: '#64748b' }}>
                    {plottings.length === 0
                      ? 'Belum ada plotting sekolah ke vendor. Klik "+ Plot Sekolah" untuk memulai.'
                      : 'Tidak ada plotting yang cocok dengan filter pencarian.'}
                  </td>
                </tr>
              ) : (
                groupedPlottings.map((g, idx) => {
                  const isExpanded = !!expandedPlotVendors[g.vendorId] || searchQuery.trim().length > 0;
                  return (
                    <Fragment key={g.vendorId}>
                      <tr
                        style={{
                          background: isExpanded ? '#f8fafc' : '#ffffff',
                          transition: 'background 0.15s ease',
                        }}
                      >
                        <td style={{ textAlign: 'center', color: '#64748b', fontWeight: 600 }}>{idx + 1}</td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '1.1rem' }}>🏢</span>
                            <strong style={{ color: '#0f172a', fontSize: '0.95rem' }}>{g.vendorName}</strong>
                          </div>
                          <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '3px', marginLeft: '26px' }}>
                            👤 PIC: <strong>{g.contactPerson}</strong> • 📞 <strong>{g.phone}</strong>
                          </div>
                        </td>
                        <td>
                          {/* Tampilan ringkas sekolah saat tersembunyi (hide) */}
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
                            {g.items.slice(0, 3).map((item) => (
                              <span
                                key={item.id}
                                style={{
                                  background: '#e0f2fe',
                                  color: '#0369a1',
                                  padding: '3px 8px',
                                  borderRadius: '5px',
                                  fontSize: '0.8rem',
                                  fontWeight: 600,
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                }}
                              >
                                🏫 {item.app_users?.school_name || 'Sekolah'}
                                <span style={{ opacity: 0.7, fontSize: '0.75rem', fontWeight: 400 }}>
                                  ({item.clothing_type || 'Semua Baju'})
                                </span>
                              </span>
                            ))}
                            {g.items.length > 3 && (
                              <span
                                onClick={() => togglePlotVendor(g.vendorId)}
                                style={{
                                  background: '#f1f5f9',
                                  color: '#0284c7',
                                  padding: '3px 8px',
                                  borderRadius: '5px',
                                  fontSize: '0.8rem',
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                }}
                              >
                                +{g.items.length - 3} sekolah lainnya...
                              </span>
                            )}
                          </div>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span
                            style={{
                              background: '#f0fdf4',
                              color: '#166534',
                              border: '1px solid #bbf7d0',
                              padding: '4px 10px',
                              borderRadius: '999px',
                              fontWeight: 700,
                              fontSize: '0.82rem',
                              display: 'inline-block',
                            }}
                          >
                            {g.items.length} Sekolah
                          </span>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px' }}>
                            <button
                              type="button"
                              onClick={() => togglePlotVendor(g.vendorId)}
                              style={{
                                padding: '5px 10px',
                                borderRadius: '6px',
                                border: '1px solid #cbd5e1',
                                background: isExpanded ? '#e2e8f0' : '#f1f5f9',
                                color: '#334155',
                                fontWeight: 600,
                                fontSize: '0.8rem',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                              }}
                            >
                              {isExpanded ? '▲ Sembunyikan' : `▼ Buka (${g.items.length})`}
                            </button>
                            <button
                              type="button"
                              onClick={() => openAddPlottingModal(g.vendorId)}
                              title="Tambah plotting sekolah untuk vendor ini"
                              style={{
                                padding: '5px 9px',
                                borderRadius: '6px',
                                border: '1px solid #bbf7d0',
                                background: '#f0fdf4',
                                color: '#166534',
                                fontWeight: 600,
                                fontSize: '0.8rem',
                                cursor: 'pointer',
                              }}
                            >
                              + Plot
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* RINCIAN SEKOLAH (UNHIDE) */}
                      {isExpanded && (
                        <tr style={{ background: '#f8fafc' }}>
                          <td colSpan={5} style={{ padding: '8px 16px 16px 45px', borderTop: 'none', borderBottom: '2px solid #e2e8f0' }}>
                            <div
                              style={{
                                background: '#ffffff',
                                border: '1px solid #e2e8f0',
                                borderRadius: '8px',
                                overflow: 'hidden',
                                boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                              }}
                            >
                              <div
                                style={{
                                  background: '#f1f5f9',
                                  padding: '8px 14px',
                                  borderBottom: '1px solid #e2e8f0',
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'center',
                                  fontSize: '0.82rem',
                                  fontWeight: 600,
                                  color: '#475569',
                                }}
                              >
                                <span>📋 Rincian Sekolah & Jenis Baju untuk {g.vendorName}</span>
                                <span style={{ color: '#0369a1' }}>{g.items.length} Penugasan Terdaftar</span>
                              </div>

                              <table className="kopkar-table" style={{ margin: 0, fontSize: '0.85rem' }}>
                                <thead>
                                  <tr style={{ background: '#ffffff' }}>
                                    <th style={{ width: '40px', textAlign: 'center' }}>No</th>
                                    <th>Sekolah yang Dilayani (Google Penjualan)</th>
                                    <th style={{ width: '80px', textAlign: 'center' }}>Jenjang</th>
                                    <th>Jenis Baju yang Diproduksi</th>
                                    <th style={{ width: '130px', textAlign: 'center' }}>Aksi</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {g.items.map((item, itemIdx) => (
                                    <tr key={item.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                      <td style={{ textAlign: 'center', color: '#64748b' }}>{itemIdx + 1}</td>
                                      <td>
                                        <strong style={{ color: '#1e293b' }}>
                                          {item.app_users?.school_name || 'Sekolah'}
                                        </strong>
                                        {item.app_users?.username && (
                                          <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '2px' }}>
                                            ✉️ {item.app_users.username}
                                          </div>
                                        )}
                                      </td>
                                      <td style={{ textAlign: 'center' }}>
                                        <span
                                          style={{
                                            background: '#f1f5f9',
                                            color: '#475569',
                                            padding: '2px 7px',
                                            borderRadius: '4px',
                                            fontSize: '0.75rem',
                                            fontWeight: 600,
                                          }}
                                        >
                                          {item.app_users?.school_level || '-'}
                                        </span>
                                      </td>
                                      <td>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                          {(item.clothing_type || 'Semua Jenis Baju')
                                            .split(',')
                                            .map((ct) => ct.trim())
                                            .filter(Boolean)
                                            .map((ct) => (
                                              <span
                                                key={ct}
                                                style={{
                                                  background: '#f0fdf4',
                                                  border: '1px solid #bbf7d0',
                                                  color: '#166534',
                                                  padding: '2px 8px',
                                                  borderRadius: '5px',
                                                  fontSize: '0.8rem',
                                                  fontWeight: 600,
                                                  display: 'inline-flex',
                                                  alignItems: 'center',
                                                  gap: '3px',
                                                }}
                                              >
                                                👔 {ct}
                                              </span>
                                            ))}
                                        </div>
                                      </td>
                                      <td style={{ textAlign: 'center' }}>
                                        <div style={{ display: 'flex', justifyContent: 'center', gap: '6px' }}>
                                          <button
                                            type="button"
                                            onClick={() => handleOpenEditPlotting(item)}
                                            title="Edit penugasan ini"
                                            style={{
                                              padding: '3px 8px',
                                              background: '#f1f5f9',
                                              border: '1px solid #cbd5e1',
                                              borderRadius: '4px',
                                              cursor: 'pointer',
                                              fontSize: '0.78rem',
                                              color: '#334155',
                                            }}
                                          >
                                            ✏️ Edit
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => handleDeletePlotting(item.id)}
                                            title="Hapus penugasan ini"
                                            style={{
                                              padding: '3px 8px',
                                              background: '#fef2f2',
                                              border: '1px solid #fecaca',
                                              borderRadius: '4px',
                                              cursor: 'pointer',
                                              color: '#b91c1c',
                                              fontSize: '0.78rem',
                                            }}
                                          >
                                            🗑️ Hapus
                                          </button>
                                        </div>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* VENDOR SEKOLAH TAB */}
      {activeTab === 'vendor_sekolah' && (
        <div>
          {/* STATS SUMMARY CARDS */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '16px',
              marginBottom: '20px',
            }}
          >
            <div
              style={{
                background: '#fff',
                padding: '16px 20px',
                borderRadius: '12px',
                border: '1px solid #e2e8f0',
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
              }}
            >
              <div style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 600 }}>🏢 Total Vendor Terplot</div>
              <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#0284c7', marginTop: '4px' }}>
                {new Set(filteredRekapPlottings.map((p) => p.vendor_id)).size}
                <span style={{ fontSize: '0.9rem', color: '#94a3b8', fontWeight: 400, marginLeft: '6px' }}>vendor</span>
              </div>
            </div>

            <div
              style={{
                background: '#fff',
                padding: '16px 20px',
                borderRadius: '12px',
                border: '1px solid #e2e8f0',
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
              }}
            >
              <div style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 600 }}>🏫 Total Sekolah Terlayani</div>
              <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#059669', marginTop: '4px' }}>
                {new Set(filteredRekapPlottings.map((p) => p.school_user_id)).size}
                <span style={{ fontSize: '0.9rem', color: '#94a3b8', fontWeight: 400, marginLeft: '6px' }}>sekolah</span>
              </div>
            </div>

            <div
              style={{
                background: '#fff',
                padding: '16px 20px',
                borderRadius: '12px',
                border: '1px solid #e2e8f0',
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
              }}
            >
              <div style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 600 }}>👔 Total Penugasan Barang</div>
              <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#3b82f6', marginTop: '4px' }}>
                {filteredRekapPlottings.length}
                <span style={{ fontSize: '0.9rem', color: '#94a3b8', fontWeight: 400, marginLeft: '6px' }}>penugasan</span>
              </div>
            </div>
          </div>

          {/* TOOLBAR & FILTERS */}
          <div className="kopkar-table-container" style={{ marginBottom: '20px' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '12px',
              }}
            >
              {/* Filter inputs */}
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', flex: 1 }}>
                <input
                  type="text"
                  placeholder="Cari vendor, sekolah, jenis barang..."
                  value={rekapSearchQuery}
                  onChange={(e) => setRekapSearchQuery(e.target.value)}
                  style={{
                    padding: '8px 14px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '0.9rem',
                    minWidth: '240px',
                  }}
                />

                <select
                  value={rekapVendorFilter}
                  onChange={(e) => setRekapVendorFilter(e.target.value)}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '0.9rem',
                    background: '#fff',
                    color: '#1e293b',
                  }}
                >
                  <option value="ALL">Semua Vendor ({vendors.length})</option>
                  {vendors.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </select>

                <select
                  value={rekapLevelFilter}
                  onChange={(e) => setRekapLevelFilter(e.target.value)}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '0.9rem',
                    background: '#fff',
                    color: '#1e293b',
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

                {/* View Mode Toggle */}
                <div
                  style={{
                    display: 'flex',
                    background: '#f1f5f9',
                    borderRadius: '8px',
                    padding: '2px',
                    border: '1px solid #e2e8f0',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setRekapViewMode('grouped')}
                    style={{
                      border: 'none',
                      background: rekapViewMode === 'grouped' ? '#fff' : 'transparent',
                      color: rekapViewMode === 'grouped' ? '#0284c7' : '#64748b',
                      fontWeight: rekapViewMode === 'grouped' ? 600 : 400,
                      padding: '6px 12px',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '0.85rem',
                      boxShadow: rekapViewMode === 'grouped' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                    }}
                  >
                    🏢 Per Vendor
                  </button>
                  <button
                    type="button"
                    onClick={() => setRekapViewMode('table')}
                    style={{
                      border: 'none',
                      background: rekapViewMode === 'table' ? '#fff' : 'transparent',
                      color: rekapViewMode === 'table' ? '#0284c7' : '#64748b',
                      fontWeight: rekapViewMode === 'table' ? 600 : 400,
                      padding: '6px 12px',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '0.85rem',
                      boxShadow: rekapViewMode === 'table' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                    }}
                  >
                    📋 Tabel Lengkap
                  </button>
                </div>
              </div>

              {/* Export Excel Button */}
              <button
                type="button"
                onClick={handleExportExcelVendorSekolah}
                disabled={filteredRekapPlottings.length === 0}
                style={{
                  background: filteredRekapPlottings.length === 0 ? '#94a3b8' : '#10b981',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '9px 16px',
                  fontSize: '0.9rem',
                  fontWeight: 600,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  cursor: filteredRekapPlottings.length === 0 ? 'not-allowed' : 'pointer',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                }}
              >
                <span>📥</span> Export Excel (.xlsx)
              </button>
            </div>
          </div>

          {/* DATA PRESENTATION */}
          {loading ? (
            <div className="kopkar-table-container" style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
              Memuat data rekap vendor sekolah...
            </div>
          ) : filteredRekapPlottings.length === 0 ? (
            <div className="kopkar-table-container" style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
              {plottings.length === 0
                ? 'Belum ada data penugasan vendor sekolah. Silakan lakukan plotting di tab "Plotting Sekolah".'
                : 'Tidak ada data penugasan yang sesuai dengan filter pencarian.'}
            </div>
          ) : rekapViewMode === 'grouped' ? (
            /* GROUPED BY VENDOR CARDS */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {groupedByVendor.map((group) => (
                <div
                  key={group.vendorName}
                  style={{
                    background: '#fff',
                    borderRadius: '12px',
                    border: '1px solid #e2e8f0',
                    overflow: 'hidden',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.03)',
                  }}
                >
                  {/* Vendor Card Header */}
                  <div
                    style={{
                      background: '#f8fafc',
                      borderBottom: '1px solid #e2e8f0',
                      padding: '14px 20px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: '10px',
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ fontSize: '1.3rem' }}>🏢</span>
                        <strong style={{ fontSize: '1.1rem', color: '#0f172a' }}>{group.vendorName}</strong>
                      </div>
                      <div style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '4px', marginLeft: '32px' }}>
                        👤 PIC: <strong>{group.contactPerson || '-'}</strong> • 📞 Telp: <strong>{group.phone || '-'}</strong>
                      </div>
                    </div>
                    <span
                      style={{
                        background: '#e0f2fe',
                        color: '#0369a1',
                        padding: '4px 12px',
                        borderRadius: '999px',
                        fontSize: '0.85rem',
                        fontWeight: 700,
                      }}
                    >
                      {group.assignments.length} Penugasan Sekolah
                    </span>
                  </div>

                  {/* Inner Table */}
                  <table className="kopkar-table" style={{ margin: 0, border: 'none' }}>
                    <thead>
                      <tr style={{ background: '#ffffff' }}>
                        <th style={{ width: '50px', textAlign: 'center' }}>No</th>
                        <th>Sekolah yang Dikerjakan</th>
                        <th>Jenjang</th>
                        <th>Jenis Barang yang Dikerjakan</th>
                        <th>Akun Sekolah</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.assignments.map((assign, idx) => (
                        <tr key={assign.id}>
                          <td style={{ textAlign: 'center', color: '#64748b' }}>{idx + 1}</td>
                          <td>
                            <strong style={{ color: '#1e293b' }}>
                              {assign.app_users?.school_name || 'Sekolah'}
                            </strong>
                          </td>
                          <td>
                            <span
                              style={{
                                background: '#f1f5f9',
                                color: '#475569',
                                padding: '2px 8px',
                                borderRadius: '4px',
                                fontSize: '0.8rem',
                                fontWeight: 600,
                              }}
                            >
                              {assign.app_users?.school_level || '-'}
                            </span>
                          </td>
                          <td>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                              {(assign.clothing_type || 'Semua Jenis Baju')
                                .split(',')
                                .map((ct) => ct.trim())
                                .filter(Boolean)
                                .map((ct) => (
                                  <span
                                    key={ct}
                                    style={{
                                      background: '#f0fdf4',
                                      border: '1px solid #bbf7d0',
                                      color: '#166534',
                                      padding: '2px 8px',
                                      borderRadius: '5px',
                                      fontSize: '0.8rem',
                                      fontWeight: 600,
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '3px',
                                    }}
                                  >
                                    👔 {ct}
                                  </span>
                                ))}
                            </div>
                          </td>
                          <td style={{ fontSize: '0.85rem', color: '#64748b' }}>
                            {assign.app_users?.username || '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          ) : (
            /* FLAT TABLE VIEW */
            <div className="kopkar-table-container">
              <table className="kopkar-table">
                <thead>
                  <tr>
                    <th style={{ width: '50px', textAlign: 'center' }}>No</th>
                    <th>Nama Vendor (Penjahit)</th>
                    <th>Sekolah yang Dikerjakan</th>
                    <th>Jenjang</th>
                    <th>Jenis Barang yang Dikerjakan</th>
                    <th>Kontak Vendor</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRekapPlottings.map((p, idx) => {
                    const v = vendors.find((item) => item.id === p.vendor_id);
                    return (
                      <tr key={p.id}>
                        <td style={{ textAlign: 'center', color: '#64748b' }}>{idx + 1}</td>
                        <td>
                          <strong>{p.vendors?.name || v?.name || 'Vendor'}</strong>
                        </td>
                        <td>
                          <span
                            style={{
                              background: '#e0f2fe',
                              color: '#0369a1',
                              padding: '4px 10px',
                              borderRadius: '6px',
                              fontWeight: 600,
                              fontSize: '0.85rem',
                              display: 'inline-block',
                            }}
                          >
                            🏫 {p.app_users?.school_name || 'Sekolah'}
                          </span>
                        </td>
                        <td>
                          <span
                            style={{
                              background: '#f1f5f9',
                              color: '#475569',
                              padding: '2px 8px',
                              borderRadius: '4px',
                              fontSize: '0.8rem',
                              fontWeight: 600,
                            }}
                          >
                            {p.app_users?.school_level || '-'}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                            {(p.clothing_type || 'Semua Jenis Baju')
                              .split(',')
                              .map((ct) => ct.trim())
                              .filter(Boolean)
                              .map((ct) => (
                                <span
                                  key={ct}
                                  style={{
                                    background: '#f0fdf4',
                                    border: '1px solid #bbf7d0',
                                    color: '#166534',
                                    padding: '2px 8px',
                                    borderRadius: '5px',
                                    fontSize: '0.8rem',
                                    fontWeight: 600,
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '3px',
                                  }}
                                >
                                  👔 {ct}
                                </span>
                              ))}
                          </div>
                        </td>
                        <td style={{ fontSize: '0.85rem', color: '#64748b' }}>
                          <div>👤 {p.vendors?.contact_person || v?.contact_person || '-'}</div>
                          <div>📞 {p.vendors?.phone || v?.phone || '-'}</div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
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
          <div className="modal" style={{ maxWidth: '620px' }}>
            <h3>🔗 Plotting Vendor ke Sekolah</h3>
            <p style={{ fontSize: '0.9rem', color: '#64748b', marginTop: '-8px', marginBottom: '16px' }}>
              Tentukan vendor konveksi dan pilih satu atau beberapa sekolah yang akan dikerjakan secara bersamaan.
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
                      {v.name} {v.contact_person ? `(PIC: ${v.contact_person})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', flexWrap: 'wrap', gap: '6px' }}>
                  <label style={labelStyle}>
                    Pilih Sekolah ({plotSchoolIds.length} Sekolah Dipilih)
                  </label>
                  {/* Filter Jenjang */}
                  <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                    {['ALL', 'TK', 'SD', 'SMP', 'SMA'].map((lvl) => (
                      <button
                        key={lvl}
                        type="button"
                        onClick={() => setPlotLevelFilter(lvl)}
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
                        {lvl === 'ALL' ? 'Semua Jenjang' : lvl}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Search & Select All Toolbar */}
                <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                  <input
                    type="text"
                    placeholder="🔍 Cari nama sekolah atau email..."
                    value={plotSchoolSearch}
                    onChange={(e) => setPlotSchoolSearch(e.target.value)}
                    style={{
                      ...inputStyle,
                      padding: '7px 12px',
                      fontSize: '0.85rem',
                      flex: 1,
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleSelectAllFilteredSchools}
                    style={{
                      whiteSpace: 'nowrap',
                      padding: '7px 12px',
                      borderRadius: '6px',
                      border: '1px solid #cbd5e1',
                      background: '#f1f5f9',
                      color: '#0f172a',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {filteredModalSchools.length > 0 &&
                    filteredModalSchools.every((s) => plotSchoolIds.includes(s.id))
                      ? '✓ Batal Pilih Semua'
                      : `☑ Pilih Semua (${filteredModalSchools.length})`}
                  </button>
                </div>

                {/* Checklist Box Sekolah */}
                <div
                  style={{
                    maxHeight: '190px',
                    overflowY: 'auto',
                    border: '1px solid #cbd5e1',
                    borderRadius: '8px',
                    background: '#fff',
                    padding: '4px',
                  }}
                >
                  {filteredModalSchools.length === 0 ? (
                    <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>
                      Tidak ada sekolah yang cocok dengan filter.
                    </div>
                  ) : (
                    filteredModalSchools.map((s) => {
                      const isChecked = plotSchoolIds.includes(s.id);
                      return (
                        <div
                          key={s.id}
                          onClick={() => toggleSelectSchool(s.id)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            padding: '6px 10px',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            background: isChecked ? '#e0f2fe' : 'transparent',
                            marginBottom: '2px',
                            userSelect: 'none',
                          }}
                          onMouseOver={(e) => {
                            if (!isChecked) e.currentTarget.style.background = '#f8fafc';
                          }}
                          onMouseOut={(e) => {
                            if (!isChecked) e.currentTarget.style.background = 'transparent';
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {}} // dikendalikan oleh parent onClick
                            style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                          />
                          <span
                            style={{
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              background: '#f1f5f9',
                              color: '#475569',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              minWidth: '40px',
                              textAlign: 'center',
                            }}
                          >
                            {s.level}
                          </span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: '0.88rem', fontWeight: 600, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {s.school_name}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {s.email}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Status Terpilih */}
                <div style={{ marginTop: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.82rem', color: plotSchoolIds.length > 0 ? '#0284c7' : '#94a3b8', fontWeight: 600 }}>
                    {plotSchoolIds.length > 0 ? `✓ ${plotSchoolIds.length} sekolah dipilih` : 'Belum ada sekolah yang dipilih'}
                  </span>
                  {plotSchoolIds.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setPlotSchoolIds([])}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#ef4444',
                        fontSize: '0.78rem',
                        cursor: 'pointer',
                        padding: 0,
                        fontWeight: 600,
                      }}
                    >
                      Bersihkan Pilihan
                    </button>
                  )}
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label style={labelStyle}>
                    Jenis Baju yang Diproduksi ({plotClothingTypes.length} Jenis Dipilih)
                  </label>
                  {availableClothingTypes.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        if (availableClothingTypes.every((t) => plotClothingTypes.includes(t))) {
                          setPlotClothingTypes(['Semua Jenis Baju']);
                        } else {
                          setPlotClothingTypes([...availableClothingTypes]);
                        }
                      }}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#0284c7',
                        fontSize: '0.78rem',
                        cursor: 'pointer',
                        fontWeight: 600,
                      }}
                    >
                      {availableClothingTypes.every((t) => plotClothingTypes.includes(t))
                        ? 'Pilih Semua Baju'
                        : 'Pilih Semua Item'}
                    </button>
                  )}
                </div>

                <div
                  style={{
                    border: '1px solid #cbd5e1',
                    borderRadius: '8px',
                    background: '#fff',
                    padding: '8px',
                    maxHeight: '160px',
                    overflowY: 'auto',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                  }}
                >
                  {/* Pilihan Semua Jenis Baju */}
                  <div
                    onClick={() => toggleSelectClothingType('Semua Jenis Baju')}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '6px 10px',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      background: plotClothingTypes.includes('Semua Jenis Baju') ? '#e0f2fe' : 'transparent',
                      fontWeight: plotClothingTypes.includes('Semua Jenis Baju') ? 700 : 500,
                      color: plotClothingTypes.includes('Semua Jenis Baju') ? '#0369a1' : '#334155',
                      fontSize: '0.88rem',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={plotClothingTypes.includes('Semua Jenis Baju')}
                      onChange={() => {}}
                      style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                    />
                    <span>👕 Semua Jenis Baju (Full Seragam Sekolah)</span>
                  </div>

                  {/* Pilihan Jenis Baju Spesifik */}
                  {availableClothingTypes.map((item) => {
                    const isChecked = plotClothingTypes.includes(item);
                    return (
                      <div
                        key={item}
                        onClick={() => toggleSelectClothingType(item)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '5px 10px',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          background: isChecked ? '#f0fdf4' : 'transparent',
                          fontWeight: isChecked ? 600 : 400,
                          color: isChecked ? '#166534' : '#475569',
                          fontSize: '0.85rem',
                        }}
                        onMouseOver={(e) => {
                          if (!isChecked) e.currentTarget.style.background = '#f8fafc';
                        }}
                        onMouseOut={(e) => {
                          if (!isChecked) e.currentTarget.style.background = 'transparent';
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {}}
                          style={{ cursor: 'pointer', width: '15px', height: '15px' }}
                        />
                        <span>👔 {item}</span>
                      </div>
                    );
                  })}
                </div>
                <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: '#64748b' }}>
                  * Anda dapat mencentang lebih dari 1 jenis baju (misal: Kotak-Kotak Putra dan Putri). Jika sekolah sudah memiliki penugasan, sistem akan otomatis menggabungkannya tanpa error duplikasi.
                </p>
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
                <button
                  type="submit"
                  className="btn-primary"
                  style={{ flex: 1 }}
                  disabled={submitting || plotSchoolIds.length === 0}
                >
                  {submitting
                    ? 'Menyimpan...'
                    : `Simpan Plotting (${plotSchoolIds.length} Sekolah)`}
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
                    setEditPlotClothingTypes(['Semua Jenis Baju']);
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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label style={labelStyle}>
                    Jenis Baju yang Diproduksi ({editPlotClothingTypes.length} Jenis Dipilih)
                  </label>
                </div>

                <div
                  style={{
                    border: '1px solid #cbd5e1',
                    borderRadius: '8px',
                    background: '#fff',
                    padding: '8px',
                    maxHeight: '160px',
                    overflowY: 'auto',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                  }}
                >
                  <div
                    onClick={() => toggleEditSelectClothingType('Semua Jenis Baju')}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '6px 10px',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      background: editPlotClothingTypes.includes('Semua Jenis Baju') ? '#e0f2fe' : 'transparent',
                      fontWeight: editPlotClothingTypes.includes('Semua Jenis Baju') ? 700 : 500,
                      color: editPlotClothingTypes.includes('Semua Jenis Baju') ? '#0369a1' : '#334155',
                      fontSize: '0.88rem',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={editPlotClothingTypes.includes('Semua Jenis Baju')}
                      onChange={() => {}}
                      style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                    />
                    <span>👕 Semua Jenis Baju (Full Seragam)</span>
                  </div>

                  {editAvailableClothingTypes.map((item) => {
                    const isChecked = editPlotClothingTypes.includes(item);
                    return (
                      <div
                        key={item}
                        onClick={() => toggleEditSelectClothingType(item)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '5px 10px',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          background: isChecked ? '#f0fdf4' : 'transparent',
                          fontWeight: isChecked ? 600 : 400,
                          color: isChecked ? '#166534' : '#475569',
                          fontSize: '0.85rem',
                        }}
                        onMouseOver={(e) => {
                          if (!isChecked) e.currentTarget.style.background = '#f8fafc';
                        }}
                        onMouseOut={(e) => {
                          if (!isChecked) e.currentTarget.style.background = 'transparent';
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {}}
                          style={{ cursor: 'pointer', width: '15px', height: '15px' }}
                        />
                        <span>👔 {item}</span>
                      </div>
                    );
                  })}
                </div>
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
