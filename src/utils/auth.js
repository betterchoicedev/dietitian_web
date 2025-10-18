import { supabase } from "@/lib/supabase";

/**
 * Get the signed-in user's profile (role + company)
 * @returns {Promise<{id: string, role: 'sys_admin'|'company_manager'|'employee', company_id: string|null}>}
 */
export async function getMyProfile() {
  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr || !user) throw new Error("No auth user");
  
  const { data, error } = await supabase
    .from("profiles")
    .select("id, role, company_id")
    .eq("id", user.id)
    .single();
  
  if (error) {
    // If profiles table doesn't exist yet, return a fallback sys_admin profile
    if (error.code === 'PGRST116' || error.message?.includes('relation') || error.message?.includes('does not exist')) {
      console.warn('⚠️ Profiles table not found. Defaulting to sys_admin role. Please run the SQL migration to create the profiles table.');
      console.warn('📝 See the SQL migration in the console or documentation.');
      return {
        id: user.id,
        role: 'sys_admin', // Default to sys_admin so everything is visible
        company_id: null
      };
    }
    throw error;
  }
  
  return data;
}

/**
 * Fetch all profile IDs in a given company (for managers only)
 * @param {string} companyId - The company ID to fetch profiles for
 * @returns {Promise<string[]>} Array of profile IDs
 */
export async function getCompanyProfileIds(companyId) {
  if (!companyId) return [];
  
  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("company_id", companyId);
  
  if (error) {
    // Gracefully handle missing table
    if (error.code === 'PGRST116' || error.message?.includes('relation') || error.message?.includes('does not exist')) {
      console.warn('⚠️ Profiles table not found. Cannot fetch company profile IDs.');
      return [];
    }
    throw error;
  }
  
  return (data || []).map(r => r.id);
}

