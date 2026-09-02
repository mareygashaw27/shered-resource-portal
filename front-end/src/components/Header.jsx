import React, { useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { useLanguage } from '../context/LanguageContext';
import { useTheme } from '../context/ThemeContext';
import { Bell, User, Globe, Sun, Moon, Palette, ChevronDown, Check, Settings, LogOut, Mail, X, ShieldCheck, Camera, Trash2 } from 'lucide-react';
import { API_BASE_URL } from '../config';

export default function Header() {
  const { user, token, logout, updateUser, updateProfile } = useAuth();
  const { notifications, unreadCount, markAsRead, markAllAsRead, dismissNotification, clearAllNotifications } = useSocket();
  const { lang, toggleLanguage, t } = useLanguage();
  const { theme, setTheme } = useTheme();

  const [showNotifs, setShowNotifs] = useState(false);
  const [showThemeMenu, setShowThemeMenu] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  // Profile Settings state (Name, Email, Password)
  const [userName, setUserName] = useState(user?.name || '');
  const [userEmail, setUserEmail] = useState(user?.email || '');
  const [userPassword, setUserPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileStatus, setProfileStatus] = useState({ type: '', msg: '' });

  // Open settings modal and initialize fields
  const openSettings = () => {
    setUserName(user?.name || '');
    setUserEmail(user?.email || '');
    setUserPassword('');
    setShowNewPassword(false);
    setProfileStatus({ type: '', msg: '' });
    setShowProfileMenu(false);
    setShowSettingsModal(true);
  };

  // Profile Picture — stored in localStorage per user id
  const profilePicKey = user?.id ? `profile_pic_${user.id}` : null;
  const [profilePic, setProfilePic] = useState(() => {
    if (!user?.id) return null;
    return localStorage.getItem(`profile_pic_${user.id}`) || null;
  });
  const picInputRef = useRef(null);

  const handleProfilePicChange = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      // Compress via canvas
      const img = document.createElement('img');
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX = 300;
        let w = img.width, h = img.height;
        if (w > h) { if (w > MAX) { h = Math.round(h * MAX / w); w = MAX; } }
        else { if (h > MAX) { w = Math.round(w * MAX / h); h = MAX; } }
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
        setProfilePic(dataUrl);
        if (profilePicKey) localStorage.setItem(profilePicKey, dataUrl);
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }, [profilePicKey]);

  const handleRemoveProfilePic = () => {
    setProfilePic(null);
    if (profilePicKey) localStorage.removeItem(profilePicKey);
  };

  const themeOptions = [
    { key: 'light', labelEn: 'Light', labelAm: 'Light', icon: Sun },
    { key: 'grey', labelEn: 'Gray', labelAm: 'Gray', icon: Palette },
    { key: 'dark', labelEn: 'Dark', labelAm: 'Dark', icon: Moon },
  ];

  const currentThemeObj = themeOptions.find(t => t.key === theme) || themeOptions[2];
  const CurrentIcon = currentThemeObj.icon;

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

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setProfileStatus({ type: '', msg: '' });

    if (!userName || !userName.trim()) {
      setProfileStatus({ type: 'error', msg: lang === 'am' ? 'እባክዎን ትክክለኛ ሙሉ ስም ያስገቡ' : 'Please enter your full name.' });
      return;
    }

    const cleanEmail = (userEmail || '').trim().toLowerCase();
    const gmailRegex = /^[a-zA-Z0-9._%+-]+@gmail\.com$/i;
    if (!gmailRegex.test(cleanEmail)) {
      setProfileStatus({
        type: 'error',
        msg: lang === 'am'
          ? 'እባክዎን ትክክለኛ የጉግል (Google/Gmail) ኢሜይል አድራሻ (@gmail.com) ብቻ ያስገቡ!'
          : 'Please enter a valid Google/Gmail address (@gmail.com)!'
      });
      return;
    }

    // Validate password if user entered a new password
    if (userPassword && userPassword.trim() !== '') {
      const pwd = userPassword.trim();
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
        missing.push(lang === 'am' ? 'ልዩ ምልክት (@, #, $, !)' : 'at least one special symbol (@, #, $, !)');
      }

      if (missing.length > 0) {
        setProfileStatus({
          type: 'error',
          msg: lang === 'am'
            ? `የይለፍ ቃል መስፈርት አልተሟላም፦ ${missing.join('፣ ')} ጎድሏል!`
            : `Password requirements not met. Missing: ${missing.join(', ')}!`
        });
        return;
      }
    }

    setSavingProfile(true);

    try {
      const res = await updateProfile({
        name: userName.trim(),
        email: userEmail.trim(),
        password: userPassword.trim() || undefined
      });

      setSavingProfile(false);

      if (res.success) {
        setUserPassword('');
        setShowSettingsModal(false);
      } else {
        setProfileStatus({
          type: 'error',
          msg: res.error || (lang === 'am' ? 'መረጃውን ማዘመን አልተሳካም' : 'Failed to update profile')
        });
      }
    } catch (err) {
      setSavingProfile(false);
      setProfileStatus({ type: 'error', msg: err.message });
    }
  };

  const handleTestEmail = async () => {
    setEmailStatus({ type: 'info', msg: lang === 'am' ? 'የሙከራ ኢሜይል በመላክ ላይ...' : 'Sending test email...' });
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/test-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ email: userEmail })
      });
      const data = await res.json();
      if (res.ok) {
        setEmailStatus({
          type: 'success',
          msg: data.message,
          previewUrl: data.previewUrl
        });
      } else {
        setEmailStatus({ type: 'error', msg: data.error || 'Failed to send test email' });
      }
    } catch (err) {
      setEmailStatus({ type: 'error', msg: err.message });
    }
  };

  return (
    <>
      <header className="main-header">
        <div className="brand-section">
          <img 
            src="/logo.png" 
            alt="Wollo University Logo" 
            style={{ width: 40, height: 40, objectFit: 'contain', borderRadius: '50%', background: '#fff', padding: 2, boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }} 
          />
          <div>
            <div className="brand-title">{t('appName')}</div>
          </div>
        </div>

        <div className="user-profile-menu">
          {/* Theme Dropdown Switcher */}
          <div style={{ position: 'relative' }}>
            <button
              className="btn btn-secondary"
              onClick={() => {
                setShowThemeMenu(!showThemeMenu);
                setShowNotifs(false);
                setShowProfileMenu(false);
              }}
              title={t('themeTitle')}
              style={{ padding: '6px 12px', fontSize: 12, borderRadius: 'var(--radius-full)', display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <Palette size={14} style={{ color: 'var(--primary)' }} />
              <span>Theme</span>
              <ChevronDown size={12} style={{ color: 'var(--text-muted)', transform: showThemeMenu ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
            </button>

            {showThemeMenu && (
              <div
                style={{
                  position: 'absolute',
                  right: 0,
                  top: 40,
                  width: 160,
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-md)',
                  padding: 4,
                  boxShadow: 'var(--shadow-lg)',
                  zIndex: 200,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 2
                }}
              >
                {themeOptions.map((opt) => {
                  const Icon = opt.icon;
                  const isSelected = theme === opt.key;
                  return (
                    <button
                      key={opt.key}
                      onClick={() => {
                        setTheme(opt.key);
                        setShowThemeMenu(false);
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        width: '100%',
                        padding: '7px 10px',
                        fontSize: 12,
                        borderRadius: 'var(--radius-sm)',
                        background: isSelected ? 'var(--primary-light)' : 'transparent',
                        color: isSelected ? 'var(--primary)' : 'var(--text-main)',
                        fontWeight: isSelected ? 600 : 400,
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                      onMouseEnter={(e) => {
                        if (!isSelected) e.currentTarget.style.background = 'var(--bg-card-hover)';
                      }}
                      onMouseLeave={(e) => {
                        if (!isSelected) e.currentTarget.style.background = 'transparent';
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Icon size={14} style={{ color: isSelected ? 'var(--primary)' : 'var(--text-muted)' }} />
                        <span>{lang === 'am' ? opt.labelAm : opt.labelEn}</span>
                      </div>
                      {isSelected && <Check size={14} style={{ color: 'var(--primary)' }} />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Language Switcher Button */}
          <button
            className="btn btn-secondary"
            onClick={toggleLanguage}
            title={t('switchLanguage')}
            style={{ padding: '6px 12px', fontSize: 12, borderRadius: 'var(--radius-full)', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Globe size={14} style={{ color: 'var(--primary)' }} />
            <span>{lang === 'en' ? 'አማርኛ' : 'English'}</span>
          </button>

          {/* Notifications Dropdown */}
          <div style={{ position: 'relative' }}>
            <button
              className="btn btn-secondary"
              style={{ padding: '8px 12px', borderRadius: 'var(--radius-full)' }}
              onClick={() => {
                setShowNotifs(!showNotifs);
                setShowThemeMenu(false);
                setShowProfileMenu(false);
              }}
            >
              <Bell size={16} />
              {unreadCount > 0 && (
                <span style={{ background: 'var(--danger)', color: '#fff', fontSize: 10, padding: '2px 6px', borderRadius: 10, fontWeight: 700 }}>
                  {unreadCount}
                </span>
              )}
            </button>

            {showNotifs && (
              <div style={{
                position: 'absolute', right: 0, top: 44, width: 340, background: 'var(--bg-card)',
                border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '14px 16px',
                boxShadow: 'var(--shadow-lg)', zIndex: 200
              }}>
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, borderBottom: '1px solid var(--border-color)', paddingBottom: 10 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-main)' }}>
                    {lang === 'am' ? 'ማሳወቂያዎች' : 'Notifications'} ({notifications.length})
                  </div>
                  {notifications.length > 0 && (
                    <button
                      type="button"
                      onClick={clearAllNotifications}
                      style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                      onMouseEnter={(e) => e.currentTarget.style.color = 'var(--primary)'}
                      onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
                    >
                      {lang === 'am' ? 'አጽዳ' : 'Clear'}
                    </button>
                  )}
                </div>

                {/* Notification List */}
                {notifications.length === 0 ? (
                  <div style={{ fontSize: 12.5, color: 'var(--text-muted)', textAlign: 'center', padding: '16px 0' }}>
                    {t('noNotifications')}
                  </div>
                ) : (
                  <div style={{ maxHeight: 300, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10, paddingRight: 2 }}>
                    {notifications.map((n, idx) => (
                      <div
                        key={n.id || idx}
                        onClick={() => markAsRead(n.id)}
                        style={{
                          padding: '12px 14px',
                          borderRadius: 8,
                          background: n.read ? 'var(--bg-main)' : 'rgba(37, 99, 235, 0.06)',
                          border: n.read ? '1px solid var(--border-color)' : '1px solid rgba(37, 99, 235, 0.25)',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 6
                        }}
                      >
                        {/* Title & Close Row */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: 6 }}>
                            {!n.read && (
                              <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--primary)', display: 'inline-block', flexShrink: 0 }} />
                            )}
                            <span>{n.title}</span>
                          </div>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              dismissNotification(n.id);
                            }}
                            title={lang === 'am' ? 'አጥፋ' : 'Remove notification'}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: 'var(--text-muted)',
                              cursor: 'pointer',
                              fontSize: 16,
                              lineHeight: 1,
                              padding: '2px 4px',
                              opacity: 0.75,
                              transition: 'opacity 0.15s'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                            onMouseLeave={(e) => e.currentTarget.style.opacity = '0.75'}
                          >
                            ✕
                          </button>
                        </div>

                        {/* Message Body */}
                        <div style={{ fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.45 }}>
                          {n.message}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* User Profile Badge & Dropdown Trigger */}
          <div style={{ position: 'relative' }}>
            <div
              className="header-user-badge"
              onClick={() => {
                setShowProfileMenu(!showProfileMenu);
                setShowNotifs(false);
                setShowThemeMenu(false);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '4px 10px',
                borderRadius: 'var(--radius-full)',
                background: showProfileMenu ? 'var(--bg-card-hover)' : 'transparent',
                cursor: 'pointer',
                border: '1px solid var(--border-color)',
                transition: 'all 0.2s'
              }}
            >
              <div style={{ width: 36, height: 36, borderRadius: 'var(--radius-full)', background: 'linear-gradient(135deg, var(--primary), #4f46e5)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0, overflow: 'hidden', border: profilePic ? '2px solid var(--primary)' : 'none' }}>
                {profilePic
                  ? <img src={profilePic} alt="profile" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                  : <User size={16} />}
              </div>
              <div className="header-user-info">
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-main)', whiteSpace: 'nowrap' }}>{user?.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{formatUserRole(user)}</div>
              </div>
              <ChevronDown size={14} style={{ color: 'var(--text-muted)', transform: showProfileMenu ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
            </div>

            {/* Profile Dropdown Menu */}
            {showProfileMenu && (
              <div
                style={{
                  position: 'absolute',
                  right: 0,
                  top: 46,
                  width: 220,
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-md)',
                  padding: 8,
                  boxShadow: 'var(--shadow-lg)',
                  zIndex: 250,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4
                }}
              >
                {/* Header User Summary */}
                <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border-color)', marginBottom: 4 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-main)' }}>{user?.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--primary)', fontWeight: 600, marginTop: 2 }}>{formatUserRole(user)}</div>
                  {user?.email && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{user.email}</div>}
                </div>

                {/* Settings Option */}
                <button
                  onClick={openSettings}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    width: '100%',
                    padding: '9px 12px',
                    fontSize: 13,
                    fontWeight: 600,
                    borderRadius: 'var(--radius-sm)',
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-main)',
                    cursor: 'pointer',
                    transition: 'background 0.15s ease'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-card-hover)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  <Settings size={16} style={{ color: 'var(--primary)' }} />
                  <span>{lang === 'am' ? 'ሴቲንግ (Settings)' : 'Settings'}</span>
                </button>

                {/* Sign Out Option */}
                <button
                  onClick={() => {
                    setShowProfileMenu(false);
                    logout();
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    width: '100%',
                    padding: '9px 12px',
                    fontSize: 13,
                    fontWeight: 600,
                    borderRadius: 'var(--radius-sm)',
                    background: 'transparent',
                    border: 'none',
                    color: '#ef4444',
                    cursor: 'pointer',
                    transition: 'background 0.15s ease'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  <LogOut size={16} />
                  <span>{t('signOut')}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Settings Modal - Portaled to document.body so it floats 100% on top of all headers and scrolling */}
      {showSettingsModal && createPortal(
        <div
          className="modal-overlay"
          onClick={() => setShowSettingsModal(false)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(15, 23, 42, 0.85)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 999999,
            padding: '48px 16px 24px 16px',
            overflowY: 'auto'
          }}
        >
          <div
            className="modal-content"
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: 500,
              width: '100%',
              margin: 'auto',
              maxHeight: '84vh',
              overflowY: 'auto',
              position: 'relative',
              boxShadow: '0 25px 70px rgba(0, 0, 0, 0.7)',
              border: '1px solid var(--border-color)'
            }}
          >
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 'var(--radius-md)', background: 'var(--primary-light)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Settings size={20} />
                </div>
                <div>
                  <h3 className="modal-title" style={{ margin: 0 }}>
                    {lang === 'am' ? 'የተጠቃሚ ሴቲንግ' : 'Account & Settings'}
                  </h3>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {lang === 'am' ? 'የፕሮፋይል እና የኢሜይል ማሳወቂያ መረጃዎችን ያስተካክሉ' : 'Manage profile & email notification settings'}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowSettingsModal(false)}
                className="btn btn-secondary"
                title={lang === 'am' ? 'ዝጋ' : 'Close'}
                style={{ padding: 6, borderRadius: 'var(--radius-full)', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Profile Picture Upload Section */}
            <div style={{ background: 'var(--bg-main)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', padding: 16, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 18 }}>
              {/* Avatar display */}
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <div style={{
                  width: 80, height: 80, borderRadius: '50%',
                  background: 'linear-gradient(135deg, var(--primary), #4f46e5)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  overflow: 'hidden', border: '3px solid var(--primary)',
                  boxShadow: '0 4px 16px rgba(37,99,235,0.3)'
                }}>
                  {profilePic
                    ? <img src={profilePic} alt="profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <User size={34} color="#fff" />}
                </div>
                {/* Camera overlay button */}
                <label
                  htmlFor="profile-pic-upload"
                  title={lang === 'am' ? 'ፎቶ ቀይር' : 'Change photo'}
                  style={{
                    position: 'absolute', bottom: 0, right: 0,
                    width: 26, height: 26, borderRadius: '50%',
                    background: 'var(--primary)', color: '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', border: '2px solid var(--bg-card)',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
                    transition: 'background 0.2s'
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = '#1d4ed8'}
                  onMouseLeave={e => e.currentTarget.style.background = 'var(--primary)'}
                >
                  <Camera size={13} />
                </label>
                <input
                  id="profile-pic-upload"
                  ref={picInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={handleProfilePicChange}
                />
              </div>

              {/* User info + actions */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-main)', marginBottom: 2 }}>{user?.name}</div>
                <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--primary)', marginBottom: 4 }}>{formatUserRole(user)}</div>
                {user?.email && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.email}</div>}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <label
                    htmlFor="profile-pic-upload"
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      padding: '5px 12px', borderRadius: 6,
                      background: 'var(--primary)', color: '#fff',
                      fontSize: 11, fontWeight: 600, cursor: 'pointer',
                      border: 'none', transition: 'background 0.2s'
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = '#1d4ed8'}
                    onMouseLeave={e => e.currentTarget.style.background = 'var(--primary)'}
                  >
                    <Camera size={12} />
                    {lang === 'am' ? 'ፎቶ ምረጥ' : 'Upload Photo'}
                  </label>
                  {profilePic && (
                    <button
                      type="button"
                      onClick={handleRemoveProfilePic}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        padding: '5px 12px', borderRadius: 6,
                        background: 'transparent', color: '#ef4444',
                        fontSize: 11, fontWeight: 600, cursor: 'pointer',
                        border: '1px solid #ef4444', transition: 'background 0.2s'
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,0.08)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <Trash2 size={12} />
                      {lang === 'am' ? 'ፎቶ አጥፋ' : 'Remove'}
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Profile Settings Form (Name, Email, Password) */}
            <form onSubmit={handleSaveProfile}>
              {/* Full Name */}
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: 'var(--text-main)', marginBottom: 6 }}>
                  {lang === 'am' ? 'ህጋዊ ሙሉ ስም (Full Name)፡' : 'Full Name:'}
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    value={userName}
                    onChange={(e) => setUserName(e.target.value)}
                    placeholder="e.g. Abebe Kebede"
                    style={{
                      width: '100%',
                      height: 42,
                      padding: '0 12px 0 36px',
                      border: '1px solid var(--border-color)',
                      borderRadius: 'var(--radius-sm)',
                      background: 'var(--bg-card)',
                      color: 'var(--text-main)',
                      fontSize: 14,
                      outline: 'none'
                    }}
                    required
                  />
                  <User size={16} style={{ position: 'absolute', left: 12, top: 13, color: 'var(--text-muted)' }} />
                </div>
              </div>

              {/* Email Address */}
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: 'var(--text-main)', marginBottom: 6 }}>
                  {t('realEmailLabel') || (lang === 'am' ? 'የኖቲፊኬሽን ኢሜይል አድራሻ፡' : 'Notification Email Address:')}
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="email"
                    value={userEmail}
                    onChange={(e) => setUserEmail(e.target.value)}
                    placeholder="e.g. user@gmail.com"
                    style={{
                      width: '100%',
                      height: 42,
                      padding: '0 12px 0 36px',
                      border: '1px solid var(--border-color)',
                      borderRadius: 'var(--radius-sm)',
                      background: 'var(--bg-card)',
                      color: 'var(--text-main)',
                      fontSize: 14,
                      outline: 'none'
                    }}
                    required
                  />
                  <Mail size={16} style={{ position: 'absolute', left: 12, top: 13, color: 'var(--text-muted)' }} />
                </div>
              </div>

              {/* New Password */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: 'var(--text-main)', marginBottom: 6 }}>
                  {lang === 'am' ? 'አዲስ የይለፍ ቃል (New Password)፡' : 'New Password:'}
                </label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    value={userPassword}
                    onChange={(e) => setUserPassword(e.target.value)}
                    placeholder={lang === 'am' ? 'የቀደመው እንዳለ እንዲቆይ ባዶ ይተዉት / አዲስ የይለፍ ቃል...' : 'Leave empty to keep current password...'}
                    style={{
                      flex: 1,
                      height: 42,
                      padding: '0 12px',
                      border: '1px solid var(--border-color)',
                      borderRadius: 'var(--radius-sm)',
                      background: 'var(--bg-card)',
                      color: 'var(--text-main)',
                      fontSize: 14,
                      outline: 'none'
                    }}
                  />
                  <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--text-muted)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    <input
                      type="checkbox"
                      checked={showNewPassword}
                      onChange={(e) => setShowNewPassword(e.target.checked)}
                      style={{ width: 14, height: 14 }}
                    />
                    {t('showPassword') || (lang === 'am' ? 'አሳይ' : 'Show')}
                  </label>
                </div>
              </div>

              {/* Error Status Message */}
              {profileStatus.type === 'error' && profileStatus.msg && (
                <div style={{
                  padding: '10px 14px',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: 12.5,
                  fontWeight: 600,
                  marginBottom: 16,
                  background: 'var(--danger-light)',
                  color: 'var(--danger)',
                  border: '1px solid var(--danger)'
                }}>
                  {profileStatus.msg}
                </div>
              )}

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border-color)' }}>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={savingProfile}
                  style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  <Check size={14} />
                  <span>{savingProfile ? (lang === 'am' ? 'በማስቀመጥ ላይ...' : 'Saving...') : (lang === 'am' ? 'አስቀምጥ' : 'Save')}</span>
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}


