import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { AlertTriangle, Clock, MapPin, ArrowRight, UserCheck, X } from 'lucide-react';
import { API_BASE_URL } from '../config';

export default function ConflictModal({ conflictData, onClose, onSelectAlternative, onJoinedWaitlist }) {
  const { user } = useAuth();
  const { t } = useLanguage();
  const { resource, requestedStart, requestedEnd, minCapacity } = conflictData;

  const [nextSlot, setNextSlot] = useState(null);
  const [adjacentSlots, setAdjacentSlots] = useState([]);
  const [alternatives, setAlternatives] = useState([]);
  const [loading, setLoading] = useState(true);
  const [waitlistStatus, setWaitlistStatus] = useState('');

  useEffect(() => {
    fetchSuggestions();
  }, []);

  const fetchSuggestions = async () => {
    try {
      const headers = {
        'x-simulated-user-id': user?.id || '4',
        'x-simulated-role': user?.role || 'staff',
        'x-simulated-dept': user?.department || 'IT Department'
      };

      // Fetch Next Available & Adjacent
      const nextRes = await fetch(`${API_BASE_URL}/api/resources/${resource.id}/next-available?start=${encodeURIComponent(requestedStart)}&end=${encodeURIComponent(requestedEnd)}`, { headers });
      if (nextRes.ok) {
        const nextData = await nextRes.json();
        setNextSlot(nextData.nextAvailableSlot);
        setAdjacentSlots(nextData.adjacentSlots || []);
      }

      // Fetch Alternatives
      const altRes = await fetch(`${API_BASE_URL}/api/resources/alternatives`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ resourceId: resource.id, start: requestedStart, end: requestedEnd, minCapacity: minCapacity || 1 })
      });
      if (altRes.ok) {
        const altData = await altRes.json();
        setAlternatives(altData);
      }

    } catch (err) {
      console.error('Failed to fetch conflict suggestions:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleJoinWaitlist = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/waitlist`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-simulated-user-id': user?.id || '4',
          'x-simulated-role': user?.role || 'staff',
          'x-simulated-dept': user?.department || 'IT Department'
        },
        body: JSON.stringify({
          resourceId: resource.id,
          desiredStart: requestedStart,
          desiredEnd: requestedEnd
        })
      });

      if (res.ok) {
        setWaitlistStatus(t('waitlistAdded'));
        setTimeout(() => {
          onJoinedWaitlist();
          onClose();
        }, 1500);
      }
    } catch (err) {
      console.error('Waitlist error:', err);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: 640 }}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ background: 'var(--danger-light)', color: 'var(--danger)', padding: 8, borderRadius: 'var(--radius-sm)' }}>
              <AlertTriangle size={20} />
            </div>
            <div>
              <div className="modal-title" style={{ color: 'var(--danger)' }}>{t('conflictDetectedTitle')}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {t('conflictDetectedDesc')}
              </div>
            </div>
          </div>
          <button className="btn btn-secondary" style={{ padding: 4 }} onClick={onClose}><X size={18} /></button>
        </div>

        {waitlistStatus && (
          <div style={{ background: 'var(--success-light)', color: 'var(--success)', padding: 12, borderRadius: 'var(--radius-sm)', fontSize: 13, marginBottom: 16 }}>
            {waitlistStatus}
          </div>
        )}

        {loading ? (
          <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)' }}>
            Calculating next available times & alternative resources...
          </div>
        ) : (
          <div>
            {/* Smart Suggestion 1: Next Available Slot */}
            {nextSlot && (
              <div style={{ background: 'var(--bg-main)', border: '1px solid var(--primary)', borderRadius: 'var(--radius-md)', padding: 16, marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--primary)', marginBottom: 4 }}>
                  {t('recommendedNextSlot')}
                </div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>
                  {nextSlot.start} to {nextSlot.end}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                  ({resource.name})
                </div>
              </div>
            )}

            {/* Smart Suggestion 2: Adjacent Slots */}
            {adjacentSlots.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>{t('suggestedAdjacent')}</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {adjacentSlots.map((adj, idx) => (
                    <button
                      key={idx}
                      className="btn btn-secondary"
                      style={{ fontSize: 12 }}
                      onClick={() => onSelectAlternative(resource, adj.start, adj.end)}
                    >
                      <Clock size={12} /> {adj.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Smart Suggestion 3: Alternative Resources */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>{t('alternativeResources')}</div>
              {alternatives.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('noResourcesFound')}</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {alternatives.map(alt => (
                    <div key={alt.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg-main)', padding: '10px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{alt.name} ({alt.resource_uuid})</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          <MapPin size={10} style={{ verticalAlign: 'middle', marginRight: 4 }} />{alt.location} • {t('capacity')}: {alt.capacity}
                        </div>
                      </div>
                      <button
                        className="btn btn-primary"
                        style={{ fontSize: 12, padding: '4px 10px' }}
                        onClick={() => onSelectAlternative(alt, requestedStart, requestedEnd)}
                      >
                        {t('reserveResource')} <ArrowRight size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Smart Suggestion 4: Join Waitlist */}
            <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{t('joinWaitlistQuestion')}</div>
              </div>
              <button className="btn btn-secondary" onClick={handleJoinWaitlist}>
                <UserCheck size={14} /> {t('joinWaitlist')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
