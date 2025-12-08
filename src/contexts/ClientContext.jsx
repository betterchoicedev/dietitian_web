import React, { createContext, useContext, useState, useEffect } from 'react';
import { ChatUser } from '@/api/entities';
import { EventBus } from '@/utils/EventBus';
import { getMyProfile, getCompanyProfileIds } from '@/utils/auth';

const ClientContext = createContext();

export const useClient = () => {
  const context = useContext(ClientContext);
  if (!context) {
    throw new Error('useClient must be used within a ClientProvider');
  }
  return context;
};

export function ClientProvider({ children }) {
  const [clients, setClients] = useState([]);
  // Initialize selected user code from localStorage so it survives refresh
  const [selectedUserCode, setSelectedUserCode] = useState(() => {
    try {
      return localStorage.getItem('selectedUserCode') || null;
    } catch {
      return null;
    }
  });
  const [selectedClient, setSelectedClient] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Load all clients on mount
  useEffect(() => {
    loadClients();
  }, []);

  // Handle tab visibility changes to restore selection
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // When tab becomes visible, restore selection from localStorage
        try {
          const storedUserCode = localStorage.getItem('selectedUserCode');
          if (storedUserCode && storedUserCode !== selectedUserCode) {
            console.log('🔄 Tab became visible, restoring selection:', storedUserCode);
            setSelectedUserCode(storedUserCode);
          }
        } catch (error) {
          console.error('Error restoring selection on visibility change:', error);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [selectedUserCode]);

  // Listen to cross-app client refresh events (e.g., after creating a new user)
  useEffect(() => {
    const handler = () => loadClients();
    EventBus.on('refreshClients', handler);
    return () => {
      if (EventBus.off) EventBus.off('refreshClients', handler);
    };
  }, []);

  // Listen for role changes or profile updates
  useEffect(() => {
    const refreshHandler = () => {
      console.log('🔄 Role or profile changed, reloading clients...');
      loadClients();
    };
    
    const logoutHandler = () => {
      console.log('🔐 User logged out, clearing client list...');
      setClients([]);
      setSelectedUserCode(null);
      setSelectedClient(null);
    };
    
    EventBus.on('profileUpdated', refreshHandler);
    EventBus.on('roleChanged', refreshHandler);
    EventBus.on('userLoggedIn', refreshHandler); // Listen for login events
    EventBus.on('userLoggedOut', logoutHandler); // Listen for logout events
    return () => {
      if (EventBus.off) {
        EventBus.off('profileUpdated', refreshHandler);
        EventBus.off('roleChanged', refreshHandler);
        EventBus.off('userLoggedIn', refreshHandler);
        EventBus.off('userLoggedOut', logoutHandler);
      }
    };
  }, []);

  // Persist selection whenever it changes and load the client details
  useEffect(() => {
    try {
      if (selectedUserCode) {
        localStorage.setItem('selectedUserCode', selectedUserCode);
        loadSelectedClient();
      } else {
        localStorage.removeItem('selectedUserCode');
        setSelectedClient(null);
      }
    } catch {
      // ignore storage errors
    }
  }, [selectedUserCode]);

  const loadClients = async () => {
    try {
      setIsLoading(true);
      setError(null);
      console.log('👥 Loading clients from chat_users table...');
      
      // Read current selection from localStorage to avoid stale closure values
      let currentStoredUserCode = null;
      try {
        currentStoredUserCode = localStorage.getItem('selectedUserCode');
      } catch {
        // ignore storage errors
      }
      
      // 1) Fetch all clients (unchanged)
      const all = await ChatUser.list(); // returns chat_users rows
      console.log('📋 All clients fetched:', all?.length || 0, 'records');
      
      // 2) Fetch my profile to determine role and company
      const me = await getMyProfile();
      console.log('👤 User profile:', { role: me.role, company_id: me.company_id, id: me.id });

      let visible = all;

      if (me.role === "sys_admin") {
        // sys_admin: see everything
        console.log('🔓 Sys admin: showing all clients');
        visible = all;
      } else if (me.role === "company_manager") {
        // company_manager: see clients assigned to *any* employee in my company
        console.log('🏢 Company manager: filtering by company', me.company_id);
        const ids = await getCompanyProfileIds(me.company_id); // array of profile.id
        console.log('👥 Company profile IDs:', ids);
        const idSet = new Set(ids);
        visible = all.filter(c => c.provider_id && idSet.has(c.provider_id));
        console.log('✅ Company manager filtered clients:', visible.length);
        // Note: unassigned clients (provider_id IS NULL) won't show for managers
        // unless you add client_company_id to chat_users
      } else {
        // employee: only clients assigned directly to me
        console.log('👷 Employee: filtering by my ID', me.id);
        console.log('🔍 All clients with provider_id:', all.map(c => ({ user_code: c.user_code, provider_id: c.provider_id })));
        
        // Filter clients where provider_id matches the current user's ID
        visible = all.filter(c => {
          const matches = c.provider_id === me.id;
          console.log(`🔍 Client ${c.user_code}: provider_id=${c.provider_id}, my_id=${me.id}, matches=${matches}`);
          return matches;
        });
        
        console.log('✅ Employee filtered clients:', visible.length, visible.map(c => c.user_code));
        
        // If no clients are assigned to this employee, show a helpful message
        if (visible.length === 0) {
          console.log('⚠️ No clients assigned to this employee. Make sure clients have provider_id set to:', me.id);
        }
      }

      console.log('✅ Clients loaded:', visible?.length || 0, 'records (filtered by role)');
      setClients(visible || []);
      
      // Preserve selection: only change if stored selection is invalid or missing
      if (visible && visible.length > 0) {
        const storedSelectionValid = currentStoredUserCode && visible.some(c => c.user_code === currentStoredUserCode);
        
        if (currentStoredUserCode && storedSelectionValid) {
          // Stored selection is valid, ensure it's set (in case state was lost)
          if (currentStoredUserCode !== selectedUserCode) {
            console.log('🔄 Restoring valid stored selection:', currentStoredUserCode);
            setSelectedUserCode(currentStoredUserCode);
          }
        } else if (!currentStoredUserCode) {
          // No stored selection, select first client only if no current selection
          if (!selectedUserCode) {
            console.log('🔄 No stored selection, selecting first client:', visible[0].user_code);
            setSelectedUserCode(visible[0].user_code);
          }
        } else {
          // Stored selection exists but is invalid, fall back to first client
          console.log('🔄 Stored selection no longer valid, selecting first client:', visible[0].user_code);
          setSelectedUserCode(visible[0].user_code);
        }
      } else {
        console.log('⚠️ No visible clients after filtering');
        // Clear selection if no clients available
        if (currentStoredUserCode) {
          setSelectedUserCode(null);
        }
      }
    } catch (error) {
      console.error("❌ Error loading clients:", error);
      setError("Failed to load clients");
    } finally {
      setIsLoading(false);
    }
  };

  const loadSelectedClient = async () => {
    if (!selectedUserCode) return;

    try {
      console.log('👤 Loading client data for:', selectedUserCode);
      const clientData = await ChatUser.getByUserCode(selectedUserCode);
      setSelectedClient(clientData);
      console.log('✅ Client data loaded:', clientData);
    } catch (error) {
      console.error("❌ Error loading selected client:", error);
      setError("Failed to load client data");
      setSelectedClient(null);
    }
  };

  const selectClient = (userCode) => {
    setSelectedUserCode(userCode);
  };

  const refreshClients = () => {
    loadClients();
  };

  const value = {
    clients,
    selectedUserCode,
    selectedClient,
    isLoading,
    error,
    selectClient,
    refreshClients,
    loadSelectedClient
  };

  return (
    <ClientContext.Provider value={value}>
      {children}
    </ClientContext.Provider>
  );
}