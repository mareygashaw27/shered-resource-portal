import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useSocket } from '../context/SocketContext';
import { 
  Calendar as CalendarIcon, Clock, ChevronLeft, ChevronRight, Filter, Info, 
  Wrench, Layers, RotateCcw, X, CheckCircle2, User, Building, AlertCircle 
} from 'lucide-react';
import { 
  format, addDays, subDays, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay, 
  startOfMonth, endOfMonth, addMonths, subMonths, isSameMonth 
} from 'date-fns';
import { API_BASE_URL } from '../config';

// 3D Shiny Sphere Dot Component (matching the badge design)
function BeadDot({ type }) {
  let bg = 'radial-gradient(circle at 35% 35%, #86efac 0%, #22c55e 60%, #15803d 100%)';
  let shadow = '0 1px 2px rgba(22, 163, 74, 0.4)';

  if (type === 'booked') {
    bg = 'radial-gradient(circle at 35% 35%, #fca5a5 0%, #ef4444 60%, #b91c1c 100%)';
    shadow = '0 1px 2px rgba(220, 38, 38, 0.4)';
  } else if (type === 'pending') {
    bg = 'radial-gradient(circle at 35% 35%, #fde047 0%, #eab308 60%, #a16207 100%)';
    shadow = '0 1px 2px rgba(202, 138, 4, 0.4)';
  } else if (type === 'on_hold') {
    bg = 'radial-gradient(circle at 35% 35%, #fed7aa 0%, #f97316 60%, #c2410c 100%)';
    shadow = '0 1px 2px rgba(194, 65, 12, 0.4)';
  } else if (type === 'maintenance' || type === 'disabled') {
    bg = 'radial-gradient(circle at 35% 35%, #cbd5e1 0%, #64748b 60%, #334155 100%)';
    shadow = '0 1px 2px rgba(71, 85, 105, 0.3)';
  }

  return (
    <span
      style={{
        display: 'inline-block',
        width: 10,
        height: 10,
        borderRadius: '50%',
        background: bg,
        boxShadow: shadow,
        flexShrink: 0
      }}
    />
  );
}

