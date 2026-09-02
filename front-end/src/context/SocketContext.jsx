import React, { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';
import { API_BASE_URL } from '../config';

const SocketContext = createContext();

export const SocketProvider = ({ children }) => {
  const { user, fetchUsers } = useAuth();
  const [socket, setSocket] = useState(null);
  const [notifications, setNotifications] = useState([]);

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

  // Filter notifications according to RBAC role requirements:
  // - Super Admin ('super_admin') & Resource Manager ('resource_manager'): see ALL notifications
  // - Other roles (staff, department_head, auditor): see ONLY notifications addressed to them
  const filteredNotifications = notifications.filter(n => {
    if (!user) return false;
    const role = user.role;
    // Resource Manager and Super Admin see all notifications
    if (role === 'super_admin' || role === 'resource_manager') {
      return true;
    }
    // Specific targeted user by userId
    if (n.userId && n.userId === user.id) {
      return true;
    }
    // Targeted by role
    if (n.forRoles && Array.isArray(n.forRoles) && n.forRoles.includes(role)) {
      // department_head: also match by department if specified
      if (role === 'department_head' && n.department) {
        return n.department === user.department;
      }
      return true;
    }
    // General broadcasts with no targeting: only admins/managers see these
    // (staff, dept_head, auditor do NOT see untagged broadcasts)
    return false;
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


