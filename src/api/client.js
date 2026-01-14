// Local API client implementation
// All API calls now use direct Supabase calls

import { supabase } from '@/lib/supabase';

// Helper function to handle Supabase errors
const handleSupabaseError = (error, operation) => {
  console.error(`❌ Error in ${operation}:`, error);
  throw new Error(error.message || `Failed to ${operation}`);
};

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
      const normalized = { ...data, status: data?.status || 'draft' };
      console.log('🏪 Menu.create called with data:', JSON.stringify(normalized, null, 2));
      try {
        // Check if active menu exists (backend logic)
        if (normalized.user_code && normalized.status === 'active') {
          const { data: existing, error: checkError } = await supabase
            .from('meal_plans_and_schemas')
            .select('id')
            .eq('user_code', normalized.user_code)
            .eq('record_type', 'meal_plan')
            .eq('status', 'active');
          
          if (checkError) throw checkError;
          if (existing && existing.length > 0) {
            throw new Error('Cannot create menu: this user already has an active menu. Please deactivate the existing active menu first.');
          }
        }
        
        // Add change log entry
        const log_entry = {
          timestamp: new Date().toISOString(),
          actor_id: normalized.dietitian_id || 'system',
          action: 'CREATED',
          details: {
            record_type: normalized.record_type,
            meal_plan_name: normalized.meal_plan_name
          }
        };
        const change_log = normalized.change_log || [];
        change_log.push(log_entry);
        normalized.change_log = change_log;
        
        const { data: result, error } = await supabase
          .from('meal_plans_and_schemas')
          .insert(normalized)
          .select()
          .single();
        
        if (error) throw error;
        console.log('✅ Menu.create successfully saved:', result);
        return result;
      } catch (err) {
        handleSupabaseError(err, 'Menu.create');
      }
    },
    get: async (id) => {
      try {
        console.log('🔍 Getting menu with id:', id);
        const { data: result, error } = await supabase
          .from('meal_plans_and_schemas')
          .select('*')
          .eq('id', id)
          .single();
        
        if (error) throw error;
        console.log('✅ Retrieved menu:', result);
        return result;
      } catch (err) {
        handleSupabaseError(err, 'Menu.get');
      }
    },
    list: async () => {
      try {
        console.log('📋 Getting all menus');
        const { data: result, error } = await supabase
          .from('meal_plans_and_schemas')
          .select('*')
          .order('created_at', { ascending: false });
        
        if (error) throw error;
        console.log('✅ Retrieved menus:', result?.length || 0, 'records');
        return result || [];
      } catch (err) {
        handleSupabaseError(err, 'Menu.list');
      }
    },
    filter: async (query, orderBy = 'created_at') => {
      try {
        console.log('🔍 Filtering menus with query:', query);
        let supabaseQuery = supabase.from('meal_plans_and_schemas').select('*');
        
        // Apply filters
        for (const [key, value] of Object.entries(query)) {
          if (value !== null && value !== undefined) {
            if (Array.isArray(value)) {
              if (value.length > 0) {
                supabaseQuery = supabaseQuery.in_(key, value);
              } else {
                // Empty array means no results
                return [];
              }
            } else {
              supabaseQuery = supabaseQuery.eq(key, value);
            }
          }
        }
        
        // Apply ordering
        const orderColumn = orderBy.replace(/^-/, '');
        const desc = orderBy.startsWith('-');
        supabaseQuery = supabaseQuery.order(orderColumn === 'created_date' ? 'created_at' : orderColumn, { ascending: !desc });
        
        const { data: result, error } = await supabaseQuery;
        if (error) throw error;
        console.log('✅ Filtered menus:', result?.length || 0, 'records');
        return result || [];
      } catch (err) {
        handleSupabaseError(err, 'Menu.filter');
      }
    },
    update: async (id, data) => {
      try {
        console.log('✏️ Updating menu with id:', id, 'data:', data);
        
        // Get existing change log
        const { data: existing, error: fetchError } = await supabase
          .from('meal_plans_and_schemas')
          .select('change_log')
          .eq('id', id)
          .single();
        
        if (fetchError) throw fetchError;
        
        // Add change log entry
        const change_log = existing?.change_log || [];
        const log_entry = {
          timestamp: new Date().toISOString(),
          actor_id: data.dietitian_id || 'system',
          action: 'UPDATED',
          details: data
        };
        change_log.push(log_entry);
        data.change_log = change_log;
        data.updated_at = new Date().toISOString();
        
        const { data: result, error } = await supabase
          .from('meal_plans_and_schemas')
          .update(data)
          .eq('id', id)
          .select()
          .single();
        
        if (error) throw error;
        console.log('✅ Updated menu:', result);
        return result;
      } catch (err) {
        handleSupabaseError(err, 'Menu.update');
      }
    },
    delete: async (id) => {
      try {
        console.log('🗑️ Deleting menu with id:', id);
        const { error } = await supabase
          .from('meal_plans_and_schemas')
          .delete()
          .eq('id', id);
        
        if (error) throw error;
        console.log('✅ Deleted menu');
        return true;
      } catch (err) {
        handleSupabaseError(err, 'Menu.delete');
      }
    },
    deleteByUserCode: async (user_code) => {
      try {
        console.log('🗑️ Deleting food logs for user_code:', user_code);
        // First get user_id from chat_users
        const { data: user, error: userError } = await supabase
          .from('chat_users')
          .select('id')
          .eq('user_code', user_code)
          .single();
        
        if (userError) throw userError;
        if (!user) return true;
        
        const { error } = await supabase
          .from('food_logs')
          .delete()
          .eq('user_id', user.id);
        
        if (error) throw error;
        console.log('✅ Deleted food logs for user_code:', user_code);
        return true;
      } catch (err) {
        handleSupabaseError(err, 'Menu.deleteByUserCode');
      }
    }
  },
  Chat: {
    create: async (data) => {
      try {
        console.log('💬 Chat.create called with data:', JSON.stringify(data, null, 2));
        const { data: result, error } = await supabase
          .from('chats')
          .insert(data)
          .select()
          .single();
        
        if (error) throw error;
        console.log('✅ Chat created:', result);
        return result;
      } catch (err) {
        handleSupabaseError(err, 'Chat.create');
      }
    },
    get: async (id) => {
      try {
        console.log('🔍 Getting chat with id:', id);
        const { data: result, error } = await supabase
          .from('chats')
          .select('*')
          .eq('id', id)
          .single();
        
        if (error) throw error;
        console.log('✅ Retrieved chat:', result);
        return result;
      } catch (err) {
        handleSupabaseError(err, 'Chat.get');
      }
    },
    list: async () => {
      try {
        console.log('📋 Getting all chats');
        const { data: result, error } = await supabase
          .from('chats')
          .select('*')
          .order('created_at', { ascending: false });
        
        if (error) throw error;
        console.log('✅ Retrieved chats:', result?.length || 0, 'records');
        return result || [];
      } catch (err) {
        handleSupabaseError(err, 'Chat.list');
      }
    },
    filter: async (query) => {
      try {
        console.log('🔍 Filtering chats with query:', query);
        let supabaseQuery = supabase.from('chats').select('*');
        
        for (const [key, value] of Object.entries(query)) {
          if (value !== null && value !== undefined) {
            supabaseQuery = supabaseQuery.eq(key, value);
          }
        }
        
        const { data: result, error } = await supabaseQuery;
        if (error) throw error;
        console.log('✅ Filtered chats:', result?.length || 0, 'records');
        return result || [];
      } catch (err) {
        handleSupabaseError(err, 'Chat.filter');
      }
    },
    update: async (id, data) => {
      try {
        console.log('✏️ Updating chat with id:', id, 'data:', data);
        data.updated_at = new Date().toISOString();
        const { data: result, error } = await supabase
          .from('chats')
          .update(data)
          .eq('id', id)
          .select()
          .single();
        
        if (error) throw error;
        console.log('✅ Updated chat:', result);
        return result;
      } catch (err) {
        handleSupabaseError(err, 'Chat.update');
      }
    },
    delete: async (id) => {
      try {
        console.log('🗑️ Deleting chat with id:', id);
        const { error } = await supabase
          .from('chats')
          .delete()
          .eq('id', id);
        
        if (error) throw error;
        console.log('✅ Deleted chat');
        return true;
      } catch (err) {
        handleSupabaseError(err, 'Chat.delete');
      }
    }
  },
  ChatUser: {
    create: async (data) => {
      try {
        console.log('👤 Creating new chat user with data:', JSON.stringify(data, null, 2));
        const { data: result, error } = await supabase
          .from('chat_users')
          .insert(data)
          .select()
          .single();
        
        if (error) throw error;
        console.log('✅ Chat user created:', result);
        return result;
      } catch (err) {
        handleSupabaseError(err, 'ChatUser.create');
      }
    },
    list: async (fields = '*') => {
      try {
        console.log('👥 Getting all chat users');
        const selectFields = fields === '*' ? '*' : fields.join(',');
        const { data: result, error } = await supabase
          .from('chat_users')
          .select(selectFields)
          .order('full_name');
        
        if (error) throw error;
        console.log('✅ Retrieved chat users:', result?.length || 0, 'records');
        return result || [];
      } catch (err) {
        handleSupabaseError(err, 'ChatUser.list');
      }
    },
    get: async (userCode, fields = '*') => {
      try {
        console.log('🔍 Getting chat user with user_code:', userCode);
        const selectFields = fields === '*' ? '*' : fields.join(',');
        const { data: result, error } = await supabase
          .from('chat_users')
          .select(selectFields)
          .eq('user_code', userCode)
          .single();
        
        if (error) throw error;
        console.log('✅ Retrieved chat user:', result);
        return result;
      } catch (err) {
        handleSupabaseError(err, 'ChatUser.get');
      }
    },
    getByUserCode: async (userCode) => {
      try {
        console.log('🔍 Getting chat user with user_code:', userCode);
        const { data: result, error } = await supabase
          .from('chat_users')
          .select('*')
          .eq('user_code', userCode)
          .single();
        
        if (error) throw error;
        console.log('✅ Retrieved chat user with full profile:', result);
        return result;
      } catch (err) {
        handleSupabaseError(err, 'ChatUser.getByUserCode');
      }
    },
    update: async (userCode, data) => {
      try {
        console.log('✏️ Updating chat user with user_code:', userCode, 'data:', data);
        const { data: result, error } = await supabase
          .from('chat_users')
          .update(data)
          .eq('user_code', userCode)
          .select()
          .single();
        
        if (error) throw error;
        console.log('✅ Updated chat user:', result);
        return result;
      } catch (err) {
        handleSupabaseError(err, 'ChatUser.update');
      }
    },
    delete: async (userCode) => {
      try {
        console.log('🗑️ Deleting chat user with user_code:', userCode);
        const { error } = await supabase
          .from('chat_users')
          .delete()
          .eq('user_code', userCode);
        
        if (error) throw error;
        console.log('✅ Deleted chat user');
        return true;
      } catch (err) {
        handleSupabaseError(err, 'ChatUser.delete');
      }
    },
    getMealPlanByUserCode: async (userCode) => {
      try {
        console.log('🍽️ Getting active meal plan for user_code:', userCode);
        const { data: result, error } = await supabase
          .from('meal_plans_and_schemas')
          .select('meal_plan, daily_total_calories, macros_target, recommendations, dietary_restrictions')
          .eq('user_code', userCode)
          .eq('record_type', 'meal_plan')
          .eq('status', 'active')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        
        if (error) throw error;
        console.log('✅ Retrieved active meal plan:', result);
        return result;
      } catch (err) {
        handleSupabaseError(err, 'ChatUser.getMealPlanByUserCode');
      }
    }
  },
  Profiles: {
    list: async () => {
      try {
        console.log('📋 Fetching profiles with company info');
        const { data: result, error } = await supabase
          .from('profiles')
          .select('id, role, company_id, name, created_at, company:companies(id, name)')
          .order('created_at', { ascending: false });
        
        if (error) throw error;
        console.log('✅ Retrieved profiles:', result?.length || 0, 'records');
        return result || [];
      } catch (err) {
        handleSupabaseError(err, 'Profiles.list');
      }
    },
    getBasic: async () => {
      try {
        console.log('📋 Fetching basic profile information');
        const { data: result, error } = await supabase
          .from('profiles')
          .select('id, role, company_id');
        
        if (error) throw error;
        console.log('✅ Retrieved basic profiles:', result?.length || 0, 'records');
        return result || [];
      } catch (err) {
        handleSupabaseError(err, 'Profiles.getBasic');
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
        
        if (error) throw error;
        console.log('✅ Updated profile:', result);
        return result;
      } catch (err) {
        handleSupabaseError(err, 'Profiles.update');
      }
    }
  },
  Companies: {
    list: async () => {
      try {
        console.log('🏢 Fetching companies list');
        const { data: result, error } = await supabase
          .from('companies')
          .select('id, name')
          .order('name');
        
        if (error) throw error;
        console.log('✅ Retrieved companies:', result?.length || 0, 'records');
        return result || [];
      } catch (err) {
        handleSupabaseError(err, 'Companies.list');
      }
    },
    create: async (name) => {
      try {
        console.log('🏢 Creating company:', name);
        if (!name) throw new Error('Company name is required');
        const { data: result, error } = await supabase
          .from('companies')
          .insert({ name })
          .select()
          .single();
        
        if (error) throw error;
        console.log('✅ Company created:', result);
        return result;
      } catch (err) {
        handleSupabaseError(err, 'Companies.create');
      }
    },
  },
  WeightLogs: {
    getByUserCode: async (userCode) => {
      try {
        console.log('⚖️ Getting weight logs for user_code:', userCode);
        const { data: result, error } = await supabase
          .from('weight_logs')
          .select('*')
          .eq('user_code', userCode)
          .order('measurement_date');
        
        if (error) throw error;
        console.log('✅ Retrieved weight logs:', result?.length || 0, 'records');
        return result || [];
      } catch (err) {
        handleSupabaseError(err, 'WeightLogs.getByUserCode');
      }
    },
    list: async (userCode = null, userCodes = null, limit = null) => {
      try {
        console.log('⚖️ Getting all weight logs');
        let query = supabase.from('weight_logs').select('*');
        
        if (userCode) {
          query = query.eq('user_code', userCode);
        } else if (userCodes && Array.isArray(userCodes) && userCodes.length > 0) {
          query = query.in_('user_code', userCodes);
        }
        
        if (limit) query = query.limit(limit);
        query = query.order('measurement_date', { ascending: false });
        
        const { data: result, error } = await query;
        if (error) throw error;
        console.log('✅ Retrieved all weight logs:', result?.length || 0, 'records');
        return result || [];
      } catch (err) {
        handleSupabaseError(err, 'WeightLogs.list');
      }
    },
    getUniqueUserCodes: async () => {
      try {
        console.log('⚖️ Getting unique user codes with weight logs');
        const { data: allLogs, error } = await supabase
          .from('weight_logs')
          .select('user_code');
        
        if (error) throw error;
        const uniqueUserCodes = [...new Set(allLogs.map(item => item.user_code).filter(Boolean))];
        console.log('✅ Retrieved unique user codes with weight logs:', uniqueUserCodes);
        return uniqueUserCodes;
      } catch (err) {
        handleSupabaseError(err, 'WeightLogs.getUniqueUserCodes');
      }
    },
    create: async (data) => {
      try {
        console.log('⚖️ Creating weight log entry:', JSON.stringify(data, null, 2));
        const { data: result, error } = await supabase
          .from('weight_logs')
          .insert(data)
          .select()
          .single();
        
        if (error) throw error;
        console.log('✅ Created weight log entry:', result);
        return result;
      } catch (err) {
        handleSupabaseError(err, 'WeightLogs.create');
      }
    },
    update: async (id, data) => {
      try {
        console.log('✏️ Updating weight log entry:', id, JSON.stringify(data, null, 2));
        const { data: result, error } = await supabase
          .from('weight_logs')
          .update(data)
          .eq('id', id)
          .select()
          .single();
        
        if (error) throw error;
        console.log('✅ Updated weight log entry:', result);
        return result;
      } catch (err) {
        handleSupabaseError(err, 'WeightLogs.update');
      }
    },
    delete: async (id) => {
      try {
        console.log('🗑️ Deleting weight log entry:', id);
        const { error } = await supabase
          .from('weight_logs')
          .delete()
          .eq('id', id);
        
        if (error) throw error;
        console.log('✅ Deleted weight log entry');
        return true;
      } catch (err) {
        handleSupabaseError(err, 'WeightLogs.delete');
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
        let supabaseQuery = supabase.from('chat_users').select('*');
        
        if (query.dietitian_id) {
          supabaseQuery = supabaseQuery.eq('provider_id', query.dietitian_id);
        }
        if (query.code) {
          supabaseQuery = supabaseQuery.eq('user_code', query.code);
        }
        
        supabaseQuery = supabaseQuery.order('full_name');
        const { data: result, error } = await supabaseQuery;
        
        if (error) throw error;
        console.log('✅ Retrieved filtered clients:', result?.length || 0, 'records');
        return result || [];
      } catch (err) {
        handleSupabaseError(err, 'Client.filter');
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
    getByUserId: async (user_id) => {
      // Note: This method requires user_code, not user_id
      // We'll need to get user_code first or use getByUserCode instead
      throw new Error('getByUserId requires user_code. Use getByUserCode instead.');
    },
    getByUserCode: async (user_code) => {
      try {
        console.log('🍽️ Getting food logs for user_code:', user_code);
        // First get user_id from chat_users
        const { data: user, error: userError } = await supabase
          .from('chat_users')
          .select('id')
          .eq('user_code', user_code)
          .single();
        
        if (userError) throw userError;
        if (!user) return [];
        
        const { data: result, error } = await supabase
          .from('food_logs')
          .select('*')
          .eq('user_id', user.id)
          .order('log_date', { ascending: false });
        
        if (error) throw error;
        console.log('✅ Retrieved food logs:', result?.length || 0, 'records');
        return result || [];
      } catch (err) {
        handleSupabaseError(err, 'FoodLogs.getByUserCode');
      }
    },
    analyzePreferences: async (user_code) => {
      try {
        console.log('🔍 Analyzing food preferences for user_code:', user_code);
        // Get user_id
        const { data: user, error: userError } = await supabase
          .from('chat_users')
          .select('id')
          .eq('user_code', user_code)
          .single();
        
        if (userError) throw userError;
        if (!user) return null;
        
        // Get food logs
        const { data: foodLogs, error: logsError } = await supabase
          .from('food_logs')
          .select('*')
          .eq('user_id', user.id)
          .order('log_date', { ascending: false });
        
        if (logsError) throw logsError;
        if (!foodLogs || foodLogs.length === 0) return null;
        
        // Analyze preferences (same logic as backend)
        const all_food_items = [];
        for (const log of foodLogs) {
          if (log.food_items) {
            const items = Array.isArray(log.food_items) ? log.food_items : [log.food_items];
            for (const item of items) {
              if (item && item.name) {
                all_food_items.push({
                  name: item.name,
                  meal_label: log.meal_label,
                  date: log.log_date
                });
              }
            }
          }
        }
        
        // Count frequencies
        const food_frequency = {};
        for (const item of all_food_items) {
          const name = item.name.toLowerCase().trim();
          food_frequency[name] = (food_frequency[name] || 0) + 1;
        }
        
        // Get top 10 foods
        const sorted_foods = Object.entries(food_frequency)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10);
        
        // Analyze meal patterns
        const meal_counts = {};
        const foods_by_meal = {};
        
        for (const log of foodLogs) {
          const meal_label = log.meal_label;
          if (meal_label) {
            meal_counts[meal_label] = (meal_counts[meal_label] || 0) + 1;
            
            if (!foods_by_meal[meal_label]) {
              foods_by_meal[meal_label] = {};
            }
            
            if (log.food_items) {
              const items = Array.isArray(log.food_items) ? log.food_items : [log.food_items];
              for (const item of items) {
                if (item && item.name) {
                  const food_name = item.name.toLowerCase().trim();
                  foods_by_meal[meal_label][food_name] = (foods_by_meal[meal_label][food_name] || 0) + 1;
                }
              }
            }
          }
        }
        
        // Sort foods by meal
        const foods_by_meal_sorted = {};
        for (const [meal, foods] of Object.entries(foods_by_meal)) {
          const sorted_meal_foods = Object.entries(foods)
            .sort((a, b) => b[1] - a[1])
            .map(([name, count]) => ({ name, count }));
          foods_by_meal_sorted[meal] = sorted_meal_foods;
        }
        
        const preferences = {
          frequently_consumed_foods: sorted_foods.map(([name]) => name),
          meal_patterns: meal_counts,
          foods_by_meal: foods_by_meal_sorted,
          total_logs: foodLogs.length,
          analysis_date: new Date().toISOString()
        };
        
        console.log('✅ Food preferences analysis completed:', preferences);
        return preferences;
      } catch (err) {
        handleSupabaseError(err, 'FoodLogs.analyzePreferences');
      }
    }
  },
  ChatMessage: {
    create: async (messageData) => {
      try {
        console.log('💬 ChatMessage.create called with data:', JSON.stringify(messageData, null, 2));
        const { data: result, error } = await supabase
          .from('chat_messages')
          .insert(messageData)
          .select()
          .single();
        
        if (error) throw error;
        console.log('✅ Chat message created:', result);
        return result;
      } catch (err) {
        handleSupabaseError(err, 'ChatMessage.create');
      }
    },
    listByConversation: async (conversation_id, { limit = 20, beforeMessageId = null } = {}) => {
      try {
        let query = supabase
          .from('chat_messages')
          .select('*')
          .eq('conversation_id', conversation_id)
          .order('created_at', { ascending: false })
          .limit(limit);
        
        if (beforeMessageId) {
          query = query.lt('id', beforeMessageId);
        }
        
        const { data: result, error } = await query;
        if (error) throw error;
        return result || [];
      } catch (err) {
        handleSupabaseError(err, 'ChatMessage.listByConversation');
      }
    },
    deleteByConversation: async (conversation_id) => {
      try {
        console.log('🗑️ Deleting chat messages for conversation:', conversation_id);
        const { error } = await supabase
          .from('chat_messages')
          .delete()
          .eq('conversation_id', conversation_id);
        
        if (error) throw error;
        console.log('✅ Deleted chat messages for conversation:', conversation_id);
        return true;
      } catch (err) {
        handleSupabaseError(err, 'ChatMessage.deleteByConversation');
      }
    },
    deleteByUserCode: async (user_code) => {
      try {
        console.log('🗑️ Deleting chat messages for user_code:', user_code);
        // Get user_id
        const { data: user, error: userError } = await supabase
          .from('chat_users')
          .select('id')
          .eq('user_code', user_code)
          .single();
        
        if (userError) throw userError;
        if (!user) return true;
        
        // Get conversations
        const { data: conversations, error: convError } = await supabase
          .from('chat_conversations')
          .select('id')
          .eq('user_id', user.id);
        
        if (convError) throw convError;
        if (!conversations || conversations.length === 0) return true;
        
        const conversation_ids = conversations.map(c => c.id);
        
        // Delete messages
        const { error } = await supabase
          .from('chat_messages')
          .delete()
          .in_('conversation_id', conversation_ids);
        
        if (error) throw error;
        console.log('✅ Deleted chat messages for user_code:', user_code);
        return true;
      } catch (err) {
        handleSupabaseError(err, 'ChatMessage.deleteByUserCode');
      }
    },
  },
  
  MessageQueue: {
    addToQueue: async (queueData) => {
      try {
        console.log('📬 MessageQueue.addToQueue called with data:', JSON.stringify(queueData, null, 2));
        if (!queueData.conversation_id || !queueData.client_id || !queueData.dietitian_id) {
          throw new Error('Missing required fields: conversation_id, client_id, and dietitian_id are required');
        }
        const { data: result, error } = await supabase
          .from('message_queue')
          .insert(queueData)
          .select()
          .single();
        
        if (error) throw error;
        console.log('✅ Message added to queue:', result);
        return result;
      } catch (err) {
        handleSupabaseError(err, 'MessageQueue.addToQueue');
      }
    },
    getPendingForUser: async (userCode) => {
      try {
        console.log('📬 Getting pending messages for user:', userCode);
        const { data: result, error } = await supabase
          .from('message_queue')
          .select('*')
          .eq('user_code', userCode)
          .order('created_at', { ascending: false });
        
        if (error) throw error;
        const pending = (result || []).filter(msg => msg.status === 'pending');
        console.log('✅ Retrieved pending messages from queue:', pending.length, 'records');
        return pending;
      } catch (err) {
        handleSupabaseError(err, 'MessageQueue.getPendingForUser');
      }
    },
    getPendingForClient: async (clientId) => {
      try {
        console.log('📬 Getting pending messages for client ID:', clientId);
        const { data: result, error } = await supabase
          .from('message_queue')
          .select('*')
          .eq('client_id', clientId)
          .eq('status', 'pending')
          .order('priority', { ascending: false })
          .order('created_at');
        
        if (error) throw error;
        console.log('✅ Retrieved pending messages for client:', result?.length || 0, 'records');
        return result || [];
      } catch (err) {
        handleSupabaseError(err, 'MessageQueue.getPendingForClient');
      }
    },
    getByDietitian: async (dietitianId, { status = null, limit = 100, offset = 0 } = {}) => {
      try {
        console.log('📬 Getting messages by dietitian:', dietitianId);
        let query = supabase
          .from('message_queue')
          .select('*')
          .eq('dietitian_id', dietitianId)
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1);
        
        if (status) query = query.eq('status', status);
        
        const { data: result, error } = await query;
        if (error) throw error;
        console.log('✅ Retrieved messages by dietitian:', result?.length || 0, 'records');
        return result || [];
      } catch (err) {
        handleSupabaseError(err, 'MessageQueue.getByDietitian');
      }
    },
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
        
        if (error) throw error;
        console.log('✅ Message status updated in queue:', result);
        return result;
      } catch (err) {
        handleSupabaseError(err, 'MessageQueue.updateStatus');
      }
    },
    listAll: async ({ status = null, limit = 100, offset = 0 } = {}) => {
      try {
        console.log('📬 Getting all messages from queue');
        let query = supabase
          .from('message_queue')
          .select('*, chat_conversations!inner(id, started_at), chat_users!inner(id, full_name, user_code)')
          .order('priority', { ascending: false })
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1);
        
        if (status) query = query.eq('status', status);
        
        const { data: result, error } = await query;
        if (error) throw error;
        console.log('✅ Retrieved messages from queue:', result?.length || 0, 'records');
        return result || [];
      } catch (err) {
        handleSupabaseError(err, 'MessageQueue.listAll');
      }
    },
    listByUserCode: async (user_code) => {
      try {
        console.log('📬 Listing queued messages for user_code:', user_code);
        const { data: result, error } = await supabase
          .from('message_queue')
          .select('*')
          .eq('user_code', user_code)
          .order('created_at', { ascending: false });
        
        if (error) throw error;
        console.log('✅ Retrieved queued messages for user_code:', user_code, 'count:', result?.length || 0);
        return result || [];
      } catch (err) {
        handleSupabaseError(err, 'MessageQueue.listByUserCode');
      }
    },
    deleteByConversation: async (conversation_id) => {
      try {
        console.log('🗑️ Deleting queued messages for conversation:', conversation_id);
        const { error } = await supabase
          .from('message_queue')
          .delete()
          .eq('conversation_id', conversation_id);
        
        if (error) throw error;
        console.log('✅ Deleted queued messages for conversation:', conversation_id);
        return true;
      } catch (err) {
        handleSupabaseError(err, 'MessageQueue.deleteByConversation');
      }
    },
    deleteByUserCode: async (user_code) => {
      try {
        console.log('🗑️ Deleting queued messages for user_code:', user_code);
        const { error } = await supabase
          .from('message_queue')
          .delete()
          .eq('user_code', user_code);
        
        if (error) throw error;
        console.log('✅ Deleted queued messages for user_code:', user_code);
        return true;
      } catch (err) {
        handleSupabaseError(err, 'MessageQueue.deleteByUserCode');
      }
    },
  },
  ChatConversation: {
    list: async (fields = '*') => {
      try {
        console.log('📃 Listing all chat conversations');
        const selectFields = fields === '*' ? '*' : fields.join(',');
        const { data: result, error } = await supabase
          .from('chat_conversations')
          .select(selectFields)
          .order('started_at', { ascending: false });
        
        if (error) throw error;
        console.log('✅ Retrieved all chat conversations:', result?.length || 0, 'records');
        return result || [];
      } catch (err) {
        handleSupabaseError(err, 'ChatConversation.list');
      }
    },
    getByUserId: async (user_id) => {
      // Note: This requires user_code, use getByUserCode instead
      throw new Error('getByUserId requires user_code. Use getByUserCode instead.');
    },
    getByUserCode: async (user_code) => {
      try {
        // Get user_id from chat_users
        const { data: user, error: userError } = await supabase
          .from('chat_users')
          .select('id')
          .eq('user_code', user_code)
          .single();
        
        if (userError) throw userError;
        if (!user) return null;
        
        const { data: result, error } = await supabase
          .from('chat_conversations')
          .select('*')
          .eq('user_id', user.id)
          .order('started_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        
        if (error) throw error;
        return result;
      } catch (err) {
        handleSupabaseError(err, 'ChatConversation.getByUserCode');
      }
    },
    listByUserCode: async (user_code) => {
      try {
        console.log('📃 Listing chat conversations for user_code:', user_code);
        // Get user_id from chat_users
        const { data: user, error: userError } = await supabase
          .from('chat_users')
          .select('id')
          .eq('user_code', user_code)
          .single();
        
        if (userError) throw userError;
        if (!user) return [];
        
        const { data: result, error } = await supabase
          .from('chat_conversations')
          .select('*')
          .eq('user_id', user.id)
          .order('started_at', { ascending: false });
        
        if (error) throw error;
        console.log('✅ Retrieved chat conversations for user_code:', user_code, 'count:', result?.length || 0);
        return result || [];
      } catch (err) {
        handleSupabaseError(err, 'ChatConversation.listByUserCode');
      }
    },
    delete: async (id) => {
      try {
        console.log('🗑️ Deleting chat conversation with id:', id);
        const { error } = await supabase
          .from('chat_conversations')
          .delete()
          .eq('id', id);
        
        if (error) throw error;
        console.log('✅ Deleted chat conversation with id:', id);
        return true;
      } catch (err) {
        handleSupabaseError(err, 'ChatConversation.delete');
      }
    },
    deleteByUserCode: async (user_code) => {
      try {
        console.log('🗑️ Deleting chat conversations for user_code:', user_code);
        // Get user_id from chat_users
        const { data: user, error: userError } = await supabase
          .from('chat_users')
          .select('id')
          .eq('user_code', user_code)
          .single();
        
        if (userError) throw userError;
        if (!user) return true;
        
        const { error } = await supabase
          .from('chat_conversations')
          .delete()
          .eq('user_id', user.id);
        
        if (error) throw error;
        console.log('✅ Deleted chat conversations for user_code:', user_code);
        return true;
      } catch (err) {
        handleSupabaseError(err, 'ChatConversation.deleteByUserCode');
      }
    }
  },
  
  // Training Management APIs
  TrainingPlans: {
    getByUserCode: async (userCode) => {
      try {
        const { data: result, error } = await supabase
          .from('training_plans')
          .select('*')
          .eq('user_code', userCode)
          .order('created_at', { ascending: false });
        
        if (error) throw error;
        return result || [];
      } catch (err) {
        handleSupabaseError(err, 'TrainingPlans.getByUserCode');
      }
    },
    getAll: async () => {
      try {
        const { data: result, error } = await supabase
          .from('training_plans')
          .select('*')
          .order('created_at', { ascending: false });
        
        if (error) throw error;
        return result || [];
      } catch (err) {
        handleSupabaseError(err, 'TrainingPlans.getAll');
      }
    },
    getActive: async (userCode) => {
      try {
        const { data: result, error } = await supabase
          .from('training_plans')
          .select('*')
          .eq('user_code', userCode)
          .eq('status', 'active')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        
        if (error) throw error;
        return result || null;
      } catch (err) {
        handleSupabaseError(err, 'TrainingPlans.getActive');
      }
    },
    create: async (planData) => {
      try {
        // If setting as active, deactivate other plans (backend logic)
        if (planData.status === 'active' && planData.user_code) {
          await supabase
            .from('training_plans')
            .update({ status: 'archived' })
            .eq('user_code', planData.user_code)
            .eq('status', 'active');
        }
        
        const { data: result, error } = await supabase
          .from('training_plans')
          .insert(planData)
          .select()
          .single();
        
        if (error) throw error;
        return result;
      } catch (err) {
        handleSupabaseError(err, 'TrainingPlans.create');
      }
    },
    update: async (id, updates) => {
      try {
        updates.updated_at = new Date().toISOString();
        const { data: result, error } = await supabase
          .from('training_plans')
          .update(updates)
          .eq('id', id)
          .select()
          .single();
        
        if (error) throw error;
        return result;
      } catch (err) {
        handleSupabaseError(err, 'TrainingPlans.update');
      }
    },
    delete: async (id) => {
      try {
        const { error } = await supabase
          .from('training_plans')
          .delete()
          .eq('id', id);
        
        if (error) throw error;
        return true;
      } catch (err) {
        handleSupabaseError(err, 'TrainingPlans.delete');
      }
    },
  },
  TrainingLogs: {
    getByUserCode: async (userCode, limit = 50) => {
      try {
        const { data: result, error } = await supabase
          .from('training_logs')
          .select('*')
          .eq('user_code', userCode)
          .order('session_date', { ascending: false })
          .limit(limit);
        
        if (error) throw error;
        return result || [];
      } catch (err) {
        handleSupabaseError(err, 'TrainingLogs.getByUserCode');
      }
    },
    getByDateRange: async (userCode, startDate, endDate) => {
      try {
        const { data: result, error } = await supabase
          .from('training_logs')
          .select('*')
          .eq('user_code', userCode)
          .gte('session_date', startDate)
          .lte('session_date', endDate)
          .order('session_date', { ascending: false });
        
        if (error) throw error;
        return result || [];
      } catch (err) {
        handleSupabaseError(err, 'TrainingLogs.getByDateRange');
      }
    },
    getAll: async (limit = 100) => {
      try {
        const { data: result, error } = await supabase
          .from('training_logs')
          .select('*')
          .order('session_date', { ascending: false })
          .limit(limit);
        
        if (error) throw error;
        return result || [];
      } catch (err) {
        handleSupabaseError(err, 'TrainingLogs.getAll');
      }
    },
  },
  TrainingAnalytics: {
    getByUserCode: async (userCode) => {
      try {
        const { data: result, error } = await supabase
          .from('training_progress_analytics')
          .select('*')
          .eq('user_code', userCode)
          .order('date_end', { ascending: false });
        
        if (error) throw error;
        return result || [];
      } catch (err) {
        handleSupabaseError(err, 'TrainingAnalytics.getByUserCode');
      }
    },
    getByExercise: async (userCode, exerciseName) => {
      try {
        const { data: result, error } = await supabase
          .from('training_progress_analytics')
          .select('*')
          .eq('user_code', userCode)
          .eq('exercise_name', exerciseName)
          .order('date_end', { ascending: false });
        
        if (error) throw error;
        return result || [];
      } catch (err) {
        handleSupabaseError(err, 'TrainingAnalytics.getByExercise');
      }
    },
  },
  
  TrainingReminders: {
    getPending: async () => {
      try {
        const { data: result, error } = await supabase
          .from('training_reminder_queue')
          .select('*')
          .eq('status', 'pending')
          .order('scheduled_for');
        
        if (error) throw error;
        return result || [];
      } catch (err) {
        handleSupabaseError(err, 'TrainingReminders.getPending');
      }
    },
    getByUserCode: async (userCode) => {
      try {
        const { data: result, error } = await supabase
          .from('training_reminder_queue')
          .select('*')
          .eq('user_code', userCode)
          .order('scheduled_for', { ascending: false });
        
        if (error) throw error;
        return result || [];
      } catch (err) {
        handleSupabaseError(err, 'TrainingReminders.getByUserCode');
      }
    },
    create: async (reminderData) => {
      try {
        const { data: result, error } = await supabase
          .from('training_reminder_queue')
          .insert(reminderData)
          .select()
          .single();
        
        if (error) throw error;
        return result;
      } catch (err) {
        handleSupabaseError(err, 'TrainingReminders.create');
      }
    },
    updateStatus: async (id, status, errorMessage = null) => {
      try {
        const updateData = { status };
        if (status === 'sent') {
          updateData.sent_at = new Date().toISOString();
        }
        if (errorMessage) updateData.error_message = errorMessage;
        
        const { data: result, error } = await supabase
          .from('training_reminder_queue')
          .update(updateData)
          .eq('id', id)
          .select()
          .single();
        
        if (error) throw error;
        return result;
      } catch (err) {
        handleSupabaseError(err, 'TrainingReminders.updateStatus');
      }
    },
    delete: async (id) => {
      try {
        const { error } = await supabase
          .from('training_reminder_queue')
          .delete()
          .eq('id', id);
        
        if (error) throw error;
        return true;
      } catch (err) {
        handleSupabaseError(err, 'TrainingReminders.delete');
      }
    },
  },
  ExerciseLibrary: {
    getAll: async () => {
      try {
        const { data: result, error } = await supabase
          .from('exercise_library')
          .select('*')
          .eq('is_active', true)
          .order('exercise_name');
        
        if (error) throw error;
        return result || [];
      } catch (err) {
        handleSupabaseError(err, 'ExerciseLibrary.getAll');
      }
    },
    getByCategory: async (category) => {
      try {
        const { data: result, error } = await supabase
          .from('exercise_library')
          .select('*')
          .eq('category', category)
          .eq('is_active', true)
          .order('exercise_name');
        
        if (error) throw error;
        return result || [];
      } catch (err) {
        handleSupabaseError(err, 'ExerciseLibrary.getByCategory');
      }
    },
    search: async (searchTerm) => {
      try {
        if (!searchTerm) return [];
        const { data: result, error } = await supabase
          .from('exercise_library')
          .select('*')
          .ilike('exercise_name', `%${searchTerm}%`)
          .eq('is_active', true)
          .order('exercise_name');
        
        if (error) throw error;
        return result || [];
      } catch (err) {
        handleSupabaseError(err, 'ExerciseLibrary.search');
      }
    },
    create: async (exerciseData) => {
      try {
        const { data: result, error } = await supabase
          .from('exercise_library')
          .insert(exerciseData)
          .select()
          .single();
        
        if (error) throw error;
        return result;
      } catch (err) {
        handleSupabaseError(err, 'ExerciseLibrary.create');
      }
    },
    update: async (id, updates) => {
      try {
        updates.updated_at = new Date().toISOString();
        const { data: result, error } = await supabase
          .from('exercise_library')
          .update(updates)
          .eq('id', id)
          .select()
          .single();
        
        if (error) throw error;
        return result;
      } catch (err) {
        handleSupabaseError(err, 'ExerciseLibrary.update');
      }
    },
  },
  TrainingPlanTemplates: {
    getAll: async () => {
      try {
        const { data: result, error } = await supabase
          .from('training_plan_templates')
          .select('*')
          .eq('is_active', true)
          .order('created_at', { ascending: false });
        
        if (error) throw error;
        return result || [];
      } catch (err) {
        handleSupabaseError(err, 'TrainingPlanTemplates.getAll');
      }
    },
    getOwn: async () => {
      // Note: Filter from getAll results - would need user context for filtering
      try {
        const { data: result, error } = await supabase
          .from('training_plan_templates')
          .select('*')
          .eq('is_active', true)
          .order('created_at', { ascending: false });
        
        if (error) throw error;
        return result || [];
      } catch (err) {
        handleSupabaseError(err, 'TrainingPlanTemplates.getOwn');
      }
    },
    getPublic: async () => {
      try {
        const { data: result, error } = await supabase
          .from('training_plan_templates')
          .select('*')
          .eq('is_public', true)
          .eq('is_active', true)
          .order('usage_count', { ascending: false });
        
        if (error) throw error;
        return result || [];
      } catch (err) {
        handleSupabaseError(err, 'TrainingPlanTemplates.getPublic');
      }
    },
    search: async (searchTerm) => {
      try {
        if (!searchTerm) return [];
        const { data: result, error } = await supabase
          .from('training_plan_templates')
          .select('*')
          .ilike('template_name', `%${searchTerm}%`)
          .eq('is_active', true)
          .order('created_at', { ascending: false });
        
        if (error) throw error;
        return result || [];
      } catch (err) {
        handleSupabaseError(err, 'TrainingPlanTemplates.search');
      }
    },
    create: async (templateData) => {
      try {
        const { data: result, error } = await supabase
          .from('training_plan_templates')
          .insert(templateData)
          .select()
          .single();
        
        if (error) throw error;
        return result;
      } catch (err) {
        handleSupabaseError(err, 'TrainingPlanTemplates.create');
      }
    },
    update: async (id, updates) => {
      try {
        updates.updated_at = new Date().toISOString();
        const { data: result, error } = await supabase
          .from('training_plan_templates')
          .update(updates)
          .eq('id', id)
          .select()
          .single();
        
        if (error) throw error;
        return result;
      } catch (err) {
        handleSupabaseError(err, 'TrainingPlanTemplates.update');
      }
    },
    delete: async (id) => {
      try {
        // Soft delete
        const { error } = await supabase
          .from('training_plan_templates')
          .update({ is_active: false })
          .eq('id', id);
        
        if (error) throw error;
        return true;
      } catch (err) {
        handleSupabaseError(err, 'TrainingPlanTemplates.delete');
      }
    },
    hardDelete: async (id) => {
      try {
        // Hard delete
        const { error } = await supabase
          .from('training_plan_templates')
          .delete()
          .eq('id', id);
        
        if (error) throw error;
        return true;
      } catch (err) {
        handleSupabaseError(err, 'TrainingPlanTemplates.hardDelete');
      }
    },
    incrementUsage: async (id) => {
      try {
        // Get current count
        const { data: current, error: fetchError } = await supabase
          .from('training_plan_templates')
          .select('usage_count')
          .eq('id', id)
          .single();
        
        if (fetchError) throw fetchError;
        const newCount = (current?.usage_count || 0) + 1;
        
        const { error } = await supabase
          .from('training_plan_templates')
          .update({ usage_count: newCount })
          .eq('id', id);
        
        if (error) throw error;
        return true;
      } catch (err) {
        console.error('❌ Error incrementing template usage:', err);
        return false; // Non-critical
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