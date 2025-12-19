import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { AlertCircle, CheckCircle, Calendar, Globe, Key, Trash2, TestTube, Loader2, Users } from "lucide-react"
import type { LinearIntegration } from "../types"

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
            <Image src="/images/linear-logo.png" alt="Linear" width={40} height={40} />
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
