import * as React from "react"

import { cn } from "@/lib/utils"

const Card = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "rounded-2xl border border-border/60 bg-gradient-to-br from-card/95 to-card/85 backdrop-blur-xl text-card-foreground shadow-[0_8px_40px_rgba(0,0,0,0.08)] hover:shadow-[0_16px_60px_rgba(0,0,0,0.12)] transition-all duration-500 hover:-translate-y-2 hover:scale-[1.01] relative overflow-hidden before:absolute before:inset-0 before:bg-gradient-to-br before:from-primary/[0.02] before:to-accent/[0.05] before:opacity-0 hover:before:opacity-100 before:transition-opacity before:duration-500 after:absolute after:inset-0 after:bg-gradient-to-r after:from-transparent after:via-white/5 after:to-transparent after:opacity-0 hover:after:opacity-100 after:transition-opacity after:duration-300",
      className
    )}
    {...props} />
))
Card.displayName = "Card"

const CardHeader = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col space-y-2 p-6 relative z-10", className)}
    {...props} />
))
CardHeader.displayName = "CardHeader"

const CardTitle = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("text-xl font-bold leading-tight tracking-tight bg-gradient-to-br from-foreground via-foreground/90 to-foreground/70 bg-clip-text text-transparent", className)}
    {...props} />
))
CardTitle.displayName = "CardTitle"

const CardDescription = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("text-sm text-muted-foreground/70 leading-relaxed", className)}
    {...props} />
))
CardDescription.displayName = "CardDescription"

const CardContent = React.forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-6 pt-0 relative z-10", className)} {...props} />
))
CardContent.displayName = "CardContent"

const CardFooter = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-center p-6 pt-0 relative z-10", className)}
    {...props} />
))
CardFooter.displayName = "CardFooter"

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent }
