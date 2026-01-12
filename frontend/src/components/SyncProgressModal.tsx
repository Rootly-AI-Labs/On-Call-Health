import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Loader2, CheckCircle, AlertCircle } from "lucide-react"
import { useEffect, useRef, useState } from "react"

interface SyncProgressModalProps {
  isOpen: boolean
  onClose: () => void
  onStartSync: (addLog: (message: string) => void, setStats: (stats: SyncStats) => void, setError: (error: string) => void, setComplete: () => void) => void
}

interface SyncStats {
  created?: number
  updated?: number
  github_matched?: number
  github_skipped?: number
}

export function SyncProgressModal({ isOpen, onClose, onStartSync }: SyncProgressModalProps) {
  const [logs, setLogs] = useState<string[]>([])
  const [isComplete, setIsComplete] = useState(false)
  const [stats, setStats] = useState<SyncStats | null>(null)
  const [error, setError] = useState<string | null>(null)
  const consoleRef = useRef<HTMLDivElement>(null)
  const hasStartedRef = useRef(false)

  useEffect(() => {
    if (!isOpen) {
      // Reset state when modal closes
      setLogs([])
      setIsComplete(false)
      setStats(null)
      setError(null)
      hasStartedRef.current = false
      return
    }

    // Start sync when modal opens (only once)
    if (!hasStartedRef.current) {
      hasStartedRef.current = true
      const addLog = (message: string) => setLogs(prev => [...prev, message])
      const setStatsCallback = (s: SyncStats) => setStats(s)
      const setErrorCallback = (e: string) => setError(e)
      const setCompleteCallback = () => setIsComplete(true)

      onStartSync(addLog, setStatsCallback, setErrorCallback, setCompleteCallback)
    }
  }, [isOpen, onStartSync])

  useEffect(() => {
    // Auto-scroll to bottom when new logs arrive
    if (consoleRef.current) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight
    }
  }, [logs])

  return (
    <Dialog open={isOpen} onOpenChange={() => {
      if (isComplete || error) {
        onClose()
      }
    }}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {!isComplete && !error && <Loader2 className="w-5 h-5 animate-spin text-purple-600" />}
            {isComplete && <CheckCircle className="w-5 h-5 text-green-600" />}
            {error && <AlertCircle className="w-5 h-5 text-red-600" />}
            Syncing Team Members
          </DialogTitle>
          <DialogDescription>
            {!isComplete && !error && "Please wait while we sync your team members. This may take a minute..."}
            {isComplete && "Sync completed successfully!"}
            {error && "An error occurred during sync."}
          </DialogDescription>
        </DialogHeader>

        {/* Console Output */}
        <div className="flex-1 overflow-hidden flex flex-col">
          <div className="text-xs font-semibold text-neutral-700 mb-2">Console Output:</div>
          <div
            ref={consoleRef}
            className="flex-1 bg-neutral-900 text-green-400 font-mono text-xs p-4 rounded-lg overflow-y-auto"
          >
            {logs.map((log, i) => (
              <div key={i} className="mb-1">
                <span className="text-neutral-500">[{new Date().toLocaleTimeString()}]</span> {log}
              </div>
            ))}
            {!isComplete && !error && (
              <div className="flex items-center gap-2 mt-2">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span className="text-neutral-500">Working...</span>
              </div>
            )}
          </div>
        </div>

        {/* Summary Stats */}
        {isComplete && stats && (
          <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
            <div className="font-semibold text-green-900 mb-2">✅ Sync Summary</div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="text-neutral-700">
                <span className="font-medium">New users:</span> {stats.created || 0}
              </div>
              <div className="text-neutral-700">
                <span className="font-medium">Updated users:</span> {stats.updated || 0}
              </div>
              {stats.github_matched !== undefined && (
                <>
                  <div className="text-neutral-700">
                    <span className="font-medium">GitHub matched:</span> {stats.github_matched}
                  </div>
                  <div className="text-neutral-700">
                    <span className="font-medium">GitHub skipped:</span> {stats.github_skipped || 0}
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
            <div className="font-semibold text-red-900 mb-2">❌ Error</div>
            <div className="text-sm text-red-700">{error}</div>
          </div>
        )}

        {/* Warning */}
        {!isComplete && !error && (
          <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
            <div className="text-xs text-yellow-800">
              ⚠️ <strong>Please do not close this window</strong> until the sync is complete.
              This process may take 1-2 minutes depending on the number of users.
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
