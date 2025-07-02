import React from 'react';
import { Globe } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function FloatingLanguageToggle({ className, variant = "floating" }) {
  const { language, toggleLanguage, translations } = useLanguage();

  const baseClasses = "flex items-center gap-2 font-medium transition-all duration-200";
  
  const variants = {
    floating: "fixed bottom-6 right-6 z-50 bg-white/90 backdrop-blur-md shadow-lg border border-gray-200 hover:shadow-xl hover:bg-white",
    inline: "border border-green-400 text-green-700 bg-white/80 shadow-sm hover:bg-green-50 hover:text-green-800",
    minimal: "text-gray-600 hover:text-gray-800 bg-transparent hover:bg-gray-100"
  };

  return (
    <Button
      onClick={toggleLanguage}
      className={cn(baseClasses, variants[variant], className)}
      size={variant === "floating" ? "default" : "sm"}
    >
      <Globe className="h-4 w-4" />
      <span>{translations.switchLanguage}</span>
    </Button>
  );
}

export function LanguageToggle({ className, ...props }) {
  return <FloatingLanguageToggle variant="inline" className={className} {...props} />;
} 