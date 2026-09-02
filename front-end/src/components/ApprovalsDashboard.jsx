import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useSocket } from '../context/SocketContext';
import { CheckCircle2, XCircle, Clock, AlertCircle, X, Info, RefreshCw, Search, Eye, Users, Calendar, MapPin, Check, FileText } from 'lucide-react';
import { API_BASE_URL } from '../config';

export default function ApprovalsDashboard() {
  const { user, loggedInUser, token } = useAuth();
  const { t, lang } = useLanguage();
  const { socket } = useSocket();

  const [pendingList, setPendingList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all'); // 'all' | 'pending' | 'on_hold'

  // Modals state
  const [selectedBookingDetails, setSelectedBookingDetails] = useState(null);
  const [rejectReasonModal, setRejectReasonModal] = useState(null);
  const [reasonInput, setReasonInput] = useState('');
  
  const [holdReasonModal, setHoldReasonModal] = useState(null);
  const [holdReasonInput, setHoldReasonInput] = useState('');

  // Status feedback message
  const [feedback, setFeedback] = useState({ type: '', text: '' });

  // Effective role for authorization: use loggedInUser role if admin or previewing
  const approverRole = ['super_admin', 'resource_manager', 'department_head'].includes(user?.role)
    ? user.role
    : (['super_admin', 'resource_manager', 'department_head'].includes(loggedInUser?.role) ? loggedInUser.role : 'resource_manager');

  const approverDept = user?.department || loggedInUser?.department || 'Operations';
  const approverId = String(user?.id || loggedInUser?.id || '2');

  const getHeaders = (isJson = false) => {
    const activeToken = token || sessionStorage.getItem('shered_res_token') || '';
    const headers = {
      'x-simulated-user-id': approverId,
      'x-simulated-role': approverRole,
      'x-simulated-dept': approverDept
    };
    if (activeToken && !activeToken.startsWith('simulated_')) {
      headers['Authorization'] = `Bearer ${activeToken}`;
    }
    if (isJson) {
      headers['Content-Type'] = 'application/json';
    }
    return headers;
  };

  useEffect(() => {
    fetchPending();
  }, [user, loggedInUser]);

  // Real-time socket sync for new or updated booking approvals
  useEffect(() => {
    if (!socket) return;

    const handleUpdate = () => {
      fetchPending(false);
    };

    socket.on('booking_created', handleUpdate);
    socket.on('booking_updated', handleUpdate);
    socket.on('approval_updated', handleUpdate);

    return () => {
      socket.off('booking_created', handleUpdate);
      socket.off('booking_updated', handleUpdate);
      socket.off('approval_updated', handleUpdate);
    };
  }, [socket, user]);

  const fetchPending = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/approvals/pending`, {
        headers: getHeaders(false)
      });
      if (res.ok) {
        const data = await res.json();
        setPendingList(Array.isArray(data) ? data : []);
      } else {
        const errData = await res.json().catch(() => ({}));
        setFeedback({ type: 'error', text: errData.error || 'Failed to fetch pending approvals.' });
      }
    } catch (err) {
      console.error('Failed to fetch pending approvals:', err);
      setFeedback({
        type: 'error',
        text: lang === 'am' ? 'ከሰርቨሩ ጋር መገናኘት አልተቻለም። እባክዎ Backend እየሰራ መሆኑን ያረጋግጡ።' : 'Could not connect to backend server.'
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleAction = async (bookingId, action, reason = null) => {
    setFeedback({ type: '', text: '' });
    try {
      const res = await fetch(`${API_BASE_URL}/api/approvals/action`, {
        method: 'POST',
        headers: getHeaders(true),
        body: JSON.stringify({ bookingId, action, reason })
      });

      const data = await res.json();

      if (res.ok) {
        const actionLabels = {
          approved: lang === 'am' ? 'ማጽደቅ በስኬት ተጠናቋል!' : 'Booking approved successfully!',
          rejected: lang === 'am' ? 'ቀጠሮው ውድቅ ተደርጓል!' : 'Booking rejected successfully.',
          hold: lang === 'am' ? 'ቀጠሮው በእንጥልጥል እንዲቆይ ተደርጓል (On Hold)' : 'Booking placed on hold.'
        };
        setFeedback({ type: 'success', text: actionLabels[action] || data.message });
        fetchPending(false);
        setRejectReasonModal(null);
        setReasonInput('');
        setHoldReasonModal(null);
        setHoldReasonInput('');
        if (selectedBookingDetails?.booking_id === bookingId) {
          setSelectedBookingDetails(null);
        }
      } else {
        setFeedback({ type: 'error', text: data.error || 'Failed to update approval action.' });
      }
    } catch (err) {
      setFeedback({ type: 'error', text: lang === 'am' ? 'የግንኙነት ስህተት ተፈጥሯል።' : 'Network connection error.' });
    }
  };

  // Filtered approvals list
  const filteredList = pendingList.filter((item) => {
    const matchesStatus =
      filterStatus === 'all'
        ? true
        : filterStatus === 'on_hold'
        ? item.booking_status === 'on_hold'
        : item.booking_status === 'pending';

    const matchesSearch =
      !searchTerm.trim() ||
      item.booking_ref?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.resource_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.requester_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.requester_department?.toLowerCase().includes(searchTerm.toLowerCase());

    return matchesStatus && matchesSearch;
  });

  const isEligibleRole = ['super_admin', 'resource_manager', 'department_head'].includes(approverRole);

  return (
    <div>
      {/* Header Bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700 }}>{t('approvalsTitle')}</h2>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>{t('approvalsDesc')}</p>
        </div>
      </div>

      {/* Role Alert if not eligible */}
      {!isEligibleRole && (
        <div style={{
          background: 'var(--warning-light)',
          color: '#92400e',
          border: '1px solid #f59e0b',
          padding: '12px 16px',
          borderRadius: 'var(--radius-md)',
          marginBottom: 20,
          fontSize: 13,
          display: 'flex',
          alignItems: 'center',
          gap: 10
        }}>
          <AlertCircle size={18} />
          <span>
            {lang === 'am'
              ? 'ማሳሰቢያ፦ ማጽደቂያዎችን ለማየት እና እርምጃ ለመውሰድ የSuper Admin፣ Resource Manager ወይም Department Head ሚና ሊኖርዎት ይገባል።'
              : 'Notice: You need Super Admin, Resource Manager, or Department Head permissions to process booking approvals.'}
          </span>
        </div>
      )}

      {/* Feedback Banner */}
      {feedback.text && (
        <div style={{
          padding: '12px 16px', borderRadius: 'var(--radius-md)', marginBottom: 20, fontWeight: 600, fontSize: 13,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
          background: feedback.type === 'success' ? 'var(--success-light)' : 'var(--danger-light)',
          color: feedback.type === 'success' ? 'var(--success)' : 'var(--danger)',
          border: `1px solid ${feedback.type === 'success' ? 'var(--success)' : 'var(--danger)'}`
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {feedback.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
            <span>{feedback.text}</span>
          </div>
          <button
            onClick={() => setFeedback({ type: '', text: '' })}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 0 }}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Filters & Search Control */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 16,
        gap: 12,
        flexWrap: 'wrap'
      }}>
        {/* Status Filter Tabs */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className={`btn ${filterStatus === 'all' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ fontSize: 12, padding: '6px 12px' }}
            onClick={() => setFilterStatus('all')}
          >
            {lang === 'am' ? 'ሁሉም ጥያቄዎች' : 'All Requests'} ({pendingList.length})
          </button>
          <button
            className={`btn ${filterStatus === 'pending' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ fontSize: 12, padding: '6px 12px' }}
            onClick={() => setFilterStatus('pending')}
          >
            🟡 {lang === 'am' ? 'ማጽደቅ የሚጠብቁ' : 'Pending Only'} ({pendingList.filter(p => p.booking_status === 'pending').length})
          </button>
          <button
            className={`btn ${filterStatus === 'on_hold' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ fontSize: 12, padding: '6px 12px' }}
            onClick={() => setFilterStatus('on_hold')}
          >
            🟠 {lang === 'am' ? 'በእንጥልጥል የተያዙ' : 'On Hold'} ({pendingList.filter(p => p.booking_status === 'on_hold').length})
          </button>
        </div>

        {/* Search Input */}
        <div style={{ position: 'relative', minWidth: 260 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            type="text"
            placeholder={lang === 'am' ? 'በስም፣ ክፍል ወይም መለያ ፈልግ...' : 'Search by name, dept, ref...'}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ paddingLeft: 32, width: '100%', fontSize: 12 }}
          />
        </div>
      </div>

      {/* Main Table Content */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', overflowX: 'auto' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
            <RefreshCw size={24} className="spinning" style={{ marginBottom: 8, display: 'inline-block' }} />
            <div>{lang === 'am' ? 'የማጽደቂያ ጥያቄዎች እየተጫኑ ነው...' : 'Loading pending approvals...'}</div>
          </div>
        ) : filteredList.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
            <FileText size={32} style={{ opacity: 0.3, marginBottom: 10 }} />
            <div style={{ fontWeight: 600, marginBottom: 4 }}>
              {searchTerm || filterStatus !== 'all'
                ? (lang === 'am' ? 'ከተመረጠው ማጣሪያ ጋር የሚስማማ ጥያቄ አልተገኘም።' : 'No matching requests found.')
                : t('noPendingApprovals')}
            </div>
            <div style={{ fontSize: 12 }}>
              {lang === 'am'
                ? 'አዲስ ፈቃድ የሚጠይቅ ቦታ ሲያዝ እዚህ ገጽ ላይ በቀጥታ ይታያል።'
                : 'New bookings requiring authorization will appear here in real-time.'}
            </div>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('bookingRef')}</th>
                <th>{t('requester')}</th>
                <th>{t('deptLabel')}</th>
                <th>{t('resourceName')}</th>
                <th>{t('timeRequested')}</th>
                <th>{t('statusHeader')}</th>
                <th style={{ textAlign: 'center' }}>{t('actionsHeader')}</th>
              </tr>
            </thead>
            <tbody>
              {filteredList.map((p) => {
                const isOnHold = p.booking_status === 'on_hold';
                return (
                  <tr key={p.booking_id}>
                    <td style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--primary)' }}>
                      <button
                        onClick={() => setSelectedBookingDetails(p)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--primary)',
                          fontWeight: 600,
                          cursor: 'pointer',
                          textDecoration: 'underline',
                          padding: 0,
                          fontFamily: 'monospace'
                        }}
                        title={lang === 'am' ? 'ሙሉ ዝርዝር ይመልከቱ' : 'View full details'}
                      >
                        {p.booking_ref}
                      </button>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{p.requester_name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{p.requester_email}</div>
                    </td>
                    <td>{p.requester_department}</td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{p.resource_name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{p.resource_type} • {p.location || 'N/A'}</div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 500 }}>
                        {new Date(p.start_datetime).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {new Date(p.start_datetime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {new Date(p.end_datetime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${isOnHold ? 'badge-pending' : 'badge-pending'}`} style={{
                        background: isOnHold ? '#fef3c7' : 'var(--warning-light)',
                        color: isOnHold ? '#d97706' : 'var(--warning)',
                        border: `1px solid ${isOnHold ? '#f59e0b' : 'var(--warning)'}`,
                        fontWeight: 700
                      }}>
                        {isOnHold ? (lang === 'am' ? 'በእንጥልጥል (ON HOLD)' : 'ON HOLD') : 'PENDING'}
                      </span>
                      {isOnHold && p.hold_reason && (
                        <div style={{ fontSize: 11, color: '#92400e', marginTop: 4, fontStyle: 'italic', maxWidth: 160 }}>
                          "{p.hold_reason}"
                        </div>
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                        {/* Quick View Details */}
                        <button
                          className="btn btn-secondary"
                          style={{ fontSize: 11, padding: '5px 8px' }}
                          onClick={() => setSelectedBookingDetails(p)}
                          title={lang === 'am' ? 'ዝርዝር መረጃ' : 'View Details'}
                        >
                          <Eye size={13} />
                        </button>

                        {/* Approve Button */}
                        <button
                          className="btn btn-primary"
                          style={{ fontSize: 11, padding: '5px 10px', background: 'var(--success)' }}
                          onClick={() => handleAction(p.booking_id, 'approved')}
                          title={lang === 'am' ? 'ቀጠሮውን አጽድቅ' : 'Approve Request'}
                        >
                          <CheckCircle2 size={13} /> {t('approveBtn')}
                        </button>

                        {/* Reject Button */}
                        <button
                          className="btn btn-danger"
                          style={{ fontSize: 11, padding: '5px 10px' }}
                          onClick={() => {
                            setRejectReasonModal(p.booking_id);
                            setReasonInput('');
                          }}
                          title={lang === 'am' ? 'ቀጠሮውን ውድቅ አድርግ' : 'Reject Request'}
                        >
                          <XCircle size={13} /> {t('rejectBtn')}
                        </button>

                        {/* Hold Button */}
                        <button
                          className="btn btn-secondary"
                          style={{ fontSize: 11, padding: '5px 10px', background: isOnHold ? '#fef3c7' : '' }}
                          onClick={() => {
                            setHoldReasonModal(p.booking_id);
                            setHoldReasonInput(p.hold_reason || '');
                          }}
                          title={lang === 'am' ? 'በእንጥልጥል አቆይ' : 'Put on Hold'}
                        >
                          <Clock size={13} /> {t('holdBtn')}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Booking Details Modal */}
      {selectedBookingDetails && (
        <div className="modal-overlay" onClick={() => setSelectedBookingDetails(null)}>
          <div className="modal-content" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <FileText size={18} color="var(--primary)" />
                  <span>{lang === 'am' ? 'የማስያዣ ጥያቄ ሙሉ ዝርዝር' : 'Booking Request Details'}</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                  {selectedBookingDetails.booking_ref}
                </div>
              </div>
              <button className="btn btn-secondary" style={{ padding: 4 }} onClick={() => setSelectedBookingDetails(null)}>
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, margin: '14px 0' }}>
              <div style={{ background: 'var(--bg-main)', padding: 12, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>{t('titleHeader')}</div>
                <div style={{ fontSize: 15, fontWeight: 700, marginTop: 2 }}>{selectedBookingDetails.title}</div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div style={{ background: 'var(--bg-main)', padding: 10, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>{t('requester')}</div>
                  <div style={{ fontWeight: 600, fontSize: 13, marginTop: 2 }}>{selectedBookingDetails.requester_name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{selectedBookingDetails.requester_department}</div>
                  <div style={{ fontSize: 11, color: 'var(--primary)' }}>{selectedBookingDetails.requester_email}</div>
                </div>

                <div style={{ background: 'var(--bg-main)', padding: 10, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>{t('resourceName')}</div>
                  <div style={{ fontWeight: 600, fontSize: 13, marginTop: 2 }}>{selectedBookingDetails.resource_name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{selectedBookingDetails.resource_type} • {selectedBookingDetails.location}</div>
                </div>
              </div>

              <div style={{ background: 'var(--bg-main)', padding: 10, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Calendar size={13} /> {lang === 'am' ? 'የጊዜ ቆይታ' : 'Scheduled Time Window'}
                </div>
                <div style={{ fontWeight: 600, fontSize: 13, marginTop: 4 }}>
                  {new Date(selectedBookingDetails.start_datetime).toLocaleString([], { dateStyle: 'full', timeStyle: 'short' })}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {lang === 'am' ? 'እስከ' : 'to'} {new Date(selectedBookingDetails.end_datetime).toLocaleString([], { dateStyle: 'full', timeStyle: 'short' })}
                </div>
              </div>

              {selectedBookingDetails.attendees && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                  <Users size={14} color="var(--primary)" />
                  <span><strong>{lang === 'am' ? 'የተሳታፊዎች ብዛት:' : 'Attendees:'}</strong> {selectedBookingDetails.attendees}</span>
                </div>
              )}

              {selectedBookingDetails.special_requirements && (
                <div style={{ background: '#f8fafc', padding: 10, borderRadius: 'var(--radius-sm)', border: '1px dashed var(--border-color)' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>{lang === 'am' ? 'ልዩ ፍላጎቶች / ማስታወሻ:' : 'Special Requirements:'}</div>
                  <div style={{ fontSize: 12, marginTop: 2 }}>{selectedBookingDetails.special_requirements}</div>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, borderTop: '1px solid var(--border-color)', paddingTop: 14 }}>
              <button className="btn btn-secondary" onClick={() => setSelectedBookingDetails(null)}>
                {t('cancel')}
              </button>
              <button
                className="btn btn-danger"
                onClick={() => {
                  setRejectReasonModal(selectedBookingDetails.booking_id);
                  setReasonInput('');
                }}
              >
                <XCircle size={14} /> {t('rejectBtn')}
              </button>
              <button
                className="btn btn-secondary"
                style={{ background: '#fef3c7', color: '#92400e' }}
                onClick={() => {
                  setHoldReasonModal(selectedBookingDetails.booking_id);
                  setHoldReasonInput(selectedBookingDetails.hold_reason || '');
                }}
              >
                <Clock size={14} /> {t('holdBtn')}
              </button>
              <button
                className="btn btn-primary"
                style={{ background: 'var(--success)' }}
                onClick={() => handleAction(selectedBookingDetails.booking_id, 'approved')}
              >
                <CheckCircle2 size={14} /> {t('approveBtn')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mandatory Rejection Reason Modal */}
      {rejectReasonModal && (
        <div className="modal-overlay" onClick={() => setRejectReasonModal(null)}>
          <div className="modal-content" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--danger)' }}>
                <XCircle size={18} />
                <span>{t('rejectionModalTitle')}</span>
              </div>
              <button className="btn btn-secondary" style={{ padding: 4 }} onClick={() => setRejectReasonModal(null)}>
                <X size={18} />
              </button>
            </div>
            <div style={{ margin: '14px 0' }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>
                {t('rejectionReasonLabel')}
              </label>
              <textarea
                rows={3}
                value={reasonInput}
                onChange={(e) => setReasonInput(e.target.value)}
                placeholder={t('rejectionPlaceholder')}
                style={{ width: '100%' }}
                required
                autoFocus
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
              <button className="btn btn-secondary" onClick={() => setRejectReasonModal(null)}>{t('cancel')}</button>
              <button
                className="btn btn-danger"
                disabled={!reasonInput.trim()}
                onClick={() => handleAction(rejectReasonModal, 'rejected', reasonInput.trim())}
              >
                {t('confirmRejection')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hold Reason Modal */}
      {holdReasonModal && (
        <div className="modal-overlay" onClick={() => setHoldReasonModal(null)}>
          <div className="modal-content" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#d97706' }}>
                <Clock size={18} />
                <span>{lang === 'am' ? 'ቀጠሮውን በእንጥልጥል ማቆያ (Hold Reason)' : 'Hold Booking Request'}</span>
              </div>
              <button className="btn btn-secondary" style={{ padding: 4 }} onClick={() => setHoldReasonModal(null)}>
                <X size={18} />
              </button>
            </div>
            <div style={{ margin: '14px 0' }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>
                {lang === 'am' ? 'የማቆያ ምክንያት / ማብራሪያ:' : 'Specify reason or requirements for hold:'}
              </label>
              <textarea
                rows={3}
                value={holdReasonInput}
                onChange={(e) => setHoldReasonInput(e.target.value)}
                placeholder={lang === 'am' ? 'ምሳሌ፡ የበጀት ማረጋገጫ ወይም የክፍል ኃላፊ ፈቃድ ያስፈልጋል...' : 'e.g. Budget verification or department head confirmation required...'}
                style={{ width: '100%' }}
                autoFocus
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
              <button className="btn btn-secondary" onClick={() => setHoldReasonModal(null)}>{t('cancel')}</button>
              <button
                className="btn btn-primary"
                style={{ background: '#d97706' }}
                onClick={() => handleAction(holdReasonModal, 'hold', holdReasonInput.trim() || 'Additional verification required')}
              >
                {lang === 'am' ? 'በእንጥልጥል አቁይ (Put on Hold)' : 'Confirm Hold'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

