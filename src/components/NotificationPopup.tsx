import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import './NotificationPopup.css';

interface AppNotification {
  id: string;
  title: string;
  message: string;
  target_type: 'all' | 'level' | 'school';
  target_value: string | null;
  created_by: string;
  created_at: string;
}

const NotificationPopup = () => {
  const { user, isAuthenticated } = useAuth();
  const [activeNotification, setActiveNotification] = useState<AppNotification | null>(null);

  useEffect(() => {
    if (isAuthenticated && user?.role === 'sekolah') {
      checkNotifications();
    }
  }, [isAuthenticated, user]);

  const checkNotifications = async () => {
    if (!user) return;

    // Fetch all active notifications
    // Note: To prevent fetching too many, we can limit to recent 10.
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);

    if (data && data.length > 0) {
      // Get read history from local storage
      const readNotifs = JSON.parse(localStorage.getItem('read_notifications') || '[]');

      // Find the first unread notification that matches this user
      const unread = data.find((n: AppNotification) => {
        if (readNotifs.includes(n.id)) return false;

        // Check target matching
        if (n.target_type === 'all') return true;
        if (n.target_type === 'level' && n.target_value === user.schoolLevel) return true;
        if (n.target_type === 'school' && n.target_value === user.id) return true;

        return false;
      });

      if (unread) {
        setActiveNotification(unread);
      }
    }
  };

  const handleClose = () => {
    if (activeNotification) {
      const readNotifs = JSON.parse(localStorage.getItem('read_notifications') || '[]');
      readNotifs.push(activeNotification.id);
      localStorage.setItem('read_notifications', JSON.stringify(readNotifs));
      
      // Close and check if there are more unread notifications
      setActiveNotification(null);
      checkNotifications(); 
    }
  };

  if (!activeNotification) return null;

  return (
    <div className="notif-popup-overlay">
      <div className="notif-popup-card">
        <div className="notif-popup-header">
          <h3>📢 PENGUMUMAN</h3>
        </div>
        <div className="notif-popup-body">
          <h4 style={{ margin: '0 0 12px 0', fontSize: '1.2rem', color: '#1e293b' }}>{activeNotification.title}</h4>
          <p style={{ whiteSpace: 'pre-wrap', lineHeight: '1.6', color: '#334155', margin: 0 }}>
            {activeNotification.message}
          </p>
          <div style={{ marginTop: '24px', fontSize: '0.85rem', color: '#94a3b8', fontStyle: 'italic' }}>
            Dikirim oleh: {activeNotification.created_by} <br/>
            {new Date(activeNotification.created_at).toLocaleDateString('id-ID', {
              day: 'numeric', month: 'long', year: 'numeric'
            })}
          </div>
        </div>
        <div className="notif-popup-footer">
          <button className="btn-primary" onClick={handleClose} style={{ width: '100%', padding: '12px', fontSize: '1rem' }}>
            Saya Mengerti & Tutup
          </button>
        </div>
      </div>
    </div>
  );
};

export default NotificationPopup;
