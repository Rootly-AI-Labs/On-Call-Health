import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Loader2 } from "lucide-react"

interface JiraIntegrationCardProps {
  onConnect: () => void
  isConnecting: boolean
}

export function JiraIntegrationCard({ onConnect, isConnecting }: JiraIntegrationCardProps) {
  return (
    <Card className="border-2 border-blue-200 max-w-2xl mx-auto">
      <CardContent className="pt-6 space-y-4">
        <div className="space-y-2">
          <h3 className="text-lg font-semibold text-slate-900">Connect Your Jira Account</h3>
        </div>

        <div className="space-y-3">
          <Button
            onClick={onConnect}
            disabled={isConnecting}
            className="w-full bg-blue-600 hover:bg-blue-700"
          >
            {isConnecting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Connecting...
              </>
            ) : (
              <>
                <svg
                  viewBox="0 0 24 24"
                  className="w-4 h-4 mr-2"
                  fill="currentColor"
                >
                  <path d="M11.571 11.513H0a5.218 5.218 0 0 0 5.232 5.215h2.13v2.057A5.215 5.215 0 0 0 12.575 24V12.518a1.005 1.005 0 0 0-1.005-1.005zm5.723-5.756H5.736a5.215 5.215 0 0 0 5.215 5.214h2.129v2.058a5.218 5.218 0 0 0 5.215 5.232V6.758a1.001 1.001 0 0 0-1.001-1.001zM23.013 0H11.455a5.215 5.215 0 0 0 5.215 5.215h2.129v2.057A5.215 5.215 0 0 0 24 12.483V1.005A1.001 1.001 0 0 0 23.013 0Z"/>
                </svg>
                Connect with Jira
              </>
            )}
          </Button>

          <p className="text-xs text-slate-500 text-center">
            You'll be redirected to Atlassian to authorize access
          </p>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-blue-900 mb-2">What we'll collect:</h4>
          <ul className="text-xs text-blue-800 space-y-1">
            <li>• Issue assignments and worklogs</li>
            <li>• Project membership and roles</li>
            <li>• Time tracking and estimates</li>
            <li>• Issue status and transitions</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  )
}