export default function CalendarView() {
  const { user } = useAuth();
  const { t, lang } = useLanguage();
  const { socket } = useSocket();

  const [viewMode, setViewMode] = useState('daily'); // 'daily', 'weekly', 'monthly'
  const [currentDate, setCurrentDate] = useState(new Date());
  const [bookings, setBookings] = useState([]);
  const [resources, setResources] = useState([]);
  const [blocks, setBlocks] = useState([]);
  const [selectedResourceId, setSelectedResourceId] = useState('all');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedSlotDetails, setSelectedSlotDetails] = useState(null);



  useEffect(() => {
    fetchCalendarData();
    const interval = setInterval(fetchCalendarData, 15000);
    return () => clearInterval(interval);
  }, [currentDate, viewMode, selectedResourceId, selectedCategory]);

  // Real-time socket updates for calendar
  useEffect(() => {
    if (!socket) return;
    const handleRefresh = () => fetchCalendarData();
    socket.on('booking_created', handleRefresh);
    socket.on('booking_updated', handleRefresh);
    socket.on('approval_updated', handleRefresh);
    socket.on('resource_updated', handleRefresh);
    socket.on('calendar_updated', handleRefresh);
    socket.on('resource_deleted', handleRefresh);
    return () => {
      socket.off('booking_created', handleRefresh);
      socket.off('booking_updated', handleRefresh);
      socket.off('approval_updated', handleRefresh);
      socket.off('resource_updated', handleRefresh);
      socket.off('calendar_updated', handleRefresh);
      socket.off('resource_deleted', handleRefresh);
    };
  }, [socket]);

  const fetchCalendarData = async () => {
    try {
      const token = sessionStorage.getItem('shered_res_token');
      const headers = {
        'Authorization': token ? `Bearer ${token}` : '',
        'x-simulated-user-id': user?.id || '4',
        'x-simulated-role': user?.role || 'staff',
        'x-simulated-dept': user?.department || 'IT Department'
      };

      // Fetch resources
      const resRes = await fetch(`${API_BASE_URL}/api/resources`, { headers });
      if (resRes.ok) {
        const resData = await resRes.json();
        setResources(resData);
      }

      // Fetch bookings
      const bkRes = await fetch(`${API_BASE_URL}/api/bookings`, { headers });
      if (bkRes.ok) {
        const bkData = await bkRes.json();
        setBookings(bkData);
      }

      // Fetch maintenance blocks
      const blkRes = await fetch(`${API_BASE_URL}/api/resources/blocks`, { headers });
      if (blkRes.ok) {
        const blkData = await blkRes.json();
        setBlocks(blkData);
      }
    } catch (err) {
      console.error('Failed to fetch calendar data:', err);
    }
  };

  // Safe and deterministic date parsing for all formats (ISO, space-separated, Date objects)
  const parseSafeDate = (val) => {
    if (!val) return null;
    if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
    const s = String(val).trim();
    if (!s) return null;
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
      const iso = s.replace(' ', 'T');
      const d = new Date(iso);
      if (!isNaN(d.getTime())) return d;
      const parts = s.match(/\d+/g);
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
    return isNaN(d.getTime()) ? null : d;
  };

  // Dynamic hours calculation for Daily View
  // Standard range is 08:00 to 18:00. But if any booking on currentDate starts earlier (e.g. 06:00 or 07:00)
  // or ends later (e.g. 19:00 or 20:00), automatically expand hours so no booking is ever cut off!
  const currentDayStr = format(currentDate, 'yyyy-MM-dd');
  const activeDayBookings = bookings.filter(b => {
    if (['cancelled', 'rejected', 'no_show'].includes(b.status)) return false;
    const bStart = parseSafeDate(b.start_datetime);
    const bEnd = parseSafeDate(b.end_datetime);
    if (!bStart || !bEnd) return false;
    return format(bStart, 'yyyy-MM-dd') <= currentDayStr && format(bEnd, 'yyyy-MM-dd') >= currentDayStr;
  });

  let minH = 8;
  let maxH = 18;

  activeDayBookings.forEach(b => {
    const bStart = parseSafeDate(b.start_datetime);
    const bEnd = parseSafeDate(b.end_datetime);
    if (bStart && format(bStart, 'yyyy-MM-dd') === currentDayStr) {
      minH = Math.min(minH, bStart.getHours());
    }
    if (bEnd && format(bEnd, 'yyyy-MM-dd') === currentDayStr) {
      const endH = bEnd.getHours() + (bEnd.getMinutes() > 0 ? 1 : 0);
      maxH = Math.max(maxH, endH);
    }
  });

  minH = Math.max(6, minH);
  maxH = Math.min(22, Math.max(maxH, 18));
  const hours = Array.from({ length: (maxH - minH + 1) }, (_, i) => i + minH);

  // Navigation handlers
  const handlePrev = () => {
    if (viewMode === 'daily') {
      setCurrentDate(subDays(currentDate, 1));
    } else if (viewMode === 'weekly') {
      setCurrentDate(subDays(currentDate, 7));
    } else if (viewMode === 'monthly') {
      setCurrentDate(subMonths(currentDate, 1));
    }
  };

  const handleNext = () => {
    if (viewMode === 'daily') {
      setCurrentDate(addDays(currentDate, 1));
    } else if (viewMode === 'weekly') {
      setCurrentDate(addDays(currentDate, 7));
    } else if (viewMode === 'monthly') {
      setCurrentDate(addMonths(currentDate, 1));
    }
  };

  // Get distinct categories from resources
  const categories = Array.from(new Set(resources.map(r => r.category).filter(Boolean)));

  // Filter resources by category, resource ID, and department head scope
  const filteredResources = resources.filter(r => {
    if (user?.role === 'department_head') {
      const dept = (user.department || '').toLowerCase();
      if (dept.includes('meeting room') || dept.includes('room')) {
        if (r.type !== 'meeting_room' && r.type !== 'room') return false;
      } else if (dept.includes('conference')) {
        if (r.type !== 'conference_hall') return false;
      } else if (dept.includes('training') || dept.includes('lab')) {
        if (r.type !== 'training_lab' && r.type !== 'lab') return false;
      } else if (dept.includes('vehicle') || dept.includes('fleet')) {
        if (r.type !== 'vehicle') return false;
      } else if (dept.includes('equipment')) {
        if (r.type !== 'equipment') return false;
      }
    }
    const matchCategory = selectedCategory === 'all' || r.category === selectedCategory;
    const matchResource = selectedResourceId === 'all' || String(r.id) === String(selectedResourceId);
    return matchCategory && matchResource;
  });

  // Reset category handler that also cleans selectedResourceId to prevent empty views
  const handleCategoryChange = (newCat) => {
    setSelectedCategory(newCat);
    setSelectedResourceId('all');
  };

  const handleResetFilters = () => {
    setSelectedCategory('all');
    setSelectedResourceId('all');
  };

  // Calculate week range for weekly view
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 });
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });

  // Calculate month range for monthly view grid
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const monthGridStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const monthGridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
  const monthDays = eachDayOfInterval({ start: monthGridStart, end: monthGridEnd });

  // Robust helper to check slot status for a specific resource, date, and hour
  // Note: "Closed" status is completely removed per user request.
  const getSlotStatus = (resource, dateObj, h) => {
    // 0. Check if resource itself is disabled or set to maintenance (GRAY)
    if (resource.is_active === 0 || resource.status === 'maintenance' || resource.status === 'disabled') {
      return {
        type: 'maintenance',
        label: resource.status === 'disabled' 
          ? (lang === 'am' ? 'የተዘጋ' : 'Disabled') 
          : (lang === 'am' ? 'ጥገና ላይ' : 'Maintenance'),
        resource
      };
    }

    const dayStr = format(dateObj, 'yyyy-MM-dd');
    const slotStart = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate(), h, 0, 0);
    const slotEnd = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate(), h, 59, 59);

    // 1. CHECK BOOKINGS (FIRST PRIORITY)
    const bkMatch = bookings.find(b => {
      if (String(b.resource_id) !== String(resource.id)) return false;
      if (['cancelled', 'rejected', 'no_show'].includes(b.status)) return false;
      const bStart = parseSafeDate(b.start_datetime);
      const bEnd = parseSafeDate(b.end_datetime);
      if (!bStart || !bEnd) return false;

      const bStartDay = format(bStart, 'yyyy-MM-dd');
      const bEndDay = format(bEnd, 'yyyy-MM-dd');
      const isDateActive = (bStartDay <= dayStr && bEndDay >= dayStr);
      if (!isDateActive) return false;

      // Hour overlap check
      return (slotStart.getTime() < bEnd.getTime() && slotEnd.getTime() > bStart.getTime());
    });

    if (bkMatch) {
      if (bkMatch.status === 'pending') {
        return { type: 'pending', label: bkMatch.title, user: bkMatch.user_name, data: bkMatch, resource };
      }
      if (bkMatch.status === 'on_hold') {
        return { type: 'on_hold', label: `⏸️ ${bkMatch.title}`, user: bkMatch.user_name, data: bkMatch, resource };
      }
      return { type: 'booked', label: bkMatch.title, user: bkMatch.user_name, data: bkMatch, resource };
    }

    // 2. CHECK MAINTENANCE BLOCKS
    const blockMatch = blocks.find(b => {
      if (String(b.resource_id) !== String(resource.id)) return false;
      const bStart = parseSafeDate(b.start_time);
      const bEnd = parseSafeDate(b.end_time);
      if (!bStart || !bEnd) return false;

      const bStartDay = format(bStart, 'yyyy-MM-dd');
      const bEndDay = format(bEnd, 'yyyy-MM-dd');
      const isDateActive = (bStartDay <= dayStr && bEndDay >= dayStr);
      if (!isDateActive) return false;

      return (slotStart.getTime() < bEnd.getTime() && slotEnd.getTime() > bStart.getTime());
    });

    if (blockMatch) {
      return { 
        type: 'maintenance', 
        label: blockMatch.reason || (lang === 'am' ? 'ጥገና ላይ' : 'Maintenance'), 
        data: blockMatch,
        resource 
      };
    }

    // 3. FREE (AVAILABLE) — Never show "Closed"
    return { type: 'available', label: t('available') || (lang === 'am' ? 'ክፍት' : 'Available'), resource };
  };

  // Helper to calculate daily summary for a date across resources
  const getDaySummaryForResources = (dayDate) => {
    const dayStr = format(dayDate, 'yyyy-MM-dd');
    let bookedCount = 0;
    let pendingCount = 0;
    let maintenanceCount = 0;
    let availableCount = 0;

    filteredResources.forEach(r => {
      if (r.is_active === 0 || r.status === 'maintenance' || r.status === 'disabled') {
        maintenanceCount++;
        return;
      }

      const hasBlock = blocks.some(b => {
        if (String(b.resource_id) !== String(r.id)) return false;
        const bStart = parseSafeDate(b.start_time);
        const bEnd = parseSafeDate(b.end_time);
        if (!bStart || !bEnd) return false;
        return format(bStart, 'yyyy-MM-dd') <= dayStr && format(bEnd, 'yyyy-MM-dd') >= dayStr;
      });

      if (hasBlock) {
        maintenanceCount++;
        return;
      }

      const dayBookings = bookings.filter(b => {
        if (String(b.resource_id) !== String(r.id)) return false;
        if (['cancelled', 'rejected', 'no_show'].includes(b.status)) return false;
        const bStart = parseSafeDate(b.start_datetime);
        const bEnd = parseSafeDate(b.end_datetime);
        if (!bStart || !bEnd) return false;
        return format(bStart, 'yyyy-MM-dd') <= dayStr && format(bEnd, 'yyyy-MM-dd') >= dayStr;
      });

      if (dayBookings.some(b => b.status === 'confirmed' || b.status === 'checked_in')) {
        bookedCount++;
      } else if (dayBookings.some(b => b.status === 'pending' || b.status === 'on_hold')) {
        pendingCount++;
      } else {
        availableCount++;
      }
    });

    return { bookedCount, pendingCount, maintenanceCount, availableCount };
  };

  // Slot click handler
  // Clicking "Available" does NOT create bookings (per user request).
  // Clicking "Booked" opens Slot Details where the organizer can extend their meeting.
  const handleSlotClick = (resource, h, slot) => {
    if (slot.type === 'available') {
      return; // Do nothing when clicking Available
    }

    setSelectedSlotDetails({
      resource,
      slot,
      hour: h,
      isoSlot: `${format(currentDate, 'yyyy-MM-dd')}T${h < 10 ? '0' + h : h}:00:00`,
      dateFormatted: format(currentDate, 'EEEE, MMMM d, yyyy')
    });
  };

  return (
    <div>
      {/* Calendar Header Controls */}
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)',
        padding: 16, marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: 16
      }}>
        {/* Navigation buttons, direct date picker and date label */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn btn-secondary" onClick={handlePrev} title={lang === 'am' ? 'ያለፈው' : 'Previous'}>
            <ChevronLeft size={16} />
          </button>
          <button className="btn btn-secondary" onClick={() => setCurrentDate(new Date())}>
            {t('today') || (lang === 'am' ? 'ዛሬ' : 'Today')}
          </button>
          <button className="btn btn-secondary" onClick={handleNext} title={lang === 'am' ? 'ቀጣዩ' : 'Next'}>
            <ChevronRight size={16} />
          </button>

          {/* Quick Date Picker */}
          <input 
            type="date"
            value={format(currentDate, 'yyyy-MM-dd')}
            onChange={(e) => {
              if (e.target.value) {
                const parts = e.target.value.split('-').map(Number);
                setCurrentDate(new Date(parts[0], parts[1] - 1, parts[2]));
              }
            }}
            style={{
              padding: '5px 10px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-color)',
              fontSize: 13,
              background: 'var(--bg-main)',
              color: 'var(--text-main)'
            }}
            title={lang === 'am' ? 'ቀን ይምረጡ' : 'Jump to date'}
          />

          <span style={{ fontSize: 16, fontWeight: 700, marginLeft: 4, minWidth: 210 }}>
            {viewMode === 'daily' && format(currentDate, 'EEEE, MMMM d, yyyy')}
            {viewMode === 'weekly' && `${format(weekStart, 'MMM d')} - ${format(weekEnd, 'MMM d, yyyy')}`}
            {viewMode === 'monthly' && format(currentDate, 'MMMM yyyy')}
          </span>
        </div>

        {/* Filters & View Switcher */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Category Filter */}
          <select 
            value={selectedCategory} 
            onChange={(e) => handleCategoryChange(e.target.value)} 
            style={{ padding: '6px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', fontSize: 13 }}
          >
            <option value="all">{lang === 'am' ? 'ሁሉም ምድቦች' : 'All Categories'}</option>
            {categories.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>

          {/* Resource Filter */}
          <select 
            value={selectedResourceId} 
            onChange={(e) => setSelectedResourceId(e.target.value)} 
            style={{ padding: '6px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', fontSize: 13, maxWidth: 190 }}
          >
            <option value="all">{t('allResourcesFilter') || (lang === 'am' ? 'ሁሉም እቃዎች/ክፍሎች' : 'All Resources')}</option>
            {resources
              .filter(r => selectedCategory === 'all' || r.category === selectedCategory)
              .map(r => (
                <option key={r.id} value={r.id}>{r.name} ({r.resource_uuid})</option>
              ))}
          </select>

          {/* Reset Filters Button */}
          {(selectedCategory !== 'all' || selectedResourceId !== 'all') && (
            <button 
              className="btn btn-secondary" 
              onClick={handleResetFilters}
              title={lang === 'am' ? 'ማጣሪያ አጥፋ' : 'Reset filters'}
              style={{ padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}
            >
              <RotateCcw size={13} />
              <span>{lang === 'am' ? 'ዳግም ጀምር' : 'Reset'}</span>
            </button>
          )}

          {/* View Switcher Tabs (Daily, Weekly, Monthly) */}
          <div style={{ display: 'flex', background: 'var(--bg-main)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', padding: 2 }}>
            <button className={`btn ${viewMode === 'daily' ? 'btn-primary' : 'btn-secondary'}`} style={{ padding: '4px 12px', fontSize: 12 }} onClick={() => setViewMode('daily')}>
              {t('daily') || (lang === 'am' ? 'ዕለታዊ' : 'Daily')}
            </button>
            <button className={`btn ${viewMode === 'weekly' ? 'btn-primary' : 'btn-secondary'}`} style={{ padding: '4px 12px', fontSize: 12 }} onClick={() => setViewMode('weekly')}>
              {t('weekly') || (lang === 'am' ? 'ሳምንታዊ' : 'Weekly')}
            </button>
            <button className={`btn ${viewMode === 'monthly' ? 'btn-primary' : 'btn-secondary'}`} style={{ padding: '4px 12px', fontSize: 12 }} onClick={() => setViewMode('monthly')}>
              {t('monthly') || (lang === 'am' ? 'ወርሃዊ' : 'Monthly')}
            </button>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 1. DAILY VIEW: Hour-by-Hour Grid (Clean, with no "Closed" slots) */}
      {/* ------------------------------------------------------------- */}
      {viewMode === 'daily' && (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: 16 }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table" style={{ margin: 0, minWidth: '100%' }}>
              <thead>
                <tr>
                  <th style={{ width: 220, position: 'sticky', left: 0, background: 'var(--bg-card)', zIndex: 2 }}>
                    {t('resourceName') || (lang === 'am' ? 'የእቃ/ክፍል ስም' : 'Resource Name')}
                  </th>
                  {hours.map(h => (
                    <th key={h} style={{ textAlign: 'center', minWidth: 105, padding: '10px 8px' }}>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>
                        {h < 10 ? '0' + h : h}:00
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                        {h < 12 ? 'AM' : 'PM'}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredResources.length === 0 ? (
                  <tr>
                    <td colSpan={hours.length + 1} style={{ textAlign: 'center', padding: 36, color: 'var(--text-muted)' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                        <AlertCircle size={28} style={{ color: 'var(--text-muted)' }} />
                        <div style={{ fontWeight: 600 }}>
                          {lang === 'am' ? 'በተመረጠው ማጣሪያ ምንም እቃ/ክፍል አልተገኘም' : 'No resources found matching the selected filters.'}
                        </div>
                        <button className="btn btn-secondary" onClick={handleResetFilters} style={{ fontSize: 12, marginTop: 4 }}>
                          {lang === 'am' ? 'ሁሉንም እቃዎች አሳይ' : 'Show All Resources'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredResources.map(r => (
                    <tr key={r.id}>
                      <td style={{ fontWeight: 600, position: 'sticky', left: 0, background: 'var(--bg-card)', zIndex: 1, borderRight: '1px solid var(--border-color)' }}>
                        <div>{r.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{r.resource_uuid} • {r.category}</div>
                      </td>
                      {hours.map(h => {
                        const slot = getSlotStatus(r, currentDate, h);

                        let bg = '#ecfdf5';
                        let color = '#065f46';
                        let border = '1px solid #a7f3d0';
                        let labelText = lang === 'am' ? 'ክፍት' : 'Available';

                        if (slot.type === 'booked') {
                          bg = '#fef2f2';
                          color = '#991b1b';
                          border = '1px solid #fecaca';
                          labelText = lang === 'am' ? 'ተይዟል' : 'Booked';
                        } else if (slot.type === 'pending') {
                          bg = '#fffbeb';
                          color = '#92400e';
                          border = '1px solid #fde68a';
                          labelText = lang === 'am' ? 'ይሁንታ' : 'Pending';
                        } else if (slot.type === 'on_hold') {
                          bg = '#fef3c7';
                          color = '#d97706';
                          border = '1px solid #f59e0b';
                          labelText = lang === 'am' ? 'በመጠባበቅ' : 'On Hold';
                        } else if (slot.type === 'maintenance') {
                          bg = '#f1f5f9';
                          color = '#475569';
                          border = '1px solid #cbd5e1';
                          labelText = lang === 'am' ? 'ጥገና' : 'Maintenance';
                        }

                        const isClickable = slot.type !== 'available';

                        return (
                          <td
                            key={h}
                            style={{ 
                              padding: '6px 6px', 
                              textAlign: 'center', 
                              cursor: isClickable ? 'pointer' : 'default' 
                            }}
                            onClick={() => handleSlotClick(r, h, slot)}
                          >
                            <div
                              style={{
                                background: bg,
                                color: color,
                                border: border,
                                borderRadius: 8,
                                padding: '7px 10px',
                                fontSize: 12,
                                fontWeight: 600,
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 7,
                                width: '100%',
                                boxSizing: 'border-box',
                                boxShadow: '0 1px 2px rgba(0, 0, 0, 0.04)',
                                transition: 'transform 0.1s ease, box-shadow 0.1s ease',
                                opacity: isClickable ? 1 : 0.95
                              }}
                              title={
                                slot.type === 'available'
                                  ? (lang === 'am' ? 'ክፍት ሰዓት' : 'Available')
                                  : slot.user 
                                    ? `${slot.label} (by ${slot.user}) - ${lang === 'am' ? 'ዝርዝር መረጃ ለማየት ጠቅ ያድርጉ' : 'Click to view details'}`
                                    : `${slot.label} - ${lang === 'am' ? 'ዝርዝር መረጃ ለማየት ጠቅ ያድርጉ' : 'Click to view details'}`
                              }
                            >
                              <BeadDot type={slot.type} />
                              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {labelText}
                              </span>
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 2. WEEKLY VIEW: Resources in Category across days of the week */}
      {/* ------------------------------------------------------------- */}
      {viewMode === 'weekly' && (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', overflowX: 'auto' }}>
          <table className="data-table" style={{ margin: 0 }}>
            <thead>
              <tr>
                <th style={{ width: 220 }}>{t('resourceName') || (lang === 'am' ? 'የእቃ/ክፍል ስም' : 'Resource Name')}</th>
                {weekDays.map(day => (
                  <th key={day.toString()} style={{ textAlign: 'center', minWidth: 110, background: isSameDay(day, new Date()) ? 'var(--primary-light)' : 'transparent' }}>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{format(day, 'EEE')}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{format(day, 'MMM d')}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredResources.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: 36, color: 'var(--text-muted)' }}>
                    {lang === 'am' ? 'በተመረጠው ማጣሪያ ምንም እቃ/ክፍል አልተገኘም' : 'No resources found for the selected category/filters.'}
                  </td>
                </tr>
              ) : (
                filteredResources.map(r => (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 600 }}>
                      <div>{r.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{r.resource_uuid} • {r.category}</div>
                    </td>
                    {weekDays.map(day => {
                      const dayStr = format(day, 'yyyy-MM-dd');

                      // Check if resource is itself disabled or maintenance
                      const isResourceDisabled = r.is_active === 0 || r.status === 'maintenance' || r.status === 'disabled';

                      // Day status for this resource
                      const hasBlock = !isResourceDisabled && blocks.some(b => {
                        if (String(b.resource_id) !== String(r.id)) return false;
                        const bStart = parseSafeDate(b.start_time);
                        const bEnd = parseSafeDate(b.end_time);
                        if (!bStart || !bEnd) return false;
                        return format(bStart, 'yyyy-MM-dd') <= dayStr && format(bEnd, 'yyyy-MM-dd') >= dayStr;
                      });

                      const dayBookings = bookings.filter(b => {
                        if (String(b.resource_id) !== String(r.id)) return false;
                        if (['cancelled', 'rejected', 'no_show'].includes(b.status)) return false;
                        const bStart = parseSafeDate(b.start_datetime);
                        const bEnd = parseSafeDate(b.end_datetime);
                        if (!bStart || !bEnd) return false;
                        return format(bStart, 'yyyy-MM-dd') <= dayStr && format(bEnd, 'yyyy-MM-dd') >= dayStr;
                      });

                      const confirmedBks = dayBookings.filter(b => b.status === 'confirmed' || b.status === 'checked_in');
                      const pendingBks = dayBookings.filter(b => b.status === 'pending' || b.status === 'on_hold');

                      return (
                        <td
                          key={day.toString()}
                          style={{
                            padding: '6px 6px',
                            textAlign: 'center',
                            cursor: 'pointer',
                            background: isSameDay(day, currentDate) ? '#f8fafc' : 'transparent'
                          }}
                          onClick={() => {
                            setCurrentDate(day);
                            setSelectedResourceId(String(r.id));
                            setViewMode('daily');
                          }}
                          title={lang === 'am' ? 'የቀን ሰዓት ሰሌዳውን ለማየት ጠቅ ያድርጉ' : 'Click to view daily hour grid'}
                        >
                          {isResourceDisabled ? (
                            <div style={{ background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1', borderRadius: 8, padding: '7px 10px', fontSize: 12, fontWeight: 600, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, width: '100%' }}>
                              <BeadDot type="disabled" />
                              <span>{lang === 'am' ? 'የተዘጋ' : 'Disabled'}</span>
                            </div>
                          ) : hasBlock ? (
                            <div style={{ background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1', borderRadius: 8, padding: '7px 10px', fontSize: 12, fontWeight: 600, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, width: '100%' }}>
                              <BeadDot type="maintenance" />
                              <span>{lang === 'am' ? 'ጥገና' : 'Maintenance'}</span>
                            </div>
                          ) : confirmedBks.length > 0 ? (
                            <div style={{ background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca', borderRadius: 8, padding: '7px 10px', fontSize: 12, fontWeight: 600, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, width: '100%' }}>
                              <BeadDot type="booked" />
                              <span>{confirmedBks.length} {lang === 'am' ? 'ተይዟል' : 'Booked'}</span>
                            </div>
                          ) : pendingBks.length > 0 ? (
                            <div style={{ background: '#fffbeb', color: '#92400e', border: '1px solid #fde68a', borderRadius: 8, padding: '7px 10px', fontSize: 12, fontWeight: 600, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, width: '100%' }}>
                              <BeadDot type="pending" />
                              <span>{pendingBks.length} {lang === 'am' ? 'ይሁንታ' : 'Pending'}</span>
                            </div>
                          ) : (
                            <div style={{ background: '#ecfdf5', color: '#065f46', border: '1px solid #a7f3d0', borderRadius: 8, padding: '7px 10px', fontSize: 12, fontWeight: 600, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, width: '100%' }}>
                              <BeadDot type="available" />
                              <span>{lang === 'am' ? 'ክፍት' : 'Available'}</span>
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 3. MONTHLY VIEW: Overview of Busy/Available Days */}
      {/* ------------------------------------------------------------- */}
      {viewMode === 'monthly' && (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: 16 }}>
          {/* Day of Week Headers */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8, marginBottom: 8, textAlign: 'center', fontWeight: 700, fontSize: 13, color: 'var(--text-muted)' }}>
            <div>Sun</div><div>Mon</div><div>Tue</div><div>Wed</div><div>Thu</div><div>Fri</div><div>Sat</div>
          </div>

          {/* Month Days Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8 }}>
            {monthDays.map(day => {
              const isCurrentMonth = isSameMonth(day, currentDate);
              const isToday = isSameDay(day, new Date());
              const isSelected = isSameDay(day, currentDate);

              const summary = getDaySummaryForResources(day);

              return (
                <div
                  key={day.toString()}
                  onClick={() => {
                    setCurrentDate(day);
                    setViewMode('daily');
                  }}
                  style={{
                    background: isCurrentMonth ? 'var(--bg-card)' : 'var(--bg-main)',
                    opacity: isCurrentMonth ? 1 : 0.4,
                    border: `1px solid ${isSelected ? 'var(--primary)' : isToday ? '#2563eb' : 'var(--border-color)'}`,
                    borderRadius: 'var(--radius-md)',
                    padding: 10,
                    minHeight: 85,
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    boxShadow: isSelected ? '0 0 0 2px var(--primary-light)' : 'none',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{
                      fontWeight: isToday ? 800 : 600,
                      fontSize: 13,
                      color: isToday ? '#2563eb' : 'var(--text-main)',
                      background: isToday ? '#eff6ff' : 'transparent',
                      padding: '2px 6px',
                      borderRadius: 10
                    }}>
                      {format(day, 'd')}
                    </span>
                    {summary.maintenanceCount > 0 && (
                      <span style={{ fontSize: 10, background: '#f1f5f9', color: '#475569', padding: '1px 5px', borderRadius: 4, fontWeight: 600 }}>
                        {lang === 'am' ? 'ጥገና' : 'Gray'}
                      </span>
                    )}
                  </div>

                  {/* Summary Indicators */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 6 }}>
                    {summary.bookedCount > 0 && (
                      <div style={{ fontSize: 10, background: '#fef2f2', color: '#991b1b', padding: '2px 4px', borderRadius: 4, fontWeight: 600 }}>
                        🔴 {summary.bookedCount} {lang === 'am' ? 'ተይዟል' : 'Booked'}
                      </div>
                    )}
                    {summary.pendingCount > 0 && (
                      <div style={{ fontSize: 10, background: '#fffbeb', color: '#92400e', padding: '2px 4px', borderRadius: 4, fontWeight: 600 }}>
                        🟡 {summary.pendingCount} {lang === 'am' ? 'ይሁንታ' : 'Pending'}
                      </div>
                    )}
                    {summary.bookedCount === 0 && summary.pendingCount === 0 && summary.maintenanceCount === 0 && (
                      <div style={{ fontSize: 10, background: '#ecfdf5', color: '#065f46', padding: '2px 4px', borderRadius: 4, fontWeight: 600 }}>
                        🟢 {lang === 'am' ? 'ክፍት' : 'Free'} ({summary.availableCount})
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 4. SLOT DETAILS MODAL (Interactive info & Extend for Bookings) */}
      {/* ------------------------------------------------------------- */}
      {selectedSlotDetails && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: 16
        }}>
          <div style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-lg, 12px)',
            maxWidth: 490,
            width: '100%',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            overflow: 'hidden'
          }}>
            {/* Modal Header */}
            <div style={{
              padding: '16px 20px',
              borderBottom: '1px solid var(--border-color)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'var(--bg-main)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <CalendarIcon size={18} style={{ color: 'var(--primary)' }} />
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
                  {lang === 'am' ? 'የተያዘው ሰዓት ዝርዝር' : 'Booking Details'}
                </h3>
              </div>
              <button 
                onClick={() => setSelectedSlotDetails(null)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Resource Info */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {lang === 'am' ? 'የተመረጠው እቃ/ክፍል' : 'Resource'}
                </div>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-main)' }}>
                  {selectedSlotDetails.resource.name}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {selectedSlotDetails.resource.resource_uuid} • {selectedSlotDetails.resource.category}
                  {selectedSlotDetails.resource.location && ` • ${selectedSlotDetails.resource.location}`}
                </div>
              </div>

              {/* Time and Date */}
              <div style={{
                background: 'var(--bg-main)',
                padding: '12px 14px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-color)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Clock size={16} style={{ color: 'var(--primary)' }} />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{selectedSlotDetails.dateFormatted}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {selectedSlotDetails.slot.data?.start_datetime 
                        ? `${String(selectedSlotDetails.slot.data.start_datetime).substring(11, 16)} - ${String(selectedSlotDetails.slot.data.end_datetime).substring(11, 16)}`
                        : `${selectedSlotDetails.hour < 10 ? '0' + selectedSlotDetails.hour : selectedSlotDetails.hour}:00 - ${selectedSlotDetails.hour + 1 < 10 ? '0' + (selectedSlotDetails.hour + 1) : selectedSlotDetails.hour + 1}:00`}
                    </div>
                  </div>
                </div>

                {/* Status Badge */}
                <div>
                  {selectedSlotDetails.slot.type === 'booked' && (
                    <span style={{ background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca', padding: '4px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <BeadDot type="booked" />
                      <span>{lang === 'am' ? 'ተይዟል' : 'Booked'}</span>
                    </span>
                  )}
                  {selectedSlotDetails.slot.type === 'pending' && (
                    <span style={{ background: '#fffbeb', color: '#92400e', border: '1px solid #fde68a', padding: '4px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <BeadDot type="pending" />
                      <span>{lang === 'am' ? 'ይሁንታ ይጠብቃል' : 'Pending Approval'}</span>
                    </span>
                  )}
                  {selectedSlotDetails.slot.type === 'on_hold' && (
                    <span style={{ background: '#fef3c7', color: '#d97706', border: '1px solid #f59e0b', padding: '4px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <BeadDot type="on_hold" />
                      <span>{lang === 'am' ? 'በመጠባበቅ ላይ' : 'On Hold'}</span>
                    </span>
                  )}
                  {selectedSlotDetails.slot.type === 'maintenance' && (
                    <span style={{ background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1', padding: '4px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <BeadDot type="maintenance" />
                      <span>{lang === 'am' ? 'ጥገና ላይ' : 'Maintenance'}</span>
                    </span>
                  )}
                </div>
              </div>

              {/* Booking Specific Details */}
              {selectedSlotDetails.slot.data && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {selectedSlotDetails.slot.data.title && (
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{lang === 'am' ? 'የስብሰባ/ቦታው ርዕስ' : 'Booking Title'}</div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{selectedSlotDetails.slot.data.title}</div>
                    </div>
                  )}

                  {selectedSlotDetails.slot.data.user_name && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <User size={15} style={{ color: 'var(--text-muted)' }} />
                      <div style={{ fontSize: 13 }}>
                        <span style={{ fontWeight: 600 }}>{selectedSlotDetails.slot.data.user_name}</span>
                        {selectedSlotDetails.slot.data.user_department && (
                          <span style={{ color: 'var(--text-muted)' }}> ({selectedSlotDetails.slot.data.user_department})</span>
                        )}
                      </div>
                    </div>
                  )}

                  {selectedSlotDetails.slot.data.reason && (
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{lang === 'am' ? 'የጥገና ምክንያት' : 'Maintenance Reason'}</div>
                      <div style={{ fontSize: 13 }}>{selectedSlotDetails.slot.data.reason}</div>
                    </div>
                  )}

                  {selectedSlotDetails.slot.data.special_requirements && (
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{lang === 'am' ? 'ልዩ ፍላጎት' : 'Requirements'}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                        {selectedSlotDetails.slot.data.special_requirements}
                      </div>
                    </div>
                  )}

                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div style={{
              padding: '12px 20px',
              borderTop: '1px solid var(--border-color)',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 8,
              background: 'var(--bg-main)'
            }}>
              <button 
                className="btn btn-secondary" 
                onClick={() => setSelectedSlotDetails(null)}
              >
                {lang === 'am' ? 'ዝጋ' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
