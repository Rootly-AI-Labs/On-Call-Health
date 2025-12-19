import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { AlertCircle, CheckCircle, Calendar, Globe, Key, Trash2, TestTube, Loader2, Users } from "lucide-react"
import type { LinearIntegration } from "../types"

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

interface LinearConnectedCardProps {
  integration: LinearIntegration
  onDisconnect: () => void
  onTest: () => void
  isLoading?: boolean
}

export function LinearConnectedCard({
  integration,
  onDisconnect,
  onTest,
  isLoading = false
}: LinearConnectedCardProps) {
  return (
    <Card className="border-2 border-green-200 bg-green-50/50 max-w-2xl mx-auto">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-black rounded-lg flex items-center justify-center">
              <LinearIcon className="w-6 h-6 text-white" />
            </div>
            <div>
              <CardTitle className="text-lg flex items-center space-x-2">
                <span>Linear</span>
                <Badge variant="secondary" className="bg-green-100 text-green-700">
                  <CheckCircle className="w-3 h-3 mr-1" />
                  Connected
                </Badge>
              </CardTitle>
              <p className="text-sm text-slate-600">Project management and issue tracking</p>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Integration Details */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          {integration.workspace_name && (
            <div className="flex items-center space-x-2">
              <Globe className="w-4 h-4 text-slate-400" />
              <div>
                <div className="font-medium">Workspace</div>
                <div className="text-slate-600">{integration.workspace_name}</div>
              </div>
            </div>
          )}

          {integration.linear_display_name && (
            <div className="flex items-center space-x-2">
              <CheckCircle className="w-4 h-4 text-slate-400" />
              <div>
                <div className="font-medium">User</div>
                <div className="text-slate-600">{integration.linear_display_name}</div>
              </div>
            </div>
          )}

          {integration.linear_email && (
            <div className="flex items-center space-x-2">
              <Calendar className="w-4 h-4 text-slate-400" />
              <div>
                <div className="font-medium">Email</div>
                <div className="text-slate-600">{integration.linear_email}</div>
              </div>
            </div>
          )}

          <div className="flex items-center space-x-2">
            <Key className="w-4 h-4 text-slate-400" />
            <div>
              <div className="font-medium">Token Type</div>
              <div className="text-slate-600 flex items-center space-x-1">
                <span>OAuth 2.0 with PKCE</span>
                {integration.supports_refresh && (
                  <span title="Auto-refresh enabled">
                    <CheckCircle className="w-3 h-3 text-green-500" />
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <Calendar className="w-4 h-4 text-slate-400" />
            <div>
              <div className="font-medium">Last Updated</div>
              <div className="text-slate-600">
                {new Date(integration.updated_at).toLocaleDateString()}
              </div>
            </div>
          </div>
        </div>

        {/* Token Expiry */}
        {integration.token_expires_at && (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
            <div className="flex items-start space-x-2 text-xs text-gray-700">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <div>
                <div className="font-medium">Token Expiry</div>
                <div>{new Date(integration.token_expires_at).toLocaleString()}</div>
                {integration.supports_refresh && (
                  <div className="text-gray-600 mt-1">Auto-refresh is enabled</div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center flex-wrap gap-2 pt-2">
          <Button
            size="sm"
            variant="outline"
            onClick={onTest}
            disabled={isLoading}
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <TestTube className="w-4 h-4 mr-2" />
            )}
            Test Connection
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={onDisconnect}
            disabled={isLoading}
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Disconnect
          </Button>
        </div>

        {/* Info Note */}
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-600">
          <div className="font-medium mb-1">Data Collection</div>
          <div>
            We collect issue assignments, priorities, due dates, and team membership data to analyze workload patterns and identify burnout risk.
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
