const fs = require('fs');

function patchFile() {
  const file = 'd:/SISTEM KOPERASI/src/pages/School/SchoolPemesanan.tsx';
  let code = fs.readFileSync(file, 'utf-8');

  // 1. Add supabase import
  if (!code.includes("import { supabase }")) {
    code = code.replace(
      "import { useSettings } from '../../context/SettingsContext';",
      "import { useSettings } from '../../context/SettingsContext';\nimport { supabase } from '../../lib/supabase';"
    );
  }

  // 2. State replacements
  const oldStateMatch = code.match(/const \[allSchoolOrders, setAllSchoolOrders\] = useState[^;]+;[\s\S]*?}, \[user\?\.id, getOrdersBySchoolId, getReturnsBySchoolId\]\);/);
  
  if (oldStateMatch) {
    const newState = `const [schoolReturns, setSchoolReturns] = useState<any[]>([]);

  // PAGINATION STATES
  const [paginatedOrders, setPaginatedOrders] = useState<Order[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);
  const [totalTabCount, setTotalTabCount] = useState(0);

  // AGGREGATE STATS
  const [pendingCount, setPendingCount] = useState(0);
  const [approvedCount, setApprovedCount] = useState(0);
  const [shippedCount, setShippedCount] = useState(0);
  const [totalAllCount, setTotalAllCount] = useState(0);
  const [receivedCount, setReceivedCount] = useState(0);

  // Update effect for activeTab
  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab]);

  // Fetch Aggregate Counts
  const fetchCounts = async () => {
    if (!user?.id) return;
    const { data, error } = await supabase.from('orders').select('status').eq('school_user_id', user.id);
    if (!error && data) {
      let p = 0, a = 0, s = 0, r = 0;
      data.forEach(o => {
        if (o.status === 'pending') p++;
        else if (o.status === 'approved') a++;
        else if (o.status === 'shipped') s++;
        else if (o.status === 'received') r++;
      });
      setPendingCount(p);
      setApprovedCount(a);
      setShippedCount(s);
      setReceivedCount(r);
      setTotalAllCount(data.length);
    }
  };

  // Fetch Paginated Data
  const fetchPaginated = async () => {
    if (!user?.id) return;
    let query = supabase.from('orders').select('*, order_items(*)', { count: 'exact' }).eq('school_user_id', user.id);
    
    if (activeTab === 'active') {
      query = query.in('status', ['pending', 'approved', 'shipped']);
    } else if (activeTab === 'received') {
      query = query.eq('status', 'received');
    } else if (activeTab === 'cancellations') {
      query = query.in('status', ['cancelled', 'cancellation_requested', 'rejected']);
    }
    
    query = query.order('created_at', { ascending: false });
    
    const from = (currentPage - 1) * itemsPerPage;
    const to = from + itemsPerPage - 1;
    query = query.range(from, to);
    
    const { data, count, error } = await query;
    if (!error && data) {
      setPaginatedOrders(data.map((row: any) => ({
         id: row.id,
         schoolUserId: row.school_user_id,
         schoolName: row.school_name,
         schoolLevel: row.school_level,
         orderPhase: row.order_phase,
         items: (row.order_items || []).map((it: any) => ({
           id: it.id,
           productId: it.product_id,
           name: it.name,
           type: it.type,
           size: it.size,
           gender: it.gender,
           quantity: it.quantity,
           priceKopkar: Number(it.price_kopkar),
           feeSchool: Number(it.fee_school),
           priceStudent: Number(it.price_student),
         })),
         totalPriceKopkar: Number(row.total_price_kopkar),
         totalFeeSchool: Number(row.total_fee_school),
         totalPriceStudent: Number(row.total_price_student),
         status: row.status,
         rejectionReason: row.rejection_reason,
         shippingInfo: row.shipping_info,
         receiveInfo: row.receive_info,
         cancellationInfo: row.cancellation_info,
         paymentStatus: row.payment_status,
         paidAt: row.paid_at,
         paidNotes: row.paid_notes,
         feeStatus: row.fee_status,
         feeDisbursedAt: row.fee_disbursed_at,
         feeDisbursedBy: row.fee_disbursed_by,
         feeDisbursedNotes: row.fee_disbursed_notes,
         createdAt: row.created_at,
      })));
      if (count !== null) setTotalTabCount(count);
    }
  };

  useEffect(() => {
    if (user?.id) {
      fetchCounts();
      fetchPaginated();
      setSchoolReturns(getReturnsBySchoolId(user.id) as any[]);
    }
  }, [user?.id, activeTab, currentPage]);
  
  // Expose a refetch method for after actions
  const refetchData = () => {
    fetchCounts();
    fetchPaginated();
  };`;
    code = code.replace(oldStateMatch[0], newState);
  }

  // 3. Remove local filters and counts
  const localFiltersMatch = code.match(/\/\/ 1\. Pesanan Berjalan:[\s\S]*?const cancelledCount = cancelledOrders\.length;/);
  if (localFiltersMatch) {
    code = code.replace(localFiltersMatch[0], '// Local filters replaced by server side pagination');
  } else {
    console.log("Could not find local filters to replace");
  }

  // 4. Update handlers to call refetchData()
  code = code.replace(/setReceivingOrder\(null\);/g, "setReceivingOrder(null);\n    refetchData();");
  code = code.replace(/setCancellingOrder\(null\);\n    setCancelReason\(''\);/g, "setCancellingOrder(null);\n    setCancelReason('');\n    refetchData();");
  code = code.replace(/setShowCartModal\(false\);/g, "setShowCartModal(false);\n      refetchData();");

  // 5. Replace references
  code = code.replace(/activeOrders\.map\(/g, "paginatedOrders.map(");
  code = code.replace(/receivedOrders\.map\(/g, "paginatedOrders.map(");
  code = code.replace(/cancelledOrders\.map\(/g, "paginatedOrders.map(");
  code = code.replace(/activeOrders\.length/g, "paginatedOrders.length");
  code = code.replace(/receivedOrders\.length/g, "paginatedOrders.length");
  code = code.replace(/cancelledOrders\.length/g, "paginatedOrders.length");
  code = code.replace(/allSchoolOrders\.length/g, "totalAllCount");

  // Fix implicit any on map if they exist (they shouldn't be a problem if Order type is used, but just in case)
  code = code.replace(/paginatedOrders\.map\(\(order\) =>/g, "paginatedOrders.map((order: Order) =>");

  // 6. Inject Pagination UI at the end of each tab list
  // The tab lists end with `</div>\n            </>\n          ) : (\n            <div className="order-empty">`
  const paginationUI = `
              {/* Pagination UI */}
              {totalTabCount > itemsPerPage && (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '16px', marginTop: '24px' }}>
                  <button 
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid #cbd5e1', background: currentPage === 1 ? '#f1f5f9' : '#fff', color: currentPage === 1 ? '#94a3b8' : '#1e293b', cursor: currentPage === 1 ? 'not-allowed' : 'pointer' }}
                  >
                    ← Sebelumnya
                  </button>
                  <span style={{ fontSize: '0.9rem', color: '#64748b', fontWeight: 500 }}>
                    Halaman {currentPage} dari {Math.ceil(totalTabCount / itemsPerPage)}
                  </span>
                  <button 
                    disabled={currentPage >= Math.ceil(totalTabCount / itemsPerPage)}
                    onClick={() => setCurrentPage(prev => Math.min(Math.ceil(totalTabCount / itemsPerPage), prev + 1))}
                    style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid #cbd5e1', background: currentPage >= Math.ceil(totalTabCount / itemsPerPage) ? '#f1f5f9' : '#fff', color: currentPage >= Math.ceil(totalTabCount / itemsPerPage) ? '#94a3b8' : '#1e293b', cursor: currentPage >= Math.ceil(totalTabCount / itemsPerPage) ? 'not-allowed' : 'pointer' }}
                  >
                    Selanjutnya →
                  </button>
                </div>
              )}`;

  code = code.replace(
    /<\/div>\s*<\/>\s*\) : \(\s*<div className="order-empty">/g, 
    `</div>\n${paginationUI}\n            </>\n          ) : (\n            <div className="order-empty">`
  );

  fs.writeFileSync(file, code);
  console.log("Successfully patched SchoolPemesanan.tsx with regex replacement.");
}

patchFile();
