import re

filepath = "d:/SISTEM KOPERASI/src/pages/School/SchoolDashboard.tsx"
with open(filepath, "r", encoding="utf-8") as f:
    code = f.read()

# Replace the cards section
regex = r"<div className=\"school-main-menu\".*?</div>\s*<h3"

replacement = """<div className="school-main-menu" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        <Link to="/school/pemesanan" className="school-stat-card" style={{ textDecoration: 'none', display: 'flex', flexDirection: 'column', gap: '8px', padding: '16px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px' }}>
          <div className="stat-icon" style={{ fontSize: '1.8rem' }}>🛒</div>
          <div style={{ fontWeight: 700, fontSize: '1.1rem', color: '#1e293b' }}>Pemesanan Barang</div>
          <div style={{ fontSize: '0.85rem', color: '#64748b' }}>Buat pesanan seragam dan buku baru ke Kopkar.</div>
        </Link>
        
        <Link to="/school/retur" className="school-stat-card" style={{ textDecoration: 'none', display: 'flex', flexDirection: 'column', gap: '8px', padding: '16px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', position: 'relative' }}>
          <div className="stat-icon" style={{ fontSize: '1.8rem' }}>↩️</div>
          <div style={{ fontWeight: 700, fontSize: '1.1rem', color: '#1e293b' }}>Retur Barang</div>
          <div style={{ fontSize: '0.85rem', color: '#64748b' }}>Ajukan pengembalian barang cacat atau salah ukuran.</div>
          
          {activeReturnsCount > 0 && (
            <span style={{ position: 'absolute', top: '16px', right: '16px', background: '#ef4444', color: '#fff', fontSize: '0.8rem', fontWeight: 700, padding: '2px 8px', borderRadius: '99px' }}>
              {activeReturnsCount} Aktif
            </span>
          )}
        </Link>

        <Link to="/school/rekap" className="school-stat-card" style={{ textDecoration: 'none', display: 'flex', flexDirection: 'column', gap: '8px', padding: '16px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px' }}>
          <div className="stat-icon" style={{ fontSize: '1.8rem' }}>📊</div>
          <div style={{ fontWeight: 700, fontSize: '1.1rem', color: '#1e293b' }}>Rekap Pesanan</div>
          <div style={{ fontSize: '0.85rem', color: '#64748b' }}>Download Excel/PDF rekapan pesanan.</div>
        </Link>

        <Link to="/school/pelunasan" className="school-stat-card" style={{ textDecoration: 'none', display: 'flex', flexDirection: 'column', gap: '8px', padding: '16px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px' }}>
          <div className="stat-icon" style={{ fontSize: '1.8rem' }}>💳</div>
          <div style={{ fontWeight: 700, fontSize: '1.1rem', color: '#1e293b' }}>Pelunasan Tagihan</div>
          <div style={{ fontSize: '0.85rem', color: '#64748b' }}>Cek tagihan pesanan dan laporkan pembayaran siswa.</div>
        </Link>
      </div>

      <h3"""

code = re.sub(regex, replacement, code, flags=re.DOTALL)

with open(filepath, "w", encoding="utf-8") as f:
    f.write(code)

print("SchoolDashboard reordered")
