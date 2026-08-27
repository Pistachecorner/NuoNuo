export default function handler(req, res) {
  const url = process.env.NUONUO_STORE_SUPABASE_URL || process.env.SUPABASE_URL || '';
  const key = process.env.NUONUO_STORE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || '';
  if (!url || !key) return res.status(404).json({ error: 'Store config is not set' });
  return res.status(200).json({ url, key });
}
