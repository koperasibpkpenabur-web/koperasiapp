import re

filepath = "d:/SISTEM KOPERASI/src/pages/Kopkar/KopkarPesanan.tsx"
with open(filepath, "r", encoding="utf-8") as f:
    code = f.read()

# Fix handleApprove
code = code.replace(
"""  const handleApprove = (order: Order) => {
    const processorName = user ? user.name : 'Karyawan Koperasi';
    if (window.confirm(`Setujui pesanan ${order.id} dari "${order.schoolName}"?`)) {
      approveOrder(order.id, processorName);
    }
  };""",
"""  const handleApprove = async (order: Order) => {
    const processorName = user ? user.name : 'Karyawan Koperasi';
    if (window.confirm(`Setujui pesanan ${order.id} dari "${order.schoolName}"?`)) {
      await approveOrder(order.id, processorName);
      setOrders(prev => prev.map(o => o.id === order.id ? { ...o, status: 'approved' } : o));
    }
  };"""
)

# Fix handleConfirmReject
code = code.replace(
"""  const handleConfirmReject = () => {
    if (!rejectingOrder) return;
    const processorName = user ? user.name : 'Karyawan Koperasi';
    rejectOrder(
      rejectingOrder.id,
      processorName,
      rejectionReason.trim() || 'Stok tidak mencukupi atau pesanan tidak sesuai'
    );
    setRejectingOrder(null);
    setRejectionReason('');
  };""",
"""  const handleConfirmReject = async () => {
    if (!rejectingOrder) return;
    const processorName = user ? user.name : 'Karyawan Koperasi';
    await rejectOrder(
      rejectingOrder.id,
      processorName,
      rejectionReason.trim() || 'Stok tidak mencukupi atau pesanan tidak sesuai'
    );
    setOrders(prev => prev.map(o => o.id === rejectingOrder.id ? { ...o, status: 'rejected' } : o));
    setRejectingOrder(null);
    setRejectionReason('');
  };"""
)

# Fix handleConfirmShip
code = code.replace(
"""    await shipOrder(shippingOrder.id, shippingData, assignedVendorId);

    setShippingOrder(null);
  };""",
"""    await shipOrder(shippingOrder.id, shippingData, assignedVendorId);
    setOrders(prev => prev.map(o => o.id === shippingOrder.id ? { ...o, status: 'shipped' } : o));
    setShippingOrder(null);
  };"""
)

# Fix handleCancelShipment
code = code.replace(
"""  const handleCancelShipment = (order: Order) => {
    if (window.confirm('Batal kirim dan kembalikan pesanan ke status Disetujui?')) {
      cancelShipment(order.id);
    }
  };""",
"""  const handleCancelShipment = async (order: Order) => {
    if (window.confirm('Batal kirim dan kembalikan pesanan ke status Disetujui?')) {
      await cancelShipment(order.id);
      setOrders(prev => prev.map(o => o.id === order.id ? { ...o, status: 'approved' } : o));
    }
  };"""
)

# Fix handleConfirmApproveCancel
code = code.replace(
"""  const handleConfirmApproveCancel = (order: Order) => {
    const stafName = user ? user.name : 'Karyawan Koperasi';
    if (window.confirm('Setujui pengajuan batal dari sekolah ini?')) {
      approveCancelOrder(order.id, stafName);
      setOpenCancelMenuId(null);
    }
  };""",
"""  const handleConfirmApproveCancel = async (order: Order) => {
    const stafName = user ? user.name : 'Karyawan Koperasi';
    if (window.confirm('Setujui pengajuan batal dari sekolah ini?')) {
      await approveCancelOrder(order.id, stafName);
      setOrders(prev => prev.map(o => o.id === order.id ? { ...o, status: 'cancelled' } : o));
      setOpenCancelMenuId(null);
    }
  };"""
)

# Fix handleConfirmKopkarCancel
code = code.replace(
"""  const handleConfirmKopkarCancel = (e: FormEvent) => {
    e.preventDefault();
    if (!cancellingApprovedOrder) return;
    if (!kopkarCancelReason.trim()) {
      setCancelError('Alasan batal wajib diisi');
      return;
    }
    const stafName = user ? user.name : 'Karyawan Koperasi';
    kopkarCancelOrder(cancellingApprovedOrder.id, kopkarCancelReason.trim(), stafName);
    setCancellingApprovedOrder(null);
    setKopkarCancelReason('');
  };""",
"""  const handleConfirmKopkarCancel = async (e: FormEvent) => {
    e.preventDefault();
    if (!cancellingApprovedOrder) return;
    if (!kopkarCancelReason.trim()) {
      setCancelError('Alasan batal wajib diisi');
      return;
    }
    const stafName = user ? user.name : 'Karyawan Koperasi';
    await kopkarCancelOrder(cancellingApprovedOrder.id, kopkarCancelReason.trim(), stafName);
    setOrders(prev => prev.map(o => o.id === cancellingApprovedOrder.id ? { ...o, status: 'cancelled' } : o));
    setCancellingApprovedOrder(null);
    setKopkarCancelReason('');
  };"""
)

with open(filepath, "w", encoding="utf-8") as f:
    f.write(code)

print("KopkarPesanan fixed")
