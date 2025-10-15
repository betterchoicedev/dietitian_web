import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

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

      // Fetch ALL active messages (not just urgent)
      const { data, error } = await supabase
        .from('system_messages')
        .select('id, start_date, end_date, priority')
        .eq('is_active', true);

      if (error) {
        console.error('Supabase query error:', error);
        throw error;
      }

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

