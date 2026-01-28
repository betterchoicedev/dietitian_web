import React, { useState, useEffect, useRef } from 'react';
import { ChatUser, ChatMessage, ChatConversation, ScheduledReminders } from '@/api/entities';
import { Menu } from '@/api/entities';
import { Client } from '@/api/entities';
import { User } from '@/api/entities';
import { UploadFile } from '@/api/integrations';
import { useLanguage } from '@/contexts/LanguageContext';
import { useClient } from '@/contexts/ClientContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Image as ImageIcon, Send, Loader2, MessageSquare, InfoIcon, RefreshCw, Users, X, CheckCircle, Clock, Calendar, Edit, Trash2, UtensilsCrossed, Dumbbell, Music } from 'lucide-react';
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/lib/supabase';
import { uploadFile, validateFile, getFileCategory, formatFileSize } from '@/utils/storage';


export default function Chat() {
  const { language, translations } = useLanguage();
  const { selectedClient } = useClient();
  const [selectedChat, setSelectedChat] = useState(null);
  const [message, setMessage] = useState('');
  const [mealPlanData, setMealPlanData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingData, setIsFetchingData] = useState(true);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);
  const chatEndRef = useRef(null);
  const scrollAreaRef = useRef(null);
  const [imageFile, setImageFile] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [messages, setMessages] = useState([]);
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [conversationId, setConversationId] = useState(null);
  const [firstMessageId, setFirstMessageId] = useState(null); // for pagination
  const [isUserAtBottom, setIsUserAtBottom] = useState(true);
  const [isImageModalOpen, setIsImageModalOpen] = useState(false);
  const [currentImageUrl, setCurrentImageUrl] = useState(null);
  const [isUserActive, setIsUserActive] = useState(true); // Track if user is active
  const [lastUserActivity, setLastUserActivity] = useState(Date.now());
  const [isRefreshing, setIsRefreshing] = useState(false); // Track refresh state
  const [lastRefreshTime, setLastRefreshTime] = useState(null); // Track last refresh time
  const [currentDietitian, setCurrentDietitian] = useState(null); // Current authenticated dietitian
  const [clientId, setClientId] = useState(null); // Client ID from chat_users table
  const [showSuccessToast, setShowSuccessToast] = useState(false); // Success toast state
  const [toastMessage, setToastMessage] = useState(''); // Toast message content
  const [toastType, setToastType] = useState('success'); // Toast type (success, error, etc.)
  const [messageType, setMessageType] = useState('dietitian'); // Message type: 'dietitian', 'system_reminder'
  
  // Scheduling state
  const [isScheduled, setIsScheduled] = useState(false); // Toggle between immediate and scheduled
  const [scheduledDate, setScheduledDate] = useState(''); // Date for scheduled message (YYYY-MM-DD)
  const [scheduledTime, setScheduledTime] = useState(''); // Time for scheduled message (HH:MM)
  const [showScheduleDialog, setShowScheduleDialog] = useState(false); // Show schedule dialog
  const [scheduledReminders, setScheduledReminders] = useState([]); // List of scheduled reminders
  const [showRemindersDialog, setShowRemindersDialog] = useState(false); // Show scheduled reminders dialog
  const [editingReminder, setEditingReminder] = useState(null); // Currently editing reminder
  const [editReminderDate, setEditReminderDate] = useState(''); // Edit reminder date
  const [editReminderTime, setEditReminderTime] = useState(''); // Edit reminder time
  const [editReminderContext, setEditReminderContext] = useState(''); // Edit reminder message
  
  // Scroll position tracking for auto-refresh
  const [userScrollPosition, setUserScrollPosition] = useState('bottom'); // 'bottom', 'middle', 'top'
  const [lastScrollTop, setLastScrollTop] = useState(0);
  const [hasNewMessages, setHasNewMessages] = useState(false); // Track if there are new messages when user is not at bottom
  
  // Use refs to store intervals to prevent recreation issues
  const autoRefreshIntervalRef = useRef(null);
  const simpleRefreshIntervalRef = useRef(null);
  // Ref for load-more condition in handleScroll (avoids stale closures)
  const loadMoreStateRef = useRef({});

  // Helper function to filter messages based on role and content
  const filterValidMessages = (messages) => {
    return messages.filter(msg => {
      // Show messages only where role is "assistant" or "user"
      if (msg.role === 'assistant' || msg.role === 'user') {
        // If role is "assistant", only keep messages where "message" column is not null
        if (msg.role === 'assistant') {
          return msg.message !== null && msg.message !== undefined;
        }
        // Keep all user messages
        return true;
      }
      
      // Show role "system" only if it contains "ANALYZED FOOD CONTEXT" or "Score"
      if (msg.role === 'system') {
        const messageContent = String(msg.message || msg.content || '');
        return messageContent.includes('ANALYZED FOOD CONTEXT') || messageContent.includes('Image URL');
      }
      
      // Filter out all other roles
      return false;
    });
  };

  // Function to show toast notification
  const showToast = (message, type = 'success') => {
    setToastMessage(message);
    setToastType(type);
    setShowSuccessToast(true);
    
    // Auto-hide after 3 seconds
    setTimeout(() => {
      setShowSuccessToast(false);
    }, 3000);
  };

  // Get current authenticated user (dietitian)
  useEffect(() => {
    const getCurrentUser = async () => {
      try {
        const { data: { user }, error } = await supabase.auth.getUser();
        if (error) {
          console.error('Error getting current user:', error);
          return;
        }
        if (user) {
          setCurrentDietitian(user);
          console.log('✅ Current dietitian loaded:', user.id);
        }
      } catch (err) {
        console.error('Error in getCurrentUser:', err);
      }
    };

    getCurrentUser();
  }, []);

  // Get client ID when selectedClient changes
  useEffect(() => {
    const getClientId = async () => {
      if (!selectedClient?.user_code) return;
      
      try {
        console.log('🔍 Getting client ID for user_code:', selectedClient.user_code);
        const client = await ChatUser.get(selectedClient.user_code, { fields: 'id' });
        
        if (client) {
          setClientId(client.id);
          console.log('✅ Client ID loaded:', client.id);
        }
      } catch (err) {
        console.error('Error getting client ID:', err);
      }
    };

    getClientId();
  }, [selectedClient?.user_code]);

  // Simple auto-refresh that always runs every 10 seconds (most reliable)
  useEffect(() => {
    if (!selectedClient?.user_code || !conversationId) {
      console.log('Auto-refresh: Missing user_code or conversationId, skipping...');
      return;
    }

    console.log('🔄 Setting up simple auto-refresh for conversation:', conversationId);

    // Clear any existing interval
    if (simpleRefreshIntervalRef.current) {
      clearInterval(simpleRefreshIntervalRef.current);
    }

    // Set up new interval
    simpleRefreshIntervalRef.current = setInterval(async () => {
      try {
        console.log('🔄 Simple auto-refresh: Checking for new messages...');
        const latestMessages = await ChatMessage.listByConversation(conversationId, { limit: 20 });
        // Reverse to show oldest at top, newest at bottom
        const reversedMessages = filterValidMessages(latestMessages.reverse());
        
        // Capture user's scroll position before updating messages
        const scrollArea = scrollAreaRef.current;
        const viewport = scrollArea?.querySelector('[data-radix-scroll-area-viewport]');
        const prevScrollTop = viewport ? viewport.scrollTop : 0;
        const prevScrollHeight = viewport ? viewport.scrollHeight : 0;
        const prevClientHeight = viewport ? viewport.clientHeight : 0;
        
        // Check if user was at the bottom (within 50px)
        const distanceFromBottom = prevScrollHeight - prevScrollTop - prevClientHeight;
        const wasAtBottom = distanceFromBottom <= 50;
        
        // Check for new messages by comparing IDs instead of just length
        setMessages(prev => {
          const currentMessageIds = new Set(prev.map(m => m.id));
          const newMessages = reversedMessages.filter(msg => !currentMessageIds.has(msg.id));
          
          if (newMessages.length > 0) {
            console.log(`🔄 Simple auto-refresh: New messages detected! Found ${newMessages.length} new messages`);
            
            // If we have loaded older messages (indicated by firstMessageId matching first message),
            // preserve them and only append new messages at the end
            let mergedMessages;
            if (prev.length > 0 && firstMessageId && prev[0].id === firstMessageId) {
              // User has loaded older messages, preserve them and append new messages
              // Filter new messages to only include those that are actually newer
              const existingNewest = prev[prev.length - 1];
              const newMessagesToAdd = newMessages.filter(msg => {
                if (!existingNewest?.created_at) return true;
                return new Date(msg.created_at) > new Date(existingNewest.created_at);
              });
              mergedMessages = [...prev, ...newMessagesToAdd];
            } else {
              // No older messages loaded, replace with latest 20
              mergedMessages = reversedMessages;
            }
            
            // Update other state outside of setState callback
            setTimeout(() => {
              // Only update firstMessageId if we don't have one yet (initial load)
              if (!firstMessageId) {
                setFirstMessageId(mergedMessages.length > 0 ? mergedMessages[0].id : null);
              }
              setHasMoreMessages(latestMessages.length === 20);
              setLastRefreshTime(new Date());
              
              // Restore scroll position after DOM updates
              if (wasAtBottom) {
                // User was at bottom, scroll to new messages
                console.log('🔄 Auto-scrolling to bottom for new messages');
                chatEndRef.current?.scrollIntoView({ behavior: 'auto' });
                setHasNewMessages(false); // Clear flag since we're scrolling to new messages
              } else {
                // User was scrolling up, don't adjust scroll position at all
                // Just show the new message indicator
                console.log('🔄 Preserving scroll position, user was not at bottom');
                setHasNewMessages(true); // Set flag to show new message indicator
              }
            }, 0);
            
            return mergedMessages;
          } else {
            console.log('Simple auto-refresh: No new messages found');
            // No new messages, preserve scroll position
            setLastRefreshTime(new Date());
            return prev;
          }
        });
      } catch (error) {
        console.warn('Simple auto-refresh failed:', error);
      }
    }, 10000); // 10 seconds

    // Cleanup function
    return () => {
      if (simpleRefreshIntervalRef.current) {
        console.log('🔄 Cleaning up simple auto-refresh interval');
        clearInterval(simpleRefreshIntervalRef.current);
        simpleRefreshIntervalRef.current = null;
      }
    };
  }, [selectedClient?.user_code, conversationId]); // Removed messages.length dependency

  // Aggressive auto-refresh every 5 seconds for testing - DISABLED to prevent conflicts
  // useEffect(() => {
  //   if (!selectedClient?.user_code || !conversationId) return;

  //   console.log('🔄 Setting up aggressive 5-second auto-refresh for conversation:', conversationId);

  //   const aggressiveInterval = setInterval(async () => {
  //     try {
  //       console.log('🔄 Aggressive auto-refresh: Checking for new messages...');
  //       const latestMessages = await ChatMessage.listByConversation(conversationId, { limit: 20 });
  //       // Reverse to show oldest at top, newest at bottom
  //       const reversedMessages = latestMessages.reverse();
        
  //       // Check for new messages by comparing IDs instead of just length
  //       const currentMessageIds = new Set(messages.map(m => m.id));
  //       const newMessages = reversedMessages.filter(msg => !currentMessageIds.has(msg.id));
        
  //       if (newMessages.length > 0) {
  //         console.log(`🔄 Aggressive auto-refresh: New messages detected! Found ${newMessages.length} new messages`);
          
  //         // Capture user's scroll position before updating messages
  //         const scrollArea = scrollAreaRef.current;
  //         const viewport = scrollArea?.querySelector('[data-radix-scroll-area-viewport]');
  //         const prevScrollTop = viewport ? viewport.scrollTop : 0;
  //         const prevScrollHeight = viewport ? viewport.scrollHeight : 0;
  //         const prevClientHeight = viewport ? viewport.clientHeight : 0;
          
  //         // Check if user was at the bottom (within 50px)
  //         const distanceFromBottom = prevScrollHeight - prevScrollTop - prevClientHeight;
  //         const wasAtBottom = distanceFromBottom <= 50;
          
  //         setMessages(reversedMessages);
  //         // Set firstMessageId to the oldest message (first in reversed array)
  //         setFirstMessageId(reversedMessages.length > 0 ? reversedMessages[0].id : null);
  //         setHasMoreMessages(latestMessages.length === 20);
  //         setLastRefreshTime(new Date());
          
  //         // Restore scroll position after DOM updates
  //         setTimeout(() => {
  //           if (wasAtBottom) {
  //             // User was at bottom, scroll to new messages
  //             console.log('🔄 Aggressive auto-refresh: Auto-scrolling to bottom for new messages');
  //             chatEndRef.current?.scrollIntoView({ behavior: 'auto' });
  //             setHasNewMessages(false); // Clear flag since we're scrolling to new messages
  //           } else {
  //             // User was scrolling up, preserve their position
  //             console.log('🔄 Aggressive auto-refresh: Preserving scroll position, user was not at bottom');
  //             if (viewport) {
  //               const newScrollHeight = viewport.scrollHeight;
  //               const heightDifference = newScrollHeight - prevScrollHeight;
  //               viewport.scrollTop = prevScrollTop + heightDifference;
  //             }
  //             setHasNewMessages(true); // Set flag to show new message indicator
  //           }
  //         }, 0);
  //       } else {
  //         console.log('Aggressive auto-refresh: No new messages found');
  //         // No new messages, preserve scroll position
  //         setLastRefreshTime(new Date());
  //       }
  //     } catch (error) {
  //       console.warn('Aggressive auto-refresh failed:', error);
  //     }
  //   }, 5000); // 5 seconds

  //   return () => {
  //     console.log('🔄 Cleaning up aggressive auto-refresh interval');
  //     clearInterval(aggressiveInterval);
  //   };
  // }, [selectedClient?.user_code, conversationId]);

  // Initialize scroll position tracking - only on very first load
  useEffect(() => {
    if (messages.length > 0 && scrollAreaRef.current && !firstMessageId) {
      // Set initial scroll position to bottom only on first load
      setUserScrollPosition('bottom');
      // Scroll to bottom on initial load only
      setTimeout(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'auto' });
      }, 100);
    }
  }, [messages.length, firstMessageId]);

  // Additional effect to ensure scroll to bottom on initial conversation load
  useEffect(() => {
    if (messages.length > 0 && conversationId && !isFetchingData) {
      // Small delay to ensure DOM is fully rendered
      setTimeout(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'auto' });
        setUserScrollPosition('bottom');
        setHasNewMessages(false);
      }, 200);
    }
  }, [conversationId, isFetchingData]); // Trigger when conversation loads

  // Add scroll event listeners to ScrollArea viewport
  useEffect(() => {
    const scrollArea = scrollAreaRef.current;
    if (!scrollArea) return;

    const viewport = scrollArea.querySelector('[data-radix-scroll-area-viewport]');
    if (viewport) {
      viewport.addEventListener('scroll', handleScroll, { passive: true });
      return () => viewport.removeEventListener('scroll', handleScroll);
    }
  }, [conversationId, isFetchingData]);

  // Track user activity (less aggressive)
  useEffect(() => {
    const handleUserActivity = () => {
      setIsUserActive(true);
      setLastUserActivity(Date.now());
      
      // Reset to inactive after 3 seconds of no activity (less aggressive)
      setTimeout(() => {
        setIsUserActive(false);
      }, 3000);
    };

    // Listen for user interactions (less events to avoid being too sensitive)
    const events = ['mousedown', 'keypress', 'scroll'];
    events.forEach(event => {
      document.addEventListener(event, handleUserActivity, { passive: true });
    });

    return () => {
      events.forEach(event => {
        document.removeEventListener(event, handleUserActivity);
      });
    };
  }, []);

  // Removed toBase64 function - now using Supabase Storage instead

  // Function to handle image click and open modal
  const handleImageClick = (imageUrl) => {
    setCurrentImageUrl(imageUrl);
    setIsImageModalOpen(true);
  };

  // Function to close image modal
  const closeImageModal = () => {
    setIsImageModalOpen(false);
    setCurrentImageUrl(null);
  };

  // Function to send message via external API instead of message queue
  const addToUserMessageQueue = async (queueData) => {
    try {
      // Get phone number from chat_users table
      const clientData = await ChatUser.get(queueData.user_code, { fields: 'phone_number' });

      if (!clientData?.phone_number) {
        console.error('Error fetching phone number from chat_users');
        throw new Error(`Failed to get phone number for user ${queueData.user_code}`);
      }

      const phoneNumber = clientData.phone_number;

      // Prepare the API request body
      const requestBody = {
        phone_number: phoneNumber,
        message: queueData.content
      };

      // Add media_url if there's an attachment
      if (queueData.attachments?.file_url) {
        requestBody.media_url = queueData.attachments.file_url;
      }

      // Send message via external API
      const response = await fetch('https://api-gw.eu-prod.betterchoice.one/whapi/send-external-message', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Error sending message via API:', response.status, errorText);
        throw new Error(`API error: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      console.log('✅ Message sent via external API:', result);
      return result;
    } catch (error) {
      console.error('Failed to send message via API:', error);
      throw error;
    }
  };

  const handleRefresh = async () => {
    if (!selectedClient?.user_code || !conversationId) return;
    
    try {
      setIsRefreshing(true);
      console.log('🔄 Manual refresh triggered');
      
      // Capture user's scroll position before updating messages
      const scrollArea = scrollAreaRef.current;
      const viewport = scrollArea?.querySelector('[data-radix-scroll-area-viewport]');
      const prevScrollTop = viewport ? viewport.scrollTop : 0;
      const prevScrollHeight = viewport ? viewport.scrollHeight : 0;
      const prevClientHeight = viewport ? viewport.clientHeight : 0;
      
      // Check if user was at the bottom (within 50px)
      const distanceFromBottom = prevScrollHeight - prevScrollTop - prevClientHeight;
      const wasAtBottom = distanceFromBottom <= 50;
      
      // Fetch latest messages
      const latestMessages = await ChatMessage.listByConversation(conversationId, { limit: 20 });
      // Reverse to show oldest at top, newest at bottom
      const reversedMessages = filterValidMessages(latestMessages.reverse());
      
      setMessages(reversedMessages);
      // Only update firstMessageId if we don't have one yet (initial load)
      if (!firstMessageId) {
        setFirstMessageId(reversedMessages.length > 0 ? reversedMessages[0].id : null);
      }
      setHasMoreMessages(latestMessages.length === 20);
      setLastRefreshTime(new Date());
      setHasNewMessages(false); // Clear new message indicator on manual refresh
      
      // Restore scroll position after DOM updates
      setTimeout(() => {
        if (wasAtBottom) {
          // User was at bottom, scroll to new messages
          console.log('🔄 Manual refresh: Auto-scrolling to bottom for new messages');
          chatEndRef.current?.scrollIntoView({ behavior: 'auto' });
        } else {
          // User was scrolling up, don't adjust scroll position at all
          console.log('🔄 Manual refresh: Preserving scroll position, user was not at bottom');
        }
      }, 0);
      
      console.log('✅ Chat refreshed successfully');
    } catch (error) {
      console.error('Manual refresh failed:', error);
      setError(translations.failedToLoadClientData || 'Failed to refresh chat');
    } finally {
      setIsRefreshing(false);
    }
  };

 

  // Fetch scheduled reminders for the selected client
  const fetchScheduledReminders = async () => {
    if (!selectedClient?.user_code) return;
    
    try {
      const data = await ScheduledReminders.list({ 
        user_code: selectedClient.user_code,
        status: ['pending', 'scheduled']
      });
      
      setScheduledReminders(data || []);
      console.log('✅ Fetched scheduled reminders:', data?.length || 0);
    } catch (error) {
      console.error('Failed to fetch scheduled reminders:', error);
      showToast(translations.failedToLoadScheduledMessages || 'Failed to load scheduled messages', 'error');
    }
  };

  // Update scheduled reminder
  const updateScheduledReminder = async (reminderId, updates) => {
    try {
      const data = await ScheduledReminders.update(reminderId, updates);
      
      // Refresh the list
      await fetchScheduledReminders();
      showToast(translations.scheduledMessageUpdated || 'Scheduled message updated successfully!', 'success');
      return data;
    } catch (error) {
      console.error('Failed to update scheduled reminder:', error);
      showToast(translations.failedToUpdateScheduledMessage || 'Failed to update scheduled message', 'error');
      throw error;
    }
  };

  // Delete scheduled reminder
  const deleteScheduledReminder = async (reminderId) => {
    if (!confirm(translations.confirmDeleteScheduledMessage || 'Are you sure you want to delete this scheduled message?')) {
      return;
    }
    
    try {
      await ScheduledReminders.delete(reminderId);
      
      // Refresh the list
      await fetchScheduledReminders();
      showToast(translations.scheduledMessageDeleted || 'Scheduled message deleted successfully!', 'success');
    } catch (error) {
      console.error('Failed to delete scheduled reminder:', error);
      showToast(translations.failedToDeleteScheduledMessage || 'Failed to delete scheduled message', 'error');
    }
  };

  // Open edit dialog for a reminder
  const openEditReminder = (reminder) => {
    setEditingReminder(reminder);
    setEditReminderDate(reminder.scheduled_date);
    setEditReminderTime(reminder.scheduled_time);
    setEditReminderContext(reminder.context);
  };

  // Save edited reminder
  const saveEditedReminder = async () => {
    if (!editingReminder) return;
    
    if (!editReminderDate || !editReminderTime || !editReminderContext.trim()) {
      showToast(translations.pleaseFillAllFields || 'Please fill in all required fields', 'error');
      return;
    }
    
    try {
      await updateScheduledReminder(editingReminder.id, {
        scheduled_date: editReminderDate,
        scheduled_time: editReminderTime,
        context: editReminderContext.trim(),
        updated_at: new Date().toISOString()
      });
      
      setEditingReminder(null);
      setEditReminderDate('');
      setEditReminderTime('');
      setEditReminderContext('');
    } catch (error) {
      // Error already handled in updateScheduledReminder
    }
  };

  // Fetch conversation and initial messages when client is selected
  useEffect(() => {
    if (selectedClient?.user_code) {
      loadClientData(selectedClient.user_code);
      loadConversationAndMessages(selectedClient.user_code);
      fetchScheduledReminders(); // Also fetch scheduled reminders
    }
  }, [selectedClient?.user_code]);

  // Fetch conversation by user_code, then fetch latest 20 messages
  const loadConversationAndMessages = async (userCode) => {
    setIsFetchingData(true);
    setError(null);
    // Reset pagination state when switching clients (IMPORTANT: reset firstMessageId immediately)
    setIsLoadingMore(false);
    setHasNewMessages(false);
    setFirstMessageId(null); // Reset immediately to prevent loading messages from previous client
    try {
      const conversation = await ChatConversation.getByUserCode(userCode);
      setConversationId(conversation.id);
      // Fetch latest 20 messages (descending order from API)
      const msgs = await ChatMessage.listByConversation(conversation.id, { limit: 20 });
      // Reverse to show oldest at top, newest at bottom
      const reversedMsgs = filterValidMessages(msgs.reverse());
      setMessages(reversedMsgs);
      // Set firstMessageId to the oldest message (first in reversed array)
      setFirstMessageId(reversedMsgs.length > 0 ? reversedMsgs[0].id : null);
      setHasMoreMessages(msgs.length === 20);
      
      // Ensure scroll to bottom after loading messages
      setTimeout(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'auto' });
        setUserScrollPosition('bottom');
        setHasNewMessages(false);
      }, 300);
    } catch (err) {
      console.error("Error loading conversation and messages:", err);
      // Don't show error in chat UI - just log it
      // The empty messages state will show "client hasn't started a chat yet"
      setMessages([]);
      setConversationId(null);
      setHasMoreMessages(false);
    } finally {
      setIsFetchingData(false);
    }
  };


  const handleClientSelect = (userCode) => {
    // Client selection is now handled globally through ClientContext
    // This function is kept for compatibility but no longer needed
    console.log('Client selection is now handled globally');
  };

  const loadClientData = async (userCode) => {
    if (!userCode) return;

    setIsFetchingData(true);
    setError(null);

    try {
      console.log("Loading client data for user_code:", userCode);

      // Get meal plan data from meal_plans_and_schemas table
      let mealPlan = null;
      try {
        mealPlan = await ChatUser.getMealPlanByUserCode(userCode);
        setMealPlanData(mealPlan);
      } catch (mealPlanError) {
        console.warn('No meal plan found for user:', userCode, mealPlanError);
        setMealPlanData(null);
      }

      console.log("Meal plan data loaded:", mealPlan);

      // Create a new temporary chat for this client (in memory only)
      const newChat = {
        id: `temp-${userCode}-${Date.now()}`,
        user_code: userCode,
        messages: []
      };
      setSelectedChat(newChat);
      console.log("Created temporary chat for user:", userCode);
    } catch (error) {
      console.error("Error loading client data:", error);
      // Don't show error in chat UI - just log it
      // The empty messages state will show "client hasn't started a chat yet"
    } finally {
      setIsFetchingData(false);
    }
  };

  // When sending a message, after success, reload the latest 20 messages
  const handleSend = async () => {
    if ((!message.trim() && !imageFile) || !selectedClient || !conversationId) return;

    setIsLoading(true);
    try {
      // Check if current user is a dietitian (has dietitian_id)
      const isDietitian = currentDietitian?.id && clientId;
      
      if (isDietitian) {
        // Dietitian is sending a message - send directly to new queue
        console.log('👨‍⚕️ Dietitian sending message directly...');
        
        // Handle file upload if selected (for dietitian messages)
        let fileUrl = null;
        let fileType = null;
        let fileAttachments = null;
        
        if (imageFile instanceof File) {
          try {
            console.log('📤 Uploading file to Supabase Storage...');
            const uploadResult = await uploadFile(
              imageFile,
              'chat',
              'users-chat-uploads',
              { user_code: selectedClient.user_code }
            );
            
            if (uploadResult.error) {
              throw new Error(uploadResult.error);
            }
            
            fileUrl = uploadResult.url;
            fileType = getFileCategory(imageFile.type);
            
            fileAttachments = { 
              file_url: fileUrl,
              file_type: fileType,
              file_name: imageFile.name,
              file_size: imageFile.size,
              mime_type: imageFile.type
            };
            
            console.log('✅ File uploaded to storage:', fileUrl);
          } catch (uploadError) {
            console.error("Error uploading file:", uploadError);
            setError(translations.failedToUpload || 'Failed to upload file');
            showToast(`❌ ${translations.failedToUpload || 'Failed to upload file'}`, 'error');
            setIsLoading(false);
            return;
          }
        }
        
        // Validate scheduling if enabled
        let scheduledForTimestamp = null;
        if (isScheduled) {
          if (!scheduledDate || !scheduledTime) {
            setError(translations.pleaseSelectDateAndTime || 'Please select both date and time for scheduled message');
            setIsLoading(false);
            return;
          }
          
          // Combine date and time into ISO timestamp
          const scheduleDateTime = new Date(`${scheduledDate}T${scheduledTime}`);
          
          // Validate that scheduled time is in the future
          if (scheduleDateTime <= new Date()) {
            setError(translations.scheduledTimeMustBeFuture || 'Scheduled time must be in the future');
            setIsLoading(false);
            return;
          }
          
          scheduledForTimestamp = scheduleDateTime.toISOString();
          console.log('📅 Scheduling message for:', scheduledForTimestamp);
          
          // Insert into scheduled_reminders table
          try {
            // Get client data including phone_number and telegram_chat_id
            const clientData = await ChatUser.get(selectedClient.user_code, { fields: 'phone_number,telegram_chat_id' });
            
            if (!clientData) {
              console.error('Error fetching client data');
              throw new Error('Failed to fetch client data');
            }
            
            // Determine channel based on telegram_chat_id
            const channel = clientData.telegram_chat_id ? 'telegram' : 'whatsapp';
            
            // Get active meal plan ID from meal_plans_and_schemas
            const mealPlan = await ChatUser.getMealPlanByUserCode(selectedClient.user_code);
            
            let planId = null;
            if (!mealPlan) {
              console.warn('No active meal plan found');
            } else {
              planId = mealPlan.id;
            }
            
            // Prepare media attachments if file is attached
            let mediaAttachments = [];
            if (fileAttachments) {
              mediaAttachments = [{
                type: fileAttachments.file_type === 'image' ? 'photo' : 
                      fileAttachments.file_type === 'video' ? 'video' : 'link',
                url: fileAttachments.file_url,
                caption: fileAttachments.file_name || null
              }];
            }
            
            // Insert into scheduled_reminders table
            const scheduledReminder = await ScheduledReminders.create({
              message_type: 'scheduled',
              topic: 'chat_message_scheduled',
              scheduled_date: scheduledDate,
              scheduled_time: scheduledTime,
              context: message,
              status: 'pending',
              priority: 'high',
              user_id: currentDietitian.id, // Required for RLS policy
              user_code: selectedClient.user_code,
              phone_number: clientData.phone_number,
              channel: channel,
              plan_type: null, // Regular scheduled messages are not tied to a plan
              plan_id: null,
              week_number: null,
              is_active: true,
              media_attachments: mediaAttachments.length > 0 ? mediaAttachments : null,
              metadata: {
                conversation_id: conversationId,
                dietitian_id: currentDietitian.id,
                client_id: clientId,
                message_type: messageType,
                isSystemReminder: messageType === 'system_reminder'
              }
            });
            
            console.log('✅ Scheduled reminder added to scheduled_reminders table:', scheduledReminder);
            
            // Refresh scheduled reminders list if dialog is open
            if (showRemindersDialog) {
              await fetchScheduledReminders();
            }
          } catch (scheduledError) {
            console.error('Error creating scheduled reminder:', scheduledError);
            setError('Failed to schedule message. Please try again.');
            showToast(`❌ Failed to schedule message: ${scheduledError.message}`, 'error');
            setIsLoading(false);
            return;
          }
        }
        
        let queueData;
        let tempMessage;
        
        if (messageType === 'system_reminder') {
          // System reminder message - no dietitian name
          queueData = {
            conversation_id: conversationId,
            client_id: clientId,
            dietitian_id: currentDietitian.id,
            user_code: selectedClient.user_code,
            content: message,
            role: 'assistant',
            priority: 1,
            isSystemReminder: true,
            scheduled_for: scheduledForTimestamp,
            attachments: fileAttachments
          };
          
          tempMessage = {
            id: `temp-${Date.now()}`,
            role: 'assistant',
            content: message,
            conversation_id: conversationId,
            created_at: scheduledForTimestamp || new Date().toISOString(),
            isSystemReminder: true, // Flag to identify system reminder messages
            attachments: fileAttachments
          };
        } else {
          // Regular dietitian message with name
          const getProfessionalDietitianName = (user) => {
            if (!user) return 'Dietitian';

            // Get full name from metadata
            const fullName = user?.user_metadata?.full_name || user?.user_metadata?.name;

            if (fullName) {
              // Use first name only for more professional, personal feel
              const firstName = fullName.split(' ')[0];
              // Add professional title if available in metadata
              const title = user?.user_metadata?.title || user?.user_metadata?.professional_title;
              return title ? `${title} ${firstName}` : firstName;
            }

            // Fallback to email username with professional formatting
            const emailUsername = user?.email?.split('@')[0];
            if (emailUsername) {
              return emailUsername.charAt(0).toUpperCase() + emailUsername.slice(1);
            }

            return 'Dietitian';
          };

          const dietitianName = getProfessionalDietitianName(currentDietitian);
          queueData = {
            conversation_id: conversationId,
            client_id: clientId,
            dietitian_id: currentDietitian.id,
            user_code: selectedClient.user_code,
            content: `${dietitianName}: ${message}`,
            role: 'assistant',
            priority: 1,
            scheduled_for: scheduledForTimestamp,
            attachments: fileAttachments
          };
          
          tempMessage = {
            id: `temp-${Date.now()}`,
            role: 'assistant',
            content: `${dietitianName}: ${message}`,
            conversation_id: conversationId,
            created_at: scheduledForTimestamp || new Date().toISOString(),
            isDietitianMessage: true, // Flag to identify dietitian messages for special styling
            attachments: fileAttachments
          };
        }
        
        // Send message via external API - don't store in message queue or chat_messages
        await addToUserMessageQueue(queueData);
        console.log(`✅ ${messageType === 'system_reminder' ? 'System reminder' : 'Dietitian'} message sent via external API`);
        
        // Only update local state if message is immediate (not scheduled)
        if (!isScheduled) {
          setMessages(prev => [tempMessage, ...prev]);
        }
        
        // Clear form
        setMessage('');
        setImageFile(null);
        setIsScheduled(false);
        setScheduledDate('');
        setScheduledTime('');
        if (fileInputRef.current) fileInputRef.current.value = '';
        
        // Always scroll to bottom after sending message (only if immediate)
        if (!isScheduled) {
          setTimeout(() => {
            chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
            setUserScrollPosition('bottom');
            setHasNewMessages(false);
          }, 100);
        }
        
        // Show success toast
        if (isScheduled) {
          const scheduleDate = new Date(scheduledForTimestamp);
          const scheduledMessage = messageType === 'system_reminder' 
            ? (translations.systemReminderScheduledFor || 'System reminder scheduled for')
            : (translations.messageScheduledFor || 'Message scheduled for');
          showToast(`📅 ${scheduledMessage} ${scheduleDate.toLocaleString()} ${translations.to || 'to'} ${selectedClient.full_name}!`, 'success');
        } else {
          showToast(`✅ ${messageType === 'system_reminder' ? 'System reminder' : 'Message'} sent to ${selectedClient.full_name}!`, 'success');
        }
        
        console.log(`✅ ${messageType === 'system_reminder' ? 'System reminder' : 'Dietitian'} message ${isScheduled ? 'scheduled' : 'sent'} successfully`);
        return;
      }

      // Regular user message flow - just store the message
      // Create the user message object
      let userMessage = { 
        role: 'user', 
        content: message,
        conversation_id: conversationId,
        created_at: new Date().toISOString()
      };

      let fileUrl = null;
      let fileType = null;
      // Handle file upload if selected
      if (imageFile instanceof File) {
        try {
          console.log('📤 Uploading file to Supabase Storage...');
          const uploadResult = await uploadFile(
            imageFile,
            'chat',
            'users-chat-uploads',
            { user_code: selectedClient.user_code }
          );
          
          if (uploadResult.error) {
            throw new Error(uploadResult.error);
          }
          
          fileUrl = uploadResult.url;
          fileType = getFileCategory(imageFile.type);
          
          userMessage.attachments = { 
            file_url: fileUrl,
            file_type: fileType,
            file_name: imageFile.name,
            file_size: imageFile.size,
            mime_type: imageFile.type
          };
          
          console.log('✅ File uploaded to storage:', fileUrl);
        } catch (uploadError) {
          console.error("Error uploading file:", uploadError);
          setError(translations.failedToUpload || 'Failed to upload file');
          showToast(`❌ ${translations.failedToUpload || 'Failed to upload file'}`, 'error');
          setIsLoading(false);
          return;
        }
      }

      // Store user message in database
      console.log('💬 Storing user message in database...');
      const storedUserMessage = await ChatMessage.create(userMessage);
      console.log('✅ User message stored:', storedUserMessage);

      // Update local state with the stored message
      setMessages(prev => [storedUserMessage, ...prev]);
      setHasNewMessages(false); // Clear new message indicator when user sends a message

      // Clear form
      setMessage('');
      setImageFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      
      // Always scroll to bottom after sending message
      setTimeout(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        setUserScrollPosition('bottom');
        setHasNewMessages(false);
      }, 100);
      
      // Show success toast
      showToast(`✅ Message sent to ${selectedClient.full_name}!`, 'success');
      
      console.log('✅ Message sent successfully');
    } catch (error) {
      console.error('Error sending message:', error);
      setError(translations.failedToSend || 'Failed to send message');
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      if (file instanceof File) {
        // Validate file before setting
        const validation = validateFile(file);
        if (!validation.valid) {
          setError(validation.error);
          showToast(`❌ ${validation.error}`, 'error');
          if (fileInputRef.current) fileInputRef.current.value = '';
          return;
        }
        
        setImageFile(file);
        console.log('✅ File selected:', {
          name: file.name,
          size: formatFileSize(file.size),
          type: file.type,
          category: getFileCategory(file.type)
        });
      } else {
        console.error("Selected file is not a valid File object.");
        setError("Invalid file selected");
      }
    }
  };
  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    // Update scroll position tracking
    setTimeout(() => {
      setUserScrollPosition('bottom');
      setHasNewMessages(false); // Clear new message indicator when manually scrolling to bottom
    }, 100);
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Function to extract image URLs from message content
  const extractImageFromContent = (content) => {
    if (!content) return { text: content, imageUrl: null };
    
    // Look for image URLs in the content
    const imageUrlRegex = /https?:\/\/[^\s]+\.(jpg|jpeg|png|gif|webp)(\?[^\s]*)?/gi;
    const matches = content.match(imageUrlRegex);
    
    if (matches && matches.length > 0) {
      // Remove the image URL from the text content
      const textWithoutImage = content.replace(imageUrlRegex, '').trim();
      return { text: textWithoutImage, imageUrl: matches[0] };
    }
    
    return { text: content, imageUrl: null };
  };

  // Handle scroll: update isUserAtBottom and auto-load older messages when near top
  // (Logic aligned with ProfilePage: scrollTop <= 50 triggers load more)
  const handleScroll = (e) => {
    const { scrollTop, scrollHeight, clientHeight } = e.target;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    const nearBottom = distanceFromBottom < 100; // Within 100px of bottom
    setIsUserAtBottom(nearBottom);
    setLastScrollTop(scrollTop);

    if (nearBottom) {
      setUserScrollPosition('bottom');
      setHasNewMessages(false);
    } else if (scrollTop <= 50) {
      setUserScrollPosition('top');
      // Auto-load more messages when scrolling to top
      const { hasMoreMessages: hm, isLoadingMore: loading, conversationId: cid, firstMessageId: fid, handleLoadMore: loadMore } = loadMoreStateRef.current;
      if (hm && !loading && cid && fid && typeof loadMore === 'function') {
        console.log('🔄 Auto-loading more messages at top...');
        loadMore();
      }
    } else {
      setUserScrollPosition('middle');
    }
  };

  // Function to format message timestamp
  const formatMessageTime = (timestamp) => {
    if (!timestamp) return translations.justNow || 'Just now';
    
    const messageDate = new Date(timestamp);
    const now = new Date();
    const timeDiff = now.getTime() - messageDate.getTime();
    const isToday = messageDate.toDateString() === now.toDateString();
    const isYesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000).toDateString() === messageDate.toDateString();
    
    // For very recent messages (within last hour), show relative time
    if (timeDiff < 60 * 60 * 1000) { // Less than 1 hour
      const minutes = Math.floor(timeDiff / (60 * 1000));
      if (minutes < 1) return translations.justNow || 'Just now';
      if (minutes < 60) return `${minutes} ${translations.minAgo || 'min ago'}`;
    }
    
    if (isToday) {
      return messageDate.toLocaleTimeString([], { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: false 
      });
    } else if (isYesterday) {
      return `${translations.yesterday || 'Yesterday'} ${messageDate.toLocaleTimeString([], { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: false 
      })}`;
    } else {
      return messageDate.toLocaleDateString([], {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });
    }
  };

  // Function to check if we need to show a date separator
  const shouldShowDateSeparator = (currentMsg, previousMsg) => {
    if (!currentMsg?.created_at || !previousMsg?.created_at) return false;
    
    const currentDate = new Date(currentMsg.created_at).toDateString();
    const previousDate = new Date(previousMsg.created_at).toDateString();
    
    return currentDate !== previousDate;
  };

  // Function to format date separator
  const formatDateSeparator = (timestamp) => {
    if (!timestamp) return '';
    
    const messageDate = new Date(timestamp);
    const now = new Date();
    const isToday = messageDate.toDateString() === now.toDateString();
    const isYesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000).toDateString() === messageDate.toDateString();
    
    if (isToday) {
      return translations.today || 'Today';
    } else if (isYesterday) {
      return translations.yesterday || 'Yesterday';
    } else {
      return messageDate.toLocaleDateString([], {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric'
      });
    }
  };

  // Function to check if message is from dietitian
  const isDietitianMessage = (msg) => {
    // Support both 'message' and 'content' fields
    const messageText = msg.content || msg.message || '';
    // Check if message has dietitian flag or contains dietitian name pattern
    return msg.isDietitianMessage ||
           (msg.role === 'assistant' && messageText && (
             messageText.startsWith('Dr. ') ||
             messageText.match(/^[A-Z][a-z]+: /) // Matches "Name: " pattern
           ));
  };


  // Helper function to normalize data URI with proper MIME type
  const normalizeDataUri = (dataUri, mediaType) => {
    if (!dataUri || !dataUri.startsWith('data:')) {
      return dataUri;
    }
    
    // If it already has a proper MIME type, return as is
    if (dataUri.match(/^data:[a-z]+\/[a-z0-9+-]+;base64,/)) {
      return dataUri;
    }
    
    // Fix data:audio;base64, to have a proper MIME type
    if (mediaType === 'audio' && dataUri.startsWith('data:audio;base64,')) {
      // Try to detect audio format from base64 data
      try {
        const commaIndex = dataUri.indexOf(',');
        if (commaIndex === -1) {
          // No comma found, return as is
          return dataUri;
        }
        
        const base64Data = dataUri.substring(commaIndex + 1);
        if (!base64Data || base64Data.length < 4) {
          // Not enough data, use default
          return dataUri.replace('data:audio;base64,', 'data:audio/ogg;base64,');
        }
        
        // Decode first few bytes to detect format (need at least 4 bytes for header detection)
        const sampleSize = Math.min(100, base64Data.length);
        const binaryString = atob(base64Data.substring(0, sampleSize));
        
        if (binaryString.length < 4) {
          // Not enough decoded data, use default
          return dataUri.replace('data:audio;base64,', 'data:audio/ogg;base64,');
        }
        
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        
        // Check for Opus (OggS header) - most common for WhatsApp audio
        if (bytes.length >= 4 && bytes[0] === 0x4F && bytes[1] === 0x67 && bytes[2] === 0x67 && bytes[3] === 0x53) {
          console.log('✅ Detected Ogg/Opus audio format');
          return dataUri.replace('data:audio;base64,', 'data:audio/ogg;base64,');
        }
        // Check for MP3 (ID3 tag or MPEG header)
        if (bytes.length >= 3 && ((bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) || 
            (bytes[0] === 0xFF && (bytes[1] & 0xE0) === 0xE0))) {
          console.log('✅ Detected MP3 audio format');
          return dataUri.replace('data:audio;base64,', 'data:audio/mpeg;base64,');
        }
        // Check for WAV (RIFF header)
        if (bytes.length >= 4 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) {
          console.log('✅ Detected WAV audio format');
          return dataUri.replace('data:audio;base64,', 'data:audio/wav;base64,');
        }
        // Default to ogg for unknown audio (most compatible, especially for Opus)
        console.log('⚠️ Unknown audio format, defaulting to audio/ogg');
        return dataUri.replace('data:audio;base64,', 'data:audio/ogg;base64,');
      } catch (e) {
        console.warn('⚠️ Failed to detect audio format, using default (audio/ogg):', e);
        // Default to ogg format (most compatible for Opus audio)
        return dataUri.replace('data:audio;base64,', 'data:audio/ogg;base64,');
      }
    }
    
    // Fix data:image;base64, to have a proper MIME type
    if (mediaType === 'image' && dataUri.startsWith('data:image;base64,')) {
      // Default to PNG for images
      return dataUri.replace('data:image;base64,', 'data:image/png;base64,');
    }
    
    return dataUri;
  };

  // Function to render message content with files (images, videos, etc.)
  const renderMessageContent = (msg) => {
    // Support both 'message' (database column) and 'content' (local state) fields
    const messageText = msg.content || msg.message || '';
    
    // Check for base64 image or audio in message column (when topic is 'image' or 'audio')
    const topic = msg.topic;
    const topicLower = topic ? topic.toLowerCase() : '';
    
    // Check if message is from assistant and contains JSON with response_text and whatsapp_buttons
    // For system_reply topic, only show response_text
    let parsedData = null;
    let displayText = messageText;
    let whatsappButtons = null;
    
    if (msg.role === 'assistant' && messageText.trim().startsWith('{')) {
      try {
        parsedData = JSON.parse(messageText);
        // If topic is 'system_reply', extract response_text from nested agent_response JSON
        if (topicLower === 'system_reply') {
          // Check if there's an agent_response field (nested JSON string)
          if (parsedData.agent_response && typeof parsedData.agent_response === 'string') {
            try {
              const innerJson = JSON.parse(parsedData.agent_response);
              if (innerJson.response_text) {
                displayText = innerJson.response_text;
              } else {
                displayText = '';
              }
            } catch (innerError) {
              console.log('Failed to parse agent_response JSON:', innerError);
              displayText = '';
            }
          } else if (parsedData.response_text) {
            // Fallback: check if response_text exists directly in outer JSON
            displayText = parsedData.response_text;
          } else {
            displayText = '';
          }
        } else {
          // For non-system_reply messages, show response_text if available, otherwise show full JSON
          if (parsedData.response_text) {
            displayText = parsedData.response_text;
          }
          if (parsedData.whatsapp_buttons && Array.isArray(parsedData.whatsapp_buttons)) {
            whatsappButtons = parsedData.whatsapp_buttons;
          }
        }
      } catch (e) {
        // Not valid JSON, use original message text
        console.log('Message is not JSON, using original text');
      }
    }
    
    const { text, imageUrl } = extractImageFromContent(displayText);
    const fileUrl = msg.attachments?.file_url || msg.attachments?.image_url; // Support both new and old format
    const fileType = msg.attachments?.file_type || (msg.attachments?.image_url ? 'image' : null);
    const fileName = msg.attachments?.file_name || 'Attached file';
    const hasContentImage = imageUrl;
    const isFromDietitian = isDietitianMessage(msg);

    // Check both message and content columns for base64 data
    const messageData = msg.message || msg.content || '';
    const trimmedMessageData = messageData.trim();
    
    // Check for base64 image (supports: data:image/png;base64, data:image/jpeg;base64, data:image;base64, etc.)
    // Use case-insensitive topic check
    const hasBase64Image = topicLower === 'image' && trimmedMessageData.startsWith('data:image');
    
    // Check for base64 audio (supports: data:audio;base64, data:audio/ogg;base64, data:audio/mpeg;base64, etc.)
    // Use case-insensitive topic check
    const hasBase64Audio = topicLower === 'audio' && trimmedMessageData.startsWith('data:audio');
    
    // Normalize data URIs to have proper MIME types
    const normalizedImageData = hasBase64Image ? normalizeDataUri(trimmedMessageData, 'image') : null;
    const normalizedAudioData = hasBase64Audio ? normalizeDataUri(trimmedMessageData, 'audio') : null;
    
    // Debug logging for troubleshooting
    if (topicLower === 'image' || topicLower === 'audio') {
      console.log('🎨 Base64 media detection:', {
        topic,
        topicLower,
        hasMessage: !!msg.message,
        hasContent: !!msg.content,
        messageLength: trimmedMessageData.length,
        messagePreview: trimmedMessageData.substring(0, 100),
        startsWithDataImage: trimmedMessageData.startsWith('data:image'),
        startsWithDataAudio: trimmedMessageData.startsWith('data:audio'),
        hasBase64Image,
        hasBase64Audio
      });
    }

    return (
      <>
        {/* Show base64 image from message column (when topic is 'image') */}
        {hasBase64Image && (
          <div className="mb-3">
            {normalizedImageData ? (
              <img
                src={normalizedImageData}
                alt="Client image"
                className="rounded-lg max-w-full max-h-64 object-cover shadow-sm border border-gray-200 cursor-pointer hover:opacity-90 transition-opacity duration-200"
                onClick={() => handleImageClick(normalizedImageData)}
                onError={(e) => {
                  console.error('❌ Failed to load base64 image from message:', {
                    topic,
                    originalLength: trimmedMessageData.length,
                    normalizedLength: normalizedImageData.length,
                    originalPreview: trimmedMessageData.substring(0, 100),
                    normalizedPreview: normalizedImageData.substring(0, 100),
                    error: e
                  });
                }}
              />
            ) : (
              <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-700 text-sm">
                Image data not found
              </div>
            )}
          </div>
        )}

        {/* Show base64 audio from message column (when topic is 'audio') */}
        {hasBase64Audio && (
          <div className="mb-3">
            {normalizedAudioData ? (
              <div className="flex items-center gap-3 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg shadow-sm hover:shadow-md transition-shadow">
                <div className="flex-shrink-0 w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center shadow-md">
                  <Music className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-700 mb-2 flex items-center gap-2">
                    <span>🎵 Audio Message</span>
                  </div>
                  <audio
                    src={normalizedAudioData}
                    controls
                    className="w-full h-10"
                    preload="metadata"
                    style={{ 
                      outline: 'none',
                      borderRadius: '8px'
                    }}
                    onError={(e) => {
                      console.error('❌ Failed to load base64 audio from message:', {
                        topic,
                        originalLength: trimmedMessageData.length,
                        normalizedLength: normalizedAudioData.length,
                        originalPreview: trimmedMessageData.substring(0, 100),
                        normalizedPreview: normalizedAudioData.substring(0, 100),
                        error: e
                      });
                    }}
                    onLoadedMetadata={(e) => {
                      console.log('✅ Audio loaded successfully:', {
                        duration: e.target.duration,
                        readyState: e.target.readyState,
                        format: normalizedAudioData.substring(5, normalizedAudioData.indexOf(';'))
                      });
                    }}
                    onCanPlay={(e) => {
                      console.log('✅ Audio can play:', {
                        readyState: e.target.readyState
                      });
                    }}
                  >
                    Your browser does not support the audio tag.
                  </audio>
                </div>
              </div>
            ) : (
              <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-700 text-sm">
                Audio data not found
              </div>
            )}
          </div>
        )}

        {/* Show file attachment (image, video, etc.) */}
        {fileUrl && fileType === 'image' && (
          <div className="mb-3">
            <img
              src={fileUrl}
              alt={fileName}
              className="rounded-lg max-w-full max-h-64 object-cover shadow-sm border border-gray-200 cursor-pointer hover:opacity-90 transition-opacity duration-200"
              onClick={() => handleImageClick(fileUrl)}
              onError={(e) => {
                e.target.style.display = 'none';
                console.error('Failed to load image:', fileUrl);
              }}
            />
          </div>
        )}

        {/* Show video attachment */}
        {fileUrl && fileType === 'video' && (
          <div className="mb-3">
            <video
              src={fileUrl}
              controls
              className="rounded-lg max-w-full max-h-64 shadow-sm border border-gray-200"
              onError={(e) => {
                e.target.style.display = 'none';
                console.error('Failed to load video:', fileUrl);
              }}
            >
              Your browser does not support the video tag.
            </video>
          </div>
        )}

        {/* Show audio attachment */}
        {fileUrl && fileType === 'audio' && (
          <div className="mb-3">
            <audio
              src={fileUrl}
              controls
              className="w-full max-w-md"
              onError={(e) => {
                e.target.style.display = 'none';
                console.error('Failed to load audio:', fileUrl);
              }}
            >
              Your browser does not support the audio tag.
            </audio>
          </div>
        )}

        {/* Show document/other file types */}
        {fileUrl && !['image', 'video', 'audio'].includes(fileType) && (
          <div className="mb-3 p-3 bg-slate-100 rounded-lg border border-slate-200">
            <a
              href={fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-blue-600 hover:text-blue-800 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span className="font-medium">{fileName}</span>
            </a>
          </div>
        )}

        {/* Show image from content (legacy support) */}
        {hasContentImage && !fileUrl && (
          <div className="mb-3">
            <img
              src={hasContentImage}
              alt="Message image"
              className="rounded-lg max-w-full max-h-64 object-cover shadow-sm border border-gray-200 cursor-pointer hover:opacity-90 transition-opacity duration-200"
              onClick={() => handleImageClick(hasContentImage)}
              onError={(e) => {
                e.target.style.display = 'none';
                console.error('Failed to load content image:', hasContentImage);
              }}
            />
          </div>
        )}

        {/* Show text content with different formatting based on message type */}
        {/* Show text normally if it exists and there's no base64 media */}
        {/* For base64 media messages, only show text if it's different from the base64 data (caption) */}
        {/* For regular messages (not base64 media), always show text if it exists */}
        {text && text.trim() && 
         !text.startsWith('data:image') && !text.startsWith('data:audio') && 
         ((!hasBase64Image && !hasBase64Audio) || (text !== trimmedMessageData)) && (
          isFromDietitian ? (
            <div className="space-y-1">
              {/* Extract dietitian name and message content */}
              {(() => {
                const colonIndex = text.indexOf(': ');
                if (colonIndex !== -1) {
                  const dietitianName = text.substring(0, colonIndex);
                  const messageContent = text.substring(colonIndex + 2);

                  return (
                    <>
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-6 h-6 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-full flex items-center justify-center shadow-sm">
                          <div className="w-2 h-2 bg-white rounded-full"></div>
                        </div>
                        <span className="text-sm font-semibold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-lg">
                          {dietitianName}
                        </span>
                      </div>
                      <div className="whitespace-pre-wrap text-slate-800 leading-relaxed pl-8 border-l-2 border-emerald-200 text-sm">
                        {messageContent}
                      </div>
                    </>
                  );
                } else {
                  // Fallback if no colon found
                  return <div className="whitespace-pre-wrap text-sm leading-relaxed">{text}</div>;
                }
              })()}
            </div>
          ) : (
            <div className="whitespace-pre-wrap text-sm leading-relaxed">{text}</div>
          )
        )}
        {/* Show text as caption for base64 image/audio messages only if text exists and is not the base64 data itself */}
        {text && text.trim() && (hasBase64Image || hasBase64Audio) && !text.startsWith('data:image') && !text.startsWith('data:audio') && (
          <div className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-600 italic">
            {text}
          </div>
        )}
      </>
    );
  };

  // Removed the blanket scroll-to-bottom useEffect that was causing issues
  // Scroll behavior is now handled specifically in:
  // 1. Auto-refresh intervals (preserves position unless user was at bottom)
  // 2. Manual refresh (preserves position unless user was at bottom) 
  // 3. Send message (always scrolls to bottom for current user)
  // 4. Initial load (scrolls to bottom once)

  const handleLoadMore = async () => {
    if (!conversationId || !firstMessageId || isLoadingMore) return;
    
    // Validate that firstMessageId belongs to current conversation
    // Use functional update to get current messages and verify
    setMessages(currentMessages => {
      const firstMessage = currentMessages.find(m => m.id === firstMessageId);
      if (!firstMessage) {
        console.error('❌ Could not find first message with ID:', firstMessageId, 'in current messages. Conversation may have changed.');
        setIsLoadingMore(false);
        return currentMessages;
      }
      
      // Verify the message belongs to the current conversation
      if (firstMessage.conversation_id !== conversationId) {
        console.error('❌ First message belongs to different conversation. Current:', conversationId, 'Message conversation:', firstMessage.conversation_id);
        console.error('❌ Aborting load more - conversation mismatch detected');
        setIsLoadingMore(false);
        return currentMessages;
      }
      
      // Proceed with loading more messages
      loadMoreMessagesAsync(conversationId, firstMessageId, currentMessages);
      return currentMessages; // Return unchanged for now, will be updated in async function
    });
  };

  const loadMoreMessagesAsync = async (currentConversationId, currentFirstMessageId, currentMessages) => {
    setIsLoadingMore(true);
    
    // Capture scroll position before loading (critical for maintaining position)
    const scrollArea = scrollAreaRef.current;
    const viewport = scrollArea?.querySelector('[data-radix-scroll-area-viewport]');
    const prevScrollTop = viewport ? viewport.scrollTop : 0;
    const prevScrollHeight = viewport ? viewport.scrollHeight : 0;
    
    try {
      // Double-check conversation hasn't changed
      if (currentConversationId !== conversationId) {
        console.warn('⚠️ Conversation changed during load, aborting');
        setIsLoadingMore(false);
        return;
      }
      
      console.log('🔄 Loading more messages...', {
        conversationId: currentConversationId,
        firstMessageId: currentFirstMessageId,
        currentMessageCount: currentMessages.length
      });
      
      // Use the exact same API and logic as initial load
      // Fetch 20 older messages using beforeMessageId (same as initial load but with pagination)
      const olderMsgs = await ChatMessage.listByConversation(currentConversationId, { 
        limit: 20, 
        beforeMessageId: currentFirstMessageId 
      });
      
      // Reverse to show oldest at top, newest at bottom (same as initial load)
      const reversedOlderMsgs = filterValidMessages(olderMsgs.reverse());
      
      if (reversedOlderMsgs.length > 0) {
        // Double-check conversation hasn't changed before updating
        if (currentConversationId !== conversationId) {
          console.warn('⚠️ Conversation changed during load, aborting message update');
          setIsLoadingMore(false);
          return;
        }
        
        // Prepend older messages to the beginning of the array
        setMessages(prev => {
          // Verify all existing messages belong to current conversation
          const invalidMessages = prev.filter(m => m.conversation_id !== currentConversationId);
          if (invalidMessages.length > 0) {
            console.warn('⚠️ Found messages from different conversation, resetting');
            // Reset to only valid messages
            const validMessages = prev.filter(m => m.conversation_id === currentConversationId);
            if (validMessages.length === 0) {
              // No valid messages, don't add older messages
              setIsLoadingMore(false);
              return prev;
            }
            // Use valid messages as base
            prev = validMessages;
          }
          
          // Create a Set of existing message IDs to avoid duplicates
          const existingIds = new Set(prev.map(m => m.id));
          
          // Filter out messages that already exist AND ensure they belong to current conversation
          const newMessagesToAdd = reversedOlderMsgs.filter(m => 
            !existingIds.has(m.id) && m.conversation_id === currentConversationId
          );
          
          if (newMessagesToAdd.length === 0) {
            console.log('⚠️ All messages already exist, skipping duplicates');
            setHasMoreMessages(olderMsgs.length === 20);
            setIsLoadingMore(false);
            return prev;
          }
          
          // Prepend new messages (oldest first, same order as initial load)
          const newMessages = [...newMessagesToAdd, ...prev];
          
          console.log('✅ Load more completed:', {
            addedCount: newMessagesToAdd.length,
            totalCount: newMessages.length,
            hasMoreMessages: olderMsgs.length === 20
          });
          
          // Update firstMessageId to the oldest message (first in reversed array, same as initial load)
          setFirstMessageId(newMessagesToAdd[0].id);
          setHasMoreMessages(olderMsgs.length === 20);
          
          // Restore scroll position after messages are rendered
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              const currentViewport = scrollAreaRef.current?.querySelector('[data-radix-scroll-area-viewport]');
              if (currentViewport) {
                const newScrollHeight = currentViewport.scrollHeight;
                const heightDifference = newScrollHeight - prevScrollHeight;
                
                if (heightDifference > 0) {
                  // Maintain the same visual position by adjusting scrollTop
                  currentViewport.scrollTop = prevScrollTop + heightDifference;
                }
              }
            });
          });
          
          return newMessages;
        });
      } else {
        console.log('📭 No more messages to load');
        setHasMoreMessages(false);
      }
    } catch (err) {
      console.error('❌ Error loading more messages:', err);
    } finally {
      setIsLoadingMore(false);
    }
  };

  // Keep loadMoreStateRef updated for handleScroll (avoids stale closures when auto-loading at top)
  useEffect(() => {
    loadMoreStateRef.current = {
      hasMoreMessages,
      isLoadingMore,
      conversationId,
      firstMessageId,
      handleLoadMore,
    };
  }, [hasMoreMessages, isLoadingMore, conversationId, firstMessageId, handleLoadMore]);

  if (isFetchingData) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert className="max-w-lg mx-auto mt-8">
        <InfoIcon className="h-4 w-4" />
        <AlertDescription className="flex items-center justify-between">
          <div>{error}</div>
          <Button variant="outline" size="sm" onClick={handleRefresh}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="h-[calc(100vh-6rem)] bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/50">
      <div className="flex flex-col h-full space-y-3 p-4">
        {/* Premium Merged Header Card */}
        {selectedClient && (
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-white/90 to-white/80 backdrop-blur-2xl border border-white/20 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.1)]">
            {/* Animated background elements */}
            <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 via-purple-500/5 to-pink-500/5"></div>
            <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-blue-400/10 to-purple-400/10 rounded-full blur-3xl"></div>
            <div className="absolute bottom-0 left-0 w-96 h-96 bg-gradient-to-tr from-indigo-400/10 to-pink-400/10 rounded-full blur-3xl"></div>
            
            <div className="relative z-10 p-4">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center shadow-lg">
                      <Users className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold bg-gradient-to-r from-slate-800 to-indigo-600 bg-clip-text text-transparent">
                        {translations.chatWith} {selectedClient.full_name}
                      </h2>
                      <p className="text-slate-600 text-sm">
                        {translations.clientCode}: <span className="font-mono bg-slate-100 px-2 py-1 rounded-lg text-xs">{selectedClient.user_code}</span>
                      </p>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {mealPlanData && (
                    <div className="px-3 py-2 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl">
                      <div className="text-sm">
                        <span className="text-slate-600">{translations.dailyCalories}: </span>
                        <span className="font-bold text-blue-800">{mealPlanData.daily_total_calories || translations.notSet}</span>
                      </div>
                    </div>
                  )}
                  
                  {/* Message Type Icons - only show for dietitians */}
                  {currentDietitian?.id && clientId && (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setMessageType('dietitian')}
                        className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-200 ${
                          messageType === 'dietitian'
                            ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-lg'
                            : 'bg-gradient-to-r from-slate-100 to-slate-200 text-slate-600 hover:from-slate-200 hover:to-slate-300'
                        }`}
                        title={translations.dietitianMessage}
                      >
                        <Users className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setMessageType('system_reminder')}
                        className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-200 ${
                          messageType === 'system_reminder'
                            ? 'bg-gradient-to-r from-orange-500 to-red-600 text-white shadow-lg'
                            : 'bg-gradient-to-r from-slate-100 to-slate-200 text-slate-600 hover:from-slate-200 hover:to-slate-300'
                        }`}
                        title={translations.systemReminder}
                      >
                        <MessageSquare className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                  {/* Scheduled Messages Button - only show for dietitians */}
                  {currentDietitian?.id && clientId && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        fetchScheduledReminders();
                        setShowRemindersDialog(true);
                      }}
                      className="px-3 py-2 bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-200 hover:from-purple-100 hover:to-indigo-100 text-purple-700 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300"
                    >
                      <Calendar className="h-4 w-4 mr-2" />
                      {translations.scheduled || 'Scheduled'}
                    </Button>
                  )}
                  
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRefresh}
                    disabled={isRefreshing}
                    className="px-3 py-2 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 hover:from-blue-100 hover:to-indigo-100 text-blue-700 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300"
                  >
                    {isRefreshing ? (
                      <div className="flex items-center gap-2">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                        <span>{translations.refreshing || 'Refreshing...'}</span>
                      </div>
                    ) : (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2" />
                        {translations.refresh || 'Refresh'}
                      </>
                    )}
                  </Button>
                  
                  {lastRefreshTime && (
                    <div className="text-xs text-slate-500 px-2">
                      Last: {lastRefreshTime.toLocaleTimeString()}
                    </div>
                  )}
                  
                 
                
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Premium Chat Area - only show when client is selected */}
        {selectedClient ? (
          <>
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-white/90 to-white/80 backdrop-blur-2xl border border-white/20 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.1)] flex-1 flex flex-col min-h-0">
              {/* Animated background */}
              <div className="absolute inset-0 bg-gradient-to-r from-green-500/5 via-blue-500/5 to-purple-500/5"></div>
              <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-green-400/10 to-blue-400/10 rounded-full blur-3xl"></div>
              
              <div className="relative z-10 flex-1 p-4 overflow-hidden">
                
                <ScrollArea 
                  className="h-full pr-3" 
                  ref={scrollAreaRef}
                >
                  {hasMoreMessages && (
                    <div className="flex justify-center py-3">
                      <Button
                        onClick={handleLoadMore}
                        disabled={isLoadingMore}
                        className={`
                          bg-gradient-to-r from-blue-500 to-indigo-600
                          text-white font-semibold
                          py-2 px-6
                          rounded-xl
                          shadow-lg
                          transition-all duration-300 ease-in-out
                          hover:from-blue-600 hover:to-indigo-700 hover:shadow-xl hover:scale-105
                          focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-opacity-50
                          disabled:opacity-50 disabled:cursor-not-allowed
                        `}
                      >
                        {isLoadingMore ? (
                          <div className="flex items-center gap-2">
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                            {translations.loadingMore || 'Loading more...'}
                          </div>
                        ) : (
                          translations.loadMore || 'Load more'
                        )}
                      </Button>
                    </div>
                  )}
                  {messages.length > 0 ? (
                    messages.map((msg, index) => (
                      <div
                        key={msg.id || index}
                        className={`mb-2 flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                      >
                        <div className="flex flex-col max-w-[85%]">
                          {shouldShowDateSeparator(msg, messages[index - 1]) && (
                            <div className="text-center py-4">
                              <div className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-slate-100 to-slate-200 border border-slate-300 rounded-full shadow-sm">
                                <div className="w-2 h-2 bg-slate-400 rounded-full"></div>
                                <span className="text-slate-600 text-sm font-medium">
                                  {formatDateSeparator(msg.created_at)}
                                </span>
                                <div className="w-2 h-2 bg-slate-400 rounded-full"></div>
                              </div>
                            </div>
                          )}
                          <div
                            className={`rounded-lg px-3 py-2 pb-4 shadow-lg transition-all duration-300 hover:shadow-xl relative ${
                              msg.role === 'user'
                                ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white'
                                : 'bg-gradient-to-r from-slate-50 to-white border border-slate-200 text-slate-800'
                            }`}
                          >
                            <div className="pr-12">
                              {renderMessageContent(msg)}
                            </div>
                            {/* Message Timestamp - positioned inside message box on the right */}
                            <div className={`absolute bottom-1.5 right-2.5 text-[10px] ${
                              msg.role === 'user' ? 'text-emerald-50' : 'text-slate-400'
                            }`}>
                              <span className={`px-1 py-0.5 rounded-md font-mono text-center ${
                                msg.role === 'user' 
                                  ? 'bg-emerald-600/20' 
                                  : 'bg-slate-100/80'
                              }`}>
                                {msg.id?.toString().startsWith('temp-') ? '⏳' : formatMessageTime(msg.created_at)}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-center p-8">
                      <div className="w-16 h-16 bg-gradient-to-br from-slate-200 to-slate-300 rounded-2xl flex items-center justify-center mb-4 shadow-lg">
                        <MessageSquare className="h-8 w-8 text-slate-400" />
                      </div>
                      <h3 className="text-xl font-bold text-slate-700 mb-2">
                        {translations.noMessagesYet || 'No messages yet'}
                      </h3>
                      <p className="text-slate-600 max-w-md">
                        {selectedClient.full_name} {translations.hasNotStartedChat || 'hasn\'t started a chat yet'}
                      </p>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </ScrollArea>
              </div>
            </div>

            {/* Premium Message Input Section */}
            <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-white/90 to-white/80 backdrop-blur-2xl border border-white/20 shadow-lg">
              {/* Animated background */}
              <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/5 via-teal-500/5 to-blue-500/5"></div>
              <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-emerald-400/10 to-teal-400/10 rounded-full blur-2xl"></div>
              
              <div className="relative z-10 p-3">
                {/* Show message when no messages exist */}
                {messages.length === 0 && (
                  <div className="mb-3 p-3 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-lg">
                    <div className="flex items-center gap-2 text-amber-700 text-sm">
                      <div className="w-5 h-5 bg-gradient-to-br from-amber-500 to-orange-600 rounded-full flex items-center justify-center">
                        <MessageSquare className="h-3 w-3 text-white" />
                      </div>
                      <span className="font-medium">
                        {translations.clientMustMessageFirst || 'The client needs to send the first message to start the conversation'}
                      </span>
                    </div>
                  </div>
                )}
                
                {/* Scheduling Options - only show for dietitians */}
                {currentDietitian?.id && clientId && messages.length > 0 && (
                  <div className="mb-3">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => setIsScheduled(!isScheduled)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all duration-200 ${
                          isScheduled
                            ? 'bg-gradient-to-r from-purple-500 to-indigo-600 text-white shadow-lg'
                            : 'bg-gradient-to-r from-slate-100 to-slate-200 text-slate-700 hover:from-slate-200 hover:to-slate-300'
                        }`}
                      >
                        <Clock className="h-4 w-4" />
                        <span className="text-sm font-medium">
                          {isScheduled ? (translations.scheduled || 'Scheduled') : (translations.sendNow || 'Send Now')}
                        </span>
                      </button>
                      
                      {isScheduled && (
                        <div className="flex items-center gap-2 flex-1">
                          <div className="flex items-center gap-2 bg-white/60 backdrop-blur-sm border border-purple-200 rounded-lg px-3 py-2">
                            <Calendar className="h-4 w-4 text-purple-600" />
                            <input
                              type="date"
                              value={scheduledDate}
                              onChange={(e) => setScheduledDate(e.target.value)}
                              min={new Date().toISOString().split('T')[0]}
                              className="text-sm bg-transparent border-none outline-none text-slate-700"
                            />
                          </div>
                          <div className="flex items-center gap-2 bg-white/60 backdrop-blur-sm border border-purple-200 rounded-lg px-3 py-2">
                            <Clock className="h-4 w-4 text-purple-600" />
                            <input
                              type="time"
                              value={scheduledTime}
                              onChange={(e) => setScheduledTime(e.target.value)}
                              className="text-sm bg-transparent border-none outline-none text-slate-700"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                    
                    {isScheduled && scheduledDate && scheduledTime && (
                      <div className="mt-2 p-2 bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-200 rounded-lg">
                        <div className="flex items-center gap-2 text-purple-700 text-xs">
                          <Clock className="h-4 w-4" />
                          <span className="font-medium">
                            {translations.scheduledFor || 'Scheduled for'}: {new Date(`${scheduledDate}T${scheduledTime}`).toLocaleString()}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
                
                <div className="flex gap-3">
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept="image/*,video/*,audio/*,.pdf"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isLoading || messages.length === 0}
                    className={`w-10 h-10 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 hover:from-blue-100 hover:to-indigo-100 rounded-lg shadow-lg hover:shadow-xl transition-all duration-300 ${
                      imageFile ? 'bg-gradient-to-r from-emerald-50 to-teal-50 border-emerald-200 text-emerald-600' : 'text-blue-600'
                    } ${messages.length === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <ImageIcon className="h-4 w-4" />
                  </Button>
                  <Input
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder={
                      messages.length === 0
                        ? (translations.waitingForClientMessage || 'Waiting for client to start conversation...')
                        : (currentDietitian?.id && clientId 
                            ? (messageType === 'system_reminder' 
                                ? `${translations.sendSystemReminder || 'Send system reminder to'} ${selectedClient.full_name}...` 
                                : `${translations.messageClient || 'Message'} ${selectedClient.full_name}...`)
                            : `${translations.messageClient || 'Message'} ${selectedClient.full_name}...`)
                    }
                    disabled={isLoading || messages.length === 0}
                    className={`flex-1 h-10 bg-white/60 backdrop-blur-sm border border-white/20 rounded-lg shadow-lg focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/40 transition-all duration-300 text-sm ${
                      messages.length === 0 ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                  />
                  <Button
                    onClick={handleSend}
                    disabled={(!message.trim() && !imageFile) || isLoading || messages.length === 0 || (isScheduled && (!scheduledDate || !scheduledTime))}
                    className={`w-10 h-10 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white rounded-lg shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105 ${
                      messages.length === 0 ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                  >
                    {isLoading ? (
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                    ) : isScheduled ? (
                      <Clock className="h-4 w-4" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                {imageFile && messages.length > 0 && (
                  <div className="mt-2 p-2 bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-lg">
                    <div className="flex items-center gap-2 text-emerald-700 text-xs">
                      <div className="w-5 h-5 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-md flex items-center justify-center">
                        <ImageIcon className="h-3 w-3 text-white" />
                      </div>
                      <span className="font-medium">{translations.imageSelected || 'Image selected'}: {imageFile.name}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-white/90 to-white/80 backdrop-blur-2xl border border-white/20 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.1)] flex-1 flex flex-col min-h-0">
            {/* Animated background */}
            <div className="absolute inset-0 bg-gradient-to-r from-slate-500/5 via-gray-500/5 to-blue-500/5"></div>
            <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-slate-400/10 to-gray-400/10 rounded-full blur-3xl"></div>
            
            <div className="relative z-10 flex-1 p-8 overflow-hidden">
              <div className="h-full flex flex-col items-center justify-center text-center">
                <div className="w-20 h-20 bg-gradient-to-br from-slate-200 to-slate-300 rounded-2xl flex items-center justify-center mb-6 shadow-lg">
                  <Users className="h-10 w-10 text-slate-400" />
                </div>
                <h3 className="text-2xl font-bold text-slate-700 mb-3">{translations.noClientSelected}</h3>
                <p className="text-slate-600 max-w-md">
                  {translations.selectClientToStart}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Premium Image Modal */}
        <Dialog open={isImageModalOpen} onOpenChange={setIsImageModalOpen}>
          <DialogContent className="max-w-5xl max-h-[90vh] p-0 bg-white/95 backdrop-blur-2xl border border-white/20 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.25)] rounded-3xl [&>button]:hidden">
            <DialogHeader className="p-6 pb-0">
              <div className="flex items-center justify-between">
                <DialogTitle className="text-xl font-bold bg-gradient-to-r from-slate-800 to-blue-600 bg-clip-text text-transparent">
                  {translations.imageViewer || 'Image Viewer'}
                </DialogTitle>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={closeImageModal}
                  className="w-10 h-10 bg-gradient-to-r from-red-50 to-pink-50 hover:from-red-100 hover:to-pink-100 text-red-600 rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300"
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>
            </DialogHeader>
            <div className="p-6 pt-0">
              {currentImageUrl && (
                <div className="flex justify-center">
                  <img
                    src={currentImageUrl}
                    alt="Full size image"
                    className="max-w-full max-h-[70vh] object-contain rounded-2xl shadow-2xl border border-white/20"
                    onError={(e) => {
                      e.target.style.display = 'none';
                      console.error('Failed to load modal image:', currentImageUrl);
                    }}
                  />
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
      
      {/* Success Toast Notification */}
      {showSuccessToast && (
        <div className="fixed top-4 right-4 z-50 animate-in slide-in-from-right-2 duration-300">
          <div className={`
            flex items-center gap-3 p-4 rounded-xl shadow-2xl border-2 backdrop-blur-xl
            ${toastType === 'success' 
              ? 'bg-gradient-to-r from-green-50 to-emerald-50 border-green-200 text-green-800' 
              : 'bg-gradient-to-r from-red-50 to-pink-50 border-red-200 text-red-800'
            }
          `}>
            <div className={`
              w-8 h-8 rounded-full flex items-center justify-center
              ${toastType === 'success' 
                ? 'bg-gradient-to-r from-green-500 to-emerald-600' 
                : 'bg-gradient-to-r from-red-500 to-pink-600'
              }
            `}>
              {toastType === 'success' ? (
                <CheckCircle className="w-5 h-5 text-white" />
              ) : (
                <X className="w-5 h-5 text-white" />
              )}
            </div>
            <div className="flex-1">
              <p className="font-semibold text-sm">{toastMessage}</p>
            </div>
            <button
              onClick={() => setShowSuccessToast(false)}
              className={`
                w-6 h-6 rounded-full flex items-center justify-center transition-colors
                ${toastType === 'success' 
                  ? 'hover:bg-green-200 text-green-600' 
                  : 'hover:bg-red-200 text-red-600'
                }
              `}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Scheduled Reminders Dialog */}
      <Dialog open={showRemindersDialog} onOpenChange={setShowRemindersDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              {translations.scheduledMessages || 'Scheduled Messages'}
            </DialogTitle>
          </DialogHeader>
          
          {editingReminder ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">{translations.scheduledMessageDate || 'Date'}</label>
                <Input
                  type="date"
                  value={editReminderDate}
                  onChange={(e) => setEditReminderDate(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">{translations.scheduledMessageTime || 'Time'}</label>
                <Input
                  type="time"
                  value={editReminderTime}
                  onChange={(e) => setEditReminderTime(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">{translations.scheduledMessageContent || 'Message'}</label>
                <Textarea
                  className="min-h-[100px]"
                  value={editReminderContext}
                  onChange={(e) => setEditReminderContext(e.target.value)}
                  placeholder={translations.enterMessageContent || 'Enter message content...'}
                />
              </div>
              <div className="flex gap-2 justify-end">
                <Button
                  variant="outline"
                  onClick={() => {
                    setEditingReminder(null);
                    setEditReminderDate('');
                    setEditReminderTime('');
                    setEditReminderContext('');
                  }}
                >
                  {translations.cancel || 'Cancel'}
                </Button>
                <Button onClick={saveEditedReminder}>
                  {translations.saveChanges || 'Save Changes'}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {scheduledReminders.length === 0 ? (
                <div className="text-center py-8 text-slate-500">
                  <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>{translations.noScheduledMessages || 'No scheduled messages'}</p>
                </div>
              ) : (
                <>
                  {/* Regular Scheduled Messages Section */}
                  {scheduledReminders.filter(r => r.plan_type !== 'meal_plan' && r.plan_type !== 'training_plan').length > 0 && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 pb-2 border-b-2 border-purple-200">
                        <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-pink-600 rounded-lg flex items-center justify-center shadow-sm">
                          <MessageSquare className="h-4 w-4 text-white" />
                        </div>
                        <h3 className="font-semibold text-slate-700">
                          {translations.scheduledMessages || 'Scheduled Messages'}
                        </h3>
                        <span className="ml-auto px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs font-medium">
                          {scheduledReminders.filter(r => r.plan_type !== 'meal_plan' && r.plan_type !== 'training_plan').length}
                        </span>
                      </div>
                      <div className="space-y-2 pl-2">
                        {scheduledReminders
                          .filter(r => r.plan_type !== 'meal_plan' && r.plan_type !== 'training_plan')
                          .map((reminder) => (
                            <div
                              key={reminder.id}
                              className="p-4 border rounded-lg bg-gradient-to-r from-purple-50/50 to-pink-50/50 hover:shadow-md transition-shadow border-purple-200/50"
                            >
                              <div className="flex items-start justify-between gap-4">
                                <div className="flex-1 space-y-2">
                                  <div className="flex items-center gap-2">
                                    <Clock className="h-4 w-4 text-purple-600" />
                                    <span className="font-medium">
                                      {new Date(`${reminder.scheduled_date}T${reminder.scheduled_time}`).toLocaleString()}
                                    </span>
                                    {reminder.week_number && (
                                      <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs font-medium">
                                        {translations.week || 'Week'} {reminder.week_number}
                                      </span>
                                    )}
                                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                                      reminder.status === 'pending' 
                                        ? 'bg-yellow-100 text-yellow-700' 
                                        : 'bg-green-100 text-green-700'
                                    }`}>
                                      {reminder.status}
                                    </span>
                                  </div>
                                  <p className="text-slate-700 text-sm">{reminder.context}</p>
                                  {reminder.topic && (
                                    <p className="text-xs text-slate-500">{translations.topic || 'Topic'}: {reminder.topic}</p>
                                  )}
                                </div>
                                <div className="flex gap-2">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => openEditReminder(reminder)}
                                    className="h-8 w-8 p-0"
                                    title={translations.edit || 'Edit'}
                                  >
                                    <Edit className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => deleteScheduledReminder(reminder.id)}
                                    className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                                    title={translations.delete || 'Delete'}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}

                  {/* Meal Plan Reminders Section */}
                  {scheduledReminders.filter(r => r.plan_type === 'meal_plan').length > 0 && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 pb-2 border-b-2 border-orange-200">
                        <div className="w-8 h-8 bg-gradient-to-br from-orange-500 to-amber-600 rounded-lg flex items-center justify-center shadow-sm">
                          <UtensilsCrossed className="h-4 w-4 text-white" />
                        </div>
                        <h3 className="font-semibold text-slate-700">
                          {translations.mealPlanReminders || 'Meal Plan Reminders'}
                        </h3>
                        <span className="ml-auto px-2 py-1 bg-orange-100 text-orange-700 rounded text-xs font-medium">
                          {scheduledReminders.filter(r => r.plan_type === 'meal_plan').length}
                        </span>
                      </div>
                      <div className="space-y-2 pl-2">
                        {scheduledReminders
                          .filter(r => r.plan_type === 'meal_plan')
                          .map((reminder) => (
                            <div
                              key={reminder.id}
                              className="p-4 border rounded-lg bg-gradient-to-r from-orange-50/50 to-amber-50/50 hover:shadow-md transition-shadow border-orange-200/50"
                            >
                              <div className="flex items-start justify-between gap-4">
                                <div className="flex-1 space-y-2">
                                  <div className="flex items-center gap-2">
                                    <Clock className="h-4 w-4 text-orange-600" />
                                    <span className="font-medium">
                                      {new Date(`${reminder.scheduled_date}T${reminder.scheduled_time}`).toLocaleString()}
                                    </span>
                                    {reminder.week_number && (
                                      <span className="px-2 py-1 bg-orange-100 text-orange-700 rounded text-xs font-medium">
                                        {translations.week || 'Week'} {reminder.week_number}
                                      </span>
                                    )}
                                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                                      reminder.status === 'pending' 
                                        ? 'bg-yellow-100 text-yellow-700' 
                                        : 'bg-green-100 text-green-700'
                                    }`}>
                                      {reminder.status}
                                    </span>
                                  </div>
                                  <p className="text-slate-700 text-sm">{reminder.context}</p>
                                  {reminder.topic && (
                                    <p className="text-xs text-slate-500">{translations.topic || 'Topic'}: {reminder.topic}</p>
                                  )}
                                </div>
                                <div className="flex gap-2">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => openEditReminder(reminder)}
                                    className="h-8 w-8 p-0"
                                    title={translations.edit || 'Edit'}
                                  >
                                    <Edit className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => deleteScheduledReminder(reminder.id)}
                                    className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                                    title={translations.delete || 'Delete'}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}

                  {/* Training Plan Reminders Section */}
                  {scheduledReminders.filter(r => r.plan_type === 'training_plan').length > 0 && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 pb-2 border-b-2 border-blue-200">
                        <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center shadow-sm">
                          <Dumbbell className="h-4 w-4 text-white" />
                        </div>
                        <h3 className="font-semibold text-slate-700">
                          {translations.trainingPlanReminders || 'Training Plan Reminders'}
                        </h3>
                        <span className="ml-auto px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-medium">
                          {scheduledReminders.filter(r => r.plan_type === 'training_plan').length}
                        </span>
                      </div>
                      <div className="space-y-2 pl-2">
                        {scheduledReminders
                          .filter(r => r.plan_type === 'training_plan')
                          .map((reminder) => (
                            <div
                              key={reminder.id}
                              className="p-4 border rounded-lg bg-gradient-to-r from-blue-50/50 to-indigo-50/50 hover:shadow-md transition-shadow border-blue-200/50"
                            >
                              <div className="flex items-start justify-between gap-4">
                                <div className="flex-1 space-y-2">
                                  <div className="flex items-center gap-2">
                                    <Clock className="h-4 w-4 text-blue-600" />
                                    <span className="font-medium">
                                      {new Date(`${reminder.scheduled_date}T${reminder.scheduled_time}`).toLocaleString()}
                                    </span>
                                    {reminder.week_number && (
                                      <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-medium">
                                        {translations.week || 'Week'} {reminder.week_number}
                                      </span>
                                    )}
                                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                                      reminder.status === 'pending' 
                                        ? 'bg-yellow-100 text-yellow-700' 
                                        : 'bg-green-100 text-green-700'
                                    }`}>
                                      {reminder.status}
                                    </span>
                                  </div>
                                  <p className="text-slate-700 text-sm">{reminder.context}</p>
                                  {reminder.topic && (
                                    <p className="text-xs text-slate-500">{translations.topic || 'Topic'}: {reminder.topic}</p>
                                  )}
                                </div>
                                <div className="flex gap-2">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => openEditReminder(reminder)}
                                    className="h-8 w-8 p-0"
                                    title={translations.edit || 'Edit'}
                                  >
                                    <Edit className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => deleteScheduledReminder(reminder.id)}
                                    className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                                    title={translations.delete || 'Delete'}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}