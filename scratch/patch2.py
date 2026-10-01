import re

file_path = "d:/SISTEM KOPERASI/src/pages/School/SchoolPemesanan.tsx"
with open(file_path, "r", encoding="utf-8") as f:
    code = f.read()

# 1. Add notes to the mapped Order object
code = code.replace("createdAt: row.created_at,\n      })))", "createdAt: row.created_at,\n         notes: row.notes || '',\n      })))")

# 2. Add useEffect to React import
code = re.sub(r"import React, {([^}]+)} from 'react';", lambda m: "import React, {" + m.group(1) + ", useEffect} from 'react';" if "useEffect" not in m.group(1) else m.group(0), code)
code = re.sub(r"import {([^}]+)} from 'react';", lambda m: "import {" + m.group(1) + ", useEffect} from 'react';" if "useEffect" not in m.group(1) and "React" not in m.group(0) else m.group(0), code)

# 3. getReturnsBySchoolId is NOT a Promise
code = code.replace("getReturnsBySchoolId(user.id).then((ret: any) => setSchoolReturns(ret || []));", "setSchoolReturns(getReturnsBySchoolId(user.id) as any[]);")

# 4. allSchoolOrders still present?
code = code.replace("allSchoolOrders", "paginatedOrders")

# 5. cancelledCount
code = code.replace("cancelledCount", "totalAllCount") # Since cancelledCount might be used just for some summary, actually it was totalAllCount or we just fallback to 0. Let's see what it was used for. If it's the badge on the tab, we can use 0 or something. Wait, in pagination, cancelled count is not explicitly fetched but pendingCount, approvedCount, shippedCount, receivedCount are. I will just replace `cancelledCount` with `(totalAllCount - pendingCount - approvedCount - shippedCount - receivedCount)`
code = code.replace("cancelledCount", "(totalAllCount - pendingCount - approvedCount - shippedCount - receivedCount)")

with open(file_path, "w", encoding="utf-8") as f:
    f.write(code)

print("done")
