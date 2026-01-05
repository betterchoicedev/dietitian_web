// Local API client implementation
// Note: All Supabase calls have been replaced with backend API calls

// Helper function to get backend URL
const getBackendUrl = () => {
  return import.meta.env.VITE_BACKEND_URL || 'https://dietitian-be.azurewebsites.net';
};

// Helper function for API calls
const apiCall = async (endpoint, options = {}) => {
  const url = `${getBackendUrl()}/api/db${endpoint}`;
  const defaultOptions = {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  };
  
  const response = await fetch(url, { ...defaultOptions, ...options });
  const result = await response.json().catch(() => ({}));
  
  if (!response.ok) {
    const message = result?.error || `API Error: ${response.status} ${response.statusText}`;
    throw new Error(message);
  }
  
  return result;
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
        const result = await apiCall('/meal-plans', {
          method: 'POST',
          body: JSON.stringify(normalized),
        });
        console.log('✅ Menu.create successfully saved:', result);
        return result;
      } catch (err) {
        console.error('❌ Error in Menu.create:', err);
        throw err;
      }
    },
    get: async (id) => {
      try {
        console.log('🔍 Getting menu with id:', id);
        const result = await apiCall(`/meal-plans/${id}`);
        console.log('✅ Retrieved menu:', result);
        return result;
      } catch (err) {
        console.error('❌ Error in Menu.get:', err);
        throw err;
      }
    },
    list: async () => {
      try {
        console.log('📋 Getting all menus');
        const result = await apiCall('/meal-plans');
        console.log('✅ Retrieved menus:', result?.length || 0, 'records');
        return result || [];
      } catch (err) {
        console.error('❌ Error in Menu.list:', err);
        throw err;
      }
    },
    filter: async (query, orderBy = 'created_at') => {
      try {
        console.log('🔍 Filtering menus with query:', query);
        const result = await apiCall('/meal-plans/filter', {
          method: 'POST',
          body: JSON.stringify({ ...query, orderBy }),
        });
        console.log('✅ Filtered menus:', result?.length || 0, 'records');
        return result || [];
      } catch (err) {
        console.error('❌ Error in Menu.filter:', err);
        throw err;
      }
    },
    update: async (id, data) => {
      try {
        console.log('✏️ Updating menu with id:', id, 'data:', data);
        const result = await apiCall(`/meal-plans/${id}`, {
          method: 'PUT',
          body: JSON.stringify(data),
        });
        console.log('✅ Updated menu:', result);
        return result;
      } catch (err) {
        console.error('❌ Error in Menu.update:', err);
        throw err;
      }
    },
    delete: async (id) => {
      try {
        console.log('🗑️ Deleting menu with id:', id);
        await apiCall(`/meal-plans/${id}`, { method: 'DELETE' });
        console.log('✅ Deleted menu');
        return true;
      } catch (err) {
        console.error('❌ Error in Menu.delete:', err);
        throw err;
      }
    },
    deleteByUserCode: async (user_code) => {
      try {
        console.log('🗑️ Deleting food logs for user_code:', user_code);
        await apiCall(`/food-logs/user/${user_code}`, { method: 'DELETE' });
        console.log('✅ Deleted food logs for user_code:', user_code);
        return true;
      } catch (err) {
        console.error('❌ Error in Menu.deleteByUserCode:', err);
        throw err;
      }
    }
  },
  Chat: {
    create: async (data) => {
      try {
        console.log('💬 Chat.create called with data:', JSON.stringify(data, null, 2));
        const result = await apiCall('/chats', {
          method: 'POST',
          body: JSON.stringify(data),
        });
        console.log('✅ Chat created:', result);
        return result;
      } catch (err) {
        console.error('❌ Error in Chat.create:', err);
        throw err;
      }
    },
    get: async (id) => {
      try {
        console.log('🔍 Getting chat with id:', id);
        const result = await apiCall(`/chats/${id}`);
        console.log('✅ Retrieved chat:', result);
        return result;
      } catch (err) {
        console.error('❌ Error in Chat.get:', err);
        throw err;
      }
    },
    list: async () => {
      try {
        console.log('📋 Getting all chats');
        const result = await apiCall('/chats');
        console.log('✅ Retrieved chats:', result?.length || 0, 'records');
        return result || [];
      } catch (err) {
        console.error('❌ Error in Chat.list:', err);
        throw err;
      }
    },
    filter: async (query) => {
      try {
        console.log('🔍 Filtering chats with query:', query);
        const result = await apiCall('/chats/filter', {
          method: 'POST',
          body: JSON.stringify(query),
        });
        console.log('✅ Filtered chats:', result?.length || 0, 'records');
        return result || [];
      } catch (err) {
        console.error('❌ Error in Chat.filter:', err);
        throw err;
      }
    },
    update: async (id, data) => {
      try {
        console.log('✏️ Updating chat with id:', id, 'data:', data);
        const result = await apiCall(`/chats/${id}`, {
          method: 'PUT',
          body: JSON.stringify(data),
        });
        console.log('✅ Updated chat:', result);
        return result;
      } catch (err) {
        console.error('❌ Error in Chat.update:', err);
        throw err;
      }
    },
    delete: async (id) => {
      try {
        console.log('🗑️ Deleting chat with id:', id);
        await apiCall(`/chats/${id}`, { method: 'DELETE' });
        console.log('✅ Deleted chat');
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
        const result = await apiCall('/chat-users', {
          method: 'POST',
          body: JSON.stringify(data),
        });
        console.log('✅ Chat user created:', result);
        return result;
      } catch (err) {
        console.error('❌ Error in ChatUser.create:', err);
        throw err;
      }
    },
    list: async () => {
      try {
        console.log('👥 Getting all chat users');
        const result = await apiCall('/chat-users');
        console.log('✅ Retrieved chat users:', result?.length || 0, 'records');
        return result || [];
      } catch (err) {
        console.error('❌ Error in ChatUser.list:', err);
        throw err;
      }
    },
    get: async (userCode) => {
      try {
        console.log('🔍 Getting chat user with user_code:', userCode);
        const result = await apiCall(`/chat-users/${userCode}`);
        console.log('✅ Retrieved chat user:', result);
        return result;
      } catch (err) {
        console.error('❌ Error in ChatUser.get:', err);
        throw err;
      }
    },
    getByUserCode: async (userCode) => {
      try {
        console.log('🔍 Getting chat user with user_code:', userCode);
        const result = await apiCall(`/chat-users/${userCode}`);
        console.log('✅ Retrieved chat user with full profile:', result);
        return result;
      } catch (err) {
        console.error('❌ Error in ChatUser.getByUserCode:', err);
        throw err;
      }
    },
    update: async (userCode, data) => {
      try {
        console.log('✏️ Updating chat user with user_code:', userCode, 'data:', data);
        const result = await apiCall(`/chat-users/${userCode}`, {
          method: 'PUT',
          body: JSON.stringify(data),
        });
        console.log('✅ Updated chat user:', result);
        return result;
      } catch (err) {
        console.error('❌ Error in ChatUser.update:', err);
        throw err;
      }
    },
    delete: async (userCode) => {
      try {
        console.log('🗑️ Deleting chat user with user_code:', userCode);
        await apiCall(`/chat-users/${userCode}`, { method: 'DELETE' });
        console.log('✅ Deleted chat user');
        return true;
      } catch (err) {
        console.error('❌ Error in ChatUser.delete:', err);
        throw err;
      }
    },
    getMealPlanByUserCode: async (userCode) => {
      try {
        console.log('🍽️ Getting active meal plan for user_code:', userCode);
        const result = await apiCall(`/chat-users/${userCode}/meal-plan`);
        console.log('✅ Retrieved active meal plan:', result);
        return result;
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
        const result = await apiCall('/profiles');
        console.log('✅ Retrieved profiles:', result?.length || 0, 'records');
        return result || [];
      } catch (err) {
        console.error('❌ Error in Profiles.list:', err);
        throw err;
      }
    },
    update: async (id, data) => {
      try {
        console.log('✏️ Updating profile:', id, 'with data:', data);
        const result = await apiCall(`/profiles/${id}`, {
          method: 'PUT',
          body: JSON.stringify(data),
        });
        console.log('✅ Updated profile:', result);
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
        const result = await apiCall('/companies');
        console.log('✅ Retrieved companies:', result?.length || 0, 'records');
        return result || [];
      } catch (err) {
        console.error('❌ Error in Companies.list:', err);
        throw err;
      }
    },
    create: async (name) => {
      try {
        console.log('🏢 Creating company:', name);
        const result = await apiCall('/companies', {
          method: 'POST',
          body: JSON.stringify({ name }),
        });
        console.log('✅ Company created:', result);
        return result;
      } catch (err) {
        console.error('❌ Error in Companies.create:', err);
        throw err;
      }
    },
  },
  WeightLogs: {
    getByUserCode: async (userCode) => {
      try {
        console.log('⚖️ Getting weight logs for user_code:', userCode);
        const result = await apiCall(`/weight-logs/user/${userCode}`);
        console.log('✅ Retrieved weight logs:', result?.length || 0, 'records');
        return result || [];
      } catch (err) {
        console.error('❌ Error in WeightLogs.getByUserCode:', err);
        throw err;
      }
    },
    list: async () => {
      try {
        console.log('⚖️ Getting all weight logs');
        const result = await apiCall('/weight-logs');
        console.log('✅ Retrieved all weight logs:', result?.length || 0, 'records');
        return result || [];
      } catch (err) {
        console.error('❌ Error in WeightLogs.list:', err);
        throw err;
      }
    },
    getUniqueUserCodes: async () => {
      try {
        console.log('⚖️ Getting unique user codes with weight logs');
        const allLogs = await apiCall('/weight-logs');
        const uniqueUserCodes = [...new Set(allLogs.map(item => item.user_code).filter(Boolean))];
        console.log('✅ Retrieved unique user codes with weight logs:', uniqueUserCodes);
        return uniqueUserCodes;
      } catch (err) {
        console.error('❌ Error in WeightLogs.getUniqueUserCodes:', err);
        throw err;
      }
    },
    create: async (data) => {
      try {
        console.log('⚖️ Creating weight log entry:', JSON.stringify(data, null, 2));
        const result = await apiCall('/weight-logs', {
          method: 'POST',
          body: JSON.stringify(data),
        });
        console.log('✅ Created weight log entry:', result);
        return result;
      } catch (err) {
        console.error('❌ Error in WeightLogs.create:', err);
        throw err;
      }
    },
    update: async (id, data) => {
      try {
        console.log('✏️ Updating weight log entry:', id, JSON.stringify(data, null, 2));
        const result = await apiCall(`/weight-logs/${id}`, {
          method: 'PUT',
          body: JSON.stringify(data),
        });
        console.log('✅ Updated weight log entry:', result);
        return result;
      } catch (err) {
        console.error('❌ Error in WeightLogs.update:', err);
        throw err;
      }
    },
    delete: async (id) => {
      try {
        console.log('🗑️ Deleting weight log entry:', id);
        await apiCall(`/weight-logs/${id}`, { method: 'DELETE' });
        console.log('✅ Deleted weight log entry');
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
        const result = await apiCall('/clients/filter', {
          method: 'POST',
          body: JSON.stringify(query),
        });
        console.log('✅ Retrieved filtered clients:', result?.length || 0, 'records');
        return result || [];
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
    getByUserId: async (user_id) => {
      // Note: This method requires user_code, not user_id
      // We'll need to get user_code first or use getByUserCode instead
      throw new Error('getByUserId requires user_code. Use getByUserCode instead.');
    },
    getByUserCode: async (user_code) => {
      try {
        console.log('🍽️ Getting food logs for user_code:', user_code);
        const result = await apiCall(`/food-logs/user/${user_code}`);
        console.log('✅ Retrieved food logs:', result?.length || 0, 'records');
        return result || [];
      } catch (err) {
        console.error('❌ Error in FoodLogs.getByUserCode:', err);
        throw err;
      }
    },
    analyzePreferences: async (user_code) => {
      try {
        console.log('🔍 Analyzing food preferences for user_code:', user_code);
        const result = await apiCall(`/food-logs/analyze/${user_code}`);
        console.log('✅ Food preferences analysis completed:', result);
        return result;
      } catch (err) {
        console.error('❌ Error analyzing food preferences:', err);
        throw err;
      }
    }
  },
  ChatMessage: {
    create: async (messageData) => {
      try {
        console.log('💬 ChatMessage.create called with data:', JSON.stringify(messageData, null, 2));
        const result = await apiCall('/chat-messages', {
          method: 'POST',
          body: JSON.stringify(messageData),
        });
        console.log('✅ Chat message created:', result);
        return result;
      } catch (err) {
        console.error('❌ Error in ChatMessage.create:', err);
        throw err;
      }
    },
    listByConversation: async (conversation_id, { limit = 20, beforeMessageId = null } = {}) => {
      try {
        const params = new URLSearchParams({ limit: limit.toString() });
        if (beforeMessageId) params.set('beforeMessageId', beforeMessageId);
        const result = await apiCall(`/chat-messages/conversation/${conversation_id}?${params}`);
        return result || [];
      } catch (err) {
        throw new Error(err.message);
      }
    },
    deleteByConversation: async (conversation_id) => {
      try {
        console.log('🗑️ Deleting chat messages for conversation:', conversation_id);
        await apiCall(`/chat-messages/conversation/${conversation_id}`, { method: 'DELETE' });
        console.log('✅ Deleted chat messages for conversation:', conversation_id);
        return true;
      } catch (err) {
        console.error('❌ Error in ChatMessage.deleteByConversation:', err);
        throw err;
      }
    },
    deleteByUserCode: async (user_code) => {
      try {
        console.log('🗑️ Deleting chat messages for user_code:', user_code);
        await apiCall(`/chat-messages/user/${user_code}`, { method: 'DELETE' });
        console.log('✅ Deleted chat messages for user_code:', user_code);
        return true;
      } catch (err) {
        console.error('❌ Error in ChatMessage.deleteByUserCode:', err);
        throw err;
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
        const result = await apiCall('/message-queue', {
          method: 'POST',
          body: JSON.stringify(queueData),
        });
        console.log('✅ Message added to queue:', result);
        return result;
      } catch (err) {
        console.error('❌ Error in MessageQueue.addToQueue:', err);
        throw err;
      }
    },
    getPendingForUser: async (userCode) => {
      try {
        console.log('📬 Getting pending messages for user:', userCode);
        const result = await apiCall(`/message-queue/user/${userCode}`);
        const pending = (result || []).filter(msg => msg.status === 'pending');
        console.log('✅ Retrieved pending messages from queue:', pending.length, 'records');
        return pending;
      } catch (err) {
        console.error('❌ Error in MessageQueue.getPendingForUser:', err);
        throw err;
      }
    },
    getPendingForClient: async (clientId) => {
      try {
        console.log('📬 Getting pending messages for client ID:', clientId);
        const result = await apiCall(`/message-queue/client/${clientId}`);
        console.log('✅ Retrieved pending messages for client:', result?.length || 0, 'records');
        return result || [];
      } catch (err) {
        console.error('❌ Error in MessageQueue.getPendingForClient:', err);
        throw err;
      }
    },
    getByDietitian: async (dietitianId, { status = null, limit = 100, offset = 0 } = {}) => {
      try {
        console.log('📬 Getting messages by dietitian:', dietitianId);
        const params = new URLSearchParams({ limit: limit.toString(), offset: offset.toString() });
        if (status) params.set('status', status);
        const result = await apiCall(`/message-queue/dietitian/${dietitianId}?${params}`);
        console.log('✅ Retrieved messages by dietitian:', result?.length || 0, 'records');
        return result || [];
      } catch (err) {
        console.error('❌ Error in MessageQueue.getByDietitian:', err);
        throw err;
      }
    },
    updateStatus: async (messageId, status, additionalData = {}) => {
      try {
        console.log('📬 Updating message status:', messageId, 'to:', status);
        const result = await apiCall(`/message-queue/${messageId}`, {
          method: 'PUT',
          body: JSON.stringify({ status, ...additionalData }),
        });
        console.log('✅ Message status updated in queue:', result);
        return result;
      } catch (err) {
        console.error('❌ Error in MessageQueue.updateStatus:', err);
        throw err;
      }
    },
    listAll: async ({ status = null, limit = 100, offset = 0 } = {}) => {
      try {
        console.log('📬 Getting all messages from queue');
        const params = new URLSearchParams({ limit: limit.toString(), offset: offset.toString() });
        if (status) params.set('status', status);
        const result = await apiCall(`/message-queue?${params}`);
        console.log('✅ Retrieved messages from queue:', result?.length || 0, 'records');
        return result || [];
      } catch (err) {
        console.error('❌ Error in MessageQueue.listAll:', err);
        throw err;
      }
    },
    listByUserCode: async (user_code) => {
      try {
        console.log('📬 Listing queued messages for user_code:', user_code);
        const result = await apiCall(`/message-queue/user/${user_code}`);
        console.log('✅ Retrieved queued messages for user_code:', user_code, 'count:', result?.length || 0);
        return result || [];
      } catch (err) {
        console.error('❌ Error in MessageQueue.listByUserCode:', err);
        throw err;
      }
    },
    deleteByConversation: async (conversation_id) => {
      try {
        console.log('🗑️ Deleting queued messages for conversation:', conversation_id);
        await apiCall(`/message-queue/conversation/${conversation_id}`, { method: 'DELETE' });
        console.log('✅ Deleted queued messages for conversation:', conversation_id);
        return true;
      } catch (err) {
        console.error('❌ Error in MessageQueue.deleteByConversation:', err);
        throw err;
      }
    },
    deleteByUserCode: async (user_code) => {
      try {
        console.log('🗑️ Deleting queued messages for user_code:', user_code);
        await apiCall(`/message-queue/user/${user_code}`, { method: 'DELETE' });
        console.log('✅ Deleted queued messages for user_code:', user_code);
        return true;
      } catch (err) {
        console.error('❌ Error in MessageQueue.deleteByUserCode:', err);
        throw err;
      }
    },
  },
  ChatConversation: {
    getByUserId: async (user_id) => {
      // Note: This requires user_code, use getByUserCode instead
      throw new Error('getByUserId requires user_code. Use getByUserCode instead.');
    },
    getByUserCode: async (user_code) => {
      try {
        const result = await apiCall(`/chat-conversations/user/${user_code}`);
        return result;
      } catch (err) {
        throw new Error(err.message);
      }
    },
    listByUserCode: async (user_code) => {
      try {
        console.log('📃 Listing chat conversations for user_code:', user_code);
        const result = await apiCall(`/chat-conversations/user/${user_code}/list`);
        console.log('✅ Retrieved chat conversations for user_code:', user_code, 'count:', result?.length || 0);
        return result || [];
      } catch (err) {
        console.error('❌ Error in ChatConversation.listByUserCode:', err);
        throw err;
      }
    },
    delete: async (id) => {
      try {
        console.log('🗑️ Deleting chat conversation with id:', id);
        await apiCall(`/chat-conversations/${id}`, { method: 'DELETE' });
        console.log('✅ Deleted chat conversation with id:', id);
        return true;
      } catch (err) {
        console.error('❌ Error in ChatConversation.delete:', err);
        throw err;
      }
    },
    deleteByUserCode: async (user_code) => {
      try {
        console.log('🗑️ Deleting chat conversations for user_code:', user_code);
        await apiCall(`/chat-conversations/user/${user_code}`, { method: 'DELETE' });
        console.log('✅ Deleted chat conversations for user_code:', user_code);
        return true;
      } catch (err) {
        console.error('❌ Error in ChatConversation.deleteByUserCode:', err);
        throw err;
      }
    }
  },
  
  // Training Management APIs
  TrainingPlans: {
    getByUserCode: async (userCode) => {
      try {
        const result = await apiCall(`/training-plans/user/${userCode}`);
        return result || [];
      } catch (err) {
        console.error('❌ Error fetching training plans:', err);
        throw err;
      }
    },
    getAll: async () => {
      try {
        const result = await apiCall('/training-plans');
        return result || [];
      } catch (err) {
        console.error('❌ Error fetching all training plans:', err);
        throw err;
      }
    },
    getActive: async (userCode) => {
      try {
        const result = await apiCall(`/training-plans/user/${userCode}/active`);
        return result || null;
      } catch (err) {
        console.error('❌ Error fetching active training plan:', err);
        throw err;
      }
    },
    create: async (planData) => {
      try {
        const result = await apiCall('/training-plans', {
          method: 'POST',
          body: JSON.stringify(planData),
        });
        return result;
      } catch (err) {
        console.error('❌ Error creating training plan:', err);
        throw err;
      }
    },
    update: async (id, updates) => {
      try {
        const result = await apiCall(`/training-plans/${id}`, {
          method: 'PUT',
          body: JSON.stringify(updates),
        });
        return result;
      } catch (err) {
        console.error('❌ Error updating training plan:', err);
        throw err;
      }
    },
    delete: async (id) => {
      try {
        await apiCall(`/training-plans/${id}`, { method: 'DELETE' });
        return true;
      } catch (err) {
        console.error('❌ Error deleting training plan:', err);
        throw err;
      }
    },
  },
  TrainingLogs: {
    getByUserCode: async (userCode, limit = 50) => {
      try {
        const result = await apiCall(`/training-logs/user/${userCode}?limit=${limit}`);
        return result || [];
      } catch (err) {
        console.error('❌ Error fetching training logs:', err);
        throw err;
      }
    },
    getByDateRange: async (userCode, startDate, endDate) => {
      try {
        const result = await apiCall(`/training-logs/user/${userCode}/range?startDate=${startDate}&endDate=${endDate}`);
        return result || [];
      } catch (err) {
        console.error('❌ Error fetching training logs by date range:', err);
        throw err;
      }
    },
    getAll: async (limit = 100) => {
      try {
        const result = await apiCall(`/training-logs?limit=${limit}`);
        return result || [];
      } catch (err) {
        console.error('❌ Error fetching all training logs:', err);
        throw err;
      }
    },
  },
  TrainingAnalytics: {
    getByUserCode: async (userCode) => {
      try {
        const result = await apiCall(`/training-analytics/user/${userCode}`);
        return result || [];
      } catch (err) {
        console.error('❌ Error fetching training analytics:', err);
        throw err;
      }
    },
    getByExercise: async (userCode, exerciseName) => {
      try {
        const result = await apiCall(`/training-analytics/user/${userCode}/exercise/${encodeURIComponent(exerciseName)}`);
        return result || [];
      } catch (err) {
        console.error('❌ Error fetching exercise analytics:', err);
        throw err;
      }
    },
  },
  
  TrainingReminders: {
    getPending: async () => {
      try {
        const result = await apiCall('/training-reminders/pending');
        return result || [];
      } catch (err) {
        console.error('❌ Error fetching pending reminders:', err);
        throw err;
      }
    },
    getByUserCode: async (userCode) => {
      try {
        const result = await apiCall(`/training-reminders/user/${userCode}`);
        return result || [];
      } catch (err) {
        console.error('❌ Error fetching user reminders:', err);
        throw err;
      }
    },
    create: async (reminderData) => {
      try {
        const result = await apiCall('/training-reminders', {
          method: 'POST',
          body: JSON.stringify(reminderData),
        });
        return result;
      } catch (err) {
        console.error('❌ Error creating reminder:', err);
        throw err;
      }
    },
    updateStatus: async (id, status, errorMessage = null) => {
      try {
        const updateData = { status };
        if (errorMessage) updateData.error_message = errorMessage;
        const result = await apiCall(`/training-reminders/${id}`, {
          method: 'PUT',
          body: JSON.stringify(updateData),
        });
        return result;
      } catch (err) {
        console.error('❌ Error updating reminder status:', err);
        throw err;
      }
    },
    delete: async (id) => {
      try {
        await apiCall(`/training-reminders/${id}`, { method: 'DELETE' });
        return true;
      } catch (err) {
        console.error('❌ Error deleting reminder:', err);
        throw err;
      }
    },
  },
  ExerciseLibrary: {
    getAll: async () => {
      try {
        const result = await apiCall('/exercise-library');
        return result || [];
      } catch (err) {
        console.error('❌ Error fetching exercise library:', err);
        throw err;
      }
    },
    getByCategory: async (category) => {
      try {
        const result = await apiCall(`/exercise-library/category/${encodeURIComponent(category)}`);
        return result || [];
      } catch (err) {
        console.error('❌ Error fetching exercises by category:', err);
        throw err;
      }
    },
    search: async (searchTerm) => {
      try {
        const result = await apiCall(`/exercise-library/search?q=${encodeURIComponent(searchTerm)}`);
        return result || [];
      } catch (err) {
        console.error('❌ Error searching exercises:', err);
        throw err;
      }
    },
    create: async (exerciseData) => {
      try {
        const result = await apiCall('/exercise-library', {
          method: 'POST',
          body: JSON.stringify(exerciseData),
        });
        return result;
      } catch (err) {
        console.error('❌ Error creating exercise:', err);
        throw err;
      }
    },
    update: async (id, updates) => {
      try {
        const result = await apiCall(`/exercise-library/${id}`, {
          method: 'PUT',
          body: JSON.stringify(updates),
        });
        return result;
      } catch (err) {
        console.error('❌ Error updating exercise:', err);
        throw err;
      }
    },
  },
  TrainingPlanTemplates: {
    getAll: async () => {
      try {
        const result = await apiCall('/training-templates');
        return result || [];
      } catch (err) {
        console.error('❌ Error fetching training plan templates:', err);
        throw err;
      }
    },
    getOwn: async () => {
      // Note: Backend doesn't have a separate endpoint for own templates
      // Filter from getAll results or implement in backend if needed
      try {
        const allTemplates = await apiCall('/training-templates');
        // Filter would need user context - this may need backend support
        return allTemplates || [];
      } catch (err) {
        console.error('❌ Error fetching own templates:', err);
        throw err;
      }
    },
    getPublic: async () => {
      try {
        const result = await apiCall('/training-templates/public');
        return result || [];
      } catch (err) {
        console.error('❌ Error fetching public templates:', err);
        throw err;
      }
    },
    search: async (searchTerm) => {
      try {
        const result = await apiCall(`/training-templates/search?q=${encodeURIComponent(searchTerm)}`);
        return result || [];
      } catch (err) {
        console.error('❌ Error searching templates:', err);
        throw err;
      }
    },
    create: async (templateData) => {
      try {
        const result = await apiCall('/training-templates', {
          method: 'POST',
          body: JSON.stringify(templateData),
        });
        return result;
      } catch (err) {
        console.error('❌ Error creating template:', err);
        throw err;
      }
    },
    update: async (id, updates) => {
      try {
        const result = await apiCall(`/training-templates/${id}`, {
          method: 'PUT',
          body: JSON.stringify(updates),
        });
        return result;
      } catch (err) {
        console.error('❌ Error updating template:', err);
        throw err;
      }
    },
    delete: async (id) => {
      try {
        await apiCall(`/training-templates/${id}`, { method: 'DELETE' });
        return true;
      } catch (err) {
        console.error('❌ Error deleting template:', err);
        throw err;
      }
    },
    hardDelete: async (id) => {
      try {
        await apiCall(`/training-templates/${id}/hard-delete`, { method: 'DELETE' });
        return true;
      } catch (err) {
        console.error('❌ Error hard deleting template:', err);
        throw err;
      }
    },
    incrementUsage: async (id) => {
      try {
        await apiCall(`/training-templates/${id}/increment-usage`, { method: 'POST' });
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