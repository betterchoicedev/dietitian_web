import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { SystemMessages } from '@/api/entities';

// Helper function to get active system messages for a user
const getActiveMessagesForUser = async (user_id) => {
  // Get all active messages (only fields needed for counting)
  const allMessages = await SystemMessages.list({ is_active: true });
  
  if (!allMessages) return [];
  
  // Filter messages: broadcast (directed_to IS NULL) or directed to user
  return allMessages.filter(msg => {
    const directed_to = msg.directed_to;
    return !directed_to || directed_to === user_id;
  });
};

/**
 * Custom hook to fetch and track system messages
 * Returns the count of unread active system messages (all priorities)
 */
export function useSystemMessages() {
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchUnreadCount();

    // Set up real-time subscription for system messages
    // Note: Real-time subscriptions still use Supabase directly as they require WebSocket connection
    const subscription = supabase
      .channel('system_messages_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'system_messages',
        },
        () => {
          // Refetch count when messages change
          fetchUnreadCount();
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const fetchUnreadCount = async () => {
    try {
      setLoading(true);
      const now = new Date().toISOString();

      // Get current user ID
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.log('No authenticated user');
        setUnreadCount(0);
        return;
      }

      // Fetch active messages - either broadcast (directed_to IS NULL) or directed to current user
      const data = await getActiveMessagesForUser(user.id);

      // Filter by date range in JavaScript (more reliable than complex SQL)
      const activeMessages = (data || []).filter(msg => {
        const startDate = msg.start_date;
        const endDate = msg.end_date;
        
        // If no start_date, message is active
        const isStarted = !startDate || new Date(startDate) <= new Date(now);
        // If no end_date, message is active
        const isNotExpired = !endDate || new Date(endDate) >= new Date(now);
        
        return isStarted && isNotExpired;
      });

      // Count ALL active messages (not filtered by viewed status for badge)
      console.log('Total messages:', data?.length || 0, 'Active:', activeMessages.length);
      setUnreadCount(activeMessages.length);
    } catch (error) {
      console.error('Error fetching unread messages count:', error);
      setUnreadCount(0);
    } finally {
      setLoading(false);
    }
  };

  // Function to refresh count (can be called externally)
  const refreshCount = () => {
    fetchUnreadCount();
  };

  return { unreadCount, loading, refreshCount };
}

