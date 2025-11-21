import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { AlertCircle, CheckCircle, Calendar, Globe, Key, Trash2, TestTube, Loader2, ArrowLeftRight } from "lucide-react"
import type { JiraIntegration } from "../types"

interface JiraConnectedCardProps {
  integration: JiraIntegration
  onDisconnect: () => void
  onTest: () => void
  onSwitchWorkspace?: () => void
  isLoading?: boolean
}

export function JiraConnectedCard({
  integration,
  onDisconnect,
  onTest,
  onSwitchWorkspace,
  isLoading = false
}: JiraConnectedCardProps) {
  return (
    <Card className="border-2 border-green-200 bg-green-50/50 max-w-2xl mx-auto">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
              <svg
                viewBox="0 0 24 24"
                className="w-6 h-6 text-white"
                fill="currentColor"
              >
                <path d="M11.571 11.513H0a5.218 5.218 0 0 0 5.232 5.215h2.13v2.057A5.215 5.215 0 0 0 12.575 24V12.518a1.005 1.005 0 0 0-1.005-1.005zm5.723-5.756H5.736a5.215 5.215 0 0 0 5.215 5.214h2.129v2.058a5.218 5.218 0 0 0 5.215 5.232V6.758a1.001 1.001 0 0 0-1.001-1.001zM23.013 0H11.455a5.215 5.215 0 0 0 5.215 5.215h2.129v2.057A5.215 5.215 0 0 0 24 12.483V1.005A1.001 1.001 0 0 0 23.013 0Z"/>
              </svg>
            </div>
            <div>
              <CardTitle className="text-lg flex items-center space-x-2">
                <span>Jira</span>
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
          <div className="flex items-center space-x-2">
            <Globe className="w-4 h-4 text-slate-400" />
            <div>
              <div className="font-medium">Site</div>
              <div className="text-slate-600">{integration.jira_site_url}</div>
            </div>
          </div>

          {integration.jira_display_name && (
            <div className="flex items-center space-x-2">
              <CheckCircle className="w-4 h-4 text-slate-400" />
              <div>
                <div className="font-medium">User</div>
                <div className="text-slate-600">{integration.jira_display_name}</div>
              </div>
            </div>
          )}

          {integration.jira_email && (
            <div className="flex items-center space-x-2">
              <Calendar className="w-4 h-4 text-slate-400" />
              <div>
                <div className="font-medium">Email</div>
                <div className="text-slate-600">{integration.jira_email}</div>
              </div>
            </div>
          )}

          <div className="flex items-center space-x-2">
            <Key className="w-4 h-4 text-slate-400" />
            <div>
              <div className="font-medium">Token Type</div>
              <div className="text-slate-600 flex items-center space-x-1">
                <span>OAuth 2.0</span>
                {integration.supports_refresh && (
                  <span title="Auto-refresh enabled">
                    <CheckCircle className="w-3 h-3 text-green-500" />
                  </span>
                )}
              </div>
            </div>
          </div>

          {integration.accessible_sites_count && integration.accessible_sites_count > 0 && (
            <div className="flex items-center space-x-2">
              <Globe className="w-4 h-4 text-slate-400" />
              <div>
                <div className="font-medium">Accessible Sites</div>
                <div className="text-slate-600">{integration.accessible_sites_count} site{integration.accessible_sites_count > 1 ? 's' : ''}</div>
              </div>
            </div>
          )}

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
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <div className="flex items-start space-x-2 text-xs text-blue-700">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <div>
                <div className="font-medium">Token Expiry</div>
                <div>{new Date(integration.token_expires_at).toLocaleString()}</div>
                {integration.supports_refresh && (
                  <div className="text-blue-600 mt-1">Auto-refresh is enabled</div>
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
          {integration.accessible_sites_count && integration.accessible_sites_count > 1 && onSwitchWorkspace && (
            <Button
              size="sm"
              variant="outline"
              onClick={onSwitchWorkspace}
              disabled={isLoading}
            >
              <ArrowLeftRight className="w-4 h-4 mr-2" />
              Switch Workspace
            </Button>
          )}
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
            We collect issue assignments, worklogs, time tracking, and project membership data to analyze workload patterns and identify burnout risk.
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
