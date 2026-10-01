import re

filepath = "d:/SISTEM KOPERASI/src/pages/School/SchoolPayment.tsx"

with open(filepath, "r", encoding="utf-8") as f:
    code = f.read()

# Desktop table
old_desktop = """                      ) : order.status === 'received' ? (
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
                      )}"""

new_desktop = """                      ) : (
                        <button 
                          className="btn-ship" 
                          style={{ padding: '6px 12px', fontSize: '0.85rem' }}
                          onClick={() => handleUploadClick(order.id)}
                          disabled={uploadingId === order.id}
                        >
                          {uploadingId === order.id ? 'Mengupload...' : 'Upload Bukti'}
                        </button>
                      )}"""

code = code.replace(old_desktop, new_desktop)

# Mobile cards
old_mobile = """                      <span className="badge-pay-unpaid">
                        dY"' Menunggu Pelunasan
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
                      )}"""

new_mobile = """                      <span className="badge-pay-unpaid">
                        dY"' Menunggu Pelunasan
                      </span>
                      <button 
                        className="btn-ship" 
                        style={{ padding: '6px 12px', fontSize: '0.85rem' }}
                        onClick={() => handleUploadClick(order.id)}
                        disabled={uploadingId === order.id}
                      >
                        {uploadingId === order.id ? 'Mengupload...' : 'Upload Bukti'}
                      </button>"""

code = code.replace(old_mobile, new_mobile)

with open(filepath, "w", encoding="utf-8") as f:
    f.write(code)

print("SchoolPayment restriction removed")
