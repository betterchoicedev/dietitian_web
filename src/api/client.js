// Local API client implementation
import { supabase } from '../lib/supabase.js';

// Mock data for local development



// Auth functions
export const auth = {
  login: async (credentials) => {
    // Store mock user in localStorage for persistence
    localStorage.setItem('user', JSON.stringify(mockUser));
    return mockUser;
  },
  
  logout: async () => {
    localStorage.removeItem('user');
  },
  
  getCurrentUser: () => {
    const user = localStorage.getItem('user');
    return user ? JSON.parse(user) : null;
  },
  
  me: async () => {
    // Get user from localStorage or create new mock user
    let user = localStorage.getItem('user');
    if (!user) {
      localStorage.setItem('user', JSON.stringify(mockUser));
      user = JSON.stringify(mockUser);
    }
    return JSON.parse(user);
  },
  
  updateMyUserData: async (data) => {
    const currentUser = JSON.parse(localStorage.getItem('user') || JSON.stringify(mockUser));
    const updatedUser = { ...currentUser, ...data };
    localStorage.setItem('user', JSON.stringify(updatedUser));
    return updatedUser;
  },
  
  list: async () => {
    return [mockUser];
  }
};

// Entity functions
export const entities = {
  RegistrationInvites: {
    list: async ({ email, status } = {}) => {
      console.log('📨 Loading registration invites', { email, status });
      const url = new URL(`${import.meta.env.VITE_BACKEND_URL || 'https://dietitian-be.azurewebsites.net'}/api/auth/invites`);
      if (email) url.searchParams.set('email', email);
      if (status) url.searchParams.set('status', status);
      const response = await fetch(url.toString(), {
        credentials: 'include',
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = result?.error || 'Failed to load invitations';
        console.error('❌ RegistrationInvites.list failed:', message);
        throw new Error(message);
      }
      return result.invites || [];
    },
    create: async (payload) => {
      console.log('✉️ Creating registration invite', payload);
      const response = await fetch(`${import.meta.env.VITE_BACKEND_URL || 'https://dietitian-be.azurewebsites.net'}/api/auth/invites`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = result?.error || 'Failed to create invitation';
        console.error('❌ RegistrationInvites.create failed:', message);
        throw new Error(message);
      }
      return result.invite;
    },
    revoke: async (code) => {
      console.log('🚫 Revoking registration invite', code);
      const response = await fetch(`${import.meta.env.VITE_BACKEND_URL || 'https://dietitian-be.azurewebsites.net'}/api/auth/invites/${code}/revoke`, {
        method: 'POST',
        credentials: 'include',
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = result?.error || 'Failed to revoke invitation';
        console.error('❌ RegistrationInvites.revoke failed:', message);
        throw new Error(message);
      }
      return result;
    },
  },
  Menu: {
    create: async (data) => {
      // Normalize status to draft by default
      const normalized = { ...data, status: data?.status || 'draft' };
      console.log('🏪 Menu.create called with data:', JSON.stringify(normalized, null, 2));
      
      // Only block creation if trying to create an ACTIVE menu while one already exists
      if (normalized.user_code && normalized.status === 'active') {
        const { data: existingActiveMenus, error: activeError } = await supabase
          .from('meal_plans_and_schemas')
          .select('id')
          .eq('user_code', normalized.user_code)
          .eq('record_type', 'meal_plan')
          .eq('status', 'active');
        
        if (activeError) {
          console.error('❌ Error checking for existing active menus:', activeError);
          throw new Error('Failed to check for existing active menus.');
        }
        
        if (existingActiveMenus && existingActiveMenus.length > 0) {
          throw new Error('Cannot create menu: this user already has an active menu. Please deactivate the existing active menu first.');
        }
      }
      
      try {
        // Log the creation
        const logEntry = {
          timestamp: new Date().toISOString(),
          actor_id: normalized.dietitian_id || 'system',
          action: 'CREATED',
          details: { record_type: normalized.record_type, meal_plan_name: normalized.meal_plan_name }
        };
        
        console.log('📝 Creating log entry:', logEntry);
        
        const changeLog = normalized.change_log || [];
        changeLog.push(logEntry);
        
        // Prepare data for Supabase
        const supabaseData = {
          ...normalized,
          change_log: changeLog
        };
        
        console.log('💾 Inserting into Supabase table: meal_plans_and_schemas');
        console.log('📤 Supabase data:', JSON.stringify(supabaseData, null, 2));
        
        // Insert into Supabase
        const { data: result, error } = await supabase
          .from('meal_plans_and_schemas')
          .insert([supabaseData])
          .select()
          .single();
        
        if (error) {
          console.error('❌ Supabase error:', error);
          throw new Error(`Supabase error: ${error.message}`);
        }
        
        console.log('✅ Menu.create successfully saved to Supabase:', result);
        return result;
        
      } catch (err) {
        console.error('❌ Error in Menu.create:', err);
        throw err;
      }
    },
    get: async (id) => {
      try {
        console.log('🔍 Getting menu with id:', id);
        
        const { data, error } = await supabase
          .from('meal_plans_and_schemas')
          .select('*')
          .eq('id', id)
          .single();
        
        if (error) {
          console.error('❌ Supabase get error:', error);
          throw new Error(`Supabase error: ${error.message}`);
        }
        
        console.log('✅ Retrieved menu from Supabase:', data);
        return data;
        
      } catch (err) {
        console.error('❌ Error in Menu.get:', err);
        throw err;
      }
    },
    list: async () => {
      try {
        console.log('📋 Getting all menus');
        
        const { data, error } = await supabase
          .from('meal_plans_and_schemas')
          .select('*')
          .order('created_at', { ascending: false });
        
        if (error) {
          console.error('❌ Supabase list error:', error);
          throw new Error(`Supabase error: ${error.message}`);
        }
        
        console.log('✅ Retrieved menus from Supabase:', data?.length || 0, 'records');
        return data || [];
        
      } catch (err) {
        console.error('❌ Error in Menu.list:', err);
        throw err;
      }
    },
    filter: async (query, orderBy = 'created_at') => {
      try {
        console.log('🔍 Filtering menus with query:', query);
        
        const hasEmptyArrayFilter = Object.values(query).some(
          (value) => Array.isArray(value) && value.length === 0
        );

        if (hasEmptyArrayFilter) {
          console.log('🔍 Empty array filter provided, returning no results.');
          return [];
        }

        let supabaseQuery = supabase
          .from('meal_plans_and_schemas')
          .select('*');
        
        // Apply filters
        Object.entries(query).forEach(([key, value]) => {
          if (value === undefined || value === null) {
            return;
          }

          if (Array.isArray(value)) {
            supabaseQuery = supabaseQuery.in(key, value);
          } else {
            supabaseQuery = supabaseQuery.eq(key, value);
          }
        });
        
        // Apply ordering - handle both created_at and created_date for backward compatibility
        let orderColumn = orderBy;
        if (orderBy.startsWith('-')) {
          orderColumn = orderBy.substring(1);
        }
        
        // Map created_date to created_at if needed
        if (orderColumn === 'created_date') {
          orderColumn = 'created_at';
        }
        
        if (orderBy.startsWith('-')) {
          supabaseQuery = supabaseQuery.order(orderColumn, { ascending: false });
        } else {
          supabaseQuery = supabaseQuery.order(orderColumn, { ascending: true });
        }
        
        const { data, error } = await supabaseQuery;
        
        if (error) {
          console.error('❌ Supabase filter error:', error);
          throw new Error(`Supabase error: ${error.message}`);
        }
        
        console.log('✅ Filtered menus from Supabase:', data?.length || 0, 'records');
        return data || [];
        
      } catch (err) {
        console.error('❌ Error in Menu.filter:', err);
        throw err;
      }
    },
    update: async (id, data) => {
      // Check if user already has an active menu before setting status to active
      if (data.status === 'active') {
        // Ensure we have user_code; if not provided, fetch it
        let userCode = data.user_code;
        if (!userCode) {
          const { data: currentMenu, error: fetchCurrentErr } = await supabase
            .from('meal_plans_and_schemas')
            .select('user_code')
            .eq('id', id)
            .single();
          if (fetchCurrentErr) {
            console.error('❌ Error fetching current menu for user_code:', fetchCurrentErr);
            throw new Error('Failed to resolve user for activation.');
          }
          userCode = currentMenu?.user_code;
        }
        if (!userCode) {
          throw new Error('User code is required to activate a menu.');
        }

        // Find other active menus for this user
        const { data: existingActiveMenus, error: activeError } = await supabase
          .from('meal_plans_and_schemas')
          .select('id')
          .eq('user_code', userCode)
          .eq('record_type', 'meal_plan')
          .eq('status', 'active');

        if (activeError) {
          console.error('❌ Error checking for existing active menus:', activeError);
          throw new Error('Failed to check for existing active menus.');
        }

        const otherActiveMenus = (existingActiveMenus || []).filter(menu => menu.id !== id);
        if (otherActiveMenus.length > 0) {
          // Deactivate (expire) other active menus for this user
          const otherIds = otherActiveMenus.map(m => m.id);
          const { error: deactivateErr } = await supabase
            .from('meal_plans_and_schemas')
            .update({
              status: 'expired',
              active_from: null,
              active_until: null,
              updated_at: new Date().toISOString()
            })
            .in('id', otherIds);
          if (deactivateErr) {
            console.error('❌ Failed to deactivate existing active menus:', deactivateErr);
            throw new Error('Failed to deactivate existing active menus.');
          }
        }
      }
      
      try {
        console.log('✏️ Updating menu with id:', id, 'data:', data);
        
        // Log the update
        const logEntry = {
          timestamp: new Date().toISOString(),
          actor_id: data.dietitian_id || 'system',
          action: 'UPDATED',
          details: data
        };
        
        // Get existing change log directly from Supabase
        const { data: existing, error: getError } = await supabase
          .from('meal_plans_and_schemas')
          .select('change_log')
          .eq('id', id)
          .single();
        
        if (getError) {
          console.error('❌ Error getting existing menu for change log:', getError);
          // Continue without change log if we can't get it
        }
        
        const existingChangeLog = existing?.change_log || [];
        existingChangeLog.push(logEntry);
        
        const updateData = {
          ...data,
          change_log: existingChangeLog,
          updated_at: new Date().toISOString()
        };
        
        const { data: result, error } = await supabase
          .from('meal_plans_and_schemas')
          .update(updateData)
          .eq('id', id)
          .select()
          .single();
        
        if (error) {
          console.error('❌ Supabase update error:', error);
          throw new Error(`Supabase error: ${error.message}`);
        }
        
        console.log('✅ Updated menu in Supabase:', result);
        return result;
        
      } catch (err) {
        console.error('❌ Error in Menu.update:', err);
        throw err;
      }
    },
    delete: async (id) => {
      try {
        console.log('🗑️ Deleting menu with id:', id);
        
        const { error } = await supabase
          .from('meal_plans_and_schemas')
          .delete()
          .eq('id', id);
        
        if (error) {
          console.error('❌ Supabase delete error:', error);
          throw new Error(`Supabase error: ${error.message}`);
        }
        
        console.log('✅ Deleted menu from Supabase');
        return true;
        
      } catch (err) {
        console.error('❌ Error in Menu.delete:', err);
        throw err;
      }
    }
  },
  Chat: {
    create: async (data) => {
      try {
        console.log('💬 Chat.create called with data:', JSON.stringify(data, null, 2));
        
        const { data: result, error } = await supabase
          .from('chats')
          .insert([data])
          .select()
          .single();
        
        if (error) {
          console.error('❌ Supabase chat create error:', error);
          throw new Error(`Supabase error: ${error.message}`);
        }
        
        console.log('✅ Chat created in Supabase:', result);
        return result;
        
      } catch (err) {
        console.error('❌ Error in Chat.create:', err);
        throw err;
      }
    },
    get: async (id) => {
      try {
        console.log('🔍 Getting chat with id:', id);
        
        const { data, error } = await supabase
          .from('chats')
          .select('*')
          .eq('id', id)
          .single();
        
        if (error) {
          console.error('❌ Supabase chat get error:', error);
          throw new Error(`Supabase error: ${error.message}`);
        }
        
        console.log('✅ Retrieved chat from Supabase:', data);
        return data;
        
      } catch (err) {
        console.error('❌ Error in Chat.get:', err);
        throw err;
      }
    },
    list: async () => {
      try {
        console.log('📋 Getting all chats');
        
        const { data, error } = await supabase
          .from('chats')
          .select('*')
          .order('created_at', { ascending: false });
        
        if (error) {
          console.error('❌ Supabase chat list error:', error);
          throw new Error(`Supabase error: ${error.message}`);
        }
        
        console.log('✅ Retrieved chats from Supabase:', data?.length || 0, 'records');
        return data || [];
        
      } catch (err) {
        console.error('❌ Error in Chat.list:', err);
        throw err;
      }
    },
    filter: async (query) => {
      try {
        console.log('🔍 Filtering chats with query:', query);
        
        let supabaseQuery = supabase
          .from('chats')
          .select('*');
        
        // Apply filters
        Object.entries(query).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            supabaseQuery = supabaseQuery.eq(key, value);
          }
        });
        
        const { data, error } = await supabaseQuery;
        
        if (error) {
          console.error('❌ Supabase chat filter error:', error);
          throw new Error(`Supabase error: ${error.message}`);
        }
        
        console.log('✅ Filtered chats from Supabase:', data?.length || 0, 'records');
        return data || [];
        
      } catch (err) {
        console.error('❌ Error in Chat.filter:', err);
        throw err;
      }
    },
    update: async (id, data) => {
      try {
        console.log('✏️ Updating chat with id:', id, 'data:', data);
        
        const updateData = {
          ...data,
          updated_at: new Date().toISOString()
        };
        
        const { data: result, error } = await supabase
          .from('chats')
          .update(updateData)
          .eq('id', id)
          .select()
          .single();
        
        if (error) {
          console.error('❌ Supabase chat update error:', error);
          throw new Error(`Supabase error: ${error.message}`);
        }
        
        console.log('✅ Updated chat in Supabase:', result);
        return result;
        
      } catch (err) {
        console.error('❌ Error in Chat.update:', err);
        throw err;
      }
    },
    delete: async (id) => {
      try {
        console.log('🗑️ Deleting chat with id:', id);
        
        const { error } = await supabase
          .from('chats')
          .delete()
          .eq('id', id);
        
        if (error) {
          console.error('❌ Supabase chat delete error:', error);
          throw new Error(`Supabase error: ${error.message}`);
        }
        
        console.log('✅ Deleted chat from Supabase');
        return true;
        
      } catch (err) {
        console.error('❌ Error in Chat.delete:', err);
        throw err;
      }
    }
  },
  ChatUser: {
    create: async (data) => {
      try {
        console.log('👤 Creating new chat user with data:', JSON.stringify(data, null, 2));
        
        const { data: result, error } = await supabase
          .from('chat_users')
          .insert([data])
          .select()
          .single();
        
        if (error) {
          console.error('❌ Supabase chat user create error:', error);
          throw new Error(`Supabase error: ${error.message}`);
        }
        
        console.log('✅ Chat user created in Supabase:', result);
        return result;
        
      } catch (err) {
        console.error('❌ Error in ChatUser.create:', err);
        throw err;
      }
    },
    list: async () => {
      try {
        console.log('👥 Getting all chat users');
        
        const { data, error } = await supabase
          .from('chat_users')
          .select('*')
          .order('full_name', { ascending: true });
        
        if (error) {
          console.error('❌ Supabase chat users list error:', error);
          throw new Error(`Supabase error: ${error.message}`);
        }
        
        console.log('✅ Retrieved chat users from Supabase:', data?.length || 0, 'records');
        return data || [];
        
      } catch (err) {
        console.error('❌ Error in ChatUser.list:', err);
        throw err;
      }
    },
    get: async (userCode) => {
      try {
        console.log('🔍 Getting chat user with user_code:', userCode);
        
        const { data, error } = await supabase
          .from('chat_users')
          .select('*')
          .eq('user_code', userCode)
          .single();
        
        if (error) {
          console.error('❌ Supabase chat user get error:', error);
          throw new Error(`Supabase error: ${error.message}`);
        }
        
        console.log('✅ Retrieved chat user from Supabase:', data);
        return data;
        
      } catch (err) {
        console.error('❌ Error in ChatUser.get:', err);
        throw err;
      }
    },
    getByUserCode: async (userCode) => {
      try {
        console.log('🔍 Getting chat user with user_code:', userCode);
        
        const { data, error } = await supabase
          .from('chat_users')
          .select(`
            *,
            age,
            date_of_birth,
            gender,
            weight_kg,
            height_cm,
            food_allergies,
            user_language,
            base_daily_total_calories,
            recommendations,
            food_limitations,
            Activity_level,
            goal,
            number_of_meals,
            client_preference,
            macros,
            user_context
          `)
          .eq('user_code', userCode)
          .single();
        
        if (error) {
          console.error('❌ Supabase chat user get error:', error);
          throw new Error(`Supabase error: ${error.message}`);
        }
        
        console.log('✅ Retrieved chat user from Supabase with full profile:', data);
        return data;
        
      } catch (err) {
        console.error('❌ Error in ChatUser.getByUserCode:', err);
        throw err;
      }
    },
    update: async (userCode, data) => {
      try {
        console.log('✏️ Updating chat user with user_code:', userCode, 'data:', data);
        
        // Don't add updated_at since chat_users table doesn't have this column
        const updateData = { ...data };
        
        const { data: result, error } = await supabase
          .from('chat_users')
          .update(updateData)
          .eq('user_code', userCode)
          .select()
          .single();
        
        if (error) {
          console.error('❌ Supabase chat user update error:', error);
          throw new Error(`Supabase error: ${error.message}`);
        }
        
        console.log('✅ Updated chat user in Supabase:', result);
        return result;
        
      } catch (err) {
        console.error('❌ Error in ChatUser.update:', err);
        throw err;
      }
    },
    delete: async (userCode) => {
      try {
        console.log('🗑️ Deleting chat user with user_code:', userCode);
        
        const { error } = await supabase
          .from('chat_users')
          .delete()
          .eq('user_code', userCode);
        
        if (error) {
          console.error('❌ Supabase chat user delete error:', error);
          throw new Error(`Supabase error: ${error.message}`);
        }
        
        console.log('✅ Deleted chat user from Supabase');
        return true;
        
      } catch (err) {
        console.error('❌ Error in ChatUser.delete:', err);
        throw err;
      }
    },
    getMealPlanByUserCode: async (userCode) => {
      try {
        console.log('🍽️ Getting active meal plan for user_code:', userCode);
        
        const { data, error } = await supabase
          .from('meal_plans_and_schemas')
          .select('meal_plan, daily_total_calories, macros_target, recommendations, dietary_restrictions')
          .eq('user_code', userCode)
          .eq('record_type', 'meal_plan')
          .eq('status', 'active')
          .order('created_at', { ascending: false })
          .limit(1);
        
        if (error) {
          console.error('❌ Supabase meal plan get error:', error);
          throw new Error(`Supabase error: ${error.message}`);
        }
        
        // Return the first (most recent) active meal plan, or null if none found
        const mealPlan = data && data.length > 0 ? data[0] : null;
        console.log('✅ Retrieved active meal plan from Supabase:', mealPlan);
        return mealPlan;
        
      } catch (err) {
        console.error('❌ Error in ChatUser.getMealPlanByUserCode:', err);
        throw err;
      }
    }
  },
  Profiles: {
    list: async () => {
      try {
        console.log('📋 Fetching profiles with company info');

        const { data, error } = await supabase
          .from('profiles')
          .select(`
            id,
            role,
            company_id,
            name,
            created_at,
            company:companies(
              id,
              name
            )
          `)
          .order('created_at', { ascending: false });

        if (error) {
          console.error('❌ Supabase profiles list error:', error);
          throw new Error(`Supabase error: ${error.message}`);
        }

        console.log('✅ Retrieved profiles from Supabase:', data?.length || 0, 'records');
        return data || [];
      } catch (err) {
        console.error('❌ Error in Profiles.list:', err);
        throw err;
      }
    },
    update: async (id, data) => {
      try {
        console.log('✏️ Updating profile:', id, 'with data:', data);

        const { data: result, error } = await supabase
          .from('profiles')
          .update(data)
          .eq('id', id)
          .select()
          .single();

        if (error) {
          console.error('❌ Supabase profile update error:', error);
          throw new Error(`Supabase error: ${error.message}`);
        }

        console.log('✅ Updated profile in Supabase:', result);
        return result;
      } catch (err) {
        console.error('❌ Error in Profiles.update:', err);
        throw err;
      }
    }
  },
  Companies: {
    list: async () => {
      try {
        console.log('🏢 Fetching companies list');

        const { data, error } = await supabase
          .from('companies')
          .select('id, name')
          .order('name', { ascending: true });

        if (error) {
          console.error('❌ Supabase companies list error:', error);
          throw new Error(`Supabase error: ${error.message}`);
        }

        console.log('✅ Retrieved companies from Supabase:', data?.length || 0, 'records');
        return data || [];
      } catch (err) {
        console.error('❌ Error in Companies.list:', err);
        throw err;
      }
    },
    create: async (name) => {
      try {
        console.log('🏢 Creating company:', name);
        const payload = {
          name,
        };

        const { data, error } = await supabase
          .from('companies')
          .insert([payload])
          .select('id, name')
          .single();

        if (error) {
          console.error('❌ Supabase company create error:', error);
          throw new Error(`Supabase error: ${error.message}`);
        }

        console.log('✅ Company created:', data);
        return data;
      } catch (err) {
        console.error('❌ Error in Companies.create:', err);
        throw err;
      }
    },
  },
  WeightLogs: {
    // Get all weight logs for a specific user
    getByUserCode: async (userCode) => {
      try {
        console.log('⚖️ Getting weight logs for user_code:', userCode);
        
        const { data, error } = await supabase
          .from('weight_logs')
          .select(`
            id,
            user_id,
            user_code,
            measurement_date,
            weight_kg,
            body_fat_percentage,
            height_cm,
            neck_circumference_cm,
            general_measurements,
            body_composition,
            central_measurements,
            hip_measurements,
            limb_measurements,
            waist_circumference_cm,
            hip_circumference_cm,
            arm_circumference_cm,
            notes
          `)
          .eq('user_code', userCode)
          .order('measurement_date', { ascending: true });
        
        if (error) {
          console.error('❌ Supabase weight logs get error:', error);
          throw new Error(`Supabase error: ${error.message}`);
        }
        
        console.log('✅ Retrieved weight logs from Supabase:', data?.length || 0, 'records');
        console.log('📊 Sample data structure:', data?.[0]);
        return data || [];
        
      } catch (err) {
        console.error('❌ Error in WeightLogs.getByUserCode:', err);
        throw err;
      }
    },
    
    // Get all weight logs (for debugging)
    list: async () => {
      try {
        console.log('⚖️ Getting all weight logs');
        
        const { data, error } = await supabase
          .from('weight_logs')
          .select(`
            id,
            user_id,
            user_code,
            measurement_date,
            weight_kg,
            body_fat_percentage,
            height_cm,
            neck_circumference_cm,
            general_measurements,
            body_composition,
            central_measurements,
            hip_measurements,
            limb_measurements,
            waist_circumference_cm,
            hip_circumference_cm,
            arm_circumference_cm,
            notes
          `)
          .order('measurement_date', { ascending: false });
        
        if (error) {
          console.error('❌ Supabase weight logs list error:', error);
          throw new Error(`Supabase error: ${error.message}`);
        }
        
        console.log('✅ Retrieved all weight logs from Supabase:', data?.length || 0, 'records');
        console.log('📊 Sample data structure:', data?.[0]);
        return data || [];
        
      } catch (err) {
        console.error('❌ Error in WeightLogs.list:', err);
        throw err;
      }
    },
    
    // Get unique user codes that have weight logs
    getUniqueUserCodes: async () => {
      try {
        console.log('⚖️ Getting unique user codes with weight logs');
        
        const { data, error } = await supabase
          .from('weight_logs')
          .select('user_code')
          .not('user_code', 'is', null);
        
        if (error) {
          console.error('❌ Supabase weight logs user codes error:', error);
          throw new Error(`Supabase error: ${error.message}`);
        }
        
        const uniqueUserCodes = [...new Set(data.map(item => item.user_code))];
        console.log('✅ Retrieved unique user codes with weight logs:', uniqueUserCodes);
        return uniqueUserCodes;
        
      } catch (err) {
        console.error('❌ Error in WeightLogs.getUniqueUserCodes:', err);
        throw err;
      }
    },
    
    // Create a new weight log entry
    create: async (data) => {
      try {
        console.log('⚖️ Creating weight log entry:', JSON.stringify(data, null, 2));
        
        const { data: result, error } = await supabase
          .from('weight_logs')
          .insert([data])
          .select()
          .single();
        
        if (error) {
          console.error('❌ Supabase weight log create error:', error);
          throw new Error(`Supabase error: ${error.message}`);
        }
        
        console.log('✅ Created weight log entry in Supabase:', result);
        return result;
        
      } catch (err) {
        console.error('❌ Error in WeightLogs.create:', err);
        throw err;
      }
    },
    
    // Update an existing weight log entry
    update: async (id, data) => {
      try {
        console.log('✏️ Updating weight log entry:', id, JSON.stringify(data, null, 2));
        
        const { data: result, error } = await supabase
          .from('weight_logs')
          .update(data)
          .eq('id', id)
          .select()
          .single();
        
        if (error) {
          console.error('❌ Supabase weight log update error:', error);
          throw new Error(`Supabase error: ${error.message}`);
        }
        
        console.log('✅ Updated weight log entry in Supabase:', result);
        return result;
        
      } catch (err) {
        console.error('❌ Error in WeightLogs.update:', err);
        throw err;
      }
    },
    
    // Delete a weight log entry
    delete: async (id) => {
      try {
        console.log('🗑️ Deleting weight log entry:', id);
        
        const { error } = await supabase
          .from('weight_logs')
          .delete()
          .eq('id', id);
        
        if (error) {
          console.error('❌ Supabase weight log delete error:', error);
          throw new Error(`Supabase error: ${error.message}`);
        }
        
        console.log('✅ Deleted weight log entry from Supabase');
        return true;
        
      } catch (err) {
        console.error('❌ Error in WeightLogs.delete:', err);
        throw err;
      }
    }
  },
  Client: {
    create: async (data) => {
      return { id: `client-${Date.now()}`, ...data };
    },
    get: async (id) => {
      try {
        const res = await fetch('/data/client.json');
        if (!res.ok) {
          throw new Error('Failed to fetch client data');
        }
        const data = await res.json();
        return data;
      } catch (error) {
        console.error('Error fetching client:', error);
        return null;
      }
    },
    list: async () => {
      try {
        const res = await fetch('/data/client.json');
        if (!res.ok) {
          throw new Error('Failed to fetch client data');
        }
        const data = await res.json();
        return [data];
      } catch (error) {
        console.error('Error fetching clients:', error);
        return [];
      }
    },
    filter: async (query) => {
      try {
        console.log('🔍 Filtering clients with query:', query);
        console.log('🔑 Current auth user:', (await supabase.auth.getUser()).data.user?.id);
        
        let supabaseQuery = supabase
          .from('chat_users')
          .select('*');
        
        // Apply filters
        if (query.dietitian_id) {
          console.log('🎯 Filtering by dietitian_id:', query.dietitian_id);
          supabaseQuery = supabaseQuery.eq('provider_id', query.dietitian_id);
        }
        
        if (query.code) {
          console.log('🎯 Filtering by code:', query.code);
          supabaseQuery = supabaseQuery.eq('user_code', query.code);
        }
        
        console.log(' Executing Supabase query...');
        const { data, error } = await supabaseQuery.order('full_name', { ascending: true });
        
        if (error) {
          console.error('❌ Supabase client filter error:', error);
          throw new Error(`Supabase error: ${error.message}`);
        }
        
        console.log('✅ Retrieved filtered clients from Supabase:', data?.length || 0, 'records');
        console.log(' Data:', data);
        return data || [];
        
      } catch (err) {
        console.error('❌ Error in Client.filter:', err);
        throw err;
      }
    },
    update: async (id, data) => {
      return { id, ...data };
    },
    delete: async (id) => {
      return true;
    }
  },
  FoodLogs: {
    // Get food logs by user_id
    getByUserId: async (user_id) => {
      try {
        console.log('🍽️ Getting food logs for user_id:', user_id);
        const { data, error } = await supabase
          .from('food_logs')
          .select('*')
          .eq('user_id', user_id)
          .order('log_date', { ascending: false });
        
        if (error) {
          console.error('❌ Supabase food logs get error:', error);
          throw new Error(`Supabase error: ${error.message}`);
        }
        
        console.log('✅ Retrieved food logs from Supabase:', data?.length || 0, 'records');
        return data || [];
        
      } catch (err) {
        console.error('❌ Error in FoodLogs.getByUserId:', err);
        throw err;
      }
    },
    
    // Get food logs by user_code (via chat_users table)
    getByUserCode: async (user_code) => {
      try {
        console.log('🍽️ Getting food logs for user_code:', user_code);
        
        // First get the user_id from chat_users table
        const { data: user, error: userError } = await supabase
          .from('chat_users')
          .select('id')
          .eq('user_code', user_code)
          .single();
        
        if (userError) {
          console.error('❌ Error getting user by user_code:', userError);
          throw new Error(`User not found: ${user_code}`);
        }
        
        if (!user) {
          console.log('⚠️ No user found with user_code:', user_code);
          return [];
        }
        
        // Then get food logs by user_id
        const { data, error } = await supabase
          .from('food_logs')
          .select('*')
          .eq('user_id', user.id)
          .order('log_date', { ascending: false });
        
        if (error) {
          console.error('❌ Supabase food logs get error:', error);
          throw new Error(`Supabase error: ${error.message}`);
        }
        
        console.log('✅ Retrieved food logs from Supabase:', data?.length || 0, 'records');
        return data || [];
        
      } catch (err) {
        console.error('❌ Error in FoodLogs.getByUserCode:', err);
        throw err;
      }
    },
    
    // Analyze food logs to extract user preferences
    analyzePreferences: async (user_code) => {
      try {
        console.log('🔍 Analyzing food preferences for user_code:', user_code);
        
        const foodLogs = await entities.FoodLogs.getByUserCode(user_code);
        
        if (!foodLogs || foodLogs.length === 0) {
          console.log('⚠️ No food logs found for user:', user_code);
          return null;
        }
        
        // Extract food items from all logs
        const allFoodItems = [];
        
        foodLogs.forEach(log => {
          if (log.food_items && typeof log.food_items === 'object') {
            // Handle JSONB format
            const items = Array.isArray(log.food_items) ? log.food_items : [log.food_items];
            
            items.forEach(item => {
              if (item && item.name) {
                allFoodItems.push({
                  name: item.name,
                  meal_label: log.meal_label,
                  date: log.log_date
                });
              }
            });
          }
        });
        
        // Count food item frequencies
        const foodFrequency = {};
        allFoodItems.forEach(item => {
          const name = item.name.toLowerCase().trim();
          foodFrequency[name] = (foodFrequency[name] || 0) + 1;
        });
        
        // Get most frequently consumed foods (top 10)
        const sortedFoods = Object.entries(foodFrequency)
          .sort(([,a], [,b]) => b - a)
          .slice(0, 10)
          .map(([name, count]) => ({ name, count }));
        
        // Analyze meal patterns and group foods by meal
        const mealCounts = {};
        const foodsByMeal = {};
        
        foodLogs.forEach(log => {
          if (log.meal_label) {
            mealCounts[log.meal_label] = (mealCounts[log.meal_label] || 0) + 1;
            
            // Group foods by meal
            if (!foodsByMeal[log.meal_label]) {
              foodsByMeal[log.meal_label] = {};
            }
            
            if (log.food_items && typeof log.food_items === 'object') {
              const items = Array.isArray(log.food_items) ? log.food_items : [log.food_items];
              items.forEach(item => {
                if (item && item.name) {
                  const foodName = item.name.toLowerCase().trim();
                  foodsByMeal[log.meal_label][foodName] = (foodsByMeal[log.meal_label][foodName] || 0) + 1;
                }
              });
            }
          }
        });
        
        // Convert foodsByMeal to sorted arrays
        const foodsByMealSorted = {};
        Object.keys(foodsByMeal).forEach(meal => {
          const sortedFoodsForMeal = Object.entries(foodsByMeal[meal])
            .sort(([,a], [,b]) => b - a)
            .map(([name, count]) => ({ name, count }));
          foodsByMealSorted[meal] = sortedFoodsForMeal;
        });
        
        // Create preferences object
        const preferences = {
          frequently_consumed_foods: sortedFoods.map(food => food.name),
          meal_patterns: mealCounts,
          foods_by_meal: foodsByMealSorted, // Added this
          total_logs: foodLogs.length,
          analysis_date: new Date().toISOString()
        };
        
        console.log('✅ Food preferences analysis completed:', preferences);
        return preferences;
        
      } catch (err) {
        console.error('❌ Error analyzing food preferences:', err);
        throw err;
      }
    }
  },
  ChatMessage: {
    // Create a new message in the chat_messages table
    create: async (messageData) => {
      try {
        console.log('💬 ChatMessage.create called with data:', JSON.stringify(messageData, null, 2));
        
        const { data: result, error } = await supabase
          .from('chat_messages')
          .insert([messageData])
          .select()
          .single();
        
        if (error) {
          console.error('❌ Supabase chat message create error:', error);
          throw new Error(`Supabase error: ${error.message}`);
        }
        
        console.log('✅ Chat message created in Supabase:', result);
        return result;
        
      } catch (err) {
        console.error('❌ Error in ChatMessage.create:', err);
        throw err;
      }
    },
    
    // Fetch messages for a conversation, paginated (oldest first)
    listByConversation: async (conversation_id, { limit = 20, beforeMessageId = null } = {}) => {
      let query = supabase
        .from('chat_messages')
        .select('*')
        .eq('conversation_id', conversation_id)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (beforeMessageId) {
        query = query.lt('id', beforeMessageId);
      }
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return data || [];
    },
  },
  
  MessageQueue: {
    // Add a message to the queue for processing
    addToQueue: async (queueData) => {
      try {
        console.log('📬 MessageQueue.addToQueue called with data:', JSON.stringify(queueData, null, 2));
        
        // Validate required fields
        if (!queueData.conversation_id || !queueData.client_id || !queueData.dietitian_id) {
          throw new Error('Missing required fields: conversation_id, client_id, and dietitian_id are required');
        }
        
        const { data: result, error } = await supabase
          .from('message_queue')
          .insert([queueData])
          .select()
          .single();
        
        if (error) {
          console.error('❌ Supabase message queue add error:', error);
          throw new Error(`Supabase error: ${error.message}`);
        }
        
        console.log('✅ Message added to queue in Supabase:', result);
        return result;
        
      } catch (err) {
        console.error('❌ Error in MessageQueue.addToQueue:', err);
        throw err;
      }
    },
    
    // Get pending messages for a specific user
    getPendingForUser: async (userCode) => {
      try {
        console.log('📬 Getting pending messages for user:', userCode);
        
        const { data, error } = await supabase
          .from('message_queue')
          .select('*')
          .eq('user_code', userCode)
          .eq('status', 'pending')
          .order('priority', { ascending: false })
          .order('created_at', { ascending: true });
        
        if (error) {
          console.error('❌ Supabase message queue get error:', error);
          throw new Error(`Supabase error: ${error.message}`);
        }
        
        console.log('✅ Retrieved pending messages from queue:', data?.length || 0, 'records');
        return data || [];
        
      } catch (err) {
        console.error('❌ Error in MessageQueue.getPendingForUser:', err);
        throw err;
      }
    },
    
    // Get pending messages for a specific client (by client_id)
    getPendingForClient: async (clientId) => {
      try {
        console.log('📬 Getting pending messages for client ID:', clientId);
        
        const { data, error } = await supabase
          .from('message_queue')
          .select('*')
          .eq('client_id', clientId)
          .eq('status', 'pending')
          .order('priority', { ascending: false })
          .order('created_at', { ascending: true });
        
        if (error) {
          console.error('❌ Supabase message queue get error:', error);
          throw new Error(`Supabase error: ${error.message}`);
        }
        
        console.log('✅ Retrieved pending messages for client:', data?.length || 0, 'records');
        return data || [];
        
      } catch (err) {
        console.error('❌ Error in MessageQueue.getPendingForClient:', err);
        throw err;
      }
    },
    
    // Get messages sent by a specific dietitian
    getByDietitian: async (dietitianId, { status = null, limit = 100, offset = 0 } = {}) => {
      try {
        console.log('📬 Getting messages by dietitian:', dietitianId);
        
        let query = supabase
          .from('message_queue')
          .select('*')
          .eq('dietitian_id', dietitianId)
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1);
        
        if (status) {
          query = query.eq('status', status);
        }
        
        const { data, error } = await query;
        
        if (error) {
          console.error('❌ Supabase message queue get by dietitian error:', error);
          throw new Error(`Supabase error: ${error.message}`);
        }
        
        console.log('✅ Retrieved messages by dietitian:', data?.length || 0, 'records');
        return data || [];
        
      } catch (err) {
        console.error('❌ Error in MessageQueue.getByDietitian:', err);
        throw err;
      }
    },
    
    // Update message status
    updateStatus: async (messageId, status, additionalData = {}) => {
      try {
        console.log('📬 Updating message status:', messageId, 'to:', status);
        
        const updateData = {
          status,
          updated_at: new Date().toISOString(),
          ...additionalData
        };
        
        if (status === 'sent') {
          updateData.processed_at = new Date().toISOString();
        }
        
        const { data: result, error } = await supabase
          .from('message_queue')
          .update(updateData)
          .eq('id', messageId)
          .select()
          .single();
        
        if (error) {
          console.error('❌ Supabase message queue update error:', error);
          throw new Error(`Supabase error: ${error.message}`);
        }
        
        console.log('✅ Message status updated in queue:', result);
        return result;
        
      } catch (err) {
        console.error('❌ Error in MessageQueue.updateStatus:', err);
        throw err;
      }
    },
    
    // Get all messages in queue (for admin purposes)
    listAll: async ({ status = null, limit = 100, offset = 0 } = {}) => {
      try {
        console.log('📬 Getting all messages from queue');
        
        let query = supabase
          .from('message_queue')
          .select(`
            *,
            chat_conversations!inner(id, started_at),
            chat_users!inner(id, full_name, user_code)
          `)
          .order('priority', { ascending: false })
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1);
        
        if (status) {
          query = query.eq('status', status);
        }
        
        const { data, error } = await query;
        
        if (error) {
          console.error('❌ Supabase message queue list error:', error);
          throw new Error(`Supabase error: ${error.message}`);
        }
        
        console.log('✅ Retrieved messages from queue:', data?.length || 0, 'records');
        return data || [];
        
      } catch (err) {
        console.error('❌ Error in MessageQueue.listAll:', err);
        throw err;
      }
    },
  },
  ChatConversation: {
    // Get conversation by user_id
    getByUserId: async (user_id) => {
      const { data, error } = await supabase
        .from('chat_conversations')
        .select('*')
        .eq('user_id', user_id)
        .order('started_at', { ascending: false })
        .limit(1)
        .single();
      if (error) throw new Error(error.message);
      return data;
    },
    // Get conversation by user_code (via chat_users)
    getByUserCode: async (user_code) => {
      // First get user by user_code
      const { data: user, error: userError } = await supabase
        .from('chat_users')
        .select('id')
        .eq('user_code', user_code)
        .single();
      if (userError) throw new Error(userError.message);
      // Then get conversation by user_id
      const { data, error } = await supabase
        .from('chat_conversations')
        .select('*')
        .eq('user_id', user.id)
        .order('started_at', { ascending: false })
        .limit(1)
        .single();
      if (error) throw new Error(error.message);
      return data;
    },
  },
  
  // Training Management APIs
  TrainingPlans: {
    // Get all training plans for a user
    getByUserCode: async (userCode) => {
      try {
        const { data, error } = await supabase
          .from('training_plans')
          .select('*')
          .eq('user_code', userCode)
          .order('created_at', { ascending: false });
        
        if (error) throw new Error(error.message);
        return data || [];
      } catch (err) {
        console.error('❌ Error fetching training plans:', err);
        throw err;
      }
    },
    
    // Get all active training plans (for dashboard)
    getAll: async () => {
      try {
        const { data, error } = await supabase
          .from('training_plans')
          .select('*')
          .order('created_at', { ascending: false });
        
        if (error) throw new Error(error.message);
        return data || [];
      } catch (err) {
        console.error('❌ Error fetching all training plans:', err);
        throw err;
      }
    },
    
    // Get active training plan for a user
    getActive: async (userCode) => {
      try {
        const { data, error } = await supabase
          .from('training_plans')
          .select('*')
          .eq('user_code', userCode)
          .eq('status', 'active')
          .order('created_at', { ascending: false })
          .limit(1)
          .single();
        
        if (error && error.code !== 'PGRST116') throw new Error(error.message);
        return data || null;
      } catch (err) {
        console.error('❌ Error fetching active training plan:', err);
        throw err;
      }
    },
    
    // Create new training plan
    create: async (planData) => {
      try {
        // If setting as active, deactivate other plans for this user
        if (planData.status === 'active') {
          const { error: deactivateError } = await supabase
            .from('training_plans')
            .update({ status: 'archived' })
            .eq('user_code', planData.user_code)
            .eq('status', 'active');
          
          if (deactivateError) {
            console.error('❌ Error deactivating existing plans:', deactivateError);
          }
        }
        
        const { data, error } = await supabase
          .from('training_plans')
          .insert([planData])
          .select()
          .single();
        
        if (error) throw new Error(error.message);
        return data;
      } catch (err) {
        console.error('❌ Error creating training plan:', err);
        throw err;
      }
    },
    
    // Update training plan
    update: async (id, updates) => {
      try {
        const { data, error } = await supabase
          .from('training_plans')
          .update({ ...updates, updated_at: new Date().toISOString() })
          .eq('id', id)
          .select()
          .single();
        
        if (error) throw new Error(error.message);
        return data;
      } catch (err) {
        console.error('❌ Error updating training plan:', err);
        throw err;
      }
    },
    
    // Delete training plan
    delete: async (id) => {
      try {
        const { error } = await supabase
          .from('training_plans')
          .delete()
          .eq('id', id);
        
        if (error) throw new Error(error.message);
        return true;
      } catch (err) {
        console.error('❌ Error deleting training plan:', err);
        throw err;
      }
    },
  },
  
  TrainingLogs: {
    // Get training logs for a user
    getByUserCode: async (userCode, limit = 50) => {
      try {
        const { data, error } = await supabase
          .from('training_logs')
          .select('*')
          .eq('user_code', userCode)
          .order('session_date', { ascending: false })
          .limit(limit);
        
        if (error) throw new Error(error.message);
        return data || [];
      } catch (err) {
        console.error('❌ Error fetching training logs:', err);
        throw err;
      }
    },
    
    // Get training logs by date range
    getByDateRange: async (userCode, startDate, endDate) => {
      try {
        const { data, error } = await supabase
          .from('training_logs')
          .select('*')
          .eq('user_code', userCode)
          .gte('session_date', startDate)
          .lte('session_date', endDate)
          .order('session_date', { ascending: false });
        
        if (error) throw new Error(error.message);
        return data || [];
      } catch (err) {
        console.error('❌ Error fetching training logs by date range:', err);
        throw err;
      }
    },
    
    // Get training logs for all users (for analytics)
    getAll: async (limit = 100) => {
      try {
        const { data, error } = await supabase
          .from('training_logs')
          .select('*')
          .order('session_date', { ascending: false })
          .limit(limit);
        
        if (error) throw new Error(error.message);
        return data || [];
      } catch (err) {
        console.error('❌ Error fetching all training logs:', err);
        throw err;
      }
    },
  },
  
  TrainingAnalytics: {
    // Get progress analytics for a user
    getByUserCode: async (userCode) => {
      try {
        const { data, error } = await supabase
          .from('training_progress_analytics')
          .select('*')
          .eq('user_code', userCode)
          .order('date_end', { ascending: false });
        
        if (error) throw new Error(error.message);
        return data || [];
      } catch (err) {
        console.error('❌ Error fetching training analytics:', err);
        throw err;
      }
    },
    
    // Get analytics for specific exercise
    getByExercise: async (userCode, exerciseName) => {
      try {
        const { data, error } = await supabase
          .from('training_progress_analytics')
          .select('*')
          .eq('user_code', userCode)
          .eq('exercise_name', exerciseName)
          .order('date_end', { ascending: false });
        
        if (error) throw new Error(error.message);
        return data || [];
      } catch (err) {
        console.error('❌ Error fetching exercise analytics:', err);
        throw err;
      }
    },
  },
  
  TrainingReminders: {
    // Get pending reminders
    getPending: async () => {
      try {
        const { data, error } = await supabase
          .from('training_reminder_queue')
          .select('*')
          .eq('status', 'pending')
          .order('scheduled_for', { ascending: true });
        
        if (error) throw new Error(error.message);
        return data || [];
      } catch (err) {
        console.error('❌ Error fetching pending reminders:', err);
        throw err;
      }
    },
    
    // Get reminders for a user
    getByUserCode: async (userCode) => {
      try {
        const { data, error } = await supabase
          .from('training_reminder_queue')
          .select('*')
          .eq('user_code', userCode)
          .order('scheduled_for', { ascending: false });
        
        if (error) throw new Error(error.message);
        return data || [];
      } catch (err) {
        console.error('❌ Error fetching user reminders:', err);
        throw err;
      }
    },
    
    // Create reminder
    create: async (reminderData) => {
      try {
        const { data, error } = await supabase
          .from('training_reminder_queue')
          .insert([reminderData])
          .select()
          .single();
        
        if (error) throw new Error(error.message);
        return data;
      } catch (err) {
        console.error('❌ Error creating reminder:', err);
        throw err;
      }
    },
    
    // Update reminder status
    updateStatus: async (id, status, errorMessage = null) => {
      try {
        const updates = { status };
        if (status === 'sent') {
          updates.sent_at = new Date().toISOString();
        }
        if (errorMessage) {
          updates.error_message = errorMessage;
        }
        
        const { data, error } = await supabase
          .from('training_reminder_queue')
          .update(updates)
          .eq('id', id)
          .select()
          .single();
        
        if (error) throw new Error(error.message);
        return data;
      } catch (err) {
        console.error('❌ Error updating reminder status:', err);
        throw err;
      }
    },
    
    // Delete reminder
    delete: async (id) => {
      try {
        const { error } = await supabase
          .from('training_reminder_queue')
          .delete()
          .eq('id', id);
        
        if (error) throw new Error(error.message);
        return true;
      } catch (err) {
        console.error('❌ Error deleting reminder:', err);
        throw err;
      }
    },
  },
  
  ExerciseLibrary: {
    // Get all exercises
    getAll: async () => {
      try {
        const { data, error } = await supabase
          .from('exercise_library')
          .select('*')
          .eq('is_active', true)
          .order('exercise_name', { ascending: true });
        
        if (error) throw new Error(error.message);
        return data || [];
      } catch (err) {
        console.error('❌ Error fetching exercise library:', err);
        throw err;
      }
    },
    
    // Get exercises by category
    getByCategory: async (category) => {
      try {
        const { data, error } = await supabase
          .from('exercise_library')
          .select('*')
          .eq('category', category)
          .eq('is_active', true)
          .order('exercise_name', { ascending: true });
        
        if (error) throw new Error(error.message);
        return data || [];
      } catch (err) {
        console.error('❌ Error fetching exercises by category:', err);
        throw err;
      }
    },
    
    // Search exercises
    search: async (searchTerm) => {
      try {
        const { data, error } = await supabase
          .from('exercise_library')
          .select('*')
          .ilike('exercise_name', `%${searchTerm}%`)
          .eq('is_active', true)
          .order('exercise_name', { ascending: true });
        
        if (error) throw new Error(error.message);
        return data || [];
      } catch (err) {
        console.error('❌ Error searching exercises:', err);
        throw err;
      }
    },
    
    // Create exercise
    create: async (exerciseData) => {
      try {
        const { data, error } = await supabase
          .from('exercise_library')
          .insert([exerciseData])
          .select()
          .single();
        
        if (error) throw new Error(error.message);
        return data;
      } catch (err) {
        console.error('❌ Error creating exercise:', err);
        throw err;
      }
    },
    
    // Update exercise
    update: async (id, updates) => {
      try {
        const { data, error } = await supabase
          .from('exercise_library')
          .update({ ...updates, updated_at: new Date().toISOString() })
          .eq('id', id)
          .select()
          .single();
        
        if (error) throw new Error(error.message);
        return data;
      } catch (err) {
        console.error('❌ Error updating exercise:', err);
        throw err;
      }
    },
  },
  
  TrainingPlanTemplates: {
    // Get all templates (own + public)
    getAll: async () => {
      try {
        const { data, error } = await supabase
          .from('training_plan_templates')
          .select('*')
          .eq('is_active', true)
          .order('created_at', { ascending: false });
        
        if (error) throw new Error(error.message);
        return data || [];
      } catch (err) {
        console.error('❌ Error fetching training plan templates:', err);
        throw err;
      }
    },
    
    // Get user's own templates
    getOwn: async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Not authenticated');
        
        const { data, error } = await supabase
          .from('training_plan_templates')
          .select('*')
          .eq('created_by', user.id)
          .eq('is_active', true)
          .order('created_at', { ascending: false });
        
        if (error) throw new Error(error.message);
        return data || [];
      } catch (err) {
        console.error('❌ Error fetching own templates:', err);
        throw err;
      }
    },
    
    // Get public templates (created by others)
    getPublic: async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        
        const { data, error } = await supabase
          .from('training_plan_templates')
          .select('*')
          .eq('is_public', true)
          .eq('is_active', true)
          .neq('created_by', user?.id || '')
          .order('usage_count', { ascending: false });
        
        if (error) throw new Error(error.message);
        return data || [];
      } catch (err) {
        console.error('❌ Error fetching public templates:', err);
        throw err;
      }
    },
    
    // Search templates
    search: async (searchTerm) => {
      try {
        const { data, error } = await supabase
          .from('training_plan_templates')
          .select('*')
          .or(`template_name.ilike.%${searchTerm}%,template_name_he.ilike.%${searchTerm}%,description.ilike.%${searchTerm}%`)
          .eq('is_active', true)
          .order('created_at', { ascending: false });
        
        if (error) throw new Error(error.message);
        return data || [];
      } catch (err) {
        console.error('❌ Error searching templates:', err);
        throw err;
      }
    },
    
    // Create template
    create: async (templateData) => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Not authenticated');
        
        const { data, error } = await supabase
          .from('training_plan_templates')
          .insert([{
            ...templateData,
            created_by: user.id
          }])
          .select()
          .single();
        
        if (error) throw new Error(error.message);
        return data;
      } catch (err) {
        console.error('❌ Error creating template:', err);
        throw err;
      }
    },
    
    // Update template
    update: async (id, updates) => {
      try {
        const { data, error } = await supabase
          .from('training_plan_templates')
          .update({ ...updates, updated_at: new Date().toISOString() })
          .eq('id', id)
          .select()
          .single();
        
        if (error) throw new Error(error.message);
        return data;
      } catch (err) {
        console.error('❌ Error updating template:', err);
        throw err;
      }
    },
    
    // Delete template (soft delete - set is_active to false)
    delete: async (id) => {
      try {
        const { error } = await supabase
          .from('training_plan_templates')
          .update({ is_active: false })
          .eq('id', id);
        
        if (error) throw new Error(error.message);
        return true;
      } catch (err) {
        console.error('❌ Error deleting template:', err);
        throw err;
      }
    },
    
    // Hard delete template (permanent)
    hardDelete: async (id) => {
      try {
        const { error } = await supabase
          .from('training_plan_templates')
          .delete()
          .eq('id', id);
        
        if (error) throw new Error(error.message);
        return true;
      } catch (err) {
        console.error('❌ Error hard deleting template:', err);
        throw err;
      }
    },
    
    // Increment usage count
    incrementUsage: async (id) => {
      try {
        const { data, error } = await supabase.rpc('increment_template_usage', { template_id: id });
        
        if (error) {
          // Fallback if RPC doesn't exist
          const { data: template } = await supabase
            .from('training_plan_templates')
            .select('usage_count')
            .eq('id', id)
            .single();
          
          const newCount = (template?.usage_count || 0) + 1;
          await supabase
            .from('training_plan_templates')
            .update({ usage_count: newCount })
            .eq('id', id);
        }
        
        return true;
      } catch (err) {
        console.error('❌ Error incrementing template usage:', err);
        // Don't throw - this is non-critical
        return false;
      }
    },
  },
};

