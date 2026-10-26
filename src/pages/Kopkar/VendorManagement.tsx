import React, { useState, useEffect, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '../../lib/supabase';
import { useProducts } from '../../context/ProductContext';
import KopkarKalkulatorKain from './KopkarKalkulatorKain';
import KopkarPrediksiProduksi from './KopkarPrediksiProduksi';
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

const getLevelRank = (lvl: string): number => {
  const u = (lvl || '').toUpperCase().trim();
  if (u === 'TK' || u === 'TKK') return 1;
  if (u === 'SD' || u === 'SDK') return 2;
  if (u === 'SMP' || u === 'SMPK') return 3;
  if (u === 'SMA' || u === 'SMAK' || u === 'SMK' || u === 'SMKF') return 4;
  if (u === 'SD-SPK' || u === 'SPK-SD' || u.includes('PRIMARY')) return 5;
  if (u === 'SMP-SPK' || u === 'SPK-SMP' || u.includes('LOWER')) return 6;
  if (u === 'SMA-SPK' || u === 'SPK-SMA' || u.includes('UPPER')) return 7;
  return 99;
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
  const [activeTab, setActiveTab] = useState<'vendors' | 'plotting' | 'stock' | 'forecast' | 'calculator'>('vendors');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Data
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [plottings, setPlottings] = useState<Plotting[]>([]);
  const [stocks, setStocks] = useState<VendorStock[]>([]);
  const [schools, setSchools] = useState<SchoolItem[]>([]);

  // Search filter
  const [searchQuery, setSearchQuery] = useState('');

  // Filter khusus tab Plotting & Rekap Sekolah
  const [plotVendorFilter, setPlotVendorFilter] = useState('ALL');
  const [plotLevelFilterTable, setPlotLevelFilterTable] = useState('ALL');

  // Modals Vendor
  const [showAddVendor, setShowAddVendor] = useState(false);
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);
  const [detailVendor, setDetailVendor] = useState<Vendor | null>(null);

  // Modals Plotting
  const [showAddPlotting, setShowAddPlotting] = useState(false);
  const [editingPlotting, setEditingPlotting] = useState<Plotting | null>(null);
  const [detailPlotVendorId, setDetailPlotVendorId] = useState<string | null>(null);
  const [plotLevelFilter, setPlotLevelFilter] = useState('ALL');
  const [plotClothingTypes, setPlotClothingTypes] = useState<string[]>(['Semua Jenis Baju']);

  // Form Plotting (Add)
  const [plotVendorId, setPlotVendorId] = useState('');
  const [plotSchoolIds, setPlotSchoolIds] = useState<string[]>([]);
  const [plotSchoolSearch, setPlotSchoolSearch] = useState('');
  const [plotClothingSearch, setPlotClothingSearch] = useState('');

  // Form Plotting (Edit)
  const [editPlotVendorId, setEditPlotVendorId] = useState('');
  const [editPlotSchoolId, setEditPlotSchoolId] = useState('');
  const [editPlotLevelFilter, setEditPlotLevelFilter] = useState('ALL');
  const [editPlotClothingTypes, setEditPlotClothingTypes] = useState<string[]>([]);
  const [editPlotClothingSearch, setEditPlotClothingSearch] = useState('');

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
    } else if (activeTab === 'plotting' || activeTab === 'forecast') {
      fetchVendors();
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
    const { data, error } = await supabase.from('vendors').select('*').order('name', { ascending: true });
    if (!error && data) {
      data.sort((a, b) => a.name.localeCompare(b.name, 'id', { numeric: true, sensitivity: 'base' }));
      setVendors(data);
    }
    setLoading(false);
  };

  const fetchSchools = async () => {
    try {
      // 1. Ambil data sekolah dari whitelist dan app_users secara paralel
      const [wlRes, appUsersRes] = await Promise.all([
        supabase.from('school_whitelist').select('*').order('nama_sekolah', { ascending: true }),
        supabase.from('app_users').select('id, username, name, school_name, school_level, role').eq('role', 'sekolah'),
      ]);

      const whitelistData = wlRes.data || [];
      const appUsersData = appUsersRes.data || [];

      const userMap = new Map<string, { id: string; school_name: string; school_level: string }>();
      appUsersData.forEach((u) => {
        if (u.username) {
          userMap.set(u.username.toLowerCase().trim(), {
            id: u.id,
            school_name: u.school_name || '',
            school_level: u.school_level || '',
          });
        }
      });

      const list: SchoolItem[] = [];
      const addedSchoolKeys = new Set<string>();

      // A. Ambil dari whitelist (sekolah resmi / Google SSO)
      for (const w of whitelistData) {
        const emailClean = (w.email || '').toLowerCase().trim();
        if (!emailClean) continue;

        let appUser = userMap.get(emailClean);
        const rawJenjang = w.Jenjang || w.jenjang || appUser?.school_level || 'SD';
        const cleanJenjang = typeof rawJenjang === 'string' ? rawJenjang.trim() : rawJenjang;
        const schoolName = (w.nama_sekolah || w.Nama_Sekolah || appUser?.school_name || emailClean).trim();

        // Jika belum ada di app_users, otomatis sinkronkan ke app_users
        if (!appUser) {
          const { data: newUser } = await supabase
            .from('app_users')
            .insert([{
              username: emailClean,
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
          addedSchoolKeys.add(schoolName.toLowerCase().replace(/[^a-z0-9]/g, ''));
        }
      }

      // B. Ambil juga dari app_users yang dibuat secara manual (misal username tanpa email resmi)
      for (const u of appUsersData) {
        const schoolName = (u.school_name || u.name || '').trim();
        if (!schoolName) continue;
        const key = schoolName.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (!addedSchoolKeys.has(key)) {
          list.push({
            id: u.id,
            email: u.username || '',
            school_name: schoolName,
            level: (u.school_level || 'SD').trim(),
          });
          addedSchoolKeys.add(key);
        }
      }

      // Urutkan berdasarkan nama sekolah secara natural (angka kecil ke besar, misal SDK 1 sebelum SDK 10)
      list.sort((a, b) => a.school_name.localeCompare(b.school_name, 'id', { numeric: true, sensitivity: 'base' }));
      setSchools(list);
      schoolsLoadedRef.current = true;

      // Sinkronkan data sekolah ke plottings jika app_users belum terisi
      setPlottings((prev) =>
        prev.map((p) => {
          if (!p.app_users?.school_name) {
            const sch = list.find((s) => s.id === p.school_user_id);
            if (sch) {
              return {
                ...p,
                app_users: {
                  school_name: sch.school_name,
                  username: sch.email || '',
                  school_level: sch.level || '',
                },
              };
            }
          }
          return p;
        })
      );
    } catch (err) {
      console.error('Error fetching schools:', err);
    }
  };

  const fetchPlottings = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('vendor_school_assignments')
      .select('*, vendors(name, contact_person, phone), app_users(school_name, username, school_level)');

    if (!error && data) {
      data.forEach((p) => {
        if (!p.app_users?.school_name) {
          const sch = schools.find((s) => s.id === p.school_user_id);
          if (sch) {
            p.app_users = {
              school_name: sch.school_name,
              username: sch.email || '',
              school_level: sch.level || '',
            };
          }
        }
      });
      data.sort((a, b) =>
        (a.app_users?.school_name || '').localeCompare(b.app_users?.school_name || '', 'id', { numeric: true, sensitivity: 'base' })
      );
      setPlottings(data);
    }
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
    setPlotClothingSearch('');
    setPlotLevelFilter('ALL');
    setPlotClothingTypes(['Semua Jenis Baju']);
    setShowAddPlotting(true);
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

  // Fungsi pengecekan bentrok penugasan seragam antar-vendor
  const findPlottingConflicts = (
    targetVendorId: string,
    targetSchoolId: string,
    targetClothingTypes: string[],
    excludePlottingId?: string
  ): Array<{ schoolName: string; conflictingTypes: string[]; assignedVendorName: string }> => {
    // Cari penugasan yang ada untuk sekolah ini dengan vendor BERBEDA
    const otherVendorPlottings = plottings.filter(
      (p) =>
        p.school_user_id === targetSchoolId &&
        p.vendor_id !== targetVendorId &&
        (!excludePlottingId || p.id !== excludePlottingId)
    );

    if (otherVendorPlottings.length === 0) return [];

    const conflicts: Array<{ schoolName: string; conflictingTypes: string[]; assignedVendorName: string }> = [];
    const targetIsAll = targetClothingTypes.includes('Semua Jenis Baju');

    for (const p of otherVendorPlottings) {
      const assignedVendor = vendors.find((v) => v.id === p.vendor_id);
      const assignedVendorName = p.vendors?.name || assignedVendor?.name || 'Vendor Lain';
      const sch = schools.find((s) => s.id === targetSchoolId);
      const schoolName = p.app_users?.school_name || sch?.school_name || 'Sekolah Terpilih';

      const existingTypesRaw = (p.clothing_type || 'Semua Jenis Baju')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      const existingIsAll = existingTypesRaw.some((t) => t.toLowerCase() === 'semua jenis baju');
      const existingTypesLower = existingTypesRaw.map((t) => t.toLowerCase());

      const matchedConflicts: string[] = [];

      if (targetIsAll) {
        // Jika target memilih 'Semua Jenis Baju', tapi vendor lain sudah pegang barang apa pun
        matchedConflicts.push(p.clothing_type || 'Semua Jenis Baju');
      } else if (existingIsAll) {
        // Jika vendor lain sudah memegang 'Semua Jenis Baju' untuk sekolah ini
        matchedConflicts.push('Semua Jenis Baju');
      } else {
        // Jika keduanya memegang jenis baju spesifik, cari kesamaan (irisan) jenis baju
        for (const t of targetClothingTypes) {
          if (existingTypesLower.includes(t.trim().toLowerCase())) {
            matchedConflicts.push(t);
          }
        }
      }

      if (matchedConflicts.length > 0) {
        conflicts.push({
          schoolName,
          conflictingTypes: Array.from(new Set(matchedConflicts)),
          assignedVendorName,
        });
      }
    }

    return conflicts;
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

    // Validasi pencegahan bentrok: pastikan tidak ada vendor lain yang memegang jenis baju yang sama di sekolah terpilih
    const allConflicts: Array<{ schoolName: string; conflictingTypes: string[]; assignedVendorName: string }> = [];

    for (const schId of plotSchoolIds) {
      const confs = findPlottingConflicts(plotVendorId, schId, plotClothingTypes);
      allConflicts.push(...confs);
    }

    if (allConflicts.length > 0) {
      const details = allConflicts
        .map(
          (c) => `• ${c.conflictingTypes.join(', ')} untuk ${c.schoolName} sudah dikerjakan oleh ${c.assignedVendorName}`
        )
        .join('\n');

      alert(
        `⚠️ Tidak dapat menyimpan plotting!\n\n` +
        `Terdapat jenis seragam yang sudah dikerjakan oleh vendor lain:\n${details}\n\n` +
        `Satu jenis seragam di sekolah yang sama tidak dapat dikerjakan oleh lebih dari satu vendor.`
      );
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
    setEditPlotClothingSearch('');
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

    // Validasi pencegahan bentrok saat update
    const editConflicts = findPlottingConflicts(
      editPlotVendorId,
      editPlotSchoolId,
      editPlotClothingTypes,
      editingPlotting.id
    );

    if (editConflicts.length > 0) {
      const details = editConflicts
        .map(
          (c) => `• ${c.conflictingTypes.join(', ')} untuk ${c.schoolName} sudah dikerjakan oleh ${c.assignedVendorName}`
        )
        .join('\n');

      alert(
        `⚠️ Tidak dapat memperbarui plotting!\n\n` +
        `Terdapat jenis seragam yang sudah dikerjakan oleh vendor lain:\n${details}\n\n` +
        `Satu jenis seragam di sekolah yang sama tidak dapat dikerjakan oleh lebih dari satu vendor.`
      );
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

  // Filtered lists for search query (selalu urut alfabetis)
  const filteredVendors = vendors
    .filter(
      (v) =>
        v.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        v.contact_person?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        v.phone?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        v.address?.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .sort((a, b) => a.name.localeCompare(b.name, 'id', { numeric: true, sensitivity: 'base' }));

  const filteredPlottings = useMemo(() => {
    return plottings
      .filter((p) => {
        const matchesVendor = plotVendorFilter === 'ALL' || p.vendor_id === plotVendorFilter;
        const matchesLevel =
          plotLevelFilterTable === 'ALL' ||
          (p.app_users?.school_level || '').toUpperCase() === plotLevelFilterTable.toUpperCase();
        const q = searchQuery.toLowerCase().trim();
        const matchesSearch =
          !q ||
          (p.vendors?.name || '').toLowerCase().includes(q) ||
          (p.app_users?.school_name || '').toLowerCase().includes(q) ||
          (p.clothing_type || '').toLowerCase().includes(q) ||
          (p.app_users?.username || '').toLowerCase().includes(q) ||
          (p.app_users?.school_level || '').toLowerCase().includes(q);

        return matchesVendor && matchesLevel && matchesSearch;
      })
      .sort((a, b) =>
        (a.app_users?.school_name || '').localeCompare(
          b.app_users?.school_name || '',
          'id',
          { numeric: true, sensitivity: 'base' }
        )
      );
  }, [plottings, plotVendorFilter, plotLevelFilterTable, searchQuery]);

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
    ).sort((a, b) => a.localeCompare(b, 'id', { numeric: true, sensitivity: 'base' }));
  }, [products, selectedPlotLevels]);

  // Jenis baju terfilter berdasarkan search di modal tambah plotting
  const filteredAvailableClothingTypes = useMemo(() => {
    const q = plotClothingSearch.toLowerCase().trim();
    if (!q) return availableClothingTypes;
    return availableClothingTypes.filter((item) => item.toLowerCase().includes(q));
  }, [availableClothingTypes, plotClothingSearch]);

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

    map.forEach((entry) => {
      entry.items.sort((a, b) =>
        (a.app_users?.school_name || '').localeCompare(b.app_users?.school_name || '', 'id', { numeric: true, sensitivity: 'base' })
      );
    });

    return Array.from(map.values()).sort((a, b) =>
      a.vendorName.localeCompare(b.vendorName, 'id', { numeric: true, sensitivity: 'base' })
    );
  }, [filteredPlottings, vendors]);

  // Data vendor yang dipilih untuk modal detail plotting ("Klik Selengkapnya")
  const activeDetailPlotGroup = useMemo(() => {
    if (!detailPlotVendorId) return null;
    return groupedPlottings.find((g) => g.vendorId === detailPlotVendorId) || null;
  }, [detailPlotVendorId, groupedPlottings]);

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
  ).sort((a, b) => a.localeCompare(b, 'id', { numeric: true, sensitivity: 'base' }));

  // Jenis baju terfilter berdasarkan search di modal edit plotting
  const filteredEditAvailableClothingTypes = useMemo(() => {
    const q = editPlotClothingSearch.toLowerCase().trim();
    if (!q) return editAvailableClothingTypes;
    return editAvailableClothingTypes.filter((item) => item.toLowerCase().includes(q));
  }, [editAvailableClothingTypes, editPlotClothingSearch]);

  // Filter sekolah di modal edit plotting
  const filteredEditModalSchools =
    editPlotLevelFilter === 'ALL'
      ? schools
      : schools.filter((s) => s.level.toUpperCase() === editPlotLevelFilter);

  // Deteksi bentrok realtime untuk modal Add Plotting
  const addPlottingConflicts = useMemo(() => {
    if (!plotVendorId || plotSchoolIds.length === 0 || plotClothingTypes.length === 0) {
      return [];
    }
    const list: Array<{ schoolName: string; conflictingTypes: string[]; assignedVendorName: string }> = [];
    for (const schId of plotSchoolIds) {
      const confs = findPlottingConflicts(plotVendorId, schId, plotClothingTypes);
      list.push(...confs);
    }
    return list;
  }, [plotVendorId, plotSchoolIds, plotClothingTypes, plottings, vendors, schools]);

  // Deteksi bentrok realtime untuk modal Edit Plotting
  const editPlottingConflicts = useMemo(() => {
    if (!editingPlotting || !editPlotVendorId || !editPlotSchoolId || editPlotClothingTypes.length === 0) {
      return [];
    }
    return findPlottingConflicts(editPlotVendorId, editPlotSchoolId, editPlotClothingTypes, editingPlotting.id);
  }, [editingPlotting, editPlotVendorId, editPlotSchoolId, editPlotClothingTypes, plottings, vendors, schools]);

  // Export Excel untuk Plotting & Rekap Sekolah
  const handleExportExcelVendorSekolah = () => {
    if (filteredPlottings.length === 0) {
      alert('Tidak ada data penugasan plotting sekolah untuk diekspor.');
      return;
    }

    const sortedPlottings = [...filteredPlottings].sort((a, b) => {
      const schA = schools.find((item) => item.id === a.school_user_id);
      const schB = schools.find((item) => item.id === b.school_user_id);
      const lvlA = a.app_users?.school_level || schA?.level || '';
      const lvlB = b.app_users?.school_level || schB?.level || '';
      const rankA = getLevelRank(lvlA);
      const rankB = getLevelRank(lvlB);
      if (rankA !== rankB) return rankA - rankB;
      const sNameA = a.app_users?.school_name || schA?.school_name || '';
      const sNameB = b.app_users?.school_name || schB?.school_name || '';
      return sNameA.localeCompare(sNameB, 'id', { numeric: true, sensitivity: 'base' });
    });

    const exportData = sortedPlottings.map((p, idx) => {
      const v = vendors.find((item) => item.id === p.vendor_id);
      const sch = schools.find((item) => item.id === p.school_user_id);
      const sName = p.app_users?.school_name || sch?.school_name || '-';
      const sLvl = p.app_users?.school_level || sch?.level || '-';
      return {
        'No.': idx + 1,
        'Nama Vendor': p.vendors?.name || v?.name || '-',
        'Sekolah yang Dikerjakan': sName,
        Jenjang: sLvl,
        'Jenis Barang yang Dikerjakan': p.clothing_type || 'Semua Jenis Baju',
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    worksheet['!cols'] = [
      { wch: 6 },
      { wch: 30 },
      { wch: 36 },
      { wch: 14 },
      { wch: 35 },
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Plotting_Rekap_Sekolah');
    XLSX.writeFile(workbook, `Plotting_Rekap_Sekolah_${new Date().toISOString().slice(0, 10)}.xlsx`);
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
          🔗 Plotting & Rekap Sekolah ({plottings.length})
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
          className={`btn-tab ${activeTab === 'forecast' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('forecast');
            setSearchQuery('');
          }}
          style={{
            fontWeight: activeTab === 'forecast' ? 'bold' : 'normal',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: activeTab === 'forecast' ? '#0284c7' : '#64748b',
          }}
        >
          📊 Prediksi Produksi (27/28)
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

      {/* PLOTTING & REKAP TAB */}
      {activeTab === 'plotting' && (
        <div>
          {/* STATS SUMMARY CARDS */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '12px',
              marginBottom: '16px',
            }}
          >
            <div
              style={{
                background: '#fff',
                padding: '12px 18px',
                borderRadius: '10px',
                border: '1px solid #e2e8f0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
              }}
            >
              <div>
                <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>Total Vendor Terplot</div>
                <div style={{ fontSize: '1.35rem', fontWeight: 700, color: '#0284c7', marginTop: '2px' }}>
                  {new Set(filteredPlottings.map((p) => p.vendor_id)).size}{' '}
                  <span style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: 400 }}>vendor</span>
                </div>
              </div>
              <span style={{ fontSize: '1.6rem', opacity: 0.85 }}>🏢</span>
            </div>

            <div
              style={{
                background: '#fff',
                padding: '12px 18px',
                borderRadius: '10px',
                border: '1px solid #e2e8f0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
              }}
            >
              <div>
                <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>Total Sekolah Terlayani</div>
                <div style={{ fontSize: '1.35rem', fontWeight: 700, color: '#059669', marginTop: '2px' }}>
                  {new Set(filteredPlottings.map((p) => p.school_user_id)).size}{' '}
                  <span style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: 400 }}>sekolah</span>
                </div>
              </div>
              <span style={{ fontSize: '1.6rem', opacity: 0.85 }}>🏫</span>
            </div>

            <div
              style={{
                background: '#fff',
                padding: '12px 18px',
                borderRadius: '10px',
                border: '1px solid #e2e8f0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
              }}
            >
              <div>
                <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>Total Penugasan Seragam</div>
                <div style={{ fontSize: '1.35rem', fontWeight: 700, color: '#3b82f6', marginTop: '2px' }}>
                  {filteredPlottings.length}{' '}
                  <span style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: 400 }}>penugasan</span>
                </div>
              </div>
              <span style={{ fontSize: '1.6rem', opacity: 0.85 }}>👔</span>
            </div>
          </div>

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
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', flex: 1 }}>
                <input
                  type="text"
                  placeholder="🔍 Cari vendor, sekolah, jenis baju..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    padding: '8px 14px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '0.88rem',
                    minWidth: '220px',
                    maxWidth: '300px',
                    outline: 'none',
                  }}
                />

                <select
                  value={plotVendorFilter}
                  onChange={(e) => setPlotVendorFilter(e.target.value)}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '0.88rem',
                    background: '#fff',
                    color: '#1e293b',
                    outline: 'none',
                  }}
                >
                  <option value="ALL">Semua Vendor ({vendors.length})</option>
                  {[...vendors]
                    .sort((a, b) => a.name.localeCompare(b.name, 'id', { numeric: true, sensitivity: 'base' }))
                    .map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                      </option>
                    ))}
                </select>

                <select
                  value={plotLevelFilterTable}
                  onChange={(e) => setPlotLevelFilterTable(e.target.value)}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '0.88rem',
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
              </div>

              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <button
                  type="button"
                  onClick={handleExportExcelVendorSekolah}
                  disabled={filteredPlottings.length === 0}
                  style={{
                    background: filteredPlottings.length === 0 ? '#94a3b8' : '#10b981',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '8px 14px',
                    fontSize: '0.88rem',
                    fontWeight: 600,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    cursor: filteredPlottings.length === 0 ? 'not-allowed' : 'pointer',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
                  }}
                  title="Ekspor seluruh penugasan seragam sekolah ke file Excel (.xlsx)"
                >
                  <span>📥</span> Export Excel
                </button>

                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => openAddPlottingModal()}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 16px',
                    fontSize: '0.88rem',
                    fontWeight: 600,
                    borderRadius: '8px',
                    cursor: 'pointer',
                  }}
                >
                  ➕ Plot Sekolah
                </button>
              </div>
            </div>

          <table className="kopkar-table">
            <thead>
              <tr>
                <th style={{ width: '50px', textAlign: 'center' }}>No</th>
                <th style={{ width: '260px' }}>Nama Vendor (Penjahit)</th>
                <th>Sekolah yang Dilayani</th>
                <th style={{ width: '140px', textAlign: 'center' }}>Total Sekolah</th>
                <th style={{ width: '110px', textAlign: 'center' }}>Aksi</th>
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
                groupedPlottings.map((g, idx) => (
                  <tr key={g.vendorId} style={{ transition: 'background 0.15s ease' }}>
                    <td style={{ textAlign: 'center', color: '#64748b', fontWeight: 600, verticalAlign: 'middle' }}>
                      {idx + 1}
                    </td>
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
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
                        {g.items.slice(0, 4).map((item) => (
                          <span
                            key={item.id}
                            style={{
                              background: '#f1f5f9',
                              color: '#334155',
                              border: '1px solid #e2e8f0',
                              padding: '3px 9px',
                              borderRadius: '6px',
                              fontSize: '0.8rem',
                              fontWeight: 600,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                            }}
                          >
                            🏫 {item.app_users?.school_name || 'Sekolah'}
                          </span>
                        ))}
                        {g.items.length > 4 ? (
                          <span
                            onClick={() => setDetailPlotVendorId(g.vendorId)}
                            style={{
                              background: '#e0f2fe',
                              color: '#0284c7',
                              border: '1px solid #bae6fd',
                              padding: '3px 9px',
                              borderRadius: '6px',
                              fontSize: '0.8rem',
                              fontWeight: 600,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              transition: 'all 0.15s ease',
                            }}
                            onMouseOver={(e) => {
                              e.currentTarget.style.background = '#0284c7';
                              e.currentTarget.style.color = '#ffffff';
                            }}
                            onMouseOut={(e) => {
                              e.currentTarget.style.background = '#e0f2fe';
                              e.currentTarget.style.color = '#0284c7';
                            }}
                            title="Klik untuk melihat semua sekolah dan rincian seragam"
                          >
                            +{g.items.length - 4} sekolah lainnya (Klik Selengkapnya)
                          </span>
                        ) : (
                          <span
                            onClick={() => setDetailPlotVendorId(g.vendorId)}
                            style={{
                              background: '#f0f9ff',
                              color: '#0284c7',
                              border: '1px solid #bae6fd',
                              padding: '3px 9px',
                              borderRadius: '6px',
                              fontSize: '0.8rem',
                              fontWeight: 600,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
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
                            title="Klik untuk melihat rincian jenis baju seragam"
                          >
                            Klik Selengkapnya
                          </span>
                        )}
                      </div>
                    </td>
                    <td style={{ textAlign: 'center', verticalAlign: 'middle' }}>
                      <span
                        style={{
                          background: '#f0fdf4',
                          color: '#166534',
                          border: '1px solid #bbf7d0',
                          padding: '4px 12px',
                          borderRadius: '999px',
                          fontWeight: 700,
                          fontSize: '0.82rem',
                          display: 'inline-block',
                        }}
                      >
                        {g.items.length} Sekolah
                      </span>
                    </td>
                    <td style={{ textAlign: 'center', verticalAlign: 'middle' }}>
                      <button
                        type="button"
                        onClick={() => openAddPlottingModal(g.vendorId)}
                        title="Tambah plotting sekolah untuk vendor ini"
                        style={{
                          padding: '6px 14px',
                          borderRadius: '6px',
                          border: '1px solid #16a34a',
                          background: '#f0fdf4',
                          color: '#16a34a',
                          fontWeight: 600,
                          fontSize: '0.82rem',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          transition: 'all 0.15s ease',
                        }}
                        onMouseOver={(e) => {
                          e.currentTarget.style.background = '#16a34a';
                          e.currentTarget.style.color = '#ffffff';
                        }}
                        onMouseOut={(e) => {
                          e.currentTarget.style.background = '#f0fdf4';
                          e.currentTarget.style.color = '#16a34a';
                        }}
                      >
                        + Plot
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
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

      {/* PREDIKSI PRODUKSI TAB */}
      {activeTab === 'forecast' && (
        <div style={{ marginTop: '-12px', marginBottom: '24px' }}>
          <KopkarPrediksiProduksi
            vendors={vendors}
            plottings={plottings}
            schools={schools}
            products={products}
          />
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

      {/* MODAL DETAIL PLOTTING SEKOLAH (KLIK SELENGKAPNYA) */}
      {activeDetailPlotGroup && (
        <div className="modal-overlay">
          <div
            className="modal"
            style={{
              maxWidth: '900px',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              padding: '24px',
            }}
          >
            {/* Header */}
            <div
              style={{
                flexShrink: 0,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                marginBottom: '14px',
                borderBottom: '1px solid #e2e8f0',
                paddingBottom: '12px',
              }}
            >
              <div>
                <h3 style={{ margin: 0, color: '#1e293b', fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  🏢 Detail Plotting Sekolah: {activeDetailPlotGroup.vendorName}
                </h3>
                <p style={{ margin: '4px 0 0 0', fontSize: '0.86rem', color: '#64748b' }}>
                  Rincian penugasan sekolah dan rincian seragam yang dikerjakan oleh vendor ini.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDetailPlotVendorId(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '1.4rem',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  padding: '0 4px',
                  lineHeight: 1,
                }}
                title="Tutup"
              >
                ✕
              </button>
            </div>

            {/* Vendor Profile Card */}
            <div
              style={{
                flexShrink: 0,
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '12px',
                background: '#f8fafc',
                padding: '12px 18px',
                borderRadius: '10px',
                border: '1px solid #e2e8f0',
                marginBottom: '16px',
              }}
            >
              <div>
                <span style={{ fontSize: '0.78rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Vendor</span>
                <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.98rem' }}>{activeDetailPlotGroup.vendorName}</div>
              </div>
              <div>
                <span style={{ fontSize: '0.78rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>PIC & Kontak</span>
                <div style={{ fontWeight: 600, color: '#334155', fontSize: '0.9rem' }}>
                  👤 {activeDetailPlotGroup.contactPerson} • 📞 {activeDetailPlotGroup.phone}
                </div>
              </div>
              <div>
                <span style={{ fontSize: '0.78rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Total Sekolah</span>
                <div>
                  <span
                    style={{
                      background: '#f0fdf4',
                      color: '#166534',
                      border: '1px solid #bbf7d0',
                      padding: '2px 10px',
                      borderRadius: '999px',
                      fontWeight: 700,
                      fontSize: '0.82rem',
                      display: 'inline-block',
                    }}
                  >
                    {activeDetailPlotGroup.items.length} Sekolah Terdaftar
                  </span>
                </div>
              </div>
            </div>

            {/* Rincian Penugasan Sekolah (SCROLLABLE TABLE CONTAINER) */}
            <div
              style={{
                flex: 1,
                border: '1px solid #e2e8f0',
                borderRadius: '10px',
                overflowY: 'auto',
                minHeight: '220px',
                maxHeight: '460px',
                marginBottom: '16px',
                background: '#ffffff',
                boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.02)',
              }}
            >
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
                <thead
                  style={{
                    position: 'sticky',
                    top: 0,
                    zIndex: 10,
                    background: '#f8fafc',
                    borderBottom: '2px solid #e2e8f0',
                  }}
                >
                  <tr>
                    <th style={{ width: '45px', padding: '10px 12px', textAlign: 'center', color: '#475569', fontSize: '0.8rem', background: '#f8fafc' }}>No</th>
                    <th style={{ width: '220px', padding: '10px 12px', textAlign: 'left', color: '#475569', fontSize: '0.8rem', background: '#f8fafc' }}>Sekolah yang Dilayani</th>
                    <th style={{ width: '80px', padding: '10px 12px', textAlign: 'center', color: '#475569', fontSize: '0.8rem', background: '#f8fafc' }}>Jenjang</th>
                    <th style={{ padding: '10px 12px', textAlign: 'left', color: '#475569', fontSize: '0.8rem', background: '#f8fafc' }}>Jenis Baju yang Diproduksi</th>
                    <th style={{ width: '130px', padding: '10px 12px', textAlign: 'center', color: '#475569', fontSize: '0.8rem', background: '#f8fafc' }}>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {activeDetailPlotGroup.items.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ padding: '24px', textAlign: 'center', color: '#94a3b8' }}>
                        Belum ada sekolah yang di-plot ke vendor ini.
                      </td>
                    </tr>
                  ) : (
                    activeDetailPlotGroup.items.map((item, idx) => {
                      const clothingList = (item.clothing_type || 'Semua Jenis Baju')
                        .split(',')
                        .map((ct) => ct.trim())
                        .filter(Boolean);
                      const isAllUniform = clothingList.includes('Semua Jenis Baju');

                      return (
                        <tr key={item.id} style={{ borderBottom: '1px solid #f1f5f9', background: idx % 2 === 0 ? '#fff' : '#fafafa' }}>
                          <td style={{ padding: '12px 10px', textAlign: 'center', color: '#64748b', fontWeight: 600, verticalAlign: 'top' }}>
                            {idx + 1}
                          </td>
                          <td style={{ padding: '12px 12px', verticalAlign: 'top' }}>
                            <strong style={{ color: '#0f172a', fontSize: '0.92rem' }}>
                              {item.app_users?.school_name || 'Sekolah'}
                            </strong>
                          </td>
                          <td style={{ padding: '12px 10px', textAlign: 'center', verticalAlign: 'top' }}>
                            <span
                              style={{
                                background: '#f1f5f9',
                                color: '#475569',
                                padding: '2px 8px',
                                borderRadius: '4px',
                                fontSize: '0.75rem',
                                fontWeight: 700,
                                display: 'inline-block',
                              }}
                            >
                              {item.app_users?.school_level || '-'}
                            </span>
                          </td>
                          <td style={{ padding: '12px 12px', verticalAlign: 'top' }}>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                              {isAllUniform ? (
                                <span
                                  style={{
                                    background: '#e0f2fe',
                                    border: '1px solid #bae6fd',
                                    color: '#0284c7',
                                    padding: '3px 9px',
                                    borderRadius: '5px',
                                    fontSize: '0.78rem',
                                    fontWeight: 600,
                                  }}
                                >
                                  👕 Semua Jenis Baju (Full Seragam)
                                </span>
                              ) : (
                                clothingList.map((ct) => (
                                  <span
                                    key={ct}
                                    style={{
                                      background: '#f0fdf4',
                                      border: '1px solid #bbf7d0',
                                      color: '#166534',
                                      padding: '2px 8px',
                                      borderRadius: '4px',
                                      fontSize: '0.78rem',
                                      fontWeight: 500,
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '3px',
                                    }}
                                  >
                                    👔 {ct}
                                  </span>
                                ))
                              )}
                            </div>
                          </td>
                          <td style={{ padding: '12px 10px', textAlign: 'center', verticalAlign: 'top' }}>
                            <div style={{ display: 'flex', justifyContent: 'center', gap: '6px' }}>
                              <button
                                type="button"
                                onClick={() => handleOpenEditPlotting(item)}
                                title="Edit penugasan ini"
                                style={{
                                  padding: '4px 8px',
                                  background: '#f1f5f9',
                                  border: '1px solid #cbd5e1',
                                  borderRadius: '5px',
                                  cursor: 'pointer',
                                  fontSize: '0.78rem',
                                  color: '#334155',
                                  fontWeight: 600,
                                }}
                              >
                                ✏️ Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeletePlotting(item.id)}
                                title="Hapus penugasan ini"
                                style={{
                                  padding: '4px 8px',
                                  background: '#fef2f2',
                                  border: '1px solid #fecaca',
                                  borderRadius: '5px',
                                  cursor: 'pointer',
                                  color: '#b91c1c',
                                  fontSize: '0.78rem',
                                  fontWeight: 600,
                                }}
                              >
                                🗑️ Hapus
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Modal Actions (FIXED AT BOTTOM) */}
            <div
              style={{
                flexShrink: 0,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '10px',
                paddingTop: '14px',
                borderTop: '1px solid #e2e8f0',
              }}
            >
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  const vId = activeDetailPlotGroup.vendorId;
                  openAddPlottingModal(vId);
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 16px',
                  fontSize: '0.85rem',
                }}
              >
                ➕ Tambah Sekolah untuk Vendor Ini
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setDetailPlotVendorId(null)}
                style={{ padding: '8px 18px', fontSize: '0.85rem' }}
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL TAMBAH PLOTTING SEKOLAH */}
      {showAddPlotting && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: '620px', maxHeight: '90vh', overflowY: 'auto' }}>
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
                  {[...vendors]
                    .sort((a, b) => a.name.localeCompare(b.name, 'id', { numeric: true, sensitivity: 'base' }))
                    .map((v) => (
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
                    {['ALL', 'TK', 'SD', 'SMP', 'SMA', 'SD-SPK', 'SMP-SPK', 'SMA-SPK'].map((lvl) => (
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
                    placeholder="🔍 Cari nama sekolah..."
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
                          <span
                            style={{
                              flex: 1,
                              fontSize: '0.88rem',
                              fontWeight: isChecked ? 700 : 500,
                              color: isChecked ? '#0369a1' : '#1e293b',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {s.school_name}
                          </span>
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

                {/* Search Bar Jenis Baju (seperti fitur cari sekolah) */}
                <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                  <input
                    type="text"
                    placeholder="🔍 Cari jenis baju / seragam..."
                    value={plotClothingSearch}
                    onChange={(e) => setPlotClothingSearch(e.target.value)}
                    style={{
                      ...inputStyle,
                      padding: '7px 12px',
                      fontSize: '0.85rem',
                      flex: 1,
                    }}
                  />
                  {plotClothingSearch && (
                    <button
                      type="button"
                      onClick={() => setPlotClothingSearch('')}
                      style={{
                        padding: '7px 12px',
                        borderRadius: '6px',
                        border: '1px solid #cbd5e1',
                        background: '#f1f5f9',
                        color: '#475569',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                      title="Bersihkan kata kunci pencarian"
                    >
                      ✕ Reset
                    </button>
                  )}
                  {filteredAvailableClothingTypes.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        const targetList = filteredAvailableClothingTypes;
                        const allChecked = targetList.every((t) => plotClothingTypes.includes(t));
                        if (allChecked) {
                          setPlotClothingTypes((prev) => {
                            const next = prev.filter((t) => !targetList.includes(t));
                            return next.length === 0 ? ['Semua Jenis Baju'] : next;
                          });
                        } else {
                          setPlotClothingTypes((prev) => {
                            const clean = prev.filter((t) => t !== 'Semua Jenis Baju');
                            return Array.from(new Set([...clean, ...targetList]));
                          });
                        }
                      }}
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
                      {filteredAvailableClothingTypes.length > 0 &&
                      filteredAvailableClothingTypes.every((t) => plotClothingTypes.includes(t))
                        ? '✓ Batal Pilih'
                        : `☑ Pilih (${filteredAvailableClothingTypes.length})`}
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
                  {(!plotClothingSearch || 'semua jenis baju full seragam sekolah'.includes(plotClothingSearch.toLowerCase().trim())) && (
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
                  )}

                  {/* Pilihan Jenis Baju Spesifik */}
                  {filteredAvailableClothingTypes.length === 0 && plotClothingSearch && !'semua jenis baju full seragam sekolah'.includes(plotClothingSearch.toLowerCase().trim()) ? (
                    <div style={{ padding: '16px', textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>
                      Tidak ada jenis baju yang cocok dengan pencarian "{plotClothingSearch}".
                    </div>
                  ) : (
                    filteredAvailableClothingTypes.map((item) => {
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
                    })
                  )}
                </div>
                <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: '#64748b' }}>
                  * Anda dapat mencentang lebih dari 1 jenis baju (misal: Kotak-Kotak Putra dan Putri). Jika sekolah sudah memiliki penugasan, sistem akan otomatis menggabungkannya tanpa error duplikasi.
                </p>
              </div>

              {/* Alert Bentrok Penugasan Vendor */}
              {addPlottingConflicts.length > 0 && (
                <div
                  style={{
                    background: '#fef2f2',
                    border: '1px solid #f87171',
                    borderRadius: '8px',
                    padding: '10px 14px',
                    color: '#991b1b',
                    fontSize: '0.85rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700 }}>
                    <span>⚠️ Terdeteksi Bentrok Penugasan:</span>
                  </div>
                  <ul style={{ margin: '4px 0 0 0', paddingLeft: '18px', lineHeight: 1.4 }}>
                    {addPlottingConflicts.map((c, idx) => (
                      <li key={idx}>
                        <strong>{c.conflictingTypes.join(', ')}</strong> untuk <strong>{c.schoolName}</strong> sudah dikerjakan oleh <strong>{c.assignedVendorName}</strong>.
                      </li>
                    ))}
                  </ul>
                  <div style={{ fontSize: '0.78rem', color: '#b91c1c', marginTop: '2px' }}>
                    * Mohon batalkan pilihan sekolah/jenis baju yang bentrok, atau edit penugasan vendor sebelumnya.
                  </div>
                </div>
              )}

              <div
                style={{
                  position: 'sticky',
                  bottom: 0,
                  background: '#ffffff',
                  paddingTop: '12px',
                  marginTop: '12px',
                  borderTop: '1px solid #e2e8f0',
                  display: 'flex',
                  gap: '12px',
                  zIndex: 20,
                }}
              >
                <button
                  type="submit"
                  className="btn-primary"
                  style={{ flex: 1 }}
                  disabled={submitting || plotSchoolIds.length === 0 || addPlottingConflicts.length > 0}
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
          <div className="modal" style={{ maxWidth: '560px', maxHeight: '90vh', overflowY: 'auto' }}>
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
                  {[...vendors]
                    .sort((a, b) => a.name.localeCompare(b.name, 'id', { numeric: true, sensitivity: 'base' }))
                    .map((v) => (
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
                    {['ALL', 'TK', 'SD', 'SMP', 'SMA', 'SD-SPK', 'SMP-SPK', 'SMA-SPK'].map((lvl) => (
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
                      [{s.level}] {s.school_name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label style={labelStyle}>
                    Jenis Baju yang Diproduksi ({editPlotClothingTypes.length} Jenis Dipilih)
                  </label>
                  {editAvailableClothingTypes.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        if (editAvailableClothingTypes.every((t) => editPlotClothingTypes.includes(t))) {
                          setEditPlotClothingTypes(['Semua Jenis Baju']);
                        } else {
                          setEditPlotClothingTypes([...editAvailableClothingTypes]);
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
                      {editAvailableClothingTypes.every((t) => editPlotClothingTypes.includes(t))
                        ? 'Pilih Semua Baju'
                        : 'Pilih Semua Item'}
                    </button>
                  )}
                </div>

                {/* Search Bar Jenis Baju di Edit Modal */}
                <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                  <input
                    type="text"
                    placeholder="🔍 Cari jenis baju / seragam..."
                    value={editPlotClothingSearch}
                    onChange={(e) => setEditPlotClothingSearch(e.target.value)}
                    style={{
                      ...inputStyle,
                      padding: '7px 12px',
                      fontSize: '0.85rem',
                      flex: 1,
                    }}
                  />
                  {editPlotClothingSearch && (
                    <button
                      type="button"
                      onClick={() => setEditPlotClothingSearch('')}
                      style={{
                        padding: '7px 12px',
                        borderRadius: '6px',
                        border: '1px solid #cbd5e1',
                        background: '#f1f5f9',
                        color: '#475569',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                      title="Bersihkan kata kunci pencarian"
                    >
                      ✕ Reset
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
                  {(!editPlotClothingSearch || 'semua jenis baju full seragam'.includes(editPlotClothingSearch.toLowerCase().trim())) && (
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
                  )}

                  {filteredEditAvailableClothingTypes.length === 0 && editPlotClothingSearch && !'semua jenis baju full seragam'.includes(editPlotClothingSearch.toLowerCase().trim()) ? (
                    <div style={{ padding: '16px', textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>
                      Tidak ada jenis baju yang cocok dengan pencarian "{editPlotClothingSearch}".
                    </div>
                  ) : (
                    filteredEditAvailableClothingTypes.map((item) => {
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
                    })
                  )}
                </div>
              </div>

              {/* Alert Bentrok Penugasan Vendor saat Edit */}
              {editPlottingConflicts.length > 0 && (
                <div
                  style={{
                    background: '#fef2f2',
                    border: '1px solid #f87171',
                    borderRadius: '8px',
                    padding: '10px 14px',
                    color: '#991b1b',
                    fontSize: '0.85rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700 }}>
                    <span>⚠️ Terdeteksi Bentrok Penugasan:</span>
                  </div>
                  <ul style={{ margin: '4px 0 0 0', paddingLeft: '18px', lineHeight: 1.4 }}>
                    {editPlottingConflicts.map((c, idx) => (
                      <li key={idx}>
                        <strong>{c.conflictingTypes.join(', ')}</strong> untuk <strong>{c.schoolName}</strong> sudah dikerjakan oleh <strong>{c.assignedVendorName}</strong>.
                      </li>
                    ))}
                  </ul>
                  <div style={{ fontSize: '0.78rem', color: '#b91c1c', marginTop: '2px' }}>
                    * Mohon sesuaikan jenis baju atau vendor agar tidak bentrok.
                  </div>
                </div>
              )}

              <div
                style={{
                  position: 'sticky',
                  bottom: 0,
                  background: '#ffffff',
                  paddingTop: '12px',
                  marginTop: '12px',
                  borderTop: '1px solid #e2e8f0',
                  display: 'flex',
                  gap: '12px',
                  zIndex: 20,
                }}
              >
                <button
                  type="submit"
                  className="btn-primary"
                  style={{ flex: 1 }}
                  disabled={submitting || editPlottingConflicts.length > 0}
                >
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
                  {[...vendors]
                    .sort((a, b) => a.name.localeCompare(b.name, 'id', { numeric: true, sensitivity: 'base' }))
                    .map((v) => (
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
