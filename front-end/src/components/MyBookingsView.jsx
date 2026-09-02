import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useSocket } from '../context/SocketContext';
import { CheckCircle, LogOut as CheckOutIcon, XCircle, Clock, Star, MapPin, Calendar, X, RefreshCw, Eye, Info, MessageSquare, UserCheck, TimerReset } from 'lucide-react';
import { format } from 'date-fns';
import CheckInModal from './CheckInModal';
import { API_BASE_URL } from '../config';

export default function MyBookingsView() {
  const { user, loggedInUser, token } = useAuth();
  const { t, lang } = useLanguage();
  const { socket } = useSocket();

  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [detailsBooking, setDetailsBooking] = useState(null);
  const [activeModalBooking, setActiveModalBooking] = useState(null);
  const [modalMode, setModalMode] = useState('checkin');
  const [message, setMessage] = useState('');

  // Reschedule Modal State
  const [rescheduleBooking, setRescheduleBooking] = useState(null);
  const [newStart, setNewStart] = useState('');
  const [newEnd, setNewEnd] = useState('');
  const [rescheduleError, setRescheduleError] = useState('');

  // Extend State
  const [extendingId, setExtendingId]     = useState(null); // bookingId being extended (loading)
  const [extendError, setExtendError]     = useState('');   // per-booking inline error
  const [customMins, setCustomMins]       = useState({});   // { [bookingId]: string } free-text
  const [extendPopoverId, setExtendPopoverId] = useState(null); // which booking's popover is open

  const effectiveId = String(user?.id || loggedInUser?.id || '4');
  const effectiveRole = user?.role || loggedInUser?.role || 'staff';
  const effectiveDept = user?.department || loggedInUser?.department || 'IT Department';
  const isAdmin = ['super_admin', 'resource_manager', 'auditor'].includes(effectiveRole);

  const getHeaders = (isJson = false) => {
    const activeToken = token || sessionStorage.getItem('shered_res_token') || '';
    const headers = {
      'x-simulated-user-id': effectiveId,
      'x-simulated-role': effectiveRole,
      'x-simulated-dept': effectiveDept
    };
    if (activeToken) {
      headers['Authorization'] = `Bearer ${activeToken}`;
    }
    if (isJson) {
      headers['Content-Type'] = 'application/json';
    }
    return headers;
  };

  useEffect(() => {
    fetchMyBookings();
  }, [user, loggedInUser]);

  useEffect(() => {
    if (!socket) return;
    const handleUpdate = () => {
      fetchMyBookings();
    };
    socket.on('booking_created', handleUpdate);
    socket.on('booking_updated', handleUpdate);
    socket.on('resource_deleted', handleUpdate);
    socket.on('approval_updated', handleUpdate);
    return () => {
      socket.off('booking_created', handleUpdate);
      socket.off('booking_updated', handleUpdate);
      socket.off('resource_deleted', handleUpdate);
      socket.off('approval_updated', handleUpdate);
    };

  }, [socket, user]);

  const fetchMyBookings = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/bookings/my`, {
        headers: getHeaders(false)
      });
      if (res.ok) {
        const data = await res.json();
        // Filter to display active upcoming bookings (including pending, confirmed, on_hold, rejected)
        const activeUpcomingBookings = data.filter(bk => {
          const isNotPast = new Date(bk.end_datetime) > new Date();
          const isActiveStatus = ['confirmed', 'pending', 'checked_in', 'rejected', 'on_hold'].includes(bk.status);
          return isNotPast && isActiveStatus;
        });
        setBookings(activeUpcomingBookings);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };


  const handleCancel = async (bookingId) => {
    if (!window.confirm(t('confirmCancel'))) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/bookings/${bookingId}/cancel`, {
        method: 'POST',
        headers: getHeaders(true),
        body: JSON.stringify({ reason: 'Cancelled via dashboard' })
      });
      if (res.ok) {
        const data = await res.json();
        setMessage(data.warning || (lang === 'am' ? 'ማስያዣው ተሰርዟል።' : 'Booking cancelled successfully.'));
        fetchMyBookings();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (bookingId) => {
    if (!window.confirm(lang === 'am' ? 'ይህንን ማስያዣ ለማጥፋት እርግጠኛ ነዎት?' : 'Are you sure you want to delete this booking?')) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/bookings/${bookingId}`, {
        method: 'DELETE',
        headers: getHeaders(false)
      });
      if (res.ok) {
        setMessage(lang === 'am' ? 'ማስያዣው ተሰርዟል።' : 'Booking deleted successfully.');
        fetchMyBookings();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleClearAll = async () => {
    if (!window.confirm(lang === 'am' ? 'ሁሉንም የያዟቸውን ማስያዣዎች በሙሉ ማጽዳት ይፈልጋሉ?' : 'Are you sure you want to clear all your bookings?')) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/bookings/my-clear`, {
        method: 'DELETE',
        headers: getHeaders(false)
      });
      if (res.ok) {
        setBookings([]);
        setMessage(lang === 'am' ? 'ሁሉም ማስያዣዎች ተሰርዘዋል።' : 'All bookings cleared successfully.');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const openRescheduleModal = (bk) => {
    setRescheduleBooking(bk);
    setNewStart(format(new Date(bk.start_datetime), "yyyy-MM-dd'T'HH:mm"));
    setNewEnd(format(new Date(bk.end_datetime), "yyyy-MM-dd'T'HH:mm"));
    setRescheduleError('');
  };

  const handleRescheduleSubmit = async (e) => {
    e.preventDefault();
    setRescheduleError('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/bookings/${rescheduleBooking.id}/reschedule`, {
        method: 'POST',
        headers: getHeaders(true),
        body: JSON.stringify({
          new_start_datetime: format(new Date(newStart), 'yyyy-MM-dd HH:mm:ss'),
          new_end_datetime: format(new Date(newEnd), 'yyyy-MM-dd HH:mm:ss')
        })
      });

      const data = await res.json();
      if (res.ok) {
        setMessage('Booking rescheduled successfully!');
        setRescheduleBooking(null);
        fetchMyBookings();
      } else {
        setRescheduleError(data.error || 'Reschedule failed.');
      }
    } catch (err) {
      setRescheduleError('Connection error during reschedule.');
    }
  };

  // ─── Quick Extend Handler ──────────────────────────────────────────────────
  const handleExtend = async (bk, minutes) => {
    setExtendingId(bk.id);
    setExtendError('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/bookings/${bk.id}/extend`, {
        method: 'PATCH',
        headers: getHeaders(true),
        body: JSON.stringify({ minutes })
      });
      const data = await res.json();
      if (res.ok) {
        setMessage(
          lang === 'am'
            ? `✅ ቀጠሮ በ${minutes} ደቂቃ ተራዝሟል። አዲሱ ማብቂያ ሰዓት: ${data.new_end_datetime}`
            : `✅ Booking extended by ${minutes} min. New end: ${data.new_end_datetime}`
        );
        // Close popover and clear custom input on success
        setExtendPopoverId(null);
        setCustomMins(prev => { const n = { ...prev }; delete n[bk.id]; return n; });
        fetchMyBookings();
      } else {
        setExtendError(`${bk.id}:${data.error || 'Extend failed.'}`);
      }
    } catch (err) {
      setExtendError(`${bk.id}:Connection error.`);
    } finally {
      setExtendingId(null);
    }
  };


  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700 }}>
            {isAdmin
              ? (lang === 'am' ? 'ሁሉም ማስያዣዎች' : 'All Bookings')
              : t('myBookingsTitle')
            }
          </h2>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            {isAdmin
              ? (lang === 'am' ? 'ሁሉም የስርዓቱ ንቁ ማስያዣዎች' : 'System-wide active reservations')
              : t('myBookingsDesc')
            }
          </p>
        </div>
        {bookings.length > 0 && !isAdmin && (
          <button className="btn btn-secondary" style={{ color: 'var(--danger)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }} onClick={handleClearAll}>
            <XCircle size={14} /> {lang === 'am' ? 'ሁሉንም አጥፋ' : 'Clear All'}
          </button>
        )}
      </div>

      {message && (
        <div style={{ background: 'var(--primary-light)', color: 'var(--primary)', padding: 12, borderRadius: 'var(--radius-sm)', fontSize: 13, marginBottom: 16 }}>
          {message}
        </div>
      )}

      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)' }}>
        {bookings.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
            {t('noBookingsFound')}
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('bookingRef')}</th>
                <th>{t('resourceName')}</th>
                <th>{t('titleHeader')}</th>
                {isAdmin && <th>{lang === 'am' ? 'የተያዘለት' : 'Booked By'}</th>}
                <th>{t('startTimeHeader')}</th>
                <th>{t('endTimeHeader')}</th>
                <th>{t('statusHeader')}</th>
                <th>{t('actionsHeader')}</th>
              </tr>
            </thead>
            <tbody>
              {bookings.map((bk) => {
                const isCheckedIn = !!bk.checked_in_at;
                const isCompleted = bk.status === 'completed' || !!bk.checked_out_at;

                return (
                  <tr key={bk.id}>
                    <td style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--primary)' }}>
                      <button
                        style={{ background: 'none', border: 'none', color: 'var(--primary)', textDecoration: 'underline', cursor: 'pointer', fontFamily: 'monospace', padding: 0, fontWeight: 700 }}
                        onClick={() => setDetailsBooking(bk)}
                        title={lang === 'am' ? 'ምላሽ ዝርዝር ይመልከቱ' : 'View Response Details'}
                      >
                        {bk.booking_ref}
                      </button>
                    </td>
                    <td style={{ fontWeight: 600 }}>{bk.resource_name}</td>
                    <td>{bk.title}</td>
                    {isAdmin && <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{bk.user_name || '-'}</td>}
                    <td>{new Date(bk.start_datetime).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</td>
                    <td>{new Date(bk.end_datetime).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</td>
                    <td>
                      <span className={`badge badge-${
                        bk.status === 'confirmed' ? 'available' : 
                        (bk.status === 'pending' ? 'pending' : 
                        (bk.status === 'on_hold' ? 'pending' : 
                        (bk.status === 'rejected' ? 'booked' : 'maintenance')))
                      }`} style={{
                        background: bk.status === 'rejected' ? 'var(--danger-light)' : (bk.status === 'on_hold' ? '#fef3c7' : undefined),
                        color: bk.status === 'rejected' ? 'var(--danger)' : (bk.status === 'on_hold' ? '#d97706' : undefined),
                        border: bk.status === 'rejected' ? '1px solid var(--danger)' : (bk.status === 'on_hold' ? '1px solid #f59e0b' : undefined),
                        fontWeight: 700
                      }}>
                        {bk.status === 'on_hold' ? 'ON HOLD' : bk.status.toUpperCase()}
                      </span>

                      {bk.approver_name && (
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                          {lang === 'am' ? 'በ፡ ' : 'By: '}{bk.approver_name}
                        </div>
                      )}

                      {bk.status === 'rejected' && (bk.rejection_reason || bk.reason) && (
                        <div style={{ fontSize: 11, color: 'var(--danger)', marginTop: 4, fontStyle: 'italic', maxWidth: 200 }}>
                          "{lang === 'am' ? 'ምክንያት፦ ' : 'Reason: '}{bk.rejection_reason || bk.reason}"
                        </div>
                      )}
                      {bk.status === 'on_hold' && (bk.rejection_reason || bk.reason || bk.hold_reason) && (
                        <div style={{ fontSize: 11, color: '#92400e', marginTop: 4, fontStyle: 'italic', maxWidth: 200 }}>
                          "{lang === 'am' ? 'ምክንያት፦ ' : 'Reason: '}{bk.rejection_reason || bk.reason || bk.hold_reason}"
                        </div>
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 8 }}>
                        {bk.status === 'confirmed' && !isCheckedIn && bk.requires_checkin === 1 && (
                          <button
                            className="btn btn-primary"
                            style={{ fontSize: 11, padding: '4px 8px' }}
                            onClick={() => {
                              setActiveModalBooking(bk);
                              setModalMode('checkin');
                            }}
                          >
                            <CheckCircle size={12} /> {t('checkInBtn')}
                          </button>
                        )}

                        {isCheckedIn && !isCompleted && (
                          <button
                            className="btn btn-secondary"
                            style={{ fontSize: 11, padding: '4px 8px' }}
                            onClick={() => {
                              setActiveModalBooking(bk);
                              setModalMode('checkout');
                            }}
                          >
                            <CheckOutIcon size={12} /> {t('checkOutBtn')}
                          </button>
                        )}

                        {['confirmed', 'pending', 'checked_in'].includes(bk.status) && user?.role !== 'auditor' && (
                          <button
                            className="btn btn-secondary"
                            style={{ fontSize: 11, padding: '4px 8px' }}
                            onClick={() => openRescheduleModal(bk)}
                          >
                            <Calendar size={12} /> {t('rescheduleBtn')}
                          </button>
                        )}

                        {/* ── Extend Button + Popover ── */}
                        {['confirmed', 'pending', 'checked_in'].includes(bk.status) && user?.role !== 'auditor' && (
                          <div style={{ position: 'relative' }}>

                            {/* Toggle button */}
                            <button
                              className="btn btn-secondary"
                              style={{ fontSize: 11, padding: '4px 8px', color: '#0ea5e9', border: '1px solid #0ea5e9' }}
                              onClick={() => {
                                setExtendPopoverId(prev => prev === bk.id ? null : bk.id);
                                setExtendError('');
                              }}
                            >
                              <Clock size={12} /> {lang === 'am' ? 'አራዝም' : 'Extend'}
                            </button>

                            {/* Popover panel */}
                            {extendPopoverId === bk.id && (
                              <div
                                onClick={e => e.stopPropagation()}
                                style={{
                                  position: 'absolute',
                                  top: '110%',
                                  right: 0,
                                  zIndex: 999,
                                  background: 'var(--bg-card)',
                                  border: '1px solid var(--border-color)',
                                  borderRadius: 10,
                                  boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
                                  padding: '14px 16px',
                                  minWidth: 220,
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: 10
                                }}
                              >
                                {/* Header */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <span style={{ fontSize: 12, fontWeight: 700, color: '#0ea5e9', display: 'flex', alignItems: 'center', gap: 5 }}>
                                    <Clock size={13} /> {lang === 'am' ? 'ቀጠሮ አራዝም' : 'Extend Booking'}
                                  </span>
                                  <button
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 16, lineHeight: 1, padding: 0 }}
                                    onClick={() => setExtendPopoverId(null)}
                                  >✕</button>
                                </div>

                                {/* Quick preset chips */}
                                <div>
                                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 6 }}>
                                    {lang === 'am' ? 'ፈጣን ምርጫ:' : 'Quick select:'}
                                  </div>
                                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                                    {[15, 30, 45, 60, 90, 120].map(preset => (
                                      <button
                                        key={preset}
                                        disabled={extendingId === bk.id}
                                        style={{
                                          padding: '4px 10px',
                                          fontSize: 11,
                                          fontWeight: 600,
                                          borderRadius: 20,
                                          border: '1px solid #0ea5e9',
                                          background: 'transparent',
                                          color: '#0ea5e9',
                                          cursor: extendingId === bk.id ? 'not-allowed' : 'pointer',
                                          opacity: extendingId === bk.id ? 0.5 : 1,
                                          transition: 'all 0.15s'
                                        }}
                                        onMouseEnter={e => { e.currentTarget.style.background = '#0ea5e9'; e.currentTarget.style.color = '#fff'; }}
                                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#0ea5e9'; }}
                                        onClick={() => handleExtend(bk, preset)}
                                      >
                                        +{preset >= 60 ? `${preset / 60}h` : `${preset}m`}
                                      </button>
                                    ))}
                                  </div>
                                </div>

                                {/* Divider */}
                                <div style={{ borderTop: '1px solid var(--border-color)' }} />

                                {/* Custom input */}
                                <div>
                                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 6 }}>
                                    {lang === 'am' ? 'ማንኛውም ደቂቃ:' : 'Custom minutes:'}
                                  </div>
                                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                    <input
                                      type="number"
                                      min="1"
                                      placeholder={lang === 'am' ? 'ደቂቃ...' : 'e.g. 25'}
                                      value={customMins[bk.id] || ''}
                                      disabled={extendingId === bk.id}
                                      autoFocus
                                      onChange={e => setCustomMins(prev => ({ ...prev, [bk.id]: e.target.value }))}
                                      onKeyDown={e => {
                                        if (e.key === 'Enter') {
                                          const m = parseInt(customMins[bk.id], 10);
                                          if (m > 0) handleExtend(bk, m);
                                        }
                                        if (e.key === 'Escape') setExtendPopoverId(null);
                                      }}
                                      style={{
                                        flex: 1,
                                        padding: '5px 8px',
                                        fontSize: 12,
                                        borderRadius: 6,
                                        border: '1px solid var(--border-color)',
                                        background: 'var(--bg-main)',
                                        color: 'var(--text-primary)',
                                        outline: 'none'
                                      }}
                                    />
                                    <button
                                      className="btn btn-primary"
                                      disabled={!customMins[bk.id] || extendingId === bk.id}
                                      style={{ fontSize: 11, padding: '5px 12px', opacity: (!customMins[bk.id] || extendingId === bk.id) ? 0.5 : 1 }}
                                      onClick={() => {
                                        const m = parseInt(customMins[bk.id], 10);
                                        if (m > 0) handleExtend(bk, m);
                                      }}
                                    >
                                      {extendingId === bk.id
                                        ? <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><RefreshCw size={11} style={{ animation: 'spin 1s linear infinite' }} /> ...</span>
                                        : (lang === 'am' ? 'አራዝም' : 'Extend')}
                                    </button>
                                  </div>
                                </div>

                                {/* Error */}
                                {extendError.startsWith(`${bk.id}:`) && (
                                  <div style={{ fontSize: 11, color: 'var(--danger)', background: 'var(--danger-light)', padding: '6px 8px', borderRadius: 6 }}>
                                    ⚠️ {extendError.split(':').slice(1).join(':')}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}

                        {user?.role !== 'auditor' && (
                          <button
                            className="btn btn-secondary"
                            style={{ fontSize: 11, padding: '4px 8px', color: 'var(--danger)' }}
                            onClick={() => handleDelete(bk.id)}
                          >
                            <XCircle size={12} /> {lang === 'am' ? 'አጥፋ' : 'Delete'}
                          </button>
                        )}
                      </div>
                    </td>

                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {activeModalBooking && (
        <CheckInModal
          booking={activeModalBooking}
          mode={modalMode}
          onClose={() => setActiveModalBooking(null)}
          onSuccess={(msg) => {
            setMessage(msg);
            fetchMyBookings();
          }}
        />
      )}

      {/* Reschedule Modal */}
      {rescheduleBooking && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: 440 }}>
            <div className="modal-header">
              <div className="modal-title">{t('rescheduleTitle')}: {rescheduleBooking.title}</div>
              <button className="btn btn-secondary" style={{ padding: 4 }} onClick={() => setRescheduleBooking(null)}>
                <X size={18} />
              </button>
            </div>

            {rescheduleError && (
              <div style={{ background: 'var(--danger-light)', color: 'var(--danger)', padding: 10, borderRadius: 6, fontSize: 12, marginBottom: 14 }}>
                {rescheduleError}
              </div>
            )}

            <form onSubmit={handleRescheduleSubmit}>
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>{t('newStartTime')}</label>
                <input
                  type="datetime-local"
                  value={newStart}
                  onChange={(e) => setNewStart(e.target.value)}
                  required
                  style={{ width: '100%' }}
                />
              </div>

              <div style={{ marginBottom: 18 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>{t('newEndTime')}</label>
                <input
                  type="datetime-local"
                  value={newEnd}
                  onChange={(e) => setNewEnd(e.target.value)}
                  required
                  style={{ width: '100%' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setRescheduleBooking(null)}>{t('cancel')}</button>
                <button type="submit" className="btn btn-primary">{t('confirmReschedule')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Admin Response & Booking Details Modal */}
      {detailsBooking && (
        <div className="modal-overlay" onClick={() => setDetailsBooking(null)}>
          <div className="modal-content" style={{ maxWidth: 500 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <MessageSquare size={18} color="var(--primary)" />
                  <span>{lang === 'am' ? 'የአድሚን ምላሽ እና የማስያዣ ዝርዝር' : 'Admin Response & Booking Details'}</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                  {detailsBooking.booking_ref}
                </div>
              </div>
              <button className="btn btn-secondary" style={{ padding: 4 }} onClick={() => setDetailsBooking(null)}>
                <X size={18} />
              </button>
            </div>

            <div style={{ margin: '16px 0', display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Admin Response Card */}
              <div style={{
                padding: 14,
                borderRadius: 'var(--radius-sm)',
                background: detailsBooking.status === 'confirmed' ? 'var(--success-light)' : (detailsBooking.status === 'rejected' ? 'var(--danger-light)' : (detailsBooking.status === 'on_hold' ? '#fef3c7' : 'var(--warning-light)')),
                border: `1px solid ${detailsBooking.status === 'confirmed' ? 'var(--success)' : (detailsBooking.status === 'rejected' ? 'var(--danger)' : (detailsBooking.status === 'on_hold' ? '#f59e0b' : 'var(--warning)'))}`
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{
                    fontWeight: 700,
                    fontSize: 13,
                    color: detailsBooking.status === 'confirmed' ? 'var(--success)' : (detailsBooking.status === 'rejected' ? 'var(--danger)' : (detailsBooking.status === 'on_hold' ? '#d97706' : 'var(--warning)'))
                  }}>
                    {detailsBooking.status === 'confirmed' && (lang === 'am' ? '✅ ቀጠሮው ጸድቋል (Approved)' : '✅ Booking Approved')}
                    {detailsBooking.status === 'rejected' && (lang === 'am' ? '❌ ቀጠሮው ውድቅ ተደርጓል (Rejected)' : '❌ Booking Rejected')}
                    {detailsBooking.status === 'on_hold' && (lang === 'am' ? '⏳ ቀጠሮው በእንጥልጥል ተይዟል (On Hold)' : '⏳ Placed on Hold')}
                    {detailsBooking.status === 'pending' && (lang === 'am' ? '🟡 ማጽደቅ በመጠባበቅ ላይ (Pending)' : '🟡 Pending Manager Approval')}
                  </span>
                  {detailsBooking.approver_name && (
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <UserCheck size={13} /> {detailsBooking.approver_name}
                    </span>
                  )}
                </div>

                {(detailsBooking.rejection_reason || detailsBooking.reason || detailsBooking.hold_reason) ? (
                  <div style={{ fontSize: 12, marginTop: 8, background: 'rgba(255, 255, 255, 0.6)', padding: 10, borderRadius: 6, border: '1px dashed var(--border-color)' }}>
                    <strong>{lang === 'am' ? 'የአድሚኑ ምላሽ / ምክንያት፦' : 'Admin Response / Reason:'}</strong>
                    <div style={{ fontStyle: 'italic', marginTop: 4, whiteSpace: 'pre-wrap' }}>
                      "{detailsBooking.rejection_reason || detailsBooking.reason || detailsBooking.hold_reason}"
                    </div>
                  </div>
                ) : detailsBooking.status === 'confirmed' ? (
                  <div style={{ fontSize: 12, color: 'var(--success)', marginTop: 4 }}>
                    {lang === 'am' ? 'ቀጠሮዎ በአድሚኑ ተቀባይነት አግኝቷል፤ በተያዘው ሰዓት መጠቀም ይችላሉ።' : 'Your reservation has been officially approved and confirmed by the administrator.'}
                  </div>
                ) : null}
              </div>

              {/* Booking Info Grid */}
              <div style={{ background: 'var(--bg-main)', padding: 12, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t('titleHeader')}</div>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{detailsBooking.title}</div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, paddingTop: 6, borderTop: '1px solid var(--border-color)' }}>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t('resourceName')}</div>
                    <div style={{ fontSize: 12, fontWeight: 600 }}>{detailsBooking.resource_name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{detailsBooking.location || '-'}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t('timeRequested')}</div>
                    <div style={{ fontSize: 11, fontWeight: 600 }}>
                      {new Date(detailsBooking.start_datetime).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {new Date(detailsBooking.end_datetime).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid var(--border-color)', paddingTop: 14 }}>
              <button className="btn btn-secondary" onClick={() => setDetailsBooking(null)}>
                {lang === 'am' ? 'ዘጋ' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

