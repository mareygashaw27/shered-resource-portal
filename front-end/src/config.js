// Central API and Socket base configuration
export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  (typeof window !== 'undefined'
    ? `http://${window.location.hostname || 'localhost'}:5000`
    : 'http://localhost:5000');

