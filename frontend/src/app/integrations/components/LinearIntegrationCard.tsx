import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Loader2 } from "lucide-react"

interface LinearIntegrationCardProps {
  onConnect: () => void
  isConnecting: boolean
}

export function LinearIntegrationCard({ onConnect, isConnecting }: LinearIntegrationCardProps) {
  return (
    <Card className="border-2 border-neutral-200 max-w-2xl mx-auto">
      <CardContent className="pt-6 space-y-4">
        <div className="space-y-2">
          <h3 className="text-lg font-semibold text-slate-900">Connect Your Linear Account</h3>
        </div>

        <div className="space-y-3">
          <Button
            onClick={onConnect}
            disabled={isConnecting}
            className="w-full bg-black hover:bg-neutral-800 text-white"
          >
            {isConnecting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Connecting...
              </>
            ) : (
              <>
                <Image src="/images/linear-logo.png" alt="Linear" width={16} height={16} className="mr-2" />
                Connect with Linear
              </>
            )}
          </Button>

          <p className="text-xs text-slate-500 text-center">
            You'll be redirected to Linear to authorize access
          </p>
        </div>

        <div className="bg-neutral-100 border border-neutral-200 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-neutral-900 mb-2">What we'll collect:</h4>
          <ul className="text-xs text-neutral-700 space-y-1">
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
