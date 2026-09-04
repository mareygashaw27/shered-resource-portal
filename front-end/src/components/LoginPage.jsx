import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { Shield, Globe, Monitor, QrCode, CalendarCheck, BarChart3, Lock, CheckCircle2, ArrowLeft, Mail, AlertCircle, KeyRound, Eye, EyeOff } from 'lucide-react';
import { API_BASE_URL } from '../config';

export default function LoginPage() {
  const { login } = useAuth();
  const { lang, toggleLanguage, t } = useLanguage();

  const [mode, setMode] = useState('login'); // 'login' | 'forgot'
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Forgot password states
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSuccess, setForgotSuccess] = useState('');
  const [forgotSubmitting, setForgotSubmitting] = useState(false);

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!username || !username.trim()) {
      setError(t('invalidCredentials') || 'Please enter a valid email address.');
      return;
    }
    if (!password || !password.trim()) {
      setError(t('invalidCredentials') || 'Please enter your password.');
      return;
    }

    setSubmitting(true);
    const res = await login(username.trim(), password.trim());
    setSubmitting(false);
    if (!res.success) {
      setError(res.error || t('invalidCredentials') || 'Invalid email or password.');
    }
  };

  const handleForgotSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setForgotSuccess('');

    if (!forgotEmail || !forgotEmail.trim()) {
      setError('Please enter your email address.');
      return;
    }

    setForgotSubmitting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          email: forgotEmail.trim(),
          origin: window.location.origin 
        })
      });

      const data = await res.json();
      setForgotSubmitting(false);

      if (res.ok && data.success) {
        setForgotSuccess(t('resetLinkSentSuccess') || data.message);
      } else {
        setError(data.error || 'Failed to send reset email.');
      }
    } catch (err) {
      setForgotSubmitting(false);
      setError('Connection error. Please try again.');
    }
  };

  // System features for the left panel
  const features = lang === 'am' ? [
    { icon: <Monitor size={20} />, title: 'የሪሶርስ አስተዳደር', desc: 'ሁሉንም የድርጅት ሪሶርሶች በአንድ ቦታ ያስተዳድሩ' },
    { icon: <CalendarCheck size={20} />, title: 'ቀላል ቡኪንግ', desc: 'በቀላሉ ቀጠሮ ይያዙ እና ያስተዳድሩ' },
    { icon: <QrCode size={20} />, title: 'የQR ኮድ ቼክ-ኢን', desc: 'በስልክ ካሜራ ፈጣን ቼክ-ኢን እና የቀጠሮ ማረጋገጫ' },
    { icon: <BarChart3 size={20} />, title: 'ሪፖርት እና ትንተና', desc: 'አጠቃቀምን ይከታተሉ እና ሪፖርት ያዘጋጁ' },
  ] : [
    { icon: <Monitor size={20} />, title: 'Resource Management', desc: 'Manage all organization resources in one place' },
    { icon: <CalendarCheck size={20} />, title: 'Easy Booking', desc: 'Easily schedule and manage reservations' },
    { icon: <QrCode size={20} />, title: 'Smart QR Check-In', desc: 'Instant mobile QR check-in and booking verification' },
    { icon: <BarChart3 size={20} />, title: 'Reports & Analytics', desc: 'Track usage and generate reports' },
  ];

  return (
    <div className="login-split-wrapper">
      {/* ========== LEFT PANEL: System Description ========== */}
      <div className="login-left-panel">
        {/* Animated background shapes */}
        <div className="login-left-bg-shape login-left-bg-shape-1" />
        <div className="login-left-bg-shape login-left-bg-shape-2" />
        <div className="login-left-bg-shape login-left-bg-shape-3" />

        <div className="login-left-content">
          {/* Brand */}
          <div className="login-left-brand">
            <img 
              src="/logo.png" 
              alt="Wollo University Logo" 
              style={{ width: 64, height: 64, objectFit: 'contain', borderRadius: '50%', background: '#fff', padding: 3, boxShadow: '0 8px 24px rgba(0,0,0,0.25)', flexShrink: 0 }} 
            />
            <div>
              <h1 className="login-left-title">Shared Resource Scheduling System</h1>
              <p className="login-left-subtitle">
                {lang === 'am' ? 'የወሎ ዩኒቨርሲቲ የጋራ ሀብቶች ማዕከላዊ ቦታ ማስያዣ ሲስተም' : 'Wollo University Resource Booking & Management System'}
              </p>
            </div>
          </div>

          {/* Divider */}
          <div className="login-left-divider" />

          {/* Description */}
          <p className="login-left-description">
            {lang === 'am'
              ? 'ይህ ስርዓት የድርጅትዎን ሪሶርሶች - ተሽከርካሪዎች፣ የስብሰባ አዳራሾች፣ መሳሪያዎች እና ሌሎችንም - በአንድ ማዕከላዊ መድረክ ላይ በቅልጥፍና ለማስተዳደር፣ ለማስያዝ እና ለመቆጣጠር ያስችላል።'
              : 'This system enables your organization to manage, book, and control all shared resources — vehicles, meeting halls, equipment and more — through a single centralized platform.'}
          </p>

          {/* Features */}
          <div className="login-left-features">
            {features.map((f, i) => (
              <div key={i} className="login-left-feature-item">
                <div className="login-left-feature-icon">{f.icon}</div>
                <div>
                  <div className="login-left-feature-title">{f.title}</div>
                  <div className="login-left-feature-desc">{f.desc}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="login-left-footer">
            <CheckCircle2 size={14} />
            <span>Developed by 3rd Year Team</span>
          </div>
        </div>
      </div>

      {/* ========== RIGHT PANEL: Form ========== */}
      <div className="login-right-panel">
        <div className="login-form-container">
          {/* Top Bar with Language and Back if in forgot mode */}
          <div className="login-form-top-bar" style={{ display: 'flex', justifyContent: mode === 'forgot' ? 'space-between' : 'flex-end', alignItems: 'center' }}>
            {mode === 'forgot' && (
              <button
                type="button"
                onClick={() => { setMode('login'); setError(''); setForgotSuccess(''); }}
                style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer', fontWeight: 500 }}
              >
                <ArrowLeft size={16} />
                <span>{t('backToLogin')}</span>
              </button>
            )}

            <button
              type="button"
              className="login-lang-btn"
              onClick={toggleLanguage}
            >
              <Globe size={15} />
              <span>{lang === 'en' ? 'አማርኛ' : 'English'}</span>
            </button>
          </div>

          {/* Form Header */}
          <div className="login-form-header">
            <img 
              src="/logo.png" 
              alt="Wollo University Logo" 
              style={{ width: 68, height: 68, objectFit: 'contain', borderRadius: '50%', background: '#fff', padding: 3, margin: '0 auto 16px auto', display: 'block', boxShadow: '0 6px 20px rgba(0,0,0,0.15)' }} 
            />
            <h2 className="login-form-title">
              {mode === 'forgot' ? t('forgotPasswordTitle') : (lang === 'am' ? 'ወደ ስርዓቱ ይግቡ' : 'Sign In')}
            </h2>
            <p className="login-form-subtitle">
              {mode === 'forgot' ? t('forgotPasswordSubtitle') : (lang === 'am' ? 'የተጠቃሚ ስምዎን እና የይለፍ ቃልዎን ያስገቡ' : 'Enter your credentials to access the platform')}
            </p>
          </div>

          {error && (
            <div className="login-error-box" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertCircle size={16} style={{ flexShrink: 0 }} />
              <span>{error}</span>
            </div>
          )}

          {forgotSuccess && (
            <div style={{ background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0', padding: '16px', borderRadius: 10, fontSize: 13, marginBottom: 18, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <CheckCircle2 size={20} style={{ flexShrink: 0, marginTop: 2, color: '#16a34a' }} />
              <div style={{ lineHeight: 1.6, textAlign: 'left', width: '100%' }}>
                <strong style={{ display: 'block', marginBottom: 4, color: '#166534', fontSize: 14 }}>
                  {lang === 'am' ? 'ኢሜይልዎ ላይ ተልኳል!' : 'Email Sent Successfully!'}
                </strong>
                <div>{forgotSuccess}</div>
              </div>
            </div>
          )}

          {/* ================= MODE: LOGIN ================= */}
          {mode === 'login' && (
            <form onSubmit={handleLoginSubmit} className="login-form">
              {/* Username */}
              <div className="login-field-group">
                <label className="login-field-label">{t('username')}</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="login-field-input"
                  placeholder={lang === 'am' ? 'የተጠቃሚ ስም ወይም ኢሜይል' : 'Enter username or email'}
                  required
                />
              </div>

              {/* Password */}
              <div className="login-field-group">
                <label className="login-field-label">{t('password')}</label>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="login-field-input"
                    placeholder={lang === 'am' ? 'የይለፍ ቃል' : 'Enter password'}
                    style={{ paddingRight: 42 }}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    style={{
                      position: 'absolute',
                      right: 12,
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      cursor: 'pointer',
                      color: 'var(--text-muted, #94a3b8)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                    title={showPassword ? (t('hidePassword') || 'Hide password') : (t('showPassword') || 'Show password')}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              {/* Forgot Password Link below Password Field */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: -6, marginBottom: 8 }}>
                <button
                  type="button"
                  onClick={() => { setMode('forgot'); setError(''); setForgotSuccess(''); setForgotEmail(username.includes('@') ? username : ''); }}
                  style={{ background: 'none', border: 'none', color: '#4f46e5', fontSize: 13, cursor: 'pointer', fontWeight: 600, padding: 0 }}
                >
                  {t('forgotPassword')}
                </button>
              </div>

              {/* Login Button */}
              <button
                type="submit"
                disabled={submitting}
                className="login-submit-btn"
              >
                {submitting ? t('authenticating') : t('loginBtn')}
              </button>
            </form>
          )}

          {/* ================= MODE: FORGOT PASSWORD ================= */}
          {mode === 'forgot' && (
            <form onSubmit={handleForgotSubmit} className="login-form">
              <div className="login-field-group">
                <label className="login-field-label">{t('email')}</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="email"
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    className="login-field-input"
                    placeholder="username@gmail.com"
                    required
                    style={{ paddingLeft: 38 }}
                  />
                  <Mail size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                </div>
              </div>

              <button
                type="submit"
                disabled={forgotSubmitting}
                className="login-submit-btn"
                style={{ marginTop: 8 }}
              >
                {forgotSubmitting ? t('sendingResetLink') : t('sendResetLink')}
              </button>

              <button
                type="button"
                onClick={() => { setMode('login'); setError(''); setForgotSuccess(''); }}
                style={{ marginTop: 12, width: '100%', padding: '10px', background: 'transparent', border: '1px solid var(--border-color, #cbd5e1)', borderRadius: 8, color: 'var(--text-primary, #334155)', fontSize: 13, cursor: 'pointer', fontWeight: 500 }}
              >
                {t('backToLogin')}
              </button>
            </form>
          )}

          {/* Bottom text */}
          <p className="login-form-footer-text">
            © 2026 Shared Resource Scheduling System • Developed by 3rd Year Team
          </p>
        </div>
      </div>
    </div>
  );
}
