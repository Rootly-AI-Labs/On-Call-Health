import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, AlertCircle } from "lucide-react";

interface AuthMethodSwitchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fromMethod: "oauth" | "manual";
  toMethod: "oauth" | "manual";
  integrationName: string;
  isDisconnecting: boolean;
  onConfirmSwitch: () => void;
}

export function AuthMethodSwitchDialog({
  open,
  onOpenChange,
  fromMethod,
  toMethod,
  integrationName,
  isDisconnecting,
  onConfirmSwitch
}: AuthMethodSwitchDialogProps) {
  const fromLabel = fromMethod === "oauth" ? "OAuth" : "API Token";
  const toLabel = toMethod === "oauth" ? "OAuth" : "API Token";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Switch to {toLabel}?</DialogTitle>
          <DialogDescription>
            Switching from {fromLabel} to {toLabel} requires disconnecting {integrationName} first.
            You&apos;ll need to reconnect with {toLabel} after disconnecting.
          </DialogDescription>
        </DialogHeader>

        {/* Data preservation reassurance - always shown */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
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
            onClick={onConfirmSwitch}
            disabled={isDisconnecting}
          >
            {isDisconnecting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Disconnecting...
              </>
            ) : (
              `Disconnect ${integrationName}`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
