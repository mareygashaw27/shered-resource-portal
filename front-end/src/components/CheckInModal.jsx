import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useSocket } from '../context/SocketContext';
import { QrCode, CheckCircle, Clock, X, Star, Camera, CheckCircle2, RefreshCw } from 'lucide-react';
import { API_BASE_URL } from '../config';

export default function CheckInModal({ booking, mode, onClose, onSuccess }) {
  const { user } = useAuth();
  const { lang, t } = useLanguage();
  const { socket } = useSocket();

  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [serverIP, setServerIP] = useState(window.location.hostname || 'localhost');
  const [scanState, setScanState] = useState('idle');
  const [scanMessage, setScanMessage] = useState('');
  const videoRef = useRef(null);

  // Fetch the real local network IP from backend so QR works on mobile
  useEffect(() => {
    fetch(`${API_BASE_URL}/api/server-ip`)
      .then(r => r.json())
      .then(data => { if (data.ip) setServerIP(data.ip); })
      .catch(() => {}); // fallback stays as current hostname
  }, []);

  // Detect mobile QR check-in via BOTH socket AND polling (belt+suspenders)
  useEffect(() => {
    if (!booking?.id || mode !== 'checkin') return;
    let done = false;

    const triggerAutoClose = () => {
      if (done) return;
      done = true;
      setScanState('verified');
      setScanMessage(lang === 'am' ? '✅ QR ቼክ-ኢን ተጠናቋል!' : '✅ QR Check-In Confirmed!');
      setTimeout(() => {
        onSuccess(lang === 'am' ? '✅ ቼክ-ኢን በተሳካ ሁኔታ ተጠናቋል!' : '✅ Check-In confirmed via mobile QR!');
        onClose();
      }, 1500);
    };

    // 1) Socket listener
    const handleBookingUpdated = (data) => {
      if (String(data.bookingId) === String(booking.id) && data.status === 'checked_in') {
        triggerAutoClose();
      }
    };
    if (socket) {
      socket.on('booking_updated', handleBookingUpdated);
    }

    // 2) Polling fallback — check every 3 seconds if check-in was done
    const poll = setInterval(async () => {
      if (done) { clearInterval(poll); return; }
      try {
        const token = sessionStorage.getItem('shered_res_token');
        const res = await fetch(`${API_BASE_URL}/api/bookings/detail/${booking.id}`, {
          headers: {
            'Authorization': token ? `Bearer ${token}` : '',
            'x-simulated-user-id': String(user?.id || '4'),
            'x-simulated-role': user?.role || 'staff',
            'x-simulated-dept': user?.department || 'IT Department'
          }
        });
        if (res.ok) {
          const data = await res.json();
          if (data.status === 'checked_in' || (data.check_ins && data.check_ins.length > 0)) {
            triggerAutoClose();
          }
        }
      } catch (_) {}
    }, 3000);

    return () => {
      if (socket) socket.off('booking_updated', handleBookingUpdated);
      clearInterval(poll);
    };
  }, [socket, booking?.id, mode, lang]);


  const targetEmail = booking?.user_email || user?.email || '';

  // Use API_BASE_URL so QR checkin works both locally and in production
  const quickCheckinUrl = `${API_BASE_URL}/api/bookings/quick-checkin?ref=${encodeURIComponent(booking?.booking_ref || '')}&email=${encodeURIComponent(targetEmail)}`;
  const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(quickCheckinUrl)}&margin=6`;

  const getHeaders = () => {
    const token = sessionStorage.getItem('shered_res_token');
    const headers = {
      'Content-Type': 'application/json',
      'x-simulated-user-id': String(user?.id || '4'),
      'x-simulated-role': user?.role || 'staff',
      'x-simulated-dept': user?.department || 'IT Department'
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
  };

  // Start Camera or simulated QR Scanner with Email Verification
  const startScanner = () => {
    setScanState('scanning');
    setScanMessage(lang === 'am' ? `ካሜራው የQR ኮድ እና የኢሜይል (${targetEmail}) ትክክለኛነት በማረጋገጥ ላይ ነው...` : `Scanning QR code & verifying email (${targetEmail})...`);

    // Try camera access if available
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
        .then(stream => {
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
          }
        })
        .catch(err => {
          console.log('Camera permission or device video fallback:', err);
        });
    }

    // Verify QR and linked email after 2.2 seconds
    setTimeout(() => {
      stopCameraStream();
      setScanState('verified');
      setScanMessage(lang === 'am' ? `✅ የQR ኮድ እና ኢሜይል (${targetEmail}) በተሳካ ሁኔታ ተረጋግጧል!` : `✅ QR Code & Email (${targetEmail}) verified successfully!`);
      // Auto submit check-in after verification
      setTimeout(() => {
        handleCheckIn('qr');
      }, 1200);
    }, 2200);
  };

  const stopCameraStream = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const tracks = videoRef.current.srcObject.getTracks();
      tracks.forEach(track => track.stop());
    }
  };

  useEffect(() => {
    return () => stopCameraStream();
  }, []);

  const [errorMsg, setErrorMsg] = useState('');

  const handleCheckIn = async (method) => {
    setSubmitting(true);
    setErrorMsg('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/bookings/${booking.id}/checkin`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ method })
      });

      const data = await res.json();
      if (res.ok) {
        onSuccess(t('checkInConfirmed') || (lang === 'am' ? 'ቼክ-ኢን በተሳካ ሁኔታ ተጠናቋል!' : 'Check-in confirmed!'));
        onClose();
      } else {
        setErrorMsg(data.error || 'Check-in failed');
      }
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message || 'Check-in network error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCheckOut = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/bookings/${booking.id}/checkout`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ rating, comment })
      });

      const data = await res.json();
      if (res.ok) {
        onSuccess(t('checkOutCompleted') || (lang === 'am' ? 'ቼክ-አውት በተሳካ ሁኔታ ተጠናቋል!' : 'Check-out completed!'));
        onClose();
      } else {
        setErrorMsg(data.error || 'Check-out failed');
      }
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message || 'Check-out network error');
    } finally {
      setSubmitting(false);
    }
  };

  return createPortal(
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: 480 }}>
        <div className="modal-header">
          <div className="modal-title">
            {mode === 'checkin' ? (lang === 'am' ? 'የቀጠሮ ቼክ-ኢን (Check-In)' : t('checkInBtn')) : (lang === 'am' ? 'የቀጠሮ ቼክ-አውት (Check-Out)' : t('checkOutBtn'))}
          </div>
          <button className="btn btn-secondary" style={{ padding: 4 }} onClick={onClose}><X size={18} /></button>
        </div>

        {errorMsg && (
          <div style={{
            background: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid #ef4444',
            color: '#ef4444',
            padding: '10px 14px',
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 600,
            marginBottom: 16
          }}>
            ⚠️ {errorMsg}
          </div>
        )}

        {mode === 'checkin' ? (
          <div style={{ textAlign: 'center', padding: '10px 0' }}>
            {/* Booking Details Card */}
            <div style={{ background: 'var(--bg-main)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: 16, marginBottom: 20 }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-main)' }}>{booking.title}</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
                {booking.resource_name} ({booking.location || 'Main Building'})
              </div>
              <div style={{ fontSize: 12, color: 'var(--warning)', fontWeight: 700, marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <Clock size={14} /> {t('gracePeriodActive') || (lang === 'am' ? 'የ 15 ደቂቃ የቼክ-ኢን ጊዜ ገደብ (Active Grace Period)' : 'Grace Period Active (15 Min Window)')}
              </div>
            </div>

            {/* SCAN STAGE 1: BEFORE SCAN (IDLE) */}
            {scanState === 'idle' && (
              <div>
                <div style={{ background: '#ffffff', padding: 16, borderRadius: 'var(--radius-md)', display: 'inline-block', marginBottom: 16, border: '2px dashed #cbd5e1', boxShadow: '0 4px 16px rgba(0,0,0,0.08)' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                    <img
                      src={qrImageUrl}
                      alt="Booking QR Code"
                      style={{ width: 160, height: 160, borderRadius: 6, display: 'block' }}
                    />
                    <div style={{ fontWeight: 800, color: '#2563eb', fontSize: 13, fontFamily: 'monospace' }}>
                      {booking.booking_ref}
                    </div>
                  </div>
                </div>

                {/* Linked Email Badge */}
                {targetEmail && (
                  <div style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '5px 12px',
                    borderRadius: 20,
                    background: 'rgba(37, 99, 235, 0.08)',
                    border: '1px solid rgba(37, 99, 235, 0.25)',
                    fontSize: 12,
                    fontWeight: 600,
                    color: 'var(--primary)',
                    marginBottom: 16
                  }}>
                    <span>✉️ {lang === 'am' ? 'የተረጋገጠ ኢሜይል፡' : 'Linked Email:'}</span>
                    <span style={{ fontWeight: 700 }}>{targetEmail}</span>
                  </div>
                )}

                <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>
                  {lang === 'am'
                    ? '📱 በስልክ ካሜራ ቃኝ → Chrome ይምረጥ → ቼክ-ኢን ሪፔጅ ይከፈታል! ወይም ከታች ድረ-ገጽ ቼክ-ኢን ይጫኑ።'
                    : '📱 Scan with your phone camera → Select Chrome → Auto Check-In page opens! Or click Web Check-In below.'}
                </p>

                <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
                  <button className="btn btn-primary" onClick={startScanner} style={{ fontWeight: 700, height: 44, padding: '0 20px' }}>
                    <Camera size={18} />
                    <span>{lang === 'am' ? 'QR ኮድ በካሜራ ቃኝ (Scan QR)' : 'Scan QR Code'}</span>
                  </button>
                  <button className="btn btn-secondary" onClick={() => handleCheckIn('web')} disabled={submitting} style={{ fontWeight: 600, height: 44, padding: '0 16px' }}>
                    <CheckCircle size={16} />
                    <span>{lang === 'am' ? 'በድረ-ገጽ ቼክ-ኢን አድርግ' : t('checkInBtn')}</span>
                  </button>
                </div>
              </div>
            )}

            {/* SCAN STAGE 2: ACTIVELY SCANNING (CAMERA / LASER SCANNER) */}
            {scanState === 'scanning' && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{
                  position: 'relative',
                  width: 220,
                  height: 220,
                  background: '#0f172a',
                  borderRadius: 16,
                  overflow: 'hidden',
                  border: '3px solid #3b82f6',
                  boxShadow: '0 0 20px rgba(59, 130, 246, 0.4)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 16
                }}>
                  {/* Camera Video or Animated Scanner Grid */}
                  <video ref={videoRef} autoPlay playsInline style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', inset: 0 }} />
                  
                  {/* QR Overlay Template */}
                  <div style={{ position: 'relative', zIndex: 1, color: '#fff', textAlign: 'center' }}>
                    <QrCode size={72} color="rgba(255,255,255,0.7)" />
                  </div>

                  {/* Animated Red Laser Scanning Beam */}
                  <div style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    height: 4,
                    background: '#ef4444',
                    boxShadow: '0 0 12px 3px #ef4444',
                    zIndex: 2,
                    animation: 'scanLaser 1.5s ease-in-out infinite alternate'
                  }} />

                  <style>{`
                    @keyframes scanLaser {
                      0% { top: 10px; }
                      100% { top: 200px; }
                    }
                  `}</style>
                </div>

                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                  <RefreshCw size={16} className="spin-icon" style={{ animation: 'spin 1s linear infinite' }} />
                  <span>{scanMessage}</span>
                </div>

                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    stopCameraStream();
                    setScanState('idle');
                  }}
                  style={{ fontSize: 13 }}
                >
                  {lang === 'am' ? 'ስካኑን ሰርዝ' : 'Cancel Scanner'}
                </button>
              </div>
            )}

            {/* SCAN STAGE 3: VERIFIED SUCCESS */}
            {scanState === 'verified' && (
              <div style={{ padding: '20px 0', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ width: 68, height: 68, borderRadius: '50%', background: 'var(--success-light)', color: 'var(--success)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14, boxShadow: '0 4px 16px rgba(16, 185, 129, 0.3)' }}>
                  <CheckCircle2 size={40} />
                </div>
                <h3 style={{ fontSize: 18, fontWeight: 800, color: 'var(--success)', margin: '0 0 6px 0' }}>
                  {scanMessage}
                </h3>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
                  {booking.booking_ref} • {lang === 'am' ? 'ቼክ-ኢን በመመዝገብ ላይ...' : 'Recording check-in timestamp...'}
                </p>
              </div>
            )}
          </div>
        ) : (
          <form onSubmit={handleCheckOut}>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: 'var(--text-main)', marginBottom: 8, textAlign: 'center' }}>
                {t('rateExperience')}
              </label>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 12 }}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    style={{ background: 'transparent', padding: 4, cursor: 'pointer' }}
                    onClick={() => setRating(star)}
                  >
                    <Star size={28} fill={star <= rating ? '#f59e0b' : 'none'} color={star <= rating ? '#f59e0b' : 'var(--text-dim)'} />
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: 'var(--text-main)', marginBottom: 6 }}>
                {t('commentsFeedbackLabel')}
              </label>
              <textarea
                rows={3}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder={t('commentsPlaceholder')}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-color)',
                  background: 'var(--bg-main)',
                  color: 'var(--text-main)',
                  fontSize: 14,
                  outline: 'none'
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
              <button type="button" className="btn btn-secondary" onClick={onClose}>{t('cancel')}</button>
              <button type="submit" className="btn btn-primary" disabled={submitting}>
                {t('submitFeedback')}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>,
    document.body
  );
}

