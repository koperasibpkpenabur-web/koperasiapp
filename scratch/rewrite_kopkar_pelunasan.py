import re

filepath = "d:/SISTEM KOPERASI/src/pages/Kopkar/KopkarPelunasan.tsx"

with open(filepath, "r", encoding="utf-8") as f:
    code = f.read()

# 1. Add pagination states
new_states = """  // Paginasi Server-Side
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);
  const [totalCount, setTotalCount] = useState(0);

  // Aggregates
  const [totalOmzetStudent, setTotalOmzetStudent] = useState(0);
  const [totalPaidRevenue, setTotalPaidRevenue] = useState(0);
  const [countTahap1, setCountTahap1] = useState(0);
  const [countTahap2, setCountTahap2] = useState(0);
  const [countTambahan, setCountTambahan] = useState(0);
  const [cancelRequestsCount, setCancelRequestsCount] = useState(0);
"""

code = re.sub(r"const \[loadingOrders, setLoadingOrders\] = useState\(true\);\n", "const [loadingOrders, setLoadingOrders] = useState(true);\n" + new_states, code)

# 2. Rewrite useEffect to fetch aggregates and paginated data separately
new_use_effect = """
  const fetchAggregates = async () => {
    const { data, error } = await supabase.from('orders').select('status, payment_status, fee_status, order_phase, total_price_student, total_fee_school');
    if (!error && data) {
      let omzet = 0, paid = 0, cT1 = 0, cT2 = 0, cTamb = 0, cCancelReq = 0;
      data.forEach(o => {
        if (o.status !== 'cancelled' && o.status !== 'rejected') omzet += Number(o.total_price_student) || 0;
        if (o.payment_status === 'paid') paid += Number(o.total_price_student) || 0;
        
        if (o.status === 'cancellation_requested') cCancelReq++;
        
        if (o.order_phase === 'Tahap 1') cT1++;
        else if (o.order_phase === 'Tahap 2') cT2++;
        else if (o.order_phase && o.order_phase.includes('Tambahan')) cTamb++;
      });
      setTotalOmzetStudent(omzet);
      setTotalPaidRevenue(paid);
      setCountTahap1(cT1);
      setCountTahap2(cT2);
      setCountTambahan(cTamb);
      setCancelRequestsCount(cCancelReq);
    }
  };

  const fetchOrders = async () => {
    setLoadingOrders(true);
    let query = supabase.from('orders').select('*, order_items(*)', { count: 'exact' }).eq('status', 'received');
    
    if (paymentFilter !== 'all') {
      query = query.eq('payment_status', paymentFilter);
    }
    if (searchQuery) {
      query = query.ilike('school_name', `%${searchQuery}%`);
    }

    query = query.order('created_at', { ascending: false });
    
    const from = (currentPage - 1) * itemsPerPage;
    const to = from + itemsPerPage - 1;
    query = query.range(from, to);

    const { data, count, error } = await query;
    if (!error && data) {
      setOrders(data.map((row: any) => ({
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
        processedAt: row.processed_at,
        processedBy: row.processed_by,
      })));
      if (count !== null) setTotalCount(count);
    }
    setLoadingOrders(false);
  };

  useEffect(() => {
    fetchAggregates();
  }, []);

  useEffect(() => {
    fetchOrders();
  }, [paymentFilter, searchQuery, currentPage]);
"""

old_use_effect_regex = r"useEffect\(\(\) => \{\n\s*const fetchOrders = async \(\) => \{.*?\};\n\s*fetchOrders\(\);\n\s*\}, \[\]\);"
code = re.sub(old_use_effect_regex, new_use_effect, code, flags=re.DOTALL)

# 3. Remove synchronous aggregates
sync_aggregates_regex = r"// 1\. Pesanan Berjalan.*?const countTambahan = orders\.filter.*?\.length;\n"
code = re.sub(sync_aggregates_regex, "", code, flags=re.DOTALL)

# 4. Remove activeTab check from filters because we only render received orders now
code = code.replace("const filteredReceivedOrders = receivedOrders.filter((o) => {", "const filteredReceivedOrders = orders.filter((o) => {")
# Since we filter in supabase, we don't need client filter
# Wait, the client filter searches by name and payment_status. Let's just bypass it.
code = code.replace("filteredReceivedOrders.map", "orders.map")
code = code.replace("filteredReceivedOrders.length", "orders.length")

# 5. Add Pagination UI to the table
pagination_ui = """
              {/* Pagination UI */}
              {totalCount > itemsPerPage && (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '16px', marginTop: '24px' }}>
                  <button 
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid #cbd5e1', background: currentPage === 1 ? '#f1f5f9' : '#fff', color: currentPage === 1 ? '#94a3b8' : '#1e293b', cursor: currentPage === 1 ? 'not-allowed' : 'pointer' }}
                  >
                    ← Sebelumnya
                  </button>
                  <span style={{ fontSize: '0.9rem', color: '#64748b', fontWeight: 500 }}>
                    Halaman {currentPage} dari {Math.ceil(totalCount / itemsPerPage)}
                  </span>
                  <button 
                    disabled={currentPage >= Math.ceil(totalCount / itemsPerPage)}
                    onClick={() => setCurrentPage(prev => Math.min(Math.ceil(totalCount / itemsPerPage), prev + 1))}
                    style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid #cbd5e1', background: currentPage >= Math.ceil(totalCount / itemsPerPage) ? '#f1f5f9' : '#fff', color: currentPage >= Math.ceil(totalCount / itemsPerPage) ? '#94a3b8' : '#1e293b', cursor: currentPage >= Math.ceil(totalCount / itemsPerPage) ? 'not-allowed' : 'pointer' }}
                  >
                    Selanjutnya →
                  </button>
                </div>
              )}
"""
code = code.replace('</div>\n\n              {/* Mobile Card View */}', f'</div>\n{pagination_ui}\n              {{/* Mobile Card View */}}')

# 6. Remove dead code tabs
dead_tabs_regex = r"\{/\* Tabs removed, only showing received orders \*/\}.*?\{/\* TAB 2: HISTORY PEMESANAN DITERIMA & PENCAIRAN FEE SEKOLAH \*/\}"
code = re.sub(dead_tabs_regex, "{/* TAB 2: HISTORY PEMESANAN DITERIMA & PENCAIRAN FEE SEKOLAH */}", code, flags=re.DOTALL)

code = re.sub(r"\{/\* TAB 3: HISTORY PEMBATALAN \*/\}.*?\{/\* Modal Input Pengiriman Barang \*/\}", "{/* Modal Input Pengiriman Barang */}", code, flags=re.DOTALL)

# Remove `{activeTab === 'received' && (` wrapping
code = code.replace("{activeTab === 'received' && (", "")
code = code.replace(")}\n\n      {/* Modal Input Pengiriman Barang */}", "\n\n      {/* Modal Input Pengiriman Barang */}")

with open(filepath, "w", encoding="utf-8") as f:
    f.write(code)

print("Rewrite done")
