"use client"

import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Tooltip } from "@/components/ui/tooltip"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Activity,
  ArrowLeft,
  Building,
  Calendar,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Clock,
  Edit3,
  Key,
  Plus,
  Settings,
  Shield,
  Star,
  Trash2,
  Users,
  Zap,
  Loader2,
  CheckCircle,
  AlertCircle,
  Eye,
  EyeOff,
  Copy,
  Check,
  HelpCircle,
  ExternalLink,
  TestTube,
  RotateCcw,
  BarChart3,
  Database,
  Users2,
  RefreshCw,
  X,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  LogOut,
  UserPlus,
  Mail,
  Send,
  MessageSquare,
} from "lucide-react"
import Link from "next/link"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { MappingDrawer } from "@/components/mapping-drawer"
import { NotificationDrawer } from "@/components/notifications"
import ManualSurveyDeliveryModal from "@/components/ManualSurveyDeliveryModal"
import { SlackSurveyTabs } from "@/components/SlackSurveyTabs"
import { TopPanel } from "@/components/TopPanel"
import { TeamSyncPrompt } from "@/components/TeamSyncPrompt"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import {
  type Integration,
  type GitHubIntegration,
  type SlackIntegration,
  type JiraIntegration,
  type PreviewData,
  type IntegrationMapping,
  type MappingStatistics,
  type AnalysisMappingStatistics,
  type ManualMapping,
  type ManualMappingStatistics,
  type UserInfo,
  type RootlyFormData,
  type PagerDutyFormData,
  rootlyFormSchema,
  pagerdutyFormSchema,
  isValidRootlyToken,
  isValidPagerDutyToken,
  API_BASE,
} from "./types"
import * as GithubHandlers from "./handlers/github-handlers"
import * as SlackHandlers from "./handlers/slack-handlers"
import * as JiraHandlers from "./handlers/jira-handlers"
import * as TeamHandlers from "./handlers/team-handlers"
import * as IntegrationHandlers from "./handlers/integration-handlers"
import * as OrganizationHandlers from "./handlers/organization-handlers"
import * as AIHandlers from "./handlers/ai-handlers"
import * as MappingHandlers from "./handlers/mapping-handlers"
import * as Utils from "./utils"
import { GitHubIntegrationCard } from "./components/GitHubIntegrationCard"
import { AIInsightsCard } from "./components/AIInsightsCard"
import { GitHubConnectedCard } from "./components/GitHubConnectedCard"
import { JiraIntegrationCard } from "./components/JiraIntegrationCard"
import { JiraConnectedCard } from "./components/JiraConnectedCard"
import { RootlyIntegrationForm } from "./components/RootlyIntegrationForm"
import { SurveyFeedbackSection } from "./components/SurveyFeedbackSection"
import { PagerDutyIntegrationForm } from "./components/PagerDutyIntegrationForm"
import { IntegrationCardItem } from "./components/IntegrationCardItem"
import { DeleteIntegrationDialog } from "./dialogs/DeleteIntegrationDialog"
import { GitHubDisconnectDialog } from "./dialogs/GitHubDisconnectDialog"
import { SlackDisconnectDialog } from "./dialogs/SlackDisconnectDialog"
import { JiraDisconnectDialog } from "./dialogs/JiraDisconnectDialog"
import { JiraWorkspaceSelector } from "./dialogs/JiraWorkspaceSelector"
import { NewMappingDialog } from "./dialogs/NewMappingDialog"
import { OrganizationManagementDialog } from "./dialogs/OrganizationManagementDialog"

