import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://qaivsflpnzfwxletxuqf.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFhaXZzZmxwbnpmd3hsZXR4dXFmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYxODM4OTYsImV4cCI6MjEwMTc1OTg5Nn0.gTsqW4T-JJy7RvwlD4CAS9Y53RxFLvg844YpXIorIwI';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const isSupabaseConfigured = () => {
  return true;
};
