import { useState } from 'react';
import { Send } from 'lucide-react';

// Azure OpenAI Configuration
const endpoint = "https://ai-hubfooddata915979189829.openai.azure.com";  // Removed trailing slash
const apiVersion = "2024-02-15-preview";  // Updated API version
const deployment = "forObi4-mini";
const apiKey = import.meta.env.VITE_AZURE_OPENAI_API_KEY || process.env.AZURE_OPENAI_API_KEY;

const ChatBot = () => {
  const [messages, setMessages] = useState([
    {
      role: 'system',
      content: 'You are a helpful nutritionist assistant. Provide accurate and helpful nutrition advice.'
    }
  ]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!inputMessage.trim()) return;

    // Add user message to chat
    const userMessage = {
      role: 'user',
      content: inputMessage
    };
    
    // Update messages with user's message
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInputMessage('');
    setIsLoading(true);

    try {
      const response = await fetch(`${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': apiKey,
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          messages: updatedMessages,
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

      // Add assistant's response to chat
      setMessages(messages => [...messages, {
        role: 'assistant',
        content: data.choices[0].message.content
      }]);
    } catch (error) {
      console.error('Error:', error);
      // Add error message to chat
      setMessages(messages => [...messages, {
        role: 'assistant',
        content: `Error: ${error.message || 'Something went wrong. Please try again.'}`
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-[600px] w-full max-w-2xl mx-auto bg-white rounded-lg shadow-lg">
      {/* Chat messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.filter(msg => msg.role !== 'system').map((message, index) => (
          <div
            key={index}
            className={`flex ${
              message.role === 'user' ? 'justify-end' : 'justify-start'
            }`}
          >
            <div
              className={`max-w-[80%] rounded-lg p-3 ${
                message.role === 'user'
                  ? 'bg-green-500 text-white'
                  : 'bg-gray-100 text-gray-800'
              }`}
            >
              {message.content}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 rounded-lg p-3 text-gray-800">
              Thinking...
            </div>
          </div>
        )}
      </div>

      {/* Input form */}
      <form onSubmit={handleSubmit} className="p-4 border-t">
        <div className="flex gap-2">
          <input
            type="text"
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            placeholder="Type your message..."
            className="flex-1 p-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
          />
          <button
            type="submit"
            disabled={isLoading}
            className="bg-green-500 text-white p-2 rounded-lg hover:bg-green-600 transition-colors disabled:bg-green-300"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </form>
    </div>
  );
};

export default ChatBot; 