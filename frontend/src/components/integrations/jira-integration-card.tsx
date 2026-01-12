/**
 * Jira Integration Card Component
 * OAuth flow for Jira Cloud integration
 */

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Loader2,
  CheckCircle,
  AlertCircle,
  ExternalLink,
  Key,
  Calendar,
  Settings,
  Trash2,
  Globe,
  Box,
} from "lucide-react"

// Jira icon component
const JiraIcon = ({ className }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    className={className}
    fill="currentColor"
  >
    <path d="M11.571 11.513H0a5.218 5.218 0 0 0 5.232 5.215h2.13v2.057A5.215 5.215 0 0 0 12.575 24V12.518a1.005 1.005 0 0 0-1.005-1.005zm5.723-5.756H5.736a5.215 5.215 0 0 0 5.215 5.214h2.129v2.058a5.218 5.218 0 0 0 5.215 5.232V6.758a1.001 1.001 0 0 0-1.001-1.001zM23.013 0H11.455a5.215 5.215 0 0 0 5.215 5.215h2.129v2.057A5.215 5.215 0 0 0 24 12.483V1.005A1.001 1.001 0 0 0 23.013 0Z"/>
  </svg>
)

interface JiraIntegration {
  id: number
  jira_site_url: string
  jira_site_name?: string
  jira_cloud_id: string
  jira_account_id: string
  jira_display_name?: string
  jira_email?: string
  token_source: "oauth" | "manual"
  is_oauth: boolean
  supports_refresh: boolean
  token_expires_at?: string
  updated_at: string
  accessible_sites_count?: number
}

interface JiraIntegrationCardProps {
  integration: JiraIntegration | null
  onConnect: () => Promise<void>
  onDisconnect: () => Promise<void>
  onTest: () => Promise<void>
  loading?: boolean
}

