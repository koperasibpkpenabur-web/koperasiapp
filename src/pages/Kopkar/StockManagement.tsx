import { useState, useEffect, useRef, type ChangeEvent, type FormEvent } from 'react';
import { useProducts } from '../../context/ProductContext';
import type { ProductItem, SchoolLevel } from '../../types';
import './catalog.css';

const StockManagement = () => {
  const {
    products,
    setProductStock,
    updateProduct,
    deleteProduct,
    importProductsFromExcel,
    downloadTemplateCsv,
    exportProductsCsv,
  } = useProducts();

  // Search, Filters & Sorting
  const [searchQuery, setSearchQuery] = useState('');
  const [levelFilter, setLevelFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'safe' | 'low' | 'empty'>('all');
  const [sortBy, setSortBy] = useState<'name' | 'stock-desc' | 'stock-asc' | 'level' | 'value-desc'>('stock-asc');

  // Drag & Drop
  const [importStatus, setImportStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Modal Set Stock Manual
  const [editingStockItem, setEditingStockItem] = useState<ProductItem | null>(null);
  const [newStockValue, setNewStockValue] = useState<number>(0);
  const [stockOpnameNotes, setStockOpnameNotes] = useState('');

  // Modal Tambah Stock Inbound (Barang dari Excel)
  const [showAddModal, setShowAddModal] = useState(false);
  const [addLevel, setAddLevel] = useState<SchoolLevel | 'SEMUA'>('SMP');
  const [addSelectedProductId, setAddSelectedProductId] = useState('');
  const [addAddedStock, setAddAddedStock] = useState<number>(0);
  const [addFormError, setAddFormError] = useState('');

  // Action Menu
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  // Modal Detail Item
  const [detailItem, setDetailItem] = useState<ProductItem | null>(null);
  const [detailSize, setDetailSize] = useState('');
  const [detailLocation, setDetailLocation] = useState('');
  const [detailPriceKopkar, setDetailPriceKopkar] = useState<number>(0);
  const [detailFeeSchool, setDetailFeeSchool] = useState<number>(0);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFile(e.target.files[0]);
    }
  };

  const processFile = (file: File) => {
    setImportStatus(null);
    const reader = new FileReader();

    reader.onload = async (event) => {
      const buffer = event.target?.result as ArrayBuffer;
      if (!buffer) {
        setImportStatus({ type: 'error', message: 'File kosong atau tidak dapat dibaca' });
        return;
      }

      const res = await importProductsFromExcel(buffer);
      if (res.success) {
        setImportStatus({
          type: 'success',
          message: `Berhasil mengakumulasi stock & data barang dari file "${file.name}"! Data langsung tersinkronisasi dengan Katalog & Harga.`,
        });
      } else {
        setImportStatus({
          type: 'error',
          message: res.error || 'Gagal memproses file',
        });
      }
    };

    reader.readAsArrayBuffer(file);
  };

  // Quick Open Modal Set Stock
  const handleOpenSetStock = (item: ProductItem) => {
    setEditingStockItem(item);
    setNewStockValue(item.stock || 0);
    setStockOpnameNotes('');
  };

  const handleSaveSetStock = (e: FormEvent) => {
    e.preventDefault();
    if (!editingStockItem) return;
    setProductStock(editingStockItem.id, Math.max(0, newStockValue));
    setEditingStockItem(null);
  };

  // Add Stock Submit
  const handleAddSubmit = (e: FormEvent) => {
    e.preventDefault();
    setAddFormError('');

    if (!addSelectedProductId) {
      setAddFormError('Silakan pilih barang terlebih dahulu');
      return;
    }

    if (addAddedStock <= 0) {
      setAddFormError('Jumlah stock yang ditambahkan harus lebih dari 0');
      return;
    }

    const product = products.find(p => p.id === addSelectedProductId);
    if (product) {
      setProductStock(product.id, (product.stock || 0) + addAddedStock);
    }

    setShowAddModal(false);
  };

  const handleOpenDetail = (item: ProductItem) => {
    setDetailItem(item);
    setDetailSize(item.size || '');
    setDetailLocation(item.storageLocation || '');
    setDetailPriceKopkar(item.priceKopkar || 0);
    setDetailFeeSchool(item.feeSchool || 0);
  };

  const handleSaveDetail = async (e: FormEvent) => {
    e.preventDefault();
    if (!detailItem) return;
    await updateProduct(detailItem.id, {
      size: detailSize,
      storageLocation: detailLocation,
      priceKopkar: detailPriceKopkar,
      feeSchool: detailFeeSchool,
      priceStudent: detailPriceKopkar + detailFeeSchool,
    });
    setDetailItem(null);
  };

  const handleDeleteItem = async (item: ProductItem) => {
    if (window.confirm(`Yakin ingin menghapus barang "${item.name}" dari sistem?`)) {
      await deleteProduct(item.id);
    }
  };

  // Click outside to close action menu
  useEffect(() => {
    const handleClickOutside = () => setActiveMenuId(null);
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  // Filter & Sort Logic
  const filteredAndSortedProducts = products
    .filter((p) => {
      const matchesSearch =
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.code.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesLevel = levelFilter === 'all' || p.level === levelFilter;

      const currentStock = p.stock || 0;
      let matchesStatus = true;
      if (statusFilter === 'safe') matchesStatus = currentStock > 20;
      else if (statusFilter === 'low') matchesStatus = currentStock > 0 && currentStock <= 20;
      else if (statusFilter === 'empty') matchesStatus = currentStock === 0;

      return matchesSearch && matchesLevel && matchesStatus;
    })
    .sort((a, b) => {
      const stockA = a.stock || 0;
      const stockB = b.stock || 0;

      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if (sortBy === 'stock-asc') return stockA - stockB; // Tampilkan yang menipis lebih dulu
      if (sortBy === 'stock-desc') return stockB - stockA;
      if (sortBy === 'level') return a.level.localeCompare(b.level);
      if (sortBy === 'value-desc') return (stockB * b.priceKopkar) - (stockA * a.priceKopkar);
      return 0;
    });

  // Calculate Dashboard Totals
  const totalBarangJenis = products.length;
  const totalUnitStock = products.reduce((acc, p) => acc + (p.stock || 0), 0);
  const totalNilaiModal = products.reduce((acc, p) => acc + ((p.stock || 0) * p.priceKopkar), 0);
  const countStockAman = products.filter((p) => (p.stock || 0) > 20).length;
  const countStockMenipis = products.filter((p) => (p.stock || 0) > 0 && (p.stock || 0) <= 20).length;
  const countStockHabis = products.filter((p) => (p.stock || 0) === 0).length;

  const formatRupiah = (num: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(num);
  };

  return (
    <div className="catalog-page">
      {/* Header */}
      <div className="catalog-header">
        <div>
          <h2>Dashboard Stock Barang</h2>
          <div className="catalog-subtitle">
            Pusat monitoring inventori fisik, opname stok, dan sinkronisasi akumulasi barang koperasi per jenjang.
          </div>
        </div>

        <div className="catalog-header-actions" style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button className="btn-template" onClick={downloadTemplateCsv} title="Unduh Template Format 8 Kolom">
            📥 Unduh Template Excel
          </button>
          
          <button 
            className="btn-browse" 
            onClick={() => fileInputRef.current?.click()} 
            title="Import data dari Excel"
            style={{ padding: '9px 16px', backgroundColor: '#e2e8f0', color: '#0f172a', border: '1px solid #cbd5e1', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
          >
            📊 Import Excel
          </button>

          <button className="btn-export" onClick={exportProductsCsv} title="Export data stock ke Excel/CSV">
            📤 Export Stock Excel
          </button>
          <button
            className="btn-primary"
            onClick={() => {
              setAddLevel('SMP');
              setAddSelectedProductId('');
              setAddAddedStock(0);
              setAddFormError('');
              setShowAddModal(true);
            }}
          >
            + Tambah Stock Barang
          </button>
        </div>
      </div>

      {/* DASHBOARD TOTAL BARANG (Stat Cards) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
          gap: '14px',
          marginBottom: '22px',
        }}
      >
        <div
          style={{
            background: '#ffffff',
            border: '1px solid #d5deef',
            borderRadius: '14px',
            padding: '16px 18px',
            boxShadow: '0 2px 6px rgba(57, 88, 134, 0.05)',
          }}
        >
          <div style={{ fontSize: '1.2rem', marginBottom: '6px' }}>📦</div>
          <div style={{ fontSize: '0.74rem', color: '#586b84', fontWeight: 600, textTransform: 'uppercase' }}>
            Total Jenis Barang
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1e2d42' }}>
            {totalBarangJenis} <span style={{ fontSize: '0.85rem', fontWeight: 500, color: '#586b84' }}>item</span>
          </div>
        </div>

        <div
          style={{
            background: '#ffffff',
            border: '1px solid #d5deef',
            borderRadius: '14px',
            padding: '16px 18px',
            boxShadow: '0 2px 6px rgba(57, 88, 134, 0.05)',
          }}
        >
          <div style={{ fontSize: '1.2rem', marginBottom: '6px' }}>🏬</div>
          <div style={{ fontSize: '0.74rem', color: '#586b84', fontWeight: 600, textTransform: 'uppercase' }}>
            Total Unit Fisik Stock
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#395886' }}>
            {totalUnitStock.toLocaleString('id-ID')} <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>pcs</span>
          </div>
        </div>

        <div
          style={{
            background: '#ffffff',
            border: '1px solid #d5deef',
            borderRadius: '14px',
            padding: '16px 18px',
            boxShadow: '0 2px 6px rgba(57, 88, 134, 0.05)',
          }}
        >
          <div style={{ fontSize: '1.2rem', marginBottom: '6px' }}>💰</div>
          <div style={{ fontSize: '0.74rem', color: '#586b84', fontWeight: 600, textTransform: 'uppercase' }}>
            Total Modal Nilai Stock
          </div>
          <div style={{ fontSize: '1.35rem', fontWeight: 700, color: '#0d9488' }}>
            {formatRupiah(totalNilaiModal)}
          </div>
        </div>

        <div
          style={{
            background: '#ffffff',
            border: '1px solid #d5deef',
            borderRadius: '14px',
            padding: '16px 18px',
            boxShadow: '0 2px 6px rgba(57, 88, 134, 0.05)',
          }}
        >
          <div style={{ fontSize: '1.2rem', marginBottom: '6px' }}>🟢</div>
          <div style={{ fontSize: '0.74rem', color: '#586b84', fontWeight: 600, textTransform: 'uppercase' }}>
            Stock Aman (&gt;20 pcs)
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0d9488' }}>
            {countStockAman} <span style={{ fontSize: '0.82rem', fontWeight: 500, color: '#586b84' }}>barang</span>
          </div>
        </div>

        <div
          onClick={() => {
            setStatusFilter('low');
            setSortBy('stock-asc');
          }}
          style={{
            background: '#ffffff',
            border: '1px solid #fde68a',
            borderRadius: '14px',
            padding: '16px 18px',
            boxShadow: '0 2px 6px rgba(57, 88, 134, 0.05)',
            cursor: 'pointer',
          }}
        >
          <div style={{ fontSize: '1.2rem', marginBottom: '6px' }}>⚠️</div>
          <div style={{ fontSize: '0.74rem', color: '#d97706', fontWeight: 600, textTransform: 'uppercase' }}>
            Stock Menipis (1-20 pcs)
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#d97706' }}>
            {countStockMenipis} <span style={{ fontSize: '0.82rem', fontWeight: 500, color: '#586b84' }}>barang</span>
          </div>
        </div>

        <div
          onClick={() => {
            setStatusFilter('empty');
            setSortBy('stock-asc');
          }}
          style={{
            background: '#ffffff',
            border: '1px solid #fecdd3',
            borderRadius: '14px',
            padding: '16px 18px',
            boxShadow: '0 2px 6px rgba(57, 88, 134, 0.05)',
            cursor: 'pointer',
          }}
        >
          <div style={{ fontSize: '1.2rem', marginBottom: '6px' }}>🔴</div>
          <div style={{ fontSize: '0.74rem', color: '#e11d48', fontWeight: 600, textTransform: 'uppercase' }}>
            Stock Habis (0 pcs)
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#e11d48' }}>
            {countStockHabis} <span style={{ fontSize: '0.82rem', fontWeight: 500, color: '#586b84' }}>barang</span>
          </div>
        </div>
      </div>

      {/* Import File Input (Hidden) */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      {importStatus && (
        <div className={`drop-status-alert ${importStatus.type}`}>
          <span>{importStatus.message}</span>
          <button
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontWeight: 700 }}
            onClick={() => setImportStatus(null)}
          >
            ✕
          </button>
        </div>
      )}

      {/* TOOLBAR FILTER & SORT JENJANG */}
      <div className="catalog-toolbar">
        <div className="catalog-filters">
          <input
            type="text"
            placeholder="Cari kode atau nama barang..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />

          {/* Sort / Filter Jenjang Sesuai Request */}
          <select value={levelFilter} onChange={(e) => setLevelFilter(e.target.value)}>
            <option value="all">Semua Jenjang</option>
            <option value="TK">Jenjang TK</option>
            <option value="SD">Jenjang SD</option>
            <option value="SMP">Jenjang SMP</option>
            <option value="SMA">Jenjang SMA</option>
            <option value="SPK-SD">Jenjang SPK (Primary)</option>
            <option value="SPK-SMP">Jenjang SPK (Lower Sec)</option>
            <option value="SPK-SMA">Jenjang SPK (Upper Sec)</option>
          </select>

          {/* Filter Status Stock */}
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)}>
            <option value="all">Semua Status Stock</option>
            <option value="safe">🟢 Stock Aman (&gt;20 pcs)</option>
            <option value="low">🟡 Stock Menipis (1-20 pcs)</option>
            <option value="empty">🔴 Stock Habis (0 pcs)</option>
          </select>

          {/* Urutan Sorting */}
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value as any)}>
            <option value="stock-asc">Urutkan: Stock Menipis Lebih Dulu</option>
            <option value="stock-desc">Urutkan: Stock Terbanyak</option>
            <option value="name">Urutkan: Nama Barang (A-Z)</option>
            <option value="level">Urutkan: Jenjang Sekolah</option>
            <option value="value-desc">Urutkan: Nilai Modal Tertinggi</option>
          </select>
        </div>

        <div style={{ fontSize: '0.85rem', color: '#586b84' }}>
          Menampilkan: <strong>{filteredAndSortedProducts.length}</strong> barang
        </div>
      </div>

      {/* TABEL CEK STOCK & QUICK ADJUSTMENT */}
      <div className="catalog-table-container">
        <table className="catalog-table">
          <thead>
            <tr>
              <th style={{ width: '40px' }}>No.</th>
              <th>Nama Barang</th>
              <th>Ukuran</th>
              <th>Jenjang</th>
              <th>Stock</th>
              <th>Lokasi Penyimpanan</th>
              <th style={{ textAlign: 'center' }}>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {filteredAndSortedProducts.length === 0 ? (
              <tr>
                <td colSpan={10} style={{ textAlign: 'center', padding: '36px', color: '#586b84' }}>
                  Tidak ada barang yang sesuai dengan filter atau pencarian Anda.
                </td>
              </tr>
            ) : (
              filteredAndSortedProducts.map((p, idx) => {
                const stock = p.stock || 0;
                const isOutOfStock = stock === 0;
                const isLowStock = stock > 0 && stock <= 20;

                return (
                  <tr key={p.id}>
                    <td style={{ color: '#586b84', fontWeight: 600 }}>{idx + 1}</td>
                    <td>
                      <strong>{p.name}</strong>
                    </td>
                    <td>{p.size || '-'}</td>
                    <td>
                      <span className={`badge-level ${p.level}`}>{p.level}</span>
                    </td>
                    <td>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '3px 8px',
                          borderRadius: '8px',
                          fontSize: '0.8rem',
                          fontWeight: 700,
                          background: isOutOfStock ? '#fff1f2' : isLowStock ? '#fef3c7' : '#e6f7f5',
                          color: isOutOfStock ? '#e11d48' : isLowStock ? '#d97706' : '#0d9488',
                          border: `1px solid ${isOutOfStock ? '#fecdd3' : isLowStock ? '#fde68a' : '#99f6e4'}`,
                        }}
                      >
                        {stock} pcs
                      </span>
                    </td>
                    <td>{p.storageLocation || '-'}</td>
                    <td style={{ textAlign: 'center', position: 'relative' }}>
                      <button
                        className="btn-dots"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveMenuId(activeMenuId === p.id ? null : p.id);
                        }}
                      >
                        ⋮
                      </button>
                      {activeMenuId === p.id && (
                        <div className="action-dropdown-menu" onClick={(e) => e.stopPropagation()}>
                          <button onClick={() => { setActiveMenuId(null); handleOpenSetStock(p); }}>Update Stock</button>
                          <button onClick={() => { setActiveMenuId(null); handleOpenDetail(p); }}>Detail</button>
                          <button className="text-danger" onClick={() => { setActiveMenuId(null); handleDeleteItem(p); }}>Hapus Barang</button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* MODAL SET STOCK LANGSUNG */}
      {editingStockItem && (
        <div className="modal-overlay" onClick={() => setEditingStockItem(null)}>
          <div className="modal" style={{ maxWidth: '440px' }} onClick={(e) => e.stopPropagation()}>
            <h3>Penyesuaian / Opname Stock</h3>
            <div style={{ fontSize: '0.88rem', color: '#586b84', marginBottom: '16px' }}>
              Barang: <strong>{editingStockItem.name}</strong> (<code>{editingStockItem.code}</code>)
            </div>

            <form className="modal-form" onSubmit={handleSaveSetStock}>
              <div className="form-group">
                <label>Jumlah Stock Fisik Terakhir (pcs)</label>
                <input
                  type="number"
                  min="0"
                  value={newStockValue}
                  onChange={(e) => setNewStockValue(Number(e.target.value))}
                  autoFocus
                  required
                />
              </div>

              <div className="form-group">
                <label>Keterangan / Catatan Opname</label>
                <input
                  type="text"
                  placeholder="Contoh: Penerimaan vendor baru, opname bulanan"
                  value={stockOpnameNotes}
                  onChange={(e) => setStockOpnameNotes(e.target.value)}
                />
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setEditingStockItem(null)}
                >
                  Batal
                </button>
                <button type="submit" className="btn-primary">
                  Simpan Stock
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL TAMBAH STOCK */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal" style={{ maxWidth: '500px' }} onClick={(e) => e.stopPropagation()}>
            <h3>Tambah Stock Fisik Baru</h3>
            <div style={{ fontSize: '0.85rem', color: '#586b84', marginBottom: '16px' }}>
              Pilih jenjang dan barang yang sudah ada pada data list Excel koperasi.
            </div>

            <form className="modal-form" onSubmit={handleAddSubmit}>
              {addFormError && <div className="modal-error">{addFormError}</div>}

              <div className="form-group">
                <label>Pilih Jenjang Sekolah</label>
                <select
                  value={addLevel}
                  onChange={(e) => {
                    setAddLevel(e.target.value as SchoolLevel | 'SEMUA');
                    setAddSelectedProductId('');
                  }}
                >
                  <option value="TK">TK</option>
                  <option value="SD">SD</option>
                  <option value="SMP">SMP</option>
                  <option value="SMA">SMA</option>
                  <option value="SPK-SD">SPK (Primary)</option>
                  <option value="SPK-SMP">SPK (Lower Sec)</option>
                  <option value="SPK-SMA">SPK (Upper Sec)</option>
                  <option value="SEMUA">Semua Jenjang</option>
                </select>
              </div>

              <div className="form-group">
                <label>Pilih Barang</label>
                <select
                  value={addSelectedProductId}
                  onChange={(e) => setAddSelectedProductId(e.target.value)}
                  required
                >
                  <option value="" disabled>-- Pilih Barang --</option>
                  {products
                    .filter(p => p.level === addLevel || addLevel === 'SEMUA' || p.level === 'SEMUA')
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name} {p.size ? `(${p.size})` : ''} - (Sisa Stock: {p.stock || 0})
                      </option>
                    ))}
                </select>
              </div>

              <div className="form-group">
                <label>Jumlah Stock Fisik Masuk (pcs)</label>
                <input
                  type="number"
                  min="1"
                  value={addAddedStock}
                  onChange={(e) => setAddAddedStock(Number(e.target.value))}
                  required
                />
              </div>

              <div className="modal-actions" style={{ marginTop: '24px' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowAddModal(false)}
                >
                  Batal
                </button>
                <button type="submit" className="btn-primary">
                  Simpan Input Stock
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DETAIL ITEM (EDITABLE) */}
      {detailItem && (
        <div className="modal-overlay" onClick={() => setDetailItem(null)}>
          <div className="modal" style={{ maxWidth: '500px' }} onClick={(e) => e.stopPropagation()}>
            <h3>Detail & Edit Barang</h3>

            <form className="modal-form" onSubmit={handleSaveDetail}>
              <div className="form-group">
                <label>Nama Barang</label>
                <input
                  type="text"
                  value={detailItem.name}
                  disabled
                  style={{ background: '#f1f5f9', color: '#64748b', cursor: 'not-allowed' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div className="form-group">
                  <label>Ukuran</label>
                  <input
                    type="text"
                    value={detailSize}
                    onChange={(e) => setDetailSize(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label>Lokasi Penyimpanan</label>
                  <input
                    type="text"
                    value={detailLocation}
                    onChange={(e) => setDetailLocation(e.target.value)}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div className="form-group">
                  <label>Harga Koperasi</label>
                  <input
                    type="number"
                    min="0"
                    step="500"
                    value={detailPriceKopkar}
                    onChange={(e) => setDetailPriceKopkar(Number(e.target.value))}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Fee Sekolah</label>
                  <input
                    type="number"
                    min="0"
                    step="500"
                    value={detailFeeSchool}
                    onChange={(e) => setDetailFeeSchool(Number(e.target.value))}
                    required
                  />
                </div>
              </div>
              
              <div className="form-group">
                <label>Harga Siswa (Otomatis)</label>
                <input
                  type="text"
                  value={formatRupiah(detailPriceKopkar + detailFeeSchool)}
                  disabled
                  style={{ background: '#f1f5f9', color: '#0f172a', fontWeight: 'bold', cursor: 'not-allowed' }}
                />
              </div>

              <div className="modal-actions" style={{ marginTop: '24px' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setDetailItem(null)}
                >
                  Tutup
                </button>
                <button type="submit" className="btn-primary">
                  Simpan Perubahan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default StockManagement;
