import { useState, useEffect } from "react"
import Image from "next/image"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Key, Calendar, Building, Clock, Users, TestTube, Trash2, Loader2, CheckCircle } from "lucide-react"
import { GitHubIntegration, API_BASE } from "../types"

interface GitHubConnectedCardProps {
  integration: GitHubIntegration
  onDisconnect: () => void
  onTest: () => void
}

export function GitHubConnectedCard({
  integration,
  onDisconnect,
  onTest
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
    <Card className="border-2 border-green-200 bg-green-50/50 max-w-2xl mx-auto">
      <CardHeader>
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
              <CardTitle className="text-lg flex items-center space-x-2">
                <span>GitHub</span>
                <Badge variant="secondary" className="bg-green-100 text-green-700">
                  <CheckCircle className="w-3 h-3 mr-1" />
                  Connected
                </Badge>
              </CardTitle>
              <p className="text-sm text-slate-600">Repository collaboration and code management</p>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
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
                {integration.organizations && integration.organizations.length > 0
                  ? `${integration.organizations.length} organization${integration.organizations.length > 1 ? 's' : ''}`
                  : 'None'}
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

          <div className="flex items-center space-x-2">
            <Clock className="w-4 h-4 text-slate-400" />
            <div>
              <div className="font-medium">Last Updated</div>
              <div className="text-slate-600">{new Date(integration.last_updated).toLocaleDateString()}</div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center flex-wrap gap-2 pt-2">
          <Button
            size="sm"
            variant="outline"
            onClick={onTest}
            disabled={loadingMembers}
          >
            {loadingMembers ? (
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
            disabled={loadingMembers}
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Disconnect
          </Button>
        </div>

        {/* Info Note */}
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-600">
          <div className="font-medium mb-1">Data Collection</div>
          <div>
            We collect repository information, commit history, and collaboration metrics to analyze development patterns and identify risk of overwork.
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
