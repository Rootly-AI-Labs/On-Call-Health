"use client"

import { useState, useEffect, useRef, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Checkbox } from "@/components/ui/checkbox"
import { CheckCircle, Users, Send, RefreshCw, Database, Users2, Loader2, Building, Clock, Mail, ChevronDown, ChevronUp } from "lucide-react"

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
  const [savedScheduleEnabled, setSavedScheduleEnabled] = useState(false) // Track saved enabled state
  const hasUnsavedScheduleChangesRef = useRef(false) // Track if user has made changes (ref for immediate access)
  const [scheduleTime, setScheduleTime] = useState('09:00')
  const [frequencyType, setFrequencyType] = useState<'daily' | 'weekday' | 'weekly'>('weekday')
  const [dayOfWeek, setDayOfWeek] = useState<number>(4) // Default: Friday
  const [followUpRemindersEnabled, setFollowUpRemindersEnabled] = useState(true) // Daily reminders until answered
  const [savedScheduleTime, setSavedScheduleTime] = useState<string | null>(null) // Track saved time from DB
  const [savedFrequencyType, setSavedFrequencyType] = useState<'daily' | 'weekday' | 'weekly'>('weekday')
  const [savedDayOfWeek, setSavedDayOfWeek] = useState<number>(4)
  const [loadingSchedule, setLoadingSchedule] = useState(false)
  const [savingSchedule, setSavingSchedule] = useState(false)
  const [showSaveConfirmation, setShowSaveConfirmation] = useState(false)
  const [scheduleAccordionOpen, setScheduleAccordionOpen] = useState(false)
  const [lastModifiedByName, setLastModifiedByName] = useState<string | null>(null)
  const [lastModifiedByUserId, setLastModifiedByUserId] = useState<number | null>(null)
  const [lastModifiedAt, setLastModifiedAt] = useState<string | null>(null)

  // Recipient selection state
  const [selectedRecipients, setSelectedRecipients] = useState<Set<number>>(new Set())
  const [savedRecipients, setSavedRecipients] = useState<Set<number>>(new Set()) // Track what's actually saved
  const [savingRecipients, setSavingRecipients] = useState(false)
  const [loadingRecipients, setLoadingRecipients] = useState(false)
  const [showScheduledRecipientsDialog, setShowScheduledRecipientsDialog] = useState(false)

  // Memoize recipient changes check to avoid repeated Set operations
  const hasRecipientChanges = useMemo(() => {
    if (selectedRecipients.size !== savedRecipients.size) return true
    return Array.from(selectedRecipients).some(id => !savedRecipients.has(id))
  }, [selectedRecipients, savedRecipients])

  const slackUsers = useMemo(
    () => syncedUsers.filter((u: any) => u.slack_user_id),
    [syncedUsers]
  )

  const selectedScheduledRecipientUsers = useMemo(() => {
    if (savedRecipients.size > 0) {
      return slackUsers.filter((user: any) => savedRecipients.has(user.id))
    }

    return slackUsers
  }, [savedRecipients, slackUsers])

  const scheduledRecipientUsers = useMemo(() => {
    const effectiveUsers = selectedScheduledRecipientUsers.filter((user: any) => {
      if (typeof user.eligible_for_automated_surveys === 'boolean') {
        return user.eligible_for_automated_surveys
      }

      return Boolean(user.slack_user_id && user.email)
    })

    return effectiveUsers
  }, [selectedScheduledRecipientUsers])

  const nonDeliverableScheduledUsers = useMemo(
    () => selectedScheduledRecipientUsers.filter(
      (user: any) => !scheduledRecipientUsers.some((scheduledUser: any) => scheduledUser.id === user.id)
    ),
    [scheduledRecipientUsers, selectedScheduledRecipientUsers]
  )

  const usesDefaultScheduledRecipients = savedRecipients.size === 0
  const accessibleAutomatedScheduleCount = scheduleEnabled ? 1 : 0

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
      // Load saved recipients
      loadSurveyRecipients()
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

  const loadSchedule = async (forceLoad = false) => {
    // Don't overwrite local changes unless forced (e.g., after save)
    // Use ref for immediate access without waiting for state updates
    if (!forceLoad && hasUnsavedScheduleChangesRef.current) {
      return
    }

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
          setSavedScheduleEnabled(data.enabled) // Track saved state
          hasUnsavedScheduleChangesRef.current = false // Reset unsaved changes flag

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
            setSavedFrequencyType(data.frequency_type)
          }
          if (data.day_of_week !== undefined && data.day_of_week !== null) {
            setDayOfWeek(data.day_of_week)
            setSavedDayOfWeek(data.day_of_week)
          }
          setFollowUpRemindersEnabled(data.follow_up_reminders_enabled !== false)

          // Load last modified info
          setLastModifiedByName(data.last_modified_by_name || null)
          setLastModifiedByUserId(data.last_modified_by_user_id || null)
          setLastModifiedAt(data.last_modified_at || null)
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
        reminder_hours_after: 5,
        follow_up_reminders_enabled: followUpRemindersEnabled
      }

      const response = await fetch(`${API_BASE}/api/surveys/survey-schedule`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify(payload)
      })

      if (response.ok) {
        const responseData = await response.json()
        toast.success('Schedule saved successfully')
        // Update saved state immediately
        setSavedScheduleTime(scheduleTime)
        setSavedFrequencyType(frequencyType)
        setSavedDayOfWeek(dayOfWeek)
        // Reload schedule from DB to ensure we display exactly what's saved
        await loadSchedule(true) // Force reload after save
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

  const loadSurveyRecipients = async () => {
    if (!selectedOrganization) return

    setLoadingRecipients(true)
    try {
      const authToken = localStorage.getItem('auth_token')
      const response = await fetch(
        `${API_BASE}/rootly/integrations/${selectedOrganization}/survey-recipients`,
        {
          headers: {
            'Authorization': `Bearer ${authToken}`
          }
        }
      )

      if (response.ok) {
        const data = await response.json()
        // data.recipient_ids is array of UserCorrelation IDs
        const savedIds = new Set<number>(data.recipient_ids || [])
        setSelectedRecipients(savedIds)
        setSavedRecipients(savedIds) // Track what's saved
      }
    } catch (error) {
      console.error('Failed to load survey recipients:', error)
    } finally {
      setLoadingRecipients(false)
    }
  }

  const saveSurveyRecipients = async () => {
    if (!selectedOrganization) return

    setSavingRecipients(true)
    try {
      const authToken = localStorage.getItem('auth_token')
      const recipientIds = Array.from(selectedRecipients)

      const response = await fetch(
        `${API_BASE}/rootly/integrations/${selectedOrganization}/survey-recipients`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`
          },
          body: JSON.stringify(recipientIds)
        }
      )

      if (response.ok) {
        const data = await response.json()
        toast.success(data.message || 'Survey recipients updated')
        // Update saved state to match current selection
        setSavedRecipients(new Set(selectedRecipients))
        // Refresh the synced users to update the "Auto Survey" badges
        fetchSyncedUsers(false, false, true, false)
      } else {
        const error = await response.json()
        console.error('Failed to save survey recipients - Backend error:', error)
        console.error('Request payload was:', recipientIds)
        toast.error(error.detail || 'Failed to update recipients')
      }
    } catch (error) {
      console.error('Failed to save survey recipients - Network error:', error)
      toast.error('Failed to update recipients')
    } finally {
      setSavingRecipients(false)
    }
  }

  const toggleRecipient = (userId: number) => {
    const newSet = new Set(selectedRecipients)
    if (newSet.has(userId)) {
      newSet.delete(userId)
    } else {
      newSet.add(userId)
    }
    setSelectedRecipients(newSet)
  }

  const selectAllRecipients = () => {
    const slackUsers = syncedUsers.filter((u: any) => u.slack_user_id)
    const allIds = new Set(slackUsers.map((u: any) => u.id))
    setSelectedRecipients(allIds)
  }

  const deselectAllRecipients = () => {
    setSelectedRecipients(new Set())
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
    <Tabs defaultValue="team" className="w-full">
      <TabsList className="grid w-full grid-cols-2 bg-purple-100/50">
        <TabsTrigger value="team" className="data-[state=active]:bg-white">
          Team Members
        </TabsTrigger>
        <TabsTrigger value="actions" className="data-[state=active]:bg-white">
          Survey
        </TabsTrigger>
      </TabsList>

      {/* Team Members Tab */}
      <TabsContent value="team" className="space-y-4 mt-4">
        <div className="bg-white rounded-lg border p-4">
          <div className="mb-4">
            <h4 className="font-medium text-neutral-900 mb-2">Automated Survey Recipients</h4>
            <p className="text-sm text-neutral-700 mb-3">
              Select which team members should receive automated survey DMs. Only users with Slack accounts can be selected.
            </p>
            <p className="text-xs text-neutral-500">
              This recipient list is shared across admins and is the same list used for scheduled Slack surveys.
            </p>
          </div>

          {/* Synced Users List with Checkboxes */}
          {selectedOrganization && (
            <div className="border-t pt-4">
              {loadingSyncedUsers || loadingRecipients ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-neutral-500 mr-2" />
                  <span className="text-sm text-neutral-700">Loading team members...</span>
                </div>
              ) : (() => {
                return slackUsers.length > 0 ? (
                  <div>
                    {hasRecipientChanges && (
                        <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-lg transition-all duration-200">
                          <p className="text-sm text-amber-900">
                            ⚠️ <strong>Unsaved changes:</strong> You have {selectedRecipients.size} member{selectedRecipients.size !== 1 ? 's' : ''} selected.
                            Click <strong>Save Recipients</strong> below to apply these changes.
                          </p>
                        </div>
                      )}
                    <div className="flex items-center justify-between mb-3">
                      <h5 className="text-sm font-medium text-neutral-900">
                        Team Members ({slackUsers.length})
                        {(savedRecipients.size > 0 || nonDeliverableScheduledUsers.length > 0) && (
                          <span className="ml-2 text-green-600">
                            • {scheduledRecipientUsers.length} configured for automated surveys
                            {nonDeliverableScheduledUsers.length > 0 && (
                              <span className="ml-1 text-amber-600">
                                ({nonDeliverableScheduledUsers.length} excluded)
                              </span>
                            )}
                          </span>
                        )}
                      </h5>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={selectAllRecipients}
                          className="text-xs"
                        >
                          Select All
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={deselectAllRecipients}
                          className="text-xs"
                        >
                          Clear
                        </Button>
                      </div>
                    </div>
                    <div className="max-h-[400px] overflow-y-auto space-y-2 pr-2 mb-4">
                      {slackUsers.map((user: any) => (
                        <div
                          key={user.id}
                          className="flex items-center justify-between p-3 bg-neutral-100 rounded-lg hover:bg-neutral-200 transition-colors cursor-pointer"
                          onClick={() => toggleRecipient(user.id)}
                        >
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <Checkbox
                              checked={selectedRecipients.has(user.id)}
                              onCheckedChange={() => toggleRecipient(user.id)}
                              onClick={(e) => e.stopPropagation()}
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="font-medium text-neutral-900 truncate">{user.name}</span>
                                {user.survey_count > 0 && (
                                  <Badge variant="secondary" className="text-xs bg-green-100 text-green-700 border-green-200">
                                    {user.survey_count} {user.survey_count === 1 ? 'survey' : 'surveys'}
                                  </Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-1 text-xs text-neutral-500">
                                <Mail className="w-3 h-3" />
                                <span className="truncate">{user.email}</span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 ml-3">
                            {user.platforms?.map((platform: string) => {
                              const colors: Record<string, string> = {
                                slack: 'bg-purple-100 text-purple-700',
                                rootly: 'bg-blue-100 text-blue-700',
                                pagerduty: 'bg-green-100 text-green-700',
                                github: 'bg-neutral-200 text-neutral-700',
                                jira: 'bg-indigo-100 text-indigo-700'
                              }
                              return (
                                <Badge key={platform} variant="outline" className={`text-xs ${colors[platform] || 'bg-neutral-200 text-neutral-700'}`}>
                                  {platform}
                                </Badge>
                              )
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="flex justify-end gap-2">
                      {hasRecipientChanges && (
                        <Button
                          onClick={() => {
                            setSelectedRecipients(new Set(savedRecipients))
                          }}
                          variant="outline"
                          disabled={savingRecipients}
                        >
                          Revert Changes
                        </Button>
                      )}
                      <Button
                        onClick={saveSurveyRecipients}
                        disabled={savingRecipients || !hasRecipientChanges}
                        className="bg-purple-700 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {savingRecipients ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Saving...
                          </>
                        ) : (
                          <>
                            Save Recipients
                            {hasRecipientChanges && (() => {
                              // Count added and removed
                              const added = Array.from(selectedRecipients).filter(id => !savedRecipients.has(id)).length
                              const removed = Array.from(savedRecipients).filter(id => !selectedRecipients.has(id)).length
                              const totalChanges = added + removed

                              return totalChanges > 0 && (
                                <span className="ml-1">({totalChanges} {totalChanges === 1 ? 'change' : 'changes'})</span>
                              )
                            })()}
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-neutral-700 text-center py-6">
                    <p>No Slack users found. Use the <strong>Sync Members</strong> button at the top to sync users from your organization.</p>
                  </div>
                )
              })()}
            </div>
          )}

          {!selectedOrganization && (
            <div className="border-t pt-4 text-center py-6">
              <p className="text-sm text-neutral-700">
                Select an organization from the integrations section above to view team members.
              </p>
            </div>
          )}
        </div>
      </TabsContent>

      {/* Survey Tab */}
      <TabsContent value="actions" className="space-y-4 mt-4">
        {hasRecipientChanges && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-sm text-amber-900">
              ⚠️ <strong>Unsaved changes:</strong> You have unsaved recipient changes in the <strong>Team Members</strong> tab.
            </p>
          </div>
        )}

        {/* Slash Command Info */}
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
          <p className="text-sm text-purple-900">
            <strong>Team members can check in anytime</strong> using the <code className="bg-purple-100 px-1.5 py-0.5 rounded-sm text-xs font-mono">/oncall-health</code> command in Slack.
          </p>
        </div>

        <div className="bg-white rounded-lg border p-4">
          <h4 className="font-medium text-neutral-900 mb-3">Manual Survey Delivery</h4>
          <p className="text-sm text-neutral-700 mb-4">
            Send wellness surveys to your team members immediately via Slack DM.
          </p>

          <div className="flex justify-center">
            <Button
              onClick={() => setShowManualSurveyModal(true)}
              className="flex items-center space-x-2 bg-purple-700 hover:bg-purple-700"
            >
              <Send className="w-4 h-4" />
              <span>Send Survey Now</span>
            </Button>
          </div>

          <div className="mt-6 border-t pt-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h5 className="text-sm font-medium text-neutral-900 flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  Automated Schedule
                </h5>
                <p className="text-xs text-neutral-500 mt-1">
                  Send surveys every weekday at a specific time
                </p>
                <p className="text-xs text-neutral-500 mt-1">
                  This schedule is shared across your org and appears the same under any connected token.
                </p>
                <p className="text-xs text-neutral-500 mt-1">
                  {accessibleAutomatedScheduleCount} automated {accessibleAutomatedScheduleCount === 1 ? 'schedule' : 'schedules'} currently available across the orgs you can access here.
                </p>
                <p className="text-xs text-neutral-400 mt-1">
                  Today that count is org-wide, so it will be 0 or 1 rather than one schedule per token.
                </p>
                {scheduleEnabled && !loadingSyncedUsers && !loadingRecipients && (
                  <>
                    <button
                      type="button"
                      onClick={() => setShowScheduledRecipientsDialog(true)}
                      className="mt-1.5 text-left text-xs font-medium text-purple-600 underline decoration-purple-300 underline-offset-2 hover:text-purple-700"
                    >
                      {usesDefaultScheduledRecipients
                        ? `All ${scheduledRecipientUsers.length} eligible ${scheduledRecipientUsers.length === 1 ? 'user' : 'users'} will receive surveys`
                        : `${scheduledRecipientUsers.length} ${scheduledRecipientUsers.length === 1 ? 'user' : 'users'} will receive surveys`}
                    </button>
                    {hasRecipientChanges && (
                      <p className="text-xs text-amber-700 mt-1">
                        Unsaved Team Members changes are not included in the automated schedule until you save recipients.
                      </p>
                    )}
                  </>
                )}
                {lastModifiedAt && lastModifiedByUserId && (
                  <p className="text-xs text-neutral-400 mt-1.5">
                    Last schedule change: {lastModifiedByName || '[deleted user]'} on {new Date(lastModifiedAt).toLocaleDateString()} at {new Date(lastModifiedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                )}
              </div>
              <Switch
                checked={scheduleEnabled}
                onCheckedChange={async (checked) => {
                  setScheduleEnabled(checked)
                  hasUnsavedScheduleChangesRef.current = true

                  // Auto-save immediately
                  setSavingSchedule(true)
                  try {
                    const authToken = localStorage.getItem('auth_token')
                    const payload = {
                      enabled: checked,
                      send_time: scheduleTime,
                      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                      frequency_type: frequencyType,
                      day_of_week: frequencyType === 'weekly' ? dayOfWeek : null,
                      send_reminder: false,
                      reminder_hours_after: 5,
                      follow_up_reminders_enabled: followUpRemindersEnabled
                    }

                    const response = await fetch(`${API_BASE}/api/surveys/survey-schedule`, {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${authToken}`
                      },
                      body: JSON.stringify(payload)
                    })

                    if (response.ok) {
                      toast.success(`Automated surveys ${checked ? 'enabled' : 'disabled'}`)
                      if (!checked) {
                        // Clear schedule state when disabled
                        setScheduleTime('09:00')
                        setFrequencyType('weekday')
                        setDayOfWeek(4)
                        setFollowUpRemindersEnabled(true)
                        setSavedScheduleTime(null)
                        setSavedFrequencyType('weekday')
                        setSavedDayOfWeek(4)
                      }
                      await loadSchedule(true) // Force reload after save
                    } else {
                      const error = await response.json()
                      toast.error(error.detail || 'Failed to save schedule')
                      setScheduleEnabled(!checked) // Revert on error
                    }
                  } catch (error) {
                    console.error('Failed to save schedule:', error)
                    toast.error('Failed to save schedule')
                    setScheduleEnabled(!checked) // Revert on error
                  } finally {
                    setSavingSchedule(false)
                  }
                }}
                disabled={savingSchedule}
              />
            </div>

            {scheduleEnabled && (
              <div className="space-y-3 mt-4">
                {/* Accordion Summary */}
                <button
                  onClick={() => setScheduleAccordionOpen(!scheduleAccordionOpen)}
                  className="w-full p-4 bg-white border border-neutral-200 rounded-lg hover:bg-neutral-50 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="text-left">
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-neutral-600" />
                        <span className="font-medium text-sm text-neutral-900">
                          {(() => {
                            const timeToDisplay = savedScheduleTime || scheduleTime
                            const hour = parseInt(timeToDisplay.split(':')[0])
                            const minute = timeToDisplay.split(':')[1]
                            const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour
                            const ampm = hour >= 12 ? 'PM' : 'AM'
                            return `${String(displayHour).padStart(2, '0')}:${minute} ${ampm}`
                          })()}
                        </span>
                      </div>
                      <div className="text-xs text-neutral-600 mt-1">
                        {savedFrequencyType === 'daily' ? 'Every day' : savedFrequencyType === 'weekday' ? 'Weekdays (Mon-Fri)' : `${['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][savedDayOfWeek]}`}
                      </div>
                    </div>
                    {scheduleAccordionOpen ? (
                      <ChevronUp className="w-5 h-5 text-neutral-500" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-neutral-500" />
                    )}
                  </div>
                </button>

                {/* Accordion Content */}
                {scheduleAccordionOpen && (
                  <div className="space-y-3 p-3 bg-neutral-100 rounded-md">
                    <div>
                      <Label className="text-sm text-neutral-700">
                        Delivery Time (Your Local Time)
                      </Label>
                      <div className="mt-2 flex items-center justify-center gap-2 p-3 bg-white rounded-lg border border-neutral-200">
                        {/* Hour Scroller */}
                        <div className="flex flex-col items-center">
                          <button
                            onClick={() => {
                              const [hour, minute] = scheduleTime.split(':').map(Number)
                              const newHour = hour === 23 ? 0 : hour + 1
                              setScheduleTime(`${String(newHour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`)
                              hasUnsavedScheduleChangesRef.current = true
                            }}
                            disabled={savingSchedule}
                            className="text-neutral-500 hover:text-neutral-700 disabled:opacity-50"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                            </svg>
                          </button>
                          <div className="text-2xl font-semibold text-neutral-900 my-1 w-12 text-center">
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
                              hasUnsavedScheduleChangesRef.current = true
                            }}
                            disabled={savingSchedule}
                            className="text-neutral-500 hover:text-neutral-700 disabled:opacity-50"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </button>
                        </div>

                        <div className="text-2xl font-bold text-neutral-500">:</div>

                        {/* Minute Scroller */}
                        <div className="flex flex-col items-center">
                          <button
                            onClick={() => {
                              const [hour, minute] = scheduleTime.split(':').map(Number)
                              const newMinute = minute === 45 ? 0 : minute + 15
                              setScheduleTime(`${String(hour).padStart(2, '0')}:${String(newMinute).padStart(2, '0')}`)
                              hasUnsavedScheduleChangesRef.current = true
                            }}
                            disabled={savingSchedule}
                            className="text-neutral-500 hover:text-neutral-700 disabled:opacity-50"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                            </svg>
                          </button>
                          <div className="text-2xl font-semibold text-neutral-900 my-1 w-12 text-center">
                            {scheduleTime.split(':')[1]}
                          </div>
                          <button
                            onClick={() => {
                              const [hour, minute] = scheduleTime.split(':').map(Number)
                              const newMinute = minute === 0 ? 45 : minute - 15
                              setScheduleTime(`${String(hour).padStart(2, '0')}:${String(newMinute).padStart(2, '0')}`)
                              hasUnsavedScheduleChangesRef.current = true
                            }}
                            disabled={savingSchedule}
                            className="text-neutral-500 hover:text-neutral-700 disabled:opacity-50"
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
                            hasUnsavedScheduleChangesRef.current = true
                          }}
                          disabled={savingSchedule}
                          className="ml-1 px-2 py-1 text-xs font-medium text-neutral-700 bg-neutral-200 hover:bg-neutral-300 rounded-sm disabled:opacity-50"
                        >
                          {parseInt(scheduleTime.split(':')[0]) >= 12 ? 'PM' : 'AM'}
                        </button>
                      </div>
                    </div>

                    <div>
                      <Label className="text-sm text-neutral-700">Frequency</Label>
                      <select
                        value={frequencyType}
                        onChange={(e) => {
                          setFrequencyType(e.target.value as 'daily' | 'weekday' | 'weekly')
                          hasUnsavedScheduleChangesRef.current = true
                        }}
                        disabled={savingSchedule}
                        className="mt-2 w-full px-3 py-2 border border-neutral-200 rounded-md text-sm"
                      >
                        <option value="daily">Every day</option>
                        <option value="weekday">Weekdays (Mon-Fri)</option>
                        <option value="weekly">Once per week</option>
                      </select>
                    </div>

                    {frequencyType === 'weekly' && (
                      <div>
                        <Label className="text-sm text-neutral-700">Day of Week</Label>
                        <select
                          value={dayOfWeek}
                          onChange={(e) => {
                            setDayOfWeek(parseInt(e.target.value))
                            hasUnsavedScheduleChangesRef.current = true
                          }}
                          disabled={savingSchedule}
                          className="mt-2 w-full px-3 py-2 border border-neutral-200 rounded-md text-sm"
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

                    <div className="flex items-center justify-between p-3 bg-white rounded-lg border border-neutral-200">
                      <div>
                        <Label className="text-sm font-medium text-neutral-900">
                          Daily Follow-up Reminders
                        </Label>
                        <p className="text-xs text-neutral-500 mt-0.5">
                          Send daily reminders until team members respond
                        </p>
                      </div>
                      <Switch
                        checked={followUpRemindersEnabled}
                        onCheckedChange={(checked) => {
                          setFollowUpRemindersEnabled(checked)
                          hasUnsavedScheduleChangesRef.current = true
                        }}
                        disabled={savingSchedule}
                      />
                    </div>
                    {followUpRemindersEnabled && (
                      <div className="text-xs text-neutral-700 bg-purple-50 border border-purple-100 rounded-md p-2">
                        <p>Team members will receive daily reminders at the scheduled time until they complete the survey or the period ends.</p>
                      </div>
                    )}


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
            )}

          </div>
        </div>
      </TabsContent>
    </Tabs>

    <Dialog open={showScheduledRecipientsDialog} onOpenChange={setShowScheduledRecipientsDialog}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Scheduled Survey Recipients</DialogTitle>
          <DialogDescription>
            {usesDefaultScheduledRecipients
              ? "No saved recipient filter is set, so the automated schedule will send to all eligible Slack-linked team members shown below."
              : "These are the saved team members who will receive automated Slack surveys on the current schedule."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-lg bg-neutral-100 px-3 py-2 text-sm text-neutral-700">
            {scheduledRecipientUsers.length} {scheduledRecipientUsers.length === 1 ? 'recipient' : 'recipients'}
            {usesDefaultScheduledRecipients ? ' (default all eligible users)' : ''}
          </div>

          {hasRecipientChanges && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              You have unsaved checkbox changes in Team Members. This list reflects the current saved automated schedule recipients.
            </div>
          )}

          {nonDeliverableScheduledUsers.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {nonDeliverableScheduledUsers.length} saved {nonDeliverableScheduledUsers.length === 1 ? 'recipient is' : 'recipients are'} currently excluded because they are missing survey eligibility requirements, such as a deliverable email, Slack mapping, or active survey preferences.
            </div>
          )}

          {scheduledRecipientUsers.length > 0 ? (
            <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
              {scheduledRecipientUsers.map((user: any) => (
                <div key={user.id} className="flex items-center justify-between rounded-lg border bg-white px-3 py-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-neutral-900">{user.name}</div>
                    <div className="truncate text-xs text-neutral-500">{user.email}</div>
                  </div>
                  {user.survey_count > 0 && (
                    <Badge variant="secondary" className="ml-3 text-xs bg-green-100 text-green-700 border-green-200">
                      {user.survey_count} {user.survey_count === 1 ? 'survey' : 'surveys'}
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border bg-neutral-50 px-3 py-6 text-center text-sm text-neutral-600">
              No eligible Slack recipients are currently available for the automated schedule.
            </div>
          )}

          {nonDeliverableScheduledUsers.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                Saved but not currently deliverable
              </div>
              <div className="max-h-40 space-y-2 overflow-y-auto pr-1">
                {nonDeliverableScheduledUsers.map((user: any) => (
                  <div key={user.id} className="flex items-center justify-between rounded-lg border border-amber-200 bg-white px-3 py-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-neutral-900">{user.name}</div>
                      <div className="truncate text-xs text-neutral-500">{user.email || "Missing email"}</div>
                    </div>
                    <Badge variant="outline" className="ml-3 text-xs border-amber-300 text-amber-700">
                      Excluded
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setShowScheduledRecipientsDialog(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

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
                  <div className="text-sm text-neutral-700 space-y-1">
                    <div className="font-medium text-purple-900">Schedule Details:</div>
                    <div>• <strong>Time:</strong> {(() => {
                      const [hour, minute] = scheduleTime.split(':').map(Number)
                      const period = hour >= 12 ? 'PM' : 'AM'
                      const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour
                      return `${displayHour}:${String(minute).padStart(2, '0')} ${period}`
                    })()} ({Intl.DateTimeFormat().resolvedOptions().timeZone})</div>
                    <div>• <strong>Frequency:</strong> {frequencyType === 'daily' ? 'Every day' : frequencyType === 'weekday' ? 'Weekdays (Mon-Fri)' : `Every ${['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][dayOfWeek]}`}</div>
                    <div>• <strong>Recipients:</strong> {usesDefaultScheduledRecipients ? `All ${scheduledRecipientUsers.length} eligible Slack-linked members` : `${scheduledRecipientUsers.length} configured member${scheduledRecipientUsers.length !== 1 ? 's' : ''}`}</div>
                    <div>• <strong>Daily Reminders:</strong> {followUpRemindersEnabled ? 'Enabled (until answered)' : 'Disabled'}</div>
                  </div>
                </div>
              </>
            ) : (
              <>
                Are you sure you want to disable the automated schedule?
                <div className="mt-3 p-3 bg-amber-50 rounded-md border border-amber-100">
                  <div className="text-sm text-amber-900">
                    Surveys will no longer be sent automatically. Team members can still use the <code className="bg-amber-100 px-1 rounded-sm">/oncall-health</code> command.
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
            className="bg-purple-700 hover:bg-purple-700"
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
