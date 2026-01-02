"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { CheckCircle, Users, Send, RefreshCw, Database, Users2, Loader2, Building, Clock, Mail } from "lucide-react"

interface SlackSurveyTabsProps {
  slackIntegration: any
  selectedOrganization: string
  integrations: any[]
  teamMembers: any[]
  loadingTeamMembers: boolean
  loadingSyncedUsers: boolean
  syncedUsers: any[]
  userInfo: any
  fetchTeamMembers: () => void
  syncUsersToCorrelation: () => void
  fetchSyncedUsers: (showToast?: boolean, autoSync?: boolean, forceRefresh?: boolean, openDrawer?: boolean) => void
  setShowManualSurveyModal: (show: boolean) => void
  loadSlackPermissions: () => void
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

export function SlackSurveyTabs({
  slackIntegration,
  selectedOrganization,
  integrations,
  teamMembers,
  loadingTeamMembers,
  loadingSyncedUsers,
  syncedUsers,
  userInfo,
  fetchTeamMembers,
  syncUsersToCorrelation,
  fetchSyncedUsers,
  setShowManualSurveyModal,
  loadSlackPermissions,
  toast
}: SlackSurveyTabsProps) {
  const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

  // Schedule state
  const [scheduleEnabled, setScheduleEnabled] = useState(false)
  const [scheduleTime, setScheduleTime] = useState('09:00')
  const [frequencyType, setFrequencyType] = useState<'daily' | 'weekday' | 'weekly'>('weekday')
  const [dayOfWeek, setDayOfWeek] = useState<number>(4) // Default: Friday
  const [savedScheduleTime, setSavedScheduleTime] = useState<string | null>(null) // Track saved time from DB
  const [loadingSchedule, setLoadingSchedule] = useState(false)
  const [savingSchedule, setSavingSchedule] = useState(false)
  const [showSaveConfirmation, setShowSaveConfirmation] = useState(false)


  // Load schedule on mount - backend uses auth token to determine org
  useEffect(() => {
    loadSchedule()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Empty array - run once on mount

  // Auto-fetch synced users when component mounts or organization changes
  useEffect(() => {
    if (selectedOrganization) {
      // Fetch users but don't open the drawer (showToast=false, autoSync=true, forceRefresh=false, openDrawer=false)
      fetchSyncedUsers(false, true, false, false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOrganization])

  // Poll schedule every 10 seconds to sync changes across admins (only when page is visible)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        loadSchedule() // Refresh immediately when page becomes visible
      }
    }

    const pollInterval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        loadSchedule() // Refresh survey schedule from backend
      }
    }, 10000) // 10 seconds

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      clearInterval(pollInterval)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadSchedule = async () => {
    setLoadingSchedule(true)
    try {
      const authToken = localStorage.getItem('auth_token')
      const response = await fetch(`${API_BASE}/api/surveys/survey-schedule`, {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      })

      if (response.ok) {
        const data = await response.json()

        // Handle case where schedule exists
        if (data.enabled !== undefined) {
          setScheduleEnabled(data.enabled)

          // Backend returns "HH:MM:SS", extract only "HH:MM"
          if (data.send_time) {
            const timeOnly = data.send_time.substring(0, 5) // Extract "HH:MM" from "HH:MM:SS"
            setScheduleTime(timeOnly)
            setSavedScheduleTime(timeOnly) // Store the saved time from DB
          } else {
            // No send_time means no schedule saved yet
            setSavedScheduleTime(null)
            setScheduleTime('09:00') // Reset to default
          }

          // Load frequency settings
          if (data.frequency_type) {
            setFrequencyType(data.frequency_type)
          }
          if (data.day_of_week !== undefined && data.day_of_week !== null) {
            setDayOfWeek(data.day_of_week)
          }
        } else {
          // Handle case where no schedule is configured (shouldn't happen with new backend)
          setScheduleEnabled(false)
          setScheduleTime('09:00')
          setSavedScheduleTime(null)
        }
      } else {
        // API error - set defaults
        setScheduleEnabled(false)
        setScheduleTime('09:00')
        setSavedScheduleTime(null)
      }
    } catch (error) {
      console.error('Failed to load schedule:', error)
      // Set defaults on error
      setScheduleEnabled(false)
      setScheduleTime('09:00')
      setSavedScheduleTime(null)
    } finally {
      setLoadingSchedule(false)
    }
  }

