import { useState, useRef, type ChangeEvent, type FormEvent } from 'react';
import { useProducts } from '../../context/ProductContext';
import type { ProductItem, SchoolLevel, OrderItemType } from '../../types';
import './catalog.css';

const ProductCatalog = () => {
  const {
    products,
    addProduct,
    updateProduct,
    deleteProduct,
    importProductsFromExcel,
    downloadTemplateCsv,
    exportProductsCsv,
  } = useProducts();

  const [importStatus, setImportStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [levelFilter, setLevelFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Modal manual Add / Edit
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formCode, setFormCode] = useState('');
  const [formName, setFormName] = useState('');
  const [formCategory, setFormCategory] = useState<OrderItemType>('seragam');
  const [formLevel, setFormLevel] = useState<SchoolLevel>('SMP');
  const [formPriceKopkar, setFormPriceKopkar] = useState<number>(100000);
  const [formFeeSchool, setFormFeeSchool] = useState<number>(20000);
  const [formStock, setFormStock] = useState<number>(50);
  const [formError, setFormError] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Filtered Products
  const filteredProducts = products.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.code.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesLevel = levelFilter === 'all' || p.level === levelFilter;
    const matchesCategory = categoryFilter === 'all' || p.category === categoryFilter;
    return matchesSearch && matchesLevel && matchesCategory;
  });

  // Reset page when filter changes
  // Pagination Math
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const paginatedProducts = filteredProducts.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(filteredProducts.length / itemsPerPage);

  const handlePageChange = (pageNumber: number) => {
    setCurrentPage(pageNumber);
  };

  const handleFilterChange = () => {
      setCurrentPage(1);
  }

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
          message: `Berhasil memperbarui dan mengakumulasi data barang dari file "${file.name}"! Kode barang yang kosong telah di-generate otomatis.`,
        });
      } else {
        setImportStatus({
          type: 'error',
          message: res.error || 'Gagal memproses data file Excel',
        });
      }
    };

    reader.readAsArrayBuffer(file);
  };

  const handleOpenAdd = () => {
    setEditingId(null);
    setFormCode(`SRG-SMP-${Math.floor(10 + Math.random() * 89)}`);
    setFormName('');
    setFormCategory('seragam');
    setFormLevel('SMP');
    setFormPriceKopkar(100000);
    setFormFeeSchool(20000);
    setFormStock(50);
    setFormError('');
    setShowModal(true);
  };

  const handleOpenEdit = (p: ProductItem) => {
    setEditingId(p.id);
    setFormCode(p.code);
    setFormName(p.name);
    setFormCategory(p.category);
    setFormLevel(p.level);
    setFormPriceKopkar(p.priceKopkar);
    setFormFeeSchool(p.feeSchool);
    setFormStock(p.stock !== undefined ? p.stock : 50);
    setFormError('');
    setShowModal(true);
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!formName.trim()) {
      setFormError('Nama barang wajib diisi');
      return;
    }

    if (formPriceKopkar <= 0) {
      setFormError('Harga Koperasi harus lebih besar dari 0');
      return;
    }

    const priceStudent = formPriceKopkar + formFeeSchool;

    if (editingId) {
      updateProduct(editingId, {
        code: formCode.trim(),
        name: formName.trim(),
        category: formCategory,
        level: formLevel,
        priceKopkar: formPriceKopkar,
        feeSchool: formFeeSchool,
        priceStudent,
        stock: formStock,
      });
    } else {
      addProduct({
        code: formCode.trim(),
        name: formName.trim(),
        category: formCategory,
        level: formLevel,
        priceKopkar: formPriceKopkar,
        feeSchool: formFeeSchool,
        priceStudent,
        stock: formStock,
      });
    }

    setShowModal(false);
  };

  const handleDelete = (id: string, name: string) => {
    if (window.confirm(`Hapus barang "${name}" dari katalog?`)) {
      deleteProduct(id);
    }
  };

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
          <h2>Katalog & Harga</h2>
          <div className="catalog-subtitle">
            Kelola data master barang, jenjang sekolah (TK, SD, SMP, SMA), dan 3 struktur harga (Harga Koperasi, Fee Sekolah, Harga Siswa).
          </div>
        </div>

        <div className="catalog-header-actions" style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button className="btn-template" onClick={downloadTemplateCsv} title="Unduh Format 8 Kolom">
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

          <button className="btn-export" onClick={exportProductsCsv} title="Export data ke Excel">
            📤 Export Excel
          </button>
          <button className="btn-primary" onClick={handleOpenAdd}>
            + Tambah Barang Manual
          </button>
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

      {/* Toolbar Filters */}
      <div className="catalog-toolbar">
        <div className="catalog-filters">
          <input
            type="text"
            placeholder="Cari kode atau nama barang..."
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); handleFilterChange(); }}
          />

          <select value={levelFilter} onChange={(e) => { setLevelFilter(e.target.value); handleFilterChange(); }}>
            <option value="all">Semua Jenjang</option>
            <option value="TK">Jenjang TK</option>
            <option value="SD">Jenjang SD</option>
            <option value="SMP">Jenjang SMP</option>
            <option value="SMA">Jenjang SMA</option>
          </select>

          <select value={categoryFilter} onChange={(e) => { setCategoryFilter(e.target.value); handleFilterChange(); }}>
            <option value="all">Semua Kategori</option>
            <option value="seragam">Seragam</option>
            <option value="buku">Buku</option>
          </select>
        </div>

        <div style={{ fontSize: '0.85rem', color: '#586b84' }}>
          Total: <strong>{filteredProducts.length}</strong> barang terdaftar
        </div>
      </div>

      {/* Table Master Barang (Sesuai Ketentuan + Stock & Aksi) */}
      <div className="catalog-table-container">
        <table className="catalog-table">
          <thead>
            <tr>
              <th style={{ width: '40px' }}>No.</th>
              <th>Nama Barang</th>
              <th>Ukuran</th>
              <th>Jenjang</th>
              <th>Harga Koperasi</th>
              <th>Fee Sekolah</th>
              <th>Harga Siswa</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {paginatedProducts.map((p, idx) => (
              <tr key={p.id}>
                <td style={{ color: '#586b84', fontWeight: 600 }}>{indexOfFirstItem + idx + 1}</td>
                <td>
                  <strong>{p.name}</strong>
                </td>
                <td>{p.size || '-'}</td>
                <td>
                  <span className={`badge-level ${p.level}`}>{p.level}</span>
                </td>
                <td style={{ color: '#586b84' }}>{formatRupiah(p.priceKopkar)}</td>
                <td style={{ color: '#0d9488' }}>{formatRupiah(p.feeSchool)}</td>
                <td className="price-student">{formatRupiah(p.priceStudent)}</td>
                <td>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      className="btn-secondary"
                      style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                      onClick={() => handleOpenEdit(p)}
                    >
                      Edit
                    </button>
                    <button
                      className="btn-danger"
                      style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                      onClick={() => handleDelete(p.id, p.name)}
                    >
                      Hapus
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      {/* Pagination Controls */}
      <div className="pagination" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '20px' }}>
        <div className="pagination-info">
          Tampilkan
          <select 
            value={itemsPerPage} 
            onChange={(e) => { setItemsPerPage(Number(e.target.value)); setCurrentPage(1); }}
            style={{ margin: '0 10px', padding: '5px' }}
          >
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={30}>30</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
          data per halaman
        </div>
        <div className="pagination-buttons" style={{ display: 'flex', gap: '5px' }}>
          <button 
            disabled={currentPage === 1} 
            onClick={() => handlePageChange(currentPage - 1)}
            style={{ padding: '5px 10px', cursor: currentPage === 1 ? 'not-allowed' : 'pointer' }}
          >
            Sebelumnya
          </button>
          
          <span style={{ padding: '5px 10px' }}>
            Halaman {currentPage} dari {totalPages || 1}
          </span>
          
          <button 
            disabled={currentPage === totalPages || totalPages === 0} 
            onClick={() => handlePageChange(currentPage + 1)}
            style={{ padding: '5px 10px', cursor: currentPage === totalPages || totalPages === 0 ? 'not-allowed' : 'pointer' }}
          >
            Selanjutnya
          </button>
        </div>
      </div>

      {/* Modal Add / Edit Product */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" style={{ maxWidth: '520px' }} onClick={(e) => e.stopPropagation()}>
            <h3>{editingId ? 'Edit Barang & Struktur Harga' : 'Tambah Barang Baru'}</h3>

            <form className="modal-form" onSubmit={handleSubmit}>
              {formError && <div className="modal-error">{formError}</div>}

              <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: '10px' }}>
                <div className="form-group">
                  <label>Kode Barang</label>
                  <input
                    type="text"
                    value={formCode}
                    onChange={(e) => setFormCode(e.target.value)}
                    placeholder="SRG-SMP-01"
                    required
                  />
                  <small style={{ fontSize: '0.7rem', color: '#586b84' }}>Otomatis / manual</small>
                </div>
                <div className="form-group">
                  <label>Nama Barang *</label>
                  <input
                    type="text"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="Contoh: Seragam Putih Biru SMP"
                    required
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div className="form-group">
                  <label>Kategori</label>
                  <select
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value as OrderItemType)}
                  >
                    <option value="seragam">Seragam</option>
                    <option value="buku">Buku</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Jenjang Sekolah</label>
                  <select
                    value={formLevel}
                    onChange={(e) => setFormLevel(e.target.value as SchoolLevel)}
                  >
                    <option value="TK">TK</option>
                    <option value="SD">SD</option>
                    <option value="SMP">SMP</option>
                    <option value="SMA">SMA</option>
                    <option value="SEMUA">Semua Jenjang</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                <div className="form-group">
                  <label>Harga Koperasi (HPP)</label>
                  <input
                    type="number"
                    min="0"
                    step="1000"
                    value={formPriceKopkar}
                    onChange={(e) => setFormPriceKopkar(Number(e.target.value))}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Fee Sekolah</label>
                  <input
                    type="number"
                    min="0"
                    step="1000"
                    value={formFeeSchool}
                    onChange={(e) => setFormFeeSchool(Number(e.target.value))}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Stock Fisik (pcs)</label>
                  <input
                    type="number"
                    min="0"
                    value={formStock}
                    onChange={(e) => setFormStock(Number(e.target.value))}
                    required
                  />
                </div>
              </div>

              {/* Preview Kalkulasi Harga Siswa */}
              <div
                style={{
                  background: '#F0F3FA',
                  padding: '12px 14px',
                  borderRadius: '10px',
                  border: '1px solid #d5deef',
                  fontSize: '0.85rem',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ color: '#586b84' }}>Harga Koperasi:</span>
                  <strong>{formatRupiah(formPriceKopkar)}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ color: '#0d9488' }}>+ Fee Sekolah:</span>
                  <strong style={{ color: '#0d9488' }}>+{formatRupiah(formFeeSchool)}</strong>
                </div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    borderTop: '1px solid #d5deef',
                    paddingTop: '6px',
                    fontWeight: 700,
                  }}
                >
                  <span style={{ color: '#395886' }}>Harga Siswa (Jual Akhir):</span>
                  <span style={{ color: '#395886', fontSize: '1.05rem' }}>
                    {formatRupiah(formPriceKopkar + formFeeSchool)}
                  </span>
                </div>
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowModal(false)}
                >
                  Batal
                </button>
                <button type="submit" className="btn-primary">
                  {editingId ? 'Simpan Perubahan' : 'Tambahkan ke Katalog'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProductCatalog;
