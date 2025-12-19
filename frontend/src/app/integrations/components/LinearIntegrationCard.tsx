import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Loader2 } from "lucide-react"

// Linear logo SVG icon - official logo with half circle and diagonal stripes
const LinearIcon = ({ className }: { className?: string }) => (
  <svg
    viewBox="0 0 100 100"
    className={className}
    fill="currentColor"
  >
    <path d="M50 0C77.6 0 100 22.4 100 50C100 77.6 77.6 100 50 100C22.4 100 0 77.6 0 50C0 22.4 22.4 0 50 0ZM81.5 68.6L31.4 18.5C25.9 21.2 21.2 25.9 18.5 31.4L68.6 81.5C74.1 78.8 78.8 74.1 81.5 68.6ZM87.9 53.3L46.7 12.1C43.9 11.7 41 11.5 38 11.5L88.5 62C88.5 59 88.3 56.1 87.9 53.3ZM11.5 62L62 11.5C59 11.5 56.1 11.7 53.3 12.1L12.1 53.3C11.7 56.1 11.5 59 11.5 62ZM18.5 68.6C21.2 74.1 25.9 78.8 31.4 81.5L81.5 31.4C78.8 25.9 74.1 21.2 68.6 18.5L18.5 68.6Z" />
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
