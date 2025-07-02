import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva } from "class-variance-authority";

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 disabled:saturate-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 active:scale-[0.98] hover:scale-[1.02] hover:-translate-y-0.5 relative overflow-hidden font-medium",
  {
    variants: {
      variant: {
        default:
          "bg-gradient-to-br from-primary via-primary-lighter to-primary-accent text-white shadow-[0_8px_30px_rgb(59,130,246,0.3)] hover:shadow-[0_12px_40px_rgb(59,130,246,0.4)] border border-primary/20 before:absolute before:inset-0 before:bg-gradient-to-r before:from-white/0 before:via-white/20 before:to-white/0 before:transform before:scale-x-0 before:opacity-0 hover:before:scale-x-100 hover:before:opacity-100 before:transition-all before:duration-500 after:absolute after:inset-0 after:bg-gradient-to-r after:from-transparent after:via-white/30 after:to-transparent after:transform after:-skew-x-12 after:translate-x-[-150%] hover:after:translate-x-[150%] after:transition-transform after:duration-1000 after:ease-out",
        destructive:
          "bg-gradient-to-br from-destructive to-red-600 text-destructive-foreground shadow-[0_8px_30px_rgb(239,68,68,0.3)] hover:shadow-[0_12px_40px_rgb(239,68,68,0.4)] border border-destructive/20 relative overflow-hidden before:absolute before:inset-0 before:bg-white/20 before:transform before:scale-x-0 before:opacity-0 hover:before:scale-x-100 hover:before:opacity-100 before:transition-transform before:duration-300",
        outline:
          "border-2 border-primary/30 bg-background/80 backdrop-blur-sm text-primary hover:bg-primary/5 hover:text-primary-darker hover:border-primary/60 shadow-[0_2px_8px_rgba(0,0,0,0.04)] hover:shadow-[0_4px_16px_rgba(37,99,235,0.15)] transition-all duration-300",
        secondary:
          "bg-gradient-to-br from-secondary to-secondary-darker text-secondary-foreground shadow-[0_4px_14px_rgba(0,0,0,0.06)] hover:shadow-[0_6px_20px_rgba(0,0,0,0.1)] border border-secondary-darker/50 hover:border-secondary-darker",
        ghost: 
          "text-foreground/80 hover:bg-accent/50 hover:text-accent-foreground backdrop-blur-sm transition-all duration-300",
        link: 
          "text-primary underline-offset-4 hover:underline transition-all hover:text-primary-lighter",
        success:
          "bg-gradient-to-br from-success to-success-lighter text-white shadow-[0_8px_30px_rgb(5,150,105,0.3)] hover:shadow-[0_12px_40px_rgb(5,150,105,0.4)] border border-success/20",
        warning:
          "bg-gradient-to-br from-warning to-warning-lighter text-white shadow-[0_8px_30px_rgb(245,158,11,0.3)] hover:shadow-[0_12px_40px_rgb(245,158,11,0.4)] border border-warning/20",
      },
      size: {
        default: "h-10 px-4 py-2 text-sm",
        sm: "h-8 rounded-lg px-3 text-xs",
        lg: "h-12 rounded-xl px-8 text-base",
        xl: "h-14 rounded-xl px-10 text-lg",
        icon: "h-10 w-10 p-2.5",
        "icon-sm": "h-8 w-8 p-2",
        "icon-lg": "h-12 w-12 p-3",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

const Button = React.forwardRef(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : "button"
  return (
    (<Comp
      className={cn(buttonVariants({ variant, size, className }))}
      ref={ref}
      {...props} />)
  );
})
Button.displayName = "Button"

export { Button, buttonVariants }
