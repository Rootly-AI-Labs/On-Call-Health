import { useState, useEffect } from "react"
import Image from "next/image"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Key, Calendar, Building, Clock, Users, Zap, Trash2, Loader2, CheckCircle, AlertTriangle, ChevronDown } from "lucide-react"
import { Tooltip } from "@/components/ui/tooltip"
import { GitHubIntegration, API_BASE } from "../types"

interface GitHubConnectedCardProps {
  integration: GitHubIntegration
  onDisconnect: () => void
  onTest: () => void
  isLoading?: boolean
}

export function GitHubConnectedCard({
  integration,
  onDisconnect,
  onTest,
  isLoading = false
}: GitHubConnectedCardProps) {
  const [orgMemberCount, setOrgMemberCount] = useState<number | null>(null)
  const [loadingMembers, setLoadingMembers] = useState(false)

  // Fetch org members on mount with proper cleanup
  useEffect(() => {
    const controller = new AbortController()
    let isMounted = true

    const fetchOrgMembers = async () => {
      if (!isMounted) return
      setLoadingMembers(true)
      try {
        const authToken = localStorage.getItem('auth_token')
        if (!authToken) return

        const response = await fetch(`${API_BASE}/integrations/github/org-members`, {
          headers: { 'Authorization': `Bearer ${authToken}` },
          signal: controller.signal
        })

        if (response.ok && isMounted) {
          const data = await response.json()
          setOrgMemberCount(data.total_members)
        }
      } catch (error) {
        // Ignore abort errors
        if (error instanceof Error && error.name !== 'AbortError') {
          console.error('Failed to fetch org members:', error)
        }
      } finally {
        if (isMounted) {
          setLoadingMembers(false)
        }
      }
    }

    fetchOrgMembers()

    // Cleanup function
    return () => {
      isMounted = false
      controller.abort()
    }
  }, [integration.github_username])

  // Check if token is invalid
  const hasTokenError = integration.token_valid === false

  return (
    <Card className={`border-2 ${hasTokenError ? 'border-red-200 bg-red-50/50' : 'border-green-200 bg-green-50/50'} max-w-2xl mx-auto`}>
      <CardHeader>
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center">
              <Image
                src="/images/github-logo.png"
                alt="GitHub"
                width={40}
                height={40}
                className="h-10 w-10 object-contain"
                quality={100}
              />
          </div>
          <div>
            <CardTitle className="text-lg flex items-center space-x-2">
              <span>GitHub</span>
              {hasTokenError ? (
                <Badge variant="secondary" className="bg-red-100 text-red-700">
                  <AlertTriangle className="w-3 h-3 mr-1" />
                  Token Invalid
                </Badge>
              ) : (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Badge
                      variant="secondary"
                      className="bg-green-100 text-green-700 cursor-pointer hover:bg-green-200 transition-colors"
                    >
                      <CheckCircle className="w-3 h-3 mr-1" />
                      Connected
                      <ChevronDown className="w-3 h-3 ml-1" />
                    </Badge>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuItem onClick={onTest} disabled={isLoading}>
                      {isLoading ? (
                        <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                      ) : (
                        <Zap className="w-3 h-3 mr-2" />
                      )}
                      Test Connection
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </CardTitle>
            <p className="text-sm text-slate-600">Repository collaboration<br />and code management</p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Token Error Alert */}
        {hasTokenError && integration.token_error && (
          <Alert className="border-red-200 bg-red-50">
            <AlertTriangle className="w-4 h-4 text-red-600" />
            <AlertDescription className="text-red-800 text-sm">
              <strong>Authentication Error:</strong> {integration.token_error}
            </AlertDescription>
          </Alert>
        )}
        {/* Integration Details */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div className="flex items-center space-x-2">
            <Key className="w-4 h-4 text-slate-400" />
            <div>
              <div className="font-medium">Username</div>
              <div className="text-slate-600">{integration.github_username}</div>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <Calendar className="w-4 h-4 text-slate-400" />
            <div>
              <div className="font-medium">Connected</div>
              <div className="text-slate-600">{new Date(integration.connected_at).toLocaleDateString()}</div>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <Building className="w-4 h-4 text-slate-400" />
            <div>
              <div className="font-medium">Organizations</div>
              <div className="text-slate-600">
                {integration.organizations && integration.organizations.length > 0 ? (
                  <Tooltip
                    content={integration.organizations.join(', ')}
                    side="bottom"
                  >
                    <span className="cursor-help border-b border-dotted border-slate-400">
                      {`${integration.organizations.length} organization${integration.organizations.length > 1 ? 's' : ''}`}
                    </span>
                  </Tooltip>
                ) : (
                  'None'
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <Users className="w-4 h-4 text-slate-400" />
            <div>
              <div className="font-medium">Org Members</div>
              <div className="text-slate-600">
                {loadingMembers ? (
                  <span className="flex items-center">
                    <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                    Loading...
                  </span>
                ) : orgMemberCount !== null ? (
                  `${orgMemberCount} member${orgMemberCount !== 1 ? 's' : ''}`
                ) : (
                  'Not loaded'
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <Key className="w-4 h-4 text-slate-400" />
            <div>
              <div className="font-medium">Token Source</div>
              <div className="text-slate-600">
                {integration.token_source === "oauth"
                    ? "OAuth"
                    : "Personal Access Token"
                }
              </div>
            </div>
          </div>

          {integration.token_preview && (
            <div className="flex items-center space-x-2">
              <Key className="w-4 h-4 text-slate-400" />
              <div>
                <div className="font-medium">Token Preview</div>
                <div className="text-slate-600 font-mono text-xs">{integration.token_preview}</div>
              </div>
            </div>
          )}

          <div className="flex items-center space-x-2">
            <Clock className="w-4 h-4 text-slate-400" />
            <div>
              <div className="font-medium">Last Updated</div>
              <div className="text-slate-600">{new Date(integration.last_updated).toLocaleDateString()}</div>
            </div>
          </div>
        </div>

        {/* Name Matching Warning */}
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
          <div className="flex items-start space-x-2">
            <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
            <div>
              <div className="font-medium mb-1">GitHub accounts are matched by name</div>
              <div>
                During analysis, team members are matched to GitHub accounts using name similarity. For the most accurate results, use the <strong>Sync Members</strong> button on the mapping page to confirm matches.
              </div>
            </div>
          </div>
        </div>

        {/* Info Note */}
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-600">
          <div className="font-medium mb-1">Data Collection</div>
          <div>
            We collect repository information, commit history, and collaboration metrics to analyze development patterns and identify risk of overwork.
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end pt-4 border-t">
          <Button
            variant="ghost"
            size="sm"
            onClick={onDisconnect}
            disabled={isLoading}
            className="text-red-600 hover:text-red-700 hover:bg-red-50"
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Disconnect
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
