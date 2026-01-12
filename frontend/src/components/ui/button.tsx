import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        /* Primary CTA button - Purple */
        default: "bg-purple-700 text-white hover:bg-purple-800 active:bg-purple-900",
        /* Secondary button - Light purple */
        secondary:
          "bg-purple-500 text-white hover:bg-purple-600 active:bg-purple-700",
        /* Destructive button - Red */
        destructive:
          "bg-red-500 text-white hover:bg-red-600 active:bg-red-700",
        /* Outline button - Purple border */
        outline:
          "border border-purple-700 bg-white text-purple-700 hover:bg-purple-100 active:bg-purple-200",
        /* Ghost button - No background */
        ghost: "hover:bg-purple-100 text-purple-700 active:bg-purple-200",
        /* Link button - Text only */
        link: "text-purple-700 underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }