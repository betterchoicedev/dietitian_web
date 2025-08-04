import React, { useState, useEffect } from 'react';
import { Menu } from '@/api/entities';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, CheckCircle, ClipboardCopy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useToast } from '@/components/ui/use-toast';

export default function ApiMenus() {
  const [userCode, setUserCode] = useState('');
  const [menu, setMenu] = useState(null);
  const [apiResponse, setApiResponse] = useState(null);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [apiUrl, setApiUrl] = useState(null);
  const { toast } = useToast();

  // Generate the API URL for the current window location
  useEffect(() => {
    const baseUrl = window.location.origin;
    const endpoint = '/api/menus';
    setApiUrl(`${baseUrl}${endpoint}?user_code=USER_CODE`);
  }, []);

  const handleFetchMenu = async () => {
    if (!userCode.trim()) {
      setError("Please enter a user code");
      return;
    }

    setIsLoading(true);
    setError(null);
    setMenu(null);
    setApiResponse(null);

    try {
      // Get all menus for this user code
      const menus = await Menu.filter({ user_code: userCode.trim() }, '-updated_date');
      
      if (menus.length === 0) {
        setError("No meal plans found for this user code");
        setIsLoading(false);
        return;
      }

      // Find active menu first
      let selectedMenu = menus.find(m => m.status === 'active');
      
      // If no active menu, try published menu
      if (!selectedMenu) {
        selectedMenu = menus.find(m => m.status === 'published');
      }
      
      // If still no menu, take the most recently updated one
      if (!selectedMenu) {
        selectedMenu = menus[0]; // Already sorted by most recent
      }

      setMenu(selectedMenu);
      
      // Format the response object to match what the API would return
      const apiResponseData = {
        status: "success",
        data: {
          id: selectedMenu.id,
          programName: selectedMenu.programName,
          status: selectedMenu.status,
          dailyTotalCalories: selectedMenu.dailyTotalCalories,
          macros: selectedMenu.macros,
          active_from: selectedMenu.active_from,
          active_until: selectedMenu.active_until,
          meals: selectedMenu.meals,
          recommendations: selectedMenu.recommendations,
          menu_code: selectedMenu.menu_code
        }
      };
      
      setApiResponse(apiResponseData);
    } catch (error) {
      console.error("Error fetching menu:", error);
      setError("Failed to fetch menu. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const copyApiEndpoint = () => {
    const endpoint = apiUrl.replace('USER_CODE', userCode || 'USER_CODE');
    navigator.clipboard.writeText(endpoint);
    toast({
      title: "API endpoint copied",
      description: "API endpoint has been copied to your clipboard",
      duration: 2000
    });
  };

  const copyResponseJson = () => {
    navigator.clipboard.writeText(JSON.stringify(apiResponse, null, 2));
    toast({
      title: "JSON response copied",
      description: "JSON response has been copied to your clipboard",
      duration: 2000
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Meal Plan API</h1>
        <p className="mt-1 text-sm text-gray-500">
          Test and retrieve meal plan information for clients via API
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>API Endpoint</CardTitle>
          <CardDescription>
            Use this endpoint to retrieve meal plan information for a specific user code
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-gray-50 p-4 rounded-md border border-gray-200">
            <code className="text-sm break-all">{apiUrl}</code>
          </div>
          
          <p className="text-sm text-gray-500">
            This endpoint returns the active meal plan for the specified user code. If no active meal plan exists, it returns the most recently updated meal plan.
          </p>
          
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={copyApiEndpoint}>
              <ClipboardCopy className="h-4 w-4 mr-2" />
              Copy API Endpoint
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Test API</CardTitle>
          <CardDescription>
            Enter a user code to test the API response
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4">
            <Input
              placeholder="Enter user code (e.g. ABCDEF)"
              value={userCode}
              onChange={(e) => setUserCode(e.target.value)}
              className="flex-1"
            />
            <Button 
              onClick={handleFetchMenu} 
              disabled={isLoading}
              className="bg-green-600 hover:bg-green-700"
            >
              {isLoading ? 'Fetching...' : 'Fetch Menu'}
            </Button>
          </div>
          
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          
          {menu && (
            <div className="space-y-4">
              <Alert className="bg-green-50 border-green-200">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <AlertTitle className="text-green-800">Menu Found</AlertTitle>
                <AlertDescription className="text-green-700">
                  Successfully retrieved menu "{menu.programName}" with status "{menu.status}"
                </AlertDescription>
              </Alert>
              
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <h4 className="font-medium">API Response</h4>
                  <Button variant="outline" size="sm" onClick={copyResponseJson}>
                    <ClipboardCopy className="h-4 w-4 mr-2" />
                    Copy JSON
                  </Button>
                </div>
                <div className="bg-gray-50 p-4 rounded-md border border-gray-200 overflow-auto max-h-96">
                  <pre className="text-xs text-gray-800">
                    {JSON.stringify(apiResponse, null, 2)}
                  </pre>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}