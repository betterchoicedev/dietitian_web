import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  AlertTriangle,
  AlertCircle,
  Info,
  Megaphone,
  Wrench,
  X,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { EventBus } from '@/utils/EventBus';
import { getMyProfile } from '@/utils/auth';

const MESSAGE_TYPE_CONFIG = {
  info: {
    icon: Info,
    colorClass: 'text-blue-600 bg-blue-50 border-blue-200',
    badgeVariant: 'default',
    iconBg: 'bg-blue-100',
  },
  warning: {
    icon: AlertTriangle,
    colorClass: 'text-yellow-600 bg-yellow-50 border-yellow-200',
    badgeVariant: 'warning',
    iconBg: 'bg-yellow-100',
  },
  alert: {
    icon: AlertCircle,
    colorClass: 'text-red-600 bg-red-50 border-red-200',
    badgeVariant: 'destructive',
    iconBg: 'bg-red-100',
  },
  announcement: {
    icon: Megaphone,
    colorClass: 'text-purple-600 bg-purple-50 border-purple-200',
    badgeVariant: 'secondary',
    iconBg: 'bg-purple-100',
  },
  maintenance: {
    icon: Wrench,
    colorClass: 'text-orange-600 bg-orange-50 border-orange-200',
    badgeVariant: 'outline',
    iconBg: 'bg-orange-100',
  },
};

const PRIORITY_CONFIG = {
  low: { 
    label: { en: 'Low', he: 'נמוך' }, 
    color: 'bg-gray-500' 
  },
  medium: { 
    label: { en: 'Medium', he: 'בינוני' }, 
    color: 'bg-blue-500' 
  },
  high: { 
    label: { en: 'High', he: 'גבוה' }, 
    color: 'bg-orange-500' 
  },
  urgent: { 
    label: { en: 'Urgent', he: 'דחוף' }, 
    color: 'bg-red-500' 
  },
};

