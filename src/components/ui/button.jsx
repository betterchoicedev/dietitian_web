import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva } from "class-variance-authority";

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 active:scale-95 hover:scale-[1.02] hover:-translate-y-0.5 shadow-[0_4px_14px_0_rgb(0,0,0,0.1)]",
  {
    variants: {
      variant: {
        default:
          "bg-gradient-to-br from-primary to-primary-darker text-primary-foreground hover:shadow-primary/25 hover:from-primary-lighter hover:to-primary relative overflow-hidden before:absolute before:inset-0 before:bg-white/20 before:transform before:scale-x-0 before:opacity-0 hover:before:scale-x-100 hover:before:opacity-100 before:transition-transform before:duration-300 after:absolute after:inset-0 after:bg-gradient-to-r after:from-transparent after:via-white/20 after:to-transparent after:transform after:-skew-x-12 after:translate-x-[-150%] hover:after:translate-x-[150%] after:transition-transform after:duration-1000",
        destructive:
          "bg-gradient-to-br from-destructive to-destructive-darker text-destructive-foreground hover:shadow-destructive/25 relative overflow-hidden before:absolute before:inset-0 before:bg-white/20 before:transform before:scale-x-0 before:opacity-0 hover:before:scale-x-100 hover:before:opacity-100 before:transition-transform before:duration-300",
        outline:
          "border-2 border-primary bg-background/50 backdrop-blur-sm text-primary hover:bg-primary/10 hover:text-primary-darker transition-colors shadow-sm hover:shadow-primary/25 hover:border-primary-darker",
        secondary:
          "bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80 hover:shadow-secondary/25",
        ghost: 
          "hover:bg-accent hover:text-accent-foreground transition-colors duration-300",
        link: 
          "text-primary underline-offset-4 hover:underline transition-all",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-10 rounded-md px-8",
        icon: "h-9 w-9 p-2",
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
