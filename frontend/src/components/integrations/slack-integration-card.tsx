/**
 * Slack Integration Card Component
 * Supports both OAuth and manual token flows
 */

import { useState } from "react"
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
  MessageSquare,
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

interface SlackIntegration {
  id: number
  slack_user_id: string
  workspace_id: string
  token_source: "oauth" | "manual"
  is_oauth: boolean
  supports_refresh: boolean
  connected_at: string
  last_updated: string
}

interface SlackIntegrationCardProps {
  integration: SlackIntegration | null
  onConnect: (method: "oauth" | "manual", data?: any) => Promise<void>
  onDisconnect: () => Promise<void>
  onTest: () => Promise<void>
  loading?: boolean
}

export function SlackIntegrationCard({
  integration,
  onConnect,
  onDisconnect,
  onTest,
  loading = false,
}: SlackIntegrationCardProps) {
  const [showManualInput, setShowManualInput] = useState(false)
  const [showToken, setShowToken] = useState(false)
  const [token, setToken] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showInstructions, setShowInstructions] = useState(false)

  const isValidSlackToken = (token: string): boolean => {
    // Slack bot tokens start with xoxb-, user tokens with xoxp-
    return /^xox[bp]-[A-Za-z0-9-]+$/.test(token)
  }

  const handleOAuthConnect = async () => {
    try {
      setIsSubmitting(true)
      setError(null)
      await onConnect("oauth")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect with Slack")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleTokenSubmit = async () => {
    if (!token || !isValidSlackToken(token)) {
      setError("Please enter a valid Slack bot token (starts with xoxb-)")
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
              <div className="w-10 h-10 bg-purple-700 rounded-lg flex items-center justify-center">
                <MessageSquare className="w-6 h-6 text-white" />
              </div>
              <div>
                <CardTitle className="text-lg">Slack</CardTitle>
                <p className="text-sm text-neutral-700">Communication patterns and sentiment</p>
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
              <Users className="w-4 h-4 text-neutral-500" />
              <div>
                <div className="font-medium">User ID</div>
                <div className="text-neutral-700 font-mono text-xs">{integration.slack_user_id}</div>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Building className="w-4 h-4 text-neutral-500" />
              <div>
                <div className="font-medium">Workspace</div>
                <div className="text-neutral-700 font-mono text-xs">{integration.workspace_id}</div>
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
                  <span>{integration.token_source === "oauth" ? "OAuth" : "Bot Token"}</span>
                  {integration.supports_refresh && (
                    <Tooltip content="This token can be automatically refreshed">
                      <CheckCircle className="w-3 h-3 text-green-500" />
                    </Tooltip>
                  )}
                </div>
              </div>
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
          <div className="w-10 h-10 bg-purple-700 rounded-lg flex items-center justify-center">
            <MessageSquare className="w-6 h-6 text-white" />
          </div>
          <div>
            <CardTitle className="text-lg">Slack</CardTitle>
            <p className="text-sm text-neutral-700">Communication patterns and sentiment</p>
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
              className="w-full bg-purple-700 hover:bg-purple-800"
            >
              {isSubmitting ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <MessageSquare className="w-4 h-4 mr-2" />
              )}
              Connect with Slack
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
              Use Bot Token
            </Button>
          </>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="slack-token">Slack Bot Token</Label>
              <div className="relative">
                <Input
                  id="slack-token"
                  type={showToken ? "text" : "password"}
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="xoxb-xxxxxxxxxxxx-xxxxxxxxxxxx"
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
                  How to create a Slack bot token →
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
                disabled={!token || !isValidSlackToken(token) || isSubmitting}
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
            <DialogTitle>Create a Slack Bot Token</DialogTitle>
            <DialogDescription>
              Follow these steps to create a Slack bot token with the required permissions
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <h4 className="font-medium">Step 1: Create a Slack App</h4>
              <p className="text-sm text-neutral-700">
                Go to{" "}
                <a 
                  href="https://api.slack.com/apps" 
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline inline-flex items-center"
                >
                  Slack API → Your Apps → Create New App
                  <ExternalLink className="w-3 h-3 ml-1" />
                </a>
              </p>
            </div>
            <div className="space-y-2">
              <h4 className="font-medium">Step 2: Add Bot Token Scopes</h4>
              <p className="text-sm text-neutral-700">
                Go to "OAuth & Permissions" and add these Bot Token Scopes:
              </p>
              <ul className="text-sm text-neutral-700 ml-4 space-y-1">
                <li>• <code>channels:history</code> - Read channel messages</li>
                <li>• <code>groups:history</code> - Read private channel messages</li>
                <li>• <code>users:read</code> - Read user information</li>
              </ul>
            </div>
            <div className="space-y-2">
              <h4 className="font-medium">Step 3: Install App</h4>
              <p className="text-sm text-neutral-700">
                Install the app to your workspace and copy the "Bot User OAuth Token" (starts with xoxb-).
              </p>
            </div>
            <div className="space-y-2">
              <h4 className="font-medium">Step 4: Copy and Paste</h4>
              <p className="text-sm text-neutral-700">
                Copy the bot token and paste it in the field above. The token will be encrypted and stored securely.
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  )
}