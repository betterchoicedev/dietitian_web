import React, { useState, useEffect } from 'react';
import { Menu } from '@/api/entities';
import { Client } from '@/api/entities';
import { User } from '@/api/entities';
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle, 
  CardDescription 
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { AlertCircle, FileJson, Copy, Check, RefreshCw } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export default function ApiClientMenu() {
  const [clientCode, setClientCode] = useState('');
  const [menuData, setMenuData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  const fetchMenuByClientCode = async () => {
    if (!clientCode.trim()) {
      setError("Please enter a client code");
      return;
    }

    setIsLoading(true);
    setError(null);
    setMenuData(null);
    
    try {
      // First, find the client with the given code
      const clients = await Client.filter({ code: clientCode.toUpperCase() });
      
      if (clients.length === 0) {
        setError(`No client found with code ${clientCode}`);
        return;
      }
      
      const client = clients[0];
      
      // Find all menus for this client, sorted by created date (newest first)
      const menus = await Menu.filter({ user_code: client.code }, '-created_at');
      
      if (menus.length === 0) {
        setError(`No menu plans found for client ${client.full_name} (${client.code})`);
        return;
      }
      
      // First try to find an active menu
      const activeMenus = menus.filter(menu => menu.status === 'active');
      
      if (activeMenus.length > 0) {
        setMenuData(activeMenus[0]);
        return;
      }
      
      // If no active menu, try to find a published menu
      const publishedMenus = menus.filter(menu => menu.status === 'published');
      
      if (publishedMenus.length > 0) {
        setMenuData(publishedMenus[0]);
        return;
      }
      
      // If no published menu, return the most recent menu
      setMenuData(menus[0]);
      
    } catch (error) {
      console.error('Error fetching menu:', error);
      setError('An error occurred while fetching the menu data');
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = () => {
    if (!menuData) return;
    
    navigator.clipboard.writeText(JSON.stringify(menuData, null, 2))
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(err => {
        console.error('Failed to copy: ', err);
      });
  };

  const handleMenuRequest = async (clientCode) => {
    try {
      // First, find the client with the given code
      const clients = await Client.filter({ code: clientCode.toUpperCase() });
      
      if (clients.length === 0) {
        return {
          error: 'Client not found',
          message: `No client found with code ${clientCode}`
        };
      }
      
      const client = clients[0];
      
      // Find all menus for this client, sorted by created date (newest first)
      const menus = await Menu.filter({ user_code: client.code }, '-created_at');
      
      if (menus.length === 0) {
        return {
          error: 'Menu not found',
          message: `No menu plans found for client ${client.full_name} (${client.code})`
        };
      }
      
      // First try to find an active menu
      const activeMenus = menus.filter(menu => menu.status === 'active');
      
      if (activeMenus.length > 0) {
        return activeMenus[0];
      }
      
      // If no active menu, try to find a published menu
      const publishedMenus = menus.filter(menu => menu.status === 'published');
      
      if (publishedMenus.length > 0) {
        return publishedMenus[0];
      }
      
      // If no published menu, return the most recent menu
      return menus[0];
    } catch (error) {
      console.error('API error:', error);
      return {
        error: 'Server error',
        message: 'An unexpected error occurred while processing your request'
      };
    }
  };

  // This simulates a GET handler on mount if code is in URL
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const codeParam = urlParams.get('code');
    
    if (codeParam) {
      setClientCode(codeParam);
      setTimeout(() => {
        fetchMenuByClientCode();
      }, 500);
    }
  }, []);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Menu Plan API</CardTitle>
          <CardDescription>
            Retrieve a client's most recent meal plan by entering their client code
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4">
            <div className="flex-1">
              <Label htmlFor="clientCode">Client Code</Label>
              <Input
                id="clientCode"
                placeholder="Enter client code (e.g., JOAGOA)"
                value={clientCode}
                onChange={(e) => setClientCode(e.target.value)}
              />
            </div>
            <div className="self-end">
              <Button 
                onClick={fetchMenuByClientCode}
                disabled={isLoading}
                className="bg-green-600 hover:bg-green-700"
              >
                {isLoading ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Loading...
                  </>
                ) : (
                  'Fetch Menu'
                )}
              </Button>
            </div>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {menuData && (
            <div className="mt-6">
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-lg font-semibold">
                  Menu Plan for {menuData.client?.name || 'Client'}
                </h3>
                <Button 
                  size="sm" 
                  variant="outline" 
                  onClick={copyToClipboard}
                  className="flex items-center gap-1"
                >
                  {copied ? (
                    <>
                      <Check className="w-4 h-4" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      Copy JSON
                    </>
                  )}
                </Button>
              </div>
              
              <Card className="bg-slate-50">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2 text-sm text-slate-500">
                    <FileJson className="w-4 h-4" />
                    <span>JSON Response</span>
                  </div>
                  <pre className="text-xs bg-slate-900 text-slate-50 p-4 rounded-md overflow-auto max-h-96">
                    {JSON.stringify(menuData, null, 2)}
                  </pre>
                </CardContent>
              </Card>
              
              <div className="mt-4 text-sm text-slate-500">
                <p>To use this API, access: <code className="bg-slate-100 px-1 py-0.5 rounded">ApiClientMenu?code={clientCode}</code></p>
                <p className="mt-1">This endpoint returns the most recent active menu for the specified client code.</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>API Documentation</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-medium">GET /ApiClientMenu</h3>
              <p className="text-sm text-slate-500">Retrieves a client's meal plan by their unique code</p>
            </div>
            
            <div>
              <h4 className="font-medium">Query Parameters</h4>
              <table className="w-full mt-2">
                <thead className="text-xs font-medium text-slate-500 border-b">
                  <tr>
                    <th className="text-left py-2">Parameter</th>
                    <th className="text-left py-2">Type</th>
                    <th className="text-left py-2">Description</th>
                  </tr>
                </thead>
                <tbody className="text-sm">
                  <tr className="border-b">
                    <td className="py-2 font-mono">code</td>
                    <td className="py-2">string</td>
                    <td className="py-2">Client's unique 6-letter code (required)</td>
                  </tr>
                </tbody>
              </table>
            </div>
            
            <div>
              <h4 className="font-medium">Response</h4>
              <p className="text-sm text-slate-500 mb-2">Returns the most recent menu plan with this priority:</p>
              <ol className="list-decimal ml-5 text-sm text-slate-600">
                <li>Active menu (if available)</li>
                <li>Published menu (if no active menu)</li>
                <li>Most recent menu (if no published menu)</li>
              </ol>
            </div>
            
            <div>
              <h4 className="font-medium">Example</h4>
              <pre className="text-xs bg-slate-900 text-slate-50 p-4 rounded-md mt-2">
                GET /ApiClientMenu?code=JOAGOA
              </pre>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}