import React, { useState, useEffect } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { Lock, CheckCircle2, AlertCircle, ArrowLeft, Globe, KeyRound, Check, X, Eye, EyeOff } from 'lucide-react';
import { API_BASE_URL } from '../config';

export default function ResetPasswordPage({ token, onComplete }) {
  const { lang, toggleLanguage, t } = useLanguage();

  const [loading, setLoading] = useState(true);
  const [valid, setValid] = useState(false);
  const [userEmail, setUserEmail] = useState('');
  const [userName, setUserName] = useState('');

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    async function verifyToken() {
      if (!token) {
        setValid(false);
        setLoading(false);
        return;
      }

      try {
        const res = await fetch(`${API_BASE_URL}/api/auth/verify-reset-token/${token}`);
        const data = await res.json();
        if (res.ok && data.valid) {
          setValid(true);
          setUserEmail(data.email);
          setUserName(data.name);
        } else {
          setValid(false);
          setError(data.error || t('invalidResetLink'));
        }
      } catch (err) {
        setValid(false);
        setError('Network error verifying reset link.');
      } finally {
        setLoading(false);
      }
    }

    verifyToken();
  }, [token]);

  const hasMinLength = newPassword.length >= 8;
  const hasLetter = /[a-zA-Z]/.test(newPassword);
  const hasNumber = /[0-9]/.test(newPassword);
  const hasSymbol = /[^a-zA-Z0-9]/.test(newPassword);
  const isPasswordValid = hasMinLength && hasLetter && hasNumber && hasSymbol;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');

    if (!isPasswordValid) {
      setError(t('passwordLengthError'));
      return;
    }

    if (newPassword !== confirmPassword) {
      setError(t('passwordsDoNotMatch'));
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword })
      });

      const data = await res.json();
      setSubmitting(false);

      if (res.ok && data.success) {
        setSuccessMsg(t('passwordResetSuccess'));
        setTimeout(() => {
          if (onComplete) onComplete();
          else window.location.href = '/';
        }, 2500);
      } else {
        setError(data.error || 'Failed to reset password.');
      }
    } catch (err) {
      setSubmitting(false);
      setError('Connection error. Please try again.');
    }
  };

  return (
    <div className="login-split-wrapper" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-main, #f8fafc)', padding: 20 }}>
      <div style={{ maxWidth: 480, width: '100%', background: 'var(--card-bg, #ffffff)', borderRadius: 16, padding: '36px 32px', boxShadow: '0 20px 40px -15px rgba(0,0,0,0.12)', border: '1px solid var(--border-color, #e2e8f0)' }}>
        
        {/* Top bar with language */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <button
            type="button"
            onClick={onComplete || (() => window.location.href = '/')}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: 'var(--text-muted, #64748b)', fontSize: 13, cursor: 'pointer', fontWeight: 500 }}
          >
            <ArrowLeft size={16} />
            <span>{t('backToLogin')}</span>
          </button>

          <button
            type="button"
            className="login-lang-btn"
            onClick={toggleLanguage}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg-secondary, #f1f5f9)', border: '1px solid var(--border-color, #e2e8f0)', padding: '6px 12px', borderRadius: 8, fontSize: 12, cursor: 'pointer' }}
          >
            <Globe size={14} />
            <span>{lang === 'en' ? 'አማርኛ' : 'English'}</span>
          </button>
        </div>

        {/* Logo & Header */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'linear-gradient(135deg, #4f46e5, #6366f1)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#fff', marginBottom: 12, boxShadow: '0 8px 16px rgba(79, 70, 229, 0.25)' }}>
            <KeyRound size={26} />
          </div>
          <h2 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 6px 0', color: 'var(--text-primary, #0f172a)' }}>
            {t('resetPasswordTitle')}
          </h2>
          <p style={{ fontSize: 13, color: 'var(--text-muted, #64748b)', margin: 0 }}>
            {t('resetPasswordSubtitle')}
          </p>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted, #64748b)', fontSize: 14 }}>
            Verifying secure reset token...
          </div>
        ) : !valid ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', padding: '16px', borderRadius: 10, fontSize: 13, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
              <AlertCircle size={20} style={{ flexShrink: 0 }} />
              <div style={{ textAlign: 'left' }}>{error || t('invalidResetLink')}</div>
            </div>
            <button
              type="button"
              onClick={onComplete || (() => window.location.href = '/')}
              className="login-submit-btn"
              style={{ width: '100%', padding: '12px', background: '#4f46e5', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}
            >
              {t('backToLogin')}
            </button>
          </div>
        ) : (
          <div>
            {/* Account Info Pill */}
            <div style={{ background: 'var(--bg-secondary, #f8fafc)', border: '1px solid var(--border-color, #e2e8f0)', padding: '10px 14px', borderRadius: 8, fontSize: 13, marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'var(--text-muted, #64748b)' }}>Account:</span>
              <strong style={{ color: 'var(--text-primary, #0f172a)' }}>{userName ? `${userName} (${userEmail})` : userEmail}</strong>
            </div>

            {error && (
              <div style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', padding: '12px 14px', borderRadius: 8, fontSize: 13, marginBottom: 18, display: 'flex', alignItems: 'center', gap: 8 }}>
                <AlertCircle size={16} />
                <span>{error}</span>
              </div>
            )}

            {successMsg && (
              <div style={{ background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', padding: '14px', borderRadius: 8, fontSize: 13, marginBottom: 18, display: 'flex', alignItems: 'center', gap: 8 }}>
                <CheckCircle2 size={18} />
                <span>{successMsg}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-primary, #1e293b)', marginBottom: 6 }}>
                  {t('newPasswordLabel')}
                </label>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    style={{ width: '100%', padding: '10px 42px 10px 14px', borderRadius: 8, border: `1px solid ${newPassword ? (isPasswordValid ? '#22c55e' : '#f59e0b') : 'var(--border-color, #cbd5e1)'}`, background: 'var(--input-bg, #fff)', fontSize: 14, color: 'var(--text-primary, #0f172a)', boxSizing: 'border-box' }}
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

              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-primary, #1e293b)', marginBottom: 6 }}>
                  {t('confirmPasswordLabel')}
                </label>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    style={{ width: '100%', padding: '10px 42px 10px 14px', borderRadius: 8, border: '1px solid var(--border-color, #cbd5e1)', background: 'var(--input-bg, #fff)', fontSize: 14, color: 'var(--text-primary, #0f172a)', boxSizing: 'border-box' }}
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

              {/* Clean Password Requirements without border/box */}
              <div style={{ marginTop: 2, fontSize: 12 }}>
                <div style={{ fontWeight: 600, color: 'var(--text-secondary, #475569)', marginBottom: 6 }}>
                  {t('passwordRequirements')}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px 12px' }}>
                  <div style={{ color: hasMinLength ? '#16a34a' : '#94a3b8', fontWeight: hasMinLength ? 600 : 400, display: 'flex', alignItems: 'center', gap: 4 }}>
                    {hasMinLength && <Check size={13} />}
                    <span>{t('reqMin8')}</span>
                  </div>
                  <div style={{ color: hasLetter ? '#16a34a' : '#94a3b8', fontWeight: hasLetter ? 600 : 400, display: 'flex', alignItems: 'center', gap: 4 }}>
                    {hasLetter && <Check size={13} />}
                    <span>{t('reqLetter')}</span>
                  </div>
                  <div style={{ color: hasNumber ? '#16a34a' : '#94a3b8', fontWeight: hasNumber ? 600 : 400, display: 'flex', alignItems: 'center', gap: 4 }}>
                    {hasNumber && <Check size={13} />}
                    <span>{t('reqNumber')}</span>
                  </div>
                  <div style={{ color: hasSymbol ? '#16a34a' : '#94a3b8', fontWeight: hasSymbol ? 600 : 400, display: 'flex', alignItems: 'center', gap: 4 }}>
                    {hasSymbol && <Check size={13} />}
                    <span>{t('reqSymbol')}</span>
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                style={{ marginTop: 8, width: '100%', padding: '12px', background: 'linear-gradient(135deg, #4f46e5, #6366f1)', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 14, cursor: 'pointer', boxShadow: '0 4px 12px rgba(79, 70, 229, 0.3)' }}
              >
                {submitting ? t('updatingPassword') : t('setNewPasswordBtn')}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
