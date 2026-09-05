export const PROFILE_CACHE_KEY = 'sibulak_user_profile';

/**
 * Memastikan Pengguna Terautentikasi dan Memiliki Role yang Diizinkan
 */
export async function requireAuthGuard() {
  // 1. Cek Session di Supabase Auth (Proyek Lama)
  const { data: { session } } = await supabaseAuth.auth.getSession();

  if (!session) {
    sessionStorage.removeItem(PROFILE_CACHE_KEY);
    window.location.href = 'login.html';
    return null;
  }

  // 2. Ambil Profil Pengguna dari Session Storage
  const cachedProfile = sessionStorage.getItem(PROFILE_CACHE_KEY);
  if (!cachedProfile) {
    await supabaseAuth.auth.signOut();
    window.location.href = 'login.html';
    return null;
  }

  const profile = JSON.parse(cachedProfile);

  // 3. TOLAK PPL / PCL
  const userRole = (profile.role || '').toUpperCase();
  if (userRole === 'PPL' || userRole === 'PCL') {
    await supabaseAuth.auth.signOut();
    sessionStorage.removeItem(PROFILE_CACHE_KEY);
    alert("Akses Ditolak: Akun PPL / PCL tidak diizinkan mengakses Dashboard Admin.");
    window.location.href = 'login.html';
    return null;
  }

  return profile;
}

/**
 * Fungsi Logout
 */
export async function handleLogout() {
  sessionStorage.removeItem(PROFILE_CACHE_KEY);
  await supabaseAuth.auth.signOut();
  window.location.href = 'login.html';
}