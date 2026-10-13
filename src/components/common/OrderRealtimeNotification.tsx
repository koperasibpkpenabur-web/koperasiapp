import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { playOrderNotificationSound } from '../../utils/sound';
import './OrderRealtimeNotification.css';

interface OrderToast {
  id: string;
  orderId: string;
  schoolName: string;
  timestamp: number;
}

const OrderRealtimeNotification = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [toasts, setToasts] = useState<OrderToast[]>([]);
  const latestOrderIdRef = useRef<string | null>(null);
  const lastProcessedIdRef = useRef<string | null>(null);
  const isInitialFetchRef = useRef<boolean>(true);

  const handleIncomingOrder = useCallback((order: { id: string; school_name?: string }) => {
    if (!order || !order.id) return;

    // Deduplicate: Don't process the exact same order twice
    if (lastProcessedIdRef.current === order.id) {
      return;
    }
    lastProcessedIdRef.current = order.id;
    latestOrderIdRef.current = order.id;

    // Check setting (default is ON/true)
    const notifSetting = localStorage.getItem('kopkar_order_notif_enabled');
    const isEnabled = notifSetting === null ? true : notifSetting === 'true';

    // 1. Dispatch custom event so active pages (KopkarPesanan, KopkarDashboard) always auto-refresh
    window.dispatchEvent(
      new CustomEvent('new-order-received', { detail: order })
    );

    // 2. Play sound & show floating toast when ON
    if (isEnabled) {
      console.log('🔔 Memproses notifikasi pesanan baru (Status: ON):', order);
      playOrderNotificationSound();

      const toastId = `${order.id}-${Date.now()}`;
      setToasts((prev) => [
        {
          id: toastId,
          orderId: order.id,
          schoolName: order.school_name || 'Sekolah',
          timestamp: Date.now(),
        },
        ...prev.slice(0, 3), // Keep max 4 toasts
      ]);
    } else {
      console.log('🔕 Notifikasi suara & toast dimatikan (Status: OFF). Data tetap diperbarui:', order);
    }
  }, []);

  const checkForNewOrders = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('id, school_name, created_at')
        .order('created_at', { ascending: false })
        .limit(1);

      if (error || !data || data.length === 0) return;

      const latest = data[0];

      if (isInitialFetchRef.current) {
        // On initial mount, just store the latest existing order ID so we don't ring on page load
        isInitialFetchRef.current = false;
        latestOrderIdRef.current = latest.id;
        lastProcessedIdRef.current = latest.id;
        return;
      }

      // If a newer order is detected
      if (latest.id !== latestOrderIdRef.current && latest.id !== lastProcessedIdRef.current) {
        console.log('⚡ Polling mendeteksi pesanan baru:', latest.id);
        handleIncomingOrder(latest);
      }
    } catch (err) {
      console.warn('Gagal cek pesanan baru:', err);
    }
  }, [handleIncomingOrder]);

  useEffect(() => {
    // Only subscribe for Kopkar and Admin users
    if (!user || (user.role !== 'kopkar' && user.role !== 'admin')) {
      return;
    }

    // Reset initial state
    isInitialFetchRef.current = true;
    checkForNewOrders();

    // 1. Realtime Broadcast Channel (Client-to-Client WebSockets)
    const broadcastChannel = supabase
      .channel('order_realtime_broadcast')
      .on('broadcast', { event: 'new_order' }, ({ payload }) => {
        console.log('⚡ Realtime Broadcast diterima:', payload);
        handleIncomingOrder(payload);
      })
      .subscribe();

    // 2. Postgres Changes Listener (Database Replication)
    const postgresChannel = supabase
      .channel('order_postgres_changes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'orders' },
        (payload) => {
          console.log('⚡ Postgres Changes diterima:', payload);
          handleIncomingOrder(payload.new as any);
        }
      )
      .subscribe();

    // 3. Fallback Polling every 4 seconds (Guaranteed 100% reliable)
    const pollInterval = setInterval(() => {
      checkForNewOrders();
    }, 4000);

    // 4. Instant check on tab focus or visibility change
    const handleFocus = () => {
      checkForNewOrders();
    };
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleFocus);

    return () => {
      supabase.removeChannel(broadcastChannel);
      supabase.removeChannel(postgresChannel);
      clearInterval(pollInterval);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleFocus);
    };
  }, [user, handleIncomingOrder, checkForNewOrders]);

  // Auto-dismiss toasts after 8 seconds
  useEffect(() => {
    if (toasts.length === 0) return;

    const timer = setInterval(() => {
      const now = Date.now();
      setToasts((prev) => prev.filter((t) => now - t.timestamp < 8000));
    }, 1000);

    return () => clearInterval(timer);
  }, [toasts]);

  const handleDismiss = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const handleViewOrder = (toast: OrderToast) => {
    handleDismiss(toast.id);
    navigate('/kopkar/pesanan');
  };

  if (toasts.length === 0) return null;

  return (
    <div className="order-realtime-toasts" role="region" aria-label="Notifikasi Pesanan">
      {toasts.map((t) => (
        <div key={t.id} className="order-realtime-toast">
          <div className="order-toast-icon-wrap" aria-hidden="true">
            🛒
          </div>
          <div className="order-toast-content">
            <h4 className="order-toast-title">
              Pesanan Baru Masuk!
              <span className="order-toast-badge">Baru</span>
            </h4>
            <p className="order-toast-desc">
              Dari: <strong>{t.schoolName}</strong>
              <br />
              <span style={{ fontSize: '0.8rem', color: '#64748b' }}>No: {t.orderId}</span>
            </p>
            <div className="order-toast-actions">
              <button
                className="order-toast-btn-view"
                onClick={() => handleViewOrder(t)}
              >
                Lihat Pesanan
              </button>
            </div>
          </div>
          <button
            className="order-toast-btn-dismiss"
            onClick={() => handleDismiss(t.id)}
            aria-label="Tutup notifikasi"
            title="Tutup"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
};

export default OrderRealtimeNotification;