  const saveSchedule = async () => {
    setSavingSchedule(true)
    try {
      const authToken = localStorage.getItem('auth_token')
      const payload = {
        enabled: scheduleEnabled,
        send_time: scheduleTime,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        frequency_type: frequencyType,
        day_of_week: frequencyType === 'weekly' ? dayOfWeek : null,
        send_reminder: false,
        reminder_hours_after: 5
      }

      // Add 2 second delay for better UX feedback
      const [response] = await Promise.all([
        fetch(`${API_BASE}/api/surveys/survey-schedule`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`
          },
          body: JSON.stringify(payload)
        }),
        new Promise(resolve => setTimeout(resolve, 2000))
      ])

      if (response.ok) {
        const responseData = await response.json()
        toast.success('Schedule saved successfully')
        // Reload schedule from DB to ensure we display exactly what's saved
        await loadSchedule()
      } else {
        const error = await response.json()
        toast.error(error.detail || 'Failed to save schedule')
      }
    } catch (error) {
      console.error('Failed to save schedule:', error)
      toast.error('Failed to save schedule')
    } finally {
      setSavingSchedule(false)
    }
  }

  const handleSlackConnect = () => {
    const clientId = process.env.NEXT_PUBLIC_SLACK_CLIENT_ID
    const backendUrl = process.env.NEXT_PUBLIC_API_BASE_URL

    if (!backendUrl) {
      toast.error('Backend URL not configured. Please contact support.')
      return
    }

    if (!userInfo?.organization_id || !userInfo?.email) {
      toast.error('Organization information required. Please refresh and try again.')
      return
    }

    // Encode state with organization info for the callback
    const state = btoa(JSON.stringify({
      orgId: userInfo.organization_id,
      email: userInfo.email
    }))

    const redirectUri = `${backendUrl}/integrations/slack/oauth/callback`
    const scopes = 'commands,chat:write,team:read,users:read,users:read.email'
    const slackAuthUrl = `https://slack.com/oauth/v2/authorize?client_id=${clientId}&scope=${scopes}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}`

    window.open(slackAuthUrl, '_blank')
  }


  return (
    <>
    <Tabs defaultValue="setup" className="w-full">
      <TabsList className="grid w-full grid-cols-3 bg-purple-100/50">
        <TabsTrigger value="setup" className="data-[state=active]:bg-white">Setup</TabsTrigger>
        <TabsTrigger value="team" className="data-[state=active]:bg-white" disabled={!slackIntegration}>
          Team Members
        </TabsTrigger>
        <TabsTrigger value="actions" className="data-[state=active]:bg-white" disabled={!slackIntegration}>
          Send Survey
        </TabsTrigger>
      </TabsList>

      {/* Setup Tab */}
      <TabsContent value="setup" className="space-y-4 mt-4">
        <div className="bg-white rounded-lg border p-4 space-y-4">
          {!slackIntegration && !process.env.NEXT_PUBLIC_SLACK_CLIENT_ID && (
            <div className="text-center py-4">
              <p className="text-sm text-gray-600 mb-4">
                The official Slack app is not currently configured. Use the "Add to Slack" button above to connect your workspace.
              </p>
            </div>
          )}

          <div className={!slackIntegration ? "" : "border-t pt-4"}>
            <h4 className="font-medium text-gray-900 mb-3">How it works:</h4>
            <div className="space-y-3">
              <div className="flex items-start space-x-3">
                <div className="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-green-600 text-xs font-bold">1</span>
                </div>
                <div>
                  <p className="text-sm text-gray-700"><strong>Authorize the app</strong> to deliver 3-question burnout surveys via Slack</p>
                </div>
              </div>

              <div className="flex items-start space-x-3">
                <div className="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-green-600 text-xs font-bold">2</span>
                </div>
                <div>
                  <p className="text-sm text-gray-700"><strong>Team members receive surveys</strong> via automated DMs or by typing <code className="bg-gray-100 px-1 rounded text-xs">/oncall-health</code></p>
                  <div className="bg-slate-800 rounded p-3 font-mono text-sm text-green-400 mt-2">
                    <div>/oncall-health</div>
                    <div className="text-slate-400 mt-1">→ Opens interactive modal with 3 scored questions + optional text</div>
                  </div>
                </div>
              </div>

              <div className="flex items-start space-x-3">
                <div className="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-green-600 text-xs font-bold">3</span>
                </div>
                <div>
                  <p className="text-sm text-gray-700"><strong>Survey data automatically integrates</strong> with your burnout analysis to validate automated detection patterns</p>
                </div>
              </div>
            </div>
          </div>
        </div>


        <div className="flex items-center justify-between pt-2 text-sm text-gray-500">
          <div className="flex items-center space-x-2">
            <Users className="w-4 h-4" />
            <span>Available to all workspace members</span>
          </div>
          <div className="flex items-center space-x-2 text-xs">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            <span>Secure OAuth authentication</span>
          </div>
        </div>
      </TabsContent>

      {/* Team Members Tab */}
      <TabsContent value="team" className="space-y-4 mt-4">
        <div className="bg-white rounded-lg border p-4">
          <div className="mb-4">
            <h4 className="font-medium text-gray-900 mb-2">Survey Correlation</h4>
            <p className="text-sm text-gray-600 mb-3">
              When team members run <code className="bg-gray-100 px-1 rounded text-xs">/oncall-health</code>,
              it opens an interactive modal with 2 scored questions + optional text.
              We match their responses to their profile using:
            </p>
            <div className="space-y-2 text-sm">
              <div className="flex items-start space-x-2">
                <div className="w-5 h-5 bg-purple-100 rounded flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-purple-600 text-xs">1</span>
                </div>
                <div>
                  <span className="font-medium text-gray-900">Slack email</span> matches
                  <span className="font-medium text-gray-900"> Rootly/PagerDuty email</span>
                </div>
              </div>
              <div className="flex items-start space-x-2">
                <div className="w-5 h-5 bg-purple-100 rounded flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-purple-600 text-xs">2</span>
                </div>
                <div>
                  Survey response is linked to their burnout analysis profile
                </div>
              </div>
            </div>
          </div>

          {/* Synced Users List */}
          {selectedOrganization && (
            <div className="border-t pt-4">
              {loadingSyncedUsers ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-gray-400 mr-2" />
                  <span className="text-sm text-gray-600">Loading team members...</span>
                </div>
              ) : (() => {
                const slackUsers = syncedUsers.filter((u: any) => u.slack_user_id)
                return slackUsers.length > 0 ? (
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h5 className="text-sm font-medium text-gray-900">Synced Members ({slackUsers.length})</h5>
                    </div>
                    <div className="max-h-[400px] overflow-y-auto space-y-2 pr-2">
                      {slackUsers.map((user: any) => (
                        <div key={user.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-medium text-gray-900 truncate">{user.name}</span>
                              {user.survey_count > 0 && (
                                <Badge variant="secondary" className="text-xs bg-green-100 text-green-700 border-green-200">
                                  {user.survey_count} {user.survey_count === 1 ? 'survey' : 'surveys'}
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-1 text-xs text-gray-500">
                              <Mail className="w-3 h-3" />
                              <span className="truncate">{user.email}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 ml-3">
                            {user.platforms?.map((platform: string) => {
                              const colors: Record<string, string> = {
                                slack: 'bg-purple-100 text-purple-700',
                                rootly: 'bg-blue-100 text-blue-700',
                                pagerduty: 'bg-green-100 text-green-700',
                                github: 'bg-gray-100 text-gray-700',
                                jira: 'bg-indigo-100 text-indigo-700'
                              }
                              return (
                                <Badge key={platform} variant="outline" className={`text-xs ${colors[platform] || 'bg-gray-100 text-gray-700'}`}>
                                  {platform}
                                </Badge>
                              )
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-gray-600 text-center py-6">
                    <p>No Slack users found. Use the <strong>Sync Members</strong> button at the top to sync users from your organization.</p>
                  </div>
                )
              })()}
            </div>
          )}

          {!selectedOrganization && (
            <div className="border-t pt-4 text-center py-6">
              <p className="text-sm text-gray-600">
                Select an organization from the integrations section above to view team members.
              </p>
            </div>
          )}
        </div>
      </TabsContent>

      {/* Actions Tab */}
      <TabsContent value="actions" className="space-y-4 mt-4">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
          <p className="text-sm text-blue-900">
            ℹ️ <strong>Tip:</strong> Select which team members should receive surveys in the <strong>Team Members</strong> tab before sending.
          </p>
        </div>

        <div className="bg-white rounded-lg border p-4">
          <h4 className="font-medium text-gray-900 mb-3">Survey Delivery</h4>
          <p className="text-sm text-gray-600 mb-4">
            Send burnout surveys to your team members immediately via Slack DM.
          </p>

          <div className="flex justify-center">
            <Button
              onClick={() => setShowManualSurveyModal(true)}
              className="flex items-center space-x-2 bg-purple-600 hover:bg-purple-700"
            >
              <Send className="w-4 h-4" />
              <span>Send Survey Now</span>
            </Button>
          </div>

          <div className="mt-6 border-t pt-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h5 className="text-sm font-medium text-gray-900 flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  Automated Schedule
                </h5>
                <p className="text-xs text-gray-500 mt-1">
                  Send surveys every weekday at a specific time
                </p>
                {scheduleEnabled && savedScheduleTime && (
                  <p className="text-xs font-medium text-purple-600 mt-1.5">
                    Set time: {(() => {
                      const [hour, minute] = savedScheduleTime.split(':').map(Number)
                      const period = hour >= 12 ? 'PM' : 'AM'
                      const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour
                      return `${displayHour}:${String(minute).padStart(2, '0')} ${period}`
                    })()}
                  </p>
                )}
              </div>
              <Switch
                checked={scheduleEnabled}
                onCheckedChange={setScheduleEnabled}
                disabled={savingSchedule}
              />
            </div>

            {scheduleEnabled && (
              <div className="space-y-3 mt-4 p-3 bg-gray-50 rounded-md">
                <div>
                  <Label className="text-sm text-gray-700">
                    Delivery Time (Your Local Time)
                  </Label>
                  <div className="mt-2 flex items-center justify-center gap-2 p-3 bg-white rounded-lg border border-gray-200">
                    {/* Hour Scroller */}
                    <div className="flex flex-col items-center">
                      <button
                        onClick={() => {
                          const [hour, minute] = scheduleTime.split(':').map(Number)
                          const newHour = hour === 23 ? 0 : hour + 1
                          setScheduleTime(`${String(newHour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`)
                        }}
                        disabled={savingSchedule}
                        className="text-gray-400 hover:text-gray-600 disabled:opacity-50"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                        </svg>
                      </button>
                      <div className="text-2xl font-semibold text-gray-900 my-1 w-12 text-center">
                        {(() => {
                          const hour = parseInt(scheduleTime.split(':')[0])
                          const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour
                          return String(displayHour).padStart(2, '0')
                        })()}
                      </div>
                      <button
                        onClick={() => {
                          const [hour, minute] = scheduleTime.split(':').map(Number)
                          const newHour = hour === 0 ? 23 : hour - 1
                          setScheduleTime(`${String(newHour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`)
                        }}
                        disabled={savingSchedule}
                        className="text-gray-400 hover:text-gray-600 disabled:opacity-50"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                    </div>

                    <div className="text-2xl font-bold text-gray-400">:</div>

                    {/* Minute Scroller */}
                    <div className="flex flex-col items-center">
                      <button
                        onClick={() => {
                          const [hour, minute] = scheduleTime.split(':').map(Number)
                          const newMinute = minute === 45 ? 0 : minute + 15
                          setScheduleTime(`${String(hour).padStart(2, '0')}:${String(newMinute).padStart(2, '0')}`)
                        }}
                        disabled={savingSchedule}
                        className="text-gray-400 hover:text-gray-600 disabled:opacity-50"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                        </svg>
                      </button>
                      <div className="text-2xl font-semibold text-gray-900 my-1 w-12 text-center">
                        {scheduleTime.split(':')[1]}
                      </div>
                      <button
                        onClick={() => {
                          const [hour, minute] = scheduleTime.split(':').map(Number)
                          const newMinute = minute === 0 ? 45 : minute - 15
                          setScheduleTime(`${String(hour).padStart(2, '0')}:${String(newMinute).padStart(2, '0')}`)
                        }}
                        disabled={savingSchedule}
                        className="text-gray-400 hover:text-gray-600 disabled:opacity-50"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                    </div>

                    {/* AM/PM Toggle */}
                    <button
                      onClick={() => {
                        const [hour, minute] = scheduleTime.split(':').map(Number)
                        const newHour = hour >= 12 ? hour - 12 : hour + 12
                        setScheduleTime(`${String(newHour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`)
                      }}
                      disabled={savingSchedule}
                      className="ml-1 px-2 py-1 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded disabled:opacity-50"
                    >
                      {parseInt(scheduleTime.split(':')[0]) >= 12 ? 'PM' : 'AM'}
                    </button>
                  </div>
                </div>

                <div>
                  <Label className="text-sm text-gray-700">Frequency</Label>
                  <select
                    value={frequencyType}
                    onChange={(e) => setFrequencyType(e.target.value as 'daily' | 'weekday' | 'weekly')}
                    disabled={savingSchedule}
                    className="mt-2 w-full px-3 py-2 border border-gray-200 rounded-md text-sm"
                  >
                    <option value="daily">Every day</option>
                    <option value="weekday">Weekdays (Mon-Fri)</option>
                    <option value="weekly">Once per week</option>
                  </select>
                </div>

                {frequencyType === 'weekly' && (
                  <div>
                    <Label className="text-sm text-gray-700">Day of Week</Label>
                    <select
                      value={dayOfWeek}
                      onChange={(e) => setDayOfWeek(parseInt(e.target.value))}
                      disabled={savingSchedule}
                      className="mt-2 w-full px-3 py-2 border border-gray-200 rounded-md text-sm"
                    >
                      <option value={0}>Monday</option>
                      <option value={1}>Tuesday</option>
                      <option value={2}>Wednesday</option>
                      <option value={3}>Thursday</option>
                      <option value={4}>Friday</option>
                      <option value={5}>Saturday</option>
                      <option value={6}>Sunday</option>
                    </select>
                  </div>
                )}

                <div className="text-xs text-gray-600 bg-blue-50 border border-blue-100 rounded-md p-2">
                  <p className="font-medium text-blue-900 mb-1">Schedule Details:</p>
                  <ul className="space-y-1 ml-2">
                    <li>• {frequencyType === 'daily' ? 'Sends every day' : frequencyType === 'weekday' ? 'Sends Monday through Friday' : `Sends every ${['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][dayOfWeek]}`}</li>
                    <li>• Time: {scheduleTime || '09:00'} in your local timezone</li>
                  </ul>
                </div>

                <Button
                  onClick={() => setShowSaveConfirmation(true)}
                  disabled={savingSchedule}
                  className="w-full"
                  size="sm"
                >
                  {savingSchedule ? 'Saving...' : 'Save Schedule'}
                </Button>
              </div>
            )}

          </div>
        </div>
      </TabsContent>
    </Tabs>

    {/* Save Schedule Confirmation Dialog */}
    <Dialog open={showSaveConfirmation} onOpenChange={setShowSaveConfirmation}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirm Schedule</DialogTitle>
          <div className="text-sm text-muted-foreground">
            {scheduleEnabled ? (
              <>
                Are you sure you want to save this automated schedule?
                <div className="mt-3 p-3 bg-purple-50 rounded-md border border-purple-100">
                  <div className="text-sm text-gray-700 space-y-1">
                    <div className="font-medium text-purple-900">Schedule Details:</div>
                    <div>• <strong>Time:</strong> {(() => {
                      const [hour, minute] = scheduleTime.split(':').map(Number)
                      const period = hour >= 12 ? 'PM' : 'AM'
                      const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour
                      return `${displayHour}:${String(minute).padStart(2, '0')} ${period}`
                    })()} ({Intl.DateTimeFormat().resolvedOptions().timeZone})</div>
                    <div>• <strong>Frequency:</strong> {frequencyType === 'daily' ? 'Every day' : frequencyType === 'weekday' ? 'Weekdays (Mon-Fri)' : `Every ${['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][dayOfWeek]}`}</div>
                    <div>• <strong>Recipients:</strong> All team members with Slack</div>
                  </div>
                </div>
              </>
            ) : (
              <>
                Are you sure you want to disable the automated schedule?
                <div className="mt-3 p-3 bg-amber-50 rounded-md border border-amber-100">
                  <div className="text-sm text-amber-900">
                    Surveys will no longer be sent automatically. Team members can still use the <code className="bg-amber-100 px-1 rounded">/oncall-health</code> command.
                  </div>
                </div>
              </>
            )}
          </div>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setShowSaveConfirmation(false)}
            disabled={savingSchedule}
          >
            Cancel
          </Button>
          <Button
            onClick={async () => {
              await saveSchedule()
              setShowSaveConfirmation(false)
            }}
            disabled={savingSchedule}
            className="bg-purple-600 hover:bg-purple-700"
          >
            {savingSchedule ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              'Confirm & Save'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  )
}