// Azure OpenAI Configuration
const endpoint = "https://ai-hubfooddata915979189829.openai.azure.com";  // Removed trailing slash
const apiVersion = "2024-02-15-preview";  // Updated API version
const deployment = "forObi4-mini";
const apiKey = "7GE7Tuq2qHvKvTHjS6oqkZ3zQuROcPwgFt5VHHbaPhGnGxLIJBZRJQQJ99BBACYeBjFXJ3w3AAAAACOGgNEZ";

// Core integrations
export const integrations = {
  Core: {
    InvokeLLM: async ({ prompt, response_json_schema, base64Image }) => {
      try {
        let userContent;
        if (base64Image) {
          userContent = [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64Image}` } }
          ];
        } else {
          userContent = prompt;
        }
        const response = await fetch(`${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'api-key': apiKey,
            'Accept': 'application/json'
          },
          body: JSON.stringify({
            messages: [
              {
                role: 'system',
                content: 'You are a friendly and helpful HEALTHY nutritionist assistant. Keep your responses concise and to the point. Use emojis appropriately to make the conversation engaging. When answering questions about specific foods or nutrients, focus only on the asked topic. If the user provides a JSON schema, format your response as valid JSON matching that schema. **CRITICAL HEALTHY DIETITIAN RULES:** You are a HEALTHY nutritionist - prioritize nutritious, whole foods over processed snacks. NEVER suggest unhealthy processed snacks (like BISLI, Bamba, chips, candy, cookies, etc.) unless the user EXPLICITLY requests them in their preferences. For snacks, always suggest healthy options like: fruits, vegetables, nuts, yogurt, cottage cheese, hummus, whole grain crackers, etc. Only include unhealthy snacks if the user specifically mentions "likes BISLI", "loves chips", "wants candy" etc. in their preferences. Even then, limit unhealthy snacks to maximum 1-2 times per week, not daily. Focus on balanced nutrition with whole foods, lean proteins, complex carbohydrates, and healthy fats.'
              },
              {
                role: 'user',
                content: userContent
              }
            ],
            max_tokens: 800,
            temperature: 0.7,
            top_p: 1.0,
            frequency_penalty: 0.0,
            presence_penalty: 0.0,
            stream: false
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          console.error('API Error:', {
            status: response.status,
            statusText: response.statusText,
            error: errorData
          });
          throw new Error(errorData.error?.message || `API Error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        
        if (!data.choices?.[0]?.message?.content) {
          throw new Error('Invalid response format from API');
        }
        
        const content = data.choices[0].message.content;
        
        // If response_json_schema is provided, try to parse the response as JSON
        if (response_json_schema) {
          try {
            return JSON.parse(content);
          } catch (e) {
            console.error('Failed to parse LLM response as JSON:', e);
            return content;
          }
        }
        
        return content;
      } catch (error) {
        console.error('Error calling LLM:', error);
        throw error;
      }
    },
    SendEmail: async (emailData) => {
      console.log('Email would be sent:', emailData);
      return true;
    },
    UploadFile: async (file) => {
      if (!(file instanceof File || file instanceof Blob)) {
        throw new TypeError('UploadFile expects a File or Blob, but got: ' + typeof file);
      }
      return { url: URL.createObjectURL(file) };
    },
    GenerateImage: async (prompt) => {
      return { url: "https://via.placeholder.com/150" };
    },
    ExtractDataFromUploadedFile: async (file) => {
      return { data: {} };
    }
  }
}; 