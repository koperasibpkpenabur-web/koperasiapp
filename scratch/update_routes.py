import re

file_path = "d:/SISTEM KOPERASI/src/routes/AppRoutes.tsx"
with open(file_path, "r", encoding="utf-8") as f:
    code = f.read()

# Add import
if "import SchoolRekap from '../pages/School/SchoolRekap';" not in code:
    code = code.replace("import SchoolReturn from '../pages/School/SchoolReturn';", "import SchoolReturn from '../pages/School/SchoolReturn';\nimport SchoolRekap from '../pages/School/SchoolRekap';")

# Add route
route_string = """
        <Route path="school/rekap" element={
          <ProtectedRoute allowedRoles={['admin', 'sekolah']}>
            <SchoolRekap />
          </ProtectedRoute>
        } />
"""
if "path=\"school/rekap\"" not in code:
    code = code.replace("{/* Catch-all for not found pages */}", f"{route_string}\n        {{/* Catch-all for not found pages */}}")

with open(file_path, "w", encoding="utf-8") as f:
    f.write(code)

file_path2 = "d:/SISTEM KOPERASI/src/components/layout/Sidebar.tsx"
with open(file_path2, "r", encoding="utf-8") as f:
    code2 = f.read()

if "Rekap Pesanan" not in code2 or "school/rekap" not in code2:
    code2 = code2.replace('to="/school/retur"', 'to="/school/rekap" className={({ isActive }) => `nav-item ${isActive ? \'active\' : \'\'}`}>\n          <div className="nav-icon">📊</div>\n          Rekap Pesanan\n        </NavLink>\n        <NavLink to="/school/retur"')

with open(file_path2, "w", encoding="utf-8") as f:
    f.write(code2)

print("done")
