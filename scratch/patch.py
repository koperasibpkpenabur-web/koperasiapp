import re

file_path = "d:/SISTEM KOPERASI/src/pages/School/SchoolPemesanan.tsx"
with open(file_path, "r", encoding="utf-8") as f:
    code = f.read()

# 1. Import Supabase
if "import { supabase }" not in code:
    code = code.replace(
        "import { useSettings } from '../../context/SettingsContext';",
        "import { useSettings } from '../../context/SettingsContext';\nimport { supabase } from '../../lib/supabase';"
    )

# 2. Insert pagination state before the first early return
pagination_state = """
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

  const [schoolReturns, setSchoolReturns] = useState<any[]>([]);

  // Fetch Aggregate Counts
  const fetchCounts = async () => {
    if (!user?.id) return;
    const { data, error } = await supabase.from('orders').select('status').eq('school_user_id', user.id);
    if (!error && data) {
      let p = 0, a = 0, s = 0, r = 0;
      data.forEach((o: any) => {
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
      // Will be updated when ReturnContext is refactored
      getReturnsBySchoolId(user.id).then((ret: any) => setSchoolReturns(ret || []));
    }
  }, [user?.id, activeTab, currentPage]);
  
  const refetchData = () => {
    fetchCounts();
    fetchPaginated();
  };
"""

target = "const [activeTab, setActiveTab] = useState<'active' | 'received' | 'cancellations'>('active');"
code = code.replace(target, target + "\n" + pagination_state)

# 3. Remove old synchronous calculations
old_calcs = re.search(r"// Filter orders for logged-in school.*?const cancelledCount = cancelledOrders\.length;\n", code, re.DOTALL)
if old_calcs:
    code = code.replace(old_calcs.group(0), "const activeReturnsCount = schoolReturns.filter((r: any) => r.status === 'requested' || r.status === 'in_transit').length;\n")

# 4. Map paginatedOrders instead of activeOrders etc
code = code.replace("activeOrders.map(", "paginatedOrders.map(")
code = code.replace("receivedOrders.map(", "paginatedOrders.map(")
code = code.replace("cancelledOrders.map(", "paginatedOrders.map(")

code = code.replace("activeOrders.length", "paginatedOrders.length")
code = code.replace("receivedOrders.length", "paginatedOrders.length")
code = code.replace("cancelledOrders.length", "paginatedOrders.length")
code = code.replace("allSchoolOrders.length", "totalAllCount")

# 5. Fix implicit any map
code = code.replace("paginatedOrders.map((order) =>", "paginatedOrders.map((order: Order) =>")

# 6. Add refetchData calls
code = code.replace("setReceivingOrder(null);", "setReceivingOrder(null);\n    refetchData();")
code = code.replace("setCancellingOrder(null);\n    setCancelReason('');", "setCancellingOrder(null);\n    setCancelReason('');\n    refetchData();")

# 7. Add Pagination UI at the end of lists
pagination_ui = """
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
              )}
"""
code = code.replace('</div>\n            </>\n          ) : (\n            <div className="order-empty">', f'</div>\n{pagination_ui}\n            </>\n          ) : (\n            <div className="order-empty">')


with open(file_path, "w", encoding="utf-8") as f:
    f.write(code)

print("done")
