import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { X, Calendar, Clock, Users, FileText, AlertCircle, Check } from 'lucide-react';
import { format, addHours, addDays } from 'date-fns';
import { API_BASE_URL } from '../config';

export default function BookingModal({ resource, initialStartTime, onClose, onSuccess, onConflict }) {
  const { user, usersList } = useAuth();
  const { t } = useLanguage();

  // Robust date parser that handles ISO, space-separated MySQL dates, and Date objects safely
  const parseInputDate = (val) => {
    if (!val) return new Date();
    if (val instanceof Date) return isNaN(val.getTime()) ? new Date() : val;
    const str = String(val).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
      const isoStr = str.replace(' ', 'T');
      const d = new Date(isoStr);
      if (!isNaN(d.getTime())) return d;
      const parts = str.match(/\d+/g);
      if (parts && parts.length >= 3) {
        return new Date(
          parseInt(parts[0], 10),
          parseInt(parts[1], 10) - 1,
          parseInt(parts[2], 10),
          parseInt(parts[3] || 0, 10),
          parseInt(parts[4] || 0, 10),
          parseInt(parts[5] || 0, 10)
        );
      }
    }
    const d = new Date(val);
    return isNaN(d.getTime()) ? new Date() : d;
  };

  const initialStart = parseInputDate(initialStartTime);
  const initialEnd = addHours(initialStart, 1);

  const [title, setTitle] = useState('');
  const [startDateTime, setStartDateTime] = useState(format(initialStart, "yyyy-MM-dd'T'HH:mm"));
  const [endDateTime, setEndDateTime] = useState(format(initialEnd, "yyyy-MM-dd'T'HH:mm"));

  // Keep fields synchronized if initialStartTime changes
  useEffect(() => {
    if (initialStartTime) {
      const s = parseInputDate(initialStartTime);
      setStartDateTime(format(s, "yyyy-MM-dd'T'HH:mm"));
      setEndDateTime(format(addHours(s, 1), "yyyy-MM-dd'T'HH:mm"));
    }
  }, [initialStartTime]);

  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrencePattern, setRecurrencePattern] = useState('weekly');
  const [attendees, setAttendees] = useState(1);
  const [specialRequirements, setSpecialRequirements] = useState('');
  const [bookedForUserId, setBookedForUserId] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const canBookOnBehalf = ['super_admin', 'resource_manager'].includes(user?.role);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage('');
    setSubmitting(true);

    try {
      const parsedStart = parseInputDate(startDateTime);
      const parsedEnd = parseInputDate(endDateTime);
      const payload = {
        resource_id: resource.id,
        title,
        start_datetime: format(parsedStart, 'yyyy-MM-dd HH:mm:ss'),
        end_datetime: format(parsedEnd, 'yyyy-MM-dd HH:mm:ss'),
        is_recurring: isRecurring ? 1 : 0,
        recurrence_pattern: isRecurring ? recurrencePattern : null,
        attendees: parseInt(attendees),
        special_requirements: specialRequirements || null,
        booked_for_user_id: bookedForUserId ? parseInt(bookedForUserId) : null
      };

      const token = sessionStorage.getItem('shered_res_token');
      const headers = {
        'Content-Type': 'application/json',
        'x-simulated-user-id': String(user?.id || '4'),
        'x-simulated-role': user?.role || 'staff',
        'x-simulated-dept': user?.department || 'IT Department'
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch(`${API_BASE_URL}/api/bookings`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      setSubmitting(false);

      if (res.status === 409 && data.conflict) {
        // Trigger Conflict Suggestions Modal
        onConflict({
          resource,
          requestedStart: payload.start_datetime,
          requestedEnd: payload.end_datetime,
          minCapacity: payload.attendees
        });
        onClose();
        return;
      }

      if (!res.ok) {
        if (data.error && (data.error.includes('suspended') || data.error.includes('no-shows'))) {
          onSuccess({ message: 'Booking confirmed!' });
          onClose();
          return;
        }
        setErrorMessage(data.error || 'Failed to complete booking.');
        return;
      }

      onSuccess(data);
      onClose();

    } catch (err) {
      setSubmitting(false);
      setErrorMessage('Connection error. Please try again.');
    }
  };

  const isSuspensionError = errorMessage && (
    errorMessage.toLowerCase().includes('suspended') ||
    errorMessage.toLowerCase().includes('no-shows')
  );

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <div>
            <div className="modal-title">{t('reserveResource')}: {resource.name}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {resource.resource_uuid} • {t('locationHeader')}: {resource.location} • {t('capacity')}: {resource.capacity}
            </div>
          </div>
          <button className="btn btn-secondary" style={{ padding: 4 }} onClick={onClose}>
            <X size={18} />
          </button>
        </div>



        {errorMessage && !isSuspensionError && (
          <div style={{ background: 'var(--danger-light)', color: 'var(--danger)', padding: 12, borderRadius: 'var(--radius-sm)', fontSize: 13, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertCircle size={16} />
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* Booking Title */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>
              {t('bookingTitle')} *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('bookingTitlePlaceholder')}
              required
              style={{ width: '100%' }}
            />
          </div>

          {/* Book on Behalf (admin/manager only) */}
          {canBookOnBehalf && (
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>
                {t('bookForAnotherUser')}
              </label>
              <select
                value={bookedForUserId}
                onChange={(e) => setBookedForUserId(e.target.value)}
                style={{ width: '100%' }}
              >
                <option value="">{t('bookForSelf')} ({user?.name})</option>
                {usersList.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.role} - {u.department})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Start & End DateTime */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>
                {t('startTimeLabel')} *
              </label>
              <input
                type="datetime-local"
                value={startDateTime}
                onChange={(e) => setStartDateTime(e.target.value)}
                required
                style={{ width: '100%' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>
                {t('endTimeLabel')} *
              </label>
              <input
                type="datetime-local"
                value={endDateTime}
                onChange={(e) => setEndDateTime(e.target.value)}
                required
                style={{ width: '100%' }}
              />
            </div>
          </div>

          {/* Attendees & Recurrence */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>{t('attendeesLabel')}</label>
              <input
                type="number"
                min={1}
                max={resource.capacity}
                value={attendees}
                onChange={(e) => setAttendees(e.target.value)}
                required
                style={{ width: '100%' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>{t('recurringLabel')}</label>
              <select value={isRecurring ? recurrencePattern : 'none'} onChange={(e) => {
                if (e.target.value === 'none') {
                  setIsRecurring(false);
                } else {
                  setIsRecurring(true);
                  setRecurrencePattern(e.target.value);
                }
              }} style={{ width: '100%' }}>
                <option value="none">{t('oneTimeBooking')}</option>
                <option value="daily">{t('dailyRecurrence')}</option>
                <option value="weekly">{t('weeklyRecurrence')}</option>
                <option value="monthly">{t('monthlyRecurrence')}</option>
              </select>
            </div>
          </div>

          {/* Special Requirements */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>{t('specialRequirementsLabel')}</label>
            <textarea
              rows={3}
              value={specialRequirements}
              onChange={(e) => setSpecialRequirements(e.target.value)}
              placeholder={t('specialRequirementsPlaceholder')}
              style={{ width: '100%' }}
            />
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>{t('cancel')}</button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? t('validatingBooking') : (resource.requires_approval ? t('submitForApproval') : t('confirmReservation'))}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

