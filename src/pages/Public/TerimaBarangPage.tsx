import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { verifyOrderQrToken, getSchoolDefaultPin } from '../../utils/orderQrToken';
import { resolveAcademicYear } from '../../utils/academicYear';

interface OrderQrSummary {
  id: string;
  school_name: string;
  academic_year: string;
  status: string;
  total_items: number;
  created_at?: string;
  shipping_info?: {
    shippedAtDate?: string;
    shippedAtTime?: string;
    courierNotes?: string;
    shippedBy?: string;
    source?: string;
  };
  receive_info?: {
    receivedAt: string;
    receivedBy: string;
    notes?: string | null;
    receivedVia?: string;
    isChecked?: boolean;
  };
  has_custom_pin?: boolean;
}

export const TerimaBarangPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const orderId = searchParams.get('id') || '';
  const token = searchParams.get('token') || '';

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const [order, setOrder] = useState<OrderQrSummary | null>(null);

  // Form states
  const [recipientName, setRecipientName] = useState('');
  const [recipientRole, setRecipientRole] = useState('Staf TU');
  const [schoolPin, setSchoolPin] = useState('');
  const [notes, setNotes] = useState('');
  const [isChecked, setIsChecked] = useState(true);

  useEffect(() => {
    let active = true;

    const loadOrderData = async () => {
      setLoading(true);
      setErrorMsg('');

      if (!orderId || !token) {
        if (active) {
          setErrorMsg('Link tidak lengkap. Silakan scan ulang QR Code yang tertera pada lembar Surat Jalan fisik.');
          setLoading(false);
        }
        return;
      }

      // 1. Verifikasi tanda tangan token keamanan
      const isTokenValid = verifyOrderQrToken(orderId, token);
      if (!isTokenValid) {
        if (active) {
          setErrorMsg('Kode token keamanan tidak valid. Pastikan Anda men-scan QR Code langsung dari Surat Jalan resmi Koperasi BPK PENABUR.');
          setLoading(false);
        }
        return;
      }

      try {
        // Coba panggil RPC aman
        const { data: rpcData, error: rpcErr } = await supabase.rpc('get_order_for_qr_receive', {
          p_order_id: orderId,
          p_token: token,
        });

        if (!active) return;

        if (!rpcErr && rpcData?.success) {
          setOrder(rpcData as OrderQrSummary);
          setLoading(false);
          return;
        }

        // Fallback: query tabel orders langsung (jika user sudah punya session atau RPC belum di-apply)
        const { data: directData, error: directErr } = await supabase
          .from('orders')
          .select('id, school_name, academic_year, status, created_at, shipping_info, receive_info, order_items(quantity)')
          .eq('id', orderId)
          .maybeSingle();

        if (!active) return;

        if (directErr || !directData) {
          setErrorMsg(rpcErr?.message || directErr?.message || 'Pesanan tidak ditemukan di database AKSARA.');
        } else {
          const totalQty = (directData.order_items || []).reduce(
            (sum: number, it: { quantity?: number }) => sum + (Number(it.quantity) || 0),
            0
          );
          setOrder({
            id: directData.id,
            school_name: directData.school_name,
            academic_year: directData.academic_year,
            status: directData.status,
            total_items: totalQty,
            created_at: directData.created_at,
            shipping_info: directData.shipping_info,
            receive_info: directData.receive_info,
            has_custom_pin: false,
          });
        }
      } catch (err: unknown) {
        if (active) {
          const msg = err instanceof Error ? err.message : String(err);
          setErrorMsg('Gagal memuat data surat jalan: ' + msg);
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    loadOrderData();
    return () => {
      active = false;
    };
  }, [orderId, token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!order) return;

    const cleanName = recipientName.trim();
    if (!cleanName) {
      alert('Nama penerima wajib diisi!');
      return;
    }

    if (!isChecked) {
      alert('Mohon centang pernyataan bahwa fisik barang telah diperiksa.');
      return;
    }

    // Validasi PIN Sekolah di sisi client (sebagai proteksi lapis awal)
    const expectedDefaultPin = getSchoolDefaultPin(order.school_name);
    const cleanPin = schoolPin.trim();

    // Jika Koperasi tidak set custom PIN di server, kita verifikasi default PIN atau fallback
    if (!order.has_custom_pin && cleanPin && cleanPin !== expectedDefaultPin && cleanPin !== '1234') {
      const confirmProceed = window.confirm(
        `Catatan: PIN sekolah yang Anda masukkan (${cleanPin}) berbeda dari standar (${expectedDefaultPin}). Apakah Anda yakin ingin melanjutkan?`
      );
      if (!confirmProceed) return;
    }

    setSubmitting(true);
    setErrorMsg('');

    const fullRecipientTitle = recipientRole ? `${cleanName} (${recipientRole})` : cleanName;

    try {
      // 1. Coba konfirmasi melalui RPC aman
      const { data: rpcRes, error: rpcErr } = await supabase.rpc('receive_order_via_qr', {
        p_order_id: order.id,
        p_token: token,
        p_recipient_name: fullRecipientTitle,
        p_notes: notes.trim() || null,
        p_school_pin: cleanPin || null,
      });

      if (!rpcErr && rpcRes) {
        if (!rpcRes.success) {
          throw new Error(rpcRes.error || 'Gagal konfirmasi penerimaan barang.');
        }
        setSuccessMsg(
          `Pesanan ${order.id} berhasil dicatat sebagai DITERIMA di sistem AKSARA. Terima kasih!`
        );
        setOrder(prev => (prev ? { ...prev, status: 'received', receive_info: rpcRes.receive_info } : null));
        return;
      }

      // 2. Fallback: jika RPC belum diinstal di Supabase, jalankan update direct
      const receivePayload = {
        receivedAt: new Date().toISOString(),
        receivedBy: fullRecipientTitle,
        receivedVia: 'qr_scan_surat_jalan',
        isChecked: true,
        notes: notes.trim() || null,
      };

      const { error: updateErr } = await supabase
        .from('orders')
        .update({
          status: 'received',
          receive_info: receivePayload,
        })
        .eq('id', order.id);

      if (updateErr) {
        throw updateErr;
      }

      setSuccessMsg(
        `Pesanan ${order.id} berhasil dicatat sebagai DITERIMA di sistem AKSARA. Terima kasih!`
      );
      setOrder(prev => (prev ? { ...prev, status: 'received', receive_info: receivePayload } : null));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(`Gagal memproses penerimaan: ${msg}`);
    } finally {
      setSubmitting(false);
    }
  };

  const defaultPinHint = order ? getSchoolDefaultPin(order.school_name) : '1234';

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#0f172a',
        color: '#f8fafc',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '16px 12px 40px 12px',
      }}
    >
      {/* BRANDING HEADER */}
      <div
        style={{
          width: '100%',
          maxWidth: '460px',
          textAlign: 'center',
          marginBottom: '16px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '6px',
        }}
      >
        <div
          style={{
            width: '52px',
            height: '52px',
            borderRadius: '12px',
            background: 'linear-gradient(135deg, #1e3a8a, #0284c7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1.6rem',
            boxShadow: '0 4px 12px rgba(2, 132, 199, 0.3)',
          }}
        >
          📦
        </div>
        <h1 style={{ margin: '4px 0 0 0', fontSize: '1.25rem', fontWeight: 800, color: '#f8fafc' }}>
          Tanda Terima Barang Digital
        </h1>
        <p style={{ margin: 0, fontSize: '0.8rem', color: '#94a3b8' }}>
          Koperasi Konsumen Karyawan BPK PENABUR Jakarta
        </p>
      </div>

      <div
        style={{
          width: '100%',
          maxWidth: '460px',
          background: '#1e293b',
          borderRadius: '16px',
          border: '1px solid rgba(71, 85, 105, 0.5)',
          padding: '20px 16px',
          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.4)',
        }}
      >
        {loading && (
          <div style={{ textAlign: 'center', padding: '36px 16px', color: '#94a3b8' }}>
            <div style={{ fontSize: '2rem', marginBottom: '8px' }}>⏳</div>
            <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>Memverifikasi Surat Jalan...</div>
          </div>
        )}

        {!loading && errorMsg && !order && (
          <div
            style={{
              padding: '16px',
              borderRadius: '12px',
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.35)',
              color: '#fca5a5',
              fontSize: '0.85rem',
              lineHeight: 1.5,
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: '1.8rem', marginBottom: '6px' }}>⚠️</div>
            <strong>Akses Gagal:</strong>
            <p style={{ margin: '6px 0 0 0' }}>{errorMsg}</p>
          </div>
        )}

        {!loading && order && (
          <div>
            {/* KARTU RINGKASAN SURAT JALAN */}
            <div
              style={{
                background: 'rgba(15, 23, 42, 0.65)',
                border: '1px solid rgba(71, 85, 105, 0.4)',
                borderRadius: '12px',
                padding: '14px',
                marginBottom: '16px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  marginBottom: '10px',
                  borderBottom: '1px solid rgba(71, 85, 105, 0.4)',
                  paddingBottom: '8px',
                }}
              >
                <div>
                  <div style={{ fontSize: '0.72rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    No. Pesanan / Surat Jalan
                  </div>
                  <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#38bdf8' }}>{order.id}</div>
                </div>
                <span
                  style={{
                    padding: '3px 8px',
                    borderRadius: '999px',
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    background:
                      order.status === 'received'
                        ? 'rgba(16, 185, 129, 0.2)'
                        : order.status === 'shipped'
                        ? 'rgba(56, 189, 248, 0.2)'
                        : 'rgba(245, 158, 11, 0.2)',
                    color:
                      order.status === 'received'
                        ? '#6ee7b7'
                        : order.status === 'shipped'
                        ? '#7dd3fc'
                        : '#fde68a',
                  }}
                >
                  {order.status === 'received'
                    ? '✅ Selesai Diterima'
                    : order.status === 'shipped'
                    ? '🚚 Dalam Pengiriman'
                    : order.status}
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '8px', fontSize: '0.82rem' }}>
                <div>
                  <span style={{ color: '#94a3b8' }}>Tujuan Sekolah:</span>{' '}
                  <strong style={{ color: '#f8fafc' }}>{order.school_name}</strong>
                </div>
                <div>
                  <span style={{ color: '#94a3b8' }}>Tahun Ajaran:</span>{' '}
                  <strong style={{ color: '#cbd5e1' }}>{resolveAcademicYear(order.academic_year)}</strong>
                </div>
                {order.total_items > 0 && (
                  <div>
                    <span style={{ color: '#94a3b8' }}>Total Muatan:</span>{' '}
                    <strong style={{ color: '#a7f3d0' }}>{order.total_items.toLocaleString('id-ID')} Pcs</strong>
                  </div>
                )}
                {order.shipping_info?.courierNotes && (
                  <div>
                    <span style={{ color: '#94a3b8' }}>Ekspedisi/Kurir:</span>{' '}
                    <span style={{ color: '#e2e8f0' }}>{order.shipping_info.courierNotes}</span>
                  </div>
                )}
              </div>
            </div>

            {/* KONDISI 1: JIKA SUDAH SELESAI DITERIMA */}
            {order.status === 'received' && (
              <div
                style={{
                  background: 'rgba(16, 185, 129, 0.12)',
                  border: '1px solid rgba(16, 185, 129, 0.4)',
                  borderRadius: '12px',
                  padding: '16px',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: '2.4rem', marginBottom: '6px' }}>🎉</div>
                <h3 style={{ margin: '0 0 6px 0', fontSize: '1.05rem', color: '#6ee7b7' }}>
                  Surat Jalan Sudah Selesai Diterima
                </h3>
                <p style={{ margin: '0 0 12px 0', fontSize: '0.82rem', color: '#cbd5e1', lineHeight: 1.4 }}>
                  Barang telah berhasil diterima dan diverifikasi ke dalam sistem AKSARA Koperasi.
                </p>

                {order.receive_info && (
                  <div
                    style={{
                      background: 'rgba(15, 23, 42, 0.6)',
                      borderRadius: '8px',
                      padding: '10px',
                      fontSize: '0.78rem',
                      textAlign: 'left',
                      color: '#94a3b8',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                    }}
                  >
                    <div>
                      Diterima Oleh:{' '}
                      <strong style={{ color: '#f8fafc' }}>{order.receive_info.receivedBy || '-'}</strong>
                    </div>
                    <div>
                      Waktu Terima:{' '}
                      <strong style={{ color: '#f8fafc' }}>
                        {order.receive_info.receivedAt
                          ? new Date(order.receive_info.receivedAt).toLocaleString('id-ID', {
                              dateStyle: 'full',
                              timeStyle: 'short',
                            })
                          : '-'}
                      </strong>
                    </div>
                    {order.receive_info.notes && (
                      <div>
                        Catatan:{' '}
                        <span style={{ color: '#e2e8f0', fontStyle: 'italic' }}>
                          "{order.receive_info.notes}"
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* KONDISI 2: JIKA MASIH PERLU DIKONFIRMASI TERIMA */}
            {order.status !== 'received' && (
              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {errorMsg && (
                  <div
                    style={{
                      padding: '10px 12px',
                      borderRadius: '8px',
                      background: 'rgba(239, 68, 68, 0.15)',
                      border: '1px solid rgba(239, 68, 68, 0.3)',
                      color: '#fca5a5',
                      fontSize: '0.8rem',
                    }}
                  >
                    ⚠️ {errorMsg}
                  </div>
                )}

                {successMsg && (
                  <div
                    style={{
                      padding: '10px 12px',
                      borderRadius: '8px',
                      background: 'rgba(16, 185, 129, 0.2)',
                      border: '1px solid rgba(16, 185, 129, 0.4)',
                      color: '#a7f3d0',
                      fontSize: '0.84rem',
                      textAlign: 'center',
                    }}
                  >
                    ✅ {successMsg}
                  </div>
                )}

                {/* FORM INPUT PENERIMA */}
                <div>
                  <label
                    htmlFor="recipient-name"
                    style={{ display: 'block', fontSize: '0.8rem', color: '#cbd5e1', fontWeight: 600, marginBottom: '5px' }}
                  >
                    Nama Lengkap Penerima di Sekolah *
                  </label>
                  <input
                    id="recipient-name"
                    type="text"
                    required
                    placeholder="Contoh: Bpk. Budi Santoso"
                    value={recipientName}
                    onChange={e => setRecipientName(e.target.value)}
                    style={{
                      width: '100%',
                      background: 'rgba(15, 23, 42, 0.7)',
                      border: '1px solid rgba(71, 85, 105, 0.6)',
                      borderRadius: '8px',
                      color: '#f8fafc',
                      padding: '10px 12px',
                      fontSize: '0.88rem',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label
                      htmlFor="recipient-role"
                      style={{ display: 'block', fontSize: '0.8rem', color: '#cbd5e1', fontWeight: 600, marginBottom: '5px' }}
                    >
                      Bagian / Jabatan
                    </label>
                    <select
                      id="recipient-role"
                      value={recipientRole}
                      onChange={e => setRecipientRole(e.target.value)}
                      style={{
                        width: '100%',
                        background: '#f8fafc',
                        color: '#0f172a',
                        border: '1px solid #475569',
                        borderRadius: '8px',
                        padding: '10px 8px',
                        fontSize: '0.82rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        boxSizing: 'border-box',
                      }}
                    >
                      <option value="Staf TU">Staf TU / Admin</option>
                      <option value="Satpam">Petugas Satpam</option>
                      <option value="Sarpras">Petugas Sarpras</option>
                      <option value="Guru">Guru / Wali Kelas</option>
                      <option value="PIC Koperasi">PIC Koperasi Sekolah</option>
                      <option value="Lainnya">Lainnya</option>
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="school-pin"
                      style={{ display: 'block', fontSize: '0.8rem', color: '#cbd5e1', fontWeight: 600, marginBottom: '5px' }}
                    >
                      PIN Sekolah (4 Digit)
                    </label>
                    <input
                      id="school-pin"
                      type="text"
                      maxLength={6}
                      placeholder={defaultPinHint}
                      value={schoolPin}
                      onChange={e => setSchoolPin(e.target.value)}
                      style={{
                        width: '100%',
                        background: 'rgba(15, 23, 42, 0.7)',
                        border: '1px solid rgba(71, 85, 105, 0.6)',
                        borderRadius: '8px',
                        color: '#38bdf8',
                        padding: '10px 12px',
                        fontSize: '0.9rem',
                        fontWeight: 700,
                        letterSpacing: '2px',
                        textAlign: 'center',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>
                </div>

                <div style={{ fontSize: '0.74rem', color: '#94a3b8', lineHeight: 1.3 }}>
                  ℹ️ <strong>Kode Keamanan:</strong> PIN bawaan sekolah Anda adalah <strong>{defaultPinHint}</strong> (dapat disesuaikan di Koperasi).
                </div>

                <div>
                  <label
                    htmlFor="receive-notes"
                    style={{ display: 'block', fontSize: '0.8rem', color: '#cbd5e1', fontWeight: 600, marginBottom: '5px' }}
                  >
                    Catatan Kondisi Barang (Opsional)
                  </label>
                  <textarea
                    id="receive-notes"
                    rows={2}
                    placeholder="Contoh: Diterima 3 dus utuh di pos satpam depan"
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    style={{
                      width: '100%',
                      background: 'rgba(15, 23, 42, 0.7)',
                      border: '1px solid rgba(71, 85, 105, 0.6)',
                      borderRadius: '8px',
                      color: '#f8fafc',
                      padding: '8px 10px',
                      fontSize: '0.82rem',
                      resize: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '8px',
                    padding: '8px 10px',
                    borderRadius: '8px',
                    background: 'rgba(15, 23, 42, 0.4)',
                    border: '1px solid rgba(71, 85, 105, 0.3)',
                  }}
                >
                  <input
                    id="chk-verified"
                    type="checkbox"
                    checked={isChecked}
                    onChange={e => setIsChecked(e.target.checked)}
                    style={{ marginTop: '3px', cursor: 'pointer' }}
                  />
                  <label htmlFor="chk-verified" style={{ fontSize: '0.77rem', color: '#cbd5e1', cursor: 'pointer', lineHeight: 1.35 }}>
                    Saya menyatakan fisik barang dan surat jalan telah diperiksa dan diterima di sekolah.
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    borderRadius: '10px',
                    border: 'none',
                    background: submitting
                      ? '#475569'
                      : 'linear-gradient(135deg, #10b981, #059669)',
                    color: '#ffffff',
                    fontSize: '0.92rem',
                    fontWeight: 700,
                    cursor: submitting ? 'not-allowed' : 'pointer',
                    boxShadow: '0 4px 12px rgba(16, 185, 129, 0.35)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                  }}
                >
                  {submitting ? 'Menyimpan Konfirmasi...' : '✅ Konfirmasi Barang Selesai Diterima'}
                </button>
              </form>
            )}
          </div>
        )}
      </div>

      <div style={{ marginTop: '20px', fontSize: '0.74rem', color: '#64748b', textAlign: 'center' }}>
        Sistem Koperasi Terpadu &bull; AKSARA PENABUR &copy; 2026
      </div>
    </div>
  );
};

export default TerimaBarangPage;
