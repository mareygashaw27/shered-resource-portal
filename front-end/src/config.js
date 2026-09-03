// Central API and Socket base configuration
// Automatically detects whether running locally or in production (Vercel + Render)
export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  (typeof window !== 'undefined' &&
   (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:5000'
    : 'https://shered-resource-backend.onrender.com');
