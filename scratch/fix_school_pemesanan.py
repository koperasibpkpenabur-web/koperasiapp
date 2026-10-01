import re

filepath = "d:/SISTEM KOPERASI/src/pages/School/SchoolPemesanan.tsx"
with open(filepath, "r", encoding="utf-8") as f:
    code = f.read()

# 1. Add activeTab state
code = code.replace(
"""  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');""",
"""  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'diproses' | 'dikirim' | 'riwayat'>('diproses');"""
)

# 2. Add Tabs UI and filtering logic
old_ui = """      {/* Daftar Pesanan */}
      <div className="order-history-section">
        <h3>Riwayat Pesanan Anda</h3>
        
        {loading ? (
          <p style={{ color: '#64748b' }}>Memuat pesanan...</p>
        ) : orders.length === 0 ? ("""

new_ui = """      {/* Tabs Kategori Pesanan */}
      <div className="order-tabs" style={{ display: 'flex', gap: '8px', marginBottom: '20px', overflowX: 'auto', paddingBottom: '8px' }}>
        <button 
          onClick={() => setActiveTab('diproses')}
          className={`tab-btn ${activeTab === 'diproses' ? 'active' : ''}`}
          style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #cbd5e1', background: activeTab === 'diproses' ? '#1e293b' : '#fff', color: activeTab === 'diproses' ? '#fff' : '#475569', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
        >
          Diproses Koperasi {orders.filter(o => o.status === 'pending' || o.status === 'approved').length > 0 && `(${orders.filter(o => o.status === 'pending' || o.status === 'approved').length})`}
        </button>
        <button 
          onClick={() => setActiveTab('dikirim')}
          className={`tab-btn ${activeTab === 'dikirim' ? 'active' : ''}`}
          style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #cbd5e1', background: activeTab === 'dikirim' ? '#1e293b' : '#fff', color: activeTab === 'dikirim' ? '#fff' : '#475569', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
        >
          Sedang Dikirim {orders.filter(o => o.status === 'shipped').length > 0 && `(${orders.filter(o => o.status === 'shipped').length})`}
        </button>
        <button 
          onClick={() => setActiveTab('riwayat')}
          className={`tab-btn ${activeTab === 'riwayat' ? 'active' : ''}`}
          style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #cbd5e1', background: activeTab === 'riwayat' ? '#1e293b' : '#fff', color: activeTab === 'riwayat' ? '#fff' : '#475569', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
        >
          Selesai & Riwayat
        </button>
      </div>

      {/* Daftar Pesanan */}
      <div className="order-history-section">
        
        {loading ? (
          <p style={{ color: '#64748b' }}>Memuat pesanan...</p>
        ) : orders.filter(o => {
          if (activeTab === 'diproses') return o.status === 'pending' || o.status === 'approved';
          if (activeTab === 'dikirim') return o.status === 'shipped';
          return o.status === 'received' || o.status === 'cancelled' || o.status === 'cancellation_requested' || o.status === 'rejected';
        }).length === 0 ? ("""
        
code = code.replace(old_ui, new_ui)

# 3. Modify mapping to use filtered orders
old_map = """        ) : (
          <div className="order-grid">
            {orders.map((order) => ("""
            
new_map = """        ) : (
          <div className="order-grid">
            {orders.filter(o => {
              if (activeTab === 'diproses') return o.status === 'pending' || o.status === 'approved';
              if (activeTab === 'dikirim') return o.status === 'shipped';
              return o.status === 'received' || o.status === 'cancelled' || o.status === 'cancellation_requested' || o.status === 'rejected';
            }).map((order) => ("""

code = code.replace(old_map, new_map)

# 4. Fix state updates in SchoolPemesanan as well!
# handleCancelRequestClick -> requestCancelOrder
# handleConfirmCancel
code = code.replace(
"""  const handleConfirmCancel = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancellingOrder) return;
    if (!cancelReason.trim()) {
      setCancelError('Alasan batal wajib diisi');
      return;
    }
    const schoolUserName = user?.name || 'Sekolah';
    requestCancelOrder(cancellingOrder.id, cancelReason, schoolUserName);
    setCancellingOrder(null);
    setCancelReason('');
  };""",
"""  const handleConfirmCancel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancellingOrder) return;
    if (!cancelReason.trim()) {
      setCancelError('Alasan batal wajib diisi');
      return;
    }
    const schoolUserName = user?.name || 'Sekolah';
    await requestCancelOrder(cancellingOrder.id, cancelReason, schoolUserName);
    setOrders(prev => prev.map(o => o.id === cancellingOrder.id ? { ...o, status: 'cancellation_requested' } : o));
    setCancellingOrder(null);
    setCancelReason('');
  };"""
)

# handleConfirmReceive -> receiveOrder
code = code.replace(
"""  const handleConfirmReceive = (e: React.FormEvent) => {
    e.preventDefault();
    if (!receivingOrder) return;
    
    receiveOrder(receivingOrder.id, {
      receivedBy: receiverName,
      isChecked: isChecked,
      notes: receiveNotes
    });
    setReceivingOrder(null);
  };""",
"""  const handleConfirmReceive = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!receivingOrder) return;
    
    await receiveOrder(receivingOrder.id, {
      receivedBy: receiverName,
      isChecked: isChecked,
      notes: receiveNotes
    });
    setOrders(prev => prev.map(o => o.id === receivingOrder.id ? { ...o, status: 'received' } : o));
    setReceivingOrder(null);
  };"""
)


with open(filepath, "w", encoding="utf-8") as f:
    f.write(code)

print("SchoolPemesanan fixed")
