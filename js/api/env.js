// api/env.js
export default function handler(req, res) {
  res.setHeader('Content-Type', 'application/javascript');
  res.setHeader('Cache-Control', 'no-store'); // Prevents stale caching
  
  const js = `
    window.SUPABASE_URL = "${process.env.SUPABASE_URL || ''}";
    window.SUPABASE_PUBLISHABLE_KEY = "${process.env.SUPABASE_PUBLISHABLE_KEY || ''}";
  `;
  
  res.status(200).send(js);
}