export default function IntegrationsPage() {
  // State management
  const [integrations, setIntegrations] = useState<Integration[]>([])
  const [loadingRootly, setLoadingRootly] = useState(true)
  const [loadingPagerDuty, setLoadingPagerDuty] = useState(true)
  const [loadingGitHub, setLoadingGitHub] = useState(true)
  const [loadingSlack, setLoadingSlack] = useState(true)
  const [loadingJira, setLoadingJira] = useState(true)
  const [reloadingIntegrations, setReloadingIntegrations] = useState(false)
  const [loadingPermissions, setLoadingPermissions] = useState(false)
  const [refreshingPermissions, setRefreshingPermissions] = useState<number | null>(null)
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null)
  const [activeTab, setActiveTab] = useState<"rootly" | "pagerduty" | null>(null)
  const [backUrl, setBackUrl] = useState<string>('/dashboard')
  const [selectedOrganization, setSelectedOrganization] = useState<string>("")
  const [navigatingToDashboard, setNavigatingToDashboard] = useState(false)
  const [expandedIntegrations, setExpandedIntegrations] = useState<Set<number>>(new Set())

  // GitHub/Slack integration state
  const [githubIntegration, setGithubIntegration] = useState<GitHubIntegration | null>(null)
  const [slackIntegration, setSlackIntegration] = useState<SlackIntegration | null>(null)
  const [jiraIntegration, setJiraIntegration] = useState<JiraIntegration | null>(null)
  const [activeEnhancementTab, setActiveEnhancementTab] = useState<"github" | "slack" | "jira" | null>(null)

  // Slack feature selection for OAuth
  const [enableSlackSurvey, setEnableSlackSurvey] = useState(true) // Default both enabled
  const [enableSlackSentiment, setEnableSlackSentiment] = useState(true)
  
  // Mapping data state
  const [showMappingDialog, setShowMappingDialog] = useState(false)
  const [selectedMappingPlatform, setSelectedMappingPlatform] = useState<'github' | 'slack' | 'jira' | null>(null)
  
  // MappingDrawer state (reusable component)
  const [mappingDrawerOpen, setMappingDrawerOpen] = useState(false)
  const [mappingDrawerPlatform, setMappingDrawerPlatform] = useState<'github' | 'slack' | 'jira'>('github')
  const [mappingData, setMappingData] = useState<IntegrationMapping[]>([])
  const [mappingStats, setMappingStats] = useState<MappingStatistics | null>(null)
  const [analysisMappingStats, setAnalysisMappingStats] = useState<AnalysisMappingStatistics | null>(null)
  const [currentAnalysisId, setCurrentAnalysisId] = useState<number | null>(null)
  const [loadingMappingData, setLoadingMappingData] = useState(false)
  const [inlineEditingId, setInlineEditingId] = useState<number | string | null>(null)
  const [inlineEditingValue, setInlineEditingValue] = useState('')
  const [savingInlineMapping, setSavingInlineMapping] = useState(false)
  const [validatingGithub, setValidatingGithub] = useState(false)
  const [githubValidation, setGithubValidation] = useState<{valid: boolean, message?: string} | null>(null)

  // Invite modal state
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteRole, setInviteRole] = useState("manager")
  const [isInviting, setIsInviting] = useState(false)

  // Organization members and invitations state
  const [orgMembers, setOrgMembers] = useState([])
  const [pendingInvitations, setPendingInvitations] = useState([])
  const [loadingOrgData, setLoadingOrgData] = useState(false)

  // Sorting state
  const [sortField, setSortField] = useState<'email' | 'status' | 'data' | 'method'>('email')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [showOnlyFailed, setShowOnlyFailed] = useState(false)
  
  // Manual mapping state
  const [showManualMappingDialog, setShowManualMappingDialog] = useState(false)
  const [manualMappings, setManualMappings] = useState<ManualMapping[]>([])
  const [manualMappingStats, setManualMappingStats] = useState<ManualMappingStatistics | null>(null)
  const [selectedManualMappingPlatform, setSelectedManualMappingPlatform] = useState<'github' | 'slack' | 'jira' | null>(null)
  const [loadingManualMappings, setLoadingManualMappings] = useState(false)
  const [newMappingDialogOpen, setNewMappingDialogOpen] = useState(false)

  // Sync confirmation modal state
  const [showSyncConfirmModal, setShowSyncConfirmModal] = useState(false)
  const [syncProgress, setSyncProgress] = useState<{
    stage: string
    details: string
    isLoading: boolean
    results?: {
      created?: number
      updated?: number
      github_matched?: number
      github_total?: number
      slack_synced?: number
      slack_skipped?: number
      jira_matched?: number
    }
  } | null>(null)
  const [editingMapping, setEditingMapping] = useState<ManualMapping | null>(null)
  const [newMappingForm, setNewMappingForm] = useState({
    source_platform: 'rootly' as string,
    source_identifier: '',
    target_platform: 'github' as string,
    target_identifier: ''
  })
  const [githubToken, setGithubToken] = useState('')
  const [slackWebhookUrl, setSlackWebhookUrl] = useState('')
  const [slackBotToken, setSlackBotToken] = useState('')
  const [showGithubInstructions, setShowGithubInstructions] = useState(false)
  const [showSlackInstructions, setShowSlackInstructions] = useState(false)
  const [showGithubToken, setShowGithubToken] = useState(false)
  const [showSlackWebhook, setShowSlackWebhook] = useState(false)
  const [showSlackToken, setShowSlackToken] = useState(false)
  const [isConnectingGithub, setIsConnectingGithub] = useState(false)
  const [isConnectingSlack, setIsConnectingSlack] = useState(false)
  const [isConnectingJira, setIsConnectingJira] = useState(false)
  const [isSyncingJira, setIsSyncingJira] = useState(false)
  const [jiraWorkspaceSelectorOpen, setJiraWorkspaceSelectorOpen] = useState(false)

  // Disconnect confirmation state
  const [githubDisconnectDialogOpen, setGithubDisconnectDialogOpen] = useState(false)
  const [slackDisconnectDialogOpen, setSlackDisconnectDialogOpen] = useState(false)
  const [jiraDisconnectDialogOpen, setJiraDisconnectDialogOpen] = useState(false)
  const [slackSurveyDisconnectDialogOpen, setSlackSurveyDisconnectDialogOpen] = useState(false)
  const [slackSurveyConfirmDisconnectOpen, setSlackSurveyConfirmDisconnectOpen] = useState(false)
  const [isDisconnectingGithub, setIsDisconnectingGithub] = useState(false)
  const [isDisconnectingSlack, setIsDisconnectingSlack] = useState(false)
  const [isDisconnectingJira, setIsDisconnectingJira] = useState(false)
  const [isDisconnectingSlackSurvey, setIsDisconnectingSlackSurvey] = useState(false)
  const [isConnectingSlackOAuth, setIsConnectingSlackOAuth] = useState(false)
  const [slackPermissions, setSlackPermissions] = useState<any>(null)
  const [isLoadingPermissions, setIsLoadingPermissions] = useState(false)

  // Team members state
  const [teamMembers, setTeamMembers] = useState<any[]>([])
  const [loadingTeamMembers, setLoadingTeamMembers] = useState(false)
  const [teamMembersError, setTeamMembersError] = useState<string | null>(null)
  const [syncedUsers, setSyncedUsers] = useState<any[]>([])
  const [loadingSyncedUsers, setLoadingSyncedUsers] = useState(false)
  const [showSyncedUsers, setShowSyncedUsers] = useState(false)
  const [teamMembersDrawerOpen, setTeamMembersDrawerOpen] = useState(false)
  const [refreshingOnCall, setRefreshingOnCall] = useState(false)
  const [oncallCacheInfo, setOncallCacheInfo] = useState<any>(null)

  // Team sync prompt state
  const [showSyncPrompt, setShowSyncPrompt] = useState(false)
  const [syncPromptMessage, setSyncPromptMessage] = useState("Team members affected - Resync recommended")

  // Cache to track which integrations have already been loaded
  const syncedUsersCache = useRef<Map<string, any[]>>(new Map())
  const recipientsCache = useRef<Map<string, Set<number>>>(new Map())
  const permissionsCache = useRef<{data: any, timestamp: number} | null>(null)
  const PERMISSIONS_CACHE_TTL = 5 * 60 * 1000 // 5 minutes

  // GitHub username editing state
  const [editingUserId, setEditingUserId] = useState<number | null>(null)
  const [editingUsername, setEditingUsername] = useState<string>('')
  const [githubOrgMembers, setGithubOrgMembers] = useState<string[]>([])
  const [loadingOrgMembers, setLoadingOrgMembers] = useState(false)
  const [savingUsername, setSavingUsername] = useState(false)

  // Jira mapping state
  const [jiraUsers, setJiraUsers] = useState<Array<{
    account_id: string
    display_name: string
    email: string | null
  }>>([])
  const [loadingJiraUsers, setLoadingJiraUsers] = useState(false)
  const [editingJiraUserId, setEditingJiraUserId] = useState<number | null>(null)
  const [editingJiraAccountId, setEditingJiraAccountId] = useState('')
  const [savingJiraMapping, setSavingJiraMapping] = useState(false)

  // Manual survey delivery modal state
  const [showManualSurveyModal, setShowManualSurveyModal] = useState(false)

  // Survey recipient selection state
  const [selectedRecipients, setSelectedRecipients] = useState<Set<number>>(new Set())
  const [savedRecipients, setSavedRecipients] = useState<Set<number>>(new Set()) // Track what's saved in DB
  const [savingRecipients, setSavingRecipients] = useState(false)

  // Team members drawer pagination
  const [teamMembersPage, setTeamMembersPage] = useState(1)
  const TEAM_MEMBERS_PER_PAGE = 10

  // Check if there are unsaved changes
  const hasUnsavedChanges = () => {
    if (selectedRecipients.size !== savedRecipients.size) return true
    for (const id of Array.from(selectedRecipients)) {
      if (!savedRecipients.has(id)) return true
    }
    return false
  }

  // GitHub org members handlers
  const fetchGitHubOrgMembers = async () => {
    if (!githubIntegration) return

    setLoadingOrgMembers(true)
    try {
      const authToken = localStorage.getItem('auth_token')
      if (!authToken) {
        toast.error('Please log in to load GitHub members')
        return
      }

      const response = await fetch(`${API_BASE}/integrations/github/org-members`, {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      })

      if (response.ok) {
        const data = await response.json()
        setGithubOrgMembers(data.members || [])
      } else {
        const error = await response.json()
        console.error('Failed to load GitHub org members:', error)
      }
    } catch (error) {
      console.error('Error fetching GitHub org members:', error)
    } finally {
      setLoadingOrgMembers(false)
    }
  }

  // Jira users handlers
  const fetchJiraUsers = async () => {
    if (!jiraIntegration) return

    setLoadingJiraUsers(true)
    try {
      const authToken = localStorage.getItem('auth_token')
      if (!authToken) {
        toast.error('Please log in to load Jira users')
        return
      }

      const response = await fetch(`${API_BASE}/integrations/jira/jira-users`, {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      })

      if (response.ok) {
        const data = await response.json()

        // Validate and filter users - ensure all have required fields
        const validUsers = (data.users || []).filter(
          (user: any) => user.account_id && user.display_name
        )

        setJiraUsers(validUsers)
      } else {
        const error = await response.json()
        console.error('Failed to load Jira users:', error)
        toast.error('Failed to load Jira users')
        setJiraUsers([])
      }
    } catch (error) {
      console.error('Error fetching Jira users:', error)
      toast.error('Error fetching Jira users')
      setJiraUsers([])
    } finally {
      setLoadingJiraUsers(false)
    }
  }

  const startEditingJiraMapping = (userId: number, currentAccountId: string | null) => {
    setEditingJiraUserId(userId)
    setEditingJiraAccountId(currentAccountId || '')
  }

  const cancelEditingJiraMapping = () => {
    setEditingJiraUserId(null)
    setEditingJiraAccountId('')
  }

  const saveJiraMapping = async (userId: number) => {
    setSavingJiraMapping(true)
    try {
      const authToken = localStorage.getItem('auth_token')
      if (!authToken) {
        toast.error('Please log in to update Jira mapping')
        return
      }

      const accountIdToSave = editingJiraAccountId === '__clear__' ? '' : editingJiraAccountId

      // Get old account ID before update
      const userBeforeUpdate = syncedUsers.find(u => u.id === userId)
      const oldAccountId = userBeforeUpdate?.jira_account_id
      const oldJiraEmail = userBeforeUpdate?.jira_email

      const jiraUser = jiraUsers.find(u => u.account_id === accountIdToSave)

      const response = await fetch(
        `${API_BASE}/rootly/user-correlation/${userId}/jira-mapping?jira_account_id=${encodeURIComponent(accountIdToSave)}${jiraUser?.email ? `&jira_email=${encodeURIComponent(jiraUser.email)}` : ''}`,
        {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${authToken}`
          }
        }
      )

      if (response.ok) {
        const data = await response.json()

        // Show detailed message with removal info
        if (accountIdToSave === '') {
          toast.success('Jira mapping cleared')
        } else {
          // Use backend message which includes removal info
          const message = data.message || 'Jira mapping updated'
          toast.success(message)
        }

        // Refresh users from backend
        // This ensures all deduplication from backend is reflected in UI
        const selectedOrg = selectedOrganization || integrations.find(i => i.is_default)?.id?.toString()
        if (selectedOrg) {
          syncedUsersCache.current.delete(selectedOrg)
          // Force a full refresh to get the latest state from backend
          await fetchSyncedUsers(false, false, true)
        }
        cancelEditingJiraMapping()
      } else {
        const error = await response.json()
        toast.error(error.detail || 'Failed to update Jira mapping')
      }
    } catch (error) {
      console.error('Error updating Jira mapping:', error)
      toast.error('Failed to update Jira mapping')
    } finally {
      setSavingJiraMapping(false)
    }
  }

  // 🚀 PHASE 3: Wrap with useCallback for stable reference (prevents child re-renders)
  const toggleIntegrationExpanded = useCallback((integrationId: number) => {
    setExpandedIntegrations(prev => {
      const newSet = new Set(prev)
      if (newSet.has(integrationId)) {
        newSet.delete(integrationId)
      } else {
        newSet.add(integrationId)
      }
      return newSet
    })
  }, [])

  const startEditingGitHubUsername = (userId: number, currentUsername: string | null) => {
    setEditingUserId(userId)
    setEditingUsername(currentUsername || '')
  }

  const cancelEditingGitHubUsername = () => {
    setEditingUserId(null)
    setEditingUsername('')
  }

  const saveGitHubUsername = async (userId: number) => {
    setSavingUsername(true)
    try {
      const authToken = localStorage.getItem('auth_token')
      if (!authToken) {
        toast.error('Please log in to update GitHub username')
        return
      }

      // Convert __clear__ sentinel to empty string
      const usernameToSave = editingUsername === '__clear__' ? '' : editingUsername

      // Get old username before update
      const userBeforeUpdate = syncedUsers.find(u => u.id === userId)
      const oldUsername = userBeforeUpdate?.github_username

      const response = await fetch(
        `${API_BASE}/rootly/user-correlation/${userId}/github-username?github_username=${encodeURIComponent(usernameToSave)}`,
        {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${authToken}`
          }
        }
      )

      if (response.ok) {
        const data = await response.json()

        // Show detailed message with removal info
        if (usernameToSave === '') {
          toast.success('GitHub username mapping cleared')
        } else {
          // Use backend message which includes removal info
          const message = data.message || `GitHub username updated to ${usernameToSave}`
          toast.success(message)
        }

        // Clear cache and refresh synced users list from backend
        // This ensures all deduplication from backend is reflected in UI
        const selectedOrg = selectedOrganization || integrations.find(i => i.is_default)?.id?.toString()
        if (selectedOrg) {
          syncedUsersCache.current.delete(selectedOrg)
          // Force a full refresh to get the latest state from backend
          await fetchSyncedUsers(false, false, true)
        }

        cancelEditingGitHubUsername()
      } else {
        const error = await response.json()
        toast.error(error.detail || 'Failed to update GitHub username')
      }
    } catch (error) {
      console.error('Error updating GitHub username:', error)
      toast.error('Failed to update GitHub username')
    } finally {
      setSavingUsername(false)
    }
  }

  // Survey recipient handlers
  const saveSurveyRecipients = async () => {
    if (!selectedOrganization) {
      toast.error('No organization selected')
      return
    }

    setSavingRecipients(true)
    try {
      const authToken = localStorage.getItem('auth_token')
      if (!authToken) {
        toast.error('Please log in to save recipients')
        return
      }

      const recipientIds = Array.from(selectedRecipients)
      const response = await fetch(
        `${API_BASE}/rootly/integrations/${selectedOrganization}/survey-recipients`,
        {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(recipientIds)
        }
      )

      if (response.ok) {
        const data = await response.json()
        // Update savedRecipients to match what was just saved
        setSavedRecipients(new Set(selectedRecipients))
        // Update cache
        recipientsCache.current.set(selectedOrganization, new Set(selectedRecipients))
        toast.success(data.message || 'Survey recipients saved successfully')
      } else {
        const error = await response.json()
        toast.error(error.detail || 'Failed to save recipients')
      }
    } catch (error) {
      console.error('Error saving recipients:', error)
      toast.error('Failed to save recipients')
    } finally {
      setSavingRecipients(false)
    }
  }

  // Discard changes and revert to saved state
  const discardRecipientChanges = () => {
    setSelectedRecipients(new Set(savedRecipients))
    toast.info('Changes discarded')
  }

  // Handle drawer close - reset selections if there are unsaved changes
  const handleDrawerClose = (open: boolean) => {
    if (!open && hasUnsavedChanges()) {
      // Reset to saved state when closing with unsaved changes
      setSelectedRecipients(new Set(savedRecipients))
    }
    setTeamMembersDrawerOpen(open)
  }

  // AI Integration state
  const [llmToken, setLlmToken] = useState('')
  const [llmModel, setLlmModel] = useState('gpt-4o-mini')
  const [llmProvider, setLlmProvider] = useState('openai')
  const [showLlmToken, setShowLlmToken] = useState(false)
  const [isConnectingAI, setIsConnectingAI] = useState(false)
  const [llmConfig, setLlmConfig] = useState<{has_token: boolean, provider?: string, token_suffix?: string} | null>(null)
  const [loadingLlmConfig, setLoadingLlmConfig] = useState(true)
  const [tokenError, setTokenError] = useState<string | null>(null)
  
  // Add integration state
  const [addingPlatform, setAddingPlatform] = useState<"rootly" | "pagerduty" | null>(null)
  const [isShowingToken, setIsShowingToken] = useState(false)
  const [isTestingConnection, setIsTestingConnection] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'success' | 'error' | 'duplicate'>('idle')
  const [previewData, setPreviewData] = useState<PreviewData | null>(null)
  const [duplicateInfo, setDuplicateInfo] = useState<any>(null)
  const [errorDetails, setErrorDetails] = useState<{ user_message: string; user_guidance: string; error_code: string } | null>(null)
  const [isAddingRootly, setIsAddingRootly] = useState(false)
  const [isAddingPagerDuty, setIsAddingPagerDuty] = useState(false)
  const [copied, setCopied] = useState(false)

  // Ref for scrolling to form
  const formSectionRef = useRef<HTMLDivElement>(null)
  
  // Edit/Delete state
  const [editingIntegration, setEditingIntegration] = useState<number | null>(null)
  const [editingName, setEditingName] = useState("")
  const [savingIntegrationId, setSavingIntegrationId] = useState<number | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [integrationToDelete, setIntegrationToDelete] = useState<Integration | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  
  // Instructions state
  const [showRootlyInstructions, setShowRootlyInstructions] = useState(false)
  const [showPagerDutyInstructions, setShowPagerDutyInstructions] = useState(false)
  
  const router = useRouter()
  
  // Backend health monitoring - temporarily disabled
  // const { isHealthy } = useBackendHealth({
  //   showToasts: true,
  //   autoStart: true,
  // })
  
  // Forms
  const rootlyForm = useForm<RootlyFormData>({
    resolver: zodResolver(rootlyFormSchema),
    defaultValues: {
      rootlyToken: "",
      nickname: "",
    },
  })
  
  const pagerdutyForm = useForm<PagerDutyFormData>({
    resolver: zodResolver(pagerdutyFormSchema),
    defaultValues: {
      pagerdutyToken: "",
      nickname: "",
    },
  })

  useEffect(() => {
    // ✨ PHASE 1 OPTIMIZATION: Re-enabled with API endpoint fixes
    loadAllIntegrationsOptimized()

    // 🚨 ROLLBACK: Individual loading functions (fallback disabled)
    // loadRootlyIntegrations()
    // loadPagerDutyIntegrations()
    // loadGitHubIntegration()
    // loadSlackIntegration()
    // loadLlmConfig() // Disabled - AI is always enabled with system token
    
    // Load saved organization preference
    const savedOrg = localStorage.getItem('selected_organization')
    // Accept both numeric IDs and beta string IDs (like "beta-rootly")
    if (savedOrg) {
      setSelectedOrganization(savedOrg)
    }

    // Load user info from localStorage first for immediate display
    const userName = localStorage.getItem('user_name')
    const userEmail = localStorage.getItem('user_email')
    const userAvatar = localStorage.getItem('user_avatar')
    const userRole = localStorage.getItem('user_role')
    const userId = localStorage.getItem('user_id')
    const userOrgId = localStorage.getItem('user_organization_id')

    // Set initial state from localStorage
    if (userName && userEmail) {
      setUserInfo({
        name: userName,
        email: userEmail,
        avatar: userAvatar || undefined,
        role: userRole || 'member',
        id: userId ? parseInt(userId) : undefined,
        organization_id: userOrgId ? parseInt(userOrgId) : undefined
      })
    }

    // Then fetch fresh data in background to update if needed
    const authToken = localStorage.getItem('auth_token')
    if (authToken) {
      const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000'
      fetch(`${API_BASE}/auth/user/me`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache'
        }
      })
      .then(response => {
        if (!response.ok) throw new Error('Failed to fetch')
        return response.json()
      })
      .then(userData => {
        if (userData.name && userData.email) {
          setUserInfo({
            name: userData.name,
            email: userData.email,
            avatar: userData.avatar || undefined,
            role: userData.role || 'member',
            id: userData.id,
            organization_id: userData.organization_id
          })
          // Update localStorage with fresh data
          localStorage.setItem('user_name', userData.name)
          localStorage.setItem('user_email', userData.email)
          localStorage.setItem('user_role', userData.role || 'member')
          if (userData.avatar) localStorage.setItem('user_avatar', userData.avatar)
          if (userData.id) localStorage.setItem('user_id', userData.id.toString())
          if (userData.organization_id) localStorage.setItem('user_organization_id', userData.organization_id.toString())
        }
      })
      .catch(error => {
        // Silently fail - we already loaded from localStorage
      })
    }
    
    // Determine back navigation based on referrer
    const referrer = document.referrer
    if (referrer) {
      const referrerUrl = new URL(referrer)
      const pathname = referrerUrl.pathname
      
      if (pathname.includes('/auth/success')) {
        setBackUrl('/auth/success')
      } else if (pathname.includes('/dashboard')) {
        setBackUrl('/dashboard')
      } else if (pathname === '/') {
        setBackUrl('/')
      } else {
        setBackUrl('/dashboard') // default fallback
      }
    } else {
      // For first-time users or direct access, start without back button
      // Will be updated based on integration status
      setBackUrl('')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Load Slack permissions when integration is available
  useEffect(() => {
    if (slackIntegration && activeEnhancementTab === 'slack') {
      loadSlackPermissions()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slackIntegration, activeEnhancementTab])

  // Load organization data when invite modal opens
  useEffect(() => {
    if (showInviteModal) {
      loadOrganizationData()
    }
  }, [showInviteModal])

  // Fetch GitHub org members when GitHub is connected
  useEffect(() => {
    if (githubIntegration && teamMembersDrawerOpen && showSyncedUsers) {
      fetchGitHubOrgMembers()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [githubIntegration, teamMembersDrawerOpen, showSyncedUsers])

  // Clear drawer data when organization changes to prevent showing stale data
  useEffect(() => {
    if (teamMembersDrawerOpen) {
      // Close drawer when org changes to prevent showing wrong data
      setTeamMembersDrawerOpen(false)
      setSyncedUsers([])
      setShowSyncedUsers(false)
      setSelectedRecipients(new Set())
      setSavedRecipients(new Set())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOrganization])

  // Reset pagination when drawer opens or syncedUsers changes
  useEffect(() => {
    setTeamMembersPage(1)
  }, [teamMembersDrawerOpen, syncedUsers.length])

  // Track previous organization to detect changes (not initial load)
  const prevOrgRef = useRef<string>("")

  // Show sync prompt when organization changes (not on initial load)
  useEffect(() => {
    if (prevOrgRef.current && prevOrgRef.current !== selectedOrganization && selectedOrganization) {
      const orgName = integrations.find(i => i.id.toString() === selectedOrganization)?.name || "organization"
      setSyncPromptMessage(`Switched to ${orgName} - Sync team members to update your roster`)
      setShowSyncPrompt(true)
    }
    prevOrgRef.current = selectedOrganization
  }, [selectedOrganization, integrations])

  // Auto-select first integration if none selected
  useEffect(() => {
    if (!selectedOrganization && integrations.length > 0) {
      const firstIntegration = integrations[0]
      const firstIntegrationId = firstIntegration.id.toString()
      setSelectedOrganization(firstIntegrationId)
      localStorage.setItem('selected_organization', firstIntegrationId)
    }
  }, [integrations, selectedOrganization])

  // Load saved survey recipients when drawer opens (only if no unsaved changes)
  useEffect(() => {
    const loadSavedRecipients = async () => {
      if (!teamMembersDrawerOpen || !selectedOrganization) return

      try {
        const authToken = localStorage.getItem('auth_token')
        if (!authToken) return

        const response = await fetch(
          `${API_BASE}/rootly/integrations/${selectedOrganization}/survey-recipients`,
          {
            headers: { 'Authorization': `Bearer ${authToken}` }
          }
        )

        if (response.ok) {
          const data = await response.json()
          const recipientIds = new Set<number>(data.recipient_ids || [])
          // Update both current and saved state
          setSelectedRecipients(recipientIds)
          setSavedRecipients(recipientIds)
        }
      } catch (error) {
        console.error('Error loading saved recipients:', error)
      }
    }

    loadSavedRecipients()
  }, [teamMembersDrawerOpen, selectedOrganization])

  // Fetch Jira users when drawer opens
  useEffect(() => {
    if (jiraIntegration && teamMembersDrawerOpen && showSyncedUsers) {
      fetchJiraUsers()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jiraIntegration, teamMembersDrawerOpen, showSyncedUsers])

  // Handle Slack/Jira OAuth success redirect
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search)
    const slackConnected = urlParams.get('slack_connected')
    const workspace = urlParams.get('workspace')
    const status = urlParams.get('status')
    const jiraConnected = urlParams.get('jira_connected')
    const jiraError = urlParams.get('jira_error')
    // Check auth token after OAuth redirect
    const authToken = localStorage.getItem('auth_token')

    // Debug: Log all URL parameters (persist across redirects)
    const debugInfo = {
      fullUrl: window.location.href,
      search: window.location.search,
      slackConnected,
      workspace,
      status,
      hasAuthToken: !!authToken,
      allParams: Object.fromEntries(urlParams.entries()),
      timestamp: new Date().toISOString()
    }

    // Store in sessionStorage for persistence
    sessionStorage.setItem('slack_oauth_debug', JSON.stringify(debugInfo))

    // Add global debug function for manual checking
    ;(window as any).getSlackOAuthDebug = () => {
      const stored = sessionStorage.getItem('slack_oauth_debug')
      if (stored) {
        const parsed = JSON.parse(stored)
        return parsed
      }
      return null
    }

    // Check if we're returning from OAuth and set loading state
    const isReturningFromOAuth = localStorage.getItem('slack_oauth_in_progress')
    if (isReturningFromOAuth) {
      setIsConnectingSlackOAuth(true)

      // If we have the OAuth in progress flag but no success params yet,
      // it means the redirect is still happening or failed silently
      if (slackConnected !== 'true' && slackConnected !== 'false') {
        // Keep showing loading for a bit, then timeout
        setTimeout(() => {
          const stillInProgress = localStorage.getItem('slack_oauth_in_progress')
          if (stillInProgress && !window.location.search.includes('slack_connected')) {
            localStorage.removeItem('slack_oauth_in_progress')
            setIsConnectingSlackOAuth(false)
            toast.warning('OAuth redirect timed out', {
              description: 'Please try connecting again.',
            })
          }
        }, 10000) // 10 second timeout
      }
    }

    if (slackConnected === 'true' && workspace) {
      // Show loading toast immediately
      const loadingToastId = toast.loading('Verifying Slack connection...', {
        description: 'Please wait while we confirm your workspace connection.',
      })

      // Clean up URL parameters
      const newUrl = window.location.pathname
      window.history.replaceState({}, '', newUrl)

      // Poll for connection status with retries
      let retries = 0
      const maxRetries = 15
      const pollInterval = 500

      const checkConnection = async () => {
        try {
          retries++

          // Check if Slack is now connected
          const authToken = localStorage.getItem('auth_token')
          if (!authToken) return

          const response = await fetch(`${API_BASE}/integrations/slack/status`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
          })

          if (response.ok) {
            const data = await response.json()
            if (data.connected) {
              // Update Slack integration state directly without reloading other cards
              setSlackIntegration(data.integration)
              // Update cache
              localStorage.setItem('slack_integration', JSON.stringify(data))
              localStorage.setItem('all_integrations_timestamp', Date.now().toString())

              // Clear OAuth loading state
              localStorage.removeItem('slack_oauth_in_progress')
              setIsConnectingSlackOAuth(false)

              toast.dismiss(loadingToastId)
              if (status === 'pending_user_association') {
                toast.success(`🎉 Slack app installed successfully!`, {
                  description: `Connected to "${decodeURIComponent(workspace)}" workspace. The /burnout-survey command is now available.`,
                  duration: 6000,
                })
              } else {
                toast.success(`🎉 Slack integration connected!`, {
                  description: `Successfully connected to "${decodeURIComponent(workspace)}" workspace.`,
                  duration: 5000,
                })
              }
              return
            }
          }

          // Not connected yet, retry if we haven't exceeded max retries
          if (retries < maxRetries) {
            setTimeout(checkConnection, pollInterval)
          } else {
            // Max retries reached, show warning
            localStorage.removeItem('slack_oauth_in_progress')
            setIsConnectingSlackOAuth(false)
            toast.dismiss(loadingToastId)
            toast.warning('Connection verification timed out', {
              description: 'Your Slack workspace was added, but verification took longer than expected. Try refreshing the page.',
              duration: 8000,
            })
          }
        } catch (error) {
          if (retries < maxRetries) {
            setTimeout(checkConnection, pollInterval)
          } else {
            localStorage.removeItem('slack_oauth_in_progress')
            setIsConnectingSlackOAuth(false)
            toast.dismiss(loadingToastId)
            toast.error('Failed to verify connection', {
              description: 'Please refresh the page to check your Slack connection status.',
            })
          }
        }
      }

      // Start checking immediately
      checkConnection()
    } else if (slackConnected === 'false') {
      // Clear OAuth loading state
      localStorage.removeItem('slack_oauth_in_progress')
      setIsConnectingSlackOAuth(false)

      // Show error toast
      const errorParam = urlParams.get('error')
      const errorMessage = errorParam ? decodeURIComponent(errorParam) : 'Unknown error occurred'

      toast.error('Failed to connect Slack', {
        description: errorMessage,
        duration: 8000,
      })

      // Clean up URL parameters
      const newUrl = window.location.pathname
      window.history.replaceState({}, '', newUrl)
    }


    // Handle Jira OAuth success
    if (jiraConnected === '1' || jiraConnected === 'true') {
      // Show loading toast
      const loadingToastId = toast.loading('Verifying Jira connection...', {
        description: 'Please wait while we confirm your Jira integration.',
      })

      // Clean up URL parameters
      const newUrl = window.location.pathname
      window.history.replaceState({}, '', newUrl)

      // Poll for connection status with retries
      let retries = 0
      const maxRetries = 15
      const pollInterval = 500

      const checkJiraConnection = async () => {
        try {
          retries++

          // Check if Jira is now connected
          const authToken = localStorage.getItem('auth_token')
          if (!authToken) return

          const response = await fetch(`${API_BASE}/integrations/jira/status`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
          })

          if (response.ok) {
            const data = await response.json()
            if (data.connected) {
              // Update Jira integration state
              setJiraIntegration(data.integration)
              // Update cache
              localStorage.setItem('jira_integration', JSON.stringify(data))
              localStorage.setItem('all_integrations_timestamp', Date.now().toString())

              toast.dismiss(loadingToastId)

              // Show success message
              toast.success(`🎉 Jira integration connected!`, {
                description: `Successfully connected to ${data.integration.jira_site_url || 'your Jira workspace'}.`,
                duration: 5000,
              })
              return
            }
          }

          // Not connected yet, retry if we haven't exceeded max retries
          if (retries < maxRetries) {
            setTimeout(checkJiraConnection, pollInterval)
          } else {
            // Max retries reached, show warning
            toast.dismiss(loadingToastId)
            toast.warning('Connection verification timed out', {
              description: 'Your Jira integration was added, but verification took longer than expected. Try refreshing the page.',
              duration: 8000,
            })
          }
        } catch (error) {
          if (retries < maxRetries) {
            setTimeout(checkJiraConnection, pollInterval)
          } else {
            toast.dismiss(loadingToastId)
            toast.error('Failed to verify connection', {
              description: 'Please refresh the page to check your Jira connection status.',
            })
          }
        }
      }

      // Start checking immediately
      checkJiraConnection()
    } else if (jiraError) {
      // Show error toast
      const errorMessage = decodeURIComponent(jiraError)

      toast.error('Failed to connect Jira', {
        description: errorMessage,
        duration: 8000,
      })

      // Clean up URL parameters
      const newUrl = window.location.pathname
      window.history.replaceState({}, '', newUrl)
    }
  }, [])

  // Load each provider independently for better UX
  const loadRootlyIntegrations = async (forceRefresh = false) => {
    return IntegrationHandlers.loadRootlyIntegrations(forceRefresh, setIntegrations, setLoadingRootly)
  }

  const loadPagerDutyIntegrations = async (forceRefresh = false) => {
    return IntegrationHandlers.loadPagerDutyIntegrations(forceRefresh, setIntegrations, setLoadingPagerDuty)
  }

  const loadGitHubIntegration = async (forceRefresh = false) => {
    return GithubHandlers.loadGitHubIntegration(forceRefresh, setGithubIntegration, setLoadingGitHub)
  }

  const loadSlackIntegration = async (forceRefresh = false) => {
    return SlackHandlers.loadSlackIntegration(forceRefresh, setSlackIntegration, setLoadingSlack)
  }

  const loadJiraIntegration = async (forceRefresh = false) => {
    return JiraHandlers.loadJiraIntegration(forceRefresh, setJiraIntegration, setLoadingJira)
  }

  // ✨ PHASE 1 OPTIMIZATION: Instant cache loading with background refresh
  const [refreshingInBackground, setRefreshingInBackground] = useState(false)
  const isLoadingRef = useRef(false)
  
  // Synchronous cache reading for instant display
  const loadFromCacheSync = () => {
    try {
      const cachedIntegrations = localStorage.getItem('all_integrations')
      const cachedGithub = localStorage.getItem('github_integration')
      const cachedSlack = localStorage.getItem('slack_integration')
      const cachedJira = localStorage.getItem('jira_integration')

      
      if (cachedIntegrations) {
        const parsedIntegrations = JSON.parse(cachedIntegrations)
        setIntegrations(parsedIntegrations)
      }
      
      if (cachedGithub) {
        const githubData = JSON.parse(cachedGithub)
        setGithubIntegration(githubData.connected ? githubData.integration : null)
      }
      
      if (cachedSlack) {
        const slackData = JSON.parse(cachedSlack)
        setSlackIntegration(slackData.integration)
      }

      if (cachedJira) {
        const jiraData = JSON.parse(cachedJira)
        setJiraIntegration(jiraData.connected ? jiraData.integration : null)
      }
      const hasAllCache = !!(cachedIntegrations && cachedGithub && cachedSlack && cachedJira)
      return hasAllCache
    } catch (error) {
      return false
    }
  }
  
  // Background refresh function (non-blocking) - does NOT affect loading states
  const refreshInBackground = async () => {
    setRefreshingInBackground(true)
    try {
      await loadAllIntegrationsAPIBackground()
    } catch (error) {
      // Silently fail for background refreshes - don't spam console
      // User still has cached data, so this is non-critical
      if (process.env.NODE_ENV === 'development') {
        console.warn('Background refresh failed (non-critical):', error)
      }
    } finally {
      setRefreshingInBackground(false)
    }
  }

  // Invite function
  const handleInvite = async () => {
    return OrganizationHandlers.handleInvite(
      inviteEmail,
      inviteRole,
      setIsInviting,
      setInviteEmail,
      setInviteRole,
      setShowInviteModal,
      loadOrganizationData
    )
  }

  // Handle role change for organization members
  const handleRoleChange = async (userId: number, newRole: string) => {
    return OrganizationHandlers.handleRoleChange(userId, newRole, loadOrganizationData)
  }

  // Load organization members and pending invitations
  const loadOrganizationData = async () => {
    return OrganizationHandlers.loadOrganizationData(
      setLoadingOrgData,
      setOrgMembers,
      setPendingInvitations
    )
  }

  // 🚀 PHASE 3: Refresh permissions for a specific integration (wrapped with useCallback)
  const refreshIntegrationPermissions = useCallback(async (integrationId: number) => {
    setRefreshingPermissions(integrationId)
    try {
      const authToken = localStorage.getItem('auth_token')
      if (!authToken) return

      const response = await fetch(`${API_BASE}/rootly/integrations/${integrationId}/refresh-permissions`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${authToken}` }
      })

      if (response.ok) {
        const data = await response.json()
        // Update the integration in the list with new permissions
        setIntegrations(prev => prev.map(int =>
          int.id === integrationId
            ? { ...int, permissions: data.permissions }
            : int
        ))
      }
    } catch (error) {
      // Silently handle permission refresh errors
    } finally {
      setRefreshingPermissions(null)
    }
  }, [])

  // Background API loading - does NOT change loading states (for silent refresh)
  const loadAllIntegrationsAPIBackground = async () => {
    try {
      const authToken = localStorage.getItem('auth_token')
      if (!authToken) {
        return
      }

      // 🚀 PHASE 2: Backend now caches permissions for 24 hours
      const [rootlyResponse, pagerdutyResponse, githubResponse, slackResponse, jiraResponse] = await Promise.all([
        fetch(`${API_BASE}/rootly/integrations`, {
          headers: { 'Authorization': `Bearer ${authToken}` }
        }),
        fetch(`${API_BASE}/pagerduty/integrations`, {
          headers: { 'Authorization': `Bearer ${authToken}` }
        }),
        fetch(`${API_BASE}/integrations/github/status`, {
          headers: { 'Authorization': `Bearer ${authToken}` }
        }),
        fetch(`${API_BASE}/integrations/slack/status`, {
          headers: { 'Authorization': `Bearer ${authToken}` }
        }),
        fetch(`${API_BASE}/integrations/jira/status`, {
          headers: { 'Authorization': `Bearer ${authToken}` }
        })
      ])

      const [rootlyData, pagerdutyData, githubData, slackData, jiraData] = await Promise.all([
        rootlyResponse.ok ? rootlyResponse.json() : { integrations: [] },
        pagerdutyResponse.ok ? pagerdutyResponse.json() : { integrations: [] },
        githubResponse.ok ? githubResponse.json() : { connected: false, integration: null },
        slackResponse.ok ? slackResponse.json() : { integration: null },
        jiraResponse.ok ? jiraResponse.json() : { connected: false, integration: null }
      ])

      // Update state silently
      const rootlyIntegrations = (rootlyData.integrations || []).map((i: any) => ({ ...i, platform: 'rootly' }))
      const pagerdutyIntegrations = (pagerdutyData.integrations || []).map((i: any) => ({ ...i, platform: 'pagerduty' }))
      const allIntegrations = [...rootlyIntegrations, ...pagerdutyIntegrations]

      // Only skip update if requests failed - otherwise update even if empty (which is valid)
      if (!rootlyResponse.ok && !pagerdutyResponse.ok) {
        // Both requests failed, keep existing data
      } else {
        setIntegrations(allIntegrations)
        setGithubIntegration(githubData.connected ? githubData.integration : null)
        setSlackIntegration(slackData.integration)
        setJiraIntegration(jiraData.connected ? jiraData.integration : null)

        // Update cache with fresh data
        localStorage.setItem('all_integrations', JSON.stringify(allIntegrations))
        localStorage.setItem('all_integrations_timestamp', Date.now().toString())
        localStorage.setItem('github_integration', JSON.stringify(githubData))
        localStorage.setItem('slack_integration', JSON.stringify(slackData))
        localStorage.setItem('jira_integration', JSON.stringify(jiraData))

      }

    } catch (error) {
      // Silently fail - already caught in refreshInBackground
      // Only log if unexpected error type
      if (!(error instanceof TypeError && error.message.includes('fetch'))) {
        console.error('Background refresh error:', error)
      }
    }
  }
  
  // Check if cache is stale (older than 5 minutes)
  const isCacheStale = Utils.isCacheStale
  
  // New optimized loading function with instant cache + background refresh
  const loadAllIntegrationsOptimized = async (forceRefresh = false) => {
    
    try {
      // Step 1: Always show cached data instantly (0ms)
      const hasCachedData = loadFromCacheSync()
      
      // Step 2: If we have cached data and it's not forced refresh, show it immediately
      if (hasCachedData && !forceRefresh) {
        setLoadingRootly(false) // Hide skeleton immediately
        setLoadingPagerDuty(false)
        setLoadingGitHub(false)
        setLoadingSlack(false)
        setLoadingJira(false)

        // Step 3: Check if cache is stale and refresh in background if needed
        const cacheIsStale = isCacheStale()
        if (cacheIsStale) {
          // Non-blocking background refresh
          setTimeout(() => refreshInBackground(), 100)
        } else {
        }
        return
      }
      
      // Step 4: If no cache or forced refresh, fall back to normal loading
      await loadAllIntegrationsAPI()
    } catch (error) {
      // Fallback: set loading states to false to prevent infinite loading
      setLoadingRootly(false)
      setLoadingPagerDuty(false)
      setLoadingGitHub(false)
      setLoadingSlack(false)
      setLoadingJira(false)

    }
  }
  
  // 🚀 PHASE 1 OPTIMIZATION: Progressive section loading
  // Each integration section loads and renders independently as data arrives
  const loadAllIntegrationsAPI = async () => {
    // Prevent concurrent calls using a ref (not state, since state starts as true)
    if (isLoadingRef.current) {
      return
    }

    isLoadingRef.current = true

    // Set individual loading states to true
    setLoadingRootly(true)
    setLoadingPagerDuty(true)
    setLoadingGitHub(true)
    setLoadingSlack(true)
    setLoadingJira(true)

    try {
      const authToken = localStorage.getItem('auth_token')
      if (!authToken) {
        isLoadingRef.current = false
        router.push('/auth/success')
        return
      }

      // Add 15 second timeout to prevent hanging (increased for parallel permission checks)
      const fetchWithTimeout = (url: string, options: any, timeout = 15000) => {
        return Promise.race([
          fetch(url, options),
          new Promise<Response>((_, reject) =>
            setTimeout(() => reject(new Error('Request timeout')), timeout)
          )
        ])
      }

      // 🚀 OPTIMIZATION: Start all requests in parallel but process them as they complete
      // 🚀 PHASE 2: Backend caches permissions for 24 hours for fast responses
      const rootlyPromise = fetchWithTimeout(`${API_BASE}/rootly/integrations`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      }).catch((error) => {
        console.error('Rootly API request failed:', error.message)
        return { ok: false, error: error.message }
      })

      const pagerdutyPromise = fetchWithTimeout(`${API_BASE}/pagerduty/integrations`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      }).catch((error) => {
        console.error('PagerDuty API request failed:', error.message)
        return { ok: false, error: error.message }
      })

      const githubPromise = fetchWithTimeout(`${API_BASE}/integrations/github/status`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      }).catch(() => {
        return { ok: false }
      })

      const slackPromise = fetchWithTimeout(`${API_BASE}/integrations/slack/status`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      }).catch(() => {
        return { ok: false }
      })

      const jiraPromise = fetchWithTimeout(`${API_BASE}/integrations/jira/status`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      }).catch(() => {
        return { ok: false }
      })

      // 🚀 PROGRESSIVE LOADING: Process each response as it arrives (non-blocking)
      // Process Rootly data as soon as it's available
      rootlyPromise.then(async (rootlyResponse) => {
        try {
          const rootlyData = (rootlyResponse as any).ok && (rootlyResponse as Response).json
            ? await (rootlyResponse as Response).json()
            : { integrations: [] }
          const rootlyIntegrations = (rootlyData.integrations || []).map((i: Integration) => ({ ...i, platform: 'rootly' }))

          // Update Rootly integrations immediately (merge with existing PagerDuty data if available)
          setIntegrations(prev => {
            const pagerdutyOnly = prev.filter(i => i.platform === 'pagerduty')
            const merged = [...rootlyIntegrations, ...pagerdutyOnly]

            // Update cache
            localStorage.setItem('all_integrations', JSON.stringify(merged))
            localStorage.setItem('all_integrations_timestamp', Date.now().toString())

            return merged
          })
        } catch (error) {
          console.error('Error processing Rootly data:', error)
        } finally {
          setLoadingRootly(false)
        }
      })

      // Process PagerDuty data as soon as it's available
      pagerdutyPromise.then(async (pagerdutyResponse) => {
        try {
          const pagerdutyData = (pagerdutyResponse as any).ok && (pagerdutyResponse as Response).json
            ? await (pagerdutyResponse as Response).json()
            : { integrations: [] }
          const pagerdutyIntegrations = (pagerdutyData.integrations || []).map((i: Integration) => ({ ...i, platform: 'pagerduty' }))

          // Update PagerDuty integrations immediately (merge with existing Rootly data if available)
          setIntegrations(prev => {
            const rootlyOnly = prev.filter(i => i.platform === 'rootly')
            const merged = [...rootlyOnly, ...pagerdutyIntegrations]

            // Update cache
            localStorage.setItem('all_integrations', JSON.stringify(merged))
            localStorage.setItem('all_integrations_timestamp', Date.now().toString())

            return merged
          })
        } catch (error) {
          console.error('Error processing PagerDuty data:', error)
        } finally {
          setLoadingPagerDuty(false)
        }
      })

      // Process GitHub data as soon as it's available
      githubPromise.then(async (githubResponse) => {
        try {
          const githubData = (githubResponse as any).ok && (githubResponse as Response).json
            ? await (githubResponse as Response).json()
            : { connected: false, integration: null }

          setGithubIntegration(githubData.connected ? githubData.integration : null)
          localStorage.setItem('github_integration', JSON.stringify(githubData))
        } catch (error) {
          console.error('Error processing GitHub data:', error)
        } finally {
          setLoadingGitHub(false)
        }
      })

      // Process Slack data as soon as it's available
      slackPromise.then(async (slackResponse) => {
        try {
          const slackData = (slackResponse as any).ok && (slackResponse as Response).json
            ? await (slackResponse as Response).json()
            : { integration: null }

          setSlackIntegration(slackData.integration)
          localStorage.setItem('slack_integration', JSON.stringify(slackData))
        } catch (error) {
          console.error('Error processing Slack data:', error)
        } finally {
          setLoadingSlack(false)
        }
      })

      // Process Jira data as soon as it's available
      jiraPromise.then(async (jiraResponse) => {
        try {
          const jiraData = (jiraResponse as any).ok && (jiraResponse as Response).json
            ? await (jiraResponse as Response).json()
            : { connected: false, integration: null }

          setJiraIntegration(jiraData.connected ? jiraData.integration : null)
          localStorage.setItem('jira_integration', JSON.stringify(jiraData))
        } catch (error) {
          console.error('Error processing Jira data:', error)
        } finally {
          setLoadingJira(false)
        }
      })

      // Wait for all promises to complete (for back URL logic)
      const [rootlyResponse, pagerdutyResponse] = await Promise.all([rootlyPromise, pagerdutyPromise])

      // Update back URL based on integration status (only needs Rootly/PagerDuty)
      if (backUrl === '') {
        const rootlyData = (rootlyResponse as any).ok && (rootlyResponse as Response).json
          ? await (rootlyResponse as Response).json()
          : { integrations: [] }
        const pagerdutyData = (pagerdutyResponse as any).ok && (pagerdutyResponse as Response).json
          ? await (pagerdutyResponse as Response).json()
          : { integrations: [] }
        const totalIntegrations = (rootlyData.integrations?.length || 0) + (pagerdutyData.integrations?.length || 0)

        if (totalIntegrations > 0) {
          setBackUrl('/dashboard')
        }
      }
    } catch (error) {
      toast.error("Failed to load integrations. Please try refreshing the page.")
      // Ensure loading states are cleared even on error
      setLoadingRootly(false)
      setLoadingPagerDuty(false)
      setLoadingGitHub(false)
      setLoadingSlack(false)
      setLoadingJira(false)
    } finally {
      isLoadingRef.current = false
    }
  }

  const loadLlmConfig = async () => {
    return AIHandlers.loadLlmConfig(
      setLoadingLlmConfig,
      setLlmConfig,
      setLlmProvider,
      setLlmModel
    )
  }

  const handleConnectAI = async () => {
    return AIHandlers.handleConnectAI(
      llmToken,
      llmProvider,
      llmModel,
      setIsConnectingAI,
      setTokenError,
      setLlmConfig,
      setLlmToken
    )
  }

  const handleDisconnectAI = async () => {
    return AIHandlers.handleDisconnectAI(setLlmConfig)
  }

  const testConnection = async (platform: "rootly" | "pagerduty", token: string) => {
    return IntegrationHandlers.testConnection(
      platform,
      token,
      setIsTestingConnection,
      setConnectionStatus,
      setPreviewData,
      setDuplicateInfo,
      setErrorDetails
    )
  }

  const addIntegration = async (platform: "rootly" | "pagerduty") => {
    const form = platform === 'rootly' ? rootlyForm : pagerdutyForm
    return IntegrationHandlers.addIntegration(
      platform,
      previewData,
      form,
      integrations,
      setIsAddingRootly,
      setIsAddingPagerDuty,
      setConnectionStatus,
      setPreviewData,
      setAddingPlatform,
      setReloadingIntegrations,
      loadRootlyIntegrations,
      loadPagerDutyIntegrations
    )
  }

  const deleteIntegration = async () => {
    if (!integrationToDelete) return
    return IntegrationHandlers.deleteIntegration(
      integrationToDelete,
      integrations,
      setIsDeleting,
      setIntegrations,
      setDeleteDialogOpen,
      setIntegrationToDelete,
      syncedUsersCache.current,
      recipientsCache.current
    )
  }

  // 🚀 PHASE 3: Wrap with useCallback for stable reference
  const updateIntegrationName = useCallback(async (integration: Integration, newName: string) => {
    return IntegrationHandlers.updateIntegrationName(
      integration,
      newName,
      setSavingIntegrationId,
      setIntegrations,
      setEditingIntegration
    )
  }, [])

  // 🚀 PHASE 3: Stable handlers for integration card actions
  const handleEditIntegration = useCallback((id: number, name: string) => {
    setEditingIntegration(id)
    setEditingName(name)
  }, [])

  const handleCancelEdit = useCallback(() => {
    setEditingIntegration(null)
  }, [])

  const handleDeleteIntegration = useCallback((integration: Integration) => {
    setIntegrationToDelete(integration)
    setDeleteDialogOpen(true)
  }, [])


  const copyToClipboard = async (text: string) => {
    return Utils.copyToClipboard(text, setCopied)
  }

  // GitHub integration handlers
  const handleGitHubConnect = async (token: string) => {
    await GithubHandlers.handleGitHubConnect(
      token,
      setIsConnectingGithub,
      setGithubToken,
      setActiveEnhancementTab,
      loadGitHubIntegration
    )
    // Show sync prompt after successful connection
    setSyncPromptMessage("GitHub connected! Sync team members to enable accurate burnout analysis")
    setShowSyncPrompt(true)
  }

  const handleGitHubDisconnect = async () => {
    return GithubHandlers.handleGitHubDisconnect(
      setIsDisconnectingGithub,
      setGithubDisconnectDialogOpen,
      loadGitHubIntegration
    )
  }

  const handleGitHubTest = async () => {
    return GithubHandlers.handleGitHubTest()
  }

  // Slack integration handlers
  const handleSlackConnect = async (webhookUrl: string, botToken: string) => {
    await SlackHandlers.handleSlackConnect(
      webhookUrl,
      botToken,
      setIsConnectingSlack,
      setSlackWebhookUrl,
      setSlackBotToken,
      setActiveEnhancementTab,
      loadSlackIntegration
    )
    // Show sync prompt after successful connection
    setSyncPromptMessage("Slack connected! Sync team members to link Slack users with your team")
    setShowSyncPrompt(true)
  }

  const handleSlackDisconnect = async () => {
    return SlackHandlers.handleSlackDisconnect(
      setIsDisconnectingSlack,
      setSlackDisconnectDialogOpen,
      loadSlackIntegration
    )
  }

  const handleSlackTest = async () => {
    return SlackHandlers.handleSlackTest(setSlackPermissions, setSlackIntegration)
  }

  const loadSlackPermissions = async (forceRefresh: boolean = false) => {
    // Check cache first (5 minute TTL)
    if (!forceRefresh && permissionsCache.current) {
      const age = Date.now() - permissionsCache.current.timestamp
      if (age < PERMISSIONS_CACHE_TTL) {
        setSlackPermissions(permissionsCache.current.data)
        return
      }
    }

    // Fetch fresh permissions
    await SlackHandlers.loadSlackPermissions(slackIntegration, setIsLoadingPermissions, (permissions) => {
      setSlackPermissions(permissions)
      // Update cache
      permissionsCache.current = {
        data: permissions,
        timestamp: Date.now()
      }
    })
  }


  // Jira integration handlers
  const handleJiraConnect = async () => {
    await JiraHandlers.handleJiraConnect(
      setIsConnectingJira,
      setActiveEnhancementTab,
      loadJiraIntegration
    )
    // Show sync prompt after successful connection
    setSyncPromptMessage("Jira connected! Sync team members to track workload and incidents")
    setShowSyncPrompt(true)
  }

  const handleJiraDisconnect = async () => {
    return JiraHandlers.handleJiraDisconnect(
      setIsDisconnectingJira,
      setJiraIntegration,
      setActiveEnhancementTab
    )
  }

  const handleJiraTest = async () => {
    return JiraHandlers.handleJiraTest(toast)
  }

  const handleJiraSyncMembers = async () => {
    return JiraHandlers.syncJiraUsers(
      setIsSyncingJira,
      undefined, // No progress callback needed
      () => fetchSyncedUsers(false, false, true) // Refresh synced users after sync
    )
  }

  // Mapping data handlers
  // Function to open the reusable MappingDrawer
  const openMappingDrawer = (platform: 'github' | 'slack' | 'jira') => {
    return Utils.openMappingDrawer(platform, setMappingDrawerPlatform, setMappingDrawerOpen)
  }

  const loadMappingData = async (platform: 'github' | 'slack' | 'jira') => {
    return MappingHandlers.loadMappingData(
      platform,
      showMappingDialog,
      setLoadingMappingData,
      setSelectedMappingPlatform,
      setMappingData,
      setMappingStats,
      setAnalysisMappingStats,
      setCurrentAnalysisId,
      setShowMappingDialog
    )
  }

  // Fetch team members from selected organization
  const fetchTeamMembers = async (suppressToast?: boolean) => {
    return TeamHandlers.fetchTeamMembers(
      selectedOrganization,
      setLoadingTeamMembers,
      setTeamMembersError,
      setTeamMembers,
      setTeamMembersDrawerOpen,
      suppressToast
    )
  }

  // Sync users to UserCorrelation table
  const syncUsersToCorrelation = async (suppressToast?: boolean) => {
    // Clear cache for this integration before syncing
    if (selectedOrganization) {
      syncedUsersCache.current.delete(selectedOrganization)
    }

    return TeamHandlers.syncUsersToCorrelation(
      selectedOrganization,
      setLoadingTeamMembers,
      setTeamMembersError,
      () => fetchTeamMembers(suppressToast),
      () => fetchSyncedUsers(true, true, true), // Force refresh after sync
      undefined,
      suppressToast
    )
  }

  // Perform full team sync with progress tracking
  const performTeamSync = async () => {
    try {
      setSyncProgress({ stage: 'Starting sync...', details: 'Preparing to sync users', isLoading: true })
      await new Promise(resolve => setTimeout(resolve, 300))

      setSyncProgress({ stage: 'Fetching users...', details: 'Retrieving users from API with IR role filtering', isLoading: true })
      const syncResults = await TeamHandlers.syncUsersToCorrelation(
        selectedOrganization,
        setLoadingTeamMembers,
        setTeamMembersError,
        fetchTeamMembers,
        () => fetchSyncedUsers(false, false, true),
        (message: string) => {
          setSyncProgress({ stage: 'Syncing users...', details: message, isLoading: true })
        },
        true // suppressToast
      )

      let slackResults
      if (slackIntegration?.workspace_id) {
        setSyncProgress({ stage: 'Syncing Slack...', details: 'Matching Slack user IDs', isLoading: true })
        slackResults = await TeamHandlers.syncSlackUserIds(setLoadingTeamMembers, fetchSyncedUsers, true)
      }

      setSyncProgress({
        stage: 'Sync Complete!',
        details: 'Your team members have been successfully synced',
        isLoading: false,
        results: {
          created: syncResults.created,
          updated: syncResults.updated,
          github_matched: syncResults.github_matched,
          jira_matched: syncResults.jira_matched,
          slack_synced: slackResults?.updated,
          slack_skipped: slackResults?.skipped,
        }
      })
    } catch (error) {
      setSyncProgress({ stage: 'Error', details: 'Failed to sync. Please try again.', isLoading: false })
      setTimeout(() => {
        setShowSyncConfirmModal(false)
        setSyncProgress(null)
      }, 2000)
    }
  }

  // Handle sync prompt actions
  const handleSyncPromptAction = async () => {
    // Close the prompt
    setShowSyncPrompt(false)
    // Open team members drawer
    await fetchSyncedUsers(false, false)
    setTeamMembersDrawerOpen(true)
    // Open the sync modal to show progress
    setShowSyncConfirmModal(true)
    // Automatically start the sync
    await performTeamSync()
  }

  const handleDismissSyncPrompt = () => {
    setShowSyncPrompt(false)
  }

  // Sync Slack user IDs to UserCorrelation records
  const syncSlackUserIds = async (suppressToast?: boolean) => {
    return TeamHandlers.syncSlackUserIds(setLoadingTeamMembers, fetchSyncedUsers, suppressToast)
  }

  // Fetch synced users from database
  const fetchSyncedUsers = async (showToast = true, autoSync = true, forceRefresh = false) => {
    return TeamHandlers.fetchSyncedUsers(
      selectedOrganization,
      setLoadingSyncedUsers,
      setSyncedUsers,
      setShowSyncedUsers,
      setTeamMembersDrawerOpen,
      syncUsersToCorrelation,
      showToast,
      autoSync,
      setSelectedRecipients,
      setSavedRecipients,
      syncedUsersCache.current,
      forceRefresh,
      recipientsCache.current
    )
  }

  // Refresh on-call status
  const refreshOnCallStatus = async () => {
    if (!selectedOrganization) {
      toast.error('Please select an organization first')
      return
    }

    setRefreshingOnCall(true)
    try {
      const authToken = localStorage.getItem('auth_token')
      const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

      const response = await fetch(`${apiBase}/rootly/integrations/${selectedOrganization}/refresh-oncall`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      })

      if (response.ok) {
        toast.success('On-call status refreshed')
        // Reload synced users with fresh on-call data
        await fetchSyncedUsers(false, false, true)
      } else {
        toast.error('Failed to refresh on-call status')
      }
    } catch (error) {
      console.error('Error refreshing on-call status:', error)
      toast.error('Failed to refresh on-call status')
    } finally {
      setRefreshingOnCall(false)
    }
  }

  // Inline mapping edit handlers
  const startInlineEdit = (mappingId: number | string, currentValue: string = '') => {
    // Don't allow editing of manual mappings inline since they already exist
    if (typeof mappingId === 'string' && mappingId.startsWith('manual_')) {
      toast.error('Manual mappings cannot be edited. They are already mapped.')
      return
    }
    setInlineEditingId(mappingId)
    setInlineEditingValue(currentValue)
    setGithubValidation(null)
  }
  
  // Validate GitHub username
  const validateGithubUsername = async (username: string) => {
    return MappingHandlers.validateGithubUsername(
      username,
      setValidatingGithub,
      setGithubValidation
    )
  }
  
  // Sorting function
  const handleSort = (field: 'email' | 'status' | 'data' | 'method') => {
    return Utils.handleSort(field, sortField, sortDirection, setSortField, setSortDirection)
  }

  // Filter and sort mappings
  const filteredMappings = Utils.filterMappings(mappingData, showOnlyFailed)
  const sortedMappings = Utils.sortMappings(filteredMappings, sortField, sortDirection)

  const cancelInlineEdit = () => {
    setInlineEditingId(null)
    setInlineEditingValue('')
    setGithubValidation(null)
  }

  const startEditExisting = (mappingId: number | string, currentValue: string) => {
    setInlineEditingId(mappingId)
    setInlineEditingValue(currentValue)
    setGithubValidation(null)
  }

  const saveEditedMapping = async (mappingId: number | string, email: string) => {
    return MappingHandlers.saveEditedMapping(
      mappingId,
      email,
      inlineEditingValue,
      selectedMappingPlatform,
      githubValidation,
      setSavingInlineMapping,
      setMappingData,
      setInlineEditingId,
      setInlineEditingValue,
      setGithubValidation,
      validateGithubUsername
    )
  }
  
  // Handle inline value change with debounced validation
  const handleInlineValueChange = (value: string) => {
    setInlineEditingValue(value)
    setGithubValidation(null) // Clear previous validation
    
    // Debounce validation
    if (value.trim() && selectedMappingPlatform === 'github') {
      const timeoutId = setTimeout(() => {
        validateGithubUsername(value)
      }, 500)
      
      return () => clearTimeout(timeoutId)
    }
  }

  const saveInlineMapping = async (mappingId: number | string, email: string) => {
    return MappingHandlers.saveInlineMapping(
      mappingId,
      email,
      inlineEditingValue,
      selectedMappingPlatform,
      githubValidation,
      setSavingInlineMapping,
      setMappingData,
      setInlineEditingId,
      setInlineEditingValue,
      validateGithubUsername
    )
  }

  // Manual mapping handlers
  const loadManualMappings = async (platform: 'github' | 'slack' | 'jira') => {
    return MappingHandlers.loadManualMappings(
      platform,
      setLoadingManualMappings,
      setSelectedManualMappingPlatform,
      setManualMappings,
      setManualMappingStats,
      setShowManualMappingDialog
    )
  }

  const createManualMapping = async () => {
    return MappingHandlers.createManualMapping(
      newMappingForm,
      showManualMappingDialog,
      selectedManualMappingPlatform,
      setNewMappingDialogOpen,
      setNewMappingForm,
      loadManualMappings
    )
  }

  const updateManualMapping = async (mappingId: number, targetIdentifier: string) => {
    return MappingHandlers.updateManualMapping(
      mappingId,
      targetIdentifier,
      showManualMappingDialog,
      selectedManualMappingPlatform,
      setEditingMapping,
      loadManualMappings
    )
  }

  const deleteManualMapping = async (mappingId: number) => {
    return MappingHandlers.deleteManualMapping(
      mappingId,
      showManualMappingDialog,
      selectedManualMappingPlatform,
      loadManualMappings
    )
  }

  // 🚀 PHASE 3: Use useMemo to avoid recalculating filtered integrations on every render
  const filteredIntegrations = useMemo(() => {
    return integrations.filter(integration => {
      if (activeTab === null) return true // Show all integrations when no tab selected
      return integration.platform === activeTab
    })
  }, [integrations, activeTab])

  const rootlyCount = useMemo(() => integrations.filter(i => i.platform === 'rootly').length, [integrations])
  const pagerdutyCount = useMemo(() => integrations.filter(i => i.platform === 'pagerduty').length, [integrations])

  // Helper booleans to distinguish between Slack Survey (OAuth) and Enhanced Integration (webhook/token)
  // Note: Backend returns ONE integration at a time - either OAuth or manual, not both simultaneously
  // Users must choose one integration type. If they want to switch, they disconnect one and connect the other.
  const hasSlackSurvey = slackIntegration?.connection_type === 'oauth'
  const hasSlackEnhanced = slackIntegration && slackIntegration.connection_type !== 'oauth'

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <TopPanel />

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {/* Introduction Text */}
        <div className="text-center mb-6 max-w-2xl mx-auto">
          <h2 className="text-4xl font-bold text-black mb-2">Connect Your Platform</h2>
          <p className="text-lg text-slate-600">
            Integrate with Rootly or PagerDuty to analyze team burnout patterns
          </p>
        </div>

        {/* No integrations message - Show right below intro */}
        {integrations.length === 0 && !loadingRootly && !loadingPagerDuty && (
          <div className="text-center py-8 mb-6 max-w-2xl mx-auto">
            <Shield className="w-12 h-12 mx-auto mb-4 text-gray-300" />
            <p className="text-lg font-medium mb-2 text-gray-700">No integrations yet</p>
            <p className="text-sm text-gray-500">Add a Rootly or PagerDuty integration to get started!</p>
          </div>
        )}

        {/* Ready for Analysis CTA - Always visible when integrations exist */}
        {(loadingRootly || loadingPagerDuty) ? (
          <div className="bg-gradient-to-r from-gray-50 to-gray-100 border border-gray-200 rounded-lg p-6 mb-8 max-w-2xl mx-auto animate-pulse">
            <div className="text-center">
              <div className="w-12 h-12 bg-gray-300 rounded-full mx-auto mb-4"></div>
              <div className="h-6 bg-gray-300 rounded w-80 mx-auto mb-2"></div>
              <div className="h-4 bg-gray-300 rounded w-96 mx-auto mb-2"></div>
              <div className="h-4 bg-gray-300 rounded w-72 mx-auto mb-4"></div>
              <div className="h-10 bg-gray-300 rounded w-40 mx-auto"></div>
            </div>
          </div>
        ) : integrations.length > 0 && (
          <div className="bg-gradient-to-r from-purple-50 to-green-50 border border-purple-200 rounded-lg p-6 mb-8 max-w-2xl mx-auto">
            <div className="text-center">
              <div className="w-12 h-12 bg-purple-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900 mb-2">
                Ready to analyze your team's burnout risk!
              </h3>
              <p className="text-slate-600">
                You have {integrations.length} integration{integrations.length > 1 ? 's' : ''} connected.
                Run your first analysis to identify burnout patterns across your team.
              </p>
            </div>
          </div>
        )}

        {/* Dashboard Organization Selector */}
        {integrations.length > 0 && (
          <div className="max-w-2xl mx-auto mb-6">
            <div className="bg-white border-2 border-slate-200 rounded-lg p-4 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 text-slate-700 flex-shrink-0">
                  <Settings className="w-6 h-6 text-purple-600" />
                  <span className="font-semibold text-lg">Active Organization</span>
                </div>
                <Select
                  value={selectedOrganization}
                  onValueChange={(value) => {
                    // Only show toast if selecting a different organization
                    if (value !== selectedOrganization) {
                      const selected = integrations.find(i => i.id.toString() === value)
                      if (selected) {
                        toast.success(`${selected.name} set as default`)
                      }
                    }

                    setSelectedOrganization(value)
                    // Save to localStorage for persistence
                    localStorage.setItem('selected_organization', value)
                  }}
                >
                  <SelectTrigger className="flex-1 h-10 bg-slate-50 border-slate-300 hover:bg-slate-100 transition-colors">
                    <SelectValue placeholder="Select organization">
                      {selectedOrganization && (() => {
                        const selected = integrations.find(i => i.id.toString() === selectedOrganization)
                        if (selected) {
                          return (
                            <div className="flex items-center justify-between w-full">
                              <div className="flex items-center gap-2">
                                <div className={`w-3 h-3 rounded-full ${
                                  selected.platform === 'rootly' ? 'bg-purple-500' : 'bg-green-500'
                                }`}></div>
                                <span className="font-medium text-base">{selected.name}</span>
                              </div>
                              <Star className="w-5 h-5 text-yellow-500 fill-yellow-500 flex-shrink-0" />
                            </div>
                          )
                        }
                        return null
                      })()}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent className="max-w-md">
                    {/* Group integrations by platform */}
                    {(() => {
                      const rootlyIntegrations = integrations.filter(i => i.platform === 'rootly')
                      const pagerdutyIntegrations = integrations.filter(i => i.platform === 'pagerduty')

                      return (
                        <>
                          {/* Rootly Organizations */}
                          {rootlyIntegrations.length > 0 && (
                            <>
                              <div className="px-3 py-2 text-sm font-semibold text-slate-600 bg-slate-50 border-b border-slate-200">
                                <div className="flex items-center gap-2">
                                  <div className="w-3 h-3 bg-purple-500 rounded-full"></div>
                                  Rootly Organizations
                                </div>
                              </div>
                              {rootlyIntegrations.map((integration) => (
                                <SelectItem
                                  key={integration.id}
                                  value={integration.id.toString()}
                                  className="cursor-pointer"
                                >
                                  <div className="flex items-center justify-between w-full gap-2">
                                    <div className="flex items-center gap-2">
                                      <div className="w-3 h-3 bg-purple-500 rounded-full"></div>
                                      <span className="font-medium text-base">{integration.name}</span>
                                    </div>
                                    {selectedOrganization === integration.id.toString() && (
                                      <Star className="w-5 h-5 text-yellow-500 fill-yellow-500 flex-shrink-0" />
                                    )}
                                  </div>
                                </SelectItem>
                              ))}
                            </>
                          )}

                          {/* PagerDuty Organizations */}
                          {pagerdutyIntegrations.length > 0 && (
                            <>
                              {rootlyIntegrations.length > 0 && (
                                <div className="my-1 border-t border-slate-200"></div>
                              )}
                              <div className="px-3 py-2 text-sm font-semibold text-slate-600 bg-slate-50 border-b border-slate-200">
                                <div className="flex items-center gap-2">
                                  <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                                  PagerDuty Organizations
                                </div>
                              </div>
                              {pagerdutyIntegrations.map((integration) => (
                                <SelectItem
                                  key={integration.id}
                                  value={integration.id.toString()}
                                  className="cursor-pointer"
                                >
                                  <div className="flex items-center justify-between w-full gap-2">
                                    <div className="flex items-center gap-2">
                                      <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                                      <span className="font-medium text-base">{integration.name}</span>
                                    </div>
                                    {selectedOrganization === integration.id.toString() && (
                                      <Star className="w-5 h-5 text-yellow-500 fill-yellow-500 flex-shrink-0" />
                                    )}
                                  </div>
                                </SelectItem>
                              ))}
                            </>
                          )}
                        </>
                      )
                    })()}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        )}

        {/* Platform Selection Cards */}
        <div className="grid md:grid-cols-2 gap-4 mb-6 max-w-2xl mx-auto">
          {/* Rootly Card */}
          {loadingRootly ? (
            <Card className="border-2 border-gray-200 p-4 flex items-center justify-center relative h-20 animate-pulse">
                <div className="absolute top-2 right-2 w-5 h-5 bg-gray-300 rounded"></div>
                <div className="h-8 w-32 bg-gray-300 rounded"></div>
            </Card>
          ) : (
              <Card
                className={`border-2 transition-all cursor-pointer hover:shadow-md ${
                  activeTab === 'rootly'
                    ? 'border-purple-500 shadow-md bg-purple-50'
                    : 'border-gray-200 hover:border-purple-300'
                } p-4 flex items-center justify-center relative h-20`}
                onClick={() => {
                  setActiveTab('rootly')
                  setAddingPlatform('rootly')
                  // Reset connection state when switching platforms
                  setConnectionStatus('idle')
                  setPreviewData(null)
                  setDuplicateInfo(null)
                  setTokenError(null)
                  // Scroll to form
                  setTimeout(() => {
                    formSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                  }, 100)
                }}
              >
                {activeTab === 'rootly' && (
                  <>
                    <div className="absolute top-2 left-2">
                      <CheckCircle className="w-5 h-5 text-purple-600" />
                    </div>
                    <div className="absolute top-2 right-2">
                      <Badge variant="secondary" className="bg-purple-100 text-purple-700 text-xs">{rootlyCount}</Badge>
                    </div>
                  </>
                )}
                {activeTab !== 'rootly' && rootlyCount > 0 && (
                  <Badge variant="secondary" className="absolute top-2 right-2 text-xs">{rootlyCount}</Badge>
                )}
                <div className="flex items-center justify-center">
                  <Image
                    src="/images/rootly-logo-branded.png"
                    alt="Rootly"
                    width={200}
                    height={80}
                    className="h-12 w-auto object-contain"
                  />
                </div>
              </Card>
          )}

          {/* PagerDuty Card */}
          {(loadingPagerDuty ? (
            <Card className="border-2 border-gray-200 p-4 flex items-center justify-center relative h-20 animate-pulse">
              <div className="absolute top-2 right-2 w-5 h-5 bg-gray-300 rounded"></div>
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-gray-300 rounded"></div>
                <div className="h-6 w-24 bg-gray-300 rounded"></div>
              </div>
            </Card>
          ) : (
            <Card
              className={`border-2 transition-all cursor-pointer hover:shadow-md ${
                activeTab === 'pagerduty'
                  ? 'border-green-500 shadow-md bg-green-50'
                  : 'border-gray-200 hover:border-green-300'
              } p-4 flex items-center justify-center relative h-20`}
              onClick={() => {
                setActiveTab('pagerduty')
                setAddingPlatform('pagerduty')
                // Reset connection state when switching platforms
                setConnectionStatus('idle')
                setPreviewData(null)
                setDuplicateInfo(null)
                setTokenError(null)
                // Scroll to form
                setTimeout(() => {
                  formSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                }, 100)
              }}
            >
              {activeTab === 'pagerduty' && (
                <>
                  <div className="absolute top-2 left-2">
                    <CheckCircle className="w-5 h-5 text-green-600" />
                  </div>
                  <div className="absolute top-2 right-2">
                    <Badge variant="secondary" className="bg-green-100 text-green-700 text-xs">{pagerdutyCount}</Badge>
                  </div>
                </>
              )}
              {activeTab !== 'pagerduty' && pagerdutyCount > 0 && (
                <Badge variant="secondary" className="absolute top-2 right-2 text-xs">{pagerdutyCount}</Badge>
              )}
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-green-600 rounded flex items-center justify-center">
                  <span className="text-white font-bold text-sm">PD</span>
                </div>
                <span className="text-lg font-bold text-slate-900">PagerDuty</span>
              </div>
            </Card>
          ))}
        </div>

        <div ref={formSectionRef} className="space-y-6 scroll-mt-20">

            {/* Add Rootly Integration Form */}
            {addingPlatform === 'rootly' && (
              <RootlyIntegrationForm
                form={rootlyForm}
                onTest={testConnection}
                onAdd={() => addIntegration('rootly')}
                connectionStatus={connectionStatus}
                previewData={previewData}
                duplicateInfo={duplicateInfo}
                isTestingConnection={isTestingConnection}
                isAdding={isAddingRootly}
                isValidToken={isValidRootlyToken}
                onCopyToken={copyToClipboard}
                copied={copied}
                errorDetails={errorDetails}
              />
            )}

            {/* Add PagerDuty Integration Form */}
            {addingPlatform === 'pagerduty' && (
              <PagerDutyIntegrationForm
                form={pagerdutyForm}
                onTest={testConnection}
                onAdd={() => addIntegration('pagerduty')}
                connectionStatus={connectionStatus}
                previewData={previewData}
                duplicateInfo={duplicateInfo}
                isTestingConnection={isTestingConnection}
                isAdding={isAddingPagerDuty}
                isValidToken={isValidPagerDutyToken}
                onCopyToken={copyToClipboard}
                copied={copied}
                errorDetails={errorDetails}
              />
            )}

            {/* Existing Integrations */}
            {(loadingRootly || loadingPagerDuty) ? (
              <Card className="max-w-2xl mx-auto">
                <CardContent className="p-6 space-y-4">
                {/* Skeleton loading cards */}
                {[1, 2].map((i) => (
                  <Card key={i} className="border-gray-200 bg-gray-50 animate-pulse">
                    <CardContent className="p-6">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-3 mb-4">
                            <div className="h-6 bg-gray-300 rounded w-32"></div>
                            <div className="h-5 bg-gray-300 rounded w-20"></div>
                            <div className="h-5 bg-gray-300 rounded w-16"></div>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            {[1, 2, 3, 4, 5].map((j) => (
                              <div key={j} className="flex items-start space-x-2">
                                <div className="w-4 h-4 bg-gray-300 rounded mt-0.5"></div>
                                <div>
                                  <div className="h-4 bg-gray-300 rounded w-20 mb-1"></div>
                                  <div className="h-4 bg-gray-300 rounded w-16"></div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className="h-8 bg-gray-300 rounded w-24"></div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
                  <div className="text-center py-4">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-slate-400" />
                    <p className="text-sm text-gray-500 mt-2">Loading integrations...</p>
                  </div>
                </CardContent>
              </Card>
            ) : integrations.length > 0 && filteredIntegrations.length > 0 ? (
              <Card className="max-w-2xl mx-auto">
                <CardContent className="p-6 space-y-4">
                  {filteredIntegrations.map((integration) => {
                    const isExpanded = expandedIntegrations.has(integration.id)

                    return (
                    <div key={integration.id} className={`
                      rounded-lg border relative transition-all
                      ${integration.platform === 'rootly' ? 'border-green-200 bg-green-50' : 'border-green-200 bg-green-50'}
                      ${savingIntegrationId === integration.id ? 'opacity-75' : ''}
                      ${isExpanded ? 'p-4' : 'p-3'}
                    `}>
                      {/* Saving overlay */}
                      {savingIntegrationId === integration.id && (
                        <div className="absolute inset-0 bg-white bg-opacity-50 flex items-center justify-center rounded-lg z-10">
                          <div className="flex items-center space-x-2">
                            <Loader2 className="w-5 h-5 animate-spin" />
                            <span className="text-sm font-medium">Saving...</span>
                          </div>
                        </div>
                      )}

                      {/* Collapsed Header - Click anywhere to expand */}
                      <div
                        className="flex items-center cursor-pointer hover:bg-white/30 -m-3 p-3 rounded-lg transition-colors"
                        onClick={() => !editingIntegration && toggleIntegrationExpanded(integration.id)}
                      >
                        {/* Expand/Collapse Icon */}
                        <div className="flex-shrink-0 w-6">
                          {isExpanded ? (
                            <ChevronUp className="w-4 h-4 text-gray-500" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-gray-500" />
                          )}
                        </div>

                        {/* Name - flexible width */}
                        {editingIntegration === integration.id ? (
                          <div className="flex items-center space-x-2 flex-1 min-w-0 mr-3" onClick={(e) => e.stopPropagation()}>
                            <Input
                              value={editingName}
                              onChange={(e) => setEditingName(e.target.value)}
                              className="h-8 w-48"
                              disabled={savingIntegrationId === integration.id}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && savingIntegrationId !== integration.id) {
                                  updateIntegrationName(integration, editingName)
                                  setEditingIntegration(null)
                                } else if (e.key === 'Escape') {
                                  setEditingIntegration(null)
                                }
                              }}
                            />
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={savingIntegrationId === integration.id}
                              onClick={() => {
                                updateIntegrationName(integration, editingName)
                                setEditingIntegration(null)
                              }}
                            >
                              <Check className="w-4 h-4" />
                            </Button>
                          </div>
                        ) : (
                          <h3 className="font-semibold text-base truncate flex-1 min-w-0 mr-3">{integration.name}</h3>
                        )}

                        {/* Stats in collapsed view - fixed widths for alignment */}
                        {!isExpanded && (
                          <>
                            <div className="flex items-center gap-1 text-sm text-gray-600 w-16 flex-shrink-0">
                              <Users className="w-3 h-3" />
                              <span>{integration.total_users}</span>
                            </div>
                            <div className="text-sm text-gray-500 w-28 flex-shrink-0">•••{integration.token_suffix}</div>
                          </>
                        )}

                        {/* Badge - fixed width for alignment */}
                        <Badge variant={integration.platform === 'rootly' ? 'default' : 'secondary'}
                               className={`flex-shrink-0 w-24 justify-center ${integration.platform === 'rootly' ? 'bg-purple-100 text-purple-700' : 'bg-green-100 text-green-700'}`}>
                          {integration.platform}
                        </Badge>
                      </div>

                      {/* Expanded Details */}
                      {isExpanded && (
                        <div className="mt-4 space-y-4">
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                            <div className="flex items-start space-x-2">
                              <Building className="w-4 h-4 mt-0.5 text-gray-400" />
                              <div className="flex-1">
                                <div className="font-bold text-gray-900 flex items-center gap-2">
                                  Organization
                                  {editingIntegration !== integration.id && (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      disabled={savingIntegrationId === integration.id}
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        setEditingIntegration(integration.id)
                                        setEditingName(integration.name)
                                      }}
                                      className="h-5 w-5 p-0"
                                    >
                                      <Edit3 className="w-3 h-3" />
                                    </Button>
                                  )}
                                </div>
                                <div className="text-gray-600">{integration.organization_name}</div>
                              </div>
                            </div>
                            <div className="flex items-start space-x-2">
                              <Users className="w-4 h-4 mt-0.5 text-gray-400" />
                              <div>
                                <div className="font-bold text-gray-900">Users</div>
                                <div className="text-gray-600">{integration.total_users}</div>
                              </div>
                            </div>
                            {integration.platform === 'pagerduty' && integration.total_services !== undefined && (
                              <div className="flex items-start space-x-2">
                                <Zap className="w-4 h-4 mt-0.5 text-gray-400" />
                                <div>
                                  <div className="font-bold text-gray-900">Services</div>
                                  <div className="text-gray-600">{integration.total_services}</div>
                                </div>
                              </div>
                            )}
                            <div className="flex items-start space-x-2">
                              <Key className="w-4 h-4 mt-0.5 text-gray-400" />
                              <div>
                                <div className="font-bold text-gray-900">Token</div>
                                <div className="text-gray-600">•••{integration.token_suffix}</div>
                              </div>
                            </div>
                            <div className="flex items-start space-x-2">
                              <Calendar className="w-4 h-4 mt-0.5 text-gray-400" />
                              <div>
                                <div className="font-bold text-gray-900">Added</div>
                                <div className="text-gray-600">{new Date(integration.created_at).toLocaleDateString()}</div>
                              </div>
                            </div>
                            {integration.last_used_at && (
                              <div className="flex items-start space-x-2">
                                <Clock className="w-4 h-4 mt-0.5 text-gray-400" />
                                <div>
                                  <div className="font-bold text-gray-900">Last used</div>
                                  <div className="text-gray-600">{new Date(integration.last_used_at).toLocaleDateString()}</div>
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Permissions for Rootly and PagerDuty */}
                          {integration.permissions && (
                            <>
                              <div className="mt-3 flex items-center justify-between text-sm">
                                <div className="flex items-center space-x-4">
                                  <span className="text-gray-500">Read permissions:</span>
                                  {/* Show loader when permissions are being checked */}
                                  {(integration.permissions?.users?.access === null && integration.permissions?.incidents?.access === null) || refreshingPermissions === integration.id ? (
                                    <div className="flex items-center space-x-2">
                                      <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                                      <span className="text-gray-500">Checking permissions...</span>
                                    </div>
                                  ) : (
                                    <>
                                      <div className="flex items-center space-x-1">
                                        {integration.permissions?.users?.access ? (
                                          <Tooltip content="✓ User read permissions: Required to run burnout analysis and identify team members">
                                            <CheckCircle className="w-4 h-4 text-green-500 cursor-help" />
                                          </Tooltip>
                                        ) : (
                                          <Tooltip content={`✗ User read permissions required: ${integration.permissions?.users?.error || "Permission denied"}. Both User and Incident read permissions are required to run burnout analysis.`}>
                                            <AlertCircle className="w-4 h-4 text-red-500 cursor-help" />
                                          </Tooltip>
                                        )}
                                        <span>Users</span>
                                      </div>
                                      <div className="flex items-center space-x-1">
                                        {integration.permissions?.incidents?.access ? (
                                          <Tooltip content="✓ Incident read permissions: Required to run burnout analysis and analyze incident response patterns">
                                            <CheckCircle className="w-4 h-4 text-green-500 cursor-help" />
                                          </Tooltip>
                                        ) : (
                                          <Tooltip content={`✗ Incident read permissions required: ${integration.permissions?.incidents?.error || "Permission denied"}. Both User and Incident read permissions are required to run burnout analysis.`}>
                                            <AlertCircle className="w-4 h-4 text-red-500 cursor-help" />
                                          </Tooltip>
                                        )}
                                        <span>Incidents</span>
                                      </div>
                                    </>
                                  )}
                                </div>
                                {/* Refresh button */}
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => refreshIntegrationPermissions(integration.id)}
                                  disabled={refreshingPermissions === integration.id}
                                  className="h-7 px-2 text-gray-500 hover:text-gray-700"
                                >
                                  <RefreshCw className={`w-3 h-3 ${refreshingPermissions === integration.id ? 'animate-spin' : ''}`} />
                                </Button>
                              </div>

                              {/* Error message for insufficient permissions */}
                              {integration.permissions?.users?.access !== null && integration.permissions?.incidents?.access !== null &&
                               (!integration.permissions?.users?.access || !integration.permissions?.incidents?.access) && (
                                <div>
                                  <Alert className="border-red-200 bg-red-50">
                                    <AlertCircle className="h-4 w-4 text-red-600" />
                                    <AlertDescription className="text-red-800">
                                      <strong>Insufficient permissions.</strong> Update API token with Users and Incidents read access.
                                    </AlertDescription>
                                  </Alert>
                                </div>
                              )}
                            </>
                          )}

                          {/* Delete Button in Expanded View */}
                          <div className="pt-3 border-t border-gray-200 flex justify-end">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setIntegrationToDelete(integration)
                                setDeleteDialogOpen(true)
                              }}
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              Delete Integration
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                    )
                  })}

                  {/* Skeleton card while reloading integrations */}
                  {reloadingIntegrations && (
                    <div className="p-6 rounded-lg border border-gray-200 bg-gray-50 animate-pulse">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center space-x-3">
                          <div className="w-6 h-6 bg-gray-300 rounded"></div>
                          <div className="h-5 w-32 bg-gray-300 rounded"></div>
                        </div>
                        <div className="w-16 h-6 bg-gray-300 rounded"></div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm">
                        <div className="flex items-start space-x-2">
                          <div className="w-4 h-4 mt-0.5 bg-gray-300 rounded"></div>
                          <div>
                            <div className="h-4 w-20 bg-gray-300 rounded mb-2"></div>
                            <div className="h-4 w-24 bg-gray-300 rounded"></div>
                          </div>
                        </div>
                        <div className="flex items-start space-x-2">
                          <div className="w-4 h-4 mt-0.5 bg-gray-300 rounded"></div>
                          <div>
                            <div className="h-4 w-16 bg-gray-300 rounded mb-2"></div>
                            <div className="h-4 w-8 bg-gray-300 rounded"></div>
                          </div>
                        </div>
                        <div className="flex items-start space-x-2">
                          <div className="w-4 h-4 mt-0.5 bg-gray-300 rounded"></div>
                          <div>
                            <div className="h-4 w-12 bg-gray-300 rounded mb-2"></div>
                            <div className="h-4 w-16 bg-gray-300 rounded"></div>
                          </div>
                        </div>
                      </div>

                      {/* Loading indicator */}
                      <div className="flex items-center justify-center mt-4 pt-4 border-t border-gray-300">
                        <Loader2 className="w-4 h-4 animate-spin mr-2 text-gray-400" />
                        <span className="text-sm text-gray-500">Adding integration...</span>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ) : null}
        </div>

        {/* Team Management Section */}
        <div className="mt-16 space-y-8">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-slate-900 mb-3">Team Management</h2>
            <p className="text-lg text-slate-600 mb-2">
              Sync and manage your team members for burnout analysis
            </p>
            <p className="text-slate-500">
              View synced users, manage enhanced integration mappings, and select survey recipients
            </p>
          </div>

          {/* Team Members Card */}
          <div className="max-w-2xl mx-auto">
            <Card className={`border-2 ${selectedOrganization ? 'border-purple-200 bg-purple-50' : 'border-gray-200 bg-gray-50'}`}>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${selectedOrganization ? 'bg-purple-600' : 'bg-gray-300'}`}>
                      <Users className={`w-6 h-6 ${selectedOrganization ? 'text-white' : 'text-gray-500'}`} />
                    </div>
                    <div>
                      <h3 className={`text-lg font-semibold ${selectedOrganization ? 'text-slate-900' : 'text-gray-900'}`}>
                        Team Members
                      </h3>
                      <p className={`text-sm ${selectedOrganization ? 'text-slate-600' : 'text-gray-600'}`}>
                        {selectedOrganization ? (
                          <>View and manage synced team members {syncedUsers.length > 0 && `(${syncedUsers.length} synced)`}</>
                        ) : (
                          'Select an organization above to view team members'
                        )}
                      </p>
                    </div>
                  </div>
                  <Button
                    onClick={() => {
                      if (!selectedOrganization) {
                        toast.error('Please select an organization first')
                        return
                      }

                      // Open drawer immediately for better UX
                      setTeamMembersDrawerOpen(true)

                      // If we have cached data, show it immediately
                      if (selectedOrganization && syncedUsersCache.current.has(selectedOrganization)) {
                        const cachedUsers = syncedUsersCache.current.get(selectedOrganization)!
                        setSyncedUsers(cachedUsers)
                        setShowSyncedUsers(true)

                        // Also restore cached recipient selections (validate IDs still exist)
                        if (recipientsCache.current.has(selectedOrganization)) {
                          const cachedRecipients = recipientsCache.current.get(selectedOrganization)!
                          const validUserIds = new Set(cachedUsers.map(u => u.id))
                          const validCachedRecipients = new Set(
                            Array.from(cachedRecipients).filter(id => validUserIds.has(id))
                          )
                          setSelectedRecipients(validCachedRecipients)
                          setSavedRecipients(validCachedRecipients)
                        }
                      } else {
                        // Otherwise fetch from API
                        fetchSyncedUsers(false, false)
                      }
                    }}
                    disabled={!selectedOrganization}
                    className="bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                    title={!selectedOrganization ? 'Please select an organization first' : ''}
                  >
                    <Users className="w-4 h-4 mr-2" />
                    View Members
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Enhanced Integrations Section */}
        <div className="mt-16 space-y-8">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-slate-900 mb-3">Enhanced Integrations</h2>
            <p className="text-lg text-slate-600 mb-2">
              Connect GitHub and Slack for deeper insights
            </p>
            <p className="text-slate-500">
              Analyze code patterns, team communication, and collect direct feedback
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-4 mb-6 max-w-2xl mx-auto">
            {/* GitHub Card */}
            {loadingGitHub ? (
              <Card className="border-2 border-gray-200 p-4 flex items-center justify-center relative h-20 animate-pulse">
                <div className="absolute top-2 right-2 w-16 h-5 bg-gray-300 rounded"></div>
                <div className="flex items-center space-x-2">
                  <div className="w-8 h-8 bg-gray-300 rounded"></div>
                  <div className="h-6 w-20 bg-gray-300 rounded"></div>
                </div>
              </Card>
            ) : (
                <Card
                  className={`border-2 transition-all cursor-pointer hover:shadow-md ${
                    activeEnhancementTab === 'github'
                      ? 'border-gray-500 shadow-md bg-gray-50'
                      : 'border-gray-200 hover:border-gray-300'
                  } p-4 flex items-center justify-center relative h-20`}
                  onClick={() => {
                    setActiveEnhancementTab(activeEnhancementTab === 'github' ? null : 'github')
                  }}
                >
                  {githubIntegration ? (
                    <div className="absolute top-2 right-2 flex flex-col items-end space-y-1">
                      <Badge variant="secondary" className="bg-green-100 text-green-700 border-green-200 text-xs">
                        <CheckCircle className="w-3 h-3 mr-1" />
                        Connected
                      </Badge>
                    </div>
                  ) : null}
                  {activeEnhancementTab === 'github' && (
                    <div className="absolute top-2 left-2">
                      <CheckCircle className="w-5 h-5 text-gray-600" />
                    </div>
                  )}
                  <div className="flex items-center space-x-2">
                    <div className="w-8 h-8 rounded flex items-center justify-center">
                      <Image
                        src="/images/github-logo.png"
                        alt="GitHub"
                        width={32}
                        height={32}
                        className="h-8 w-8 object-contain"
                      />
                    </div>
                    <span className="text-lg font-bold text-slate-900">GitHub</span>
                  </div>
                </Card>
            )}

            {/* Slack Card */}
            {loadingSlack ? (
              <Card className="border-2 border-gray-200 p-4 flex items-center justify-center relative h-20 animate-pulse">
                <div className="absolute top-2 right-2 w-16 h-5 bg-gray-300 rounded"></div>
                <div className="flex items-center space-x-2">
                  <div className="w-8 h-8 bg-gray-300 rounded"></div>
                  <div className="h-6 w-16 bg-gray-300 rounded"></div>
                </div>
              </Card>
            ) : (
              <Card
                className={`border-2 transition-all cursor-pointer hover:shadow-md ${
                  activeEnhancementTab === 'slack'
                    ? 'border-purple-500 shadow-md bg-purple-50'
                    : 'border-gray-200 hover:border-purple-300'
                } p-4 flex items-center justify-center relative h-20`}
                onClick={() => {
                  setActiveEnhancementTab(activeEnhancementTab === 'slack' ? null : 'slack')
                }}
              >
                  {slackIntegration ? (
                    <div className="absolute top-2 right-2">
                      <Badge variant="secondary" className="bg-green-100 text-green-700 text-xs">Connected</Badge>
                    </div>
                  ) : null}
                  {activeEnhancementTab === 'slack' && (
                    <div className="absolute top-2 left-2">
                      <CheckCircle className="w-5 h-5 text-purple-600" />
                    </div>
                  )}
                  <div className="flex items-center space-x-2">
                    <div className="w-8 h-8 rounded flex items-center justify-center">
                      <Image
                        src="/images/slack-logo.png"
                        alt="Slack"
                        width={32}
                        height={32}
                        className="h-8 w-8 object-contain"
                      />
                    </div>
                    <span className="text-lg font-bold text-slate-900">Slack</span>
                  </div>
                </Card>
            )}


            {/* Jira Card */}
            {loadingJira ? (
              <Card className="border-2 border-gray-200 p-4 flex items-center justify-center relative h-20 animate-pulse">
                <div className="absolute top-2 right-2 w-16 h-5 bg-gray-300 rounded"></div>
                <div className="flex items-center space-x-2">
                  <div className="w-8 h-8 bg-gray-300 rounded"></div>
                  <div className="h-6 w-20 bg-gray-300 rounded"></div>
                </div>
              </Card>
            ) : (
              <Card
                className={`border-2 transition-all cursor-pointer hover:shadow-md ${
                  activeEnhancementTab === 'jira'
                    ? 'border-blue-500 shadow-md bg-blue-50'
                    : 'border-gray-200 hover:border-blue-300'
                } p-4 flex items-center justify-center relative h-20`}
                onClick={() => {
                  setActiveEnhancementTab(activeEnhancementTab === 'jira' ? null : 'jira')
                }}
              >
                {jiraIntegration ? (
                  <div className="absolute top-2 right-2 flex flex-col items-end space-y-1">
                    <Badge variant="secondary" className="bg-green-100 text-green-700 border-green-200 text-xs">
                      <CheckCircle className="w-3 h-3 mr-1" />
                      Connected
                    </Badge>
                  </div>
                ) : null}
                {activeEnhancementTab === 'jira' && (
                  <div className="absolute top-2 left-2">
                    <CheckCircle className="w-5 h-5 text-gray-600" />
                  </div>
                )}
                <div className="flex items-center space-x-2">
                  <div className="w-8 h-8 rounded flex items-center justify-center bg-blue-600">
                    <svg
                      viewBox="0 0 24 24"
                      className="w-5 h-5 text-white"
                      fill="currentColor"
                    >
                      <path d="M11.571 11.513H0a5.218 5.218 0 0 0 5.232 5.215h2.13v2.057A5.215 5.215 0 0 0 12.575 24V12.518a1.005 1.005 0 0 0-1.005-1.005zm5.723-5.756H5.736a5.215 5.215 0 0 0 5.215 5.214h2.129v2.058a5.218 5.218 0 0 0 5.215 5.232V6.758a1.001 1.001 0 0 0-1.001-1.001zM23.013 0H11.455a5.215 5.215 0 0 0 5.215 5.215h2.129v2.057A5.215 5.215 0 0 0 24 12.483V1.005A1.001 1.001 0 0 0 23.013 0Z"/>
                    </svg>
                  </div>
                  <span className="text-xl font-semibold text-slate-900">Jira</span>
                </div>
              </Card>
            )}
          </div>

          {/* Integration Forms */}
          <div className="space-y-6">
            {/* GitHub Token Form */}
            {activeEnhancementTab === 'github' && !githubIntegration && (
              <GitHubIntegrationCard
                onConnect={handleGitHubConnect}
                isConnecting={isConnectingGithub}
              />
            )}

            {/* Slack Integration - OAuth Only */}
            {activeEnhancementTab === 'slack' && (
              <SurveyFeedbackSection
                slackIntegration={slackIntegration}
                loadingSlack={loadingSlack}
                isConnectingSlackOAuth={isConnectingSlackOAuth}
                isDisconnectingSlackSurvey={isDisconnectingSlackSurvey}
                userInfo={userInfo}
                selectedOrganization={selectedOrganization}
                integrations={integrations}
                teamMembers={teamMembers}
                loadingTeamMembers={loadingTeamMembers}
                loadingSyncedUsers={loadingSyncedUsers}
                fetchTeamMembers={fetchTeamMembers}
                syncUsersToCorrelation={syncUsersToCorrelation}
                fetchSyncedUsers={fetchSyncedUsers}
                setShowManualSurveyModal={setShowManualSurveyModal}
                loadSlackPermissions={loadSlackPermissions}
                loadSlackStatus={loadSlackIntegration}
                setSlackSurveyDisconnectDialogOpen={setSlackSurveyDisconnectDialogOpen}
                setIsConnectingSlackOAuth={setIsConnectingSlackOAuth}
                toast={toast}
              />
            )}

            {/* Connected GitHub Status */}
            {activeEnhancementTab === 'github' && githubIntegration && (
              <GitHubConnectedCard
                integration={githubIntegration}
                onDisconnect={() => setGithubDisconnectDialogOpen(true)}
                onTest={handleGitHubTest}
              />
            )}
            {/* Jira Integration Card - Not Connected */}
            {activeEnhancementTab === 'jira' && !jiraIntegration && (
              <JiraIntegrationCard
                onConnect={handleJiraConnect}
                isConnecting={isConnectingJira}
              />
            )}

            {/* Jira Connected Card */}
            {activeEnhancementTab === 'jira' && jiraIntegration && (
              <JiraConnectedCard
                integration={jiraIntegration}
                onDisconnect={() => setJiraDisconnectDialogOpen(true)}
                onTest={handleJiraTest}
                isLoading={isDisconnectingJira}
              />
            )}

          </div>
        </div>

        {/* AI Insights Section */}
        <div className="mt-16 space-y-8">
          <AIInsightsCard
            llmConfig={llmConfig}
            onConnect={async (token, provider, useSystemToken, switchToCustom = false) => {
              await AIHandlers.handleConnectAI(
                token,
                provider,
                llmModel,
                setIsConnectingAI,
                setTokenError,
                setLlmConfig,
                setLlmToken,
                useSystemToken,
                switchToCustom
              )
            }}
            onDisconnect={async () => {
              await AIHandlers.handleDisconnectAI(setLlmConfig)
            }}
            isConnecting={isConnectingAI}
          />
        </div>

        {/* OLD AI Section - Remove after testing */}
        {false && (
          <div className="mt-16 space-y-8">
            <div className="text-center">
              <h2 className="text-2xl font-bold text-slate-900 mb-3">AI Insights Included</h2>
              <p className="text-lg text-slate-600 mb-2">
                Enable AI-powered burnout analysis with natural language reasoning
              </p>
              <p className="text-slate-500">
                Get intelligent insights and recommendations automatically with every analysis
              </p>
            </div>

            <div className="max-w-xl mx-auto">
              <Card className="border-2 border-blue-200 p-6">
                <CardHeader className="pb-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                        <Zap className="w-6 h-6 text-blue-600" />
                      </div>
                      <div>
                        <CardTitle className="text-xl">LLM Token</CardTitle>
                        <CardDescription>
                          Connect your language model for AI-powered analysis
                        </CardDescription>
                      </div>
                    </div>
                    {llmConfig?.has_token && (
                      <Badge variant="secondary" className="bg-green-100 text-green-700">
                        Connected
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {llmConfig?.has_token ? (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                      <div className="flex items-center space-x-2">
                        <CheckCircle className="w-5 h-5 text-green-600" />
                        <div className="text-sm text-green-800">
                          <p className="font-medium">
                            {llmConfig.provider === 'openai' ? 'OpenAI' : 'Anthropic'} Connected
                          </p>
                          <p className="text-xs">
                            AI-powered analysis enabled for all users
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-700">
                          Provider
                        </label>
                        <select 
                          value={llmProvider} 
                          onChange={(e) => {
                            setLlmProvider(e.target.value)
                            setLlmModel(e.target.value === 'openai' ? 'gpt-4o-mini' : 'claude-3-haiku')
                            if (tokenError) setTokenError(null) // Clear error when changing provider
                          }}
                          className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        >
                          <option value="openai">OpenAI (GPT-4o-mini)</option>
                          <option value="anthropic">Anthropic (Claude 3 Haiku)</option>
                        </select>
                      </div>

                      <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-700">
                          API Token
                        </label>
                        <div className="relative">
                          <Input
                            type={showLlmToken ? "text" : "password"}
                            placeholder={`Enter your ${llmProvider === 'openai' ? 'OpenAI' : 'Anthropic'} API token`}
                            value={llmToken}
                            onChange={(e) => {
                              setLlmToken(e.target.value)
                              if (tokenError) setTokenError(null) // Clear error when user types
                            }}
                            className={`pr-10 ${tokenError ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''}`}
                          />
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setShowLlmToken(!showLlmToken)}
                            className="absolute right-2 top-1/2 transform -translate-y-1/2 h-6 w-6 p-0"
                          >
                            {showLlmToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </Button>
                        </div>
                        
                        {tokenError ? (
                          <p className="text-xs text-red-600 flex items-center space-x-1">
                            <AlertCircle className="w-3 h-3" />
                            <span>{tokenError}</span>
                          </p>
                        ) : (
                          <p className="text-xs text-slate-500">
                            {llmProvider === 'openai' 
                              ? 'Token should start with "sk-" and have 51+ characters'
                              : 'Token should start with "sk-ant-api" and have 100+ characters'
                            }
                          </p>
                        )}
                      </div>

                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                        <div className="flex items-start space-x-2">
                          <HelpCircle className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                          <div className="text-sm text-blue-800">
                            <p className="font-medium mb-1">AI Features Include:</p>
                            <ul className="space-y-1 text-xs">
                              <li>• Natural language reasoning about burnout patterns</li>
                              <li>• Intelligent risk assessment with explanations</li>
                              <li>• Context-aware recommendations</li>
                              <li>• Team-level insights and trends</li>
                            </ul>
                          </div>
                        </div>
                      </div>

                      <div className="flex space-x-2">
                        <Button 
                          className="flex-1" 
                          onClick={handleConnectAI}
                          disabled={isConnectingAI || !llmToken.trim()}
                        >
                          {isConnectingAI ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              Verifying Token...
                            </>
                          ) : (
                            'Connect AI'
                          )}
                        </Button>
                        <Button variant="outline" size="sm" asChild>
                          <a 
                            href={llmProvider === 'openai' 
                              ? 'https://platform.openai.com/api-keys' 
                              : 'https://console.anthropic.com/'
                            } 
                            target="_blank" 
                            rel="noopener noreferrer"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        </Button>
                      </div>
                    </>
                  )}

                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription className="text-sm">
                      AI insights are automatically included with every analysis - no setup or API tokens required!
                    </AlertDescription>
                  </Alert>
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </main>

      {/* Data Mapping Drawer */}
      <Sheet open={showMappingDialog} onOpenChange={setShowMappingDialog}>
        <SheetContent className="w-full sm:max-w-4xl lg:max-w-5xl overflow-y-auto">
          <SheetHeader className="space-y-4">
            <SheetTitle className="flex items-center justify-between pr-6">
              <div className="flex items-center space-x-2">
                <BarChart3 className="w-5 h-5" />
                <span>
                  {selectedMappingPlatform === 'github' ? 'GitHub' : 'Slack'} Data Mapping
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  selectedMappingPlatform && loadMappingData(selectedMappingPlatform)
                }}
                disabled={loadingMappingData}
                className="h-8 w-8 p-0"
                title="Refresh mapping data"
              >
                <RefreshCw className={`w-4 h-4 ${loadingMappingData ? 'animate-spin' : ''}`} />
              </Button>
            </SheetTitle>
            <SheetDescription>
              View how team members from your incident data are mapped to {selectedMappingPlatform === 'github' ? 'GitHub' : 'Slack'} accounts. Click the refresh button to reload the latest mapping data.
            </SheetDescription>
          </SheetHeader>

          {mappingStats && (
            <div className="relative space-y-6">
              {/* Loading overlay when refreshing */}
              {loadingMappingData && (
                <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center z-10 rounded-lg">
                  <div className="flex items-center space-x-2 text-gray-600">
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span className="text-sm">Refreshing mapping data...</span>
                  </div>
                </div>
              )}
              
              {/* Overall Statistics */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                <Card className="p-4 border-purple-200">
                  <div className="flex items-center space-x-2">
                    <Users2 className="w-4 h-4 text-green-600" />
                    <div>
                      <div className="text-2xl font-bold">{(mappingStats as any).mapped_members || mappingStats.total_attempts}</div>
                      <div className="text-sm text-gray-600">Mapped Members</div>
                    </div>
                  </div>
                </Card>
                <Card className="p-4 border-purple-200">
                  <div className="flex items-center space-x-2">
                    <CheckCircle className="w-4 h-4 text-green-600" />
                    <div>
                      <div className="text-2xl font-bold text-green-600">
                        {mappingStats.overall_success_rate}%
                      </div>
                      <div className="text-sm text-gray-600">Success Rate</div>
                    </div>
                  </div>
                </Card>
                <Card className="p-4 border-purple-200">
                  <div className="flex items-center space-x-2">
                    <Database className="w-4 h-4 text-purple-600" />
                    <div>
                      <div className="text-2xl font-bold">
                        {(mappingStats as any).members_with_data || mappingData.filter(m => m.data_collected && m.mapping_successful).length}
                      </div>
                      <div className="text-sm text-gray-600">With Data</div>
                    </div>
                  </div>
                </Card>
              </div>

              {/* Mapping Results Table */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">Mapping Results</h3>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={showOnlyFailed}
                      onChange={(e) => setShowOnlyFailed(e.target.checked)}
                      className="rounded border-gray-300"
                    />
                    Show only failed mappings
                  </label>
                </div>
                <div className="border rounded-lg overflow-hidden">
                  <div className="bg-gray-50 px-4 py-3 border-b">
                    <div className="grid grid-cols-4 gap-4 text-sm font-medium text-gray-600">
                      <button
                        onClick={() => handleSort('email')}
                        className="flex items-center gap-1 hover:text-gray-900 text-left"
                      >
                        Team Member
                        {sortField === 'email' ? (
                          sortDirection === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                        ) : (
                          <ArrowUpDown className="w-3 h-3 opacity-50" />
                        )}
                      </button>
                      <button
                        onClick={() => handleSort('status')}
                        className="flex items-center gap-1 hover:text-gray-900 text-left"
                      >
                        Status
                        {sortField === 'status' ? (
                          sortDirection === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                        ) : (
                          <ArrowUpDown className="w-3 h-3 opacity-50" />
                        )}
                      </button>
                      <div>{selectedMappingPlatform === 'github' ? 'GitHub User' : 'Slack User'} 
                        <span className="text-xs text-gray-500 block">Click + to add missing</span>
                      </div>
                      <button
                        onClick={() => handleSort('method')}
                        className="flex items-center gap-1 hover:text-gray-900 text-left"
                      >
                        Method
                        {sortField === 'method' ? (
                          sortDirection === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                        ) : (
                          <ArrowUpDown className="w-3 h-3 opacity-50" />
                        )}
                      </button>
                    </div>
                  </div>
                  <div className="divide-y max-h-96 overflow-y-auto">
                    {sortedMappings.length > 0 ? sortedMappings.map((mapping) => {
                      return (
                      <div key={mapping.id} className="px-4 py-3">
                        <div className="grid grid-cols-4 gap-4 text-sm">
                          <div className="font-medium" title={mapping.source_identifier}>
                            <div className="truncate">
                              {mapping.source_name ? (
                                <>
                                  <span className="font-semibold">{mapping.source_name}</span>
                                  <div className="text-xs text-gray-500 truncate">{mapping.source_identifier}</div>
                                </>
                              ) : (
                                mapping.source_identifier
                              )}
                            </div>
                          </div>
                          <div className="space-y-1">
                            {mapping.mapping_successful ? (
                              <Badge variant="default" className="bg-green-100 text-green-800 border-green-200">
                                <CheckCircle className="w-3 h-3 mr-1" />
                                Success
                              </Badge>
                            ) : (
                              <Badge variant="destructive" className="bg-red-100 text-red-800 border-red-200">
                                <AlertCircle className="w-3 h-3 mr-1" />
                                Failed
                              </Badge>
                            )}
                            <div className="text-xs text-gray-500">
                              {mapping.data_points_count ? (
                                <span>{mapping.data_points_count} data points</span>
                              ) : (
                                // Only show "No data" if GitHub was enabled in the analysis
                                mappingStats?.github_was_enabled && selectedMappingPlatform === 'github' ? (
                                  <span>No data</span>
                                ) : null
                              )}
                            </div>
                          </div>
                          <div className="truncate" title={mapping.target_identifier || mapping.error_message || ''}>
                            {(() => {
                              return mapping.target_identifier ? (
                                inlineEditingId === mapping.id ? (
                                  // Show edit form for existing mapping
                                  <div className="space-y-1">
                                    <div className="flex items-center space-x-2">
                                      <input
                                        type="text"
                                        value={inlineEditingValue}
                                        onChange={(e) => handleInlineValueChange(e.target.value)}
                                        placeholder={`Edit ${selectedMappingPlatform === 'github' ? 'GitHub' : 'Slack'} username`}
                                        className={`flex-1 px-2 py-1 text-xs border rounded focus:outline-none focus:ring-1 ${
                                          githubValidation?.valid === false 
                                            ? 'border-red-300 focus:ring-red-500' 
                                            : githubValidation?.valid === true
                                            ? 'border-green-300 focus:ring-green-500'
                                            : 'border-gray-300 focus:ring-blue-500'
                                        }`}
                                        autoFocus
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter') {
                                            saveEditedMapping(mapping.id, mapping.source_identifier)
                                          } else if (e.key === 'Escape') {
                                            cancelInlineEdit()
                                          }
                                        }}
                                      />
                                      <button
                                        onClick={() => {
                                          if (selectedMappingPlatform === 'github' && githubValidation?.valid !== true) {
                                            toast.error(`Cannot save invalid username: ${githubValidation?.message || 'Please enter a valid GitHub username'}`, {
                                              duration: 4000
                                            })
                                            return
                                          }
                                          saveEditedMapping(mapping.id, mapping.source_identifier)
                                        }}
                                        disabled={savingInlineMapping || validatingGithub}
                                        className={`p-1 hover:opacity-80 disabled:opacity-50 ${
                                          selectedMappingPlatform === 'github' && githubValidation?.valid !== true
                                            ? 'text-gray-400 cursor-not-allowed'
                                            : 'text-green-600 hover:text-green-700'
                                        }`}
                                        title="Save changes"
                                      >
                                        <CheckCircle className="w-4 h-4" />
                                      </button>
                                      <button
                                        onClick={cancelInlineEdit}
                                        disabled={savingInlineMapping}
                                        className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-50"
                                        title="Cancel"
                                      >
                                        <X className="w-4 h-4" />
                                      </button>
                                    </div>
                                    {/* Validation feedback */}
                                    {(validatingGithub || githubValidation) && (
                                      <div className="flex items-center gap-1 text-xs">
                                        {validatingGithub ? (
                                          <>
                                            <Loader2 className="w-3 h-3 animate-spin" />
                                            <span className="text-gray-500">Validating...</span>
                                          </>
                                        ) : githubValidation?.valid ? (
                                          <>
                                            <CheckCircle className="w-3 h-3 text-green-600" />
                                            <span className="text-green-600">{githubValidation.message}</span>
                                          </>
                                        ) : (
                                          <>
                                            <AlertCircle className="w-3 h-3 text-red-600" />
                                            <span className="text-red-600">{githubValidation?.message}</span>
                                          </>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  // Show existing mapping with manual indicator and edit button
                                  <div className="flex items-center gap-1 group">
                                    <span>{mapping.target_identifier}</span>
                                    {mapping.is_manual && (
                                      <Tooltip content="Manual mapping - will show data collection status after running an analysis">
                                        <Badge variant="outline" className="ml-1 text-xs bg-blue-50 text-blue-700 border-blue-200 cursor-help">
                                          Manual
                                        </Badge>
                                      </Tooltip>
                                    )}
                                    <button
                                      onClick={() => startEditExisting(mapping.id, mapping.target_identifier)}
                                      className="ml-1 p-1 text-gray-400 hover:text-blue-600 transition-colors"
                                      title="Edit mapping"
                                    >
                                      <Edit3 className="w-3 h-3" />
                                    </button>
                                  </div>
                                )
                              ) : inlineEditingId === mapping.id ? (
                              // Show inline edit form
                              <div className="space-y-1">
                                <div className="flex items-center space-x-2">
                                  <input
                                    type="text"
                                    value={inlineEditingValue}
                                    onChange={(e) => handleInlineValueChange(e.target.value)}
                                    placeholder={`Enter ${selectedMappingPlatform === 'github' ? 'GitHub' : 'Slack'} username`}
                                    className={`flex-1 px-2 py-1 text-xs border rounded focus:outline-none focus:ring-1 ${
                                      githubValidation?.valid === false 
                                        ? 'border-red-300 focus:ring-red-500' 
                                        : githubValidation?.valid === true
                                        ? 'border-green-300 focus:ring-green-500'
                                        : 'border-gray-300 focus:ring-blue-500'
                                    }`}
                                    autoFocus
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      saveInlineMapping(mapping.id, mapping.source_identifier)
                                    } else if (e.key === 'Escape') {
                                      cancelInlineEdit()
                                    }
                                  }}
                                />
                                <button
                                  onClick={() => {
                                    if (selectedMappingPlatform === 'github' && githubValidation?.valid !== true) {
                                      toast.error(`Cannot save invalid username: ${githubValidation?.message || 'Please enter a valid GitHub username'}`, {
                                        duration: 4000
                                      })
                                      return
                                    }
                                    saveInlineMapping(mapping.id, mapping.source_identifier)
                                  }}
                                  disabled={savingInlineMapping || validatingGithub}
                                  className={`p-1 hover:opacity-80 disabled:opacity-50 ${
                                    selectedMappingPlatform === 'github' && githubValidation?.valid !== true
                                      ? 'text-gray-400 cursor-not-allowed'
                                      : 'text-green-600 hover:text-green-700'
                                  }`}
                                  title={
                                    selectedMappingPlatform === 'github' && githubValidation?.valid !== true
                                      ? 'Enter a valid GitHub username to save'
                                      : 'Save'
                                  }
                                >
                                  <CheckCircle className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={cancelInlineEdit}
                                  disabled={savingInlineMapping}
                                  className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-50"
                                  title="Cancel"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                                </div>
                                {/* Validation feedback */}
                                {(validatingGithub || githubValidation) && (
                                  <div className="flex items-center gap-1 text-xs">
                                    {validatingGithub ? (
                                      <>
                                        <Loader2 className="w-3 h-3 animate-spin" />
                                        <span className="text-gray-500">Validating...</span>
                                      </>
                                    ) : githubValidation?.valid ? (
                                      <>
                                        <CheckCircle className="w-3 h-3 text-green-600" />
                                        <span className="text-green-600">{githubValidation.message}</span>
                                      </>
                                    ) : (
                                      <>
                                        <AlertCircle className="w-3 h-3 text-red-600" />
                                        <span className="text-red-600">{githubValidation?.message}</span>
                                      </>
                                    )}
                                  </div>
                                )}
                              </div>
                            ) : (
                              // Show clickable "Add username" area
                              <button
                                onClick={() => startInlineEdit(mapping.id)}
                                className="w-full text-left px-2 py-1 text-xs text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded border border-dashed border-gray-300 hover:border-blue-300 transition-colors flex items-center gap-2"
                                title={`Click to add ${selectedMappingPlatform === 'github' ? 'GitHub' : 'Slack'} username`}
                              >
                                <Plus className="w-3 h-3 flex-shrink-0" />
                                <span className="truncate">Click to add {selectedMappingPlatform === 'github' ? 'GitHub' : 'Slack'} username</span>
                              </button>
                            )
                            })()}
                          </div>
                          <div className="text-gray-600">
                            {mapping.is_manual ? (
                              <div className="flex items-center gap-1">
                                <Tooltip content="Manual mapping - will show data collection status after running an analysis">
                                  <span className="cursor-help">Manual</span>
                                </Tooltip>
                                <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                                  User Added
                                </Badge>
                              </div>
                            ) : (
                              mapping.mapping_method?.replace('_', ' ') || 'Auto-detected'
                            )}
                          </div>
                        </div>
                      </div>
                      )
                    }) : (
                      <div className="px-4 py-8 text-center text-gray-500">
                        No mapping data available yet. Run an analysis to see mapping results.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

        </SheetContent>
      </Sheet>

      {/* Reusable Mapping Drawer */}
      <MappingDrawer
        isOpen={mappingDrawerOpen}
        onClose={() => setMappingDrawerOpen(false)}
        platform={mappingDrawerPlatform}
        onRefresh={() => {
          // Optional: Refresh any parent data if needed
        }}
      />

      {/* Manual Mapping Management Dialog */}
      <Dialog open={showManualMappingDialog} onOpenChange={setShowManualMappingDialog}>
        <DialogContent className="max-w-5xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center space-x-2">
              <Users2 className="w-5 h-5" />
              <span>
                Manage {selectedManualMappingPlatform === 'github' ? 'GitHub' : 'Slack'} Manual Mappings
              </span>
            </DialogTitle>
            <DialogDescription>
              Create and manage manual user mappings for {selectedManualMappingPlatform === 'github' ? 'GitHub' : 'Slack'} platform correlations.
            </DialogDescription>
          </DialogHeader>

          {manualMappingStats && (
            <div className="space-y-6">
              {/* Statistics Cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card className="p-4">
                  <div className="flex items-center space-x-2">
                    <Database className="w-4 h-4 text-blue-600" />
                    <div>
                      <div className="text-2xl font-bold">{manualMappingStats.total_mappings}</div>
                      <div className="text-sm text-gray-600">Total Mappings</div>
                    </div>
                  </div>
                </Card>
                <Card className="p-4">
                  <div className="flex items-center space-x-2">
                    <Edit3 className="w-4 h-4 text-green-600" />
                    <div>
                      <div className="text-2xl font-bold text-green-600">
                        {manualMappingStats.manual_mappings}
                      </div>
                      <div className="text-sm text-gray-600">Manual</div>
                    </div>
                  </div>
                </Card>
                <Card className="p-4">
                  <div className="flex items-center space-x-2">
                    <Zap className="w-4 h-4 text-purple-600" />
                    <div>
                      <div className="text-2xl font-bold text-purple-600">
                        {manualMappingStats.auto_detected_mappings}
                      </div>
                      <div className="text-sm text-gray-600">Auto-Detected</div>
                    </div>
                  </div>
                </Card>
                <Card className="p-4">
                  <div className="flex items-center space-x-2">
                    <CheckCircle className="w-4 h-4 text-green-600" />
                    <div>
                      <div className="text-2xl font-bold text-green-600">
                        {Math.round(manualMappingStats.verification_rate * 100)}%
                      </div>
                      <div className="text-sm text-gray-600">Verified</div>
                    </div>
                  </div>
                </Card>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-between items-center">
                <Button 
                  onClick={() => {
                    setNewMappingForm({
                      source_platform: 'rootly',
                      source_identifier: '',
                      target_platform: selectedManualMappingPlatform || 'github',
                      target_identifier: ''
                    })
                    setNewMappingDialogOpen(true)
                  }}
                  className="flex items-center space-x-2"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add New Mapping</span>
                </Button>
                
                <Button 
                  variant="outline" 
                  onClick={() => selectedManualMappingPlatform && loadManualMappings(selectedManualMappingPlatform)}
                  disabled={loadingManualMappings}
                >
                  {loadingManualMappings ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <RotateCcw className="w-4 h-4 mr-2" />
                  )}
                  Refresh
                </Button>
              </div>

              {/* Mappings Table */}
              <div className="space-y-3">
                <h3 className="text-lg font-semibold">Current Mappings</h3>
                {manualMappings.length > 0 ? (
                  <div className="border rounded-lg overflow-hidden">
                    <div className="bg-gray-50 px-4 py-3 border-b">
                      <div className="grid grid-cols-6 gap-4 text-sm font-medium text-gray-600">
                        <div>Source Platform</div>
                        <div>Source Identifier</div>
                        <div>Target Identifier</div>
                        <div>Type</div>
                        <div>Status</div>
                        <div>Actions</div>
                      </div>
                    </div>
                    <div className="divide-y max-h-64 overflow-y-auto">
                      {manualMappings.map((mapping) => (
                        <div key={mapping.id} className="px-4 py-3">
                          <div className="grid grid-cols-6 gap-4 text-sm items-center">
                            <div className="font-medium">
                              {mapping.source_platform}
                            </div>
                            <div className="truncate" title={mapping.source_identifier}>
                              {mapping.source_identifier}
                            </div>
                            <div className="truncate" title={mapping.target_identifier}>
                              {editingMapping?.id === mapping.id ? (
                                <Input
                                  value={mapping.target_identifier}
                                  onChange={(e) => setEditingMapping({
                                    ...editingMapping,
                                    target_identifier: e.target.value
                                  })}
                                  className="h-8"
                                />
                              ) : (
                                mapping.target_identifier
                              )}
                            </div>
                            <div>
                              <Badge variant={mapping.mapping_type === 'manual' ? 'default' : 'secondary'}>
                                {mapping.mapping_type}
                              </Badge>
                            </div>
                            <div>
                              {mapping.is_verified ? (
                                <Badge variant="default" className="bg-green-100 text-green-800 border-green-200">
                                  <CheckCircle className="w-3 h-3 mr-1" />
                                  Verified
                                </Badge>
                              ) : (
                                <Badge variant="secondary">
                                  <Clock className="w-3 h-3 mr-1" />
                                  Pending
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center space-x-1">
                              {editingMapping?.id === mapping.id ? (
                                <>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => updateManualMapping(mapping.id, editingMapping.target_identifier)}
                                    className="h-8 w-8 p-0 text-green-600 hover:text-green-700"
                                  >
                                    <Check className="w-4 h-4" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => setEditingMapping(null)}
                                    className="h-8 w-8 p-0 text-gray-600 hover:text-gray-700"
                                  >
                                    <ArrowLeft className="w-4 h-4" />
                                  </Button>
                                </>
                              ) : (
                                <>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => setEditingMapping(mapping)}
                                    className="h-8 w-8 p-0 text-blue-600 hover:text-blue-700"
                                  >
                                    <Edit3 className="w-4 h-4" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => deleteManualMapping(mapping.id)}
                                    className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="border rounded-lg p-8 text-center text-gray-500">
                    <Users2 className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                    <h3 className="text-lg font-medium mb-2">No manual mappings yet</h3>
                    <p className="text-sm">Create your first manual mapping to get started.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowManualMappingDialog(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Manual Mapping Dialog */}
      <NewMappingDialog
        open={newMappingDialogOpen}
        onOpenChange={setNewMappingDialogOpen}
        form={newMappingForm}
        onFormChange={setNewMappingForm}
        selectedPlatform={selectedManualMappingPlatform}
        onCreateMapping={createManualMapping}
      />

      {/* GitHub Disconnect Confirmation Dialog */}
      <GitHubDisconnectDialog
        open={githubDisconnectDialogOpen}
        onOpenChange={setGithubDisconnectDialogOpen}
        isDisconnecting={isDisconnectingGithub}
        onConfirmDisconnect={handleGitHubDisconnect}
      />

      {/* Slack Disconnect Confirmation Dialog */}
      <SlackDisconnectDialog
        open={slackDisconnectDialogOpen}
        onOpenChange={setSlackDisconnectDialogOpen}
        isDisconnecting={isDisconnectingSlack}
        onConfirmDisconnect={handleSlackDisconnect}
      />
      {/* Jira Disconnect Confirmation Dialog */}
      <JiraDisconnectDialog
        open={jiraDisconnectDialogOpen}
        onOpenChange={setJiraDisconnectDialogOpen}
        isDisconnecting={isDisconnectingJira}
        onConfirmDisconnect={async () => {
          await handleJiraDisconnect()
          setJiraDisconnectDialogOpen(false)
        }}
      />
      {/* Jira Workspace Selector Dialog */}
      <JiraWorkspaceSelector
        open={jiraWorkspaceSelectorOpen}
        onClose={() => setJiraWorkspaceSelectorOpen(false)}
        onWorkspaceSelected={async () => {
          // Reload Jira integration after workspace selection
          await loadJiraIntegration(true)
        }}
      />
      {/* Slack Survey Workspace Info & Disconnect Dialog */}
      <Dialog open={slackSurveyDisconnectDialogOpen} onOpenChange={setSlackSurveyDisconnectDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center">
              <Building className="w-5 h-5 mr-2 text-blue-600" />
              Registered Workspace
            </DialogTitle>
            <DialogDescription>
              Your Slack workspace connection details
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm font-medium text-gray-700">Workspace</p>
                <p className="text-sm text-gray-900 mt-1">{slackIntegration?.workspace_name || 'Unknown'}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-700">Connection</p>
                <p className="text-sm text-gray-900 mt-1 capitalize">
                  {slackIntegration?.connection_type === 'oauth' ? 'OAuth' : 'Token'}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-700">Connected</p>
                <p className="text-sm text-gray-900 mt-1">
                  {slackIntegration?.connected_at ? new Date(slackIntegration.connected_at).toLocaleDateString() : 'N/A'}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-700">Workspace ID</p>
                <p className="text-sm text-gray-900 mt-1 font-mono text-xs">
                  {slackIntegration?.workspace_id || 'N/A'}
                </p>
              </div>
            </div>
            <div className="pt-3 border-t border-gray-200">
              <p className="text-xs text-gray-600">
                💡 The <code className="bg-gray-100 px-1 rounded">/burnout-survey</code> command will only show analyses for your organization
              </p>
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => setSlackSurveyDisconnectDialogOpen(false)}
              className="w-full sm:w-auto"
            >
              Close
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setSlackSurveyDisconnectDialogOpen(false)
                setSlackSurveyConfirmDisconnectOpen(true)
              }}
              className="w-full sm:w-auto"
            >
              Disconnect
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Slack Survey Disconnect Confirmation Dialog - Step 2 */}
      <Dialog open={slackSurveyConfirmDisconnectOpen} onOpenChange={setSlackSurveyConfirmDisconnectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center text-red-600">
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              Disconnect Slack Survey Integration?
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to disconnect?
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-4">
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 space-y-2">
              <p className="text-sm font-medium text-red-900">This will:</p>
              <ul className="text-sm text-red-800 space-y-1 list-disc list-inside">
                <li>Disable the <code className="bg-red-100 px-1 rounded font-mono text-xs">/burnout-survey</code> command in your Slack workspace</li>
                <li>Stop all automated survey delivery</li>
                <li>Remove access to survey features for all team members</li>
              </ul>
            </div>
            <p className="text-sm text-gray-600">
              You will need to reconnect to re-enable these features.
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSlackSurveyConfirmDisconnectOpen(false)}
              disabled={isDisconnectingSlackSurvey}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                setIsDisconnectingSlackSurvey(true)
                try {
                  const authToken = localStorage.getItem('auth_token')
                  if (!authToken) {
                    toast.error('Authentication required')
                    return
                  }

                  const url = `${API_BASE}/integrations/slack/disconnect`

                  const response = await fetch(url, {
                    method: 'DELETE',
                    headers: {
                      'Authorization': `Bearer ${authToken}`
                    }
                  })

                  if (response.ok) {
                    const result = await response.json()

                    // Small delay to ensure backend has processed the disconnect
                    await new Promise(resolve => setTimeout(resolve, 300))

                    // Fetch updated Slack status without showing loading on other cards
                    const slackResponse = await fetch(`${API_BASE}/integrations/slack/status`, {
                      headers: { 'Authorization': `Bearer ${authToken}` }
                    })

                    if (slackResponse.ok) {
                      const slackData = await slackResponse.json()
                      setSlackIntegration(slackData.integration)
                      // Update cache
                      localStorage.setItem('slack_integration', JSON.stringify(slackData))
                      localStorage.setItem('all_integrations_timestamp', Date.now().toString())
                    }

                    // Close dialog and show success after state update
                    setSlackSurveyConfirmDisconnectOpen(false)

                    toast.success('Slack Survey integration disconnected', {
                      description: 'Your workspace has been disconnected successfully.',
                    })
                  } else {
                    const error = await response.json()
                    toast.error(error.detail || 'Failed to disconnect Slack')
                  }
                } catch (error) {
                  toast.error('Failed to disconnect Slack Survey integration')
                } finally {
                  setIsDisconnectingSlackSurvey(false)
                }
              }}
              disabled={isDisconnectingSlackSurvey}
            >
              {isDisconnectingSlackSurvey ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Disconnecting...
                </>
              ) : (
                'Yes, Disconnect'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <DeleteIntegrationDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        integration={integrationToDelete}
        isDeleting={isDeleting}
        onConfirmDelete={deleteIntegration}
        onCancel={() => {
          setDeleteDialogOpen(false)
          setIntegrationToDelete(null)
        }}
      />

      {/* Organization Management Modal */}
      <OrganizationManagementDialog
        open={showInviteModal}
        onOpenChange={setShowInviteModal}
        inviteEmail={inviteEmail}
        onInviteEmailChange={setInviteEmail}
        inviteRole={inviteRole}
        onInviteRoleChange={setInviteRole}
        isInviting={isInviting}
        onInvite={handleInvite}
        loadingOrgData={loadingOrgData}
        orgMembers={orgMembers}
        pendingInvitations={pendingInvitations}
        userInfo={userInfo}
        onRoleChange={handleRoleChange}
        onClose={() => {
          setShowInviteModal(false)
          setInviteEmail("")
          setInviteRole("member")
        }}
      />

      {/* Powered by Rootly AI Footer */}
      <div className="mt-12 pt-8 border-t border-gray-200 text-center">
        <a
          href="https://rootly.com"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex flex-col items-center space-y-1 hover:opacity-80 transition-opacity"
        >
          <span className="text-lg text-gray-600">powered by</span>
          <Image
            src="/images/rootly-ai-logo.png"
            alt="Rootly AI"
            width={200}
            height={80}
            className="h-12 w-auto"
          />
        </a>
      </div>

      {/* Team Members Drawer */}
      <Sheet open={teamMembersDrawerOpen} onOpenChange={handleDrawerClose}>
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto flex flex-col">
          <SheetHeader>
            <div className="flex items-start justify-between pr-10 gap-4">
              <div>
                <SheetTitle>Team Members</SheetTitle>
                <SheetDescription>
                  Sync will match {integrations.find(i => i.id.toString() === selectedOrganization)?.name || 'organization'} users with Enhanced Integrations mappings.
                  {syncedUsers.length > 0 && ` • ${syncedUsers.length} synced`}
                </SheetDescription>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <Button
                  onClick={refreshOnCallStatus}
                  disabled={refreshingOnCall || loadingSyncedUsers}
                  variant="outline"
                  size="sm"
                  className="h-9"
                  title="Refresh on-call status"
                >
                  {refreshingOnCall ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4" />
                  )}
                </Button>
                <Button
                  onClick={() => {
                    setSyncProgress(null) // Clear any previous sync progress
                    setShowSyncConfirmModal(true)
                  }}
                  disabled={loadingTeamMembers || loadingSyncedUsers}
                  className="bg-purple-600 hover:bg-purple-700 text-white"
                  size="default"
                >
                  {loadingTeamMembers ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Syncing...
                    </>
                  ) : loadingSyncedUsers ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Loading...
                    </>
                  ) : (
                    <>
                      <Users className="w-4 h-4 mr-2" />
                      Sync Members
                    </>
                  )}
                </Button>
              </div>
            </div>
          </SheetHeader>

          <div className="mt-6 space-y-4">
            {/* Show synced users only */}
            {loadingSyncedUsers ? (
              <div className="flex flex-col items-center justify-center py-12 space-y-4">
                <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
                <p className="text-sm text-gray-600">Loading team members...</p>
              </div>
            ) : syncedUsers.length > 0 ? (
              <div>
                {slackIntegration?.survey_enabled === true ? (
                  <>
                    <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-blue-900 font-medium">
                          ✓ Check users to send them automated burnout survey invitations via Slack
                        </p>
                        <div className="text-xs font-semibold text-blue-900 bg-blue-100 px-2 py-1 rounded">
                          {selectedRecipients.size || 0} / {syncedUsers.length} will receive surveys
                        </div>
                      </div>
                      {selectedOrganization && ['beta-rootly', 'beta-pagerduty'].includes(selectedOrganization) ? (
                        <p className="text-xs text-amber-700 mt-2 font-medium">
                          ℹ️ Beta integrations send surveys to all synced users. Add a personal integration to customize recipients.
                        </p>
                      ) : hasUnsavedChanges() && (
                        <p className="text-xs text-orange-600 mt-2 font-medium">
                          ⚠️ You have unsaved changes. Click "Save Changes" to apply.
                        </p>
                      )}
                    </div>

                    {/* Quick filter buttons */}
                    <div className="flex items-center gap-2 mb-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
                      <span className="text-xs font-medium text-gray-600">Quick Actions:</span>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          const oncallUserIds = syncedUsers
                            .filter(u => u.is_oncall)
                            .map(u => u.id)
                          setSelectedRecipients(new Set(oncallUserIds))
                        }}
                        className="h-7 text-xs"
                      >
                        Select On-Call ({syncedUsers.filter(u => u.is_oncall).length})
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          const slackConnectedUserIds = syncedUsers
                            .filter(u => u.platforms?.some((p: string) => p.toLowerCase() === 'slack'))
                            .map(u => u.id)
                          setSelectedRecipients(new Set(slackConnectedUserIds))
                        }}
                        className="h-7 text-xs"
                      >
                        Select All
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSelectedRecipients(new Set())
                        }}
                        className="h-7 text-xs"
                      >
                        Deselect All
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="mb-3 p-3 bg-gray-50 border border-gray-200 rounded-lg">
                    <p className="text-xs text-gray-600 font-medium">
                      ℹ️ Survey delivery is disabled. These users are synced and available for analysis only.
                    </p>
                  </div>
                )}
                <div className="space-y-2">
                  {syncedUsers
                    .slice((teamMembersPage - 1) * TEAM_MEMBERS_PER_PAGE, teamMembersPage * TEAM_MEMBERS_PER_PAGE)
                    .map((user: any) => {
                    const isSelected = selectedRecipients.has(user.id)
                    const surveyEnabled = slackIntegration?.survey_enabled === true
                    return (
                      <div
                        key={user.id}
                        onClick={() => {
                          if (!surveyEnabled) return
                          const newSelected = new Set(selectedRecipients)
                          if (isSelected) {
                            newSelected.delete(user.id)
                          } else {
                            newSelected.add(user.id)
                          }
                          setSelectedRecipients(newSelected)
                        }}
                        className={`bg-white border rounded-lg p-3 transition-all ${
                          surveyEnabled ? 'cursor-pointer' : ''
                        } ${
                          surveyEnabled && isSelected
                            ? 'border-purple-400 bg-purple-50'
                            : 'border-gray-200'
                        } ${
                          surveyEnabled && !isSelected ? 'hover:border-purple-300' : ''
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center space-x-3">
                            {/* Checkbox - only show if surveys enabled */}
                            {surveyEnabled && (
                              <div className="relative">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => {}} // Handled by parent div onClick
                                  className="w-4 h-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500 cursor-pointer"
                                />
                              </div>
                            )}

                            {/* Avatar with on-call indicator */}
                            <div className="relative">
                              <Avatar className="h-10 w-10">
                                <AvatarFallback className="bg-purple-100 text-purple-700 text-sm font-medium">
                                  {user.name?.substring(0, 2).toUpperCase() || user.email?.substring(0, 2).toUpperCase() || '??'}
                                </AvatarFallback>
                              </Avatar>
                              {user.is_oncall && (
                                <div
                                  className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-white"
                                  title="Currently on-call"
                                />
                              )}
                            </div>

                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-gray-900">
                                  {user.name || 'Unknown'}
                                </span>
                                {/* GitHub and Slack logos */}
                                {user.platforms?.map((platform: string) => {
                                  const platformLower = platform.toLowerCase()
                                  const isGitHub = platformLower === 'github'
                                  const isSlack = platformLower === 'slack'
                                  const isJira = platformLower === 'jira'

                                  if (isGitHub || isSlack || isJira) {
                                    return (
                                      <div
                                        key={platform}
                                        className="flex items-center justify-center w-4 h-4"
                                        title={platform}
                                      >
                                        <Image
                                          src={isGitHub ? '/images/github-logo.png' : isSlack ? '/images/slack-logo.png' : '/images/jira-logo.png'}
                                          alt={platform}
                                          width={14}
                                          height={14}
                                          className="object-contain"
                                        />
                                      </div>
                                    )
                                  }
                                  return null
                                })}
                                {user.is_oncall && (
                                  <Badge className="text-xs bg-green-100 text-green-700 border-green-300">
                                    On-Call
                                  </Badge>
                                )}
                              </div>
                              <div className="text-xs text-gray-600">
                                {user.email}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center space-x-1">
                            {/* Rootly and PagerDuty badges */}
                            {user.platforms?.map((platform: string) => {
                              const platformLower = platform.toLowerCase()
                              const isPagerDuty = platformLower === 'pagerduty'
                              const isRootly = platformLower === 'rootly'

                              if (isPagerDuty || isRootly) {
                                return (
                                  <Badge
                                    key={platform}
                                    variant="secondary"
                                    className={`text-xs ${
                                      isPagerDuty ? 'bg-green-100 text-green-700 border-green-300' :
                                      isRootly ? 'bg-purple-100 text-purple-700 border-purple-300' :
                                      ''
                                    }`}
                                  >
                                    {platform}
                                  </Badge>
                                )
                              }
                              return null
                            })}
                          </div>
                        </div>
                      {/* GitHub username section - always show, with edit capability */}
                      <div className="pl-13 mt-2" onClick={(e) => e.stopPropagation()}>
                        {editingUserId === user.id ? (
                          // Edit mode
                          <div className="flex items-center space-x-2">
                            <Select
                              value={editingUsername}
                              onValueChange={setEditingUsername}
                              disabled={savingUsername}
                            >
                              <SelectTrigger className="h-8 text-xs flex-1">
                                <SelectValue placeholder="Select GitHub username..." />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__clear__">
                                  <span className="text-gray-400 italic">Clear mapping</span>
                                </SelectItem>
                                {githubOrgMembers.length > 0 ? (
                                  githubOrgMembers.map(username => (
                                    <SelectItem key={username} value={username}>
                                      {username}
                                    </SelectItem>
                                  ))
                                ) : (
                                  <div className="text-xs text-gray-400 p-2">
                                    {loadingOrgMembers ? 'Loading...' : 'No GitHub members found'}
                                  </div>
                                )}
                              </SelectContent>
                            </Select>
                            <Button
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation()
                                saveGitHubUsername(user.id)
                              }}
                              disabled={savingUsername}
                              className="h-8 px-2"
                            >
                              {savingUsername ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <Check className="w-3 h-3" />
                              )}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={(e) => {
                                e.stopPropagation()
                                cancelEditingGitHubUsername()
                              }}
                              disabled={savingUsername}
                              className="h-8 px-2"
                            >
                              <X className="w-3 h-3" />
                            </Button>
                          </div>
                        ) : (
                          // Display mode
                          <div className="flex items-center justify-between text-xs">
                            <div className="text-gray-500 flex items-center gap-2">
                              <span>GitHub: {user.github_username ? (
                                <span className="font-mono text-gray-700">{user.github_username}</span>
                              ) : (
                                <span className="text-gray-400 italic">Not mapped</span>
                              )}</span>
                              {user.github_is_manual && user.github_username && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                                  Manual
                                </span>
                              )}
                            </div>
                            {githubIntegration && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  startEditingGitHubUsername(user.id, user.github_username)
                                }}
                                className="h-6 px-2 text-gray-400 hover:text-gray-700"
                              >
                                <Edit3 className="w-3 h-3" />
                              </Button>
                            )}
                          </div>
                        )}

                        {/* Jira mapping section - always show if Jira connected */}
                        {jiraIntegration && (
                          <div className="pl-13 mt-2" onClick={(e) => e.stopPropagation()}>
                            {editingJiraUserId === user.id ? (
                              // Jira Edit mode
                              <div className="flex items-center space-x-2">
                                <Select
                                  value={editingJiraAccountId}
                                  onValueChange={setEditingJiraAccountId}
                                  disabled={savingJiraMapping}
                                >
                                  <SelectTrigger className="h-8 text-xs flex-1">
                                    <SelectValue placeholder="Select Jira user..." />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="__clear__">
                                      <span className="text-gray-400 italic">Clear mapping</span>
                                    </SelectItem>
                                    {jiraUsers.length > 0 ? (
                                      jiraUsers.map((jiraUser) => (
                                        <SelectItem key={jiraUser.account_id} value={jiraUser.account_id}>
                                          <div className="space-y-0.5">
                                            <div className="font-medium">{jiraUser.display_name}</div>
                                            <div className="text-xs text-gray-500">
                                              {jiraUser.email ? jiraUser.email : '<no-email>'}
                                            </div>
                                          </div>
                                        </SelectItem>
                                      ))
                                    ) : (
                                      <div className="text-xs text-gray-400 p-2">
                                        {loadingJiraUsers ? 'Loading...' : 'No Jira users found'}
                                      </div>
                                    )}
                                  </SelectContent>
                                </Select>
                                <Button
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    saveJiraMapping(user.id)
                                  }}
                                  disabled={savingJiraMapping}
                                  className="h-8 px-2"
                                >
                                  {savingJiraMapping ? (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                  ) : (
                                    <Check className="w-3 h-3" />
                                  )}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    cancelEditingJiraMapping()
                                  }}
                                  disabled={savingJiraMapping}
                                  className="h-8 px-2"
                                >
                                  <X className="w-3 h-3" />
                                </Button>
                              </div>
                            ) : (
                              // Jira Display mode
                              <div className="flex items-center justify-between text-xs">
                                <div className="text-gray-500">
                                  Jira: {user.jira_account_id ? (
                                    <div className="space-y-0.5">
                                      <div className="font-mono text-gray-700">
                                        {jiraUsers.find(u => u.account_id === user.jira_account_id)?.display_name ||
                                         user.jira_account_id.substring(0, 8) + '...'}
                                      </div>
                                      {user.jira_email ? (
                                        <div className="text-xs text-gray-500">{user.jira_email}</div>
                                      ) : (
                                        <div className="text-xs text-gray-400">&lt;no-email&gt;</div>
                                      )}
                                    </div>
                                  ) : (
                                    <span className="text-gray-400 italic">Not mapped</span>
                                  )}
                                </div>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    startEditingJiraMapping(user.id, user.jira_account_id)
                                  }}
                                  className="h-6 px-2 text-gray-400 hover:text-gray-700"
                                >
                                  <Edit3 className="w-3 h-3" />
                                </Button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    )
                  })}
                </div>

                {/* Pagination Controls */}
                {(() => {
                  const totalPages = Math.ceil(syncedUsers.length / TEAM_MEMBERS_PER_PAGE)
                  const startIndex = (teamMembersPage - 1) * TEAM_MEMBERS_PER_PAGE + 1
                  const endIndex = Math.min(teamMembersPage * TEAM_MEMBERS_PER_PAGE, syncedUsers.length)

                  return totalPages > 1 ? (
                    <div className="flex items-center justify-between mt-3 pt-3 border-t">
                      <div className="text-sm text-gray-600">
                        Showing {startIndex}-{endIndex} of {syncedUsers.length} members
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="default"
                          size="sm"
                          onClick={() => setTeamMembersPage(teamMembersPage - 1)}
                          disabled={teamMembersPage === 1}
                          className="bg-black text-white hover:bg-gray-800 disabled:bg-gray-300 disabled:text-gray-500"
                        >
                          <ChevronLeft className="w-4 h-4 mr-1" />
                          Previous
                        </Button>
                        <span className="text-sm px-3">
                          Page {teamMembersPage} of {totalPages}
                        </span>
                        <Button
                          variant="default"
                          size="sm"
                          onClick={() => setTeamMembersPage(teamMembersPage + 1)}
                          disabled={teamMembersPage === totalPages}
                          className="bg-black text-white hover:bg-gray-800 disabled:bg-gray-300 disabled:text-gray-500"
                        >
                          Next
                          <ChevronRight className="w-4 h-4 ml-1" />
                        </Button>
                      </div>
                    </div>
                  ) : null
                })()}
              </div>
            ) : (
              <div className="text-center py-12 text-gray-500">
                <Users className="w-12 h-12 mx-auto mb-4 opacity-40" />
                <p className="text-sm font-medium mb-2">No team members synced yet</p>
                <p className="text-xs">Close this drawer and click "Sync Members" to add team members who can submit surveys</p>
              </div>
            )}
          </div>

          {/* Sticky Footer with Save/Cancel buttons */}
          {selectedOrganization && !['beta-rootly', 'beta-pagerduty'].includes(selectedOrganization) && hasUnsavedChanges() && (
            <div className="sticky bottom-0 left-0 right-0 border-t bg-white p-4 mt-auto">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm text-orange-600 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" />
                  <span>You have unsaved changes ({Math.abs(selectedRecipients.size - savedRecipients.size)} member{Math.abs(selectedRecipients.size - savedRecipients.size) !== 1 ? 's' : ''} updated)</span>
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={discardRecipientChanges}
                    disabled={savingRecipients}
                    variant="outline"
                    size="default"
                  >
                    <X className="w-4 h-4 mr-2" />
                    Cancel
                  </Button>
                  <Button
                    onClick={saveSurveyRecipients}
                    disabled={savingRecipients}
                    variant="default"
                    size="default"
                    className="bg-purple-600 hover:bg-purple-700"
                  >
                    {savingRecipients ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Check className="w-4 h-4 mr-2" />
                        Save Changes
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Manual Survey Delivery Modal */}
      <ManualSurveyDeliveryModal
        isOpen={showManualSurveyModal}
        onClose={() => setShowManualSurveyModal(false)}
        onSuccess={() => {
          // Refresh notifications or show success message
          toast.success("Survey delivery initiated successfully")
        }}
      />

      {/* Sync Confirmation Modal */}
      <Dialog open={showSyncConfirmModal} onOpenChange={(open) => {
        if (!syncProgress?.isLoading) {
          setShowSyncConfirmModal(open)
          if (!open) {
            // Reset sync progress when closing modal
            setSyncProgress(null)
          }
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {syncProgress?.isLoading ? 'Syncing Team Members...' : 'Sync Team Members'}
            </DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-3 text-left">
                {syncProgress?.results ? (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <CheckCircle className="w-6 h-6 text-green-600" />
                      <div className="flex-1">
                        <div className="text-lg font-semibold text-gray-900">{syncProgress.stage}</div>
                        <div className="text-sm text-gray-600">{syncProgress.details}</div>
                      </div>
                    </div>

                    <div className="bg-gray-50 border border-gray-200 rounded-md p-4 space-y-3">
                      <div className="font-semibold text-gray-900 text-base">Sync Results</div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between py-2 border-b border-gray-200">
                          <span className="text-sm text-gray-700">New users synced</span>
                          <span className="font-semibold text-gray-900">{syncProgress.results.created}</span>
                        </div>
                        <div className="flex items-center justify-between py-2 border-b border-gray-200">
                          <span className="text-sm text-gray-700">Existing users updated</span>
                          <span className="font-semibold text-gray-900">{syncProgress.results.updated}</span>
                        </div>
                        {syncProgress.results.github_matched !== undefined && (
                          <div className="flex items-center justify-between py-2 border-b border-gray-200">
                            <span className="text-sm text-gray-700">
                              GitHub accounts matched
                              {syncProgress.results.github_total !== undefined && (
                                <span className="text-xs text-gray-500 ml-1">
                                  ({syncProgress.results.github_matched} new, {syncProgress.results.github_total} total)
                                </span>
                              )}
                            </span>
                            <span className="font-semibold text-gray-900">
                              {syncProgress.results.github_total !== undefined
                                ? syncProgress.results.github_total
                                : syncProgress.results.github_matched}
                            </span>
                          </div>
                        )}
                        {syncProgress.results.slack_synced !== undefined && (
                          <div className="flex items-center justify-between py-2 border-b border-gray-200">
                            <span className="text-sm text-gray-700">Slack accounts matched</span>
                            <span className="font-semibold text-gray-900">{syncProgress.results.slack_synced}</span>
                          </div>
                        )}
                        {syncProgress.results.jira_matched !== undefined && (
                          <div className="flex items-center justify-between py-2 border-b border-gray-200">
                            <span className="text-sm text-gray-700">Jira accounts matched</span>
                            <span className="font-semibold text-gray-900">{syncProgress.results.jira_matched}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex justify-end">
                      <Button
                        onClick={() => {
                          setShowSyncConfirmModal(false)
                          setSyncProgress(null)
                        }}
                        className="bg-purple-600 hover:bg-purple-700"
                      >
                        Done
                      </Button>
                    </div>
                  </div>
                ) : syncProgress?.isLoading ? (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <Loader2 className="w-5 h-5 animate-spin text-purple-600" />
                      <div className="flex-1">
                        <div className="font-medium text-gray-900">{syncProgress.stage}</div>
                        <div className="text-sm text-gray-600">{syncProgress.details}</div>
                      </div>
                    </div>

                    <div className="bg-purple-50 border border-purple-200 rounded-md p-3">
                      <span className="text-sm text-purple-800">Please wait while we sync your team members. This may take a few moments...</span>
                    </div>
                  </div>
                ) : (
                  <>
                    <span>This will sync your team members from {integrations.find(i => i.id.toString() === selectedOrganization)?.name || 'your integration'}.</span>

                    <div className="bg-blue-50 border border-blue-200 rounded-md p-3 space-y-2">
                      <div className="font-medium text-blue-900">What happens during sync:</div>
                      <ul className="list-disc list-inside space-y-1 text-sm text-blue-800">
                        {integrations.find(i => i.id.toString() === selectedOrganization)?.platform === 'rootly' && (
                          <li><strong>Incident Responders Only:</strong> Only users with Incident Response (IR) roles will be synced (admin, owner, user). Observers and users without IR access are excluded.</li>
                        )}
                        {integrations.find(i => i.id.toString() === selectedOrganization)?.platform === 'pagerduty' && (
                          <li><strong>All Users:</strong> All users from your PagerDuty account will be synced.</li>
                        )}
                        <li><strong>Clean Sync:</strong> All existing users from this integration will be removed and replaced with the fresh list.</li>
                        <li><strong>Used in Analysis:</strong> These synced users will be used when running burnout analysis.</li>
                        <li><strong>Cross-Platform Matching:</strong> Users will be matched across GitHub, Slack, and Jira accounts when possible.</li>
                      </ul>
                    </div>

                    <span className="text-sm text-gray-600 block">
                      {syncedUsers.length > 0
                        ? `This will replace your current ${syncedUsers.length} synced users.`
                        : 'This is your first sync for this integration.'}
                    </span>
                  </>
                )}
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            {!syncProgress?.isLoading && !syncProgress?.results && (
              <>
                <Button variant="outline" onClick={() => setShowSyncConfirmModal(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={performTeamSync}
                  className="bg-purple-600 hover:bg-purple-700"
                >
                  Sync Now
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Team Sync Prompt - floating bottom-right */}
      <TeamSyncPrompt
        isVisible={showSyncPrompt}
        message={syncPromptMessage}
        onSync={handleSyncPromptAction}
        onDismiss={handleDismissSyncPrompt}
      />
    </div>
  )
}