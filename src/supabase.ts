import { createClient } from '@supabase/supabase-js';
const url = import.meta.env.VITE_SUPABASE_URL || '';
const key = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
export const configured = !!(url && key && !url.includes('YOUR_NEW_PROJECT'));
export const supabase = configured ? createClient(url, key, {auth:{autoRefreshToken:true,persistSession:true,detectSessionInUrl:true}}) : null;
export const domainOk=(email:string)=> /^[^@\s]+@psu\.palawan\.edu\.ph$/i.test(email.trim());
