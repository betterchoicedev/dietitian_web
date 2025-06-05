// Local API client implementation

// Mock data for local development
const mockUser = {
  id: "local-user-1",
  email: "demo@example.com",
  name: "Demo User",
  role: "dietitian",
  selectedClientId: null
};

const mockClients = [
  {
    id: "client-1",
    name: "John Doe",
    email: "john@example.com",
    user_code: "JD001",
    height: 175,
    weight: 70,
    age: 30,
    gender: "male",
    activity_level: "moderate",
    goal: "weight_loss"
  }
];

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
      return { id: `menu-${Date.now()}`, ...data };
    },
    get: async (id) => {
      return { id, name: "Sample Menu", items: [] };
    },
    list: async () => {
      return [];
    },
    filter: async (query) => {
      return [];
    },
    update: async (id, data) => {
      return { id, ...data };
    },
    delete: async (id) => {
      return true;
    }
  },
  Chat: {
    create: async (data) => {
      return { id: `chat-${Date.now()}`, messages: [], ...data };
    },
    get: async (id) => {
      return { id, messages: [] };
    },
    list: async () => {
      return [];
    },
    filter: async (query) => {
      return [];
    },
    update: async (id, data) => {
      return { id, ...data };
    },
    delete: async (id) => {
      return true;
    }
  },
  Client: {
    create: async (data) => {
      return { id: `client-${Date.now()}`, ...data };
    },
    get: async (id) => {
      return mockClients.find(client => client.id === id) || null;
    },
    list: async () => {
      return mockClients;
    },
    filter: async (query) => {
      return mockClients;
    },
    update: async (id, data) => {
      return { id, ...data };
    },
    delete: async (id) => {
      return true;
    }
  }
};

// Core integrations
export const integrations = {
  Core: {
    InvokeLLM: async (prompt) => {
      return { response: "This is a mock LLM response" };
    },
    SendEmail: async (emailData) => {
      console.log('Email would be sent:', emailData);
      return true;
    },
    UploadFile: async (file) => {
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