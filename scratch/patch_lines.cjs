const fs = require('fs');
const file = 'd:/SISTEM KOPERASI/src/pages/School/SchoolPemesanan.tsx';
let lines = fs.readFileSync(file, 'utf-8').split(/\r?\n/);

const newState = `  const [schoolReturns, setSchoolReturns] = useState<any[]>([]);

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

// line 63 is index 62, line 74 is index 73
lines.splice(62, 12, newState);

fs.writeFileSync(file, lines.join('\n'));
console.log('patched');
