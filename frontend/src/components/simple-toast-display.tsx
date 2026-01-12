"use client"

import React from 'react'
import { useToast } from '@/hooks/use-toast-simple'
import { X } from 'lucide-react'

export function SimpleToastDisplay() {
  const { toasts, dismiss } = useToast()

  if (toasts.length === 0) return null

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`
            max-w-md p-4 rounded-lg shadow-lg border flex items-start justify-between
            ${toast.variant === 'destructive' 
              ? 'bg-red-50 border-red-200 text-red-800' 
              : 'bg-white border-neutral-200 text-neutral-900'
            }
          `}
        >
          <div className="flex-1">
            {toast.title && (
              <div className="font-semibold mb-1">{toast.title}</div>
            )}
            {toast.description && (
              <div className="text-sm opacity-90">{toast.description}</div>
            )}
          </div>
          <button
            onClick={() => dismiss(toast.id)}
            className="ml-2 text-neutral-500 hover:text-neutral-700"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  )
}