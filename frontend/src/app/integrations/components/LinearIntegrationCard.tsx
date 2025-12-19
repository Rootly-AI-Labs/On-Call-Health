import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Loader2 } from "lucide-react"

// Linear logo SVG icon - official circle with diagonal stripes
const LinearIcon = ({ className }: { className?: string }) => (
  <svg
    viewBox="0 0 100 100"
    className={className}
    fill="currentColor"
  >
    <path fillRule="evenodd" clipRule="evenodd" d="M50 100C77.6142 100 100 77.6142 100 50C100 22.3858 77.6142 0 50 0C22.3858 0 0 22.3858 0 50C0 77.6142 22.3858 100 50 100ZM70.7 16.8L16.8 70.7C14.5 66.2 13.2 61.1 12.9 55.8L55.8 12.9C61.1 13.2 66.2 14.5 70.7 16.8ZM83.2 29.3L29.3 83.2C33.8 85.5 38.9 86.8 44.2 87.1L87.1 44.2C86.8 38.9 85.5 33.8 83.2 29.3ZM22.3 77.7L77.7 22.3C75.1 19.9 72.2 17.9 69 16.3L16.3 69C17.9 72.2 19.9 75.1 22.3 77.7ZM30.9 83.7L83.7 30.9C82.1 27.7 80.1 24.8 77.7 22.3L22.3 77.7C24.8 80.1 27.7 82.1 30.9 83.7Z" />
  </svg>
)

interface LinearIntegrationCardProps {
  onConnect: () => void
  isConnecting: boolean
}

export function LinearIntegrationCard({ onConnect, isConnecting }: LinearIntegrationCardProps) {
  return (
    <Card className="border-2 border-gray-200 max-w-2xl mx-auto">
      <CardContent className="pt-6 space-y-4">
        <div className="space-y-2">
          <h3 className="text-lg font-semibold text-slate-900">Connect Your Linear Account</h3>
        </div>

        <div className="space-y-3">
          <Button
            onClick={onConnect}
            disabled={isConnecting}
            className="w-full bg-black hover:bg-gray-800 text-white"
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

        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-gray-900 mb-2">What we'll collect:</h4>
          <ul className="text-xs text-gray-700 space-y-1">
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
