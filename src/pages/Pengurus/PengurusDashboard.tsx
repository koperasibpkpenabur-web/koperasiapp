import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import * as XLSX from 'xlsx';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
} from 'recharts';

import './PengurusDashboard.css';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

const PengurusDashboard = () => {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('orders')
        .select('status, school_name, school_level, order_phase, total_price_student, total_price_kopkar, total_fee_school, payment_status, fee_status');
        
      if (!error && data) {
        setOrders(data.map((r: any) => ({
          status: r.status,
          schoolName: r.school_name,
          schoolLevel: r.school_level,
          orderPhase: r.order_phase,
          totalPriceStudent: Number(r.total_price_student) || 0,
          totalPriceKopkar: Number(r.total_price_kopkar) || 0,
          totalFeeSchool: Number(r.total_fee_school) || 0,
          paymentStatus: r.payment_status,
          feeStatus: r.fee_status,
        })));
      }
      setLoading(false);
    };
    fetchData();
  }, []);

  // 1. Data Aggregation
  const validOrders = useMemo(() => {
    return orders.filter(
      (o: any) => o.status !== 'cancelled' && o.status !== 'rejected' && o.status !== 'cancellation_requested'
    );
  }, [orders]);

  const kpis = useMemo(() => {
    let totalOmzet = 0;
    let totalModal = 0;
    let totalFee = 0;
    let kasMasuk = 0;
    let hutangFee = 0;

    validOrders.forEach(o => {
      totalOmzet += o.totalPriceStudent;
      totalModal += o.totalPriceKopkar;
      totalFee += o.totalFeeSchool;

      if (o.paymentStatus === 'paid') {
        kasMasuk += o.totalPriceStudent;
      }
      
      // Fee yang harus dibayar ke sekolah tapi belum ditransfer
      if (o.feeStatus === 'ready') {
        hutangFee += o.totalFeeSchool;
      }
    });

    const piutang = totalOmzet - kasMasuk;
    const labaBersih = totalOmzet - totalModal - totalFee;

    return { totalOmzet, totalModal, labaBersih, kasMasuk, piutang, hutangFee };
  }, [validOrders]);

  const omzetPerSchool = useMemo(() => {
    const map = new Map<string, { omzet: number; level: string; orderCount: number; lunas: number; piutang: number }>();
    validOrders.forEach((o: any) => {
      const existing = map.get(o.schoolName) || { omzet: 0, level: o.schoolLevel || '-', orderCount: 0, lunas: 0, piutang: 0 };
      existing.omzet += o.totalPriceStudent;
      existing.orderCount += 1;
      if (o.paymentStatus === 'paid') {
        existing.lunas += o.totalPriceStudent;
      } else {
        existing.piutang += o.totalPriceStudent;
      }
      map.set(o.schoolName, existing);
    });
    return Array.from(map.entries())
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.omzet - a.omzet);
  }, [validOrders]);

  // Chart Data
  const paymentStatusData = [
    { name: 'Sudah Lunas', value: kpis.kasMasuk },
    { name: 'Piutang', value: kpis.piutang },
  ];

  const omzetByLevelData = useMemo(() => {
    const levels = { 'TK': 0, 'SD': 0, 'SMP': 0, 'SMA': 0, 'SMK': 0 };
    validOrders.forEach(o => {
      if (levels[o.schoolLevel as keyof typeof levels] !== undefined) {
        levels[o.schoolLevel as keyof typeof levels] += o.totalPriceStudent;
      }
    });
    return Object.entries(levels)
      .map(([name, omzet]) => ({ name, omzet }))
      .filter(d => d.omzet > 0);
  }, [validOrders]);

  const omzetByPhaseData = useMemo(() => {
    const phases = { 'Tahap 1': 0, 'Tahap 2': 0, 'Tambahan': 0 };
    validOrders.forEach(o => {
      if (phases[o.orderPhase as keyof typeof phases] !== undefined) {
        phases[o.orderPhase as keyof typeof phases] += o.totalPriceStudent;
      }
    });
    return Object.entries(phases)
      .map(([name, omzet]) => ({ name, omzet }))
      .filter(d => d.omzet > 0);
  }, [validOrders]);

  const formatRupiah = (num: number) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(num);
  };
  const formatRupiahShort = (num: number) => {
    if (num >= 1000000000) return `Rp ${(num / 1000000000).toFixed(1)} M`;
    if (num >= 1000000) return `Rp ${(num / 1000000).toFixed(1)} Jt`;
    return `Rp ${(num / 1000).toFixed(0)} K`;
  };

  // Export functions
  const handleDownloadExcel = () => {
    const worksheetData = omzetPerSchool.map((school, i) => ({
      'No': i + 1,
      'Nama Sekolah': school.name,
      'Jenjang': school.level,
      'Jumlah Pesanan': school.orderCount,
      'Total Omzet': school.omzet,
      'Lunas': school.lunas,
      'Piutang': school.piutang,
    }));
    
    // Add Total Row
    worksheetData.push({
      'No': '',
      'Nama Sekolah': 'TOTAL',
      'Jenjang': '',
      'Jumlah Pesanan': omzetPerSchool.reduce((s, c) => s + c.orderCount, 0),
      'Total Omzet': kpis.totalOmzet,
      'Lunas': kpis.kasMasuk,
      'Piutang': kpis.piutang,
    });

    const ws = XLSX.utils.json_to_sheet(worksheetData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Rekap_Keuangan");
    XLSX.writeFile(wb, "Rekap_Keuangan_Pengurus.xlsx");
  };

  const handleDownloadPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text('Laporan Keuangan Koperasi - Executive Summary', 14, 20);
    doc.setFontSize(10);
    doc.text(`Tanggal Cetak: ${new Date().toLocaleString('id-ID')}`, 14, 28);
    
    // Summary KPI
    doc.text(`Total Omzet: ${formatRupiah(kpis.totalOmzet)}`, 14, 40);
    doc.text(`Total Laba Bersih: ${formatRupiah(kpis.labaBersih)}`, 100, 40);
    doc.text(`Total Kas Masuk: ${formatRupiah(kpis.kasMasuk)}`, 14, 48);
    doc.text(`Total Piutang: ${formatRupiah(kpis.piutang)}`, 100, 48);

    const tableColumn = ["No", "Nama Sekolah", "Jenjang", "Pesanan", "Omzet", "Lunas", "Piutang"];
    const tableRows = omzetPerSchool.map((s, i) => [
      i + 1, s.name, s.level, s.orderCount, formatRupiah(s.omzet), formatRupiah(s.lunas), formatRupiah(s.piutang)
    ]);
    
    // Total row
    tableRows.push([
      '', 'TOTAL', '', omzetPerSchool.reduce((s, c) => s + c.orderCount, 0).toString(), formatRupiah(kpis.totalOmzet), formatRupiah(kpis.kasMasuk), formatRupiah(kpis.piutang)
    ]);

    (doc as any).autoTable({
      head: [tableColumn],
      body: tableRows,
      startY: 60,
      theme: 'grid',
      styles: { fontSize: 8 },
      headStyles: { fillColor: [59, 130, 246] }
    });

    doc.save('Laporan_Keuangan_Pengurus.pdf');
  };

  if (loading) {
    return (
      <div className="pengurus-loading">
        <div className="spinner"></div>
        <p>Menyiapkan Dashboard Eksekutif...</p>
      </div>
    );
  }

  return (
    <div className="pengurus-dashboard-container">
      <div className="pengurus-header">
        <div>
          <h2 className="pengurus-title">Executive Dashboard</h2>
          <p className="pengurus-subtitle">Ringkasan Keuangan & Performa Penjualan Koperasi</p>
        </div>
        <div className="pengurus-actions">
          <button className="btn-export pdf" onClick={handleDownloadPDF}>
            <span className="icon">📄</span> PDF
          </button>
          <button className="btn-export excel" onClick={handleDownloadExcel}>
            <span className="icon">📊</span> Excel
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="kpi-grid">
        <div className="kpi-card glass primary">
          <div className="kpi-icon">💰</div>
          <div className="kpi-content">
            <p className="kpi-label">Total Omzet</p>
            <h3 className="kpi-value">{formatRupiah(kpis.totalOmzet)}</h3>
          </div>
        </div>
        
        <div className="kpi-card glass success">
          <div className="kpi-icon">📈</div>
          <div className="kpi-content">
            <p className="kpi-label">Laba Bersih</p>
            <h3 className="kpi-value">{formatRupiah(kpis.labaBersih)}</h3>
          </div>
        </div>

        <div className="kpi-card glass info">
          <div className="kpi-icon">💳</div>
          <div className="kpi-content">
            <p className="kpi-label">Kas Masuk (Lunas)</p>
            <h3 className="kpi-value">{formatRupiah(kpis.kasMasuk)}</h3>
          </div>
        </div>

        <div className="kpi-card glass warning">
          <div className="kpi-icon">⏳</div>
          <div className="kpi-content">
            <p className="kpi-label">Piutang (Belum Lunas)</p>
            <h3 className="kpi-value">{formatRupiah(kpis.piutang)}</h3>
          </div>
        </div>

        <div className="kpi-card glass danger">
          <div className="kpi-icon">🏫</div>
          <div className="kpi-content">
            <p className="kpi-label">Hutang Cashback Sekolah</p>
            <h3 className="kpi-value">{formatRupiah(kpis.hutangFee)}</h3>
          </div>
        </div>
      </div>

      {/* Charts Area */}
      <div className="charts-grid">
        <div className="chart-card">
          <h3 className="chart-title">Status Pembayaran</h3>
          <div className="chart-wrapper">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={paymentStatusData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  <Cell fill="#10b981" />
                  <Cell fill="#f59e0b" />
                </Pie>
                <Tooltip formatter={(val: number) => formatRupiah(val)} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="chart-card">
          <h3 className="chart-title">Omzet per Jenjang</h3>
          <div className="chart-wrapper">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={omzetByLevelData} margin={{ top: 10, right: 10, left: 20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={formatRupiahShort} tick={{ fill: '#64748b' }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(val: number) => formatRupiah(val)} cursor={{ fill: '#f1f5f9' }} />
                <Bar dataKey="omzet" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="chart-card">
          <h3 className="chart-title">Tren per Gelombang</h3>
          <div className="chart-wrapper">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={omzetByPhaseData} margin={{ top: 10, right: 10, left: 20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={formatRupiahShort} tick={{ fill: '#64748b' }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(val: number) => formatRupiah(val)} />
                <Line type="monotone" dataKey="omzet" stroke="#8b5cf6" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Detail Table */}
      <div className="table-card">
        <h3 className="chart-title" style={{ marginBottom: '16px' }}>Rincian Keuangan per Sekolah</h3>
        <div className="table-responsive">
          <table className="executive-table">
            <thead>
              <tr>
                <th>Nama Sekolah</th>
                <th>Jenjang</th>
                <th className="text-center">Pesanan</th>
                <th className="text-right">Omzet</th>
                <th className="text-right">Lunas</th>
                <th className="text-right">Piutang</th>
                <th className="text-center">Status</th>
              </tr>
            </thead>
            <tbody>
              {omzetPerSchool.map((school, idx) => {
                const percentLunas = school.omzet > 0 ? (school.lunas / school.omzet) * 100 : 0;
                return (
                  <tr key={idx}>
                    <td className="font-medium text-slate-800">{school.name}</td>
                    <td><span className={`badge-level ${school.level.toLowerCase()}`}>{school.level}</span></td>
                    <td className="text-center text-slate-500">{school.orderCount}</td>
                    <td className="text-right font-medium">{formatRupiah(school.omzet)}</td>
                    <td className="text-right text-emerald-600 font-medium">{formatRupiah(school.lunas)}</td>
                    <td className="text-right text-amber-500 font-medium">{formatRupiah(school.piutang)}</td>
                    <td className="text-center">
                      <div className="progress-bar-bg">
                        <div className="progress-bar-fill" style={{ width: `${percentLunas}%`, background: percentLunas === 100 ? '#10b981' : '#f59e0b' }}></div>
                      </div>
                      <span className="progress-text">{percentLunas.toFixed(0)}%</span>
                    </td>
                  </tr>
                );
              })}
              {omzetPerSchool.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-slate-400">Belum ada data pesanan</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default PengurusDashboard;
