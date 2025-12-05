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
          w-96 shadow-2xl border-blue-200 bg-white
          transform transition-all duration-300 ease-out
          ${isAnimatingOut
            ? 'translate-y-4 opacity-0 scale-95'
            : 'translate-y-0 opacity-100 scale-100'
          }
        `}
      >
        <div className="p-4">
          {/* Header with icon and close button */}
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100">
                <RefreshCw className="h-5 w-5 text-blue-600" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-gray-900">
                  Sync Recommended
                </h3>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDismiss}
              className="h-6 w-6 p-0 hover:bg-gray-100 rounded-full"
            >
              <X className="h-4 w-4 text-gray-400" />
            </Button>
          </div>

          {/* Message */}
          <p className="text-sm text-gray-600 mb-4 ml-13">
            {message}
          </p>

          {/* Actions */}
          <div className="flex items-center gap-2 ml-13">
            <Button
              onClick={handleSync}
              className="bg-blue-600 hover:bg-blue-700 text-white h-9 px-4 text-sm font-medium"
            >
              <Users className="h-4 w-4 mr-2" />
              Sync Now
            </Button>
            <Button
              variant="ghost"
              onClick={handleDismiss}
              className="h-9 px-4 text-sm text-gray-600 hover:text-gray-900"
            >
              Dismiss
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}
