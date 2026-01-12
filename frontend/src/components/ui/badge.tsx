import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        /* Primary badge - Purple background */
        default:
          "border-transparent bg-purple-700 text-white hover:bg-purple-800",
        /* Secondary badge - Light purple background */
        secondary:
          "border-transparent bg-purple-200 text-purple-900 hover:bg-purple-300",
        /* Success state - Green */
        success:
          "border-transparent bg-green-100 text-green-800 hover:bg-green-200",
        /* Warning state - Orange */
        warning:
          "border-transparent bg-orange-700 text-white hover:bg-orange-800",
        /* Destructive badge - Orange-900 */
        destructive:
          "border-transparent bg-orange-900 text-white hover:bg-orange-700",
        /* Outline badge - Border only */
        outline: "border-neutral-300 bg-white text-neutral-900 hover:bg-neutral-100",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }