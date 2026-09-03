import React, { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';
import { API_BASE_URL } from '../config';

const SocketContext = createContext();

export const SocketProvider = ({ children }) => {
  const { user, fetchUsers } = useAuth();
  const [socket, setSocket] = useState(null);
  const [notifications, setNotifications] = useState([]);

  // Load notifications specifically for the current logged-in user
  useEffect(() => {
    if (!user || !user.id) {
      setNotifications([]);
      return;
    }
    try {
      const saved = localStorage.getItem(`shered_res_notifs_${user.id}`);
      if (saved) {
        setNotifications(JSON.parse(saved));
      } else {
        setNotifications([]);
      }
    } catch (e) {
      setNotifications([]);
    }
  }, [user?.id]);

  // Persist notifications specifically for the current user
  useEffect(() => {
    if (user && user.id) {
      try {
        localStorage.setItem(`shered_res_notifs_${user.id}`, JSON.stringify(notifications));
      } catch (e) {}
    }
  }, [notifications, user?.id]);

  useEffect(() => {
    const newSocket = io(API_BASE_URL);
    setSocket(newSocket);

    newSocket.on('notification', (notif) => {
      const newNotif = {
        id: notif.id || Date.now() + Math.random(),
        read: false,
        ...notif
      };
      setNotifications(prev => [newNotif, ...prev]);
    });

    newSocket.on('user_updated', () => {
      if (fetchUsers) fetchUsers();
    });

    return () => newSocket.close();
  }, []);

  // Strict notification filtering:
  // - Super Admin ('super_admin') & Resource Manager ('resource_manager'): see ALL notifications
  // - ALL OTHER USERS: ONLY see notifications that belong strictly to them (their own bookings/actions)
  const filteredNotifications = notifications.filter(n => {
    if (!user) return false;
    const role = user.role;

    // Super Admin and Resource Manager see all notifications
    if (role === 'super_admin' || role === 'resource_manager') {
      return true;
    }

    // All other users ONLY see their own notifications
    const matchesUserId = n.userId && String(n.userId) === String(user.id);
    const matchesTargetUserId = n.targetUserId && String(n.targetUserId) === String(user.id);
    const matchesEmail = n.userEmail && user.email && String(n.userEmail).toLowerCase() === String(user.email).toLowerCase();

    return Boolean(matchesUserId || matchesTargetUserId || matchesEmail);
  });

  const unreadCount = filteredNotifications.filter(n => !n.read).length;

  const markAsRead = (id) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  };

  const markAllAsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  const dismissNotification = (id) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const clearAllNotifications = () => {
    setNotifications([]);
  };

  return (
    <SocketContext.Provider value={{
      socket,
      notifications: filteredNotifications,
      unreadCount,
      markAsRead,
      markAllAsRead,
      dismissNotification,
      clearAllNotifications
    }}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => useContext(SocketContext);


