"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"

interface TooltipProps {
  children: React.ReactNode
  content: string
  className?: string
  side?: "top" | "bottom" | "left" | "right"
}

export function Tooltip({ 
  children, 
  content, 
  className = "", 
  side = "top" 
}: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false)

  const sideClasses = {
    top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
    bottom: "top-full left-1/2 -translate-x-1/2 mt-2", 
    left: "right-full top-1/2 -translate-y-1/2 mr-2",
    right: "left-full top-1/2 -translate-y-1/2 ml-2"
  }

  const arrowClasses = {
    top: "top-full left-1/2 -translate-x-1/2 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-gray-900",
    bottom: "bottom-full left-1/2 -translate-x-1/2 border-l-4 border-r-4 border-b-4 border-l-transparent border-r-transparent border-b-gray-900",
    left: "left-full top-1/2 -translate-y-1/2 border-t-4 border-b-4 border-l-4 border-t-transparent border-b-transparent border-l-gray-900",
    right: "right-full top-1/2 -translate-y-1/2 border-t-4 border-b-4 border-r-4 border-t-transparent border-b-transparent border-r-gray-900"
  }

  return (
    <div 
      className="relative inline-block"
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
    >
      {children}
      {isVisible && (
        <div 
          className={cn(
            "absolute z-50 px-3 py-2 text-sm text-white bg-neutral-900 rounded-lg shadow-lg max-w-xs break-words",
            sideClasses[side],
            className
          )}
        >
          {content}
          <div className={cn("absolute w-0 h-0", arrowClasses[side])} />
        </div>
      )}
    </div>
  )
}