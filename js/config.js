// 1. Proyek DATA (Proyek Baru untuk GIS & Tagging)
const SUPABASE_URL_DATA = 'https://gecpoqdjrgkwxdabyaax.supabase.co';
const SUPABASE_ANON_KEY_DATA = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdlY3BvcWRqcmdrd3hkYWJ5YWF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgzNTgwNjMsImV4cCI6MjEwMzkzNDA2M30.W4HhF9d-utmp34q4W3TBo6FA5CcencGcBG2SMi5coEE';

// 2. Proyek AUTH (Proyek Lama untuk Login User)
// ⚠️ Ganti URL dan ANON_KEY di bawah ini dengan milik proyek lama kamu
const SUPABASE_URL_AUTH = 'https://bthkolxxynazyrcfcdld.supabase.co'; 
const SUPABASE_ANON_KEY_AUTH = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ0aGtvbHh4eW5henlyY2ZjZGxkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIzOTYwOTYsImV4cCI6MjA5Nzk3MjA5Nn0.e0-LeFdDxNbO_DZHuy6kGEHcXDcYfnmksLC-FE2PARQ'; 

// Inisialisasi Dua Client Supabase
window.supabaseClient = supabase.createClient(SUPABASE_URL_DATA, SUPABASE_ANON_KEY_DATA);
window.supabaseData = window.supabaseClient; // Alias agar kompatibel
window.supabaseAuth = supabase.createClient(SUPABASE_URL_AUTH, SUPABASE_ANON_KEY_AUTH);