export default function SystemMessageModal() {
  const { translations, language } = useLanguage();
  const [messages, setMessages] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchUrgentMessages();
  }, []);

  const fetchUrgentMessages = async () => {
    try {
      setLoading(true);
      const now = new Date().toISOString();

      // Get current user ID and profile
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.log('No authenticated user');
        setLoading(false);
        return;
      }

      // Get current user's profile (role and company_id)
      const myProfile = await getMyProfile();
      console.log('👤 Current user profile:', { id: myProfile.id, role: myProfile.role, company_id: myProfile.company_id });

      let allUrgentMessages = [];

      // If sys_admin, show all urgent messages
      if (myProfile.role === 'sys_admin') {
        const { data, error } = await supabase
          .from('system_messages')
          .select('*')
          .eq('is_active', true)
          .eq('priority', 'urgent')
          .order('created_at', { ascending: false });

        if (error) throw error;
        allUrgentMessages = data || [];
      } else {
        // For non-sys_admin users, fetch all urgent messages and filter based on company rules
        const { data, error } = await supabase
          .from('system_messages')
          .select('*')
          .eq('is_active', true)
          .eq('priority', 'urgent')
          .order('created_at', { ascending: false });

        if (error) throw error;

        // Get all profiles to determine roles and company relationships
        const { data: allProfiles, error: profilesError } = await supabase
          .from('profiles')
          .select('id, role, company_id');

        if (profilesError) {
          console.warn('⚠️ Could not fetch profiles, falling back to basic filtering:', profilesError);
          // Fallback to basic filtering if profiles table is not available
          const { data: basicMessages, error: basicError } = await supabase
            .from('system_messages')
            .select('*')
            .eq('is_active', true)
            .eq('priority', 'urgent')
            .or(`directed_to.is.null,directed_to.eq.${user.id}`)
            .order('created_at', { ascending: false });
          
          if (basicError) throw basicError;
          allUrgentMessages = basicMessages || [];
        } else {
          // Create maps for quick lookup
          const profileMap = {};
          const companyManagersMap = {}; // company_id -> [manager_ids]

          allProfiles?.forEach(profile => {
            profileMap[profile.id] = profile;
            
            if (profile.role === 'company_manager' && profile.company_id) {
              if (!companyManagersMap[profile.company_id]) {
                companyManagersMap[profile.company_id] = [];
              }
              companyManagersMap[profile.company_id].push(profile.id);
            }
          });

          // Filter messages based on visibility rules
          allUrgentMessages = (data || []).filter(message => {
            // Check if this is a personalized meal plan request by title
            const isMealPlanRequest = message.title === 'בקשה לתוכנית תזונה מותאמת' || 
                                       message.title === 'Request for Personalized Meal Plan';
            
            // For non-meal-plan-request messages, use simple filtering
            if (!isMealPlanRequest) {
              // Broadcast messages: visible to everyone
              if (!message.directed_to) {
                return true;
              }
              // Message directed to current user: always visible
              return message.directed_to === myProfile.id;
            }

            // For meal plan request messages, apply company-based visibility rules
            // Message directed to current user: always visible
            if (message.directed_to === myProfile.id) {
              return true;
            }

            // If no directed_to, don't show (meal plan requests should always be directed)
            if (!message.directed_to) {
              return false;
            }

            // Get the target profile
            const targetProfile = profileMap[message.directed_to];
            if (!targetProfile) {
              return false;
            }

            // Show to company managers in the same company as the target
            if (myProfile.role === 'company_manager' && 
                targetProfile.company_id && 
                myProfile.company_id === targetProfile.company_id) {
              return true;
            }

            return false;
          });
        }
      }

      // Filter by date range in JavaScript (more reliable than complex SQL)
      const activeUrgentMessages = allUrgentMessages.filter(msg => {
        const startDate = msg.start_date;
        const endDate = msg.end_date;
        
        // If no start_date, message is active
        const isStarted = !startDate || new Date(startDate) <= new Date(now);
        // If no end_date, message is active
        const isNotExpired = !endDate || new Date(endDate) >= new Date(now);
        
        return isStarted && isNotExpired;
      });

      // Filter messages that haven't been seen yet
      const viewedMessages = JSON.parse(localStorage.getItem('viewedSystemMessages') || '[]');
      const unseenMessages = activeUrgentMessages.filter(msg => !viewedMessages.includes(msg.id));

      if (unseenMessages.length > 0) {
        setMessages(unseenMessages);
        setIsOpen(true);
      }
    } catch (error) {
      console.error('Error fetching system messages:', error);
    } finally {
      setLoading(false);
    }
  };

  const markAsViewed = (messageId) => {
    const viewedMessages = JSON.parse(localStorage.getItem('viewedSystemMessages') || '[]');
    if (!viewedMessages.includes(messageId)) {
      viewedMessages.push(messageId);
      localStorage.setItem('viewedSystemMessages', JSON.stringify(viewedMessages));
      // Notify that messages were updated
      EventBus.emit('systemMessagesUpdated');
    }
  };

  const handleClose = () => {
    // Mark current message as viewed
    if (messages[currentIndex]) {
      markAsViewed(messages[currentIndex].id);
    }
    
    // If there are more messages, show the next one
    if (currentIndex < messages.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      setIsOpen(false);
    }
  };

  const handleDismissAll = () => {
    // Mark all messages as viewed
    messages.forEach(msg => markAsViewed(msg.id));
    setIsOpen(false);
    // Notify that messages were updated
    EventBus.emit('systemMessagesUpdated');
  };

  const handleNext = () => {
    if (messages[currentIndex]) {
      markAsViewed(messages[currentIndex].id);
    }
    if (currentIndex < messages.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const handlePrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  if (loading || messages.length === 0) {
    return null;
  }

  const currentMessage = messages[currentIndex];
  if (!currentMessage) return null;

  const typeConfig = MESSAGE_TYPE_CONFIG[currentMessage.message_type] || MESSAGE_TYPE_CONFIG.info;
  const Icon = typeConfig.icon;
  const priorityConfig = PRIORITY_CONFIG[currentMessage.priority] || PRIORITY_CONFIG.medium;
  const priorityLabel = priorityConfig.label[language] || priorityConfig.label.en;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="max-w-2xl p-0 gap-0 overflow-hidden border-2 shadow-2xl">
        {/* Header with gradient */}
        <div className={cn(
          "relative px-6 pt-6 pb-4 border-b-2",
          typeConfig.colorClass
        )}>
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-white/40 to-transparent"></div>
          
          <DialogHeader className="space-y-3">
            <div className="flex items-start gap-4">
              {/* Icon */}
              <div className={cn(
                "flex-shrink-0 w-14 h-14 rounded-full flex items-center justify-center shadow-lg",
                typeConfig.iconBg
              )}>
                <Icon className="h-7 w-7" />
              </div>

              {/* Title and badges */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <Badge variant={typeConfig.badgeVariant} className="text-xs font-semibold px-2 py-0.5">
                    {currentMessage.message_type.toUpperCase()}
                  </Badge>
                  <div className="flex items-center gap-1">
                    <div className={cn("w-2 h-2 rounded-full animate-pulse", priorityConfig.color)}></div>
                    <span className="text-xs font-medium opacity-80">
                      {priorityLabel} {language === 'en' ? 'Priority' : 'עדיפות'}
                    </span>
                  </div>
                </div>
                <DialogTitle className="text-2xl font-bold leading-tight pr-8">
                  {currentMessage.title}
                </DialogTitle>
              </div>
            </div>
          </DialogHeader>

          {/* Message counter */}
          {messages.length > 1 && (
            <div className="mt-3 flex items-center justify-between">
              <span className="text-sm font-medium opacity-75">
                {language === 'en' 
                  ? `Message ${currentIndex + 1} of ${messages.length}`
                  : `הודעה ${currentIndex + 1} מתוך ${messages.length}`
                }
              </span>
              <div className="flex gap-1">
                {messages.map((_, idx) => (
                  <div
                    key={idx}
                    className={cn(
                      "w-2 h-2 rounded-full transition-all",
                      idx === currentIndex 
                        ? "bg-current w-6" 
                        : "bg-current/30"
                    )}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="px-6 py-6 max-h-[60vh] overflow-y-auto">
          <div className="prose prose-sm max-w-none">
            <p className="text-base leading-relaxed text-gray-700 whitespace-pre-wrap">
              {currentMessage.content}
            </p>
          </div>

          {/* Date information */}
          <div className="mt-6 pt-4 border-t border-gray-200">
            <div className="flex flex-wrap gap-4 text-sm text-gray-600">
              {currentMessage.start_date && (
                <div>
                  <span className="font-medium">
                    {language === 'en' ? 'Active from:' : 'פעיל מ:'}
                  </span>{' '}
                  {new Date(currentMessage.start_date).toLocaleDateString(
                    language === 'en' ? 'en-US' : 'he-IL'
                  )}
                </div>
              )}
              {currentMessage.end_date && (
                <div>
                  <span className="font-medium">
                    {language === 'en' ? 'Until:' : 'עד:'}
                  </span>{' '}
                  {new Date(currentMessage.end_date).toLocaleDateString(
                    language === 'en' ? 'en-US' : 'he-IL'
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <DialogFooter className="px-6 py-4 bg-gray-50 border-t flex-col sm:flex-row gap-2">
          <div className="flex gap-2 w-full sm:w-auto">
            {currentIndex > 0 && (
              <Button
                variant="outline"
                onClick={handlePrevious}
                className="flex-1 sm:flex-initial"
              >
                {language === 'en' ? (
                  <>
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    Previous
                  </>
                ) : (
                  <>
                    הקודם
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </>
                )}
              </Button>
            )}
            {currentIndex < messages.length - 1 && (
              <Button
                variant="outline"
                onClick={handleNext}
                className="flex-1 sm:flex-initial"
              >
                {language === 'en' ? (
                  <>
                    Next
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </>
                ) : (
                  <>
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    הבא
                  </>
                )}
              </Button>
            )}
          </div>
          
          <div className="flex gap-2 w-full sm:w-auto sm:ml-auto">
            {messages.length > 1 && (
              <Button
                variant="ghost"
                onClick={handleDismissAll}
                className="flex-1 sm:flex-initial"
              >
                {language === 'en' ? 'Dismiss All' : 'התעלם מהכל'}
              </Button>
            )}
            <Button
              onClick={handleClose}
              className="flex-1 sm:flex-initial bg-gradient-to-r from-primary to-primary-darker hover:opacity-90 transition-all duration-200 shadow-md hover:shadow-lg"
            >
              {currentIndex < messages.length - 1 
                ? (language === 'en' ? 'Next' : 'הבא')
                : (language === 'en' ? 'Got it' : 'הבנתי')
              }
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

