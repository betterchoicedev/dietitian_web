import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useLocation, Outlet } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { supabase } from '@/lib/supabase';
import { useLanguage } from '@/contexts/LanguageContext';
import { useClient } from '@/contexts/ClientContext';
import {
  FileText,
  Users,
  MessageSquare,
  Settings,
  Menu as MenuIcon,
  X,
  ChevronDown,
  User as UserIcon,
  LogOut,
  ListChecks,
  Activity,
  ClipboardList,
  Globe,
  Scale,
  User,
  Badge,
  Search,
  Apple,
  LayoutDashboard,
  Dumbbell,
  Shield,
  ExternalLink,
  Copy,
  Trash2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge as BadgeComponent } from "@/components/ui/badge";
import { useAuth } from '@/contexts/AuthContext';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { LanguageToggle } from '@/components/ui/language-toggle';
import { EventBus } from '@/utils/EventBus';
import { Input } from '@/components/ui/input';
import SystemMessageModal from '@/components/SystemMessageModal';
import { useSystemMessages } from '@/hooks/useSystemMessages';
import { getMyProfile } from '@/utils/auth';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import QRCode from 'react-qr-code';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';

export default function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, signOut } = useAuth();
  const { language, translations, toggleLanguage, isRTL } = useLanguage();
  const { clients, selectedUserCode, selectClient, isLoading: clientsLoading } = useClient();
  const { unreadCount, refreshCount } = useSystemMessages();
  const { toast } = useToast();
  
  // Debug: log unread count changes
  useEffect(() => {
    console.log('Unread count changed:', unreadCount);
  }, [unreadCount]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [hasOpenDialog, setHasOpenDialog] = useState(false);
  const [error, setError] = useState(null);
  const [userData, setUserData] = useState(null);
  const [clientSearchTerm, setClientSearchTerm] = useState('');
  const [isClientSelectOpen, setIsClientSelectOpen] = useState(false);
  const dataLoadedRef = useRef(false);
  const [userProfile, setUserProfile] = useState(null);
  const [referralLinkDialogOpen, setReferralLinkDialogOpen] = useState(false);
  const qrCodeRef = useRef(null);
  const limitedQrCodeRefs = useRef({});
  const [linkType, setLinkType] = useState('simple'); // 'simple' or 'limited'
  const [maxClients, setMaxClients] = useState(30);
  const [expiryDate, setExpiryDate] = useState('');
  const [expiryTime, setExpiryTime] = useState('');
  const [limitedLinks, setLimitedLinks] = useState([]); // array of { id, url, maxClients, expiryDate, createdAt }

  // Debug sidebar state changes
  useEffect(() => {
    console.log('Sidebar state changed to:', sidebarOpen, 'isMobile:', isMobile, 'language:', language);
  }, [sidebarOpen, isMobile, language]);
  
  // Check if mobile
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Check if any dialog is open and close sidebar if needed
  useEffect(() => {
    const checkForDialogs = () => {
      const dialogs = document.querySelectorAll('[role="dialog"], .dialog, [data-state="open"]');
      const hasOpenDialog = Array.from(dialogs).some(dialog => {
        const rect = dialog.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });
      
      setHasOpenDialog(hasOpenDialog);
      
      if (hasOpenDialog && sidebarOpen) {
        console.log('Dialog detected, closing sidebar');
        setSidebarOpen(false);
      }
    };

    // Check immediately
    checkForDialogs();
    
    // Set up observer to watch for dialog changes
    const observer = new MutationObserver(checkForDialogs);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'data-state']
    });

    return () => observer.disconnect();
  }, [sidebarOpen]);

  // Add visibility change listener
  useEffect(() => {
    const handleVisibilityChange = () => {
      console.log('Visibility changed:', document.visibilityState);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // Listen for system messages updates
  useEffect(() => {
    const handleSystemMessagesUpdate = () => {
      refreshCount();
    };

    EventBus.on('systemMessagesUpdated', handleSystemMessagesUpdate);
    return () => {
      EventBus.off('systemMessagesUpdated', handleSystemMessagesUpdate);
    };
  }, [refreshCount]);

  useEffect(() => {
    const loadUserData = async () => {
      if (!user) return;
      // don't run twice
      if (dataLoadedRef.current) return;
  
      console.log('Loading auth user data (id & email)…');
      setIsLoading(true);
      setError(null);
  
      try {
        // Only id & email are available on the auth user
        const authData = {
          id:    user.id,
          email: user.email,
        };
  
        console.log('Auth user loaded:', authData);
        setUserData(authData);
        dataLoadedRef.current = true;
      } catch (err) {
        console.error('Error loading auth user data:', err);
        setError('Failed to load user data. Please refresh.');
      } finally {
        setIsLoading(false);
      }
    };
  
    loadUserData();
  }, [user]);

  useEffect(() => {
    let isMounted = true;
    const loadProfile = async () => {
      if (!user) {
        if (isMounted) setUserProfile(null);
        return;
      }

      try {
        const profile = await getMyProfile();
        if (isMounted) {
          setUserProfile(profile);
        }
      } catch (err) {
        console.error('Error loading user profile in layout:', err);
      }
    };

    loadProfile();
    return () => {
      isMounted = false;
    };
  }, [user]);

  const handleClientChange = (userCode) => {
    selectClient(userCode);
    setIsClientSelectOpen(false);
    setClientSearchTerm(''); // Clear search when client is selected
    // Close sidebar on mobile when client is selected
    if (isMobile) {
      setSidebarOpen(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      navigate('/login');
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  const handleLanguageSwitch = (lang) => {
    toggleLanguage();
    if (lang === 'he') {
      EventBus.emit('translateMenu', 'he');
    }
  };

  const generateClientReferralLink = () => {
    if (!userProfile?.id) return '';
    // Encode the dietitian ID in base64 and use hash fragment to hide it from URL when copying
    // The signup page needs to read window.location.hash to get the ID
    const encodedId = btoa(userProfile.id);
    return `https://betterchoice.one/signup#d=${encodedId}`;
  };

  const generateLimitedLink = () => {
    if (!userProfile?.id) return '';
    
    // Combine date and time into ISO format
    let expiryDateTime = null;
    if (expiryDate && expiryTime) {
      const dateTimeString = `${expiryDate}T${expiryTime}:00`;
      expiryDateTime = new Date(dateTimeString).toISOString();
    } else if (expiryDate) {
      // If only date is provided, set to end of day
      const dateTimeString = `${expiryDate}T23:59:59`;
      expiryDateTime = new Date(dateTimeString).toISOString();
    }

    // Create a data object with manager_id and optional limits
    const linkData = {
      manager_id: userProfile.id,
      max_clients: parseInt(maxClients) || 30,
      ...(expiryDateTime && { expiry_date: expiryDateTime })
    };

    // Encode the entire object in base64
    const encodedData = btoa(JSON.stringify(linkData));
    return `https://betterchoice.one/signup#d=${encodedData}`;
  };

  const [isGeneratingLink, setIsGeneratingLink] = useState(false);

  const handleGenerateLimitedLink = async () => {
    if (!userProfile?.id || !expiryDate) {
      toast({
        title: translations?.error || 'Error',
        description: translations?.expiryDateRequired || 'Expiry date is required for limited links.',
        variant: 'destructive',
      });
      return;
    }

    setIsGeneratingLink(true);
    try {
      // Combine date and time into ISO format
      let expiryDateTime = null;
      if (expiryDate && expiryTime) {
        const dateTimeString = `${expiryDate}T${expiryTime}:00`;
        expiryDateTime = new Date(dateTimeString).toISOString();
      } else if (expiryDate) {
        // If only date is provided, set to end of day
        const dateTimeString = `${expiryDate}T23:59:59`;
        expiryDateTime = new Date(dateTimeString).toISOString();
      }

      const linkId = crypto.randomUUID?.() || `link-${Date.now()}`;
      // link_id ties this link to a DB row so each limited link gets its own slot (current_count, max_slots, expires_at)
      const linkData = {
        link_id: linkId,
        manager_id: userProfile.id,
        max_clients: parseInt(maxClients) || 30,
        ...(expiryDateTime && { expiry_date: expiryDateTime })
      };

      // Call API to create registration link record in database (INSERTs one row per link)
      const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://dietitian-be.azurewebsites.net';
      const response = await fetch(`${API_BASE_URL}/api/db/registration-links`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(linkData),
      });

      // Encode the entire object in base64 for the URL (signup decodes and uses link_id for find/increment)
      const encodedData = btoa(JSON.stringify(linkData));
      const link = `https://betterchoice.one/signup#d=${encodedData}`;
      const newEntry = {
        id: linkId,
        url: link,
        maxClients: parseInt(maxClients) || 30,
        expiryDate: expiryDateTime || expiryDate || null,
        createdAt: Date.now(),
      };

      if (response.ok) {
        setLimitedLinks(prev => [...prev, newEntry]);
        toast({
          title: translations?.linkGenerated || 'Link Generated',
          description: translations?.limitedLinkGenerated || 'Limited registration link generated successfully.',
        });
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Failed to create registration link record' }));
        console.error('Failed to create registration link record:', errorData);
        toast({
          title: translations?.error || 'Error',
          description: errorData.error || translations?.failedToGenerateLink || 'Failed to generate link.',
          variant: 'destructive',
        });
        // Still add the link even if DB call fails
        setLimitedLinks(prev => [...prev, newEntry]);
      }
    } catch (err) {
      console.error('Error creating registration link record:', err);
      toast({
        title: translations?.error || 'Error',
        description: err.message || translations?.failedToGenerateLink || 'Failed to generate link.',
        variant: 'destructive',
      });
      // Still add the link even if DB call fails (URL will have link_id; signup may 404 on find until DB is up)
      let expiryDateTime = null;
      if (expiryDate && expiryTime) {
        const dateTimeString = `${expiryDate}T${expiryTime}:00`;
        expiryDateTime = new Date(dateTimeString).toISOString();
      } else if (expiryDate) {
        const dateTimeString = `${expiryDate}T23:59:59`;
        expiryDateTime = new Date(dateTimeString).toISOString();
      }
      const linkId = crypto.randomUUID?.() || `link-${Date.now()}`;
      const linkData = {
        link_id: linkId,
        manager_id: userProfile.id,
        max_clients: parseInt(maxClients) || 30,
        ...(expiryDateTime && { expiry_date: expiryDateTime })
      };
      const encodedData = btoa(JSON.stringify(linkData));
      const link = `https://betterchoice.one/signup#d=${encodedData}`;
      const newEntry = {
        id: linkId,
        url: link,
        maxClients: parseInt(maxClients) || 30,
        expiryDate: expiryDateTime || expiryDate || null,
        createdAt: Date.now(),
      };
      setLimitedLinks(prev => [...prev, newEntry]);
    } finally {
      setIsGeneratingLink(false);
    }
  };

  // Clear limited links list when switching away from limited tab
  useEffect(() => {
    if (linkType !== 'limited') {
      setLimitedLinks([]);
    }
  }, [linkType]);

  const handleCopyReferralLink = async (linkUrl) => {
    const link = linkUrl ?? (linkType === 'limited' ? '' : generateClientReferralLink());
    if (!link) {
      toast({
        title: translations?.error || 'Error',
        description: translations?.unableToGenerateLink || 'Unable to generate referral link.',
        variant: 'destructive',
      });
      return;
    }
    try {
      await navigator.clipboard.writeText(link);
      toast({
        title: translations?.copied || 'Copied',
        description: translations?.referralLinkCopied || 'Client referral link copied to clipboard.',
      });
    } catch (err) {
      console.error('❌ Failed to copy referral link:', err);
      toast({
        title: translations?.error || 'Error',
        description: translations?.copyFailed || 'Unable to copy the referral link.',
        variant: 'destructive',
      });
    }
  };

  const getCurrentLink = () => {
    if (linkType === 'limited') {
      return limitedLinks[0]?.url || '';
    }
    return generateClientReferralLink();
  };

  const removeLimitedLink = (id) => {
    setLimitedLinks(prev => prev.filter(l => l.id !== id));
    delete limitedQrCodeRefs.current?.[id];
  };

  const formatExpiry = (expiry) => {
    if (!expiry) return '';
    try {
      const d = new Date(expiry);
      return isNaN(d.getTime()) ? '' : d.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
    } catch { return ''; }
  };

  const handleCopyQRCodeImage = async (linkId) => {
    try {
      const qrContainer = linkType === 'limited' && linkId != null ? limitedQrCodeRefs.current?.[linkId] : qrCodeRef.current;
      if (!qrContainer) {
        throw new Error('QR code container not found');
      }

      const svgElement = qrContainer.querySelector('svg');
      if (!svgElement) {
        throw new Error('QR code SVG not found');
      }

      // Get SVG as string with explicit dimensions
      const svgData = new XMLSerializer().serializeToString(svgElement);
      const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(svgBlob);

      // Create an image to convert SVG to canvas
      const img = new Image();
      
      // High DPI scaling for crisp images
      const devicePixelRatio = window.devicePixelRatio || 2;
      const scale = Math.max(devicePixelRatio, 2); // Minimum 2x for quality
      
      // Base dimensions
      const baseQrDisplaySize = 300; // Increased base size for better quality
      const baseCanvasWidth = 800;
      const baseCanvasHeight = 1000;
      const basePadding = 80;
      
      // Scaled dimensions for high DPI
      const qrDisplaySize = baseQrDisplaySize * scale;
      const canvasWidth = baseCanvasWidth * scale;
      const canvasHeight = baseCanvasHeight * scale;
      const padding = basePadding * scale;
      
      // Brand colors from emerald/green palette
      const emerald500 = '#10B981'; // emerald-500 - Bright emerald for brand name
      const emerald600 = '#059669'; // emerald-600 - Medium emerald
      const emerald700 = '#047857'; // emerald-700 - Dark emerald
      const emerald800 = '#065f46'; // emerald-800 - Very dark emerald
      const emerald950 = '#022c22'; // emerald-950 - Darkest emerald
      const emerald50 = '#ecfdf5'; // emerald-50 - Light background
      const white = '#FFFFFF';
      
      img.onload = async () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = canvasWidth;
          canvas.height = canvasHeight;
          const ctx = canvas.getContext('2d');
          
          // Enable high-quality image smoothing
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          
          // Draw gradient background (emerald gradient)
          const gradient = ctx.createLinearGradient(0, 0, 0, canvasHeight);
          gradient.addColorStop(0, emerald600);
          gradient.addColorStop(0.5, emerald700);
          gradient.addColorStop(1, emerald950);
          ctx.fillStyle = gradient;
          ctx.fillRect(0, 0, canvasWidth, canvasHeight);
          
          // Add brand name at top with emerald color
          ctx.fillStyle = emerald500;
          ctx.font = `bold ${54 * scale}px Inter, system-ui, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          ctx.fillText('BetterChoice AI', canvasWidth / 2, 60 * scale);
          
          // Add main heading in white
          ctx.fillStyle = white;
          ctx.font = `bold ${42 * scale}px Inter, system-ui, sans-serif`;
          ctx.fillText('Sign Up', canvasWidth / 2, 135 * scale);
          
          // Add subtitle
          ctx.font = `${27 * scale}px Inter, system-ui, sans-serif`;
          ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
          ctx.fillText('Scan to get started', canvasWidth / 2, 190 * scale);
          
          // Draw emerald-50 rounded rectangle for QR code area with shadow effect
          const whiteAreaY = 255 * scale;
          const whiteAreaHeight = qrDisplaySize + (padding * 2);
          const whiteAreaWidth = qrDisplaySize + (padding * 2);
          const whiteAreaX = (canvasWidth - whiteAreaWidth) / 2;
          const borderRadius = 30 * scale;
          
          // Shadow
          ctx.shadowColor = 'rgba(5, 150, 105, 0.3)';
          ctx.shadowBlur = 30 * scale;
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = 15 * scale;
          
          ctx.fillStyle = emerald50;
          ctx.beginPath();
          ctx.moveTo(whiteAreaX + borderRadius, whiteAreaY);
          ctx.arcTo(whiteAreaX + whiteAreaWidth, whiteAreaY, whiteAreaX + whiteAreaWidth, whiteAreaY + borderRadius, borderRadius);
          ctx.arcTo(whiteAreaX + whiteAreaWidth, whiteAreaY + whiteAreaHeight, whiteAreaX + whiteAreaWidth - borderRadius, whiteAreaY + whiteAreaHeight, borderRadius);
          ctx.arcTo(whiteAreaX, whiteAreaY + whiteAreaHeight, whiteAreaX, whiteAreaY + whiteAreaHeight - borderRadius, borderRadius);
          ctx.arcTo(whiteAreaX, whiteAreaY, whiteAreaX + borderRadius, whiteAreaY, borderRadius);
          ctx.closePath();
          ctx.fill();
          
          // Reset shadow
          ctx.shadowColor = 'transparent';
          ctx.shadowBlur = 0;
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = 0;
          
          // Draw the QR code in the center at high resolution
          const qrX = whiteAreaX + padding;
          const qrY = whiteAreaY + padding;
          ctx.drawImage(img, qrX, qrY, qrDisplaySize, qrDisplaySize);
          
          // Add footer text
          ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
          ctx.font = '16px Inter, system-ui, sans-serif';
          
          // Convert canvas to blob with high quality
          canvas.toBlob(async (blob) => {
            try {
              if (!blob) {
                throw new Error('Failed to create image blob');
              }
              await navigator.clipboard.write([
                new ClipboardItem({ 'image/png': blob })
              ]);
              toast({
                title: translations?.copied || 'Copied',
                description: translations?.qrCodeCopied || 'QR code image copied to clipboard.',
              });
            } catch (err) {
              console.error('❌ Failed to copy QR code image:', err);
              toast({
                title: translations?.error || 'Error',
                description: translations?.copyFailed || 'Unable to copy the QR code image.',
                variant: 'destructive',
              });
            } finally {
              URL.revokeObjectURL(url);
            }
          }, 'image/png', 1.0); // Maximum quality (1.0)
        } catch (err) {
          console.error('❌ Failed to process QR code image:', err);
          toast({
            title: translations?.error || 'Error',
            description: translations?.copyFailed || 'Unable to copy the QR code image.',
            variant: 'destructive',
          });
          URL.revokeObjectURL(url);
        }
      };
      
      img.onerror = () => {
        toast({
          title: translations?.error || 'Error',
          description: translations?.copyFailed || 'Unable to copy the QR code image.',
          variant: 'destructive',
        });
        URL.revokeObjectURL(url);
      };
      
      img.src = url;
    } catch (err) {
      console.error('❌ Failed to copy QR code image:', err);
      toast({
        title: translations?.error || 'Error',
        description: translations?.copyFailed || 'Unable to copy the QR code image.',
        variant: 'destructive',
      });
    }
  };

  // Filter clients based on search term (search both name and user_code)
  const filteredClients = clients.filter(client => {
    const searchTerm = clientSearchTerm.toLowerCase();
    const name = client.full_name?.toLowerCase() || '';
    const userCode = client.user_code?.toLowerCase() || '';
    return name.includes(searchTerm) || userCode.includes(searchTerm);
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-4">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md w-full text-center">
          <h2 className="text-xl font-semibold text-red-800 mb-2">{translations.connectionError}</h2>
          <p className="text-red-700 mb-4">{error}</p>
          <Button onClick={() => window.location.reload()} variant="outline">
            {translations.retry}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-50">
      {/* System Message Modal */}
      <SystemMessageModal />

      {/* Client Referral Link Dialog */}
      <Dialog open={referralLinkDialogOpen} onOpenChange={(open) => {
        setReferralLinkDialogOpen(open);
        if (!open) {
          // Reset form when dialog closes
          setLinkType('simple');
          setMaxClients(30);
          setExpiryDate('');
          setExpiryTime('');
          setLimitedLinks([]);
        }
      }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ExternalLink className="h-5 w-5 text-primary" />
              {translations?.clientReferralLink || 'Client Referral Link'}
            </DialogTitle>
            <DialogDescription>
              {translations?.clientReferralLinkSubtitle ||
                'Generate a link to share with clients. When they sign up using this link, they will automatically be assigned to you.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Tabs value={linkType} onValueChange={setLinkType} className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="simple">
                  {translations?.simpleLink || 'Simple Link'}
                </TabsTrigger>
                <TabsTrigger value="limited">
                  {translations?.limitedLink || 'Limited Link'}
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="simple" className="space-y-4">
                <div className="flex flex-col gap-4 md:flex-row md:items-start">
                  <div className="flex-1">
                    <Input
                      value={generateClientReferralLink()}
                      readOnly
                      className="font-mono text-sm"
                      onClick={(e) => e.target.select()}
                    />
                    <p className="mt-2 text-xs text-muted-foreground">
                      {translations?.referralLinkHint ||
                        'Click to select and copy, or use the copy button. Clients who sign up using this link will be automatically assigned to you.'}
                    </p>
                    <Button
                      onClick={handleCopyReferralLink}
                      className="mt-4 gap-2"
                      disabled={!userProfile?.id}
                    >
                      <Copy className="h-4 w-4" />
                      {translations?.copyLink || 'Copy Link'}
                    </Button>
                  </div>
                  {userProfile?.id && (
                    <div className={cn("flex flex-col items-center gap-2", isRTL ? "md:mr-4" : "md:ml-4")}>
                      <div ref={qrCodeRef} className="bg-white p-3 rounded-lg border border-gray-200">
                        <QRCode
                          value={generateClientReferralLink()}
                          size={128}
                          style={{ height: "auto", maxWidth: "100%", width: "100%" }}
                          viewBox={`0 0 256 256`}
                        />
                      </div>
                      <Button
                        onClick={handleCopyQRCodeImage}
                        variant="outline"
                        size="sm"
                        className="gap-2"
                      >
                        <Copy className="h-3.5 w-3.5" />
                        {translations?.copyQRCode || 'Copy QR Code'}
                      </Button>
                    </div>
                  )}
                </div>
              </TabsContent>
              
              <TabsContent value="limited" className="space-y-4">
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="max-clients">
                        {translations?.maxClients || 'Max Clients'} (1-30)
                      </Label>
                      <Input
                        id="max-clients"
                        type="number"
                        min="1"
                        max="30"
                        value={maxClients}
                        onChange={(e) => {
                          const value = parseInt(e.target.value) || 1;
                          setMaxClients(Math.min(Math.max(value, 1), 30));
                        }}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="expiry-date">
                        {translations?.expiryDate || 'Expiry Date'}
                      </Label>
                      <Input
                        id="expiry-date"
                        type="date"
                        value={expiryDate}
                        onChange={(e) => setExpiryDate(e.target.value)}
                        min={new Date().toISOString().split('T')[0]}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="expiry-time">
                      {translations?.expiryTime || 'Expiry Time'} ({translations?.optional || 'Optional'})
                    </Label>
                      <Input
                        id="expiry-time"
                        type="time"
                        value={expiryTime}
                        onChange={(e) => setExpiryTime(e.target.value)}
                      />
                  </div>
                  
                  <Button
                    onClick={handleGenerateLimitedLink}
                    className="w-full gap-2"
                    disabled={!userProfile?.id || !expiryDate || isGeneratingLink}
                  >
                    {isGeneratingLink 
                      ? (translations?.generating || 'Generating...')
                      : (translations?.generateLink || 'Generate Limited Link')
                    }
                  </Button>
                  
                  {limitedLinks.length > 0 && (
                    <div className="space-y-4">
                      <Label>{translations?.generatedLinks || 'Generated Links'}</Label>
                      <p className="text-xs text-muted-foreground">
                        {translations?.limitedLinkHint ||
                          'Each link includes max clients and expiry date limits. Generate more with different settings.'}
                      </p>
                      <div className="space-y-3 max-h-[280px] overflow-y-auto">
                        {limitedLinks.map((item) => (
                          <div key={item.id} className="rounded-lg border bg-muted/30 p-3 space-y-2">
                            <div className="flex justify-between items-start gap-2">
                              <div className="flex-1 min-w-0">
                                <Input
                                  value={item.url}
                                  readOnly
                                  className="font-mono text-sm"
                                  onClick={(e) => e.target.select()}
                                />
                                <p className="text-xs text-muted-foreground mt-1">
                                  {translations?.maxClients || 'Max'} {item.maxClients} {translations?.clients || 'clients'}
                                  {item.expiryDate ? ` · ${translations?.expires || 'expires'} ${formatExpiry(item.expiryDate)}` : ''}
                                </p>
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="flex-shrink-0 text-muted-foreground hover:text-destructive"
                                onClick={() => removeLimitedLink(item.id)}
                                aria-label={translations?.remove || 'Remove'}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <Button
                                onClick={() => handleCopyReferralLink(item.url)}
                                size="sm"
                                className="gap-2"
                              >
                                <Copy className="h-3.5 w-3.5" />
                                {translations?.copyLink || 'Copy Link'}
                              </Button>
                              {userProfile?.id && (
                                <>
                                  <div
                                    ref={(el) => { if (el) limitedQrCodeRefs.current[item.id] = el; }}
                                    className="bg-white p-2 rounded border border-gray-200 inline-flex"
                                  >
                                    <QRCode
                                      value={item.url}
                                      size={96}
                                      style={{ height: 'auto', maxWidth: '100%', width: '100%' }}
                                      viewBox="0 0 256 256"
                                    />
                                  </div>
                                  <Button
                                    onClick={() => handleCopyQRCodeImage(item.id)}
                                    variant="outline"
                                    size="sm"
                                    className="gap-2"
                                  >
                                    <Copy className="h-3.5 w-3.5" />
                                    {translations?.copyQRCode || 'Copy QR Code'}
                                  </Button>
                                </>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </DialogContent>
      </Dialog>
      
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-white/80 backdrop-blur-xl shadow-sm">
        <div className="flex h-16 items-center px-2 md:px-6 gap-1 md:gap-4">
          {/* Mobile Menu Button */}
          <Button
            variant="ghost"
            className="md:hidden hover:bg-primary/10 flex-shrink-0"
            size="icon"
            onClick={() => {
              console.log('Open button clicked, current sidebarOpen:', sidebarOpen);
              setSidebarOpen(true);
              console.log('setSidebarOpen(true) called');
            }}
          >
            <MenuIcon className="h-5 w-5" />
          </Button>

          {/* Logo */}
          <div className="hidden md:flex items-center mr-6 flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="relative">
                <img src="/images/logos/logo-placeholder.png" alt="BetterChoice Logo" className="w-10 h-10 drop-shadow-md" />
                <div className="absolute inset-0 rounded-full bg-gradient-to-br from-primary/20 to-transparent"></div>
              </div>
              <div className="flex flex-col">
                <h1 className="text-lg font-bold text-gradient-primary">BetterChoice</h1>
                <p className="text-xs text-muted-foreground/60">{translations.professionalNutrition || 'Professional Nutrition'}</p>
              </div>
            </div>
          </div>

          {/* Mobile Logo */}
          <div className="md:hidden flex items-center mr-2 flex-shrink-0">
            <div className="flex items-center gap-2">
              <div className="relative">
                <img src="/images/logos/logo-placeholder.png" alt="BetterChoice Logo" className="w-8 h-8 drop-shadow-md" />
                <div className="absolute inset-0 rounded-full bg-gradient-to-br from-primary/20 to-transparent"></div>
              </div>
              <h1 className="text-base font-bold text-gradient-primary">BetterChoice</h1>
            </div>
          </div>
          
          {/* Client Selection */}
          <div className="flex-1 flex justify-center min-w-0">
            {clients.length > 0 && (
              <Select 
                value={selectedUserCode || ''} 
                onValueChange={handleClientChange}
                open={isClientSelectOpen}
                onOpenChange={setIsClientSelectOpen}
              >
                <SelectTrigger className="w-full max-w-[150px] sm:max-w-[200px] md:max-w-[280px] bg-white/90 backdrop-blur-sm border border-border/60 shadow-sm hover:border-primary/40 transition-all duration-300 text-xs sm:text-sm md:text-base h-9 sm:h-10 md:h-11 px-3 md:px-4 rounded-lg">
                  <SelectValue placeholder={translations.selectClient || 'Select Client'} />
                </SelectTrigger>
                <SelectContent className="bg-white/95 backdrop-blur-xl border-border/60 shadow-lg rounded-lg w-[280px] max-w-[90vw]">
                  {/* Search Input */}
                  <div className="p-3 border-b border-border/30">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search by name or code..."
                        value={clientSearchTerm}
                        onChange={(e) => setClientSearchTerm(e.target.value)}
                        className="pl-10 h-9 bg-white/80 border-border/40 focus:border-primary/60"
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>
                  </div>
                  
                  {/* Client List */}
                  <div className="max-h-[300px] overflow-y-auto overflow-x-hidden">
                    {filteredClients.length > 0 ? (
                      filteredClients.map((client) => (
                        <SelectItem 
                          key={client.user_code} 
                          value={client.user_code} 
                          className="hover:bg-primary/5 rounded-md mx-2 mb-1"
                        >
                          <div className="flex items-center gap-3 w-full min-w-0">
                            <div className="w-6 h-6 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
                              <User className="h-3 w-3 text-primary" />
                            </div>
                            <div className="flex-1 min-w-0 overflow-hidden">
                              <div className="font-medium text-gray-800 truncate">
                                {client.full_name || 'No Name'}
                              </div>
                              <div className="text-xs text-gray-500 truncate">
                                {translations.clientCode}: {client.user_code}
                              </div>
                            </div>
                          </div>
                        </SelectItem>
                      ))
                    ) : (
                      <div className="p-4 text-center text-sm text-muted-foreground">
                        {clientSearchTerm ? 'No clients found matching your search.' : 'No clients available.'}
                      </div>
                    )}
                  </div>
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Right side - Language toggle and user menu */}
          <div className="flex items-center gap-1 md:gap-3 flex-shrink-0">
            <LanguageToggle />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-8 w-8 md:h-10 md:w-10 rounded-full hover:bg-primary/10 transition-all duration-300">
                  <Avatar className="h-7 w-7 md:h-9 md:w-9 shadow-sm ring-2 ring-primary/10">
                    <AvatarFallback className="bg-gradient-to-br from-primary to-primary-lighter text-white font-semibold text-xs md:text-sm">
                      {userData?.email?.[0]?.toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-64 bg-white/95 backdrop-blur-xl border-border/60 shadow-xl" align="end" forceMount>
                <DropdownMenuItem className="flex-col items-start p-4 hover:bg-primary/5">
                  <div className="text-sm font-semibold text-foreground">{userData?.email}</div>
                  <div className="text-xs text-muted-foreground/70">{userData?.specialization}</div>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/profile" className="flex items-center w-full">
                    <UserIcon className="mr-2 h-4 w-4" />
                    <span>{translations.profile || 'Profile'}</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleSignOut} className="hover:bg-destructive/5 text-destructive">
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>{translations.signOut}</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-50 md:hidden backdrop-blur-sm"
          onClick={() => {
            console.log('Overlay clicked, closing sidebar');
            setSidebarOpen(false);
          }}
        />
      )}

      {/* Sidebar */}
      <div className={cn(
        "fixed inset-y-0 w-64 md:w-72 glass-premium bg-white/90 border-r border-border/40 shadow-xl backdrop-blur-2xl z-[60] transition-transform duration-300 ease-out mobile-sidebar flex flex-col h-full",
        {
          'translate-x-0': (sidebarOpen || !isMobile) && !hasOpenDialog, // Show on desktop or when open on mobile, but not when dialog is open
          '-translate-x-full': (!sidebarOpen && isMobile && language === 'en') || (hasOpenDialog && language === 'en'), // Hide on mobile when closed (LTR) or when dialog is open (LTR)
          'translate-x-full': (!sidebarOpen && isMobile && language === 'he') || (hasOpenDialog && language === 'he'), // Hide on mobile when closed (RTL) or when dialog is open (RTL)
          'left-0': language === 'en',
          'right-0': language === 'he',
          'border-r': language === 'en',
          'border-l': language === 'he'
        }
      )}>
        {/* Header */}
        <div className="flex h-16 flex-shrink-0 items-center justify-between px-6 border-b border-border/30">
          {/* Sidebar Logo */}
          <div className="flex items-center gap-3">
            <div className="relative">
              <img src="/images/logos/logo-placeholder.png" alt="BetterChoice Logo" className="w-8 h-8 drop-shadow-sm" />
              <div className="absolute inset-0 rounded-full bg-gradient-to-br from-primary/20 to-transparent"></div>
            </div>
            <div className="flex flex-col">
              <h1 className="text-lg font-bold text-gradient-primary">BetterChoice</h1>
              <p className="text-xs text-muted-foreground/60">{translations.professionalPlatform || 'Professional Platform'}</p>
            </div>
          </div>
          <button
            className="md:hidden p-2 rounded-lg hover:bg-red-100 hover:text-red-600 transition-colors duration-200"
            onClick={() => {
              console.log('Close button clicked, current sidebarOpen:', sidebarOpen, 'language:', language, 'isMobile:', isMobile);
              setSidebarOpen(false);
              console.log('setSidebarOpen(false) called');
            }}
            aria-label="Close sidebar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable Navigation */}
        <nav className="flex-1 overflow-y-auto space-y-6 p-4">
          {/* Client Management Group */}
          <div className="space-y-1">
            <div className="px-3 mb-2">
              <h3 className="text-xs font-semibold text-muted-foreground/60 uppercase tracking-wider">
                {translations.clientManagement || 'Client Management'}
              </h3>
            </div>
            <Link to="/dietitian-profile" onClick={() => setSidebarOpen(false)}>
              <Button variant="ghost" className="w-full justify-start h-11 rounded-xl hover:bg-primary/8 hover:text-primary-darker transition-all duration-300 group relative">
                <LayoutDashboard className="mr-3 h-5 w-5 group-hover:scale-110 transition-transform duration-300" />
                <span className="font-medium">{translations.dietitianDashboard || 'Dietitian Dashboard'}</span>
                {unreadCount > 0 && (
                  <span className="absolute top-1.5 right-2 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white shadow-md animate-pulse">
                    {unreadCount}
                  </span>
                )}
              </Button>
            </Link>
            <Link to={createPageUrl('Users')} onClick={() => setSidebarOpen(false)}>
              <Button variant="ghost" className="w-full justify-start h-11 rounded-xl hover:bg-primary/8 hover:text-primary-darker transition-all duration-300 group">
                <Users className="mr-3 h-5 w-5 group-hover:scale-110 transition-transform duration-300" />
                <span className="font-medium">{translations.users}</span>
              </Button>
            </Link>
            {(userProfile?.role === 'sys_admin' || userProfile?.role === 'company_manager') && (
              <Link to={createPageUrl('UserManagement')} onClick={() => setSidebarOpen(false)}>
                <Button variant="ghost" className="w-full justify-start h-11 rounded-xl hover:bg-primary/8 hover:text-primary-darker transition-all duration-300 group">
                  <Shield className="mr-3 h-5 w-5 group-hover:scale-110 transition-transform duration-300" />
                  <span className="font-medium">{translations.userManagement || 'User Management'}</span>
                </Button>
              </Link>
            )}
            <Link to="/training" onClick={() => setSidebarOpen(false)}>
              <Button variant="ghost" className="w-full justify-start h-11 rounded-xl hover:bg-orange/8 hover:text-orange transition-all duration-300 group">
                <Dumbbell className="mr-3 h-5 w-5 group-hover:scale-110 transition-transform duration-300" />
                <span className="font-medium">{translations.trainingManagement || 'Training Management'}</span>
              </Button>
            </Link>
          </div>

          {/* Divider */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border/30"></div>
            </div>
          </div>

          {/* Client Tools Group */}
          <div className="space-y-1">
            <div className="px-3 mb-2">
              <h3 className="text-xs font-semibold text-muted-foreground/60 uppercase tracking-wider">
                {translations.clientTools || 'Client Tools'}
              </h3>
            </div>
            <Link to="/dashboard" onClick={() => setSidebarOpen(false)}>
              <Button variant="ghost" className="w-full justify-start h-11 rounded-xl hover:bg-primary/8 hover:text-primary-darker transition-all duration-300 group">
                <Activity className="mr-3 h-5 w-5 group-hover:scale-110 transition-transform duration-300" />
                <span className="font-medium">{translations.home}</span>
              </Button>
            </Link>
            <Link to={createPageUrl('Chat')} onClick={() => setSidebarOpen(false)}>
              <Button variant="ghost" className="w-full justify-start h-11 rounded-xl hover:bg-primary/8 hover:text-primary-darker transition-all duration-300 group">
                <MessageSquare className="mr-3 h-5 w-5 group-hover:scale-110 transition-transform duration-300" />
                <span className="font-medium">{translations.chat}</span>
              </Button>

              <Link to="/menuload" onClick={() => setSidebarOpen(false)}>
              <Button variant="ghost" className="w-full justify-start h-11 rounded-xl hover:bg-info/8 hover:text-info transition-all duration-300 group">
                <FileText className="mr-3 h-5 w-5 group-hover:scale-110 transition-transform duration-300" />
                <span className="font-medium">{translations.menuload}</span>
              </Button>
            </Link>
            
            </Link>
            <Link to={createPageUrl('MenuCreate')} onClick={() => setSidebarOpen(false)}>
              <Button variant="ghost" className="w-full justify-start h-11 rounded-xl hover:bg-success/8 hover:text-success-darker transition-all duration-300 group">
                <ListChecks className="mr-3 h-5 w-5 group-hover:scale-110 transition-transform duration-300" />
                <span className="font-medium">{translations.menuCreate}</span>
              </Button>
            </Link>
            <Link to="/recipes" onClick={() => setSidebarOpen(false)}>
              <Button variant="ghost" className="w-full justify-start h-11 rounded-xl hover:bg-warning/8 hover:text-warning transition-all duration-300 group">
                <FileText className="mr-3 h-5 w-5 group-hover:scale-110 transition-transform duration-300" />
                <span className="font-medium">{translations.recipes}</span>
              </Button>
            </Link>
            <Link to="/weight-logs" onClick={() => setSidebarOpen(false)}>
              <Button variant="ghost" className="w-full justify-start h-11 rounded-xl hover:bg-purple/8 hover:text-purple transition-all duration-300 group">
                <Scale className="mr-3 h-5 w-5 group-hover:scale-110 transition-transform duration-300" />
                <span className="font-medium">{translations.weightLogs || 'Weight & Body Fat Logs'}</span>
              </Button>
            </Link>
            <Link to="/nutrition-analytics" onClick={() => setSidebarOpen(false)}>
              <Button variant="ghost" className="w-full justify-start h-11 rounded-xl hover:bg-emerald/8 hover:text-emerald transition-all duration-300 group">
                <Apple className="mr-3 h-5 w-5 group-hover:scale-110 transition-transform duration-300" />
                <span className="font-medium">{translations.nutritionAnalytics || 'Nutrition Analytics'}</span>
              </Button>
            </Link>
           
          </div>
        </nav>
        
        {/* Sidebar Footer */}
        <div className="flex-shrink-0 p-4 space-y-3 border-t border-border/30 bg-white/50 backdrop-blur-sm">
          <Button 
            className="w-full h-11 bg-gradient-to-r from-primary to-primary-lighter hover:from-primary/90 hover:to-primary-lighter/90 text-white shadow-md hover:shadow-lg transition-all duration-300 font-medium"
            onClick={() => {
              setReferralLinkDialogOpen(true);
              setSidebarOpen(false);
            }}
          >
            <ExternalLink className="mr-2 h-4 w-4" />
            {translations.clientReferralLink || 'Client Referral Link'}
          </Button>
          <div className="bg-gradient-to-r from-primary/10 to-success/10 rounded-xl p-4 border border-primary/20">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 bg-success rounded-full animate-pulse-glow"></div>
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground/80">{translations.systemStatus || 'System Status'}</p>
                <p className="text-xs text-muted-foreground/60">{translations.allSystemsOperational || 'All systems operational'}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <main className={cn(
        "min-h-[calc(100vh-4rem)] transition-all duration-300 ease-out",
        {
          'md:pl-64 xl:pl-72': language === 'en',
          'md:pr-64 xl:pr-72': language === 'he'
        }
      )}>
        {/* Mobile content overlay when sidebar is open */}
        {sidebarOpen && isMobile && (
          <div className="fixed inset-0 bg-black/20 z-30 md:hidden" onClick={() => setSidebarOpen(false)} />
        )}
        <div className="container mx-auto p-4 md:p-6 max-w-7xl">
          <div className="animate-slide-up">
            <Outlet />
          </div>
        </div>
      </main>
    </div>
  );
}
