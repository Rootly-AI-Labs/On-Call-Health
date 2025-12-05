"use client"

import { useState, useEffect } from "react"
import { X, RefreshCw, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"

interface TeamSyncPromptProps {
  isVisible: boolean
  message?: string
  onSync: () => void
  onDismiss: () => void
}

export function TeamSyncPrompt({
  isVisible,
  message = "Team members affected - Resync recommended",
  onSync,
  onDismiss
}: TeamSyncPromptProps) {
  const [show, setShow] = useState(false)
  const [isAnimatingOut, setIsAnimatingOut] = useState(false)

  useEffect(() => {
    if (isVisible) {
      setShow(true)
      setIsAnimatingOut(false)
    } else {
      setIsAnimatingOut(true)
      const timer = setTimeout(() => setShow(false), 300)
      return () => clearTimeout(timer)
    }
  }, [isVisible])

  const handleDismiss = () => {
    setIsAnimatingOut(true)
    setTimeout(() => {
      onDismiss()
    }, 300)
  }

  const handleSync = () => {
    setIsAnimatingOut(true)
    setTimeout(() => {
      onSync()
    }, 200)
  }

  if (!show) return null

  return (
    <div className="fixed bottom-24 right-6 z-[100]">
      <Card
        className={`
          w-96 shadow-xl border-0 bg-white overflow-hidden
          transform transition-all duration-300 ease-out
          ${isAnimatingOut
            ? 'translate-y-4 opacity-0 scale-95'
            : 'translate-y-0 opacity-100 scale-100'
          }
        `}
      >
        {/* Gradient top border */}
        <div className="h-1 bg-gradient-to-r from-blue-500 via-blue-600 to-purple-600" />

        <div className="p-5">
          {/* Header with icon and close button */}
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100">
                <RefreshCw className="h-4 w-4 text-blue-600" />
              </div>
              <div className="flex-1">
                <h3 className="text-base font-bold text-gray-900 mb-0.5">
                  Sync Recommended
                </h3>
                <p className="text-xs text-blue-600 font-medium">
                  Keep your team up to date
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDismiss}
              className="h-7 w-7 p-0 hover:bg-gray-100 rounded-full -mt-1 -mr-1"
            >
              <X className="h-4 w-4 text-gray-400 hover:text-gray-600" />
            </Button>
          </div>

          {/* Message */}
          <p className="text-sm text-gray-600 leading-relaxed mb-5 pl-15">
            {message}
          </p>

          {/* Actions */}
          <div className="flex items-center gap-2 pl-15">
            <Button
              onClick={handleSync}
              className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white h-10 px-5 text-sm font-semibold shadow-md hover:shadow-lg transition-all"
            >
              <Users className="h-4 w-4 mr-2" />
              Sync Now
            </Button>
            <Button
              variant="ghost"
              onClick={handleDismiss}
              className="h-10 px-4 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-50"
            >
              Dismiss
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}
