import React, { useState, useEffect, useRef } from 'react';
import { Chat as ChatEntity } from '@/api/entities';
import { Menu } from '@/api/entities';
import { Client } from '@/api/entities';
import { User } from '@/api/entities';
import { InvokeLLM, UploadFile } from '@/api/integrations';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Image as ImageIcon, Send, Loader2, MessageSquare, InfoIcon, RefreshCw } from 'lucide-react';
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function Chat() {
  const [selectedChat, setSelectedChat] = useState(null);
  const [message, setMessage] = useState('');
  const [client, setClient] = useState(null);
  const [currentMenu, setCurrentMenu] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingData, setIsFetchingData] = useState(true);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);
  const chatEndRef = useRef(null);
  const [imageFile, setImageFile] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const handleRefresh = () => {
    setRefreshKey(prev => prev + 1);
  };

  useEffect(() => {
    loadData();
  }, [refreshKey]);

  useEffect(() => {
    scrollToBottom();
  }, [selectedChat?.messages]);

  const loadData = async () => {
    setIsFetchingData(true);
    setError(null);
    
    try {
      let userData;
 try {
  
  const res = await fetch('/client.json');
  userData = await res.json();
  userData.selectedClientId = userData.id;  } 

catch (err) {
  // fallback for Netlify
  // 👈 simulate selected client
}


      
      if (!userData.selectedClientId) {
        setError("No client selected. Please select a client first.");
        setIsFetchingData(false);
        return;
      }
      
      const clientData = await Client.get(userData.selectedClientId);
      setClient(clientData);
      
      // Check if clientData and user_code are valid
      if (!clientData || !clientData.user_code) {
        console.error("Client data or user_code missing:", clientData);
        setError("Client data is incomplete. Please check client settings.");
        setIsFetchingData(false);
        return;
      }
      
      // Get active menus first, then published, then drafts
      const clientMenus = await Menu.filter({ 
        user_code: clientData.user_code,
        status: 'active'
      });
      
      if (clientMenus.length === 0) {
        const publishedMenus = await Menu.filter({ 
          user_code: clientData.user_code,
          status: 'published'
        });
        
        if (publishedMenus.length > 0) {
          setCurrentMenu(publishedMenus[0]);
        } else {
          const draftMenus = await Menu.filter({ user_code: clientData.user_code });
          if (draftMenus.length > 0) {
            setCurrentMenu(draftMenus[0]);
          }
        }
      } else {
        setCurrentMenu(clientMenus[0]);
      }
      
      console.log("Client data loaded:", clientData);
      console.log("User code:", clientData.user_code);
      
      // First try to find existing chat
      const chats = await ChatEntity.filter({ 
        client_id: clientData.id,
        user_code: clientData.user_code
      });
      
      console.log("Found chats:", chats);
      
      if (chats && chats.length > 0) {
        setSelectedChat(chats[0]);
      } else {
        // Create new chat with proper user_code
        const newChat = await ChatEntity.create({
          client_id: clientData.id,
          user_code: clientData.user_code,
          messages: []
        });
        console.log("Created new chat:", newChat);
        setSelectedChat(newChat);
      }
    } catch (error) {
      console.error("Error loading data:", error);
      setError("Failed to load chat data. Please try again later.");
    } finally {
      setIsFetchingData(false);
    }
  };

  const handleSend = async () => {
    if ((!message.trim() && !imageFile) || !client) return;

    setIsLoading(true);
    try {
      // Create the user message object
      let userMessage = { role: 'user', content: message };

      // Handle image upload if selected
      if (imageFile instanceof File) {
        try {
          const { url, file_url } = await UploadFile(imageFile);
          userMessage.image_url = url || file_url;
        } catch (uploadError) {
          console.error("Error uploading image:", uploadError);
          setError("Failed to upload image. Please try again.");
          setIsLoading(false);
          return;
        }
      }
      
      

      // Update chat with user message
      const updatedMessages = [...(selectedChat.messages || []), userMessage];

const chatHistoryForPrompt = updatedMessages
  .map((msg) => `${msg.role.toUpperCase()}: ${msg.content}`)
  .join('\n');
      
      await ChatEntity.update(selectedChat.id, { messages: updatedMessages });

      // Prepare client profile for AI context
      const clientProfile = {
        name: client.full_name,
        age: client.age,
        gender: client.gender,
        height: client.height,
        weight: client.weight,
        activity_level: client.activity_level,
        goal: client.goal,
        dietary_restrictions: client.dietary_restrictions || []
      };

      // Prepare AI prompt
      const aiPrompt = `You are a professional nutrition coach assistant for BetterChoice Nutrition service.
        
        CLIENT PROFILE:
        ${JSON.stringify(clientProfile)}

        CHAT HISTORY:
        ${chatHistoryForPrompt}

        
        ${currentMenu ? `CURRENT MENU PLAN:
        ${JSON.stringify(currentMenu)}` : 'No current menu plan.'}
        
        USER MESSAGE:
        ${message}

        ${userMessage.image_url ? `The user has shared an image...` : ''}

        
        ${userMessage.image_url ? `
        The user has shared an image of food. Please:
        1. Analyze if this food fits their dietary plan and goals
        2. Provide nutritional insights
        3. Suggest any modifications if needed
        ` : ''}
        
        Please provide a friendly, concise response that directly addresses the user's question. Use emojis appropriately to make the conversation engaging. Focus only on what was asked without adding unnecessary information. Keep your response natural and conversational.`;

      // Default fallback response in case AI fails
      let aiResponse = `Thank you for your message${userMessage.image_url ? ' and the food image' : ''}. 

Based on your profile (${clientProfile.gender}, ${clientProfile.age} years old, goal: ${clientProfile.goal}), here are some nutrition insights:

1. Your current calorie target should be approximately ${clientProfile.gender === 'male' ? 
  (clientProfile.goal === 'lose' ? '1800-2000' : clientProfile.goal === 'gain' ? '2500-2800' : '2200-2400') : 
  (clientProfile.goal === 'lose' ? '1500-1700' : clientProfile.goal === 'gain' ? '2000-2200' : '1800-2000')} calories per day

2. Focus on getting adequate protein (${clientProfile.goal === 'lose' ? '1.6-2.0' : '1.2-1.6'} g/kg of body weight) to maintain muscle mass

3. Stay well-hydrated with at least 8 glasses of water daily

${userMessage.image_url ? `
Regarding the food in your image:
- This appears to be a balanced meal with protein, vegetables, and some carbohydrates
- Ensure portion sizes align with your calorie goals
- Consider adding more vegetables for additional volume and nutrients with minimal calories
` : ''}

Would you like more specific advice on meal timing, portion sizes, or nutrient distribution?`;

      // Try to get AI response, use fallback if it fails
      try {
        const response = await InvokeLLM({
          prompt: aiPrompt,
          add_context_from_internet: false
        });
        if (response) {
          aiResponse = response;
        }
      } catch (aiError) {
        console.error('Error getting AI response, using fallback:', aiError);
      }

      // Update chat with AI response
      const finalMessages = [...updatedMessages, { role: 'assistant', content: aiResponse }];
      await ChatEntity.update(selectedChat.id, { messages: finalMessages });
      
      // Update local state
      setSelectedChat(prev => ({
        ...prev,
        messages: finalMessages
      }));

      // Clear form
      setMessage('');
      setImageFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (error) {
      console.error('Error sending message:', error);
      setError('Failed to send message. Please try again.');
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
    <div className="h-[calc(100vh-8rem)]">
      <div className="flex flex-col h-full">
        <Card className="mb-4">
          <CardHeader>
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-2">
              <div>
                <CardTitle>Chat with {client?.full_name}</CardTitle>
                <CardDescription>Client Code: {client?.user_code}</CardDescription>
              </div>
              {currentMenu && (
                <div className="text-sm text-right">
                  <span className="text-gray-500">Current menu: </span>
                  <span className="font-medium">{currentMenu.programName}</span>
                </div>
              )}
            </div>
          </CardHeader>
        </Card>
        
        <Card className="flex-1 flex flex-col mb-4">
          <CardContent className="flex-1 p-4 overflow-hidden">
            <ScrollArea className="h-full pr-4">
              {selectedChat?.messages?.length > 0 ? (
                selectedChat.messages.map((msg, index) => (
                  <div
                    key={index}
                    className={`mb-4 flex ${
                      msg.role === 'user' ? 'justify-end' : 'justify-start'
                    }`}
                  >
                    <div
                      className={`rounded-lg px-4 py-2 max-w-[80%] ${
                        msg.role === 'user'
                          ? 'bg-green-600 text-white'
                          : 'bg-gray-100 text-gray-900'
                      }`}
                    >
                      {msg.image_url && (
                        <img
                          src={msg.image_url}
                          alt="Uploaded food"
                          className="rounded-lg mb-2 max-w-full"
                        />
                      )}
                      <div className="whitespace-pre-wrap">{msg.content}</div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center p-8 text-gray-500">
                  <MessageSquare className="h-12 w-12 text-gray-300 mb-4" />
                  <h3 className="text-xl font-medium mb-2">Start a Conversation</h3>
                  <p className="max-w-md">
                    Chat with {client?.full_name} about their nutrition plan. 
                    You can also share food images for analysis.
                  </p>
                </div>
              )}
              <div ref={chatEndRef} />
            </ScrollArea>
          </CardContent>
        </Card>

        <div className="flex gap-2">
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
            className={`border-green-200 ${imageFile ? 'bg-green-50 text-green-600' : 'hover:bg-green-50'}`}
          >
            <ImageIcon className="h-5 w-5" />
          </Button>
          <Input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={`Message ${client?.full_name}...`}
            disabled={isLoading}
            className="border-green-200 focus:ring-green-500"
          />
          <Button
            onClick={handleSend}
            disabled={(!message.trim() && !imageFile) || isLoading}
            className="bg-green-600 hover:bg-green-700"
          >
            {isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Send className="h-5 w-5" />
            )}
          </Button>
        </div>
        {imageFile && (
          <div className="mt-2 text-sm text-green-600">
            Image selected: {imageFile.name}
          </div>
        )}
      </div>
    </div>
  );
}