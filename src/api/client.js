// API client implementation using secure backend
// All database operations now go through the backend API

// Backend API base URL - adjust for your deployment
const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://dietitian-be.azurewebsites.net';
const DB_API_PREFIX = '/api/db'; // Flask blueprint prefix

// Helper function to handle API errors
const handleApiError = (error, operation) => {
  console.error(`❌ Error in ${operation}:`, error);
  throw new Error(error.message || `Failed to ${operation}`);
};

// Helper function to make API calls
const apiCall = async (endpoint, options = {}) => {
  try {
    // Prepend DB_API_PREFIX if endpoint doesn't already have /api/db
    // Ensure there's a slash between prefix and endpoint
    let fullEndpoint;
    if (endpoint.startsWith('/api/db')) {
      fullEndpoint = endpoint;
    } else {
      // Remove leading slash from endpoint if present, then add it back
      const cleanEndpoint = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint;
      fullEndpoint = `${DB_API_PREFIX}/${cleanEndpoint}`;
    }
    const url = `${API_BASE_URL}${fullEndpoint}`;
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ detail: response.statusText }));
      const error = new Error(errorData.detail || errorData.error || `HTTP ${response.status}`);
      error.status = response.status; // Attach status code for easier checking
      throw error;
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error(`API call failed: ${endpoint}`, error);
    throw error;
  }
};

// Mock data for auth (kept for compatibility)
const mockUser = {
  id: 'mock-user-id',
  email: 'admin@example.com',
  role: 'admin'
};

