"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { API_BASE } from "../types"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { CheckCircle, Loader2, AlertCircle } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { SlackSurveyTabs } from "@/components/SlackSurveyTabs"

interface UnifiedSlackCardProps {
  slackIntegration: any
  loadingSlack: boolean
  isConnectingSlackOAuth: boolean
  isDisconnectingSlackSurvey: boolean
  userInfo: any
  selectedOrganization: string
  integrations: any[]
  teamMembers: any[]
  loadingTeamMembers: boolean
  loadingSyncedUsers: boolean
  syncedUsers: any[]
  fetchTeamMembers: () => void
  syncUsersToCorrelation: () => void
  fetchSyncedUsers: () => void
  setShowManualSurveyModal: (show: boolean) => void
  loadSlackPermissions: () => void
  loadSlackStatus?: (forceRefresh?: boolean) => void
  setSlackSurveyDisconnectDialogOpen: (open: boolean) => void
  setIsConnectingSlackOAuth: (connecting: boolean) => void
  toast: any
}

const SlackIcon = () => (
  <svg className="w-6 h-6" viewBox="0 0 124 124" fill="none">
    <path d="M26.3996 78.2003C26.3996 84.7003 21.2996 89.8003 14.7996 89.8003C8.29961 89.8003 3.19961 84.7003 3.19961 78.2003C3.19961 71.7003 8.29961 66.6003 14.7996 66.6003H26.3996V78.2003Z" fill="#E01E5A"/>
    <path d="M32.2996 78.2003C32.2996 71.7003 37.3996 66.6003 43.8996 66.6003C50.3996 66.6003 55.4996 71.7003 55.4996 78.2003V109.2C55.4996 115.7 50.3996 120.8 43.8996 120.8C37.3996 120.8 32.2996 115.7 32.2996 109.2V78.2003Z" fill="#E01E5A"/>
    <path d="M43.8996 26.4003C37.3996 26.4003 32.2996 21.3003 32.2996 14.8003C32.2996 8.30026 37.3996 3.20026 43.8996 3.20026C50.3996 3.20026 55.4996 8.30026 55.4996 14.8003V26.4003H43.8996Z" fill="#36C5F0"/>
    <path d="M43.8996 32.3003C50.3996 32.3003 55.4996 37.4003 55.4996 43.9003C55.4996 50.4003 50.3996 55.5003 43.8996 55.5003H12.8996C6.39961 55.5003 1.29961 50.4003 1.29961 43.9003C1.29961 37.4003 6.39961 32.3003 12.8996 32.3003H43.8996Z" fill="#36C5F0"/>
    <path d="M95.5996 43.9003C95.5996 37.4003 100.7 32.3003 107.2 32.3003C113.7 32.3003 118.8 37.4003 118.8 43.9003C118.8 50.4003 113.7 55.5003 107.2 55.5003H95.5996V43.9003Z" fill="#2EB67D"/>
    <path d="M89.6996 43.9003C89.6996 50.4003 84.5996 55.5003 78.0996 55.5003C71.5996 55.5003 66.4996 50.4003 66.4996 43.9003V12.9003C66.4996 6.40026 71.5996 1.30026 78.0996 1.30026C84.5996 1.30026 89.6996 6.40026 89.6996 12.9003V43.9003Z" fill="#2EB67D"/>
    <path d="M78.0996 95.6003C84.5996 95.6003 89.6996 100.7 89.6996 107.2C89.6996 113.7 84.5996 118.8 78.0996 118.8C71.5996 118.8 66.4996 113.7 66.4996 107.2V95.6003H78.0996Z" fill="#ECB22E"/>
    <path d="M78.0996 89.7003C71.5996 89.7003 66.4996 84.6003 66.4996 78.1003C66.4996 71.6003 71.5996 66.5003 78.0996 66.5003H109.1C115.6 66.5003 120.7 71.6003 120.7 78.1003C120.7 84.6003 115.6 89.7003 109.1 89.7003H78.0996Z" fill="#ECB22E"/>
  </svg>
)

