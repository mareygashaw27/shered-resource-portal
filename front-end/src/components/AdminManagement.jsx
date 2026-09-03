import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { Plus, Wrench, Shield, Check, X, AlertCircle, Users, Layers, UserPlus, Edit, Trash2, Eye, MapPin, Clock, CheckCircle2, ExternalLink, Link as LinkIcon, Image as ImageIcon } from 'lucide-react';
import { getResourceImage, getDefaultResourceImage, normalizeImageUrl } from '../utils/imageUtils';
import { API_BASE_URL } from '../config';


export default function AdminManagement() {
  const { user, loggedInUser, usersList, register, registerByAdmin, fetchUsers } = useAuth();
  const { t, lang } = useLanguage();

  const [activeTab, setActiveTab] = useState('resources'); // 'resources' | 'users'
  const [resources, setResources] = useState([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingResource, setEditingResource] = useState(null);
  const [selectedDetailResource, setSelectedDetailResource] = useState(null);
  const [showBlockModal, setShowBlockModal] = useState(null);

  // New Resource Form State
  const [name, setName] = useState('');
  const [type, setType] = useState('meeting_room');
  const [category, setCategory] = useState('Meeting Rooms');
  const [capacity, setCapacity] = useState(10);
  const [imageUrl, setImageUrl] = useState('');
  const [requiresApproval, setRequiresApproval] = useState(true);
  const [requiresCheckin, setRequiresCheckin] = useState(true);

  // Convert and compress file to lightweight base64 data URL
  const handleImageFile = (file, setter) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = document.createElement('img');
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        const MAX_SIZE = 800;
        if (width > height) {
          if (width > MAX_SIZE) {
            height = Math.round((height * MAX_SIZE) / width);
            width = MAX_SIZE;
          }
        } else {
          if (height > MAX_SIZE) {
            width = Math.round((width * MAX_SIZE) / height);
            height = MAX_SIZE;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.85);
        setter(compressedDataUrl);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  };

  // Block Maintenance Form State
  const [blockStart, setBlockStart] = useState('');
  const [blockEnd, setBlockEnd] = useState('');
  const [blockReason, setBlockReason] = useState('');

  // User Registration Form State (Super Admin Only)
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regShowPassword, setRegShowPassword] = useState(false);
  const [editShowPassword, setEditShowPassword] = useState(false);
  const [regRole, setRegRole] = useState('staff');
  const [regDept, setRegDept] = useState('IT Department');
  const [userMsg, setUserMsg] = useState({ type: '', text: '' });
  const [resourceMsg, setResourceMsg] = useState({ type: '', text: '' });
  const [regSubmitting, setRegSubmitting] = useState(false);

  const isSuperAdmin = (loggedInUser?.role === 'super_admin') || (user?.role === 'super_admin');

  const formatUserRole = (u) => {
    if (!u) return '';
    if (u.role === 'department_head') {
      const dept = (u.department || '').toLowerCase();
      if (dept.includes('conference')) {
        return lang === 'am' ? 'የክፍል ኃላፊ — Conference Halls' : 'Dept Head — Conference Halls';
      }
      if (dept.includes('training') || dept.includes('lab')) {
        return lang === 'am' ? 'የክፍል ኃላፊ — Training Labs' : 'Dept Head — Training Labs';
      }
      if (dept.includes('vehicle') || dept.includes('fleet')) {
        return lang === 'am' ? 'የክፍል ኃላፊ — Vehicles' : 'Dept Head — Vehicles';
      }
      if (dept.includes('equipment')) {
        return lang === 'am' ? 'የክፍል ኃላፊ — Equipment' : 'Dept Head — Equipment';
      }
      if (dept.includes('meeting') || dept.includes('room')) {
        return lang === 'am' ? 'የክፍል ኃላፊ — Meeting Rooms' : 'Dept Head — Meeting Rooms';
      }
      return lang === 'am' ? `የክፍል ኃላፊ (${u.department})` : `Dept Head — ${u.department}`;
    }
    return t(u.role);
  };


  useEffect(() => {
    fetchResources();
    fetchUsers();
  }, [user]);

  const fetchResources = async () => {
    try {
      const token = sessionStorage.getItem('shered_res_token');
      const res = await fetch(`${API_BASE_URL}/api/resources`, {
        headers: {
          'Authorization': token ? `Bearer ${token}` : '',
          'x-simulated-user-id': loggedInUser?.id || user?.id || '1',
          'x-simulated-role': loggedInUser?.role || user?.role || 'super_admin',
          'x-simulated-dept': loggedInUser?.department || user?.department || 'Executive Office'
        }
      });
      if (res.ok) {
        const data = await res.json();
        setResources(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateResource = async (e) => {
    e.preventDefault();
    setResourceMsg({ type: '', text: '' });
    const payload = {
      name, type, category, capacity: parseInt(capacity),
      requires_approval: requiresApproval, requires_checkin: requiresCheckin,
      image_url: normalizeImageUrl(imageUrl) || null
    };
    try {
      const token = sessionStorage.getItem('shered_res_token');
      const res = await fetch(`${API_BASE_URL}/api/resources`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token ? `Bearer ${token}` : '',
          'x-simulated-user-id': loggedInUser?.id || user?.id || '1',
          'x-simulated-role': loggedInUser?.role || user?.role || 'super_admin'
        },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        setShowAddModal(false);
        setName(''); setType('meeting_room'); setCategory('Meeting Rooms');
        setCapacity(10); setImageUrl('');
        fetchResources();
        setResourceMsg({ type: 'success', text: `Resource "${name}" created successfully!` });
      } else {
        const err = await res.json();
        setResourceMsg({ type: 'error', text: err.error || 'Failed to create resource.' });
      }
    } catch (err) {
      // Offline fallback — add to local state directly
      const offlineResource = {
        id: Date.now(),
        resource_uuid: 'local-' + Date.now(),
        name, type, category,
        capacity: parseInt(capacity),
        requires_approval: requiresApproval,
        requires_checkin: requiresCheckin,
        image_url: imageUrl.trim() || null
      };
      setShowAddModal(false);
      setName(''); setType('meeting_room'); setCategory('Meeting Rooms');
      setCapacity(10); setImageUrl('');
      setResourceMsg({ type: 'error', text: 'Connection error. Please ensure the server is running.' });
    }
  };

  const handleScheduleBlock = async (e) => {
    e.preventDefault();
    try {
      const token = sessionStorage.getItem('shered_res_token');
      const res = await fetch(`${API_BASE_URL}/api/resources/${showBlockModal}/block`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token ? `Bearer ${token}` : '',
          'x-simulated-user-id': loggedInUser?.id || user?.id || '1',
          'x-simulated-role': loggedInUser?.role || user?.role || 'super_admin'
        },
        body: JSON.stringify({
          startTime: blockStart,
          endTime: blockEnd,
          reason: blockReason
        })
      });

      if (res.ok) {
        setShowBlockModal(null);
        fetchResources();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const openEditModal = (r) => {
    setEditingResource({
      ...r,
      featuresText: Array.isArray(r.features) ? r.features.join(', ') : ''
    });
  };

  const handleUpdateResource = async (e) => {
    e.preventDefault();
    setResourceMsg({ type: '', text: '' });
    try {
      const token = sessionStorage.getItem('shered_res_token');
      const res = await fetch(`${API_BASE_URL}/api/resources/${editingResource.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token ? `Bearer ${token}` : '',
          'x-simulated-user-id': loggedInUser?.id || user?.id || '1',
          'x-simulated-role': loggedInUser?.role || user?.role || 'super_admin'
        },
        body: JSON.stringify({
          name: editingResource.name,
          type: editingResource.type,
          category: editingResource.category,
          capacity: parseInt(editingResource.capacity),
          location: editingResource.location || '',
          operating_hours_start: editingResource.operating_hours_start || '08:00',
          operating_hours_end: editingResource.operating_hours_end || '18:00',
          department_restriction: editingResource.department_restriction || null,
          requires_approval: editingResource.requires_approval ? 1 : 0,
          requires_checkin: editingResource.requires_checkin ? 1 : 0,
          image_url: normalizeImageUrl(editingResource.image_url) || null
        })
      });

      if (res.ok) {
        setEditingResource(null);
        if (selectedDetailResource?.id === editingResource.id) {
          setSelectedDetailResource(null);
        }
        fetchResources();
        setResourceMsg({ type: 'success', text: `Resource updated successfully!` });
      } else {
        const err = await res.json();
        setResourceMsg({ type: 'error', text: err.error || 'Failed to update resource.' });
      }
    } catch (err) {
      setResourceMsg({ type: 'error', text: 'Failed to update resource.' });
    }
  };

  const handleDeleteResource = async (id, rName) => {
    if (!window.confirm(`Are you sure you want to delete resource "${rName}"?`)) return;
    try {
      const token = sessionStorage.getItem('shered_res_token');
      const res = await fetch(`${API_BASE_URL}/api/resources/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': token ? `Bearer ${token}` : '',
          'x-simulated-user-id': loggedInUser?.id || user?.id || '1',
          'x-simulated-role': loggedInUser?.role || user?.role || 'super_admin'
        }
      });
      if (res.ok) {
        fetchResources();
        setResourceMsg({ type: 'success', text: `Resource "${rName}" deleted.` });
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleRegisterUser = async (e) => {
    e.preventDefault();
    setUserMsg({ type: '', text: '' });

    // Validate Google/Gmail account format
    const cleanEmail = (regEmail || '').trim().toLowerCase();
    const gmailRegex = /^[a-zA-Z0-9._%+-]+@gmail\.com$/i;
    if (!gmailRegex.test(cleanEmail)) {
      setUserMsg({
        type: 'error',
        text: lang === 'am'
          ? 'እባክዎን ትክክለኛ የጉግል (Google/Gmail) ኢሜይል አድራሻ (@gmail.com) ብቻ ያስገቡ!'
          : 'Please enter a valid Google/Gmail address (@gmail.com)!'
      });
      return;
    }

    // Validate password (8+ chars, letters, numbers, symbols)
    const pwd = (regPassword || '').trim();
    const missing = [];
    if (pwd.length < 8) {
      missing.push(lang === 'am' ? 'ቢያንስ 8 ፊደላት/ቁምፊዎች' : 'at least 8 characters');
    }
    if (!/[a-zA-Z]/.test(pwd)) {
      missing.push(lang === 'am' ? 'ፊደል' : 'at least one letter');
    }
    if (!/[0-9]/.test(pwd)) {
      missing.push(lang === 'am' ? 'ቁጥር' : 'at least one number');
    }
    if (!/[^a-zA-Z0-9]/.test(pwd)) {
      missing.push(lang === 'am' ? 'ልዩ ምልክት / Symbol (@, #, $, !)' : 'at least one special symbol (@, #, $, !)');
    }

    if (missing.length > 0) {
      const errorText = lang === 'am'
        ? `የይለፍ ቃል መስፈርት አልተሟላም፦ ${missing.join('፣ ')} ጎድሏል!`
        : `Password requirements not met. Missing: ${missing.join(', ')}!`;
      setUserMsg({ type: 'error', text: errorText });
      return;
    }

    setRegSubmitting(true);

    const res = await registerByAdmin({
      name: regName,
      email: cleanEmail,
      password: pwd,
      role: regRole,
      department: regDept
    });

    setRegSubmitting(false);

    if (res.success) {
      setUserMsg({ type: 'success', text: res.message || t('userRegisteredSuccess') });
      setRegName('');
      setRegEmail('');
      setRegPassword('');
      setRegRole('staff');
      setRegDept('IT Department');
      setShowAddUserModal(false);
      fetchUsers();
    } else {
      setUserMsg({ type: 'error', text: res.error || 'Failed to register user' });
    }
  };

  const [editingUser, setEditingUser] = useState(null);

  const handleDeleteUser = async (userId, userName) => {
    const targetUser = usersList.find(u => u.id === userId);
    if (targetUser && (targetUser.role === 'super_admin' || targetUser.email?.toLowerCase().includes('mareygashaw21@gmail.com'))) {
      setUserMsg({
        type: 'error',
        text: lang === 'am' ? 'የአድሚን (Super Admin) አካውንት ሊሰረዝ አይችልም፤ ማስተካከል (Edit) ብቻ ነው የሚቻለው።' : 'Admin accounts cannot be deleted. You can only edit them.'
      });
      return;
    }
    if (!window.confirm(`Are you sure you want to delete user "${userName}"?`)) return;
    try {
      const token = sessionStorage.getItem('shered_res_token');
      const res = await fetch(`${API_BASE_URL}/api/auth/users/${userId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': token ? `Bearer ${token}` : '',
          'x-simulated-user-id': loggedInUser?.id || user?.id || '1',
          'x-simulated-role': loggedInUser?.role || user?.role || 'super_admin'
        }
      });
      const data = await res.json();
      if (res.ok) {
        setUserMsg({ type: 'success', text: data.message || 'User deleted successfully' });
        fetchUsers();
      } else {
        setUserMsg({ type: 'error', text: data.error || 'Failed to delete user' });
      }
    } catch (err) {
      setUserMsg({ type: 'error', text: 'Failed to delete user' });
    }
  };

  const handleUpdateUser = async (e) => {
    e.preventDefault();
    if (!editingUser) return;
    setUserMsg({ type: '', text: '' });

    // Validate Google/Gmail account format
    const cleanEmail = (editingUser.email || '').trim().toLowerCase();
    const gmailRegex = /^[a-zA-Z0-9._%+-]+@gmail\.com$/i;
    if (!gmailRegex.test(cleanEmail)) {
      setUserMsg({
        type: 'error',
        text: lang === 'am'
          ? 'እባክዎን ትክክለኛ የጉግል (Google/Gmail) ኢሜይል አድራሻ (@gmail.com) ብቻ ያስገቡ!'
          : 'Please enter a valid Google/Gmail address (@gmail.com)!'
      });
      return;
    }

    if (editingUser.password && editingUser.password.trim() !== '') {
      const pwd = editingUser.password.trim();
      const missing = [];
      if (pwd.length < 8) {
        missing.push(lang === 'am' ? 'ቢያንስ 8 ፊደላት/ቁምፊዎች' : 'at least 8 characters');
      }
      if (!/[a-zA-Z]/.test(pwd)) {
        missing.push(lang === 'am' ? 'ፊደል' : 'at least one letter');
      }
      if (!/[0-9]/.test(pwd)) {
        missing.push(lang === 'am' ? 'ቁጥር' : 'at least one number');
      }
      if (!/[^a-zA-Z0-9]/.test(pwd)) {
        missing.push(lang === 'am' ? 'ልዩ ምልክት / Symbol (@, #, $, !)' : 'at least one special symbol (@, #, $, !)');
      }

      if (missing.length > 0) {
        const errorText = lang === 'am'
          ? `የይለፍ ቃል መስፈርት አልተሟላም፦ ${missing.join('፣ ')} ጎድሏል!`
          : `Password requirements not met. Missing: ${missing.join(', ')}!`;
        setUserMsg({ type: 'error', text: errorText });
        return;
      }
    }

    try {
      const token = sessionStorage.getItem('shered_res_token');
      const res = await fetch(`${API_BASE_URL}/api/auth/users/${editingUser.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token ? `Bearer ${token}` : '',
          'x-simulated-user-id': loggedInUser?.id || user?.id || '1',
          'x-simulated-role': loggedInUser?.role || user?.role || 'super_admin'
        },
        body: JSON.stringify({
          name: editingUser.name,
          email: cleanEmail,
          password: editingUser.password || '',
          role: editingUser.role,
          department: editingUser.department
        })
      });
      let data = {};
      try {
        data = await res.json();
      } catch (jsonErr) {
        // Response is not JSON
      }

      if (res.ok) {
        setUserMsg({ type: 'success', text: data.message || 'User updated successfully' });
        setEditingUser(null);
        fetchUsers();
      } else {
        setUserMsg({ type: 'error', text: data.error || `Server returned error status ${res.status}` });
      }
    } catch (err) {
      setUserMsg({ type: 'error', text: `Failed to update user: ${err.message}` });
    }
  };

  return (
    <div>
      {/* Top Header & Sub-tab navigation */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700 }}>{t('adminTitle')}</h2>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>{t('adminDesc')}</p>
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          {activeTab === 'resources' && (
            <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
              <Plus size={16} /> {t('addNewResource')}
            </button>
          )}

          {activeTab === 'users' && isSuperAdmin && (
            <button className="btn btn-primary" style={{ background: '#10b981' }} onClick={() => setShowAddUserModal(true)}>
              <UserPlus size={16} /> {t('registerNewUserBtn')}
            </button>
          )}
        </div>
      </div>

      {/* Sub Tab Navigation Bar */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, borderBottom: '1px solid var(--border-color)', paddingBottom: 10 }}>
        <button
          className={`btn ${activeTab === 'resources' ? 'btn-primary' : 'btn-secondary'}`}
          style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}
          onClick={() => setActiveTab('resources')}
        >
          <Layers size={15} /> {t('resourceManagementTab')}
        </button>

        {isSuperAdmin && (
          <button
            className={`btn ${activeTab === 'users' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}
            onClick={() => setActiveTab('users')}
          >
            <Users size={15} /> {t('userManagement')}
          </button>
        )}
      </div>

      {userMsg.text && (
        <div style={{
          padding: 12, borderRadius: 6, marginBottom: 16, fontSize: 13,
          background: userMsg.type === 'success' ? '#f0fdf4' : '#fef2f2',
          color: userMsg.type === 'success' ? '#166534' : '#991b1b',
          border: `1px solid ${userMsg.type === 'success' ? '#bbf7d0' : '#fecaca'}`
        }}>
          {userMsg.text}
        </div>
      )}

      {resourceMsg.text && (
        <div style={{
          padding: 12, borderRadius: 6, marginBottom: 16, fontSize: 13,
          background: resourceMsg.type === 'success' ? '#f0fdf4' : '#fef2f2',
          color: resourceMsg.type === 'success' ? '#166534' : '#991b1b',
          border: `1px solid ${resourceMsg.type === 'success' ? '#bbf7d0' : '#fecaca'}`
        }}>
          {resourceMsg.text}
        </div>
      )}

      {/* TAB 1: Resource Management */}
      {activeTab === 'resources' && (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('idHeader')}</th>
                <th>{t('resourceName')}</th>
                <th>{t('typeHeader')}</th>
                <th>{t('category')}</th>
                <th>{t('capacity')}</th>
                <th>{t('locationHeader')}</th>
                <th>{t('approvalReqHeader')}</th>
                <th>{t('actionsHeader')}</th>
              </tr>
            </thead>
            <tbody>
              {resources.map((r) => (
                <tr key={r.id} style={{ cursor: 'pointer' }} onClick={() => setSelectedDetailResource(r)}>
                  <td style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--primary)' }}>{r.resource_uuid}</td>
                  <td style={{ fontWeight: 600 }}>
                    <span style={{ textDecoration: 'underline', textUnderlineOffset: 3 }}>{r.name}</span>
                  </td>
                  <td style={{ textTransform: 'capitalize' }}>{r.type}</td>
                  <td>{r.category}</td>
                  <td>{r.capacity}</td>
                  <td>{r.location || '-'}</td>
                  <td>
                    <span className={`badge ${r.requires_approval ? 'badge-pending' : 'badge-available'}`}>
                      {r.requires_approval ? 'YES' : 'NO'}
                    </span>
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        className="btn btn-secondary"
                        style={{ fontSize: 11, padding: '4px 8px', color: 'var(--primary)' }}
                        onClick={() => setSelectedDetailResource(r)}
                        title={t('viewDetails')}
                      >
                        <Eye size={12} /> {t('viewDetails')}
                      </button>

                      <button
                        className="btn btn-secondary"
                        style={{ fontSize: 11, padding: '4px 8px' }}
                        onClick={() => openEditModal(r)}
                        title="Edit Resource"
                      >
                        <Edit size={12} /> Edit
                      </button>

                      <button
                        className="btn btn-secondary"
                        style={{ fontSize: 11, padding: '4px 8px' }}
                        onClick={() => setShowBlockModal(r.id)}
                        title="Maintenance Block"
                      >
                        <Wrench size={12} /> Block
                      </button>

                      <button
                        className="btn btn-secondary"
                        style={{ fontSize: 11, padding: '4px 8px', color: 'var(--danger)' }}
                        onClick={() => handleDeleteResource(r.id, r.name)}
                        title="Delete Resource"
                      >
                        <Trash2 size={12} /> Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 2: User Registration & Accounts (Super Admin) */}
      {activeTab === 'users' && isSuperAdmin && (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>{t('fullName')}</th>
                <th>{t('email')}</th>
                <th>{t('roleLabel')}</th>
                <th>{t('password')}</th>
                <th>{t('actionsHeader')}</th>
              </tr>
            </thead>
            <tbody>
              {usersList.map((u) => (
                <tr key={u.id}>
                  <td style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--primary)' }}>#{u.id}</td>
                  <td style={{ fontWeight: 600 }}>{u.name}</td>
                  <td>{u.email}</td>
                  <td>
                    <span className="badge badge-available" style={{ background: 'var(--primary-light)', color: 'var(--primary)', fontWeight: 600 }}>
                      {formatUserRole(u)}
                    </span>
                  </td>
                  <td>
                    <span style={{ fontFamily: 'monospace', letterSpacing: 2, color: 'var(--text-main)', fontWeight: 600 }}>
                      {u.password ? u.password : '••••••••'}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        className="btn btn-secondary"
                        style={{ fontSize: 11, padding: '4px 8px' }}
                        onClick={() => setEditingUser({ ...u })}
                      >
                        <Edit size={12} /> Edit
                      </button>
                      {u.role !== 'super_admin' && !u.email?.toLowerCase().includes('mareygashaw21@gmail.com') && (
                        <button
                          className="btn btn-secondary"
                          style={{ fontSize: 11, padding: '4px 8px', color: 'var(--danger)' }}
                          onClick={() => handleDeleteUser(u.id, u.name)}
                        >
                          <Trash2 size={12} /> Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Resource Modal */}
      {showAddModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <div className="modal-title">{t('createResourceTitle')}</div>
              <button className="btn btn-secondary" style={{ padding: 4 }} onClick={() => setShowAddModal(false)}><X size={18} /></button>
            </div>
            <form onSubmit={handleCreateResource}>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>{t('resourceName')}</label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} required style={{ width: '100%' }} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>{t('resourceType')}</label>
                  <select value={type} onChange={(e) => {
                    const newType = e.target.value;
                    setType(newType);
                    if (newType === 'meeting_room') setCategory('Meeting Rooms');
                    else if (newType === 'conference_hall') setCategory('Conference Halls');
                    else if (newType === 'training_lab') setCategory('Training Labs');
                    else if (newType === 'vehicle') setCategory('Vehicles');
                    else if (newType === 'equipment') setCategory('Equipment');
                  }} style={{ width: '100%' }}>
                    <option value="meeting_room">{t('meetingRooms')}</option>
                    <option value="conference_hall">{t('conferenceHalls')}</option>
                    <option value="training_lab">{t('trainingLabs')}</option>
                    <option value="vehicle">{t('fleetVehicles')}</option>
                    <option value="equipment">{t('equipment')}</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>
                    {lang === 'am' ? 'ምድብ' : 'Category'}
                  </label>
                  <select value={category} onChange={(e) => setCategory(e.target.value)} style={{ width: '100%' }}>
                    <option value="Meeting Rooms">{lang === 'am' ? 'የስብሰባ ክፍሎች' : 'Meeting Rooms'}</option>
                    <option value="Conference Halls">{lang === 'am' ? 'የኮንፈረንስ አዳራሾች' : 'Conference Halls'}</option>
                    <option value="Training Labs">{lang === 'am' ? 'የስልጠና ላብራቶሪዎች' : 'Training Labs'}</option>
                    <option value="Vehicles">{lang === 'am' ? 'ተሽከርካሪዎች' : 'Vehicles'}</option>
                    <option value="Equipment">{lang === 'am' ? 'መሳሪያዎች' : 'Equipment'}</option>
                  </select>
                </div>
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>{t('capacity')}</label>
                <input type="number" min={1} value={capacity} onChange={(e) => setCapacity(e.target.value)} required style={{ width: '100%' }} />
              </div>

              {/* Image: URL input + file picker */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>
                  {lang === 'am' ? 'ምስል (URL ወይም ከፋይል)' : 'Image (URL or File)'}
                </label>

                {imageUrl && imageUrl.startsWith('data:') ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid #10b981', borderRadius: 6 }}>
                    <span style={{ fontSize: 13, color: '#10b981', fontWeight: 600, flex: 1 }}>
                      📁 {lang === 'am' ? 'የተመረጠ ምስል ፋይል' : 'Uploaded Image File Ready'}
                    </span>
                    <button
                      type="button"
                      onClick={() => setImageUrl('')}
                      style={{ background: '#ef4444', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 8px', fontSize: 11, cursor: 'pointer' }}
                    >
                      {lang === 'am' ? 'ሰርዝ' : 'Remove'}
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input
                      type="text"
                      value={imageUrl || ''}
                      onChange={(e) => setImageUrl(e.target.value)}
                      placeholder="https://example.com/image.jpg"
                      style={{ flex: 1 }}
                    />
                    <label
                      title="ፋይል ምረጥ"
                      style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '8px 14px', borderRadius: 6, cursor: 'pointer', whiteSpace: 'nowrap',
                        background: 'var(--primary)', color: '#fff', fontSize: 12, fontWeight: 600,
                        border: 'none'
                      }}
                    >
                      📁 {lang === 'am' ? 'ፋይል' : 'Browse'}
                      <input
                        type="file"
                        accept="image/*"
                        style={{ display: 'none' }}
                        onChange={(e) => {
                          if (e.target.files && e.target.files[0]) {
                            handleImageFile(e.target.files[0], setImageUrl);
                          }
                        }}
                      />
                    </label>
                  </div>
                )}

                {/* Live Preview */}
                {imageUrl && (
                  <div style={{ marginTop: 10, position: 'relative', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border-color)' }}>
                    <img
                      src={imageUrl} alt="preview"
                      style={{ width: '100%', height: 130, objectFit: 'cover', display: 'block' }}
                      onError={(e) => { e.target.style.display = 'none'; }}
                    />
                    {!imageUrl.startsWith('data:') && (
                      <button type="button" onClick={() => setImageUrl('')}
                        style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', borderRadius: '50%', width: 24, height: 24, cursor: 'pointer', fontSize: 12 }}
                        title="Remove image"
                      >✕</button>
                    )}
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: 20, marginBottom: 20 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                  <input type="checkbox" checked={requiresApproval} onChange={(e) => setRequiresApproval(e.target.checked)} />
                  {t('requiresApprovalCheck')}
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                  <input type="checkbox" checked={requiresCheckin} onChange={(e) => setRequiresCheckin(e.target.checked)} />
                  {t('requiresCheckinCheck')}
                </label>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowAddModal(false)}>{t('cancel')}</button>
                <button type="submit" className="btn btn-primary">{t('createResourceBtn')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Block Maintenance Modal */}
      {showBlockModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: 460 }}>
            <div className="modal-header">
              <div className="modal-title">{t('scheduleMaintenanceBlock')}</div>
              <button className="btn btn-secondary" style={{ padding: 4 }} onClick={() => setShowBlockModal(null)}><X size={18} /></button>
            </div>
            <form onSubmit={handleScheduleBlock}>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>{t('blockStartLabel')}</label>
                <input type="datetime-local" value={blockStart} onChange={(e) => setBlockStart(e.target.value)} required style={{ width: '100%' }} />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>{t('blockEndLabel')}</label>
                <input type="datetime-local" value={blockEnd} onChange={(e) => setBlockEnd(e.target.value)} required style={{ width: '100%' }} />
              </div>
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>{t('blockReasonLabel')}</label>
                <input type="text" value={blockReason} onChange={(e) => setBlockReason(e.target.value)} placeholder="e.g. Renovation / Vehicle Servicing" required style={{ width: '100%' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowBlockModal(null)}>{t('cancel')}</button>
                <button type="submit" className="btn btn-primary">{t('scheduleBlockBtn')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Super Admin User Registration Modal */}
      {showAddUserModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: 500 }}>
            <div className="modal-header">
              <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Shield size={18} style={{ color: '#2563eb' }} />
                {t('registerNewUserBtn')}
              </div>
              <button className="btn btn-secondary" style={{ padding: 4 }} onClick={() => { setShowAddUserModal(false); setUserMsg({ type: '', text: '' }); }}><X size={18} /></button>
            </div>

            <form onSubmit={handleRegisterUser}>
              {/* Full Name */}
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 5 }}>{t('fullName')}</label>
                <input
                  type="text"
                  value={regName}
                  onChange={(e) => setRegName(e.target.value)}
                  placeholder="e.g. Abebe Kebede"
                  required
                  style={{ width: '100%' }}
                />
              </div>

              {/* Email */}
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 5 }}>{t('email')}</label>
                <input
                  type="email"
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                  placeholder="e.g. user@gmail.com"
                  required
                  style={{ width: '100%' }}
                />
              </div>

              {/* Password */}
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 5 }}>
                  {t('password')} *
                </label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    type={regShowPassword ? 'text' : 'password'}
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    placeholder={lang === 'am' ? 'የይለፍ ቃል ያስገቡ...' : 'Set user password...'}
                    required
                    style={{ flex: 1 }}
                  />
                  <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#64748b', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    <input type="checkbox" checked={regShowPassword} onChange={(e) => setRegShowPassword(e.target.checked)} style={{ width: 14, height: 14 }} />
                    {t('showPassword')}
                  </label>
                </div>
              </div>

              {/* Role */}
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 5 }}>{t('roleLabel')}</label>
                <select 
                  value={regRole === 'department_head' ? `department_head|${regDept}` : regRole} 
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val.startsWith('department_head|')) {
                      const [, d] = val.split('|');
                      setRegRole('department_head');
                      setRegDept(d);
                    } else {
                      let d = 'IT Department';
                      if (val === 'super_admin') d = 'Executive Office';
                      if (val === 'resource_manager') d = 'Operations';
                      if (val === 'auditor') d = 'Internal Audit';
                      setRegRole(val);
                      setRegDept(d);
                    }
                  }} 
                  style={{ width: '100%' }}
                >
                  <option value="super_admin">{t('super_admin')}</option>
                  <option value="resource_manager">{t('resource_manager')}</option>
                  <option value="department_head|Meeting Rooms Department">Dept Head — Meeting Rooms</option>
                  <option value="department_head|Conference Halls Department">Dept Head — Conference Halls</option>
                  <option value="department_head|Training Labs Department">Dept Head — Training Labs</option>
                  <option value="department_head|Vehicles Department">Dept Head — Vehicles</option>
                  <option value="department_head|Equipment Department">Dept Head — Equipment</option>
                  <option value="staff">{t('staff')}</option>
                  <option value="auditor">{t('auditor')}</option>
                </select>
              </div>

              {/* In-modal feedback */}
              {userMsg.text && (
                <div style={{
                  padding: '8px 12px', borderRadius: 6, marginBottom: 14, fontSize: 12,
                  background: userMsg.type === 'success' ? '#f0fdf4' : '#fef2f2',
                  color: userMsg.type === 'success' ? '#166534' : '#991b1b',
                  border: `1px solid ${userMsg.type === 'success' ? '#bbf7d0' : '#fecaca'}`
                }}>
                  {userMsg.text}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
                <button type="button" className="btn btn-secondary" onClick={() => { setShowAddUserModal(false); setUserMsg({ type: '', text: '' }); }}>{t('cancel')}</button>
                <button type="submit" className="btn btn-primary" disabled={regSubmitting} style={{ background: '#10b981', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <UserPlus size={15} />
                  {regSubmitting ? t('registering') : t('registerNewUserBtn')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit User & Department Modal */}
      {editingUser && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: 480 }}>
            <div className="modal-header">
              <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Edit size={18} style={{ color: 'var(--primary)' }} />
                <span>{lang === 'am' ? 'ተጠቃሚ እና ዲፓርትመንት አስተካክል' : 'Edit User & Department'}</span>
              </div>
              <button className="btn btn-secondary" style={{ padding: 4 }} onClick={() => setEditingUser(null)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleUpdateUser}>
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 5 }}>
                  {t('fullName')}
                </label>
                <input
                  type="text"
                  value={editingUser.name}
                  onChange={(e) => setEditingUser({ ...editingUser, name: e.target.value })}
                  required
                  style={{ width: '100%' }}
                />
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 5 }}>
                  {t('email')}
                </label>
                <input
                  type="email"
                  value={editingUser.email}
                  onChange={(e) => setEditingUser({ ...editingUser, email: e.target.value })}
                  required
                  style={{ width: '100%' }}
                />
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 5 }}>
                  {t('password')}
                </label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    type={editShowPassword ? 'text' : 'password'}
                    value={editingUser.password || ''}
                    onChange={(e) => setEditingUser({ ...editingUser, password: e.target.value })}
                    placeholder={lang === 'am' ? 'የይለፍ ቃል ቀይር...' : 'Change / set password...'}
                    style={{ flex: 1 }}
                  />
                  <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#64748b', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    <input type="checkbox" checked={editShowPassword} onChange={(e) => setEditShowPassword(e.target.checked)} style={{ width: 14, height: 14 }} />
                    {t('showPassword')}
                  </label>
                </div>
              </div>

              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 5 }}>
                  {t('roleLabel')}
                </label>
                <select
                  value={editingUser.role === 'department_head' ? `department_head|${editingUser.department}` : editingUser.role}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val.startsWith('department_head|')) {
                      const [, d] = val.split('|');
                      setEditingUser({ ...editingUser, role: 'department_head', department: d });
                    } else {
                      let d = editingUser.department || 'IT Department';
                      if (val === 'super_admin') d = 'Executive Office';
                      if (val === 'resource_manager') d = 'Operations';
                      if (val === 'auditor') d = 'Internal Audit';
                      if (val === 'staff' && !d) d = 'IT Department';
                      setEditingUser({ ...editingUser, role: val, department: d });
                    }
                  }}
                  style={{ width: '100%' }}
                >
                  <option value="super_admin">{t('super_admin')}</option>
                  <option value="resource_manager">{t('resource_manager')}</option>
                  <option value="department_head|Meeting Rooms Department">Dept Head — Meeting Rooms</option>
                  <option value="department_head|Conference Halls Department">Dept Head — Conference Halls</option>
                  <option value="department_head|Training Labs Department">Dept Head — Training Labs</option>
                  <option value="department_head|Vehicles Department">Dept Head — Vehicles</option>
                  <option value="department_head|Equipment Department">Dept Head — Equipment</option>
                  <option value="staff">{t('staff')}</option>
                  <option value="auditor">{t('auditor')}</option>
                </select>
              </div>

              {/* In-modal feedback */}
              {userMsg.text && (
                <div style={{
                  padding: '8px 12px', borderRadius: 6, marginBottom: 14, fontSize: 12,
                  background: userMsg.type === 'success' ? '#f0fdf4' : '#fef2f2',
                  color: userMsg.type === 'success' ? '#166534' : '#991b1b',
                  border: `1px solid ${userMsg.type === 'success' ? '#bbf7d0' : '#fecaca'}`
                }}>
                  {userMsg.text}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
                <button type="button" className="btn btn-secondary" onClick={() => { setEditingUser(null); setUserMsg({ type: '', text: '' }); }}>
                  {t('cancel')}
                </button>
                <button type="submit" className="btn btn-primary">
                  {lang === 'am' ? 'ለወጥ አስቀምጥ' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Resource Modal */}
      {editingResource && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <div className="modal-title">Edit Resource: {editingResource.name}</div>
              <button className="btn btn-secondary" style={{ padding: 4 }} onClick={() => setEditingResource(null)}><X size={18} /></button>
            </div>
            <form onSubmit={handleUpdateResource}>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>{t('resourceName')}</label>
                <input
                  type="text"
                  value={editingResource.name || ''}
                  onChange={(e) => setEditingResource({ ...editingResource, name: e.target.value })}
                  required
                  style={{ width: '100%' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>{t('resourceType')}</label>
                  <select
                    value={editingResource.type || 'meeting_room'}
                    onChange={(e) => {
                      const newType = e.target.value;
                      let newCat = editingResource.category;
                      if (newType === 'meeting_room') newCat = 'Meeting Rooms';
                      else if (newType === 'conference_hall') newCat = 'Conference Halls';
                      else if (newType === 'training_lab') newCat = 'Training Labs';
                      else if (newType === 'vehicle') newCat = 'Vehicles';
                      else if (newType === 'equipment') newCat = 'Equipment';
                      setEditingResource({ ...editingResource, type: newType, category: newCat });
                    }}
                    style={{ width: '100%' }}
                  >
                    <option value="meeting_room">{t('meetingRooms')}</option>
                    <option value="conference_hall">{t('conferenceHalls')}</option>
                    <option value="training_lab">{t('trainingLabs')}</option>
                    <option value="vehicle">{t('fleetVehicles')}</option>
                    <option value="equipment">{t('equipment')}</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>
                    {lang === 'am' ? 'ምድብ' : 'Category'}
                  </label>
                  <select
                    value={editingResource.category || 'Meeting Rooms'}
                    onChange={(e) => setEditingResource({ ...editingResource, category: e.target.value })}
                    style={{ width: '100%' }}
                  >
                    <option value="Meeting Rooms">{lang === 'am' ? 'የስብሰባ ክፍሎች' : 'Meeting Rooms'}</option>
                    <option value="Conference Halls">{lang === 'am' ? 'የኮንፈረንስ አዳራሾች' : 'Conference Halls'}</option>
                    <option value="Training Labs">{lang === 'am' ? 'የስልጠና ላብራቶሪዎች' : 'Training Labs'}</option>
                    <option value="Vehicles">{lang === 'am' ? 'ተሽከርካሪዎች' : 'Vehicles'}</option>
                    <option value="Equipment">{lang === 'am' ? 'መሳሪያዎች' : 'Equipment'}</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>{t('capacity')}</label>
                  <input
                    type="number"
                    min={1}
                    value={editingResource.capacity || 1}
                    onChange={(e) => setEditingResource({ ...editingResource, capacity: e.target.value })}
                    required
                    style={{ width: '100%' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>{t('locationHeader')}</label>
                  <input
                    type="text"
                    value={editingResource.location || ''}
                    onChange={(e) => setEditingResource({ ...editingResource, location: e.target.value })}
                    placeholder="e.g. Building A - Floor 3"
                    style={{ width: '100%' }}
                  />
                </div>
              </div>

              {/* Operating Hours */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>
                    {lang === 'am' ? 'የሥራ መጀመሪያ ሰዓት' : 'Operating Hours Start'}
                  </label>
                  <input
                    type="time"
                    value={editingResource.operating_hours_start || '08:00'}
                    onChange={(e) => setEditingResource({ ...editingResource, operating_hours_start: e.target.value })}
                    style={{ width: '100%' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>
                    {lang === 'am' ? 'የሥራ ማብቂያ ሰዓት' : 'Operating Hours End'}
                  </label>
                  <input
                    type="time"
                    value={editingResource.operating_hours_end || '18:00'}
                    onChange={(e) => setEditingResource({ ...editingResource, operating_hours_end: e.target.value })}
                    style={{ width: '100%' }}
                  />
                </div>
              </div>

              {/* Department Restriction */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>
                  {lang === 'am' ? 'የክፍል ገደብ (ከተፈለገ ብቻ)' : 'Department Restriction (Optional)'}
                </label>
                <input
                  type="text"
                  value={editingResource.department_restriction || ''}
                  onChange={(e) => setEditingResource({ ...editingResource, department_restriction: e.target.value })}
                  placeholder="e.g. IT Department (Leave empty for public access)"
                  style={{ width: '100%' }}
                />
              </div>

              <div style={{ display: 'flex', gap: 20, marginBottom: 20 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                  <input
                    type="checkbox"
                    checked={!!editingResource.requires_approval}
                    onChange={(e) => setEditingResource({ ...editingResource, requires_approval: e.target.checked })}
                  />
                  {t('requiresApprovalCheck')}
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                  <input
                    type="checkbox"
                    checked={!!editingResource.requires_checkin}
                    onChange={(e) => setEditingResource({ ...editingResource, requires_checkin: e.target.checked })}
                  />
                  {t('requiresCheckinCheck')}
                </label>
              </div>

              {/* Image: URL input + file picker */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>
                  {lang === 'am' ? 'ምስል (URL ወይም ከፋይል)' : 'Image (URL or File)'}
                </label>

                {editingResource.image_url && editingResource.image_url.startsWith('data:') ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid #10b981', borderRadius: 6 }}>
                    <span style={{ fontSize: 13, color: '#10b981', fontWeight: 600, flex: 1 }}>
                      📁 {lang === 'am' ? 'የተመረጠ ምስል ፋይል' : 'Uploaded Image File Ready'}
                    </span>
                    <button
                      type="button"
                      onClick={() => setEditingResource({ ...editingResource, image_url: '' })}
                      style={{ background: '#ef4444', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 8px', fontSize: 11, cursor: 'pointer' }}
                    >
                      {lang === 'am' ? 'ሰርዝ' : 'Remove'}
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input
                      type="text"
                      value={editingResource.image_url || ''}
                      onChange={(e) => setEditingResource({ ...editingResource, image_url: e.target.value })}
                      placeholder="https://example.com/image.jpg"
                      style={{ flex: 1 }}
                    />
                    <label
                      title="ፋይል ምረጥ"
                      style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '8px 14px', borderRadius: 6, cursor: 'pointer', whiteSpace: 'nowrap',
                        background: 'var(--primary)', color: '#fff', fontSize: 12, fontWeight: 600,
                        border: 'none'
                      }}
                    >
                      📁 {lang === 'am' ? 'ፋይል' : 'Browse'}
                      <input
                        type="file"
                        accept="image/*"
                        style={{ display: 'none' }}
                        onChange={(e) => {
                          if (e.target.files && e.target.files[0]) {
                            handleImageFile(e.target.files[0], (v) => setEditingResource({ ...editingResource, image_url: v }));
                          }
                        }}
                      />
                    </label>
                  </div>
                )}

                {/* Live Preview */}
                {editingResource.image_url && (
                  <div style={{ marginTop: 10, position: 'relative', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border-color)' }}>
                    <img
                      src={editingResource.image_url} alt="preview"
                      style={{ width: '100%', height: 140, objectFit: 'cover', display: 'block' }}
                      onError={(e) => { e.target.style.display = 'none'; }}
                    />
                    {!editingResource.image_url.startsWith('data:') && (
                      <button type="button"
                        onClick={() => setEditingResource({ ...editingResource, image_url: '' })}
                        style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', borderRadius: '50%', width: 24, height: 24, cursor: 'pointer', fontSize: 12 }}
                        title="Remove image"
                      >✕</button>
                    )}
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setEditingResource(null)}>{t('cancel')}</button>
                <button type="submit" className="btn btn-primary">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Resource Detail Modal */}
      {selectedDetailResource && (
        <div className="modal-overlay" onClick={() => setSelectedDetailResource(null)}>
          <div
            className="modal-content"
            style={{ maxWidth: 640, maxHeight: '90vh', overflowY: 'auto' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div>
                  <div className="modal-title" style={{ fontSize: 18, display: 'flex', alignItems: 'center', gap: 8 }}>
                    {selectedDetailResource.name}
                    <span className="badge badge-available" style={{ fontSize: 12, padding: '2px 8px' }}>
                      {selectedDetailResource.resource_uuid}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                    {t('resourceDetailsTitle')}
                  </div>
                </div>
              </div>
              <button
                className="btn btn-secondary"
                style={{ padding: 4 }}
                onClick={() => setSelectedDetailResource(null)}
              >
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div>
              {/* Image / Header Banner */}
              <div style={{ marginBottom: 18, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border-color)', maxHeight: 240, position: 'relative' }}>
                <img
                  src={getResourceImage(selectedDetailResource)}
                  alt={selectedDetailResource.name}
                  referrerPolicy="no-referrer"
                  style={{ width: '100%', height: 220, objectFit: 'cover', display: 'block' }}
                  onError={(e) => {
                    e.target.src = getDefaultResourceImage(selectedDetailResource.type, selectedDetailResource.category);
                  }}
                />
                {selectedDetailResource.current_status === 'available' && (
                  <span style={{
                    position: 'absolute', top: 12, right: 12, fontSize: 11, fontWeight: 700,
                    padding: '5px 12px', borderRadius: '20px',
                    background: 'linear-gradient(135deg, #059669, #10b981)', color: '#ffffff',
                    border: '1px solid rgba(255, 255, 255, 0.3)', boxShadow: '0 4px 12px rgba(16, 185, 129, 0.4)',
                    backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', gap: 6, zIndex: 3
                  }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#ffffff', boxShadow: '0 0 6px #fff' }}></span>
                    {lang === 'am' ? 'ክፍት (Available)' : 'Available'}
                  </span>
                )}
                {selectedDetailResource.current_status === 'in_use' && (
                  <span style={{
                    position: 'absolute', top: 12, right: 12, fontSize: 11, fontWeight: 700,
                    padding: '5px 12px', borderRadius: '20px',
                    background: 'linear-gradient(135deg, #dc2626, #ef4444)', color: '#ffffff',
                    border: '1px solid rgba(255, 255, 255, 0.3)', boxShadow: '0 4px 12px rgba(239, 68, 68, 0.4)',
                    backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', gap: 6, zIndex: 3
                  }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#ffffff', boxShadow: '0 0 6px #fff' }}></span>
                    {lang === 'am' ? 'ተይዟል (Booked)' : 'Booked'}
                  </span>
                )}
                {selectedDetailResource.current_status === 'pending' && (
                  <span style={{
                    position: 'absolute', top: 12, right: 12, fontSize: 11, fontWeight: 700,
                    padding: '5px 12px', borderRadius: '20px',
                    background: 'linear-gradient(135deg, #d97706, #f59e0b)', color: '#ffffff',
                    border: '1px solid rgba(255, 255, 255, 0.3)', boxShadow: '0 4px 12px rgba(245, 158, 11, 0.4)',
                    backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', gap: 6, zIndex: 3
                  }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#ffffff', boxShadow: '0 0 6px #fff' }}></span>
                    {lang === 'am' ? 'ማጽደቅ የሚጠብቅ' : 'Pending Approval'}
                  </span>
                )}
                {selectedDetailResource.current_status === 'maintenance' && (
                  <span style={{
                    position: 'absolute', top: 12, right: 12, fontSize: 11, fontWeight: 700,
                    padding: '5px 12px', borderRadius: '20px',
                    background: 'linear-gradient(135deg, #475569, #64748b)', color: '#ffffff',
                    border: '1px solid rgba(255, 255, 255, 0.3)', boxShadow: '0 4px 12px rgba(100, 116, 139, 0.4)',
                    backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', gap: 6, zIndex: 3
                  }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#ffffff', boxShadow: '0 0 6px #fff' }}></span>
                    {lang === 'am' ? 'ጥገና ላይ' : 'Maintenance'}
                  </span>
                )}
              </div>

              {/* Attributes Grid */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                gap: 12,
                marginBottom: 18
              }}>


                <div style={{ background: 'var(--bg-main)', padding: '10px 14px', borderRadius: 6, border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>{t('capacity')}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Users size={14} style={{ color: 'var(--primary)' }} />
                    {selectedDetailResource.capacity} {lang === 'am' ? 'ሰዎች' : 'people'}
                  </div>
                </div>

                <div style={{ background: 'var(--bg-main)', padding: '10px 14px', borderRadius: 6, border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>{t('locationHeader')}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <MapPin size={14} style={{ color: 'var(--primary)' }} />
                    {selectedDetailResource.location || '-'}
                  </div>
                </div>



                <div style={{ background: 'var(--bg-main)', padding: '10px 14px', borderRadius: 6, border: '1px solid var(--border-color)', gridColumn: 'span 2' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <LinkIcon size={13} style={{ color: 'var(--primary)' }} />
                    <strong>{lang === 'am' ? 'የምስል ሊንክ / አድራሻ (Image URL):' : 'Image URL / Source:'}</strong>
                  </div>
                  {selectedDetailResource.image_url ? (
                    selectedDetailResource.image_url.startsWith('data:image') ? (
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span className="badge badge-available">📁 {lang === 'am' ? 'ከኮምፒውተር የተጫነ ፋይል (Base64 File)' : 'Uploaded File (Base64 Data)'}</span>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, wordBreak: 'break-all' }}>
                        <a
                          href={selectedDetailResource.image_url}
                          target="_blank"
                          rel="noreferrer"
                          style={{ fontSize: 12, color: 'var(--primary)', textDecoration: 'underline', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                        >
                          {selectedDetailResource.image_url}
                          <ExternalLink size={12} />
                        </a>
                      </div>
                    )
                  ) : (
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                      {lang === 'am' ? 'ምንም ምስል አልተሰጠም (ባዶ)' : 'No Image URL provided (Default icon used)'}
                    </div>
                  )}
                </div>
              </div>

              {/* Department Restriction or Features if present */}
              {selectedDetailResource.department_restriction && (
                <div style={{
                  padding: '10px 14px',
                  borderRadius: 6,
                  background: 'rgba(59, 130, 246, 0.1)',
                  border: '1px solid rgba(59, 130, 246, 0.3)',
                  marginBottom: 18,
                  fontSize: 12,
                  color: 'var(--primary)'
                }}>
                  🔒 <strong>{lang === 'am' ? 'የክፍል ገደብ' : 'Department Restricted'}:</strong> {selectedDetailResource.department_restriction}
                </div>
              )}

              {/* Features Tags */}
              {Array.isArray(selectedDetailResource.features) && selectedDetailResource.features.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8 }}>
                    {lang === 'am' ? 'መለዋወጫዎች እና ዝርዝር ነገሮች' : 'Features & Amenities'}:
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {selectedDetailResource.features.map((f, i) => (
                      <span key={i} className="feature-tag">{f}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Action Buttons: Edit, Block, Delete, Close */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderTop: '1px solid var(--border-color)',
                paddingTop: 16,
                marginTop: 8
              }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: 6 }}
                  onClick={() => {
                    const r = selectedDetailResource;
                    setSelectedDetailResource(null);
                    handleDeleteResource(r.id, r.name);
                  }}
                >
                  <Trash2 size={15} />
                  {t('deleteResource')}
                </button>

                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                    onClick={() => {
                      const rId = selectedDetailResource.id;
                      setSelectedDetailResource(null);
                      setShowBlockModal(rId);
                    }}
                  >
                    <Wrench size={14} />
                    {t('scheduleMaintenanceBlock')}
                  </button>

                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                    onClick={() => {
                      const r = selectedDetailResource;
                      setSelectedDetailResource(null);
                      openEditModal(r);
                    }}
                  >
                    <Edit size={14} />
                    {t('editResource')}
                  </button>

                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setSelectedDetailResource(null)}
                  >
                    {t('cancel')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
