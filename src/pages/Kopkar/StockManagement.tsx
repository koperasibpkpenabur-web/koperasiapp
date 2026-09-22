import { useState, useRef, type DragEvent, type ChangeEvent, type FormEvent } from 'react';
import { useProducts } from '../../context/ProductContext';
import type { ProductItem, SchoolLevel } from '../../types';
import './catalog.css';

const StockManagement = () => {
  const {
    products,
    adjustStock,
    setProductStock,
    addProduct,
    importProductsFromCsv,
    downloadTemplateCsv,
    exportProductsCsv,
  } = useProducts();

  // Search, Filters & Sorting
  const [searchQuery, setSearchQuery] = useState('');
  const [levelFilter, setLevelFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'safe' | 'low' | 'empty'>('all');
  const [sortBy, setSortBy] = useState<'name' | 'stock-desc' | 'stock-asc' | 'level' | 'value-desc'>('stock-asc');

  // Drag & Drop
  const [isDragActive, setIsDragActive] = useState(false);
  const [importStatus, setImportStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Modal Set Stock Manual
  const [editingStockItem, setEditingStockItem] = useState<ProductItem | null>(null);
  const [newStockValue, setNewStockValue] = useState<number>(0);
  const [stockOpnameNotes, setStockOpnameNotes] = useState('');

  // Modal Tambah Barang Baru Langsung dari Stock
  const [showAddModal, setShowAddModal] = useState(false);
  const [addCode, setAddCode] = useState('');
  const [addName, setAddName] = useState('');
  const [addCategory, setAddCategory] = useState<'seragam' | 'buku'>('seragam');
  const [addLevel, setAddLevel] = useState<SchoolLevel>('SMP');
  const [addPriceKopkar, setAddPriceKopkar] = useState<number>(90000);
  const [addFeeSchool, setAddFeeSchool] = useState<number>(15000);
  const [addInitialStock, setAddInitialStock] = useState<number>(50);
  const [addFormError, setAddFormError] = useState('');

  // Drag & Drop Handlers
  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragActive(true);
  };

  const handleDragLeave = () => {
    setIsDragActive(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragActive(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      processFile(files[0]);
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFile(e.target.files[0]);
    }
  };

  const processFile = (file: File) => {
    setImportStatus(null);
    const reader = new FileReader();

    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (!content) {
        setImportStatus({ type: 'error', message: 'File kosong atau tidak dapat dibaca' });
        return;
      }

      const res = importProductsFromCsv(content);
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

    reader.readAsText(file);
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

  // Add Item Submit
  const handleAddSubmit = (e: FormEvent) => {
    e.preventDefault();
    setAddFormError('');

    if (!addName.trim()) {
      setAddFormError('Nama barang wajib diisi');
      return;
    }

    if (addPriceKopkar <= 0) {
      setAddFormError('Harga Koperasi harus lebih besar dari 0');
      return;
    }

    addProduct({
      code: addCode.trim() || `SRG-${addLevel}-${Math.floor(10 + Math.random() * 89)}`,
      name: addName.trim(),
      category: addCategory,
      level: addLevel,
      priceKopkar: addPriceKopkar,
      feeSchool: addFeeSchool,
      priceStudent: addPriceKopkar + addFeeSchool,
      stock: addInitialStock,
    });

    setShowAddModal(false);
  };

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

        <div className="catalog-header-actions">
          <button className="btn-template" onClick={downloadTemplateCsv} title="Unduh Template Format 8 Kolom">
            📥 Unduh Template Excel
          </button>
          <button className="btn-export" onClick={exportProductsCsv} title="Export data stock ke Excel/CSV">
            📤 Export Stock Excel
          </button>
          <button
            className="btn-primary"
            onClick={() => {
              setAddCode(`SRG-SMP-${Math.floor(10 + Math.random() * 89)}`);
              setAddName('');
              setAddCategory('seragam');
              setAddLevel('SMP');
              setAddPriceKopkar(95000);
              setAddFeeSchool(15000);
              setAddInitialStock(50);
              setAddFormError('');
              setShowAddModal(true);
            }}
          >
            + Tambah Barang & Stock
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
          style={{
            background: '#ffffff',
            border: '1px solid #fde68a',
            borderRadius: '14px',
            padding: '16px 18px',
            boxShadow: '0 2px 6px rgba(57, 88, 134, 0.05)',
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
          style={{
            background: '#ffffff',
            border: '1px solid #fecdd3',
            borderRadius: '14px',
            padding: '16px 18px',
            boxShadow: '0 2px 6px rgba(57, 88, 134, 0.05)',
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

      {/* DROP FILE EXCEL UNTUK UPDATE STOCK & BARANG */}
      <div
        className={`excel-dropzone ${isDragActive ? 'drag-active' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <div className="dropzone-icon">📥</div>
        <div className="dropzone-title">
          Drop File Excel / CSV di Sini untuk Tambah & Akumulasi Stock Barang
        </div>
        <div className="dropzone-desc">
          Format 8 Kolom: <strong>1. No | 2. Kode Barang | 3. Nama Barang | 4. Kategori | 5. Jenjang | 6. Harga Koperasi | 7. Fee Sekolah | 8. Harga Siswa</strong>.
          <br />
          <span style={{ fontSize: '0.8rem', color: '#395886', fontWeight: 600 }}>
            ⚡ Akumulasi Terpadu: File yang di-drop di "Stock Barang" maupun di "Katalog & Harga" otomatis terakumulasi dan tersimpan di database master yang sama!
          </span>
        </div>
        <button type="button" className="btn-browse">
          Pilih File Excel / CSV
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.txt"
          className="dropzone-input"
          onChange={handleFileChange}
        />
      </div>

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
              <th>Kode Barang</th>
              <th>Nama Barang</th>
              <th>Jenjang</th>
              <th>Kategori</th>
              <th>Modal Koperasi</th>
              <th>Status Stock</th>
              <th>Stock Fisik</th>
              <th style={{ textAlign: 'center' }}>Quick Stock Adjust</th>
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
                    <td><code>{p.code}</code></td>
                    <td>
                      <strong>{p.name}</strong>
                    </td>
                    <td>
                      <span className={`badge-level ${p.level}`}>{p.level}</span>
                    </td>
                    <td>
                      <span className={`item-type ${p.category}`}>{p.category}</span>
                    </td>
                    <td className="price-kopkar">{formatRupiah(p.priceKopkar)}</td>
                    <td>
                      {isOutOfStock ? (
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '3px 8px',
                            borderRadius: '8px',
                            fontSize: '0.74rem',
                            fontWeight: 700,
                            background: '#fff1f2',
                            color: '#e11d48',
                            border: '1px solid #fecdd3',
                          }}
                        >
                          🔴 HABIS
                        </span>
                      ) : isLowStock ? (
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '3px 8px',
                            borderRadius: '8px',
                            fontSize: '0.74rem',
                            fontWeight: 700,
                            background: '#fef3c7',
                            color: '#d97706',
                            border: '1px solid #fde68a',
                          }}
                        >
                          ⚠️ MENIPIS
                        </span>
                      ) : (
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '3px 8px',
                            borderRadius: '8px',
                            fontSize: '0.74rem',
                            fontWeight: 700,
                            background: '#e6f7f5',
                            color: '#0d9488',
                            border: '1px solid #99f6e4',
                          }}
                        >
                          🟢 AMAN
                        </span>
                      )}
                    </td>
                    <td>
                      <div style={{ fontSize: '1rem', fontWeight: 700, color: isOutOfStock ? '#e11d48' : '#1e2d42' }}>
                        {stock} <span style={{ fontSize: '0.75rem', fontWeight: 500, color: '#586b84' }}>pcs</span>
                      </div>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <button
                          type="button"
                          onClick={() => adjustStock(p.id, -10)}
                          disabled={stock < 10}
                          title="Kurangi 10 pcs"
                          style={{
                            padding: '3px 6px',
                            fontSize: '0.72rem',
                            background: '#F0F3FA',
                            border: '1px solid #d5deef',
                            borderRadius: '6px',
                            cursor: stock < 10 ? 'not-allowed' : 'pointer',
                            color: '#395886',
                            fontWeight: 600,
                          }}
                        >
                          -10
                        </button>
                        <button
                          type="button"
                          onClick={() => adjustStock(p.id, -1)}
                          disabled={stock <= 0}
                          title="Kurangi 1 pcs"
                          style={{
                            padding: '3px 8px',
                            fontSize: '0.75rem',
                            background: '#F0F3FA',
                            border: '1px solid #d5deef',
                            borderRadius: '6px',
                            cursor: stock <= 0 ? 'not-allowed' : 'pointer',
                            color: '#395886',
                            fontWeight: 700,
                          }}
                        >
                          -1
                        </button>
                        <button
                          type="button"
                          onClick={() => adjustStock(p.id, 1)}
                          title="Tambah 1 pcs"
                          style={{
                            padding: '3px 8px',
                            fontSize: '0.75rem',
                            background: '#e6f7f5',
                            border: '1px solid #99f6e4',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            color: '#0d9488',
                            fontWeight: 700,
                          }}
                        >
                          +1
                        </button>
                        <button
                          type="button"
                          onClick={() => adjustStock(p.id, 10)}
                          title="Tambah 10 pcs"
                          style={{
                            padding: '3px 6px',
                            fontSize: '0.72rem',
                            background: '#e6f7f5',
                            border: '1px solid #99f6e4',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            color: '#0d9488',
                            fontWeight: 600,
                          }}
                        >
                          +10
                        </button>
                      </div>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <button
                        className="btn-primary"
                        style={{ padding: '4px 12px', fontSize: '0.76rem' }}
                        onClick={() => handleOpenSetStock(p)}
                      >
                        Set Stock
                      </button>
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

      {/* MODAL TAMBAH BARANG BARU */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal" style={{ maxWidth: '650px' }} onClick={(e) => e.stopPropagation()}>
            <h3>Tambah Barang & Stock Fisik Baru</h3>

            <form className="modal-form" onSubmit={handleAddSubmit}>
              {addFormError && <div className="modal-error">{addFormError}</div>}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '14px' }}>
                <div className="form-group">
                  <label>Kode Barang</label>
                  <input
                    type="text"
                    value={addCode}
                    onChange={(e) => setAddCode(e.target.value)}
                    required
                  />
                  <small style={{ fontSize: '0.7rem', color: '#586b84' }}>Bisa auto / manual</small>
                </div>
                <div className="form-group">
                  <label>Nama Barang *</label>
                  <input
                    type="text"
                    value={addName}
                    onChange={(e) => setAddName(e.target.value)}
                    placeholder="Contoh: Seragam Batik SD"
                    required
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div className="form-group">
                  <label>Kategori</label>
                  <select
                    value={addCategory}
                    onChange={(e) => setAddCategory(e.target.value as any)}
                  >
                    <option value="seragam">Seragam</option>
                    <option value="buku">Buku</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Jenjang Sekolah</label>
                  <select
                    value={addLevel}
                    onChange={(e) => setAddLevel(e.target.value as any)}
                  >
                    <option value="TK">TK</option>
                    <option value="SD">SD</option>
                    <option value="SMP">SMP</option>
                    <option value="SMA">SMA</option>
                    <option value="SEMUA">Semua Jenjang</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px' }}>
                <div className="form-group">
                  <label>Harga Koperasi</label>
                  <input
                    type="number"
                    min="0"
                    step="1000"
                    value={addPriceKopkar}
                    onChange={(e) => setAddPriceKopkar(Number(e.target.value))}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Fee Sekolah</label>
                  <input
                    type="number"
                    min="0"
                    step="1000"
                    value={addFeeSchool}
                    onChange={(e) => setAddFeeSchool(Number(e.target.value))}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Stock Awal (pcs)</label>
                  <input
                    type="number"
                    min="0"
                    value={addInitialStock}
                    onChange={(e) => setAddInitialStock(Number(e.target.value))}
                    required
                  />
                </div>
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
                  Simpan Barang & Stock
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
