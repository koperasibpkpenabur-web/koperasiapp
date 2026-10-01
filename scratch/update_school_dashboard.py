import re

filepath = "d:/SISTEM KOPERASI/src/pages/School/SchoolDashboard.tsx"

with open(filepath, "r", encoding="utf-8") as f:
    code = f.read()

old_grid = """<div className="school-main-menu" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px', marginBottom: '32px' }}>"""

new_grid = """<div className="school-main-menu" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>"""

code = code.replace(old_grid, new_grid)

old_cards_padding = """padding: '24px'"""
new_cards_padding = """padding: '16px'"""
code = code.replace(old_cards_padding, new_cards_padding)

rekap_card = """
        <Link to="/school/rekap" className="school-stat-card" style={{ textDecoration: 'none', display: 'flex', flexDirection: 'column', gap: '8px', padding: '16px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px' }}>
          <div className="stat-icon" style={{ fontSize: '1.8rem' }}>📊</div>
          <div style={{ fontWeight: 700, fontSize: '1.1rem', color: '#1e293b' }}>Rekap Pesanan</div>
          <div style={{ fontSize: '0.85rem', color: '#64748b' }}>Download Excel/PDF rekapan pesanan.</div>
        </Link>
"""

# Insert rekap_card before the closing div of the grid
code = code.replace("</Link>\n      </div>", "</Link>" + rekap_card + "      </div>")

# make icon smaller
code = code.replace("fontSize: '2rem'", "fontSize: '1.8rem'")
# make text smaller
code = code.replace("fontSize: '1.2rem'", "fontSize: '1.1rem'")
code = code.replace("fontSize: '0.9rem'", "fontSize: '0.85rem'")

with open(filepath, "w", encoding="utf-8") as f:
    f.write(code)

print("SchoolDashboard updated")
