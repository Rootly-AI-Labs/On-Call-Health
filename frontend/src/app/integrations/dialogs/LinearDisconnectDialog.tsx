import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Loader2, AlertCircle } from "lucide-react"

interface LinearDisconnectDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  isDisconnecting: boolean
  onConfirmDisconnect: () => void
}

export function LinearDisconnectDialog({
  open,
  onOpenChange,
  isDisconnecting,
  onConfirmDisconnect
}: LinearDisconnectDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Disconnect Linear Integration</DialogTitle>
          <DialogDescription>
            Are you sure you want to disconnect your Linear integration?
            This will remove access to your Linear workload data, issue tracking metrics, and team information.
            You'll need to reconnect to use Linear features again.
          </DialogDescription>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mt-3">
            <div className="flex items-start space-x-2">
              <AlertCircle className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
              <div className="text-sm">
                <p className="font-medium text-blue-900">Your data is preserved</p>
                <p className="text-blue-700 mt-1">
                  Workspace mappings, user correlations, and historical data remain intact.
                </p>
              </div>
            </div>
          </div>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isDisconnecting}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirmDisconnect}
            disabled={isDisconnecting}
          >
            {isDisconnecting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Disconnecting...
              </>
            ) : (
              "Disconnect Linear"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
