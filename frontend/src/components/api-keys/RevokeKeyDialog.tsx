"use client"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { AlertTriangle, Loader2 } from "lucide-react"
import { ApiKey } from "@/types/apiKey"

interface RevokeKeyDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  keyToRevoke: ApiKey | null
  isRevoking: boolean
  onConfirmRevoke: () => void
  onCancel: () => void
}

export function RevokeKeyDialog({
  open,
  onOpenChange,
  keyToRevoke,
  isRevoking,
  onConfirmRevoke,
  onCancel,
}: RevokeKeyDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-700">
            <AlertTriangle className="w-5 h-5" />
            Revoke API Key
          </DialogTitle>
          <DialogDescription>
            Are you sure you want to revoke this API key?
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {/* Warning */}
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg mb-4">
            <p className="text-sm text-red-800">
              <strong>This action cannot be undone.</strong> Any applications using this key will
              immediately lose access to the API.
            </p>
          </div>

          {/* Key details */}
          {keyToRevoke && (
            <div className="p-3 bg-neutral-50 border border-neutral-200 rounded-lg">
              <div className="text-sm space-y-1">
                <p>
                  <span className="font-medium text-neutral-700">Name:</span>{" "}
                  <span className="text-neutral-900">{keyToRevoke.name}</span>
                </p>
                <p>
                  <span className="font-medium text-neutral-700">Key:</span>{" "}
                  <code className="font-mono text-xs bg-neutral-200 px-1.5 py-0.5 rounded-sm">
                    {keyToRevoke.masked_key}
                  </code>
                </p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={isRevoking}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirmRevoke}
            disabled={isRevoking}
            className="bg-red-600 hover:bg-red-700"
          >
            {isRevoking ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Revoking...
              </>
            ) : (
              "Revoke Key"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
