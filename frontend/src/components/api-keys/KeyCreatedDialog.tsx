"use client"

import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { AlertTriangle, Check, Copy, Key } from "lucide-react"
import { copyToClipboard } from "@/app/integrations/utils"
import { CreateApiKeyResponse } from "@/types/apiKey"

interface KeyCreatedDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  createdKey: CreateApiKeyResponse | null
}

export function KeyCreatedDialog({
  open,
  onOpenChange,
  createdKey,
}: KeyCreatedDialogProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    if (createdKey?.key) {
      await copyToClipboard(createdKey.key, setCopied)
    }
  }

  const handleClose = () => {
    setCopied(false)
    onOpenChange(false)
  }

  if (!createdKey) return null

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-green-700">
            <Key className="w-5 h-5" />
            API Key Created
          </DialogTitle>
          <DialogDescription>
            Your new API key has been created successfully.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Security Warning */}
          <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-amber-800">
                This is the only time you&apos;ll see this key
              </p>
              <p className="text-sm text-amber-700 mt-1">
                Make sure to copy and store it securely. You won&apos;t be able to see it again.
              </p>
            </div>
          </div>

          {/* Key details */}
          <div className="text-sm text-neutral-600 space-y-1">
            <p><strong>Name:</strong> {createdKey.name}</p>
            {createdKey.expires_at && (
              <p><strong>Expires:</strong> {new Date(createdKey.expires_at).toLocaleDateString()}</p>
            )}
          </div>

          {/* Key display */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1.5">
              Your API Key
            </label>
            <div className="relative">
              <div className="p-3 bg-neutral-100 border border-neutral-200 rounded-lg font-mono text-sm break-all pr-24">
                {createdKey.key}
              </div>
              <Button
                onClick={handleCopy}
                variant="outline"
                size="sm"
                className="absolute right-2 top-1/2 -translate-y-1/2"
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4 mr-1.5 text-green-600" />
                    <span className="text-green-600">Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 mr-1.5" />
                    Copy
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            onClick={handleClose}
            className="bg-purple-700 hover:bg-purple-800"
          >
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
