import React, { useState, useEffect, useRef } from 'react';
import { ChatUser, ChatMessage, ChatConversation } from '@/api/entities';
import { Menu } from '@/api/entities';
import { Client } from '@/api/entities';
import { User } from '@/api/entities';
import { InvokeLLM, UploadFile } from '@/api/integrations';
import { useLanguage } from '@/contexts/LanguageContext';
import { useClient } from '@/contexts/ClientContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Image as ImageIcon, Send, Loader2, MessageSquare, InfoIcon, RefreshCw, Users, X, CheckCircle } from 'lucide-react';
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/lib/supabase';

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
  
  // Use refs to store intervals to prevent recreation issues
  const autoRefreshIntervalRef = useRef(null);
  const simpleRefreshIntervalRef = useRef(null);

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
        const { data: client, error } = await supabase
          .from('chat_users')
          .select('id')
          .eq('user_code', selectedClient.user_code)
          .single();
        
        if (error) {
          console.error('Error getting client ID:', error);
          return;
        }
        
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
        const reversedMessages = latestMessages.reverse();
        
        if (reversedMessages.length > messages.length) {
          console.log(`🔄 Simple auto-refresh: New messages detected! Old: ${messages.length}, New: ${reversedMessages.length}`);
          setMessages(reversedMessages);
          setFirstMessageId(reversedMessages.length > 0 ? reversedMessages[0].id : null);
          setHasMoreMessages(reversedMessages.length === 20);
          setLastRefreshTime(new Date());
        } else {
          console.log('Simple auto-refresh: No new messages found');
        }
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

  // Aggressive auto-refresh every 5 seconds for testing
  useEffect(() => {
    if (!selectedClient?.user_code || !conversationId) return;

    console.log('🔄 Setting up aggressive 5-second auto-refresh for conversation:', conversationId);

    const aggressiveInterval = setInterval(async () => {
      try {
        console.log('🔄 Aggressive auto-refresh: Checking for new messages...');
        const latestMessages = await ChatMessage.listByConversation(conversationId, { limit: 20 });
        const reversedMessages = latestMessages.reverse();
        
        if (reversedMessages.length > messages.length) {
          console.log(`🔄 Aggressive auto-refresh: New messages detected! Old: ${messages.length}, New: ${reversedMessages.length}`);
          setMessages(reversedMessages);
          setFirstMessageId(reversedMessages.length > 0 ? reversedMessages[0].id : null);
          setHasMoreMessages(reversedMessages.length === 20);
          setLastRefreshTime(new Date());
        } else {
          console.log('Aggressive auto-refresh: No new messages found');
        }
      } catch (error) {
        console.warn('Aggressive auto-refresh failed:', error);
      }
    }, 5000); // 5 seconds

    return () => {
      console.log('🔄 Cleaning up aggressive auto-refresh interval');
      clearInterval(aggressiveInterval);
    };
  }, [selectedClient?.user_code, conversationId, messages.length]);

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

  const toBase64 = file =>
    new Promise(resolve => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result.split(',')[1]);
    });

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

  // Function to add message to the new user_message_queue table
  const addToUserMessageQueue = async (queueData) => {
    try {
      // Determine message type based on role and whether it's from dietitian or AI
      let messageType;
      if (queueData.role === 'user') {
        messageType = 'user_message';
      } else if (queueData.role === 'assistant') {
        // If it has a dietitian_id, it's a dietitian message, otherwise it's AI
        messageType = queueData.dietitian_id ? 'dietitian_message' : 'ai_response';
      } else {
        messageType = 'unknown';
      }

      const { data, error } = await supabase
        .from('user_message_queue')
        .insert({
          user_id: queueData.client_id,
          user_code: queueData.user_code,
          message_type: messageType,
          message_content: queueData.content,
          message_priority: queueData.priority || 5,
          scheduled_for: new Date().toISOString(),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          optimal_delivery_window: { start_hour: 8, end_hour: 20 },
          trigger_type: 'immediate',
          context_data: {
            conversation_id: queueData.conversation_id,
            dietitian_id: queueData.dietitian_id,
            role: queueData.role,
            attachments: queueData.attachments || null
          },
          status: 'pending'
        })
        .select()
        .single();

      if (error) {
        console.error('Error adding to user_message_queue:', error);
        throw error;
      }

      console.log('✅ Message added to user_message_queue:', data);
      return data;
    } catch (error) {
      console.error('Failed to add to user_message_queue:', error);
      throw error;
    }
  };

  // Function to get pending messages from the new user_message_queue table
  const getPendingMessagesFromQueue = async (userCode) => {
    try {
      const { data, error } = await supabase
        .from('user_message_queue')
        .select('*')
        .eq('user_code', userCode)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error getting pending messages from queue:', error);
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('Failed to get pending messages from queue:', error);
      return [];
    }
  };

  const handleRefresh = async () => {
    if (!selectedClient?.user_code || !conversationId) return;
    
    try {
      setIsRefreshing(true);
      console.log('🔄 Manual refresh triggered');
      // Fetch latest messages
      const latestMessages = await ChatMessage.listByConversation(conversationId, { limit: 20 });
      const reversedMessages = latestMessages.reverse();
      
      setMessages(reversedMessages);
      setFirstMessageId(reversedMessages.length > 0 ? reversedMessages[0].id : null);
      setHasMoreMessages(reversedMessages.length === 20);
      setLastRefreshTime(new Date());
      
      console.log('✅ Chat refreshed successfully');
    } catch (error) {
      console.error('Manual refresh failed:', error);
      setError(translations.failedToLoadClientData || 'Failed to refresh chat');
    } finally {
      setIsRefreshing(false);
    }
  };

  // Test function to manually trigger auto-refresh
  const testAutoRefresh = async () => {
    if (!selectedClient?.user_code || !conversationId) return;
    
    try {
      console.log('🧪 Testing auto-refresh manually...');
      const latestMessages = await ChatMessage.listByConversation(conversationId, { limit: 20 });
      const reversedMessages = latestMessages.reverse();
      
      if (reversedMessages.length > messages.length) {
        console.log(`🧪 Test: New messages detected! Old: ${messages.length}, New: ${reversedMessages.length}`);
        setMessages(reversedMessages);
        setFirstMessageId(reversedMessages.length > 0 ? reversedMessages[0].id : null);
        setHasMoreMessages(reversedMessages.length === 20);
        setLastRefreshTime(new Date());
      } else {
        console.log('🧪 Test: No new messages found');
      }
    } catch (error) {
      console.error('Test auto-refresh failed:', error);
    }
  };

  // Function to view message queue (for testing) - updated for new table
  const viewMessageQueue = async () => {
    if (!selectedClient?.user_code) return;
    
    try {
      console.log('📬 Viewing message queue for user:', selectedClient.user_code);
      const pendingMessages = await getPendingMessagesFromQueue(selectedClient.user_code);
      
      if (pendingMessages.length === 0) {
        alert('No pending messages in queue for this user.');
        return;
      }
      
      const queueInfo = pendingMessages.map(msg => 
        `ID: ${msg.id}\nType: ${msg.message_type}\nStatus: ${msg.status}\nContent: ${msg.message_content.substring(0, 100)}...\nScheduled: ${new Date(msg.scheduled_for).toLocaleString()}\nCreated: ${new Date(msg.created_at).toLocaleString()}\n---`
      ).join('\n');
      
      alert(`Message Queue for ${selectedClient.full_name}:\n\n${queueInfo}`);
    } catch (error) {
      console.error('Error viewing message queue:', error);
      setError('Failed to view message queue');
    }
  };

  // Fetch conversation and initial messages when client is selected
  useEffect(() => {
    if (selectedClient?.user_code) {
      loadClientData(selectedClient.user_code);
      loadConversationAndMessages(selectedClient.user_code);
    }
  }, [selectedClient?.user_code]);

  // Fetch conversation by user_code, then fetch latest 20 messages
  const loadConversationAndMessages = async (userCode) => {
    setIsFetchingData(true);
    setError(null);
    try {
      const conversation = await ChatConversation.getByUserCode(userCode);
      setConversationId(conversation.id);
      // Fetch latest 20 messages (descending order)
      const msgs = await ChatMessage.listByConversation(conversation.id, { limit: 20 });
      setMessages(msgs.reverse()); // reverse to show oldest at top
      setFirstMessageId(msgs.length > 0 ? msgs[0].id : null);
      setHasMoreMessages(msgs.length === 20);
    } catch (err) {
      setError(translations.failedToLoadClientData);
      setMessages([]);
      setConversationId(null);
      setHasMoreMessages(false);
    } finally {
      setIsFetchingData(false);
    }
  };

  // Infinite scroll: load more messages when scrolled to top
  const handleScroll = async (e) => {
    if (e.target.scrollTop === 0 && hasMoreMessages && !isLoadingMore && conversationId && firstMessageId) {
      setIsLoadingMore(true);
      try {
        const olderMsgs = await ChatMessage.listByConversation(conversationId, { limit: 20, beforeMessageId: firstMessageId });
        if (olderMsgs.length > 0) {
          setMessages(prev => [...olderMsgs.reverse(), ...prev]);
          setFirstMessageId(olderMsgs[0].id);
          setHasMoreMessages(olderMsgs.length === 20);
        } else {
          setHasMoreMessages(false);
        }
      } catch (err) {
        setError(translations.failedToLoadClientData);
      } finally {
        setIsLoadingMore(false);
      }
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
      setError(translations.failedToLoadClientData);
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
        
        // Add to new user_message_queue table
        const queueData = {
          conversation_id: conversationId,
          client_id: clientId,
          dietitian_id: currentDietitian.id,
          user_code: selectedClient.user_code,
          content: message,
          role: 'assistant',
          priority: 1
        };
        
        await addToUserMessageQueue(queueData);
        console.log('✅ Dietitian message added to new queue');
        
        // Create a temporary message object for local display
        const tempDietitianMessage = {
          id: `temp-${Date.now()}`,
          role: 'assistant',
          content: message,
          conversation_id: conversationId,
          created_at: new Date().toISOString()
        };
        
        // Update local state with the temporary message
        setMessages(prev => [tempDietitianMessage, ...prev]);
        
        // Clear form
        setMessage('');
        setImageFile(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
        
        // Show success toast
        showToast(`✅ Message sent to ${selectedClient.full_name}!`, 'success');
        
        console.log('✅ Dietitian message sent successfully');
        return;
      }

      // Regular user message flow (AI response)
      // Create the user message object
      let userMessage = { 
        role: 'user', 
        content: message,
        conversation_id: conversationId,
        created_at: new Date().toISOString()
      };

      let base64Image = null;
      // Handle image upload if selected
      if (imageFile instanceof File) {
        try {
          base64Image = await toBase64(imageFile);
          userMessage.attachments = { image_url: `data:image/jpeg;base64,${base64Image}` };
        } catch (uploadError) {
          console.error("Error uploading image:", uploadError);
          setError(translations.failedToUpload);
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

      // Prepare chat history for AI prompt (include stored message)
      const chatHistoryForPrompt = [storedUserMessage, ...messages]
        .map((msg) => `${msg.role.toUpperCase()}: ${msg.content}`)
        .join('\n');

      // Prepare comprehensive client profile for AI context
      const clientProfile = {
        name: selectedClient.full_name,
        user_code: selectedClient.user_code,
        // Personal information
        ...(selectedClient.age && { age: selectedClient.age }),
        ...(selectedClient.date_of_birth && { date_of_birth: selectedClient.date_of_birth }),
        ...(selectedClient.gender && { gender: selectedClient.gender }),
        ...(selectedClient.weight_kg && { weight_kg: selectedClient.weight_kg }),
        ...(selectedClient.height_cm && { height_cm: selectedClient.height_cm }),
        ...(selectedClient.user_language && { user_language: selectedClient.user_language }),

        // Health and dietary information
        ...(selectedClient.food_allergies && { food_allergies: selectedClient.food_allergies }),
        ...(selectedClient.food_limitations && { food_limitations: selectedClient.food_limitations }),
        ...(selectedClient.Activity_level && { activity_level: selectedClient.Activity_level }),
        ...(selectedClient.goal && { goal: selectedClient.goal }),

        // Nutrition targets and preferences
        ...(selectedClient.dailyTotalCalories && { daily_total_calories: selectedClient.dailyTotalCalories }),
        ...(selectedClient.number_of_meals && { number_of_meals: selectedClient.number_of_meals }),
        ...(selectedClient.macros && { macros: selectedClient.macros }),
        ...(selectedClient.client_preference && { client_preference: selectedClient.client_preference }),
        ...(selectedClient.recommendations && { recommendations: selectedClient.recommendations }),

        // Chat history from other platforms
        ...(selectedClient.user_context && { user_context: selectedClient.user_context }),

        // Legacy fields for backward compatibility
        ...(selectedClient.height && { height: selectedClient.height }),
        ...(selectedClient.weight && { weight: selectedClient.weight }),
        ...(selectedClient.activity_level && { activity_level: selectedClient.activity_level })
      };

      // Log comprehensive client profile for debugging
      console.log('🧠 Comprehensive client profile being sent to LLM:', JSON.stringify(clientProfile, null, 2));

      // Prepare meal plan context with detailed meal information
      const mealPlanContext = mealPlanData ? {
        meal_plan: mealPlanData.meal_plan,
        daily_total_calories: mealPlanData.daily_total_calories,
        macros_target: mealPlanData.macros_target,
        recommendations: mealPlanData.recommendations,
        dietary_restrictions: mealPlanData.dietary_restrictions,
        // Extract detailed meal information for better AI responses
        meals: mealPlanData.meal_plan?.meals || [],
        totals: mealPlanData.meal_plan?.totals || {},
        note: mealPlanData.meal_plan?.note || ''
      } : null;

      // Prepare AI prompt
      let aiPrompt;
      const instruction = `You are a professional and friendly HEALTHY nutrition coach for BetterChoice.
Your response must be in natural, conversational language. DO NOT output JSON, code, or markdown.
Address the client by their first name: ${selectedClient.full_name.split(' ')[0]}.

**CRITICAL HEALTHY DIETITIAN RULES:**
• You are a HEALTHY nutrition coach - prioritize nutritious, whole foods over processed snacks
• NEVER suggest unhealthy processed snacks (like BISLI, Bamba, chips, candy, cookies, etc.) unless the user EXPLICITLY requests them in their preferences
• For snacks, always suggest healthy options like: fruits, vegetables, nuts, yogurt, cottage cheese, hummus, whole grain crackers, etc.
• Only include unhealthy snacks if the user specifically mentions "likes BISLI", "loves chips", "wants candy" etc. in their client_preferences
• Even then, limit unhealthy snacks to maximum 1-2 times per week, not daily
• Focus on balanced nutrition with whole foods, lean proteins, complex carbohydrates, and healthy fats

IMPORTANT: You have access to the client's current meal plan. You can answer detailed questions about their specific meals, ingredients, nutrition values, and provide personalized advice based on their actual meal plan.

Here is the comprehensive context for your response:

CLIENT PROFILE:
${JSON.stringify(clientProfile, null, 2)}

DIETARY CONSIDERATIONS:
${clientProfile.food_allergies ? `- Food Allergies: ${Array.isArray(clientProfile.food_allergies) ? clientProfile.food_allergies.join(', ') : clientProfile.food_allergies}` : '- No known food allergies'}
${clientProfile.food_limitations ? `- Food Limitations: ${Array.isArray(clientProfile.food_limitations) ? clientProfile.food_limitations.join(', ') : clientProfile.food_limitations}` : '- No specific food limitations'}
${clientProfile.activity_level ? `- Activity Level: ${clientProfile.activity_level}` : ''}
${clientProfile.goal ? `- Health Goal: ${clientProfile.goal}` : ''}

NUTRITION TARGETS:
${clientProfile.daily_total_calories ? `- Daily Calories: ${clientProfile.daily_total_calories} kcal` : ''}
${clientProfile.number_of_meals ? `- Number of Meals: ${clientProfile.number_of_meals}` : ''}
${clientProfile.macros ? `- Macro Targets: ${typeof clientProfile.macros === 'string' ? clientProfile.macros : JSON.stringify(clientProfile.macros)}` : ''}

CHAT HISTORY (most recent messages are last):
${chatHistoryForPrompt}

${clientProfile.user_context ? `
PREVIOUS CHAT HISTORY FROM OTHER PLATFORMS:
${clientProfile.user_context}
` : ''}

CURRENT MEAL PLAN DETAILS:
${mealPlanContext ? `
Your personalized meal plan includes:

DAILY TOTALS:
- Calories: ${mealPlanContext.totals?.calories || 'Not specified'} kcal
- Protein: ${mealPlanContext.totals?.protein || 'Not specified'}g
- Fat: ${mealPlanContext.totals?.fat || 'Not specified'}g
- Carbs: ${mealPlanContext.totals?.carbs || 'Not specified'}g

MEALS:
${mealPlanContext.meals?.map((meal, index) => `
${index + 1}. ${meal.meal}:
   - Main Option: ${meal.main?.meal_title || meal.main?.name || 'Not specified'}
     Calories: ${meal.main?.nutrition?.calories || 'Not specified'} kcal
     Protein: ${meal.main?.nutrition?.protein || 'Not specified'}g
     Fat: ${meal.main?.nutrition?.fat || 'Not specified'}g
     Carbs: ${meal.main?.nutrition?.carbs || 'Not specified'}g
     Ingredients: ${meal.main?.ingredients?.map(ing => `${ing.item} (${ing.household_measure})`).join(', ') || 'Not specified'}
   
   - Alternative Option: ${meal.alternative?.meal_title || meal.alternative?.name || 'Not specified'}
     Calories: ${meal.alternative?.nutrition?.calories || 'Not specified'} kcal
     Protein: ${meal.alternative?.nutrition?.protein || 'Not specified'}g
     Fat: ${meal.alternative?.nutrition?.fat || 'Not specified'}g
     Carbs: ${meal.alternative?.nutrition?.carbs || 'Not specified'}g
     Ingredients: ${meal.alternative?.ingredients?.map(ing => `${ing.item} (${ing.household_measure})`).join(', ') || 'Not specified'}
`).join('\n') || 'No meals specified'}

${mealPlanContext.note ? `NOTES: ${mealPlanContext.note}` : ''}

RECOMMENDATIONS: ${mealPlanContext.recommendations ? JSON.stringify(mealPlanContext.recommendations, null, 2) : 'None specified'}

You can ask me specific questions about any meal, ingredient, nutrition values, or request modifications to your meal plan.
` : 'No meal plan available. I can help you create a personalized meal plan based on your preferences and goals.'}

---
Your task is to respond to the user's message below, taking into account their specific dietary needs, health goals, allergies, limitations, nutrition targets, and their current meal plan. You can provide detailed information about their meals, suggest modifications, explain nutrition values, and answer any questions about their personalized meal plan.
`;

      if (base64Image) {
        aiPrompt = `${instruction}The user has sent an image and a message. Analyze them and provide a helpful response.\nUSER MESSAGE: "${message}"`;
      } else {
        aiPrompt = `${instruction}The user has sent a message. Provide a helpful response.\nUSER MESSAGE: "${message}"`;
      }

      // Default fallback response in case AI fails
      let aiResponse = `Hi ${selectedClient.full_name.split(' ')[0]}! Thank you for your message${base64Image ? ' and the food image' : ''}. \n\n`;

      // Include previous chat context if available
      if (clientProfile.user_context) {
        aiResponse += `I can see from our previous conversations that we've discussed your nutrition journey. I'm here to continue supporting you with your health goals.\n\n`;
      }

      // Include personalized information from client profile
      if (clientProfile.daily_total_calories || clientProfile.macros || clientProfile.goal) {
        aiResponse += `Based on your profile:\n\n`;

        if (clientProfile.daily_total_calories) {
          aiResponse += `• Your daily calorie target: ${clientProfile.daily_total_calories} calories\n`;
        }
        if (clientProfile.macros) {
          const macrosText = typeof clientProfile.macros === 'string' ? clientProfile.macros : JSON.stringify(clientProfile.macros);
          aiResponse += `• Your macro targets: ${macrosText}\n`;
        }
        if (clientProfile.goal) {
          aiResponse += `• Your health goal: ${clientProfile.goal}\n`;
        }
        if (clientProfile.activity_level) {
          aiResponse += `• Your activity level: ${clientProfile.activity_level}\n`;
        }
        if (clientProfile.number_of_meals) {
          aiResponse += `• Your meal plan: ${clientProfile.number_of_meals} meals per day\n`;
        }

        // Add dietary considerations
        if (clientProfile.food_allergies || clientProfile.food_limitations) {
          aiResponse += `\nDietary considerations:\n`;
          if (clientProfile.food_allergies) {
            const allergies = Array.isArray(clientProfile.food_allergies) ? clientProfile.food_allergies.join(', ') : clientProfile.food_allergies;
            aiResponse += `• Allergies: ${allergies}\n`;
          }
          if (clientProfile.food_limitations) {
            const limitations = Array.isArray(clientProfile.food_limitations) ? clientProfile.food_limitations.join(', ') : clientProfile.food_limitations;
            aiResponse += `• Limitations: ${limitations}\n`;
          }
        }
      }

      if (mealPlanContext && mealPlanContext.meals && mealPlanContext.meals.length > 0) {
        aiResponse += `\nYour personalized meal plan includes:\n\n`;

        // Daily totals
        if (mealPlanContext.totals) {
          aiResponse += `📊 Daily Totals:\n`;
          aiResponse += `• Calories: ${mealPlanContext.totals.calories || 'Not specified'} kcal\n`;
          aiResponse += `• Protein: ${mealPlanContext.totals.protein || 'Not specified'}g\n`;
          aiResponse += `• Fat: ${mealPlanContext.totals.fat || 'Not specified'}g\n`;
          aiResponse += `• Carbs: ${mealPlanContext.totals.carbs || 'Not specified'}g\n\n`;
        }

        // Meals overview
        aiResponse += `🍽️ Your Meals:\n`;
        mealPlanContext.meals.forEach((meal, index) => {
          aiResponse += `${index + 1}. ${meal.meal}\n`;
          if (meal.main?.meal_title) {
            aiResponse += `   Main: ${meal.main.meal_title} (${meal.main.nutrition?.calories || 'N/A'} kcal)\n`;
          }
          if (meal.alternative?.meal_title) {
            aiResponse += `   Alternative: ${meal.alternative.meal_title} (${meal.alternative.nutrition?.calories || 'N/A'} kcal)\n`;
          }
        });

        aiResponse += `\nYou can ask me specific questions about any meal, ingredient, or nutrition values in your plan!\n`;
      } else if (mealPlanContext) {
        aiResponse += `\nYour current meal plan details:\n`;
        if (mealPlanContext.daily_total_calories) {
          aiResponse += `• Plan calories: ${mealPlanContext.daily_total_calories} calories\n`;
        }
        if (mealPlanContext.macros_target) {
          aiResponse += `• Plan macro targets: ${JSON.stringify(mealPlanContext.macros_target)}\n`;
        }
        if (mealPlanContext.dietary_restrictions) {
          aiResponse += `• Plan dietary restrictions: ${JSON.stringify(mealPlanContext.dietary_restrictions)}\n`;
        }
        if (mealPlanContext.recommendations) {
          aiResponse += `\nPersonalized recommendations:\n${mealPlanContext.recommendations}\n`;
        }
      } else {
        aiResponse += `\nHere are some general nutrition insights tailored for you:\n\n`;
        aiResponse += `1. Focus on balanced meals with protein, healthy fats, and complex carbohydrates\n`;
        aiResponse += `2. Stay well-hydrated with at least 8 glasses of water daily\n`;
        aiResponse += `3. Eat regular meals to maintain stable energy levels\n`;
        if (clientProfile.goal) {
          aiResponse += `4. Keep your health goal in mind: ${clientProfile.goal}\n`;
        }
      }

      if (base64Image) {
        aiResponse += `\n\nRegarding the food in your image:\n`;
        aiResponse += `- This appears to be a meal you've shared for analysis\n`;
        aiResponse += `- Consider how it fits into your daily nutrition goals\n`;
        aiResponse += `- Feel free to ask specific questions about the nutritional content\n`;
      }

      aiResponse += `\n\nWould you like more specific advice about your meal plan or nutrition goals?`;

      // Try to get AI response, use fallback if it fails
      try {
        const response = await InvokeLLM({
          prompt: aiPrompt,
          add_context_from_internet: false,
          base64Image: base64Image || undefined
        });
        if (response) {
          aiResponse = response;
        }
      } catch (aiError) {
        console.error('Error getting AI response, using fallback:', aiError);
      }

      // Clean up the response to remove any prepended JSON
      if (aiResponse.trim().startsWith('{')) {
        const lastBracketIndex = aiResponse.lastIndexOf('}');
        if (lastBracketIndex !== -1) {
          const potentialJson = aiResponse.substring(0, lastBracketIndex + 1);
          const remainingText = aiResponse.substring(lastBracketIndex + 1).trim();

          try {
            // Only strip the JSON if there is text following it.
            if (remainingText) {
              JSON.parse(potentialJson);
              aiResponse = remainingText;
            }
          } catch (e) {
            // It wasn't valid JSON, so do nothing and keep the original response.
          }
        }
      }

      // Add AI response to new user_message_queue table
      console.log('📬 Adding AI response to new user_message_queue...');
      const queueData = {
        conversation_id: conversationId,
        client_id: clientId, // Add client ID from chat_users table
        dietitian_id: currentDietitian?.id, // Add dietitian ID from auth
        user_code: selectedClient.user_code,
        content: aiResponse,
        role: 'assistant',
        priority: 1
      };
      
      // Validate required fields before adding to queue
      if (!queueData.client_id || !queueData.dietitian_id) {
        console.error('❌ Missing required IDs for queue:', { clientId, dietitianId: currentDietitian?.id });
        setError('Missing required user information for message queue');
        return;
      }
      
      await addToUserMessageQueue(queueData);
      console.log('✅ AI response added to new queue');

      // Create a temporary message object for local display (not stored in database)
      const tempAiMessage = {
        id: `temp-${Date.now()}`,
        role: 'assistant',
        content: aiResponse,
        conversation_id: conversationId,
        created_at: new Date().toISOString(),
        attachments: base64Image ? { image_url: `data:image/jpeg;base64,${base64Image}` } : null
      };

      // Update local state with the temporary AI message
      setMessages(prev => [tempAiMessage, ...prev]);

      // Clear form
      setMessage('');
      setImageFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      
      // Show success toast
      showToast(`✅ AI response sent to ${selectedClient.full_name}!`, 'success');
      
      console.log('✅ Message exchange completed successfully');
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
        setImageFile(file);
      } else {
        console.error("Selected file is not a valid File object.");
      }
    }
  };
  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
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

  // Function to render message content with images
  const renderMessageContent = (msg) => {
    const { text, imageUrl } = extractImageFromContent(msg.content);
    const hasDirectImage = msg.attachments?.image_url;
    const hasContentImage = imageUrl;
    
    return (
      <>
        {/* Show direct image first (from image upload) */}
        {hasDirectImage && (
          <div className="mb-3">
            <img
              src={hasDirectImage}
              alt={translations.uploadedFood || 'Uploaded food image'}
              className="rounded-lg max-w-full max-h-64 object-cover shadow-sm border border-gray-200 cursor-pointer hover:opacity-90 transition-opacity duration-200"
              onClick={() => handleImageClick(hasDirectImage)}
              onError={(e) => {
                e.target.style.display = 'none';
                console.error('Failed to load direct image:', hasDirectImage);
              }}
            />
          </div>
        )}
        
        {/* Show image from content */}
        {hasContentImage && !hasDirectImage && (
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
        
        {/* Show text content */}
        <div className="whitespace-pre-wrap">{text}</div>
      </>
    );
  };

  useEffect(() => {
    // Only scroll to bottom if not loading more (i.e., after initial load or sending)
    if (!isLoadingMore && messages.length > 0) {
      chatEndRef.current?.scrollIntoView({ behavior: 'auto' });
    }
  }, [messages, isLoadingMore]);

  const handleLoadMore = async () => {
    if (!conversationId || !firstMessageId || isLoadingMore) return;
    const scrollArea = scrollAreaRef.current;
    const prevScrollHeight = scrollArea ? scrollArea.scrollHeight : 0;
    setIsLoadingMore(true);
    try {
      const olderMsgs = await ChatMessage.listByConversation(conversationId, { limit: 20, beforeMessageId: firstMessageId });
      if (olderMsgs.length > 0) {
        setMessages(prev => [...olderMsgs, ...prev]);
        setFirstMessageId(olderMsgs[0].id);
        setHasMoreMessages(olderMsgs.length === 20);
      } else {
        setHasMoreMessages(false);
      }
      // After messages update, restore scroll position
      setTimeout(() => {
        if (scrollArea) {
          scrollArea.scrollTop = scrollArea.scrollHeight - prevScrollHeight;
        }
      }, 0);
    } catch (err) {
      setError(translations.failedToLoadClientData);
    } finally {
      setIsLoadingMore(false);
    }
  };

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
    <div className="h-[calc(100vh-8rem)] bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/50">
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
                  <div className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-xl">
                    <div className={`w-2 h-2 rounded-full ${isUserActive ? 'bg-yellow-500' : 'bg-green-500'} ${!isUserActive ? 'animate-pulse' : ''}`}></div>
                    <span className="text-sm font-medium text-green-700">
                      {isUserActive ? 'User Active' : 'Auto-refresh'}
                    </span>
                  </div>
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
                        <span>Refreshing...</span>
                      </div>
                    ) : (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2" />
                        {translations.refresh || 'Refresh'}
                      </>
                    )}
                  </Button>
                  
                  {/* View Queue Button */}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={viewMessageQueue}
                    className="px-3 py-2 bg-gradient-to-r from-orange-50 to-red-50 border border-orange-200 hover:from-orange-100 hover:to-red-100 text-orange-700 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300"
                  >
                    📬 View Queue
                  </Button>
                  
                  {lastRefreshTime && (
                    <div className="text-xs text-slate-500 px-2">
                      Last: {lastRefreshTime.toLocaleTimeString()}
                    </div>
                  )}
                  
                 
                  <div className="p-3 bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-xl shadow-lg">
                    <div className="flex items-center gap-2 text-sm">
                      <div className="w-6 h-6 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-lg flex items-center justify-center">
                        <span className="text-white font-bold text-xs">✓</span>
                      </div>
                      <div>
                        <span className="font-bold text-emerald-800">{translations.selected || 'Selected'}</span>
                      </div>
                    </div>
                  </div>
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
                <ScrollArea className="h-full pr-3" ref={scrollAreaRef}>
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
                            {translations.loadingMore}
                          </div>
                        ) : (
                          translations.loadMore
                        )}
                      </Button>
                    </div>
                  )}
                  {messages.length > 0 ? (
                    messages.map((msg, index) => (
                      <div
                        key={msg.id || index}
                        className={`mb-4 flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`rounded-xl px-4 py-3 max-w-[80%] shadow-lg transition-all duration-300 hover:shadow-xl ${
                            msg.role === 'user'
                              ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white'
                              : 'bg-gradient-to-r from-slate-50 to-white border border-slate-200 text-slate-800'
                          }`}
                        >
                          {renderMessageContent(msg)}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-center p-8">
                      <div className="w-16 h-16 bg-gradient-to-br from-slate-200 to-slate-300 rounded-2xl flex items-center justify-center mb-4 shadow-lg">
                        <MessageSquare className="h-8 w-8 text-slate-400" />
                      </div>
                      <h3 className="text-xl font-bold text-slate-700 mb-2">{translations.startConversation}</h3>
                      <p className="text-slate-600 max-w-md">
                        {translations.chatWith} {selectedClient.full_name} {translations.chatAboutNutrition}
                      </p>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </ScrollArea>
              </div>
            </div>

            {/* Premium Message Input Section */}
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-white/90 to-white/80 backdrop-blur-2xl border border-white/20 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.1)]">
              {/* Animated background */}
              <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/5 via-teal-500/5 to-blue-500/5"></div>
              <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-br from-emerald-400/10 to-teal-400/10 rounded-full blur-3xl"></div>
              
              <div className="relative z-10 p-4">
                <div className="flex gap-3">
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept="image/*"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isLoading}
                    className={`w-12 h-12 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 hover:from-blue-100 hover:to-indigo-100 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 ${
                      imageFile ? 'bg-gradient-to-r from-emerald-50 to-teal-50 border-emerald-200 text-emerald-600' : 'text-blue-600'
                    }`}
                  >
                    <ImageIcon className="h-5 w-5" />
                  </Button>
                  <Input
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder={`${translations.messageClient} ${selectedClient.full_name}...`}
                    disabled={isLoading}
                    className="flex-1 h-12 bg-white/60 backdrop-blur-sm border border-white/20 rounded-xl shadow-lg focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/40 transition-all duration-300"
                  />
                  <Button
                    onClick={handleSend}
                    disabled={(!message.trim() && !imageFile) || isLoading}
                    className="w-12 h-12 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105"
                  >
                    {isLoading ? (
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
                    ) : (
                      <Send className="h-5 w-5" />
                    )}
                  </Button>
                </div>
                {imageFile && (
                  <div className="mt-3 p-2 bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-xl">
                    <div className="flex items-center gap-2 text-emerald-700 text-sm">
                      <div className="w-6 h-6 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-lg flex items-center justify-center">
                        <ImageIcon className="h-3 w-3 text-white" />
                      </div>
                      <span className="font-medium">{translations.imageSelected}: {imageFile.name}</span>
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
          <DialogContent className="max-w-5xl max-h-[90vh] p-0 bg-white/95 backdrop-blur-2xl border border-white/20 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.25)] rounded-3xl">
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
    </div>
  );
}