import React, { createContext, useContext, useState, useEffect } from 'react';
import { ChatUser } from '@/api/entities';
import { EventBus } from '@/utils/EventBus';

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
  const [selectedUserCode, setSelectedUserCode] = useState(null);
  const [selectedClient, setSelectedClient] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Load all clients on mount
  useEffect(() => {
    loadClients();
  }, []);

  // Listen to cross-app client refresh events (e.g., after creating a new user)
  useEffect(() => {
    const handler = () => loadClients();
    EventBus.on('refreshClients', handler);
    return () => {
      if (EventBus.off) EventBus.off('refreshClients', handler);
    };
  }, []);

  // Load selected client data when userCode changes
  useEffect(() => {
    if (selectedUserCode) {
      loadSelectedClient();
    } else {
      setSelectedClient(null);
    }
  }, [selectedUserCode]);

  const loadClients = async () => {
    try {
      setIsLoading(true);
      setError(null);
      console.log('👥 Loading clients from chat_users table...');
      const clientsData = await ChatUser.list();
      console.log('✅ Clients loaded:', clientsData?.length || 0, 'records');
      setClients(clientsData || []);
      
      // Auto-select first client if available and no client is currently selected
      if (clientsData && clientsData.length > 0 && !selectedUserCode) {
        setSelectedUserCode(clientsData[0].user_code);
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