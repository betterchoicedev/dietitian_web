
import React, { useState, useEffect } from 'react';
import { Menu } from '@/api/entities';
import { Client } from '@/api/entities';
import { Chat } from '@/api/entities';
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
  CardFooter
} from '@/components/ui/card';
import { 
  FileText, 
  Plus, 
  AlertCircle,
  Clock,
  Utensils,
  CalendarRange,
  MessageSquare,
  RefreshCw,
  Check,
  Trash
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { format } from 'date-fns';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import MenuCodeDisplay from '../components/menu/MenuCodeDisplay';
import { toast } from "@/components/ui/use-toast"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"

export default function ClientMenu() {
  const navigate = useNavigate();
  const [client, setClient] = useState(null);
  const [menus, setMenus] = useState([]);
  const [chats, setChats] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isPolling, setIsPolling] = useState(false);
  const [lastUpdateTime, setLastUpdateTime] = useState(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [menuToDelete, setMenuToDelete] = useState(null);

  useEffect(() => {
    loadData();
    const pollInterval = setInterval(() => {
      setIsPolling(true);
      loadData(true);
    }, 30000);

    return () => clearInterval(pollInterval);
  }, []);

  const loadData = async (polling = false) => {
    try {
      if (!polling) setIsLoading(true);
      setError(null);
      
      const userData = await User.me();
      
      if (!userData.selectedClientId) {
        setError("No client selected. Please select a client first.");
        return;
      }
      
      const clientData = await Client.get(userData.selectedClientId);
      setClient(clientData);
      
      // Get menus for this client using user_code
      if (clientData.user_code) {
        const clientMenus = await Menu.filter({ user_code: clientData.user_code }, '-created_date');
        setMenus(clientMenus);
        
        // Get chats for this client
        const clientChats = await Chat.filter({ user_code: clientData.user_code }, '-created_date');
        setChats(clientChats);
      }
      
      setLastUpdateTime(new Date());
    } catch (error) {
      console.error("Error loading client data:", error);
      setError("Failed to load data. Please try refreshing.");
    } finally {
      setIsLoading(false);
      setIsPolling(false);
    }
  };

  const handleRefresh = () => {
    setIsPolling(true);
    loadData(true);
  };

  const handleStatusChange = async (menuId, newStatus) => {
    try {
      await Menu.update(menuId, { status: newStatus });
      await loadData(); // Reload the data to reflect changes
      
      // Show success message
      toast({
        title: "Menu Updated",
        description: `Menu status changed to ${newStatus}`,
        duration: 2000
      });
    } catch (error) {
      console.error("Error updating menu status:", error);
      toast({
        title: "Error",
        description: "Failed to update menu status",
        variant: "destructive",
        duration: 2000
      });
    }
  };

  const handleDeleteMenu = (menuId) => {
    setMenuToDelete(menuId);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    try {
      if (menuToDelete) {
        await Menu.delete(menuToDelete);
        await loadData();
        toast({
          title: "Menu Deleted",
          description: "Menu has been successfully deleted.",
          duration: 2000,
        });
      }
    } catch (error) {
      console.error("Error deleting menu:", error);
      toast({
        title: "Error",
        description: "Failed to delete menu",
        variant: "destructive",
        duration: 2000,
      });
    } finally {
      setMenuToDelete(null);
      setDeleteDialogOpen(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive" className="max-w-2xl mx-auto mt-8">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (!client) return null;

  const getStatusBadge = (status) => {
    const statusConfig = {
      draft: { color: 'bg-yellow-100 text-yellow-800 border-yellow-200', label: 'Draft' },
      verified: { color: 'bg-green-100 text-green-800 border-green-200', label: 'Verified' },
      published: { color: 'bg-blue-100 text-blue-800 border-blue-200', label: 'Published' },
      active: { color: 'bg-green-100 text-green-800 border-green-200', label: 'Active' }
    };
    
    const config = statusConfig[status] || statusConfig.draft;
    
    return (
      <Badge className={config.color}>
        {config.label}
      </Badge>
    );
  };

  const activeMenus = menus.filter(menu => menu.status === 'active');
  const publishedMenus = menus.filter(menu => menu.status === 'published');
  const draftMenus = menus.filter(menu => menu.status === 'draft');

  const handleMenuClick = (menuId) => {
    navigate(createPageUrl('MenuEdit') + `?id=${menuId}`);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Client Dashboard: {client.full_name}</h1>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-gray-500">Client Code: {client.user_code}</p>
            {lastUpdateTime && (
              <p className="text-gray-400 text-sm flex items-center">
                <Clock className="h-3 w-3 mr-1" />
                Last updated: {lastUpdateTime.toLocaleTimeString()}
              </p>
            )}
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={handleRefresh}
              disabled={isPolling}
              className="ml-2"
            >
              <RefreshCw className={`h-4 w-4 ${isPolling ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
        <div className="flex gap-2">
          <Button 
            onClick={() => navigate(createPageUrl('Chat'))}
            variant="outline"
            className="bg-blue-50 text-blue-700 hover:bg-blue-100"
          >
            <MessageSquare className="h-4 w-4 mr-2" />
            Chat with Client
          </Button>
          <Button 
            onClick={() => navigate(createPageUrl('MenuCreate'))}
            className="bg-green-600 hover:bg-green-700"
          >
            <Plus className="h-4 w-4 mr-2" />
            Create New Menu
          </Button>
        </div>
      </div>

      <Tabs defaultValue="menus">
        <TabsList>
          <TabsTrigger value="menus">Meal Plans</TabsTrigger>
          <TabsTrigger value="chats">Chat History</TabsTrigger>
        </TabsList>
        
        <TabsContent value="menus" className="mt-6">
          {menus.length === 0 ? (
            <Card className="text-center py-12">
              <CardContent>
                <div className="flex flex-col items-center">
                  <FileText className="h-12 w-12 text-gray-300 mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No menu plans found</h3>
                  <p className="text-gray-500 max-w-md mx-auto mb-6">
                    There are no menu plans created for this client yet. Create a new menu plan to get started.
                  </p>
                  <Button 
                    onClick={() => navigate(createPageUrl('MenuCreate'))}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Create New Menu
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-8">
              {activeMenus.length > 0 && (
                <div>
                  <h2 className="text-xl font-semibold mb-4 flex items-center">
                    <Check className="text-green-500 mr-2 h-5 w-5" />
                    Active Menu Plans
                  </h2>
                  <div className="grid gap-6 md:grid-cols-2">
                    {activeMenus.map(menu => (
                      <Card key={menu.id} className="border-green-200 cursor-pointer hover:shadow-lg transition-all">
                        <CardHeader>
                          <div className="flex justify-between">
                            <CardTitle>{menu.programName}</CardTitle>
                            <div className="flex items-center gap-2">
                              <Select
                                value={menu.status}
                                onValueChange={(value) => handleStatusChange(menu.id, value)}
                              >
                                <SelectTrigger className="w-[130px]">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="draft">Draft</SelectItem>
                                  <SelectItem value="published">Published</SelectItem>
                                  <SelectItem value="active">Active</SelectItem>
                                </SelectContent>
                              </Select>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDeleteMenu(menu.id)}
                                className="text-red-500 hover:text-red-700 hover:bg-red-50"
                              >
                                <Trash className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                          <CardDescription>
                            <div className="flex flex-col space-y-1 mt-1">
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-gray-500">Menu Code:</span>
                                <MenuCodeDisplay menuCode={menu.menu_code || 'N/A'} />
                              </div>
                              <div className="flex items-center gap-1">
                                <CalendarRange className="h-3.5 w-3.5 text-gray-400" />
                                <span>
                                  {menu.active_from && menu.active_until 
                                    ? `${format(new Date(menu.active_from), 'MMM d')} - ${format(new Date(menu.active_until), 'MMM d, yyyy')}`
                                    : 'No date range set'}
                                </span>
                              </div>
                            </div>
                          </CardDescription>
                        </CardHeader>
                        <CardFooter>
                          <Button variant="link" className="p-0 h-auto text-green-600" onClick={() => handleMenuClick(menu.id)}>
                            View Menu
                          </Button>
                        </CardFooter>
                      </Card>
                    ))}
                  </div>
                </div>
              )}

              {publishedMenus.length > 0 && (
                <div>
                  <h2 className="text-xl font-semibold mb-4 flex items-center">
                    <Utensils className="text-blue-500 mr-2 h-5 w-5" />
                    Published Menu Plans
                  </h2>
                  <div className="grid gap-6 md:grid-cols-2">
                    {publishedMenus.map(menu => (
                      <Card key={menu.id} className="cursor-pointer hover:shadow-lg transition-all">
                        <CardHeader>
                          <div className="flex justify-between">
                            <CardTitle>{menu.programName}</CardTitle>
                            <div className="flex items-center gap-2">
                              <Select
                                value={menu.status}
                                onValueChange={(value) => handleStatusChange(menu.id, value)}
                              >
                                <SelectTrigger className="w-[130px]">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="draft">Draft</SelectItem>
                                  <SelectItem value="published">Published</SelectItem>
                                  <SelectItem value="active">Active</SelectItem>
                                </SelectContent>
                              </Select>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDeleteMenu(menu.id)}
                                className="text-red-500 hover:text-red-700 hover:bg-red-50"
                              >
                                <Trash className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                          <CardDescription>
                            <div className="flex flex-col space-y-1 mt-1">
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-gray-500">Menu Code:</span>
                                <MenuCodeDisplay menuCode={menu.menu_code || 'N/A'} />
                              </div>
                              <div className="flex items-center gap-1">
                                <CalendarRange className="h-3.5 w-3.5 text-gray-400" />
                                <span>
                                  {menu.active_from && menu.active_until 
                                    ? `${format(new Date(menu.active_from), 'MMM d')} - ${format(new Date(menu.active_until), 'MMM d, yyyy')}`
                                    : 'No date range set'}
                                </span>
                              </div>
                            </div>
                          </CardDescription>
                        </CardHeader>
                        <CardFooter>
                          <Button variant="link" className="p-0 h-auto text-blue-600" onClick={() => handleMenuClick(menu.id)}>
                            View Menu
                          </Button>
                        </CardFooter>
                      </Card>
                    ))}
                  </div>
                </div>
              )}

              {draftMenus.length > 0 && (
                <div>
                  <h2 className="text-xl font-semibold mb-4 flex items-center">
                    <FileText className="text-yellow-500 mr-2 h-5 w-5" />
                    Draft Menu Plans
                  </h2>
                  <div className="grid gap-6 md:grid-cols-2">
                    {draftMenus.map(menu => (
                      <Card key={menu.id} className="cursor-pointer hover:shadow-lg transition-all">
                        <CardHeader>
                          <div className="flex justify-between">
                            <CardTitle>{menu.programName}</CardTitle>
                            <div className="flex items-center gap-2">
                              <Select
                                value={menu.status}
                                onValueChange={(value) => handleStatusChange(menu.id, value)}
                              >
                                <SelectTrigger className="w-[130px]">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="draft">Draft</SelectItem>
                                  <SelectItem value="published">Published</SelectItem>
                                  <SelectItem value="active">Active</SelectItem>
                                </SelectContent>
                              </Select>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDeleteMenu(menu.id)}
                                className="text-red-500 hover:text-red-700 hover:bg-red-50"
                              >
                                <Trash className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                          <CardDescription>
                            <div className="flex flex-col space-y-1 mt-1">
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-gray-500">Menu Code:</span>
                                <MenuCodeDisplay menuCode={menu.menu_code || 'N/A'} />
                              </div>
                              <div className="flex items-center gap-1">
                                <CalendarRange className="h-3.5 w-3.5 text-gray-400" />
                                <span>
                                  {menu.active_from && menu.active_until 
                                    ? `${format(new Date(menu.active_from), 'MMM d')} - ${format(new Date(menu.active_until), 'MMM d, yyyy')}`
                                    : 'No date range set'}
                                </span>
                              </div>
                            </div>
                          </CardDescription>
                        </CardHeader>
                        <CardFooter>
                          <Button variant="link" className="p-0 h-auto text-yellow-600" onClick={() => handleMenuClick(menu.id)}>
                            View Menu
                          </Button>
                        </CardFooter>
                      </Card>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </TabsContent>
        
        <TabsContent value="chats" className="mt-6">
          {chats.length === 0 ? (
            <Card className="text-center py-12">
              <CardContent>
                <div className="flex flex-col items-center">
                  <MessageSquare className="h-12 w-12 text-gray-300 mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No chat history found</h3>
                  <p className="text-gray-500 max-w-md mx-auto mb-6">
                    There are no chat conversations with this client yet.
                  </p>
                  <Button 
                    onClick={() => navigate(createPageUrl('Chat'))}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    <MessageSquare className="mr-2 h-4 w-4" />
                    Start New Chat
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {chats.map(chat => (
                <Card key={chat.id} className="cursor-pointer hover:shadow-lg transition-all"
                      onClick={() => navigate(createPageUrl('Chat') + `?id=${chat.id}`)}>
                  <CardHeader>
                    <div className="flex justify-between">
                      <CardTitle>Chat Session</CardTitle>
                      <Badge className="bg-blue-100 text-blue-800">
                        {format(new Date(chat.created_date), 'PPP')}
                      </Badge>
                    </div>
                    <CardDescription>
                      {chat.messages && chat.messages.length > 0 ? 
                        `${chat.messages.length} messages` : 
                        'No messages yet'}
                    </CardDescription>
                  </CardHeader>
                  <CardFooter>
                    <Button variant="link" className="p-0 h-auto text-blue-600">
                      View Conversation
                    </Button>
                  </CardFooter>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Menu</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this menu? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete} className="bg-red-600 hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
