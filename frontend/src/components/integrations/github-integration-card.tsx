/**
 * GitHub Integration Card Component
 * Supports both OAuth and manual token flows
 */

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Tooltip } from "@/components/ui/tooltip"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Github,
  Loader2,
  CheckCircle,
  AlertCircle,
  ExternalLink,
  Key,
  Building,
  Calendar,
  Users,
  Settings,
  Trash2,
  Eye,
  EyeOff,
} from "lucide-react"

interface GitHubIntegration {
  id: number
  github_username: string
  organizations: string[]
  token_source: "oauth" | "manual"
  is_oauth: boolean
  supports_refresh: boolean
  connected_at: string
  last_updated: string
}

interface GitHubIntegrationCardProps {
  integration: GitHubIntegration | null
  onConnect: (method: "oauth" | "manual", data?: any) => Promise<void>
  onDisconnect: () => Promise<void>
  onTest: () => Promise<void>
  loading?: boolean
}

export function GitHubIntegrationCard({
  integration,
  onConnect,
  onDisconnect,
  onTest,
  loading = false,
}: GitHubIntegrationCardProps) {
  const [showManualInput, setShowManualInput] = useState(false)
  const [showToken, setShowToken] = useState(false)
  const [token, setToken] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showInstructions, setShowInstructions] = useState(false)
  const [permissions, setPermissions] = useState<string[]>([])
  const [loadingPermissions, setLoadingPermissions] = useState(false)

  const isValidGitHubToken = (token: string): boolean => {
    // GitHub personal access tokens start with ghp_, gho_, ghu_, ghs_, or ghr_
    return /^gh[prous]_[A-Za-z0-9]{36}$/.test(token) || /^github_pat_[A-Za-z0-9_]{22,}$/.test(token)
  }

  useEffect(() => {
    if (integration) {
      
      // For now, show a placeholder for permissions since we don't have the backend endpoint yet
      // In the future, this will fetch actual token permissions from the backend
      setPermissions(['read:user', 'repo']) // Placeholder - will be replaced with actual permissions
    }
  }, [integration])

  const handleOAuthConnect = async () => {
    try {
      setIsSubmitting(true)
      setError(null)
      await onConnect("oauth")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect with GitHub")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleTokenSubmit = async () => {
    if (!token || !isValidGitHubToken(token)) {
      setError("Please enter a valid GitHub personal access token")
      return
    }

    try {
      setIsSubmitting(true)
      setError(null)
      await onConnect("manual", { token })
      setToken("")
      setShowManualInput(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect with token")
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
              <div className="w-10 h-10 bg-neutral-900 rounded-lg flex items-center justify-center">
                <Github className="w-6 h-6 text-white" />
              </div>
              <div>
                <CardTitle className="text-lg">GitHub</CardTitle>
                <p className="text-sm text-neutral-700">Code activity and development patterns</p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Badge variant="secondary" className="bg-green-100 text-green-700">
                Connected
              </Badge>
              <Badge variant="outline" className="text-xs">
                {integration.token_source === "oauth" ? "OAuth" : "Manual"}
              </Badge>
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="space-y-4">
          {/* Integration Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div className="flex items-center space-x-2">
              <Github className="w-4 h-4 text-neutral-500" />
              <div>
                <div className="font-medium">Username</div>
                <div className="text-neutral-700">{integration.github_username}</div>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Building className="w-4 h-4 text-neutral-500" />
              <div>
                <div className="font-medium">Organizations</div>
                <div className="text-neutral-700">{integration.organizations.length || "None"}</div>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Calendar className="w-4 h-4 text-neutral-500" />
              <div>
                <div className="font-medium">Connected</div>
                <div className="text-neutral-700">{new Date(integration.connected_at).toLocaleDateString()}</div>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Key className="w-4 h-4 text-neutral-500" />
              <div>
                <div className="font-medium">Token Source</div>
                <div className="text-neutral-700 flex items-center space-x-1">
                  <span>{integration.token_source === "oauth" ? "OAuth" : "Personal Access Token"}</span>
                  {integration.supports_refresh && (
                    <Tooltip content="This token can be automatically refreshed">
                      <CheckCircle className="w-3 h-3 text-green-500" />
                    </Tooltip>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Organizations List */}
          {integration.organizations.length > 0 && (
            <div>
              <div className="text-sm font-medium mb-2">Organizations:</div>
              <div className="flex flex-wrap gap-2">
                {integration.organizations.map((org) => (
                  <Badge key={org} variant="outline" className="text-xs">
                    {org}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Token Permissions */}
          <div>
            <div className="text-sm font-medium mb-2 flex items-center space-x-2">
              <Key className="w-4 h-4 text-neutral-500" />
              <span>Token Permissions ({permissions.length} found)</span>
              {loadingPermissions && <Loader2 className="w-3 h-3 animate-spin" />}
            </div>
            <div className="flex flex-wrap gap-2">
              {loadingPermissions ? (
                <Badge variant="outline" className="text-xs">
                  <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                  Loading...
                </Badge>
              ) : permissions.length > 0 ? (
                permissions.map((permission) => {
                  const isRequired = ['read:user', 'read:org', 'repo'].includes(permission)
                  return (
                    <Badge 
                      key={permission} 
                      variant={isRequired ? "default" : "outline"} 
                      className={`text-xs ${isRequired ? 'bg-green-100 text-green-700 border-green-200' : ''}`}
                    >
                      {permission}
                      {isRequired && <CheckCircle className="w-3 h-3 ml-1" />}
                    </Badge>
                  )
                })
              ) : (
                <Badge variant="outline" className="text-xs text-red-600 border-red-200">
                  <AlertCircle className="w-3 h-3 mr-1" />
                  No permissions detected
                </Badge>
              )}
            </div>
            <div className="mt-1 text-xs text-neutral-500">
              Required for auto-mapping: <code className="bg-neutral-200 px-1 rounded">read:user</code>, <code className="bg-neutral-200 px-1 rounded">read:org</code>, <code className="bg-neutral-200 px-1 rounded">repo</code>
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
          <div className="w-10 h-10 bg-neutral-900 rounded-lg flex items-center justify-center">
            <Github className="w-6 h-6 text-white" />
          </div>
          <div>
            <CardTitle className="text-lg">GitHub</CardTitle>
            <p className="text-sm text-neutral-700">Code activity and development patterns</p>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {!showManualInput ? (
          <>
            {/* Primary OAuth Option */}
            <Button 
              onClick={handleOAuthConnect}
              disabled={isSubmitting}
              className="w-full bg-neutral-900 hover:bg-neutral-800"
            >
              {isSubmitting ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Github className="w-4 h-4 mr-2" />
              )}
              Connect with GitHub
            </Button>
            
            {/* Alternative Manual Token Option */}
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-white px-2 text-neutral-500">or</span>
              </div>
            </div>
            
            <Button 
              variant="outline" 
              onClick={() => setShowManualInput(true)}
              className="w-full"
            >
              <Key className="w-4 h-4 mr-2" />
              Use Personal Access Token
            </Button>
          </>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="github-token">GitHub Personal Access Token</Label>
              <div className="relative">
                <Input
                  id="github-token"
                  type={showToken ? "text" : "password"}
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowToken(!showToken)}
                >
                  {showToken ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <div className="text-sm text-neutral-500">
                <button
                  type="button"
                  onClick={() => setShowInstructions(true)}
                  className="text-blue-600 hover:underline"
                >
                  How to create a GitHub token →
                </button>
              </div>
            </div>
            
            {/* Error Display */}
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            
            <div className="flex space-x-2">
              <Button 
                onClick={handleTokenSubmit}
                disabled={!token || !isValidGitHubToken(token) || isSubmitting}
                className="flex-1"
              >
                {isSubmitting ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <CheckCircle className="w-4 h-4 mr-2" />
                )}
                Connect
              </Button>
              <Button 
                variant="outline" 
                onClick={() => {
                  setShowManualInput(false)
                  setToken("")
                  setError(null)
                }}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </CardContent>

      {/* Instructions Dialog */}
      <Dialog open={showInstructions} onOpenChange={setShowInstructions}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create a GitHub Personal Access Token</DialogTitle>
            <DialogDescription>
              Follow these steps to create a GitHub token with the required permissions
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <h4 className="font-medium">Step 1: Go to GitHub Settings</h4>
              <p className="text-sm text-neutral-700">
                Navigate to{" "}
                <a 
                  href="https://github.com/settings/tokens" 
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline inline-flex items-center"
                >
                  GitHub → Settings → Developer settings → Personal access tokens
                  <ExternalLink className="w-3 h-3 ml-1" />
                </a>
              </p>
            </div>
            <div className="space-y-2">
              <h4 className="font-medium">Step 2: Generate New Token</h4>
              <p className="text-sm text-neutral-700">
                Click "Generate new token" and select these scopes:
              </p>
              <ul className="text-sm text-neutral-700 ml-4 space-y-1">
                <li>• <code>repo</code> - Full repository access</li>
                <li>• <code>read:user</code> - Read user profile</li>
                <li>• <code>read:org</code> - Read organization membership</li>
              </ul>
            </div>
            <div className="space-y-2">
              <h4 className="font-medium">Step 3: Copy and Paste</h4>
              <p className="text-sm text-neutral-700">
                Copy the generated token and paste it in the field above. The token will be encrypted and stored securely.
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  )
}