export function JiraIntegrationCard({
  integration,
  onConnect,
  onDisconnect,
  onTest,
  loading = false,
}: JiraIntegrationCardProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showInfo, setShowInfo] = useState(false)
  const [permissions, setPermissions] = useState<Record<string, boolean>>({})
  const [loadingPermissions, setLoadingPermissions] = useState(false)

  useEffect(() => {
    if (integration) {
      // Placeholder for permissions - will be populated from backend test endpoint
      setPermissions({
        user_access: true,
        project_access: true,
        issue_access: true,
        worklog_access: true,
      })
    }
  }, [integration])

  const handleConnect = async () => {
    try {
      setIsSubmitting(true)
      setError(null)
      await onConnect()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect with Jira")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDisconnect = async () => {
    try {
      setIsSubmitting(true)
      await onDisconnect()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to disconnect")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleTest = async () => {
    try {
      setIsSubmitting(true)
      setError(null)
      await onTest()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to test connection")
    } finally {
      setIsSubmitting(false)
    }
  }

  if (integration) {
    // Connected state
    return (
      <Card className="border-2 border-neutral-200 bg-neutral-100">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
                <JiraIcon className="w-6 h-6 text-white" />
              </div>
              <div>
                <CardTitle className="text-lg">Jira</CardTitle>
                <p className="text-sm text-neutral-700">Project management and issue tracking</p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Badge variant="secondary" className="bg-green-100 text-green-700">
                Connected
              </Badge>
              <Badge variant="outline" className="text-xs">
                OAuth
              </Badge>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Integration Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div className="flex items-center space-x-2">
              <Globe className="w-4 h-4 text-neutral-500" />
              <div className="min-w-0 flex-1">
                <div className="font-medium">Site</div>
                <div className="text-neutral-700 truncate">{integration.jira_site_url}</div>
              </div>
            </div>
            {integration.jira_display_name && (
              <div className="flex items-center space-x-2">
                <CheckCircle className="w-4 h-4 text-neutral-500" />
                <div className="min-w-0 flex-1">
                  <div className="font-medium">User</div>
                  <div className="text-neutral-700 truncate">{integration.jira_display_name}</div>
                </div>
              </div>
            )}
            {integration.jira_email && (
              <div className="flex items-center space-x-2">
                <Calendar className="w-4 h-4 text-neutral-500" />
                <div className="min-w-0 flex-1">
                  <div className="font-medium">Email</div>
                  <div className="text-neutral-700 truncate">{integration.jira_email}</div>
                </div>
              </div>
            )}
            <div className="flex items-center space-x-2">
              <Key className="w-4 h-4 text-neutral-500" />
              <div>
                <div className="font-medium">Token Type</div>
                <div className="text-neutral-700 flex items-center space-x-1">
                  <span>OAuth 2.0</span>
                  {integration.supports_refresh && (
                    <CheckCircle className="w-3 h-3 text-green-500" />
                  )}
                </div>
              </div>
            </div>
            {integration.accessible_sites_count && integration.accessible_sites_count > 0 && (
              <div className="flex items-center space-x-2">
                <Box className="w-4 h-4 text-neutral-500" />
                <div>
                  <div className="font-medium">Accessible Sites</div>
                  <div className="text-neutral-700">{integration.accessible_sites_count} site{integration.accessible_sites_count > 1 ? 's' : ''}</div>
                </div>
              </div>
            )}
            <div className="flex items-center space-x-2">
              <Calendar className="w-4 h-4 text-neutral-500" />
              <div>
                <div className="font-medium">Last Updated</div>
                <div className="text-neutral-700">{new Date(integration.updated_at).toLocaleDateString()}</div>
              </div>
            </div>
            {integration.token_expires_at && (
              <div className="flex items-center space-x-2">
                <Calendar className="w-4 h-4 text-neutral-500" />
                <div className="min-w-0 flex-1">
                  <div className="font-medium">Token Expiry</div>
                  <div className="text-neutral-700 text-xs truncate">
                    {new Date(integration.token_expires_at).toLocaleString()}
                    {integration.supports_refresh && " (auto-refresh)"}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Permissions */}
          <div>
            <div className="text-sm font-medium mb-2 flex items-center space-x-2">
              <Key className="w-4 h-4 text-neutral-500" />
              <span>API Permissions</span>
              {loadingPermissions && <Loader2 className="w-3 h-3 animate-spin" />}
            </div>
            <div className="flex flex-wrap gap-2">
              {Object.entries(permissions).map(([key, value]) => (
                <Badge
                  key={key}
                  variant={value ? "default" : "outline"}
                  className={`text-xs ${value ? 'bg-green-100 text-green-700 border-green-200' : 'bg-red-100 text-red-700 border-red-200'}`}
                >
                  {key.replace(/_/g, ' ')}
                  {value ? <CheckCircle className="w-3 h-3 ml-1" /> : <AlertCircle className="w-3 h-3 ml-1" />}
                </Badge>
              ))}
            </div>
            <div className="mt-1 text-xs text-neutral-500">
              We collect issue assignments, worklogs, time tracking, and project membership data to analyze workload patterns and identify risk of overwork.
            </div>
          </div>

          {/* Error Display */}
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Actions */}
          <div className="flex items-center space-x-2 pt-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handleTest}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Settings className="w-4 h-4 mr-2" />
              )}
              Test Connection
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={handleDisconnect}
              disabled={isSubmitting}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Disconnect
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Disconnected state
  return (
    <Card className="border-2 border-neutral-200 hover:border-neutral-300 transition-colors">
      <CardHeader>
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
            <JiraIcon className="w-6 h-6 text-white" />
          </div>
          <div>
            <CardTitle className="text-lg">Jira</CardTitle>
            <p className="text-sm text-neutral-700">Project management and issue tracking</p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* OAuth Connect Button */}
        <Button
          onClick={handleConnect}
          disabled={isSubmitting}
          className="w-full bg-blue-600 hover:bg-blue-700"
        >
          {isSubmitting ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <JiraIcon className="w-4 h-4 mr-2" />
          )}
          Connect with Jira
        </Button>

        {/* Info Button */}
        <div className="text-center">
          <button
            type="button"
            onClick={() => setShowInfo(true)}
            className="text-sm text-blue-600 hover:underline"
          >
            Learn what data we collect →
          </button>
        </div>

        {/* Error Display */}
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </CardContent>

      {/* Info Dialog */}
      <Dialog open={showInfo} onOpenChange={setShowInfo}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Jira Integration</DialogTitle>
            <DialogDescription>
              What data we collect from your Jira workspace
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <h4 className="font-medium">Workload Metrics</h4>
              <p className="text-sm text-neutral-700">
                We collect issue assignments, worklogs, and time tracking data to analyze team workload and identify overwork risk factors.
              </p>
            </div>
            <div className="space-y-2">
              <h4 className="font-medium">Issue Data</h4>
              <p className="text-sm text-neutral-700">
                Issue status, priority, creation dates, and completion times help us understand work patterns and team velocity.
              </p>
            </div>
            <div className="space-y-2">
              <h4 className="font-medium">Required Permissions</h4>
              <ul className="text-sm text-neutral-700 ml-4 space-y-1">
                <li>• <code>read:jira-work</code> - Access issues and projects</li>
                <li>• <code>read:jira-user</code> - Read user profiles</li>
                <li>• <code>offline_access</code> - Automatic token refresh</li>
              </ul>
            </div>
            <div className="space-y-2">
              <h4 className="font-medium">Privacy & Security</h4>
              <p className="text-sm text-neutral-700">
                All tokens are encrypted and stored securely. We only collect data necessary for burnout analysis and never share your data with third parties.
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
