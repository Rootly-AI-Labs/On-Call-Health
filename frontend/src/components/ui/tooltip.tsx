"use client"

import { useState, useRef, useEffect } from "react"
import { createPortal } from "react-dom"
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
  const [position, setPosition] = useState({ top: 0, left: 0 })
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isVisible && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect()
      const TOOLTIP_WIDTH = 192 // w-48 = 12rem = 192px
      const GAP = 8

      let top = 0
      let left = 0

      if (side === "top") {
        top = rect.top + window.scrollY - GAP
        left = rect.left + window.scrollX + rect.width / 2
      } else if (side === "bottom") {
        top = rect.bottom + window.scrollY + GAP
        left = rect.left + window.scrollX + rect.width / 2
      } else if (side === "left") {
        top = rect.top + window.scrollY + rect.height / 2
        left = rect.left + window.scrollX - GAP
      } else {
        top = rect.top + window.scrollY + rect.height / 2
        left = rect.right + window.scrollX + GAP
      }

      // Clamp horizontally so tooltip stays within viewport
      const clampedLeft = Math.min(
        Math.max(left, TOOLTIP_WIDTH / 2 + 8),
        window.innerWidth - TOOLTIP_WIDTH / 2 - 8
      )

      setPosition({ top, left: clampedLeft })
    }
  }, [isVisible, side])

  const transformMap = {
    top: "translate(-50%, -100%)",
    bottom: "translate(-50%, 0%)",
    left: "translate(-100%, -50%)",
    right: "translate(0%, -50%)",
  }

  const arrowMap = {
    top: "top-full left-1/2 -translate-x-1/2 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-gray-900",
    bottom: "bottom-full left-1/2 -translate-x-1/2 border-l-4 border-r-4 border-b-4 border-l-transparent border-r-transparent border-b-gray-900",
    left: "left-full top-1/2 -translate-y-1/2 border-t-4 border-b-4 border-l-4 border-t-transparent border-b-transparent border-l-gray-900",
    right: "right-full top-1/2 -translate-y-1/2 border-t-4 border-b-4 border-r-4 border-t-transparent border-b-transparent border-r-gray-900",
  }

  return (
    <div
      ref={containerRef}
      className="relative inline-block"
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
    >
      {children}
      {isVisible && typeof document !== "undefined" && createPortal(
        <div
          className={cn(
            "fixed z-9999 px-3 py-2 text-sm text-white bg-neutral-900 rounded-lg shadow-lg w-48 wrap-break-word pointer-events-none",
            className
          )}
          style={{
            top: position.top,
            left: position.left,
            transform: transformMap[side],
          }}
        >
          {content}
          <div className={cn("absolute w-0 h-0", arrowMap[side])} />
        </div>,
        document.body
      )}
    </div>
  )
}