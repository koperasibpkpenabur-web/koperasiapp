import { useState, useEffect } from 'react';
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

  useEffect(() => {
    // Only subscribe for Kopkar and Admin users
    if (!user || (user.role !== 'kopkar' && user.role !== 'admin')) {
      return;
    }

    const channel = supabase
      .channel('public_orders_realtime_chime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'orders' },
        (payload) => {
          const newOrder = payload.new;

          // 1. Play "ting" sound
          playOrderNotificationSound();

          // 2. Dispatch event so active pages (e.g., KopkarPesanan) can auto-refresh
          window.dispatchEvent(
            new CustomEvent('new-order-received', { detail: newOrder })
          );

          // 3. Add to floating toasts
          const toastId = `${newOrder.id}-${Date.now()}`;
          setToasts((prev) => [
            {
              id: toastId,
              orderId: newOrder.id,
              schoolName: newOrder.school_name || 'Sekolah',
              timestamp: Date.now(),
            },
            ...prev.slice(0, 3), // Keep max 4 toasts
          ]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

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
