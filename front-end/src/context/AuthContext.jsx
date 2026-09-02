import React, { createContext, useState, useEffect, useContext } from 'react';
import { API_BASE_URL } from '../config';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  // sessionStorage: clears when browser closes (login page on fresh open)
  //                 persists on F5 refresh (stay logged in)
  const [token, setToken] = useState(() => sessionStorage.getItem('shered_res_token') || null);

  const cleanUserObj = (u) => {
    if (!u) return null;
    return { ...u, penalty_suspended_until: null, no_show_count: 0 };
  };

  // user: the currently VIEWED user (may be a role-preview user for super_admin)
  const [user, setUser] = useState(() => {
    const savedUser = sessionStorage.getItem('shered_res_user');
    return savedUser ? cleanUserObj(JSON.parse(savedUser)) : null;
  });

  // loggedInUser: the ACTUAL authenticated user — NEVER changes during role preview.
  const [loggedInUser, setLoggedInUser] = useState(() => {
    const savedAdmin = sessionStorage.getItem('shered_res_original_admin');
    if (savedAdmin) return cleanUserObj(JSON.parse(savedAdmin));
    const savedUser = sessionStorage.getItem('shered_res_user');
    return savedUser ? cleanUserObj(JSON.parse(savedUser)) : null;
  });

  const [usersList, setUsersList] = useState([]);
  const [loading, setLoading] = useState(true);

  // Derived: true when super_admin is previewing another role
  const isPreviewMode = !!(
    loggedInUser &&
    user &&
    loggedInUser.id !== user.id
  );

  // Fetch available users on mount
  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/users`);
      if (res.ok) {
        const data = await res.json();
        setUsersList(data);
      }
    } catch (err) {
      console.error('Failed to fetch users:', err);
    } finally {
      setLoading(false);
    }
  };

  const roleDefaults = {
    super_admin: { id: 1, name: 'Super Admin', email: 'admin@gmail.com', role: 'super_admin', department: 'Executive Office', no_show_count: 0, penalty_suspended_until: null },
    resource_manager: { id: 2, name: 'Resource Manager', email: 'manager@organization.org', role: 'resource_manager', department: 'Operations', no_show_count: 0, penalty_suspended_until: null },
    department_head: { id: 3, name: 'Department Head', email: 'head@organization.org', role: 'department_head', department: 'IT Department', no_show_count: 0, penalty_suspended_until: null },
    staff: { id: 4, name: 'Staff Member', email: 'staff@organization.org', role: 'staff', department: 'IT Department', no_show_count: 0, penalty_suspended_until: null },
    auditor: { id: 5, name: 'System Auditor', email: 'auditor@organization.org', role: 'auditor', department: 'Internal Audit', no_show_count: 0, penalty_suspended_until: null }
  };

  const login = async (email, password) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (res.ok) {
        setToken(data.token);
        setUser(data.user);
        setLoggedInUser(data.user);
        sessionStorage.setItem('shered_res_token', data.token);
        sessionStorage.setItem('shered_res_user', JSON.stringify(data.user));
        sessionStorage.removeItem('shered_res_original_admin');
        return { success: true };
      } else {
        return { success: false, error: data.error || 'Invalid email or password.' };
      }
    } catch (err) {
      console.error('Login error:', err);
      return { success: false, error: 'Connection error: Could not reach backend server.' };
    }
  };

  const register = async ({ name, email, role, department }) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, role, department })
      });
      if (res.ok) {
        const data = await res.json();
        setToken(data.token);
        setUser(data.user);
        setLoggedInUser(data.user);
        sessionStorage.setItem('shered_res_token', data.token);
        sessionStorage.setItem('shered_res_user', JSON.stringify(data.user));
        sessionStorage.removeItem('shered_res_original_admin');
        fetchUsers();
        return { success: true };
      } else {
        const errData = await res.json();
        return { success: false, error: errData.error };
      }
    } catch (err) {
      return { success: false, error: 'Connection error' };
    }
  };

  // Super Admin registers another user — does NOT overwrite the current session
  const registerByAdmin = async ({ name, email, password, role, department }, adminToken) => {
    const authToken = adminToken || token;
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/admin-register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({ name, email, password, role, department })
      });
      if (res.ok) {
        const data = await res.json();
        fetchUsers(); // refresh the user list
        return { success: true, user: data.user, message: data.message };
      } else {
        const errData = await res.json();
        return { success: false, error: errData.error };
      }
    } catch (err) {
      return { success: false, error: 'Connection error. Please ensure the server is running and try again.' };
    }
  };

  // switchRole: only super_admin can call this (role preview).
  // loggedInUser stays UNCHANGED — only `user` (the preview) changes.
  const switchRole = (role) => {
    // Only super_admin is allowed to switch roles
    if (loggedInUser?.role !== 'super_admin') return;

    // Switching back to own (super_admin) role — restore original view
    if (role === 'super_admin') {
      setUser(loggedInUser);
      sessionStorage.setItem('shered_res_user', JSON.stringify(loggedInUser));
      sessionStorage.removeItem('shered_res_original_admin');
      return;
    }

    // Save original admin to sessionStorage (for page refresh survival)
    sessionStorage.setItem('shered_res_original_admin', JSON.stringify(loggedInUser));

    // Find a matching user from usersList for the selected role, or simulate one
    const matchingUsers = usersList.filter(u => u.role === role);
    const matchingUser = matchingUsers[0] || null;
    const previewUser = matchingUser
      ? { ...matchingUser }
      : roleDefaults[role] || { ...loggedInUser, role };

    setUser(previewUser);
    sessionStorage.setItem('shered_res_user', JSON.stringify(previewUser));
  };

  const switchUser = (targetUser) => {
    if (loggedInUser?.role !== 'super_admin') return;
    if (targetUser.id === loggedInUser.id) {
      setUser(loggedInUser);
      sessionStorage.setItem('shered_res_user', JSON.stringify(loggedInUser));
      sessionStorage.removeItem('shered_res_original_admin');
      return;
    }
    sessionStorage.setItem('shered_res_original_admin', JSON.stringify(loggedInUser));
    setUser({ ...targetUser });
    sessionStorage.setItem('shered_res_user', JSON.stringify({ ...targetUser }));
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    setLoggedInUser(null);
    sessionStorage.removeItem('shered_res_token');
    sessionStorage.removeItem('shered_res_user');
    sessionStorage.removeItem('shered_res_original_admin');
  };

  const updateUser = (updatedUser) => {
    if (!updatedUser) return;
    setUser(updatedUser);
    setLoggedInUser(updatedUser);
    sessionStorage.setItem('shered_res_user', JSON.stringify(updatedUser));
    fetchUsers();
  };

  const updateProfile = async ({ name, email, password }) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/update-profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ name, email, password })
      });
      const data = await res.json();
      if (res.ok) {
        setUser(data.user);
        setLoggedInUser(data.user);
        sessionStorage.setItem('shered_res_user', JSON.stringify(data.user));
        fetchUsers();
        return { success: true, message: data.message, user: data.user };
      } else {
        return { success: false, error: data.error };
      }
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  const updateUserEmail = async (newEmail) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/update-email`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ email: newEmail })
      });
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
        setLoggedInUser(data.user);
        sessionStorage.setItem('shered_res_user', JSON.stringify(data.user));
        fetchUsers();
        return { success: true, message: data.message };
      } else {
        const errData = await res.json();
        return { success: false, error: errData.error };
      }
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  const sendTestEmail = async (targetEmail) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/test-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ email: targetEmail })
      });
      const data = await res.json();
      if (res.ok) {
        return { success: true, message: data.message, previewUrl: data.previewUrl };
      } else {
        return { success: false, error: data.error };
      }
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  return (
    <AuthContext.Provider value={{
      user,           // currently viewed user (may be preview)
      loggedInUser,   // actual authenticated user (never changes during preview)
      isPreviewMode,  // true when super_admin is previewing another role
      token, usersList, login, register, registerByAdmin,
      switchRole, switchUser, logout, loading, fetchUsers, updateUser, updateProfile, updateUserEmail, sendTestEmail
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
