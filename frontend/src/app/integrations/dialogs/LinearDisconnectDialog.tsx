import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Loader2 } from "lucide-react"

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
