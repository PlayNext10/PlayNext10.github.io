// Point this at your Render backend once it's deployed.
// Use an env var so local dev and production can differ.
export const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3000/api'
