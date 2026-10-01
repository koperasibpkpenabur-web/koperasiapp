import { useState } from 'react';
import ProductCatalog from './ProductCatalog';
import StockManagement from './StockManagement';
import './kopkar.css';

const ItemManagement = () => {
  const [activeTab, setActiveTab] = useState<'catalog' | 'stock'>('catalog');

  return (
    <div className="kopkar-dashboard">
      <div className="kopkar-header" style={{ marginBottom: '24px' }}>
        <h2 className="kopkar-title">📦 Manajemen Barang</h2>
        <p className="kopkar-subtitle">Kelola harga barang (HPP/Fee), master barang, dan ketersediaan stok fisik gudang koperasi.</p>
      </div>

      {/* Tabs */}
      <div className="kopkar-tabs" style={{ marginBottom: '24px', display: 'flex', gap: '16px', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px' }}>
        <button 
          className={`btn-tab ${activeTab === 'catalog' ? 'active' : ''}`} 
          onClick={() => setActiveTab('catalog')} 
          style={{ fontWeight: activeTab === 'catalog' ? 'bold' : 'normal', background: 'none', border: 'none', cursor: 'pointer', color: activeTab === 'catalog' ? '#0284c7' : '#64748b' }}
        >
          🏷️ Katalog & Harga
        </button>
        <button 
          className={`btn-tab ${activeTab === 'stock' ? 'active' : ''}`} 
          onClick={() => setActiveTab('stock')} 
          style={{ fontWeight: activeTab === 'stock' ? 'bold' : 'normal', background: 'none', border: 'none', cursor: 'pointer', color: activeTab === 'stock' ? '#0284c7' : '#64748b' }}
        >
          📦 Stok Barang
        </button>
      </div>

      <div style={{ marginTop: '-24px' }}>
        {activeTab === 'catalog' && <ProductCatalog />}
        {activeTab === 'stock' && <StockManagement />}
      </div>
    </div>
  );
};

export default ItemManagement;
