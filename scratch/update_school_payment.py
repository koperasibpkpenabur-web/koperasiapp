import re

filepath = "d:/SISTEM KOPERASI/src/pages/School/SchoolPayment.tsx"

with open(filepath, "r", encoding="utf-8") as f:
    code = f.read()

# 1. Imports
code = code.replace("import { useState, useEffect } from 'react';", "import { useState, useEffect, useRef } from 'react';")
code = code.replace("const { user } = useAuth();", "const { user } = useAuth();\n  const { uploadPaymentReceipt } = useOrders();")

# 2. Add GAS URL and states
new_states = """
  const GAS_URL = 'https://script.google.com/macros/s/AKfycbzhByEZzU-c5LWpJJK74Kcy0xcwQal-kmwHuIwAPnaCUJxYMbp9b_cWs5_-SNCsIJE/exec';
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);

  const handleUploadClick = (orderId: string) => {
    setUploadingId(orderId);
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !uploadingId) return;

    if (file.size > 5 * 1024 * 1024) {
      alert('Ukuran file maksimal 5MB.');
      setUploadingId(null);
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      const base64Str = reader.result?.toString().split(',')[1];
      if (!base64Str) {
        setUploadingId(null);
        return;
      }
      
      try {
        const params = new URLSearchParams();
        params.append('data', base64Str);
        params.append('mimeType', file.type);
        params.append('filename', `Bukti_Transfer_${uploadingId}_${file.name}`);

        const response = await fetch(GAS_URL, {
          method: 'POST',
          body: params,
        });
        
        const result = await response.json();
        if (result.status === 'success') {
          await uploadPaymentReceipt(uploadingId, result.url);
          fetchUnpaidOrders(); // Refresh table
          alert('Bukti transfer berhasil diupload!');
        } else {
          alert('Gagal upload: ' + result.message);
        }
      } catch (err) {
        console.error(err);
        alert('Terjadi kesalahan koneksi saat mengupload bukti transfer.');
      } finally {
        setUploadingId(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsDataURL(file);
  };
"""

code = code.replace("const [totalCount, setTotalCount] = useState(0);", "const [totalCount, setTotalCount] = useState(0);\n" + new_states)

# 3. Add hidden input to UI
hidden_input = """
      <div className="order-toolbar">
        <h3>Daftar Tagihan Belum Lunas</h3>
        <input 
          type="file" 
          ref={fileInputRef} 
          onChange={handleFileChange} 
          accept="image/*,application/pdf" 
          style={{ display: 'none' }} 
        />
      </div>
"""
code = code.replace("""
      <div className="order-toolbar">
        <h3>Daftar Tagihan Belum Lunas</h3>
      </div>
""", hidden_input)

# 4. Modify the action buttons in the Table
table_actions_old = """
                    <td>
                      {order.status === 'received' ? (
                        <button className="btn-ship" style={{ padding: '6px 12px', fontSize: '0.85rem' }}>
                          Upload Bukti
                        </button>
                      ) : (
                        <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Harus Diterima</span>
                      )}
                    </td>
"""

table_actions_new = """
                    <td>
                      {order.paid_notes && order.paid_notes.includes('[BUKTI_TRANSFER]') ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <span style={{ fontSize: '0.8rem', color: '#047857', fontWeight: 600 }}>✅ Sedang diverifikasi Koperasi</span>
                          <a href={order.paid_notes.replace('[BUKTI_TRANSFER] ', '')} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.8rem', color: '#3b82f6' }}>Lihat Bukti</a>
                        </div>
                      ) : order.status === 'received' ? (
                        <button 
                          className="btn-ship" 
                          style={{ padding: '6px 12px', fontSize: '0.85rem' }}
                          onClick={() => handleUploadClick(order.id)}
                          disabled={uploadingId === order.id}
                        >
                          {uploadingId === order.id ? 'Mengupload...' : 'Upload Bukti'}
                        </button>
                      ) : (
                        <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Harus Diterima</span>
                      )}
                    </td>
"""
code = code.replace(table_actions_old, table_actions_new)

# 5. Modify mobile view actions
mobile_actions_old = """
                <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="badge-pay-unpaid">
                    🔴 Menunggu Pelunasan
                  </span>
                  {order.status === 'received' && (
                    <button className="btn-ship" style={{ padding: '6px 12px', fontSize: '0.85rem' }}>
                      Upload Bukti
                    </button>
                  )}
                </div>
"""

mobile_actions_new = """
                <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  {order.paid_notes && order.paid_notes.includes('[BUKTI_TRANSFER]') ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span className="badge-pay-paid">⏳ Sedang Diverifikasi Koperasi</span>
                      <a href={order.paid_notes.replace('[BUKTI_TRANSFER] ', '')} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.8rem', color: '#3b82f6', textAlign: 'center' }}>Lihat Foto Bukti</a>
                    </div>
                  ) : (
                    <>
                      <span className="badge-pay-unpaid">
                        🔴 Menunggu Pelunasan
                      </span>
                      {order.status === 'received' && (
                        <button 
                          className="btn-ship" 
                          style={{ padding: '6px 12px', fontSize: '0.85rem' }}
                          onClick={() => handleUploadClick(order.id)}
                          disabled={uploadingId === order.id}
                        >
                          {uploadingId === order.id ? 'Mengupload...' : 'Upload Bukti'}
                        </button>
                      )}
                    </>
                  )}
                </div>
"""
code = code.replace(mobile_actions_old, mobile_actions_new)

with open(filepath, "w", encoding="utf-8") as f:
    f.write(code)

print("SchoolPayment updated")
