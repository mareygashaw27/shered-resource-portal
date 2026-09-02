/**
 * Utility for resource images.
 * Priority:
 * 1. User-provided image_url (custom URL or uploaded file/base64).
 * 2. High-quality real photo image fallback for the resource category if no image was provided or image fails to load.
 */

export const DEFAULT_RESOURCE_IMAGES = {
  vehicle: 'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&w=800&q=80',
  equipment: 'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?auto=format&fit=crop&w=800&q=80',
  training_lab: 'https://images.unsplash.com/photo-1517502884422-41eaead166d4?auto=format&fit=crop&w=800&q=80',
  conference_hall: 'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=800&q=80',
  meeting_room: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=800&q=80',
  default: 'https://images.unsplash.com/photo-1497215728101-856f4ea42174?auto=format&fit=crop&w=800&q=80'
};

export const getDefaultResourceImage = (type, category) => {
  const t = (type || '').toLowerCase();
  const c = (category || '').toLowerCase();

  if (t === 'vehicle' || t === 'car' || c.includes('vehicle') || c.includes('car') || c.includes('suv') || c.includes('sedan') || c.includes('fleet')) {
    return DEFAULT_RESOURCE_IMAGES.vehicle;
  }
  if (t === 'equipment' || c.includes('equipment') || c.includes('presentation') || c.includes('gear') || c.includes('laptop') || c.includes('device')) {
    return DEFAULT_RESOURCE_IMAGES.equipment;
  }
  if (t === 'training_lab' || t === 'lab' || c.includes('lab') || c.includes('training') || c.includes('computer')) {
    return DEFAULT_RESOURCE_IMAGES.training_lab;
  }
  if (t === 'conference_hall' || t === 'conference' || c.includes('conference') || c.includes('hall') || c.includes('auditorium')) {
    return DEFAULT_RESOURCE_IMAGES.conference_hall;
  }
  if (t === 'meeting_room' || t === 'room' || c.includes('room') || c.includes('meeting') || c.includes('huddle') || c.includes('pod')) {
    return DEFAULT_RESOURCE_IMAGES.meeting_room;
  }

  return DEFAULT_RESOURCE_IMAGES.default;
};

export const normalizeImageUrl = (url) => {
  if (!url || typeof url !== 'string') return '';
  let trimmed = url.trim();

  // Handle Google Image search page links (e.g. https://www.google.com/imgres?imgurl=...)
  if (trimmed.includes('google.com/imgres') || trimmed.includes('google.com/search')) {
    try {
      const urlObj = new URL(trimmed);
      const imgurl = urlObj.searchParams.get('imgurl');
      if (imgurl) {
        return decodeURIComponent(imgurl);
      }
    } catch (e) {
      // fallback regex search for imgurl=
      const match = trimmed.match(/[?&]imgurl=([^&]+)/);
      if (match && match[1]) {
        return decodeURIComponent(match[1]);
      }
    }
  }

  // Handle Google Drive file view links (e.g. https://drive.google.com/file/d/FILE_ID/view...)
  if (trimmed.includes('drive.google.com/file/d/')) {
    const match = trimmed.match(/\/file\/d\/([^\/]+)/);
    if (match && match[1]) {
      return `https://lh3.googleusercontent.com/d/${match[1]}`;
    }
  }

  return trimmed;
};

export const getResourceImage = (resource) => {
  if (resource && resource.image_url && typeof resource.image_url === 'string') {
    const norm = normalizeImageUrl(resource.image_url);
    if (norm && norm !== '📁 [Uploaded File]' && norm !== '[Uploaded File]') {
      return norm;
    }
  }
  return getDefaultResourceImage(resource?.type, resource?.category);
};
