
import React, { useState, useEffect } from 'react';
import { Menu } from '@/api/entities';
import { User } from '@/api/entities';
import { Plus, Search, FileText, ExternalLink, Download, Filter, RefreshCw, Trash, AlertTriangle, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import MenuCodeDisplay from '../components/menu/MenuCodeDisplay';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function Menus() {
  const [menus, setMenus] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [filterUserCode, setFilterUserCode] = useState('all');
  const [userCodes, setUserCodes] = useState([]);
  const [error, setError] = useState(null);
  const [loadingAttempt, setLoadingAttempt] = useState(0);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [menuToDelete, setMenuToDelete] = useState(null);
  const navigate = useNavigate();

  const updateExistingMenuCodes = async (menus) => {
    const generateMenuCode = () => {
      const digits = '0123456789';
      let code = '';
      for (let i = 0; i < 9; i++) {
        code += digits.charAt(Math.floor(Math.random() * digits.length));
      }
      return code;
    };

    for (const menu of menus) {
      if (!menu.menu_code || menu.menu_code.length !== 9 || !/^\d{9}$/.test(menu.menu_code)) {
        const newCode = generateMenuCode();
        try {
          // First check the structure of recommendations to ensure compatibility
          let menuUpdate = { menu_code: newCode };
          
          // Handle different recommendation formats during the transition
          if (menu.recommendations && typeof menu.recommendations === 'object' && !Array.isArray(menu.recommendations)) {
            // Convert object recommendations to array format
            const recArray = Object.entries(menu.recommendations).map(([key, value]) => ({
              recommendation_key: key,
              recommendation_value: value
            }));
            menuUpdate.recommendations = recArray;
          }
          
          await Menu.update(menu.id, menuUpdate);
          menu.menu_code = newCode;
        } catch (error) {
          console.error(`Error updating menu code for menu ${menu.id}:`, error);
        }
      }
    }
    return menus;
  };

  const loadMenus = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const userData = await User.me();
      
      let loadedMenus = [];
      try {
        loadedMenus = await Menu.filter({ created_by: userData.email }, '-created_date');
      } catch (fetchError) {
        console.error("Error in initial menu fetch:", fetchError);
        try {
          loadedMenus = await Menu.list();
          loadedMenus = loadedMenus.filter(menu => menu.created_by === userData.email);
        } catch (listError) {
          console.error("Fallback menu fetch also failed:", listError);
          throw new Error("Failed to load menus after multiple attempts");
        }
      }
      
      if (loadedMenus.length > 0) {
        try {
          const updatedMenus = await updateExistingMenuCodes(loadedMenus);
          setMenus(updatedMenus);
          
          const uniqueCodes = [...new Set(updatedMenus.map(menu => menu.user_code).filter(Boolean))];
          setUserCodes(uniqueCodes);
        } catch (updateError) {
          console.error("Error updating menu codes:", updateError);
          setMenus(loadedMenus);
          const uniqueCodes = [...new Set(loadedMenus.map(menu => menu.user_code).filter(Boolean))];
          setUserCodes(uniqueCodes);
        }
      } else {
        setMenus([]);
        setUserCodes([]);
      }
    } catch (error) {
      console.error("Error loading menus:", error);
      setError("Failed to load menus. Please check your internet connection and try again.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadMenus();
  }, [loadingAttempt]);

  const handleMenuClick = (menuId) => {
    // Navigate to MenuView page instead of directly to edit
    navigate(createPageUrl('MenuView') + `?id=${menuId}`);
  };

  const handleRetry = () => {
    setLoadingAttempt(prev => prev + 1);
  };

  const filteredMenus = menus.filter(menu => {
    const matchesSearch = 
      (menu.programName?.toLowerCase().includes(searchTerm.toLowerCase()) || 
       menu.menu_code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
       menu.user_code?.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchesUserCode = filterUserCode === 'all' || menu.user_code === filterUserCode;
    
    return matchesSearch && matchesUserCode;
  });

  const getStatusColor = (status) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'published':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'draft':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const handleDeleteClick = (e, menu) => {
    e.stopPropagation();
    setMenuToDelete(menu);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!menuToDelete) return;
    
    try {
      await Menu.delete(menuToDelete.id);
      setMenus(menus.filter(menu => menu.id !== menuToDelete.id));
      setDeleteDialogOpen(false);
      setMenuToDelete(null);
    } catch (error) {
      console.error("Error deleting menu:", error);
      setError("Failed to delete menu. Please try again.");
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
      <div className="space-y-6">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
        
        <div className="flex justify-center">
          <Button onClick={handleRetry} className="bg-green-600 hover:bg-green-700">
            <RefreshCw className="mr-2 h-4 w-4" />
            Retry Loading Menus
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Menu Plans</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage and create personalized diet plans
          </p>
        </div>
        <div className="flex gap-4 w-full sm:w-auto">
          <Button
            variant="outline"
            onClick={() => window.print()}
            className="flex-1 sm:flex-none"
          >
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
          <Link 
            to={createPageUrl('MenuCreate')} 
            className="flex-1 sm:flex-none"
          >
            <Button className="w-full bg-green-600 hover:bg-green-700">
              <Plus className="w-4 h-4 mr-2" />
              New Menu
            </Button>
          </Link>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row items-center space-y-4 sm:space-y-0 sm:space-x-4">
        <div className="flex items-center space-x-2 w-full sm:w-auto">
          <Search className="w-5 h-5 text-gray-400" />
          <Input
            placeholder="Search by name, menu code, or client code..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1"
          />
        </div>
        
        <div className="flex items-center space-x-2 w-full sm:w-auto">
          <Filter className="w-5 h-5 text-gray-400" />
          <Select value={filterUserCode} onValueChange={setFilterUserCode}>
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue placeholder="Filter by client" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Clients</SelectItem>
              {userCodes.map(code => (
                <SelectItem key={code} value={code}>{code}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {filteredMenus.map(menu => (
          <Card 
            key={menu.id} 
            className={`cursor-pointer hover:shadow-md transition-all ${
              menu.status === 'active' ? 'border-green-200' : 
              menu.status === 'published' ? 'border-blue-200' :
              'border-yellow-200'
            }`}
            onClick={() => handleMenuClick(menu.id)}
          >
            <div className="absolute top-3 right-3 flex gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteClick(e, menu);
                }}
                className="h-8 w-8 bg-white/80 backdrop-blur-sm hover:bg-red-50 
                           hover:text-red-600 transition-colors"
              >
                <Trash className="h-4 w-4" />
              </Button>
            </div>
            
            <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
              <div className="space-y-1">
                <CardTitle className="text-lg font-medium">
                  {menu.programName || 'Untitled Menu'}
                </CardTitle>
                <CardDescription>
                  <span>Client Code: {menu.user_code || 'N/A'}</span>
                </CardDescription>
              </div>
              <Badge 
                variant="secondary"
                className={getStatusColor(menu.status)}
              >
                {menu.status === 'published' ? 'Published' : 
                 menu.status === 'active' ? 'Active' : 'Draft'}
              </Badge>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-gray-500">Total Calories</p>
                  <p className="font-medium">{menu.dailyTotalCalories || 0} kcal</p>
                </div>
                <div>
                  <p className="text-gray-500">Protein</p>
                  <p className="font-medium">{menu.macros?.protein || '0g'}</p>
                </div>
                <div>
                  <p className="text-gray-500">Carbs</p>
                  <p className="font-medium">{menu.macros?.carbs || '0g'}</p>
                </div>
                <div>
                  <p className="text-gray-500">Fat</p>
                  <p className="font-medium">{menu.macros?.fat || '0g'}</p>
                </div>
              </div>

              <div className="pt-2 border-t">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">Menu Code:</span>
                  <MenuCodeDisplay menuCode={menu.menu_code || 'N/A'} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}

        {filteredMenus.length === 0 && (
          <div className="col-span-full">
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-10">
                <FileText className="h-12 w-12 text-green-400" />
                <h3 className="mt-2 text-sm font-medium text-gray-900">
                  No menus found
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                  Get started by creating a new menu plan
                </p>
                <div className="mt-6">
                  <Link to={createPageUrl('MenuCreate')}>
                    <Button className="bg-green-600 hover:bg-green-700">
                      <Plus className="w-4 h-4 mr-2" />
                      New Menu
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              Delete Menu Plan
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the menu "{menuToDelete?.programName || 'Untitled Menu'}"?
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteConfirm}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
