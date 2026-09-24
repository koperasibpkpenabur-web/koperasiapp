import { useMemo } from 'react';
import { useOrders } from '../../context/OrderContext';

const PengurusDashboard = () => {
  const { orders } = useOrders();

  // Hanya pesanan yang tidak batal/ditolak yang dihitung pendapatannya
  const validOrders = useMemo(() => {
    return orders.filter(
      (o) => o.status !== 'cancelled' && o.status !== 'rejected' && o.status !== 'cancellation_requested'
    );
  }, [orders]);

  const totalOmzet = useMemo(() => {
    return validOrders.reduce((sum, order) => sum + (order.totalPriceStudent || 0), 0);
  }, [validOrders]);

  const totalModal = useMemo(() => {
    return validOrders.reduce((sum, order) => sum + (order.totalPriceKopkar || 0), 0);
  }, [validOrders]);

  const totalLaba = useMemo(() => {
    return validOrders.reduce((sum, order) => {
      const priceStudent = order.totalPriceStudent || 0;
      const modal = order.totalPriceKopkar || 0;
      const feeSchool = order.totalFeeSchool || 0;
      return sum + (priceStudent - modal - feeSchool);
    }, 0);
  }, [validOrders]);

  // Omzet Per Sekolah
  const omzetPerSchool = useMemo(() => {
    const map = new Map<string, { omzet: number; level: string; orderCount: number }>();
    validOrders.forEach((o) => {
      const existing = map.get(o.schoolName) || { omzet: 0, level: o.schoolLevel || '-', orderCount: 0 };
      existing.omzet += o.totalPriceStudent || 0;
      existing.orderCount += 1;
      map.set(o.schoolName, existing);
    });
    return Array.from(map.entries())
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.omzet - a.omzet);
  }, [validOrders]);

  const formatRupiah = (num: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0,
    }).format(num);
  };

  return (
    <div style={{ padding: '20px' }}>
      <h2 style={{ marginBottom: '24px', color: '#1e293b' }}>Dashboard Eksekutif (Pengurus)</h2>

      {/* Ringkasan Laba Rugi */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
        gap: '20px',
        marginBottom: '32px'
      }}>
        <div style={{ backgroundColor: '#fff', padding: '20px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', borderLeft: '4px solid #3b82f6', containerType: 'inline-size' }}>
          <div style={{ fontSize: '0.875rem', color: '#64748b', fontWeight: 600, marginBottom: '8px' }}>Total Omzet (Pendapatan Kotor)</div>
          <div style={{ fontSize: 'clamp(1rem, 12cqi, 1.75rem)', fontWeight: 700, color: '#1e293b', wordBreak: 'break-word' }}>{formatRupiah(totalOmzet)}</div>
        </div>
        <div style={{ backgroundColor: '#fff', padding: '20px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', borderLeft: '4px solid #f59e0b', containerType: 'inline-size' }}>
          <div style={{ fontSize: '0.875rem', color: '#64748b', fontWeight: 600, marginBottom: '8px' }}>Total Harga Pokok (Modal Koperasi)</div>
          <div style={{ fontSize: 'clamp(1rem, 12cqi, 1.75rem)', fontWeight: 700, color: '#1e293b', wordBreak: 'break-word' }}>{formatRupiah(totalModal)}</div>
        </div>
        <div style={{ backgroundColor: '#fff', padding: '20px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', borderLeft: '4px solid #10b981', containerType: 'inline-size' }}>
          <div style={{ fontSize: '0.875rem', color: '#64748b', fontWeight: 600, marginBottom: '8px' }}>Total Margin Koperasi (Laba Bersih)</div>
          <div style={{ fontSize: 'clamp(1rem, 12cqi, 1.75rem)', fontWeight: 700, color: '#10b981', wordBreak: 'break-word' }}>{formatRupiah(totalLaba)}</div>
        </div>
      </div>

      {/* Laporan Per Sekolah/Jenjang */}
      <div style={{ backgroundColor: '#fff', padding: '20px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        <h3 style={{ marginBottom: '16px', color: '#1e293b', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px' }}>
          Laporan Pemesanan Per Sekolah
        </h3>
        
        {omzetPerSchool.length > 0 ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e2e8f0', color: '#475569', fontSize: '0.875rem' }}>
                  <th style={{ padding: '12px 16px' }}>Nama Sekolah</th>
                  <th style={{ padding: '12px 16px' }}>Jenjang</th>
                  <th style={{ padding: '12px 16px', textAlign: 'center' }}>Jumlah Pesanan</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>Total Omzet</th>
                </tr>
              </thead>
              <tbody>
                {omzetPerSchool.map((school, index) => (
                  <tr key={index} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '12px 16px', fontWeight: 600, color: '#1e293b' }}>{school.name}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ 
                        backgroundColor: '#e0f2fe', 
                        color: '#0284c7', 
                        padding: '2px 8px', 
                        borderRadius: '99px', 
                        fontSize: '0.75rem', 
                        fontWeight: 600 
                      }}>
                        {school.level}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'center', color: '#64748b' }}>{school.orderCount} pesanan</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600, color: '#1e293b' }}>
                      {formatRupiah(school.omzet)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: '#94a3b8' }}>
            Belum ada data pesanan dari sekolah.
          </div>
        )}
      </div>
    </div>
  );
};

export default PengurusDashboard;
