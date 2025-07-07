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
  Menu: {
    create: async (data) => {
      console.log('🏪 Menu.create called with data:', JSON.stringify(data, null, 2));
      
      try {
        // Log the creation
        const logEntry = {
          timestamp: new Date().toISOString(),
          actor_id: data.dietitian_id || 'system',
          action: 'CREATED',
          details: { record_type: data.record_type, meal_plan_name: data.meal_plan_name }
        };
        
        console.log('📝 Creating log entry:', logEntry);
        
        const changeLog = data.change_log || [];
        changeLog.push(logEntry);
        
        // Prepare data for Supabase
        const supabaseData = {
          ...data,
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
        
        let supabaseQuery = supabase
          .from('meal_plans_and_schemas')
          .select('*');
        
        // Apply filters
        Object.entries(query).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            supabaseQuery = supabaseQuery.eq(key, value);
          }
        });
        
        // Apply ordering
        if (orderBy.startsWith('-')) {
          supabaseQuery = supabaseQuery.order(orderBy.substring(1), { ascending: false });
        } else {
          supabaseQuery = supabaseQuery.order(orderBy, { ascending: true });
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
      try {
        console.log('✏️ Updating menu with id:', id, 'data:', data);
        
        // Log the update
        const logEntry = {
          timestamp: new Date().toISOString(),
          actor_id: data.dietitian_id || 'system',
          action: 'UPDATED',
          details: data
        };
        
        // Get existing change log
        const existing = await this.get(id);
        const existingChangeLog = existing.change_log || [];
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
            dailyTotalCalories,
            recommendations,
            food_limitations,
            Activity_level,
            goal,
            number_of_meals,
            client_preference,
            macros
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
        console.log('🍽️ Getting meal plan for user_code:', userCode);
        
        const { data, error } = await supabase
          .from('meal_plans_and_schemas')
          .select('meal_plan, daily_total_calories, macros_target, recommendations, dietary_restrictions')
          .eq('user_code', userCode)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();
        
        if (error) {
          console.error('❌ Supabase meal plan get error:', error);
          throw new Error(`Supabase error: ${error.message}`);
        }
        
        console.log('✅ Retrieved meal plan from Supabase:', data);
        return data;
        
      } catch (err) {
        console.error('❌ Error in ChatUser.getMealPlanByUserCode:', err);
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
        const res = await fetch('/client.json');
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
        const res = await fetch('/client.json');
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
        const res = await fetch('/client.json');
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
    update: async (id, data) => {
      return { id, ...data };
    },
    delete: async (id) => {
      return true;
    }
  }
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
                content: 'You are a friendly and helpful nutritionist assistant. Keep your responses concise and to the point. Use emojis appropriately to make the conversation engaging. When answering questions about specific foods or nutrients, focus only on the asked topic. If the user provides a JSON schema, format your response as valid JSON matching that schema.'
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