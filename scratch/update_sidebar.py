import re

filepath = "d:/SISTEM KOPERASI/src/components/layout/Sidebar.tsx"
with open(filepath, "r", encoding="utf-8") as f:
    code = f.read()

# Replace everything from {/* School menu items */} to </nav>
regex = r"\{\/\* School menu items \*\/\}.*?</ul>"

replacement = """{/* School menu items */}
          {user.role === 'sekolah' && (
            <>
              <li>
                <NavLink
                  to="/school"
                  end
                  className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
                  onClick={closeMobileNav}
                >
                  <span className="nav-icon">🏠</span>
                  <span className="nav-text">Menu Utama</span>
                </NavLink>
              </li>
              <li>
                <NavLink
                  to="/school/pemesanan"
                  className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
                  onClick={closeMobileNav}
                >
                  <span className="nav-icon">🛒</span>
                  <span className="nav-text">Pemesanan Barang</span>
                </NavLink>
              </li>
              <li>
                <NavLink
                  to="/school/retur"
                  className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
                  onClick={closeMobileNav}
                >
                  <span className="nav-icon">↩️</span>
                  <span className="nav-text">Retur Barang</span>
                </NavLink>
              </li>
              <li>
                <NavLink
                  to="/school/rekap"
                  className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
                  onClick={closeMobileNav}
                >
                  <span className="nav-icon">📊</span>
                  <span className="nav-text">Rekap Pesanan</span>
                </NavLink>
              </li>
              <li>
                <NavLink
                  to="/school/pelunasan"
                  className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
                  onClick={closeMobileNav}
                >
                  <span className="nav-icon">💳</span>
                  <span className="nav-text">Pelunasan Tagihan</span>
                </NavLink>
              </li>
            </>
          )}
        </ul>"""

code = re.sub(regex, replacement, code, flags=re.DOTALL)

with open(filepath, "w", encoding="utf-8") as f:
    f.write(code)

print("Sidebar updated")
