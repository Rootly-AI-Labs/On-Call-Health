import { useState, useEffect } from "react"
import Image from "next/image"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Key, Calendar, Building, Clock, Users, TestTube, Trash2, Loader2, CheckCircle, Zap, RefreshCw } from "lucide-react"
import { GitHubIntegration, API_BASE } from "../types"

interface GitHubConnectedCardProps {
  integration: GitHubIntegration
  onDisconnect: () => void
  onTest: () => void
  onViewMappings: () => void
  loadingMappings: boolean
  selectedMappingPlatform: string | null
}

export function GitHubConnectedCard({
  integration,
  onDisconnect,
  onTest,
  onViewMappings,
  loadingMappings,
  selectedMappingPlatform
}: GitHubConnectedCardProps) {
  const [orgMemberCount, setOrgMemberCount] = useState<number | null>(null)
  const [loadingMembers, setLoadingMembers] = useState(false)

  const fetchOrgMembers = async () => {
    setLoadingMembers(true)
    try {
      const authToken = localStorage.getItem('auth_token')
      if (!authToken) return

      const response = await fetch(`${API_BASE}/integrations/github/org-members`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      })

      if (response.ok) {
        const data = await response.json()
        setOrgMemberCount(data.total_members)
      }
    } catch (error) {
      console.error('Failed to fetch org members:', error)
    } finally {
      setLoadingMembers(false)
    }
  }

  // Fetch org members on mount
  useEffect(() => {
    fetchOrgMembers()
  }, [])

  return (
    <Card className="border-green-200 bg-green-50 max-w-2xl mx-auto">
      <CardHeader className="p-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center">
              <Image
                src="/images/github-logo.png"
                alt="GitHub"
                width={40}
                height={40}
                className="h-10 w-10 object-contain"
              />
            </div>
            <div>
              <CardTitle>GitHub Connected</CardTitle>
              <div className="space-y-1 text-sm text-muted-foreground">
                <div>Username: {integration.github_username}</div>
                {!integration.is_beta && (
                  <div>Token: {integration.token_preview}</div>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Button
              size="sm"
              variant="outline"
              onClick={onViewMappings}
              disabled={loadingMappings}
              className="bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 hover:text-blue-800 hover:border-blue-300"
              title="View and manage GitHub user mappings"
            >
              {loadingMappings && selectedMappingPlatform === 'github' ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Loading...
                </>
              ) : (
                <>
                  <Users className="w-4 h-4 mr-2" />
                  View Mappings
                </>
              )}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={fetchOrgMembers}
              disabled={loadingMembers}
              className="bg-white text-gray-700 border-gray-200 hover:bg-gray-50 hover:text-gray-800 hover:border-gray-300"
              title="Refresh organization member count"
            >
              {loadingMembers ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
            </Button>
            {integration.is_beta ? (
              <Button
                size="sm"
                variant="outline"
                onClick={onTest}
                className="bg-white text-purple-700 border-purple-200 hover:bg-purple-50 hover:text-purple-800 hover:border-purple-300"
              >
                <Zap className="w-4 h-4 mr-2" />
                Test Connection
              </Button>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                onClick={onDisconnect}
                className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-8 pt-0">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div className="flex items-center space-x-2">
            <Key className="w-4 h-4 text-gray-400" />
            <div>
              <div className="font-medium">Token Source</div>
              <div className="text-gray-600">
                {integration.is_beta
                  ? "Beta"
                  : integration.token_source === "oauth"
                    ? "OAuth"
                    : "Personal Access Token"
                }
              </div>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Calendar className="w-4 h-4 text-gray-400" />
            <div>
              <div className="font-medium">Connected</div>
              <div className="text-gray-600">{new Date(integration.connected_at).toLocaleDateString()}</div>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Building className="w-4 h-4 text-gray-400" />
            <div>
              <div className="font-medium">Organizations</div>
              <div className="text-gray-600">
                {integration.organizations && integration.organizations.length > 0
                  ? integration.organizations.join(', ')
                  : 'None'}
              </div>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Clock className="w-4 h-4 text-gray-400" />
            <div>
              <div className="font-medium">Last Updated</div>
              <div className="text-gray-600">{new Date(integration.last_updated).toLocaleDateString()}</div>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Users className="w-4 h-4 text-gray-400" />
            <div>
              <div className="font-medium">Org Members</div>
              <div className="text-gray-600">
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
        </div>

        {/* Beta Access Information */}
        {integration.is_beta && (
          <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
            <div className="flex items-start space-x-2">
              <div className="w-5 h-5 text-blue-600 mt-0.5">
                <CheckCircle className="w-5 h-5" />
              </div>
              <div className="flex-1 text-sm">
                <div className="font-medium text-blue-800 mb-1">Beta Access Enabled</div>
                <div className="text-blue-700">
                  You're using a shared GitHub integration for testing purposes.
                  No personal token setup required.
                </div>
              </div>
            </div>
          </div>
        )}

      </CardContent>
    </Card>
  )
}
