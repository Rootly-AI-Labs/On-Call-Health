"use client"

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { AlertTriangle, Loader2 } from "lucide-react"

interface Integration {
  id: number
  name: string
  organization_name?: string
}

interface AnalysisResult {
  id: string
  integration_id: number
  created_at: string
  time_range?: number
  analysis_data?: any
}

interface DeleteAnalysisDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  analysisToDelete: AnalysisResult | null
  integrations: Integration[]
  onConfirmDelete: () => Promise<void>
  onCancel: () => void
  isDeleting?: boolean
}

export function DeleteAnalysisDialog({
  open,
  onOpenChange,
  analysisToDelete,
  integrations,
  onConfirmDelete,
  onCancel,
  isDeleting = false
}: DeleteAnalysisDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center">
              <AlertTriangle className="w-4 h-4 text-red-600" />
            </div>
            <span>Delete Analysis</span>
          </DialogTitle>
          <DialogDescription className="text-neutral-700 mt-2">
            Are you sure you want to delete this analysis? This action cannot be undone and will permanently remove all data associated with this analysis.
          </DialogDescription>
        </DialogHeader>

        {analysisToDelete && (
          <div className="my-4 p-3 bg-neutral-100 rounded-lg border">
            <div className="flex items-center justify-between text-sm">
              <div className="flex flex-col">
                <span className="font-medium text-neutral-900">
                  {(() => {
                    // Find the integration for this analysis
                    const integration = integrations.find(i => i.id === Number(analysisToDelete.integration_id)) ||
                                      integrations.find(i => String(i.id) === String(analysisToDelete.integration_id));

                    // Use multiple sources to get the organization name (same as dashboard header)
                    return integration?.name ||
                           integration?.organization_name ||
                           analysisToDelete.analysis_data?.metadata?.organization_name ||
                           'Organization';
                  })()}
                </span>
                <span className="text-neutral-500">
                  {new Date(analysisToDelete.created_at).toLocaleString([], {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true,
                    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
                  })}
                </span>
              </div>
              <span className="text-neutral-500 text-xs">
                {analysisToDelete.time_range || 30} days
              </span>
            </div>
          </div>
        )}

        <DialogFooter className="flex space-x-2">
          <Button
            variant="outline"
            onClick={onCancel}
            className="flex-1"
            disabled={isDeleting}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirmDelete}
            className="flex-1 bg-red-600 hover:bg-red-700"
            disabled={isDeleting}
          >
            {isDeleting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Deleting...
              </>
            ) : (
              "Delete Analysis"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}