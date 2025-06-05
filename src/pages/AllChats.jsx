import React, { useState, useEffect } from 'react';
import { Chat } from '@/api/entities';
import { Client } from '@/api/entities';
import { User } from '@/api/entities';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import {
  MessageSquare,
  Search,
  ChevronRight,
  ArrowRight,
  Calendar,
  Clock,
  MessageCircle,
  User as UserIcon,
  Filter
} from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { format, formatDistanceToNow } from 'date-fns';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function AllChats() {
  const navigate = useNavigate();
  const [chats, setChats] = useState([]);
  const [clients, setClients] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState('all');
  
  useEffect(() => {
    loadData();
  }, []);
  
  const loadData = async () => {
    try {
      setIsLoading(true);
      
      // Get current user
      const userData = await User.me();
      
      // Get all clients for this dietitian
      const clientList = await Client.filter({ dietitian_id: userData.id });
      
      // Create a client lookup map
      const clientMap = {};
      clientList.forEach(client => {
        clientMap[client.id] = client;
      });
      setClients(clientMap);
      
      // Get all chats
      let chatList = [];
      for (const client of clientList) {
        const clientChats = await Chat.filter({ client_id: client.id });
        chatList = [...chatList, ...clientChats];
      }
      
      // Sort by most recent message
      chatList.sort((a, b) => {
        const aDate = new Date(a.updated_date || a.created_date);
        const bDate = new Date(b.updated_date || b.created_date);
        return bDate - aDate;
      });
      
      setChats(chatList);
    } catch (error) {
      console.error('Error loading chats:', error);
    } finally {
      setIsLoading(false);
    }
  };
  
  const getLastMessage = (messages) => {
    if (!messages || messages.length === 0) return null;
    return messages[messages.length - 1];
  };
  
  const getLastMessageDate = (chat) => {
    if (!chat.messages || chat.messages.length === 0) {
      return new Date(chat.created_date);
    }
    return new Date(chat.updated_date);
  };
  
  const selectChat = async (chat) => {
    try {
      // Set the selected client
      await User.updateMyUserData({ selectedClientId: chat.client_id });
      // Navigate to the chat page
      navigate(createPageUrl('Chat'));
    } catch (error) {
      console.error('Error selecting chat:', error);
    }
  };
  
  const filteredChats = chats.filter(chat => {
    const client = clients[chat.client_id];
    if (!client) return false;
    
    // Apply search filter
    const matchesSearch = 
      client.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      client.code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (getLastMessage(chat.messages)?.content || '').toLowerCase().includes(searchTerm.toLowerCase());
    
    // Apply date filter
    if (filter === 'all') return matchesSearch;
    
    const lastMsgDate = getLastMessageDate(chat);
    const now = new Date();
    
    if (filter === 'today') {
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      return matchesSearch && lastMsgDate >= today;
    }
    
    if (filter === 'week') {
      const weekAgo = new Date(now);
      weekAgo.setDate(now.getDate() - 7);
      return matchesSearch && lastMsgDate >= weekAgo;
    }
    
    if (filter === 'month') {
      const monthAgo = new Date(now);
      monthAgo.setMonth(now.getMonth() - 1);
      return matchesSearch && lastMsgDate >= monthAgo;
    }
    
    return matchesSearch;
  });
  
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start md:items-center flex-col md:flex-row gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Client Conversations</h1>
          <p className="mt-1 text-sm text-gray-500">
            Review and continue conversations with your clients
          </p>
        </div>
      </div>
      
      <div className="flex flex-col sm:flex-row gap-4 justify-between">
        <div className="relative w-full sm:w-auto">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search by client or message"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 w-full sm:w-80"
          />
        </div>
        
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-full sm:w-40">
            <div className="flex items-center">
              <Filter className="mr-2 h-4 w-4" />
              <SelectValue placeholder="Filter by time" />
            </div>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All conversations</SelectItem>
            <SelectItem value="today">Today</SelectItem>
            <SelectItem value="week">Last 7 days</SelectItem>
            <SelectItem value="month">Last 30 days</SelectItem>
          </SelectContent>
        </Select>
      </div>
      
      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" />
        </div>
      ) : (
        <Card>
          <CardHeader className="pb-0">
            <CardTitle className="text-lg">All Conversations</CardTitle>
            <CardDescription>
              {filteredChats.length} {filteredChats.length === 1 ? 'conversation' : 'conversations'} found
            </CardDescription>
          </CardHeader>
          <CardContent>
            {filteredChats.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Client</TableHead>
                    <TableHead>Last Message</TableHead>
                    <TableHead>Last Activity</TableHead>
                    <TableHead>Messages</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredChats.map((chat) => {
                    const client = clients[chat.client_id];
                    if (!client) return null;
                    
                    const lastMessage = getLastMessage(chat.messages);
                    const lastMessageDate = getLastMessageDate(chat);
                    
                    return (
                      <TableRow key={chat.id}>
                        <TableCell>
                          <div className="flex items-center">
                            <Avatar className="h-8 w-8 mr-3">
                              <AvatarFallback className="bg-green-100 text-green-700">
                                {client.full_name?.[0] || 'C'}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <div className="font-medium">{client.full_name}</div>
                              <div className="text-xs text-gray-500">Code: {client.code}</div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="max-w-xs">
                          {lastMessage ? (
                            <div className="text-sm truncate">
                              {lastMessage.role === 'user' ? (
                                <Badge variant="outline" className="mr-1 bg-blue-50 text-blue-700 border-blue-200">
                                  Client
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="mr-1 bg-green-50 text-green-700 border-green-200">
                                  You
                                </Badge>
                              )}
                              {lastMessage.content.substring(0, 60)}{lastMessage.content.length > 60 ? '...' : ''}
                            </div>
                          ) : (
                            <span className="text-gray-500 text-sm">No messages yet</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center text-sm text-gray-500">
                            <Clock className="h-3.5 w-3.5 mr-1" />
                            {formatDistanceToNow(lastMessageDate, { addSuffix: true })}
                          </div>
                          <div className="text-xs text-gray-400">
                            {format(lastMessageDate, 'MMM d, yyyy')}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center">
                            <Badge className="bg-green-50 text-green-700 border-green-200">
                              <MessageCircle className="h-3 w-3 mr-1" />
                              {chat.messages?.length || 0}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            onClick={() => selectChat(chat)}
                            className="bg-green-600 hover:bg-green-700"
                          >
                            <MessageSquare className="h-4 w-4 mr-2" />
                            View
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center py-12">
                <MessageSquare className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                <h3 className="text-lg font-medium text-gray-900 mb-1">No conversations found</h3>
                <p className="text-gray-500 mb-4">
                  {searchTerm ? 'Try adjusting your search or filters' : 'Start a conversation with one of your clients'}
                </p>
                {!searchTerm && (
                  <Button
                    onClick={() => navigate(createPageUrl('Clients'))}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    <UserIcon className="h-4 w-4 mr-2" />
                    Manage Clients
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}