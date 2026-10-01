import re
file = "d:/SISTEM KOPERASI/src/components/layout/Sidebar.tsx"
with open(file, 'r', encoding='utf-8') as f:
    code = f.read()

bad_rekap = """<NavLink
                  to="/school/rekap" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <div className="nav-icon">📊</div>
          Rekap Pesanan
        </NavLink>"""

good_rekap = """</li>
              <li>
                <NavLink
                  to="/school/rekap"
                  className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
                  onClick={closeMobileNav}
                >
                  <span className="nav-icon">📊</span>
                  <span className="nav-text">Rekap Pesanan</span>
                </NavLink>"""

code = code.replace(bad_rekap, good_rekap)

with open(file, 'w', encoding='utf-8') as f:
    f.write(code)
