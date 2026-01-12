"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Loader2, Users, Settings, LogOut } from "lucide-react"
import { GitHubIntegration, SlackIntegration } from "./api-service"

interface EnhancementCardsProps {
  githubIntegration: GitHubIntegration | null
  slackIntegration: SlackIntegration | null
  loading: {
    github: boolean
    slack: boolean
  }
  onOpenMappings: (platform: 'github' | 'slack') => void
  onConnect: (platform: 'github' | 'slack') => void
  onDisconnect: (platform: 'github' | 'slack') => void
}

export function EnhancementCards({
  githubIntegration,
  slackIntegration,
  loading,
  onOpenMappings,
  onConnect,
  onDisconnect
}: EnhancementCardsProps) {
  
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  const getStatusBadge = (status: 'active' | 'inactive' | 'error') => {
    switch (status) {
      case 'active':
        return { color: 'bg-green-100 text-green-800', text: 'Connected' }
      case 'inactive':
        return { color: 'bg-neutral-200 text-neutral-900', text: 'Inactive' }
      case 'error':
        return { color: 'bg-red-100 text-red-800', text: 'Error' }
    }
  }

  const GitHubCard = () => {
    if (loading.github) {
      return (
        <Card className="border-neutral-200 bg-neutral-100">
          <CardHeader>
            <div className="flex items-center space-x-2">
              <Loader2 className="w-5 h-5 animate-spin text-neutral-500" />
              <CardTitle>GitHub Integration</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="animate-pulse space-y-2">
              <div className="w-full h-4 bg-neutral-300 rounded"></div>
              <div className="w-3/4 h-4 bg-neutral-300 rounded"></div>
            </div>
          </CardContent>
        </Card>
      )
    }

    if (!githubIntegration) {
      return (
        <Card className="border-dashed border-neutral-300">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="text-4xl mb-4">🐙</div>
            <h3 className="text-lg font-medium text-neutral-900 mb-2">
              Connect GitHub
            </h3>
            <p className="text-neutral-500 text-center mb-6">
              Track code activity, commits, and development patterns to identify burnout signals
            </p>
            <Button
              onClick={() => onConnect('github')}
              className="flex items-center space-x-2"
            >
              <span>Connect GitHub</span>
            </Button>
          </CardContent>
        </Card>
      )
    }

    const statusBadge = getStatusBadge(githubIntegration.status)

    return (
      <Card className="border-neutral-200 bg-neutral-100 hover:shadow-md transition-shadow">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span className="text-lg">🐙</span>
              <div>
                <CardTitle className="text-lg">GitHub Connected</CardTitle>
                <p className="text-sm text-neutral-500">@{githubIntegration.github_username}</p>
              </div>
            </div>
            <Badge variant="secondary" className={statusBadge.color}>
              {statusBadge.text}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="space-y-4">
            <div className="text-sm text-neutral-700">
              <div className="flex justify-between">
                <span>Organization:</span>
                <span>{githubIntegration.github_organization || 'Personal'}</span>
              </div>
              <div className="flex justify-between mt-1">
                <span>Connected:</span>
                <span>{formatDate(githubIntegration.created_at)}</span>
              </div>
              <div className="flex justify-between mt-1">
                <span>Token:</span>
                <span className="font-mono">...{githubIntegration.github_token_suffix}</span>
              </div>
            </div>
            
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onOpenMappings('github')}
                className="flex items-center space-x-1"
              >
                <Users className="w-4 h-4" />
                <span>Manage Mappings</span>
              </Button>
              
              <Button
                variant="outline"
                size="sm"
                className="flex items-center space-x-1"
              >
                <Settings className="w-4 h-4" />
                <span>Settings</span>
              </Button>
              
              <Button
                variant="outline"
                size="sm"
                onClick={() => onDisconnect('github')}
                className="flex items-center space-x-1 text-red-600 hover:text-red-700 hover:bg-red-50"
              >
                <LogOut className="w-4 h-4" />
                <span>Disconnect</span>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  const SlackCard = () => {
    if (loading.slack) {
      return (
        <Card className="border-purple-200 bg-purple-200">
          <CardHeader>
            <div className="flex items-center space-x-2">
              <Loader2 className="w-5 h-5 animate-spin text-purple-400" />
              <CardTitle>Slack Integration</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="animate-pulse space-y-2">
              <div className="w-full h-4 bg-purple-300 rounded"></div>
              <div className="w-3/4 h-4 bg-purple-300 rounded"></div>
            </div>
          </CardContent>
        </Card>
      )
    }

    if (!slackIntegration) {
      return (
        <Card className="border-dashed border-purple-500">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="text-4xl mb-4">💬</div>
            <h3 className="text-lg font-medium text-neutral-900 mb-2">
              Connect Slack
            </h3>
            <p className="text-neutral-500 text-center mb-6">
              Analyze communication patterns and team interactions to detect burnout signals
            </p>
            <Button
              onClick={() => onConnect('slack')}
              className="flex items-center space-x-2 bg-purple-700 hover:bg-purple-800"
            >
              <span>Connect Slack</span>
            </Button>
          </CardContent>
        </Card>
      )
    }

    const statusBadge = getStatusBadge(slackIntegration.status)

    return (
      <Card className="border-purple-200 bg-purple-200 hover:shadow-md transition-shadow">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span className="text-lg">💬</span>
              <div>
                <CardTitle className="text-lg">Slack Connected</CardTitle>
                <p className="text-sm text-neutral-500">{slackIntegration.team_name}</p>
              </div>
            </div>
            <Badge variant="secondary" className={statusBadge.color}>
              {statusBadge.text}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="space-y-4">
            <div className="text-sm text-neutral-700">
              <div className="flex justify-between">
                <span>Team ID:</span>
                <span className="font-mono">{slackIntegration.team_id}</span>
              </div>
              <div className="flex justify-between mt-1">
                <span>Connected:</span>
                <span>{formatDate(slackIntegration.created_at)}</span>
              </div>
              <div className="flex justify-between mt-1">
                <span>Webhook:</span>
                <span className="font-mono">...{slackIntegration.webhook_url_suffix}</span>
              </div>
              {slackIntegration.bot_token_suffix && (
                <div className="flex justify-between mt-1">
                  <span>Bot Token:</span>
                  <span className="font-mono">...{slackIntegration.bot_token_suffix}</span>
                </div>
              )}
            </div>
            
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onOpenMappings('slack')}
                className="flex items-center space-x-1"
              >
                <Users className="w-4 h-4" />
                <span>Manage Mappings</span>
              </Button>
              
              <Button
                variant="outline"
                size="sm"
                className="flex items-center space-x-1"
              >
                <Settings className="w-4 h-4" />
                <span>Settings</span>
              </Button>
              
              <Button
                variant="outline"
                size="sm"
                onClick={() => onDisconnect('slack')}
                className="flex items-center space-x-1 text-red-600 hover:text-red-700 hover:bg-red-50"
              >
                <LogOut className="w-4 h-4" />
                <span>Disconnect</span>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-neutral-900 mb-2">
          Team Enhancement Integrations
        </h2>
        <p className="text-neutral-500">
          Connect additional tools to get deeper insights into team health and burnout patterns
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <GitHubCard />
        <SlackCard />
      </div>
    </div>
  )
}