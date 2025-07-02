import React, { useState, useEffect } from 'react';
import { Menu } from '@/api/entities';
import { Client } from '@/api/entities';
import { User } from '@/api/entities';
import { Chat } from '@/api/entities';
import { useLanguage } from '@/contexts/LanguageContext';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { 
  FileText, 
  Plus, 
  MessageSquare, 
  CalendarClock, 
  BarChart3,
  ArrowUpRight
} from 'lucide-react';
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardFooter, 
  CardHeader, 
  CardTitle 
} from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

export default function Dashboard() {
  const { translations } = useLanguage();
  const [client, setClient] = useState(null);
  const [menus, setMenus] = useState([]);
  const [chats, setChats] = useState([]);
  const [userData, setUserData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  useEffect(() => {
    const fetchClient = async () => {
      try {
        const res = await fetch('/client.json');
        if (!res.ok) throw new Error("Fetch failed");
        const data = await res.json();
        console.log("Fetched client data:", data);
        setClient(data);
      } catch (err) {
        console.error("Error loading client.json:", err);
      }
    };
    fetchClient();
  }, []);
  
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const currentUser = await User.me();
      setUserData(currentUser);
      
      if (currentUser.selectedClientId) {
        const clientData = await Client.get(currentUser.selectedClientId);
        setClient(clientData);
        
        const clientMenus = await Menu.filter({ client_id: clientData.id });
        setMenus(clientMenus);
        
        const clientChats = await Chat.filter({ client_id: clientData.id });
        setChats(clientChats);
      }
    } catch (error) {
      console.error("Error loading dashboard data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold text-gradient-primary">
            {client ? `${translations.dashboard}: ${client.full_name}` : translations.dashboard}
          </h1>
          <p className="text-lg text-muted-foreground/70">
            {client?.code ? `${translations.clientCode}: ${client.code}` : translations.overviewOfClient}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-4 py-2 bg-success/10 border border-success/30 rounded-xl">
            <div className="w-2 h-2 bg-success rounded-full animate-pulse-glow"></div>
            <span className="text-sm font-medium text-success">Live Dashboard</span>
          </div>
        </div>
      </div>

      {client && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <Card className="lg:col-span-1 shadow-premium hover:shadow-glow-primary">
              <CardHeader className="pb-4">
                <CardTitle className="text-xl flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-primary-lighter flex items-center justify-center">
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                  {translations.clientInformation}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center space-x-4">
                  <Avatar className="h-20 w-20 shadow-lg ring-4 ring-primary/10">
                    <AvatarFallback className="bg-gradient-to-br from-primary to-primary-lighter text-white text-2xl font-bold">
                      {client.full_name?.[0]?.toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="space-y-1">
                    <h3 className="text-xl font-bold text-foreground">{client.full_name}</h3>
                    <p className="text-sm text-muted-foreground/80">{client.email}</p>
                    {client.phone && <p className="text-sm text-muted-foreground/80">{client.phone}</p>}
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-gradient-to-br from-primary/5 to-primary/10 rounded-xl p-4 border border-primary/20">
                    <p className="text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider">{translations.height}</p>
                    <p className="text-lg font-bold text-foreground mt-1">{client.height ? `${client.height} cm` : '—'}</p>
                  </div>
                  <div className="bg-gradient-to-br from-success/5 to-success/10 rounded-xl p-4 border border-success/20">
                    <p className="text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider">{translations.weight}</p>
                    <p className="text-lg font-bold text-foreground mt-1">{client.weight ? `${client.weight} kg` : '—'}</p>
                  </div>
                  <div className="bg-gradient-to-br from-warning/5 to-warning/10 rounded-xl p-4 border border-warning/20">
                    <p className="text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider">{translations.age}</p>
                    <p className="text-lg font-bold text-foreground mt-1">{client.age || '—'}</p>
                  </div>
                  <div className="bg-gradient-to-br from-info/5 to-info/10 rounded-xl p-4 border border-info/20">
                    <p className="text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider">{translations.gender}</p>
                    <p className="text-lg font-bold text-foreground mt-1">{client.gender ? client.gender.charAt(0).toUpperCase() + client.gender.slice(1) : '—'}</p>
                  </div>
                  <div className="col-span-2 bg-gradient-to-br from-slate-50 to-slate-100 rounded-xl p-4 border border-slate-200">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider">{translations.activityLevel}</p>
                        <p className="text-sm font-bold text-foreground mt-1">{client.activity_level ? client.activity_level.charAt(0).toUpperCase() + client.activity_level.slice(1) : '—'}</p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider">{translations.goal}</p>
                        <p className="text-sm font-bold text-foreground mt-1">{client.goal ? client.goal.charAt(0).toUpperCase() + client.goal.slice(1) : '—'}</p>
                      </div>
                    </div>
                  </div>
                </div>
                
                {client.notes && (
                  <div className="mt-4">
                    <p className="text-gray-500 text-sm">{translations.notes}</p>
                    <p className="text-sm mt-1">{client.notes}</p>
                  </div>
                )}
              </CardContent>
              <CardFooter>
                <Link to={createPageUrl('EditClient') + `?id=${client.id}`} className="w-full">
                  <Button variant="outline" className="w-full">{translations.editInformation}</Button>
                </Link>
              </CardFooter>
            </Card>

            <Card className="lg:col-span-2 shadow-premium hover:shadow-glow-success">
              <Tabs defaultValue="menus">
                <CardHeader className="pb-4">
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <CardTitle className="text-xl flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-success to-success-lighter flex items-center justify-center">
                        <BarChart3 className="w-4 h-4 text-white" />
                      </div>
                      {translations.clientSummary}
                    </CardTitle>
                    <TabsList className="bg-muted/50 border border-border/40">
                      <TabsTrigger value="menus" className="data-[state=active]:bg-success/10 data-[state=active]:text-success">{translations.menus}</TabsTrigger>
                      <TabsTrigger value="activity" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary">{translations.activity}</TabsTrigger>
                    </TabsList>
                  </div>
                </CardHeader>

                <TabsContent value="menus" className="pt-0">
                  <CardContent className="pt-6">
                    {menus.length > 0 ? (
                      <div className="space-y-4">
                        {menus.slice(0, 3).map(menu => (
                          <div key={menu.id} className="flex items-center justify-between border-b pb-3">
                            <div className="flex items-center space-x-3">
                              <div className="h-9 w-9 rounded-full bg-green-100 flex items-center justify-center">
                                <FileText className="h-4 w-4 text-green-600" />
                              </div>
                              <div>
                                <h4 className="font-medium">{menu.name}</h4>
                                <p className="text-sm text-gray-500">
                                  {menu.total_calories} {translations.kcal} • {menu.status}
                                </p>
                              </div>
                            </div>
                            <Link to={createPageUrl('MenuEdit') + `?id=${menu.id}`}>
                              <Button variant="ghost" size="icon">
                                <ArrowUpRight className="h-4 w-4" />
                              </Button>
                            </Link>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8">
                        <FileText className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                        <h3 className="text-gray-500 font-medium mb-1">{translations.noMenusYet}</h3>
                        <p className="text-gray-400 text-sm mb-4">
                          {translations.createFirstMenu}
                        </p>
                        <Link to={createPageUrl('MenuCreate')}>
                          <Button className="bg-green-600 hover:bg-green-700">
                            <Plus className="h-4 w-4 mr-2" />
                            {translations.createMenu}
                          </Button>
                        </Link>
                      </div>
                    )}
                  </CardContent>

                  {menus.length > 0 && (
                    <CardFooter>
                      <div className="flex justify-between items-center w-full">
                        <p className="text-sm text-gray-500">
                          {menus.length} {translations.menus} {translations.menusTotal}
                        </p>
                        <Link to={createPageUrl('Menus')}>
                          <Button variant="ghost" className="text-green-600">
                            {translations.viewAllMenus}
                            <ArrowUpRight className="h-4 w-4 ml-1" />
                          </Button>
                        </Link>
                      </div>
                    </CardFooter>
                  )}
                </TabsContent>

                <TabsContent value="activity" className="pt-0">
                  <CardContent className="pt-6">
                    {chats.length > 0 ? (
                      <div className="space-y-4">
                        {chats.slice(0, 3).map(chat => (
                          <div key={chat.id} className="flex items-center justify-between border-b pb-3">
                            <div className="flex items-center space-x-3">
                              <div className="h-9 w-9 rounded-full bg-blue-100 flex items-center justify-center">
                                <MessageSquare className="h-4 w-4 text-blue-600" />
                              </div>
                              <div>
                                <h4 className="font-medium">{translations.chatSession}</h4>
                                <p className="text-sm text-gray-500">
                                  {new Date(chat.created_date).toLocaleDateString()} • {chat.messages?.length || 0} {translations.messages}
                                </p>
                              </div>
                            </div>
                            <Link to={createPageUrl('Chat') + `?id=${chat.id}`}>
                              <Button variant="ghost" size="icon">
                                <ArrowUpRight className="h-4 w-4" />
                              </Button>
                            </Link>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8">
                        <MessageSquare className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                        <h3 className="text-gray-500 font-medium mb-1">{translations.noChatHistory}</h3>
                        <p className="text-gray-400 text-sm mb-4">
                          {translations.startConversationWith}
                        </p>
                        <Link to={createPageUrl('Chat')}>
                          <Button className="bg-green-600 hover:bg-green-700">
                            <MessageSquare className="h-4 w-4 mr-2" />
                            {translations.startChat}
                          </Button>
                        </Link>
                      </div>
                    )}
                  </CardContent>

                  {chats.length > 0 && (
                    <CardFooter>
                      <div className="flex justify-between items-center w-full">
                        <p className="text-sm text-gray-500">
                          {chats.length} {translations.chatSessionsTotal} {translations.menusTotal}
                        </p>
                        <Link to={createPageUrl('Chat')}>
                          <Button variant="ghost" className="text-green-600">
                            {translations.viewAllChats}
                            <ArrowUpRight className="h-4 w-4 ml-1" />
                          </Button>
                        </Link>
                      </div>
                    </CardFooter>
                  )}
                </TabsContent>
              </Tabs>
            </Card>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium text-gray-500">{translations.recentActivity}</CardTitle>
                  <CalendarClock className="h-4 w-4 text-gray-400" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {menus.length + chats.length > 0 ? (
                    <>
                      {[...menus, ...chats]
                        .sort((a, b) => new Date(b.created_date) - new Date(a.created_date))
                        .slice(0, 3)
                        .map((item, index) => (
                          <div key={index} className="flex items-center gap-2">
                            <div className={`h-8 w-8 rounded-full flex items-center justify-center ${
                              'name' in item ? 'bg-green-100' : 'bg-blue-100'
                            }`}>
                              {'name' in item ? (
                                <FileText className="h-4 w-4 text-green-600" />
                              ) : (
                                <MessageSquare className="h-4 w-4 text-blue-600" />
                              )}
                            </div>
                                                          <div>
                                <p className="text-sm font-medium">
                                  {'name' in item ? `${translations.menus}: ${item.name}` : translations.chatSession}
                                </p>
                                <p className="text-xs text-gray-500">
                                  {new Date(item.created_date).toLocaleDateString()}
                                </p>
                              </div>
                          </div>
                        ))
                    }
                    </>
                  ) : (
                    <p className="text-gray-500 text-sm py-3">{translations.noRecentActivity}</p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium text-gray-500">{translations.nutritionSummary}</CardTitle>
                  <BarChart3 className="h-4 w-4 text-gray-400" />
                </div>
              </CardHeader>
              <CardContent>
                {menus.length > 0 ? (
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <div className="flex justify-between items-center text-sm">
                        <span>{translations.calories}</span>
                        <span className="font-medium">{menus[0]?.total_calories || 0} {translations.kcal}</span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-green-500 rounded-full" style={{ width: '70%' }}></div>
                      </div>
                    </div>
                    
                    <div className="space-y-1">
                      <div className="flex justify-between items-center text-sm">
                        <span>{translations.protein}</span>
                        <span className="font-medium">{menus[0]?.total_protein || 0}g</span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500 rounded-full" style={{ width: '60%' }}></div>
                      </div>
                    </div>
                    
                    <div className="space-y-1">
                      <div className="flex justify-between items-center text-sm">
                        <span>{translations.carbs}</span>
                        <span className="font-medium">{menus[0]?.total_carbs || 0}g</span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-yellow-500 rounded-full" style={{ width: '50%' }}></div>
                      </div>
                    </div>
                    
                    <div className="space-y-1">
                      <div className="flex justify-between items-center text-sm">
                        <span>{translations.fat}</span>
                        <span className="font-medium">{menus[0]?.total_fat || 0}g</span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-purple-500 rounded-full" style={{ width: '40%' }}></div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-4">
                    <p className="text-gray-500 text-sm mb-2">{translations.noMenuDataAvailable}</p>
                    <Link to={createPageUrl('MenuCreate')}>
                      <Button variant="outline" size="sm">
                        <Plus className="h-3 w-3 mr-1" />
                        {translations.createMenu}
                      </Button>
                    </Link>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="md:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-500">{translations.quickActions}</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-3">
                <Link to={createPageUrl('MenuCreate')} className="w-full">
                  <Button variant="outline" className="w-full h-full py-6 flex flex-col items-center justify-center gap-2">
                    <FileText className="h-5 w-5 text-green-600" />
                    <span>{translations.createMenu}</span>
                  </Button>
                </Link>
                <Link to={createPageUrl('Chat')} className="w-full">
                  <Button variant="outline" className="w-full h-full py-6 flex flex-col items-center justify-center gap-2">
                    <MessageSquare className="h-5 w-5 text-blue-600" />
                    <span>{translations.startChat}</span>
                  </Button>
                </Link>
                <Link to={createPageUrl('MenuAnalysis')} className="w-full">
                  <Button variant="outline" className="w-full h-full py-6 flex flex-col items-center justify-center gap-2">
                    <BarChart3 className="h-5 w-5 text-purple-600" />
                    <span>{translations.menuAnalysis}</span>
                  </Button>
                </Link>
                <Link to={createPageUrl('EditClient') + `?id=${client.id}`} className="w-full">
                  <Button variant="outline" className="w-full h-full py-6 flex flex-col items-center justify-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-600">
                      <circle cx="12" cy="12" r="10"/>
                      <path d="M12 16v-4"/>
                      <path d="M12 8h.01"/>
                    </svg>
                    <span>{translations.updateInfo}</span>
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}