// Auth functions (kept as-is for local development)
export const auth = {
  login: async (credentials) => {
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

// Entity functions - all using backend API
export const entities = {
  RegistrationInvites: {
    list: async ({ email, status } = {}) => {
      try {
        console.log('📨 Loading registration invites from API', { email, status });
        const params = new URLSearchParams();
        if (email) params.append('email', email);
        if (status) params.append('status', status);
        
        const queryString = params.toString();
        const endpoint = `/registration-invites${queryString ? `?${queryString}` : ''}`;
        
        return await apiCall(endpoint);
      } catch (err) {
        handleApiError(err, 'RegistrationInvites.list');
      }
    },
    
    create: async (payload) => {
      try {
        console.log('✉️ Creating registration invite via API', payload);
        return await apiCall('/registration-invites', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      } catch (err) {
        handleApiError(err, 'RegistrationInvites.create');
      }
    },
    
    revoke: async (code) => {
      try {
        console.log('🚫 Revoking registration invite via API', code);
        return await apiCall(`/registration-invites/${code}/revoke`, {
          method: 'POST',
        });
      } catch (err) {
        handleApiError(err, 'RegistrationInvites.revoke');
      }
    },
  },
  
  Menu: {
    create: async (data) => {
      const normalized = { ...data, status: data?.status || 'draft' };
      console.log('🏪 Menu.create called via API:', JSON.stringify(normalized, null, 2));
      try {
        return await apiCall('/menus', {
          method: 'POST',
          body: JSON.stringify(normalized),
        });
      } catch (err) {
        handleApiError(err, 'Menu.create');
      }
    },
    
    get: async (id) => {
      try {
        console.log('🔍 Getting menu via API with id:', id);
        return await apiCall(`/menus/${id}`);
      } catch (err) {
        handleApiError(err, 'Menu.get');
      }
    },
    
    list: async () => {
      try {
        console.log('📋 Getting all menus via API');
        return await apiCall('/menus');
      } catch (err) {
        handleApiError(err, 'Menu.list');
      }
    },
    
    filter: async (query, orderBy = 'created_at') => {
      try {
        console.log('🔍 Filtering menus via API with query:', query);
        return await apiCall('/menus/filter', {
          method: 'POST',
          body: JSON.stringify({ filters: query, order_by: orderBy }),
        });
      } catch (err) {
        handleApiError(err, 'Menu.filter');
      }
    },
    
    update: async (id, data) => {
      try {
        console.log('✏️ Updating menu via API with id:', id);
        return await apiCall(`/menus/${id}`, {
          method: 'PATCH',
          body: JSON.stringify(data),
        });
      } catch (err) {
        handleApiError(err, 'Menu.update');
      }
    },
    
    delete: async (id) => {
      try {
        console.log('🗑️ Deleting menu via API with id:', id);
        await apiCall(`/menus/${id}`, {
          method: 'DELETE',
        });
        return true;
      } catch (err) {
        handleApiError(err, 'Menu.delete');
      }
    },
    
    deleteByUserCode: async (user_code) => {
      try {
        console.log('🗑️ Deleting menus via API for user_code:', user_code);
        await apiCall(`/menus/user/${user_code}`, {
          method: 'DELETE',
        });
        return true;
      } catch (err) {
        handleApiError(err, 'Menu.deleteByUserCode');
      }
    }
  },
  
  Chat: {
    create: async (data) => {
      try {
        console.log('💬 Chat.create called via API:', JSON.stringify(data, null, 2));
        return await apiCall('/chats', {
          method: 'POST',
          body: JSON.stringify(data),
        });
      } catch (err) {
        handleApiError(err, 'Chat.create');
      }
    },
    
    get: async (id) => {
      try {
        console.log('🔍 Getting chat via API with id:', id);
        return await apiCall(`/chats/${id}`);
      } catch (err) {
        handleApiError(err, 'Chat.get');
      }
    },
    
    list: async () => {
      try {
        console.log('📋 Getting all chats via API');
        return await apiCall('/chats');
      } catch (err) {
        handleApiError(err, 'Chat.list');
      }
    },
    
    filter: async (query) => {
      try {
        console.log('🔍 Filtering chats via API with query:', query);
        return await apiCall('/chats/filter', {
          method: 'POST',
          body: JSON.stringify(query),
        });
      } catch (err) {
        handleApiError(err, 'Chat.filter');
      }
    },
    
    update: async (id, data) => {
      try {
        console.log('✏️ Updating chat via API with id:', id);
        return await apiCall(`/chats/${id}`, {
          method: 'PATCH',
          body: JSON.stringify(data),
        });
      } catch (err) {
        handleApiError(err, 'Chat.update');
      }
    },
    
    delete: async (id) => {
      try {
        console.log('🗑️ Deleting chat via API with id:', id);
        await apiCall(`/chats/${id}`, {
          method: 'DELETE',
        });
        return true;
      } catch (err) {
        handleApiError(err, 'Chat.delete');
      }
    }
  },
  
  ChatUser: {
    create: async (data) => {
      try {
        console.log('👤 Creating new chat user via API:', JSON.stringify(data, null, 2));
        return await apiCall('/chat-users', {
          method: 'POST',
          body: JSON.stringify(data),
        });
      } catch (err) {
        handleApiError(err, 'ChatUser.create');
      }
    },
    
    list: async (fields = '*') => {
      try {
        console.log('👥 Getting all chat users via API');
        const params = fields !== '*' ? `?fields=${Array.isArray(fields) ? fields.join(',') : fields}` : '';
        return await apiCall(`/chat-users${params}`);
      } catch (err) {
        handleApiError(err, 'ChatUser.list');
      }
    },
    
    get: async (userCode, fields = '*') => {
      try {
        console.log('🔍 Getting chat user via API with user_code:', userCode);
        const params = fields !== '*' ? `?fields=${Array.isArray(fields) ? fields.join(',') : fields}` : '';
        return await apiCall(`/chat-users/${userCode}${params}`);
      } catch (err) {
        // 404 means user not found, which is a valid state - return null instead of throwing
        if (err.status === 404 || (err.message && err.message.includes('404'))) {
          console.log(`ℹ️ User ${userCode} not found (expected for uniqueness checks)`);
          return null;
        }
        handleApiError(err, 'ChatUser.get');
      }
    },
    
    getByUserCode: async (userCode) => {
      try {
        console.log('🔍 Getting chat user via API with user_code:', userCode);
        return await apiCall(`/chat-users/${userCode}`);
      } catch (err) {
        // 404 means user not found, which is a valid state - return null instead of throwing
        if (err.status === 404 || (err.message && err.message.includes('404'))) {
          console.log(`ℹ️ User ${userCode} not found`);
          return null;
        }
        handleApiError(err, 'ChatUser.getByUserCode');
      }
    },
    
    update: async (userCode, data) => {
      try {
        console.log('✏️ Updating chat user via API with user_code:', userCode);
        return await apiCall(`/chat-users/${userCode}`, {
          method: 'PATCH',
          body: JSON.stringify(data),
        });
      } catch (err) {
        handleApiError(err, 'ChatUser.update');
      }
    },
    
    delete: async (userCode) => {
      try {
        console.log('🗑️ Deleting chat user via API with user_code:', userCode);
        await apiCall(`/chat-users/${userCode}`, {
          method: 'DELETE',
        });
        return true;
      } catch (err) {
        handleApiError(err, 'ChatUser.delete');
      }
    },
    
    getMealPlanByUserCode: async (userCode) => {
      try {
        console.log('🍽️ Getting active meal plan via API for user_code:', userCode);
        return await apiCall(`/chat-users/${userCode}/meal-plan`);
      } catch (err) {
        handleApiError(err, 'ChatUser.getMealPlanByUserCode');
      }
    }
  },
  
  Profiles: {
    list: async () => {
      try {
        console.log('📋 Fetching profiles via API');
        return await apiCall('/profiles');
      } catch (err) {
        handleApiError(err, 'Profiles.list');
      }
    },
    
    getBasic: async () => {
      try {
        console.log('📋 Fetching basic profiles via API');
        return await apiCall('/profiles/basic');
      } catch (err) {
        handleApiError(err, 'Profiles.getBasic');
      }
    },
    
    get: async (id) => {
      try {
        console.log('🔍 Getting profile via API with id:', id);
        return await apiCall(`/profiles/${id}`);
      } catch (err) {
        handleApiError(err, 'Profiles.get');
      }
    },
    
    getByCompany: async (companyId) => {
      try {
        console.log('🏢 Getting profiles by company via API:', companyId);
        return await apiCall(`/profiles/company/${companyId}`);
      } catch (err) {
        handleApiError(err, 'Profiles.getByCompany');
      }
    },
    
    update: async (id, data) => {
      try {
        console.log('✏️ Updating profile via API:', id);
        return await apiCall(`/profiles/${id}`, {
          method: 'PATCH',
          body: JSON.stringify(data),
        });
      } catch (err) {
        handleApiError(err, 'Profiles.update');
      }
    }
  },
  
  Companies: {
    list: async () => {
      try {
        console.log('🏢 Fetching companies via API');
        return await apiCall('/companies');
      } catch (err) {
        handleApiError(err, 'Companies.list');
      }
    },
    
    create: async (name) => {
      try {
        console.log('🏢 Creating company via API:', name);
        return await apiCall('/companies', {
          method: 'POST',
          body: JSON.stringify({ name }),
        });
      } catch (err) {
        handleApiError(err, 'Companies.create');
      }
    },
  },
  
  WeightLogs: {
    getByUserCode: async (userCode) => {
      try {
        console.log('⚖️ Getting weight logs via API for user_code:', userCode);
        return await apiCall(`/weight-logs?user_code=${userCode}`);
      } catch (err) {
        handleApiError(err, 'WeightLogs.getByUserCode');
      }
    },
    
    list: async (userCode = null, userCodes = null, limit = null) => {
      try {
        console.log('⚖️ Getting all weight logs via API');
        const params = new URLSearchParams();
        if (userCode) params.append('user_code', userCode);
        if (userCodes && Array.isArray(userCodes)) params.append('user_codes', userCodes.join(','));
        if (limit) params.append('limit', limit);
        
        const queryString = params.toString();
        return await apiCall(`/weight-logs${queryString ? `?${queryString}` : ''}`);
      } catch (err) {
        handleApiError(err, 'WeightLogs.list');
      }
    },
    
    getUniqueUserCodes: async () => {
      try {
        console.log('⚖️ Getting unique user codes via API');
        return await apiCall('/weight-logs/user-codes');
      } catch (err) {
        handleApiError(err, 'WeightLogs.getUniqueUserCodes');
      }
    },
    
    create: async (data) => {
      try {
        console.log('⚖️ Creating weight log via API:', JSON.stringify(data, null, 2));
        return await apiCall('/weight-logs', {
          method: 'POST',
          body: JSON.stringify(data),
        });
      } catch (err) {
        handleApiError(err, 'WeightLogs.create');
      }
    },
    
    update: async (id, data) => {
      try {
        console.log('✏️ Updating weight log via API:', id);
        return await apiCall(`/weight-logs/${id}`, {
          method: 'PATCH',
          body: JSON.stringify(data),
        });
      } catch (err) {
        handleApiError(err, 'WeightLogs.update');
      }
    },
    
    delete: async (id) => {
      try {
        console.log('🗑️ Deleting weight log via API:', id);
        await apiCall(`/weight-logs/${id}`, {
          method: 'DELETE',
        });
        return true;
      } catch (err) {
        handleApiError(err, 'WeightLogs.delete');
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
        if (!res.ok) throw new Error('Failed to fetch client data');
        return await res.json();
      } catch (error) {
        console.error('Error fetching client:', error);
        return null;
      }
    },
    
    list: async () => {
      try {
        const res = await fetch('/data/client.json');
        if (!res.ok) throw new Error('Failed to fetch client data');
        const data = await res.json();
        return [data];
      } catch (error) {
        console.error('Error fetching clients:', error);
        return [];
      }
    },
    
    filter: async (query) => {
      try {
        console.log('🔍 Filtering clients via API with query:', query);
        return await apiCall('/clients/filter', {
          method: 'POST',
          body: JSON.stringify(query),
        });
      } catch (err) {
        handleApiError(err, 'Client.filter');
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
      throw new Error('getByUserId requires user_code. Use getByUserCode instead.');
    },
    
    getByUserCode: async (user_code) => {
      try {
        console.log('🍽️ Getting food logs via API for user_code:', user_code);
        return await apiCall(`/food-logs/${user_code}`);
      } catch (err) {
        handleApiError(err, 'FoodLogs.getByUserCode');
      }
    },
    
    analyzePreferences: async (user_code) => {
      try {
        console.log('🔍 Analyzing food preferences via API for user_code:', user_code);
        return await apiCall(`/food-logs/${user_code}/analyze`);
      } catch (err) {
        handleApiError(err, 'FoodLogs.analyzePreferences');
      }
    }
  },
  
  ChatMessage: {
    create: async (messageData) => {
      try {
        console.log('💬 ChatMessage.create called via API:', JSON.stringify(messageData, null, 2));
        return await apiCall('/chat-messages', {
          method: 'POST',
          body: JSON.stringify(messageData),
        });
      } catch (err) {
        handleApiError(err, 'ChatMessage.create');
      }
    },
    
    listByConversation: async (conversation_id, { limit = 20, beforeMessageId = null } = {}) => {
      try {
        const params = new URLSearchParams({ limit: limit.toString() });
        if (beforeMessageId) params.append('before_message_id', beforeMessageId);
        return await apiCall(`/chat-messages/conversation/${conversation_id}?${params.toString()}`);
      } catch (err) {
        handleApiError(err, 'ChatMessage.listByConversation');
      }
    },
    
    deleteByConversation: async (conversation_id) => {
      try {
        console.log('🗑️ Deleting chat messages via API for conversation:', conversation_id);
        await apiCall(`/chat-messages/conversation/${conversation_id}`, {
          method: 'DELETE',
        });
        return true;
      } catch (err) {
        handleApiError(err, 'ChatMessage.deleteByConversation');
      }
    },
    
    deleteByUserCode: async (user_code) => {
      try {
        console.log('🗑️ Deleting chat messages via API for user_code:', user_code);
        await apiCall(`/chat-messages/user/${user_code}`, {
          method: 'DELETE',
        });
        return true;
      } catch (err) {
        handleApiError(err, 'ChatMessage.deleteByUserCode');
      }
    },
  },
  
  MessageQueue: {
    addToQueue: async (queueData) => {
      try {
        console.log('📬 MessageQueue.addToQueue called via API:', JSON.stringify(queueData, null, 2));
        return await apiCall('/message-queue', {
          method: 'POST',
          body: JSON.stringify(queueData),
        });
      } catch (err) {
        handleApiError(err, 'MessageQueue.addToQueue');
      }
    },
    
    getPendingForUser: async (userCode) => {
      try {
        console.log('📬 Getting pending messages via API for user:', userCode);
        const messages = await apiCall(`/message-queue/user/${userCode}`);
        return messages.filter(msg => msg.status === 'pending');
      } catch (err) {
        handleApiError(err, 'MessageQueue.getPendingForUser');
      }
    },
    
    getPendingForClient: async (clientId) => {
      try {
        console.log('📬 Getting pending messages via API for client ID:', clientId);
        return await apiCall(`/message-queue/client/${clientId}`);
      } catch (err) {
        handleApiError(err, 'MessageQueue.getPendingForClient');
      }
    },
    
    getByDietitian: async (dietitianId, { status = null, limit = 100, offset = 0 } = {}) => {
      try {
        console.log('📬 Getting messages via API by dietitian:', dietitianId);
        const params = new URLSearchParams({ limit: limit.toString(), offset: offset.toString() });
        if (status) params.append('status', status);
        return await apiCall(`/message-queue/dietitian/${dietitianId}?${params.toString()}`);
      } catch (err) {
        handleApiError(err, 'MessageQueue.getByDietitian');
      }
    },
    
    updateStatus: async (messageId, status, additionalData = {}) => {
      try {
        console.log('📬 Updating message status via API:', messageId, 'to:', status);
        return await apiCall(`/message-queue/${messageId}`, {
          method: 'PATCH',
          body: JSON.stringify({ status, ...additionalData }),
        });
      } catch (err) {
        handleApiError(err, 'MessageQueue.updateStatus');
      }
    },
    
    listAll: async ({ status = null, limit = 100, offset = 0 } = {}) => {
      try {
        console.log('📬 Getting all messages via API from queue');
        const params = new URLSearchParams({ limit: limit.toString(), offset: offset.toString() });
        if (status) params.append('status', status);
        return await apiCall(`/message-queue?${params.toString()}`);
      } catch (err) {
        handleApiError(err, 'MessageQueue.listAll');
      }
    },
    
    listByUserCode: async (user_code) => {
      try {
        console.log('📬 Listing queued messages via API for user_code:', user_code);
        return await apiCall(`/message-queue/user/${user_code}`);
      } catch (err) {
        handleApiError(err, 'MessageQueue.listByUserCode');
      }
    },
    
    deleteByConversation: async (conversation_id) => {
      try {
        console.log('🗑️ Deleting queued messages via API for conversation:', conversation_id);
        await apiCall(`/message-queue/conversation/${conversation_id}`, {
          method: 'DELETE',
        });
        return true;
      } catch (err) {
        handleApiError(err, 'MessageQueue.deleteByConversation');
      }
    },
    
    deleteByUserCode: async (user_code) => {
      try {
        console.log('🗑️ Deleting queued messages via API for user_code:', user_code);
        await apiCall(`/message-queue/user/${user_code}`, {
          method: 'DELETE',
        });
        return true;
      } catch (err) {
        handleApiError(err, 'MessageQueue.deleteByUserCode');
      }
    },
  },
  
  ChatConversation: {
    list: async (fields = '*') => {
      try {
        console.log('📃 Listing all chat conversations via API');
        const params = fields !== '*' ? `?fields=${Array.isArray(fields) ? fields.join(',') : fields}` : '';
        return await apiCall(`/chat-conversations${params}`);
      } catch (err) {
        handleApiError(err, 'ChatConversation.list');
      }
    },
    
    getByUserId: async (user_id) => {
      throw new Error('getByUserId requires user_code. Use getByUserCode instead.');
    },
    
    getByUserCode: async (user_code) => {
      try {
        return await apiCall(`/chat-conversations/user/${user_code}`);
      } catch (err) {
        handleApiError(err, 'ChatConversation.getByUserCode');
      }
    },
    
    listByUserCode: async (user_code) => {
      try {
        console.log('📃 Listing chat conversations via API for user_code:', user_code);
        return await apiCall(`/chat-conversations/user/${user_code}/all`);
      } catch (err) {
        handleApiError(err, 'ChatConversation.listByUserCode');
      }
    },
    
    delete: async (id) => {
      try {
        console.log('🗑️ Deleting chat conversation via API with id:', id);
        await apiCall(`/chat-conversations/${id}`, {
          method: 'DELETE',
        });
        return true;
      } catch (err) {
        handleApiError(err, 'ChatConversation.delete');
      }
    },
    
    deleteByUserCode: async (user_code) => {
      try {
        console.log('🗑️ Deleting chat conversations via API for user_code:', user_code);
        await apiCall(`/chat-conversations/user/${user_code}`, {
          method: 'DELETE',
        });
        return true;
      } catch (err) {
        handleApiError(err, 'ChatConversation.deleteByUserCode');
      }
    }
  },
  
  // Training Management APIs
  TrainingPlans: {
    getByUserCode: async (userCode) => {
      try {
        return await apiCall(`/training-plans/user/${userCode}`);
      } catch (err) {
        handleApiError(err, 'TrainingPlans.getByUserCode');
      }
    },
    
    getAll: async () => {
      try {
        return await apiCall('/training-plans');
      } catch (err) {
        handleApiError(err, 'TrainingPlans.getAll');
      }
    },
    
    getActive: async (userCode) => {
      try {
        return await apiCall(`/training-plans/user/${userCode}/active`);
      } catch (err) {
        handleApiError(err, 'TrainingPlans.getActive');
      }
    },
    
    create: async (planData) => {
      try {
        return await apiCall('/training-plans', {
          method: 'POST',
          body: JSON.stringify(planData),
        });
      } catch (err) {
        handleApiError(err, 'TrainingPlans.create');
      }
    },
    
    update: async (id, updates) => {
      try {
        return await apiCall(`/training-plans/${id}`, {
          method: 'PATCH',
          body: JSON.stringify(updates),
        });
      } catch (err) {
        handleApiError(err, 'TrainingPlans.update');
      }
    },
    
    delete: async (id) => {
      try {
        await apiCall(`/training-plans/${id}`, {
          method: 'DELETE',
        });
        return true;
      } catch (err) {
        handleApiError(err, 'TrainingPlans.delete');
      }
    },
  },
  
  TrainingLogs: {
    getByUserCode: async (userCode, limit = 50) => {
      try {
        return await apiCall(`/training-logs/user/${userCode}?limit=${limit}`);
      } catch (err) {
        handleApiError(err, 'TrainingLogs.getByUserCode');
      }
    },
    
    getByDateRange: async (userCode, startDate, endDate) => {
      try {
        const params = new URLSearchParams({ start_date: startDate, end_date: endDate });
        return await apiCall(`/training-logs/user/${userCode}/date-range?${params.toString()}`);
      } catch (err) {
        handleApiError(err, 'TrainingLogs.getByDateRange');
      }
    },
    
    getAll: async (limit = 100) => {
      try {
        return await apiCall(`/training-logs?limit=${limit}`);
      } catch (err) {
        handleApiError(err, 'TrainingLogs.getAll');
      }
    },
  },
  
  TrainingAnalytics: {
    getByUserCode: async (userCode) => {
      try {
        return await apiCall(`/training-analytics/user/${userCode}`);
      } catch (err) {
        handleApiError(err, 'TrainingAnalytics.getByUserCode');
      }
    },
    
    getByExercise: async (userCode, exerciseName) => {
      try {
        return await apiCall(`/training-analytics/user/${userCode}/exercise/${encodeURIComponent(exerciseName)}`);
      } catch (err) {
        handleApiError(err, 'TrainingAnalytics.getByExercise');
      }
    },
  },
  
  TrainingReminders: {
    getPending: async () => {
      try {
        return await apiCall('/training-reminders/pending');
      } catch (err) {
        handleApiError(err, 'TrainingReminders.getPending');
      }
    },
    
    getByUserCode: async (userCode) => {
      try {
        return await apiCall(`/training-reminders/user/${userCode}`);
      } catch (err) {
        handleApiError(err, 'TrainingReminders.getByUserCode');
      }
    },
    
    create: async (reminderData) => {
      try {
        return await apiCall('/training-reminders', {
          method: 'POST',
          body: JSON.stringify(reminderData),
        });
      } catch (err) {
        handleApiError(err, 'TrainingReminders.create');
      }
    },
    
    updateStatus: async (id, status, errorMessage = null) => {
      try {
        return await apiCall(`/training-reminders/${id}`, {
          method: 'PATCH',
          body: JSON.stringify({ status, error_message: errorMessage }),
        });
      } catch (err) {
        handleApiError(err, 'TrainingReminders.updateStatus');
      }
    },
    
    delete: async (id) => {
      try {
        await apiCall(`/training-reminders/${id}`, {
          method: 'DELETE',
        });
        return true;
      } catch (err) {
        handleApiError(err, 'TrainingReminders.delete');
      }
    },
  },
  
  ExerciseLibrary: {
    getAll: async () => {
      try {
        return await apiCall('/exercise-library');
      } catch (err) {
        handleApiError(err, 'ExerciseLibrary.getAll');
      }
    },
    
    getByCategory: async (category) => {
      try {
        return await apiCall(`/exercise-library/category/${encodeURIComponent(category)}`);
      } catch (err) {
        handleApiError(err, 'ExerciseLibrary.getByCategory');
      }
    },
    
    search: async (searchTerm) => {
      try {
        if (!searchTerm) return [];
        return await apiCall(`/exercise-library/search?query=${encodeURIComponent(searchTerm)}`);
      } catch (err) {
        handleApiError(err, 'ExerciseLibrary.search');
      }
    },
    
    create: async (exerciseData) => {
      try {
        return await apiCall('/exercise-library', {
          method: 'POST',
          body: JSON.stringify(exerciseData),
        });
      } catch (err) {
        handleApiError(err, 'ExerciseLibrary.create');
      }
    },
    
    update: async (id, updates) => {
      try {
        return await apiCall(`/exercise-library/${id}`, {
          method: 'PATCH',
          body: JSON.stringify(updates),
        });
      } catch (err) {
        handleApiError(err, 'ExerciseLibrary.update');
      }
    },
  },
  
  TrainingPlanTemplates: {
    getAll: async () => {
      try {
        return await apiCall('/training-plan-templates');
      } catch (err) {
        handleApiError(err, 'TrainingPlanTemplates.getAll');
      }
    },
    
    getOwn: async () => {
      try {
        return await apiCall('/training-plan-templates');
      } catch (err) {
        handleApiError(err, 'TrainingPlanTemplates.getOwn');
      }
    },
    
    getPublic: async () => {
      try {
        return await apiCall('/training-plan-templates/public');
      } catch (err) {
        handleApiError(err, 'TrainingPlanTemplates.getPublic');
      }
    },
    
    search: async (searchTerm) => {
      try {
        if (!searchTerm) return [];
        return await apiCall(`/training-plan-templates/search?query=${encodeURIComponent(searchTerm)}`);
      } catch (err) {
        handleApiError(err, 'TrainingPlanTemplates.search');
      }
    },
    
    create: async (templateData) => {
      try {
        return await apiCall('/training-plan-templates', {
          method: 'POST',
          body: JSON.stringify(templateData),
        });
      } catch (err) {
        handleApiError(err, 'TrainingPlanTemplates.create');
      }
    },
    
    update: async (id, updates) => {
      try {
        return await apiCall(`/training-plan-templates/${id}`, {
          method: 'PATCH',
          body: JSON.stringify(updates),
        });
      } catch (err) {
        handleApiError(err, 'TrainingPlanTemplates.update');
      }
    },
    
    delete: async (id) => {
      try {
        await apiCall(`/training-plan-templates/${id}`, {
          method: 'DELETE',
        });
        return true;
      } catch (err) {
        handleApiError(err, 'TrainingPlanTemplates.delete');
      }
    },
    
    hardDelete: async (id) => {
      try {
        await apiCall(`/training-plan-templates/${id}/hard`, {
          method: 'DELETE',
        });
        return true;
      } catch (err) {
        handleApiError(err, 'TrainingPlanTemplates.hardDelete');
      }
    },
    
    incrementUsage: async (id) => {
      try {
        await apiCall(`/training-plan-templates/${id}/increment-usage`, {
          method: 'POST',
        });
        return true;
      } catch (err) {
        console.error('❌ Error incrementing template usage:', err);
        return false; // Non-critical
      }
    },
  },

  SystemMessages: {
    list: async ({ is_active, priority } = {}) => {
      try {
        console.log('📢 Loading system messages from API', { is_active, priority });
        const params = new URLSearchParams();
        if (is_active !== undefined) params.append('is_active', is_active);
        if (priority) params.append('priority', priority);
        
        const queryString = params.toString();
        return await apiCall(`/system-messages${queryString ? `?${queryString}` : ''}`);
      } catch (err) {
        handleApiError(err, 'SystemMessages.list');
      }
    },

    get: async (id) => {
      try {
        console.log('📢 Getting system message from API:', id);
        return await apiCall(`/system-messages/${id}`);
      } catch (err) {
        handleApiError(err, 'SystemMessages.get');
      }
    },

    create: async (messageData) => {
      try {
        console.log('📢 Creating system message via API');
        return await apiCall('/system-messages', {
          method: 'POST',
          body: JSON.stringify(messageData),
        });
      } catch (err) {
        handleApiError(err, 'SystemMessages.create');
      }
    },

    update: async (id, updates) => {
      try {
        console.log('📢 Updating system message via API:', id);
        return await apiCall(`/system-messages/${id}`, {
          method: 'PATCH',
          body: JSON.stringify(updates),
        });
      } catch (err) {
        handleApiError(err, 'SystemMessages.update');
      }
    },

    delete: async (id) => {
      try {
        console.log('📢 Deleting system message via API:', id);
        await apiCall(`/system-messages/${id}`, {
          method: 'DELETE',
        });
        return true;
      } catch (err) {
        handleApiError(err, 'SystemMessages.delete');
      }
    },
  },

  ScheduledReminders: {
    list: async ({ user_code, status } = {}) => {
      try {
        console.log('📅 Loading scheduled reminders from API', { user_code, status });
        const params = new URLSearchParams();
        if (user_code) params.append('user_code', user_code);
        if (status) params.append('status', Array.isArray(status) ? status.join(',') : status);
        
        const queryString = params.toString();
        return await apiCall(`/scheduled-reminders${queryString ? `?${queryString}` : ''}`);
      } catch (err) {
        handleApiError(err, 'ScheduledReminders.list');
      }
    },

    get: async (id) => {
      try {
        console.log('📅 Getting scheduled reminder from API:', id);
        return await apiCall(`/scheduled-reminders/${id}`);
      } catch (err) {
        handleApiError(err, 'ScheduledReminders.get');
      }
    },

    create: async (reminderData) => {
      try {
        console.log('📅 Creating scheduled reminder via API');
        return await apiCall('/scheduled-reminders', {
          method: 'POST',
          body: JSON.stringify(reminderData),
        });
      } catch (err) {
        handleApiError(err, 'ScheduledReminders.create');
      }
    },

    update: async (id, updates) => {
      try {
        console.log('📅 Updating scheduled reminder via API:', id);
        return await apiCall(`/scheduled-reminders/${id}`, {
          method: 'PATCH',
          body: JSON.stringify(updates),
        });
      } catch (err) {
        handleApiError(err, 'ScheduledReminders.update');
      }
    },

    delete: async (id) => {
      try {
        console.log('📅 Deleting scheduled reminder via API:', id);
        await apiCall(`/scheduled-reminders/${id}`, {
          method: 'DELETE',
        });
        return true;
      } catch (err) {
        handleApiError(err, 'ScheduledReminders.delete');
      }
    },

    deleteByPlan: async (planId, planType) => {
      try {
        console.log('📅 Deleting scheduled reminders by plan via API:', planId, planType);
        const params = new URLSearchParams();
        if (planType) params.append('plan_type', planType);
        const queryString = params.toString();
        await apiCall(`/scheduled-reminders/plan/${planId}${queryString ? `?${queryString}` : ''}`, {
          method: 'DELETE',
        });
        return true;
      } catch (err) {
        handleApiError(err, 'ScheduledReminders.deleteByPlan');
      }
    },
  },

  UserMessagePreferences: {
    list: async ({ user_codes, limit, offset, count } = {}) => {
      try {
        console.log('🔔 Loading user message preferences from API', { user_codes, limit, offset, count });
        const params = new URLSearchParams();
        if (user_codes) params.append('user_codes', Array.isArray(user_codes) ? user_codes.join(',') : user_codes);
        if (limit) params.append('limit', limit);
        if (offset) params.append('offset', offset);
        if (count) params.append('count', 'true');
        
        const queryString = params.toString();
        const result = await apiCall(`/user-message-preferences${queryString ? `?${queryString}` : ''}`);
        
        // If count was requested, return both data and count
        if (count && result.count !== undefined) {
          return result;
        }
        return result;
      } catch (err) {
        handleApiError(err, 'UserMessagePreferences.list');
      }
    },

    get: async (id) => {
      try {
        console.log('🔔 Getting user message preference from API:', id);
        return await apiCall(`/user-message-preferences/${id}`);
      } catch (err) {
        handleApiError(err, 'UserMessagePreferences.get');
      }
    },

    create: async (preferenceData) => {
      try {
        console.log('🔔 Creating user message preference via API');
        return await apiCall('/user-message-preferences', {
          method: 'POST',
          body: JSON.stringify(preferenceData),
        });
      } catch (err) {
        handleApiError(err, 'UserMessagePreferences.create');
      }
    },

    update: async (id, updates) => {
      try {
        console.log('🔔 Updating user message preference via API:', id);
        return await apiCall(`/user-message-preferences/${id}`, {
          method: 'PATCH',
          body: JSON.stringify(updates),
        });
      } catch (err) {
        handleApiError(err, 'UserMessagePreferences.update');
      }
    },

    delete: async (id) => {
      try {
        console.log('🔔 Deleting user message preference via API:', id);
        await apiCall(`/user-message-preferences/${id}`, {
          method: 'DELETE',
        });
        return true;
      } catch (err) {
        handleApiError(err, 'UserMessagePreferences.delete');
      }
    },
  },

  // Ingredients
  Ingredients: {
    search: async ({ query, page = 1, limit = 50 }) => {
      try {
        const params = new URLSearchParams({
          query,
          page: page.toString(),
          limit: limit.toString()
        });
        const response = await apiCall(`/ingredients/search?${params}`, {
          method: 'GET'
        });
        return response;
      } catch (err) {
        handleApiError(err, 'Ingredients.search');
      }
    },
  },

  // Meal Templates
  MealTemplates: {
    list: async ({ language = 'en', dietitian_id } = {}) => {
      try {
        const params = new URLSearchParams();
        if (language) params.append('language', language);
        if (dietitian_id) params.append('dietitian_id', dietitian_id);
        
        const queryString = params.toString();
        const response = await apiCall(`/meal-templates${queryString ? '?' + queryString : ''}`, {
          method: 'GET'
        });
        return response;
      } catch (err) {
        handleApiError(err, 'MealTemplates.list');
      }
    },

    get: async (templateId) => {
      try {
        const response = await apiCall(`/meal-templates/${templateId}`, {
          method: 'GET'
        });
        return response;
      } catch (err) {
        handleApiError(err, 'MealTemplates.get');
      }
    },

    create: async (templateData) => {
      try {
        const response = await apiCall('/meal-templates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(templateData)
        });
        return response;
      } catch (err) {
        handleApiError(err, 'MealTemplates.create');
      }
    },

    update: async (templateId, updates) => {
      try {
        const response = await apiCall(`/meal-templates/${templateId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates)
        });
        return response;
      } catch (err) {
        handleApiError(err, 'MealTemplates.update');
      }
    },

    delete: async (templateId) => {
      try {
        await apiCall(`/meal-templates/${templateId}`, {
          method: 'DELETE'
        });
        return true;
      } catch (err) {
        handleApiError(err, 'MealTemplates.delete');
      }
    },
  },

  // Meal Template Variants
  MealTemplateVariants: {
    list: async ({ template_id, meals_per_day } = {}) => {
      try {
        const params = new URLSearchParams();
        if (template_id) params.append('template_id', template_id);
        if (meals_per_day) params.append('meals_per_day', meals_per_day);
        
        const queryString = params.toString();
        const response = await apiCall(`/meal-template-variants${queryString ? '?' + queryString : ''}`, {
          method: 'GET'
        });
        return response;
      } catch (err) {
        handleApiError(err, 'MealTemplateVariants.list');
      }
    },

    get: async (variantId) => {
      try {
        const response = await apiCall(`/meal-template-variants/${variantId}`, {
          method: 'GET'
        });
        return response;
      } catch (err) {
        handleApiError(err, 'MealTemplateVariants.get');
      }
    },

    create: async (variantData) => {
      try {
        const response = await apiCall('/meal-template-variants', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(variantData)
        });
        return response;
      } catch (err) {
        handleApiError(err, 'MealTemplateVariants.create');
      }
    },

    delete: async (variantId) => {
      try {
        await apiCall(`/meal-template-variants/${variantId}`, {
          method: 'DELETE'
        });
        return true;
      } catch (err) {
        handleApiError(err, 'MealTemplateVariants.delete');
      }
    },
  },

  // Meal Template Meals
  MealTemplateMeals: {
    list: async (variantId) => {
      try {
        if (!variantId) {
          throw new Error('variant_id is required');
        }
        const response = await apiCall(`/meal-template-meals?variant_id=${variantId}`, {
          method: 'GET'
        });
        return response;
      } catch (err) {
        handleApiError(err, 'MealTemplateMeals.list');
      }
    },

    get: async (mealId) => {
      try {
        const response = await apiCall(`/meal-template-meals/${mealId}`, {
          method: 'GET'
        });
        return response;
      } catch (err) {
        handleApiError(err, 'MealTemplateMeals.get');
      }
    },

    create: async (meals) => {
      try {
        const response = await apiCall('/meal-template-meals', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ meals })
        });
        return response;
      } catch (err) {
        handleApiError(err, 'MealTemplateMeals.create');
      }
    },

    update: async (mealId, updates) => {
      try {
        const response = await apiCall(`/meal-template-meals/${mealId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates)
        });
        return response;
      } catch (err) {
        handleApiError(err, 'MealTemplateMeals.update');
      }
    },

    delete: async (mealId) => {
      try {
        await apiCall(`/meal-template-meals/${mealId}`, {
          method: 'DELETE'
        });
        return true;
      } catch (err) {
        handleApiError(err, 'MealTemplateMeals.delete');
      }
    },

    deleteByVariant: async (variantId) => {
      try {
        await apiCall(`/meal-template-meals/variant/${variantId}`, {
          method: 'DELETE'
        });
        return true;
      } catch (err) {
        handleApiError(err, 'MealTemplateMeals.deleteByVariant');
      }
    },
  },
  
  ClientMealPlans: {
    get: async (originalMealPlanId) => {
      try {
        console.log('🔍 Getting client meal plan via API:', originalMealPlanId);
        return await apiCall(`/client-meal-plans?original_meal_plan_id=${originalMealPlanId}`);
      } catch (err) {
        handleApiError(err, 'ClientMealPlans.get');
      }
    },
    
    create: async (data) => {
      try {
        console.log('➕ Creating client meal plan via API');
        return await apiCall('/client-meal-plans', {
          method: 'POST',
          body: JSON.stringify(data),
        });
      } catch (err) {
        handleApiError(err, 'ClientMealPlans.create');
      }
    },
    
    update: async (originalMealPlanId, data) => {
      try {
        console.log('✏️ Updating client meal plan via API:', originalMealPlanId);
        return await apiCall(`/client-meal-plans?original_meal_plan_id=${originalMealPlanId}`, {
          method: 'PATCH',
          body: JSON.stringify(data),
        });
      } catch (err) {
        handleApiError(err, 'ClientMealPlans.update');
      }
    },
    
    delete: async (originalMealPlanId) => {
      try {
        console.log('🗑️ Deleting client meal plan via API:', originalMealPlanId);
        await apiCall(`/client-meal-plans?original_meal_plan_id=${originalMealPlanId}`, {
          method: 'DELETE',
        });
        return true;
      } catch (err) {
        handleApiError(err, 'ClientMealPlans.delete');
      }
    }
  },
  
  Clients: {
    get: async (userCode, select = '*') => {
      try {
        console.log('🔍 Getting client via API:', userCode);
        return await apiCall(`/clients?user_code=${userCode}&select=${select}`);
      } catch (err) {
        handleApiError(err, 'Clients.get');
      }
    },
    
    delete: async (userCode) => {
      try {
        console.log('🗑️ Deleting client via API:', userCode);
        await apiCall(`/clients?user_code=${userCode}`, {
          method: 'DELETE',
        });
        return true;
      } catch (err) {
        handleApiError(err, 'Clients.delete');
      }
    }
  },
};

// Azure OpenAI Configuration (kept for LLM integration)
const endpoint = "https://ai-hubfooddata915979189829.openai.azure.com";
const apiVersion = "2024-02-15-preview";
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