export function UnifiedSlackCard({
  slackIntegration,
  loadingSlack,
  isConnectingSlackOAuth,
  isDisconnectingSlackSurvey,
  userInfo,
  selectedOrganization,
  integrations,
  teamMembers,
  loadingTeamMembers,
  loadingSyncedUsers,
  syncedUsers,
  fetchTeamMembers,
  syncUsersToCorrelation,
  fetchSyncedUsers,
  setShowManualSurveyModal,
  loadSlackPermissions,
  loadSlackStatus,
  setSlackSurveyDisconnectDialogOpen,
  setIsConnectingSlackOAuth,
  toast
}: UnifiedSlackCardProps) {
  const [surveyEnabled, setSurveyEnabled] = useState(slackIntegration?.survey_enabled ?? true)
  const [showSurveyDisableConfirm, setShowSurveyDisableConfirm] = useState(false)

  const isConnected = !!slackIntegration

  useEffect(() => {
    const nextSurveyEnabled = slackIntegration?.survey_enabled ?? true
    setSurveyEnabled(nextSurveyEnabled)
  }, [slackIntegration?.id, slackIntegration?.workspace_id, slackIntegration?.survey_enabled])

  const handleSlackConnect = () => {
    const clientId = process.env.NEXT_PUBLIC_SLACK_CLIENT_ID
    const backendUrl = API_BASE

    if (!backendUrl) {
      toast.error('Backend URL not configured. Please contact support.')
      return
    }

    // Check if user is authenticated before starting OAuth
    const authToken = localStorage.getItem('auth_token')
    if (!authToken) {
      toast.error('Please log in first', {
        description: 'You must be logged in to connect Slack. Redirecting to login...'
      })
      setTimeout(() => {
        window.location.href = '/auth/login?redirect=/integrations'
      }, 2000)
      return
    }

    // Check if we have user info
    if (!userInfo) {
      toast.error('User information not available. Please refresh the page and try again.')
      return
    }

    // Request ALL scopes upfront (both features enabled by default)
    const scopes = 'commands,chat:write,im:write,team:read,channels:history,channels:read,users:read,users:read.email'

    // Include feature flags in state parameter - both enabled by default
    const redirectUri = `${backendUrl}/integrations/slack/oauth/callback`
    const stateData = {
      orgId: userInfo?.organization_id,
      userId: userInfo?.id,
      email: userInfo?.email,
      enableSurvey: true,  // Always true on initial connection
      enableCommunicationPatterns: true  // Always true on initial connection
    }
    const state = userInfo ? btoa(JSON.stringify(stateData)) : ''

    const slackAuthUrl = `https://slack.com/oauth/v2/authorize?client_id=${clientId}&scope=${scopes}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}`

    setIsConnectingSlackOAuth(true)
    localStorage.setItem('slack_oauth_in_progress', 'true')
    toast.info('Redirecting to Slack...')

    window.location.href = slackAuthUrl
  }

  const handleWorkspaceCheck = async () => {
    const backendUrl = API_BASE
    const authToken = localStorage.getItem('auth_token')

    if (!authToken) {
      toast.error('Please log in to check workspace status')
      return
    }

    try {
      const statusResponse = await fetch(`${backendUrl}/integrations/slack/workspace/status`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        }
      })

      if (!statusResponse.ok) {
        toast.error('Failed to check workspace status')
        return
      }

      const statusData = await statusResponse.json()

      if (statusData.diagnosis.has_workspace_mapping) {
        const rawWorkspaceName = statusData.organization_workspace_mappings?.[0]?.workspace_name ||
                                statusData.user_workspace_mappings?.[0]?.workspace_name ||
                                'Unknown workspace'
        // Sanitize workspace name to prevent XSS (remove any HTML/script tags)
        const workspaceName = rawWorkspaceName.replace(/<[^>]*>/g, '')
        toast.success(`✅ Workspace is properly registered! /oncall-health command should work.\n\nRegistered workspace: ${workspaceName}`)
      } else {
        if (!slackIntegration?.workspace_id) {
          toast.error('No workspace ID found. Please reconnect Slack.')
          return
        }

        const formData = new FormData()
        formData.append('workspace_id', slackIntegration.workspace_id)
        formData.append('workspace_name', slackIntegration.workspace_name || slackIntegration.workspace_id)

        const registerResponse = await fetch(`${backendUrl}/integrations/slack/workspace/register`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${authToken}`
          },
          body: formData
        })

        if (registerResponse.ok) {
          toast.success('✅ Workspace registered! /oncall-health command should now work.')
          if (loadSlackPermissions) {
            loadSlackPermissions()
          }
        } else {
          const errorData = await registerResponse.json()
          toast.error(`Failed to register workspace: ${errorData.detail || 'Unknown error'}`)
        }
      }
    } catch (error) {
      console.error('Error checking/fixing workspace:', error)
      toast.error('Error checking workspace status')
    }
  }

  const toggleSurveyFeature = async (enabled: boolean) => {
    const backendUrl = API_BASE
    const authToken = localStorage.getItem('auth_token')

    // Optimistically update UI
    setSurveyEnabled(enabled)

    try {
      const response = await fetch(`${backendUrl}/integrations/slack/features/toggle`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          feature: 'survey',
          enabled
        })
      })

      const rawResponse = await response.text()
      let parsedResponse: any = null
      try {
        parsedResponse = rawResponse ? JSON.parse(rawResponse) : null
      } catch {
        parsedResponse = null
      }

      if (!response.ok) {
        throw new Error(parsedResponse?.detail || rawResponse || 'Failed to toggle feature')
      }

      toast.success(
        enabled
          ? 'Slack Surveys enabled. Scheduled surveys and reminders can run again.'
          : 'Slack Surveys disabled. Scheduled surveys, reminders, and manual sends are now paused.'
      )

      if (loadSlackStatus) {
        await loadSlackStatus(true)
      }
    } catch (error) {
      console.error('Error toggling Slack survey feature:', error)
      setSurveyEnabled(slackIntegration?.survey_enabled ?? !enabled)
      toast.error(
        error instanceof Error
          ? error.message
          : `Failed to ${enabled ? 'enable' : 'disable'} Survey Delivery`
      )
    }
  }

  const handleSurveyToggle = (enabled: boolean) => {
    if (!enabled) {
      setShowSurveyDisableConfirm(true)
      return
    }
    toggleSurveyFeature(enabled)
  }

  if (loadingSlack) {
    return (
      <Card className="border-2 border-purple-200 bg-purple-200/30">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between animate-pulse">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-neutral-300 rounded-lg"></div>
              <div className="space-y-2">
                <div className="w-32 h-5 bg-neutral-300 rounded"></div>
                <div className="w-64 h-4 bg-neutral-300 rounded"></div>
              </div>
            </div>
            <div className="w-24 h-9 bg-neutral-300 rounded-lg"></div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-40 bg-neutral-200 rounded animate-pulse"></div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-2 border-purple-200 bg-purple-200/30">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
              <SlackIcon />
            </div>
            <div>
              <CardTitle className="text-lg text-neutral-900">Slack</CardTitle>
              {isConnected && (
                <div className="space-y-1">
                  <p className="text-sm font-medium text-neutral-900">
                    {slackIntegration.workspace_name || 'Connected to workspace'}
                  </p>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-neutral-500">
                    {slackIntegration.owner_name && (
                      <span>Connected by {slackIntegration.owner_name}</span>
                    )}
                    {slackIntegration.connected_at && (
                      <span>
                        {new Date(slackIntegration.connected_at).toLocaleDateString()}
                      </span>
                    )}
                    {slackIntegration.synced_users_count !== undefined && (
                      <span>{slackIntegration.synced_users_count} users synced</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Connection Status */}
          {isConnected ? (
            <button
              onClick={() => {
                // Allow admins, super_admins, or users without an organization
                const canDisconnect = userInfo?.role === 'admin' ||
                                     userInfo?.role === 'super_admin' ||
                                     !userInfo?.organization_id
                if (!canDisconnect) {
                  toast.error('Permission denied: Admin access required')
                  return
                }
                setSlackSurveyDisconnectDialogOpen(true)
              }}
              disabled={isDisconnectingSlackSurvey}
              className="inline-flex items-center space-x-2 bg-green-100 text-green-800 px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isDisconnectingSlackSurvey ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Disconnecting...</span>
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4" />
                  <span>Connected</span>
                </>
              )}
            </button>
          ) : null}
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {!isConnected ? (
          <>
            {/* Permissions Info Box */}
            <div className="bg-amber-50 border border-amber-300 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="space-y-2 text-sm">
                  <p className="font-semibold text-amber-900">⚠️ Admin Approval May Be Required</p>
                  <p className="text-amber-800">
                    If you're not a Workspace Admin, clicking "Add to Slack" will send an approval request to your admins.
                  </p>
                  <div className="mt-3 pt-3 border-t border-amber-300">
                    <p className="text-amber-900 font-medium mb-2">Required permissions:</p>
                    <ul className="list-disc list-inside space-y-1 text-amber-800 ml-2 text-xs">
                      <li><strong>Read channel messages</strong> - Analyze communication patterns</li>
                      <li><strong>Read user info</strong> - Match team members with survey responses</li>
                      <li><strong>Send DMs & slash commands</strong> - Deliver wellness surveys</li>
                    </ul>
                  </div>
                  <div className="mt-3 pt-3 border-t border-amber-300">
                    <p className="text-amber-900 font-medium mb-2">After admin approval:</p>
                    <ol className="list-decimal list-inside space-y-1 text-amber-800 ml-2 text-xs">
                      <li>Invite the bot to channels you want analyzed (use <code className="bg-amber-100 px-1 rounded text-xs">/invite @On-Call Health</code>)</li>
                      <li>Bot can only read messages from channels it's been added to</li>
                      <li>Team members can use <code className="bg-amber-100 px-1 rounded text-xs">/oncall-health</code> to submit health check-ins</li>
                    </ol>
                  </div>
                </div>
              </div>
            </div>

            {/* Pre-Connection: Simple description and button */}
            <div className="space-y-4">
              {/* Connect Button - Only show to admins, super_admins, or users without org */}
              {(() => {
                const canConnect = userInfo?.role === 'admin' ||
                                  userInfo?.role === 'super_admin' ||
                                  !userInfo?.organization_id

                if (!process.env.NEXT_PUBLIC_SLACK_CLIENT_ID) {
                  return (
                    <div className="text-center py-4">
                      <div className="inline-flex items-center space-x-2 bg-neutral-200 text-neutral-500 px-4 py-2 rounded-lg text-sm font-medium">
                        <SlackIcon />
                        <span>Slack App Not Configured</span>
                      </div>
                    </div>
                  )
                }

                if (!canConnect) {
                  return (
                    <div className="text-center py-4">
                      <p className="text-sm text-neutral-600">Only organization admins can connect Slack integration</p>
                    </div>
                  )
                }

                return (
                  <div className="flex justify-center pt-2">
                    <Button
                      onClick={handleSlackConnect}
                      disabled={isConnectingSlackOAuth}
                      className="bg-purple-700 hover:bg-purple-800 text-white px-6 py-2.5 text-base"
                      size="lg"
                    >
                      {isConnectingSlackOAuth ? (
                        <span className="flex items-center space-x-2">
                          <Loader2 className="w-5 h-5 animate-spin" />
                          <span>Connecting...</span>
                        </span>
                      ) : (
                        <span className="flex items-center space-x-2">
                          <SlackIcon />
                          <span>Add to Slack</span>
                        </span>
                      )}
                    </Button>
                  </div>
                )
              })()}
            </div>
          </>
        ) : (
          <>
            {/* Post-Connection: Toggle switches for features */}
            <div className="space-y-4">
              <div className="bg-white rounded-lg border divide-y">
                {/* Survey Delivery Toggle */}
                <div className="p-4 flex items-center justify-between">
                  <div className="flex-1">
                    <Label htmlFor="survey-toggle" className="text-base font-medium text-neutral-900 cursor-pointer">
                      Slack Surveys
                    </Label>
                    <p className="text-sm text-neutral-700 mt-1">
                      Enable wellness surveys via Slack command and automated DMs
                    </p>
                  </div>
                  <Switch
                    id="survey-toggle"
                    checked={surveyEnabled}
                    onCheckedChange={handleSurveyToggle}
                    className="ml-4"
                  />
                </div>

                {/* Sentiment Analysis - Coming Soon */}
                <div className="p-4 flex items-center justify-between bg-neutral-50 opacity-60">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Label className="text-base font-medium text-neutral-500 cursor-not-allowed">
                        Sentiment Analysis
                      </Label>
                      <Badge className="bg-purple-100 text-purple-700 border-purple-300 text-xs font-semibold">
                        Coming Soon
                      </Badge>
                    </div>
                    <p className="text-sm text-neutral-500 mt-1">
                      Analyze team sentiment from Slack messages to detect early signs of stress
                    </p>
                  </div>
                  <Switch
                    disabled
                    checked={false}
                    className="ml-4"
                  />
                </div>
              </div>
            </div>

            {/* Survey Tabs - Only show if survey is enabled */}
            {surveyEnabled && (
              <div className="border-t pt-4">
                <SlackSurveyTabs
                  slackIntegration={slackIntegration}
                  selectedOrganization={selectedOrganization}
                  integrations={integrations}
                  teamMembers={teamMembers}
                  loadingTeamMembers={loadingTeamMembers}
                  loadingSyncedUsers={loadingSyncedUsers}
                  syncedUsers={syncedUsers}
                  userInfo={userInfo}
                  fetchTeamMembers={fetchTeamMembers}
                  syncUsersToCorrelation={syncUsersToCorrelation}
                  fetchSyncedUsers={fetchSyncedUsers}
                  setShowManualSurveyModal={setShowManualSurveyModal}
                  loadSlackPermissions={loadSlackPermissions}
                  toast={toast}
                />
              </div>
            )}
          </>
        )}
      </CardContent>

      {/* Confirmation Dialog for Disabling Surveys */}
      <Dialog open={showSurveyDisableConfirm} onOpenChange={setShowSurveyDisableConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-orange-500" />
              Disable Slack Surveys?
            </DialogTitle>
            <div className="space-y-3 pt-2 text-sm text-muted-foreground">
              <p>Disabling Slack Surveys will immediately pause all survey activity for this Slack workspace, including:</p>
              <ul className="list-disc list-inside space-y-1 text-sm">
                <li>The <code className="bg-neutral-200 px-1 rounded">/oncall-health</code> command</li>
                <li>Automated survey delivery, scheduled surveys, and follow-up reminders</li>
                <li>Manual survey sending</li>
              </ul>
              <p>
                Your saved survey schedule and selected recipients will stay in place. Re-enabling Slack Surveys will let the existing schedule resume.
              </p>
              <p className="text-sm font-medium text-orange-600">
                You can re-enable surveys anytime by toggling this back on.
              </p>
            </div>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowSurveyDisableConfirm(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setShowSurveyDisableConfirm(false)
                toggleSurveyFeature(false)
              }}
            >
              Disable Surveys
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
