import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';

export default function MenuCodeDisplay({ menuCode }) {
  const { toast } = useToast();

  const copyToClipboard = () => {
    navigator.clipboard.writeText(menuCode);
    toast({
      title: "Meal Plan code copied",
      description: "Meal Plan code has been copied to your clipboard",
      duration: 2000
    });
  };

  return (
    <div className="flex items-center gap-2">
      <div className="bg-gray-100 rounded px-3 py-1 border border-gray-200 font-mono inline-flex items-center">
        <span className="text-[0.75rem] tracking-[0.2em]">{menuCode}</span>
      </div>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-6 w-6" 
              onClick={copyToClipboard}
            >
              <Copy className="h-3.5 w-3.5 text-gray-500" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Copy meal plan code</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}