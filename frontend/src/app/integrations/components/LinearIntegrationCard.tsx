import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Loader2 } from "lucide-react"

// Linear logo SVG icon
const LinearIcon = ({ className }: { className?: string }) => (
  <svg
    viewBox="0 0 100 100"
    className={className}
    fill="currentColor"
  >
    <path d="M1.22541 61.5228c-.2225-.9485.90748-1.5459 1.59638-.857L39.3342 97.1782c.6889.6889.0915 1.8189-.857 1.5765-13.0866-3.3387-23.0959-13.3478-26.4324-26.4324zm13.1628 17.3372L97.1782 39.3342c.6889-.6889.0915-1.8189-.857-1.5765-13.0866 3.3387-23.0959 13.3478-26.4324 26.4324-.2225.9485.90748 1.5459 1.5964.857L10.0948 26.66a1.05 1.05 0 0 1 1.485 1.485l47.2596 47.2596c.6889-.6889.0915-1.8189-.857-1.5765A36.0291 36.0291 0 0 0 31.55 100.26 36.0291 36.0291 0 0 0 58.2252 73.828c.6889.6889 1.8189.0915 1.5765-.857A36.0291 36.0291 0 0 1 86.2349 46.539a36.0291 36.0291 0 0 1 11.5869-3.8038c.9485-.2225 1.5459.9075.857 1.5964L14.388 78.86z" fillRule="evenodd" />
  </svg>
)

interface LinearIntegrationCardProps {
  onConnect: () => void
  isConnecting: boolean
}

export function LinearIntegrationCard({ onConnect, isConnecting }: LinearIntegrationCardProps) {
  return (
    <Card className="border-2 border-indigo-200 max-w-2xl mx-auto">
      <CardContent className="pt-6 space-y-4">
        <div className="space-y-2">
          <h3 className="text-lg font-semibold text-slate-900">Connect Your Linear Account</h3>
        </div>

        <div className="space-y-3">
          <Button
            onClick={onConnect}
            disabled={isConnecting}
            className="w-full bg-indigo-600 hover:bg-indigo-700"
          >
            {isConnecting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Connecting...
              </>
            ) : (
              <>
                <LinearIcon className="w-4 h-4 mr-2" />
                Connect with Linear
              </>
            )}
          </Button>

          <p className="text-xs text-slate-500 text-center">
            You'll be redirected to Linear to authorize access
          </p>
        </div>

        <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-indigo-900 mb-2">What we'll collect:</h4>
          <ul className="text-xs text-indigo-800 space-y-1">
            <li>• Issue assignments and priorities</li>
            <li>• Team membership and projects</li>
            <li>• Due dates and completion status</li>
            <li>• Workload distribution across teams</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  )
}
