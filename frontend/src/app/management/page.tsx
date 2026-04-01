"use client"

import { useState, useEffect, useRef, useCallback, Suspense } from "react"
import { createPortal } from "react-dom"
import Image from "next/image"
import { useRouter, useSearchParams } from "next/navigation"
import { TopPanel } from "@/components/TopPanel"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Loader2,
  Search,
  Pencil,
  CheckCircle,
  AlertCircle,
  Users,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from "lucide-react"
import { API_BASE, type Integration } from "@/app/integrations/types"
import { UserMappingDrawer } from "./components/UserMappingDrawer"
import { OrganizationManagementDialog } from "@/app/integrations/dialogs/OrganizationManagementDialog"
import * as OrganizationHandlers from "@/app/integrations/handlers/organization-handlers"
import {
  getStoredSelectedOrganization,
  setStoredSelectedOrganization,
  subscribeToSelectedOrganization,
} from "@/lib/selected-organization"
import {
  fetchGithubUsers,
  fetchJiraUsers,
  fetchLinearUsers,
  fetchSlackUsers,
  updateUserCorrelation,
} from "./handlers/user-mapping-handlers"

const TEAM_MEMBERS_PER_PAGE = 10

// Type definition for synced users
interface SyncedUser {
  id: number
  email: string
  name?: string
  avatar_url?: string
  github_username?: string
  jira_account_id?: string
  jira_email?: string
  linear_user_id?: string
  linear_email?: string
  slack_user_id?: string
  on_call_status?: string
  is_oncall?: boolean
  role?: string
}

function TeamPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()

  // Organization selection state
  const [selectedOrganization, setSelectedOrganization] = useState<string>("")
  const [integrations, setIntegrations] = useState<Integration[]>([])
  const [loadingIntegrations, setLoadingIntegrations] = useState(true)
  const [viewMode, setViewMode] = useState<'organization' | 'company'>('organization')

  // Connected integrations state (to filter which integrations are currently active)
  const [connectedIntegrations, setConnectedIntegrations] = useState<Set<string>>(new Set())

  // Team management state (for Company tab)
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteRole, setInviteRole] = useState("member")
  const [isInviting, setIsInviting] = useState(false)
  const [orgMembers, setOrgMembers] = useState([])
  const [pendingInvitations, setPendingInvitations] = useState([])
  const [receivedInvitations, setReceivedInvitations] = useState([])
  const [loadingOrgData, setLoadingOrgData] = useState(false)
  const [userInfo, setUserInfo] = useState<any>(null)

  // Team members state
  const [syncedUsers, setSyncedUsers] = useState<SyncedUser[]>([])
  const [loadingSyncedUsers, setLoadingSyncedUsers] = useState(false)
  const [lastSyncInfo, setLastSyncInfo] = useState<{synced_at: string; synced_by: {id: number; name: string; email: string}} | null>(null)

  // Search state
  const [searchQuery, setSearchQuery] = useState("")

  // Sort state
  const [sortBy, setSortBy] = useState<'name' | 'email' | 'oncall' | null>(null)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')

  // Cache to track which integrations have already been loaded
  const syncedUsersCache = useRef<Map<string, SyncedUser[]>>(new Map())
  const recipientsCache = useRef<Map<string, Set<number>>>(new Map())
  const lastSyncInfoCache = useRef<Map<string, {synced_at: string; synced_by: {id: number; name: string; email: string}} | null>>(new Map())
  const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const isMountedRef = useRef(true)
  const mappingDropdownRef = useRef<HTMLDivElement>(null)
  const hasShownSyncModal = useRef(false)
  const prevOrganizationRef = useRef<string>("")

  // Survey recipient selection state
  const [selectedRecipients, setSelectedRecipients] = useState<Set<number>>(new Set())
  const [savedRecipients, setSavedRecipients] = useState<Set<number>>(new Set())
  const [savingRecipients, setSavingRecipients] = useState(false)

  // Pagination
  const [currentPage, setCurrentPage] = useState(1)

  // User mapping drawer state
  const [selectedUserForMapping, setSelectedUserForMapping] = useState<any | null>(null)
  const [mappingDrawerOpen, setMappingDrawerOpen] = useState(false)

  // Inline mapping dropdown state
  const [openMappingUserId, setOpenMappingUserId] = useState<number | null>(null)
  const [expandedIntegration, setExpandedIntegration] = useState<string | null>(null)
  const [popupPosition, setPopupPosition] = useState<{ top?: number; bottom?: number; right: number } | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const [githubUsers, setGithubUsers] = useState<string[]>([])
  const [jiraUsers, setJiraUsers] = useState<any[]>([])
  const [linearUsers, setLinearUsers] = useState<any[]>([])
  const [slackUsers, setSlackUsers] = useState<any[]>([])
  const [loadingIntegrationUsers, setLoadingIntegrationUsers] = useState(false)
  const [integrationSearchQuery, setIntegrationSearchQuery] = useState("")

  // Sync confirmation modal state
  const [showSyncConfirmModal, setShowSyncConfirmModal] = useState(false)
  const [syncProgress, setSyncProgress] = useState<{
    stage: string
    details: string
    isLoading: boolean
    error?: string
    results?: {
      created?: number
      updated?: number
      skipped?: number
      github_matched?: number
      jira_matched?: number
      linear_matched?: number
      slack_matched?: number
      slack_skipped?: number
    }
  } | null>(null)

  const getSelectedIntegrationLabel = () => {
    const selectedIntegration = integrations.find((integration) => String(integration.id) === selectedOrganization)
    if (selectedIntegration?.platform === "pagerduty") return "PagerDuty"
    if (selectedIntegration?.platform === "rootly") return "Rootly"
    return "integration"
  }

  const parseSyncErrorMessage = async (response: Response) => {
    let detail = `Sync failed with status ${response.status}`
    const contentType = response.headers.get("content-type") || ""

    try {
      if (contentType.includes("application/json")) {
        const errorData = await response.json()
        detail = errorData?.detail || errorData?.message || detail
      } else {
        const text = await response.text()
        if (text) detail = text
      }
    } catch {
      // Fall back to the default detail message when the error body can't be parsed.
    }

    const normalizedDetail = detail.toLowerCase()
    const integrationLabel = getSelectedIntegrationLabel()

    if (
      response.status === 401 ||
      normalizedDetail.includes("api request failed: 401") ||
      normalizedDetail.includes("token is expired or invalid") ||
      (normalizedDetail.includes("token") && normalizedDetail.includes("expired")) ||
      (normalizedDetail.includes("token") && normalizedDetail.includes("invalid"))
    ) {
      return integrationLabel === "integration"
        ? "The integration token is expired or invalid. Please reconnect it and try again."
        : `The ${integrationLabel} token is expired or invalid. Please reconnect ${integrationLabel} and try again.`
    }

    return detail
  }

  // Check if there are unsaved changes
  const hasUnsavedChanges = () => {
    if (selectedRecipients.size !== savedRecipients.size) return true
    for (const id of Array.from(selectedRecipients)) {
      if (!savedRecipients.has(id)) return true
    }
    return false
  }

  // Load integrations on mount (both Rootly and PagerDuty)
  useEffect(() => {
    const fetchIntegrations = async () => {
      const authToken = localStorage.getItem("auth_token")
      if (!authToken) {
        setLoadingIntegrations(false)
        return
      }

      try {
        // Fetch both Rootly and PagerDuty integrations in parallel
        const [rootlyResponse, pagerdutyResponse] = await Promise.all([
          fetch(`${API_BASE}/rootly/integrations`, {
            headers: { Authorization: `Bearer ${authToken}` },
          }).catch(() => null),
          fetch(`${API_BASE}/pagerduty/integrations`, {
            headers: { Authorization: `Bearer ${authToken}` },
          }).catch(() => null),
        ])

        let allIntegrations: Integration[] = []

        if (rootlyResponse?.ok) {
          const data = await rootlyResponse.json()
          const rootlyIntegrations = (data.integrations || []).map((i: Integration) => ({ ...i, platform: 'rootly' as const }))
          allIntegrations = [...allIntegrations, ...rootlyIntegrations]
        }

        if (pagerdutyResponse?.ok) {
          const data = await pagerdutyResponse.json()
          const pdIntegrations = (data.integrations || []).map((i: Integration) => ({ ...i, platform: 'pagerduty' as const }))
          allIntegrations = [...allIntegrations, ...pdIntegrations]
        }

        setIntegrations(allIntegrations)

        // Restore selected org, with validation against actual integration IDs
        const urlOrgId = searchParams.get("org")
        const saved = getStoredSelectedOrganization()
        const matchesIntegration = (id: string) => allIntegrations.some(i => i.id.toString() === id)

        let nextSelectedOrganization: string | null = null

        if (urlOrgId && matchesIntegration(urlOrgId)) {
          nextSelectedOrganization = urlOrgId
        } else if (saved && matchesIntegration(saved)) {
          nextSelectedOrganization = saved
        } else if (allIntegrations.length > 0) {
          nextSelectedOrganization = allIntegrations[0].id.toString()
        }

        if (nextSelectedOrganization) {
          setSelectedOrganization(nextSelectedOrganization)
          setStoredSelectedOrganization(nextSelectedOrganization, { emit: false })
        }
      } catch (error) {
        console.error("Failed to load integrations:", error)
      } finally {
        setLoadingIntegrations(false)
      }
    }

    fetchIntegrations()
  }, [searchParams])

  useEffect(() => {
    return subscribeToSelectedOrganization((value) => {
      if (!value) return
      if (!integrations.some((integration) => integration.id.toString() === value)) return
      setSelectedOrganization((current) => (current === value ? current : value))
    })
  }, [integrations])

  // Handle view parameter from URL
  useEffect(() => {
    const viewParam = searchParams.get("view")
    if (viewParam === "team") {
      setViewMode("company")
    } else if (viewParam === "organization") {
      setViewMode("organization")
    }
  }, [searchParams])

  // Load connected integration statuses
  useEffect(() => {
    const fetchConnectedIntegrations = async () => {
      const authToken = localStorage.getItem("auth_token")
      if (!authToken) return

      try {
        const connected = new Set<string>()

        // Check each integration's status
        const integrationTypes = ['github', 'jira', 'linear', 'slack']

        for (const integrationType of integrationTypes) {
          try {
            const response = await fetch(`${API_BASE}/integrations/${integrationType}/status`, {
              headers: { Authorization: `Bearer ${authToken}` },
            })

            if (response.ok) {
              const data = await response.json()
              if (data.connected) {
                connected.add(integrationType)
              }
            }
          } catch (error) {
            // Continue checking other integrations if one fails
            console.debug(`Failed to check ${integrationType} status:`, error)
          }
        }

        setConnectedIntegrations(connected)
      } catch (error) {
        console.error("Failed to fetch connected integrations:", error)
      }
    }

    fetchConnectedIntegrations()
  }, [])

  // Clear integration users data and reset pagination when organization changes
  useEffect(() => {
    setGithubUsers([])
    setJiraUsers([])
    setLinearUsers([])
    setSlackUsers([])
    setCurrentPage(1)  // Reset to page 1 when switching orgs
  }, [selectedOrganization])

  // Cleanup timeout on unmount and mark component as unmounted
  useEffect(() => {
    return () => {
      isMountedRef.current = false
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current)
        syncTimeoutRef.current = null
      }
    }
  }, [])


  // Auto-open sync modal if redirected from integrations page (only once)
  useEffect(() => {
    const syncParam = searchParams.get("sync")
    if (syncParam === "true" && selectedOrganization && !loadingIntegrations && !hasShownSyncModal.current) {
      setShowSyncConfirmModal(true)
      hasShownSyncModal.current = true
    }
  }, [searchParams, selectedOrganization, loadingIntegrations])

  // Load user info for team management
  useEffect(() => {
    const userName = localStorage.getItem('user_name')
    const userEmail = localStorage.getItem('user_email')
    const userRole = localStorage.getItem('user_role')
    const userId = localStorage.getItem('user_id')
    const userOrgId = localStorage.getItem('user_organization_id')

    if (userName && userEmail) {
      const parsedOrgId = userOrgId ? parseInt(userOrgId, 10) : null
      setUserInfo({
        name: userName,
        email: userEmail,
        role: userRole,
        id: userId,
        organization_id: parsedOrgId && !isNaN(parsedOrgId) ? parsedOrgId : null
      })
    }
  }, [])

  // Load organization data and reset pagination when switching view modes
  useEffect(() => {
    setCurrentPage(1)  // Reset to page 1 when switching views
    if (viewMode === 'company') {
      loadOrganizationData()
    }
  }, [viewMode])

  // Close mapping dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (mappingDropdownRef.current && !mappingDropdownRef.current.contains(event.target as Node)) {
        setOpenMappingUserId(null)
        setExpandedIntegration(null)
        setPopupPosition(null)
        // Keep integration users data cached for performance and to maintain logo visibility
      }
    }

    if (openMappingUserId !== null) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [openMappingUserId])

  // Close mapping dropdown when scrolling (but not when scrolling inside the popup)
  useEffect(() => {
    const handleScroll = (event: Event) => {
      // Don't close if scrolling inside the popup
      if (mappingDropdownRef.current && mappingDropdownRef.current.contains(event.target as Node)) {
        return
      }

      if (openMappingUserId !== null) {
        setOpenMappingUserId(null)
        setExpandedIntegration(null)
        setPopupPosition(null)
        // Keep integration users data cached for performance and to maintain logo visibility
      }
    }

    if (openMappingUserId !== null) {
      window.addEventListener('scroll', handleScroll, true) // Use capture phase to catch all scrolls
      return () => window.removeEventListener('scroll', handleScroll, true)
    }
  }, [openMappingUserId])

  // Reset search query when switching integrations or users to prevent stale search state
  useEffect(() => {
    setIntegrationSearchQuery("")
  }, [expandedIntegration, openMappingUserId])

  // Load integration users data on page load to show logos immediately
  useEffect(() => {
    if (!selectedOrganization || viewMode !== 'organization') return

    // Check if organization changed
    const orgChanged = prevOrganizationRef.current !== selectedOrganization
    prevOrganizationRef.current = selectedOrganization

    // Load all connected integration users in parallel
    const loadAllIntegrationUsers = async () => {
      const promises = []

      // If organization changed, always load. Otherwise, only load if not already loaded
      if (connectedIntegrations.has('github') && (orgChanged || githubUsers.length === 0)) {
        promises.push(loadGithubUsersForMapping())
      }
      if (connectedIntegrations.has('jira') && (orgChanged || jiraUsers.length === 0)) {
        promises.push(loadJiraUsersForMapping())
      }
      if (connectedIntegrations.has('linear') && (orgChanged || linearUsers.length === 0)) {
        promises.push(loadLinearUsersForMapping())
      }
      if (connectedIntegrations.has('slack') && (orgChanged || slackUsers.length === 0)) {
        promises.push(loadSlackUsersForMapping())
      }

      if (promises.length > 0) {
        await Promise.all(promises)
      }
    }

    loadAllIntegrationUsers()
  }, [selectedOrganization, connectedIntegrations, viewMode])

  // Pre-load all integration users when mapping popup opens (if not already loaded)
  useEffect(() => {
    if (!openMappingUserId || !selectedOrganization) return

    // Load all connected integration users in parallel
    const loadAllIntegrationUsers = async () => {
      const promises = []

      if (connectedIntegrations.has('github') && githubUsers.length === 0) {
        promises.push(loadGithubUsersForMapping())
      }
      if (connectedIntegrations.has('jira') && jiraUsers.length === 0) {
        promises.push(loadJiraUsersForMapping())
      }
      if (connectedIntegrations.has('linear') && linearUsers.length === 0) {
        promises.push(loadLinearUsersForMapping())
      }
      if (connectedIntegrations.has('slack') && slackUsers.length === 0) {
        promises.push(loadSlackUsersForMapping())
      }

      if (promises.length > 0) {
        await Promise.all(promises)
      }
    }

    loadAllIntegrationUsers()
  }, [openMappingUserId, selectedOrganization, connectedIntegrations])

  const loadGithubUsersForMapping = async () => {
    if (!selectedOrganization) return
    setLoadingIntegrationUsers(true)
    try {
      const users = await fetchGithubUsers(selectedOrganization)
      setGithubUsers(users)
    } catch (error) {
      toast.error("Failed to load GitHub users")
    } finally {
      setLoadingIntegrationUsers(false)
    }
  }

  const loadJiraUsersForMapping = async () => {
    if (!selectedOrganization) return
    setLoadingIntegrationUsers(true)
    try {
      const users = await fetchJiraUsers(selectedOrganization)
      setJiraUsers(users || [])
    } catch (error) {
      console.error('Error loading Jira users:', error)
      toast.error("Failed to load Jira users")
      setJiraUsers([])
    } finally {
      setLoadingIntegrationUsers(false)
    }
  }

  const loadLinearUsersForMapping = async () => {
    if (!selectedOrganization) return
    setLoadingIntegrationUsers(true)
    try {
      const users = await fetchLinearUsers(selectedOrganization)
      setLinearUsers(users || [])
    } catch (error) {
      console.error('Error loading Linear users:', error)
      toast.error("Failed to load Linear users")
      setLinearUsers([])
    } finally {
      setLoadingIntegrationUsers(false)
    }
  }

  const loadSlackUsersForMapping = async () => {
    if (!selectedOrganization) return
    setLoadingIntegrationUsers(true)
    try {
      const users = await fetchSlackUsers(selectedOrganization)
      setSlackUsers(users || [])
    } catch (error) {
      console.error('Error loading Slack users:', error)
      toast.error("Failed to load Slack users")
      setSlackUsers([])
    } finally {
      setLoadingIntegrationUsers(false)
    }
  }

  const handleUserMapping = async (userId: number, integrationType: string, integrationUserId: string) => {
    try {
      // Build the updates object based on integration type
      const updates: any = {}
      if (integrationType === 'github') {
        updates.github_username = integrationUserId
      } else if (integrationType === 'jira') {
        updates.jira_account_id = integrationUserId
      } else if (integrationType === 'linear') {
        updates.linear_user_id = integrationUserId
      } else if (integrationType === 'slack') {
        updates.slack_user_id = integrationUserId
      }

      const success = await updateUserCorrelation(userId, updates)
      if (!success) {
        // updateUserCorrelation already showed an error toast
        return
      }

      toast.success("User mapping updated successfully")
      await fetchSyncedUsers(false, false, true) // Refresh the users list
      setOpenMappingUserId(null)
      setExpandedIntegration(null)
      // Keep integration users data cached for performance and to maintain logo visibility
    } catch (error) {
      toast.error("Failed to update user mapping")
    }
  }

  // Fetch synced users from database (memoized to avoid stale closures)
  const fetchSyncedUsers = useCallback(async (showToast = false, autoSync = false, forceRefresh = false) => {
    if (!selectedOrganization) return

    // Capture current organization to prevent race conditions
    const requestedOrg = selectedOrganization

    // Check cache first
    if (!forceRefresh && syncedUsersCache.current.has(requestedOrg)) {
      const cachedUsers = syncedUsersCache.current.get(requestedOrg)!
      setSyncedUsers(cachedUsers)

      // Restore cached last sync info
      if (lastSyncInfoCache.current.has(requestedOrg)) {
        setLastSyncInfo(lastSyncInfoCache.current.get(requestedOrg)!)
      } else {
        setLastSyncInfo(null)
      }

      if (recipientsCache.current.has(requestedOrg)) {
        const cachedRecipients = recipientsCache.current.get(requestedOrg)!
        const validUserIds = new Set(cachedUsers.map(u => u.id))
        const validCachedRecipients = new Set(
          Array.from(cachedRecipients).filter(id => validUserIds.has(id))
        )
        setSelectedRecipients(validCachedRecipients)
        setSavedRecipients(validCachedRecipients)
      }
      return
    }

    setLoadingSyncedUsers(true)
    const authToken = localStorage.getItem("auth_token")
    if (!authToken) {
      toast.error("Please log in")
      setLoadingSyncedUsers(false)
      return
    }

    try {
      const response = await fetch(
        `${API_BASE}/rootly/synced-users?integration_id=${requestedOrg}`,
        {
          headers: { Authorization: `Bearer ${authToken}` },
        }
      )

      // Check immediately after fetch completes
      if (requestedOrg !== selectedOrganization) {
        return
      }

      if (response.ok) {
        const data = await response.json()

        // Check again after JSON parsing to prevent race conditions
        if (requestedOrg !== selectedOrganization) {
          return
        }

        const users = data.users || []
        setSyncedUsers(users)
        syncedUsersCache.current.set(requestedOrg, users)

        // Cache last sync info
        const syncInfo = data.last_sync || null
        setLastSyncInfo(syncInfo)
        lastSyncInfoCache.current.set(requestedOrg, syncInfo)

        // Load saved recipients
        const recipientIds = new Set<number>(users.filter((u: any) => u.is_survey_recipient).map((u: any) => u.id as number))
        setSelectedRecipients(recipientIds)
        setSavedRecipients(recipientIds)
        recipientsCache.current.set(requestedOrg, recipientIds)

        if (showToast) {
          toast.success(`Loaded ${users.length} users`)
        }
      } else {
        toast.error("Failed to load users")
      }
    } catch (error) {
      console.error("Error fetching synced users:", error)
      toast.error("Error loading users")
    } finally {
      setLoadingSyncedUsers(false)
    }
  }, [selectedOrganization])

  // Auto-fetch synced users when organization changes (moved after fetchSyncedUsers definition)
  useEffect(() => {
    if (selectedOrganization) {
      fetchSyncedUsers(false, false, false)
    }
  }, [selectedOrganization, fetchSyncedUsers])

  // Perform full team sync with progress tracking
  const performTeamSync = async () => {
    try {
      setSyncProgress({ stage: "Starting sync...", details: "Preparing to sync users", isLoading: true })
      await new Promise(resolve => setTimeout(resolve, 300))

      setSyncProgress({ stage: "Fetching users...", details: "Retrieving users from API with IR role filtering", isLoading: true })

      const authToken = localStorage.getItem("auth_token")
      if (!authToken) {
        throw new Error("Please log in again to sync users.")
      }

      const response = await fetch(
        `${API_BASE}/rootly/integrations/${selectedOrganization}/sync-users`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${authToken}` },
        }
      )

      if (!response.ok) {
        throw new Error(await parseSyncErrorMessage(response))
      }

      const syncResults = await response.json()

      // Clear cache only after successful sync
      if (selectedOrganization) {
        syncedUsersCache.current.delete(selectedOrganization)
        lastSyncInfoCache.current.delete(selectedOrganization)
      }

      // Calculate unchanged users: total - created - updated - skipped
      // Note: backend's "skipped" means users with no email (invalid), not unchanged users
      const created = syncResults.stats?.created || 0
      const updated = syncResults.stats?.updated || 0
      const skipped = syncResults.stats?.skipped || 0
      const total = syncResults.stats?.total || 0
      const unchanged = Math.max(0, total - created - updated - skipped)

      setSyncProgress({
        stage: "Sync Complete!",
        details: "Your users have been successfully synced",
        isLoading: false,
        results: {
          created: syncResults.stats?.created,
          updated: syncResults.stats?.updated,
          skipped: unchanged, // Show unchanged count instead of backend's "skipped" (invalid users)
          github_matched: syncResults.stats?.github_matched,
          jira_matched: syncResults.stats?.jira_matched,
          linear_matched: syncResults.stats?.linear_matched,
          slack_matched: syncResults.stats?.slack_matched,
          slack_skipped: syncResults.stats?.slack_skipped,
        }
      })

      // Refresh the user list
      await fetchSyncedUsers(false, false, true)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to sync users. Please try again."
      setSyncProgress({
        stage: "Sync Failed",
        details: errorMessage,
        error: errorMessage,
        isLoading: false
      })
      toast.error(errorMessage)
    }
  }


  // Open mapping drawer
  const openMappingDrawer = (user: any) => {
    setSelectedUserForMapping(user)
    setMappingDrawerOpen(true)
  }

  const closeMappingDrawer = () => {
    setSelectedUserForMapping(null)
    setMappingDrawerOpen(false)
  }

  const handleMappingUpdated = async () => {
    // Refresh the user data to show updated mappings
    await fetchSyncedUsers(false, false, true)
  }

  // Team management handlers
  const handleInvite = async () => {
    return OrganizationHandlers.handleInvite(
      inviteEmail,
      inviteRole,
      setIsInviting,
      setInviteEmail,
      setInviteRole,
      () => {}, // No need to close modal since it's inline
      loadOrganizationData
    )
  }

  const handleRoleChange = async (userId: number, newRole: string) => {
    return OrganizationHandlers.handleRoleChange(userId, newRole, loadOrganizationData)
  }

  const loadOrganizationData = async () => {
    return OrganizationHandlers.loadOrganizationData(
      setLoadingOrgData,
      setOrgMembers,
      setPendingInvitations,
      setReceivedInvitations
    )
  }

  // Save recipient selections to database
  const saveRecipientSelections = async () => {
    if (!selectedOrganization) return

    setSavingRecipients(true)
    const authToken = localStorage.getItem("auth_token")
    if (!authToken) {
      toast.error("Please log in")
      setSavingRecipients(false)
      return
    }

    try {
      // Convert Set to Array and validate/filter for type safety
      const recipientIds = Array.from(selectedRecipients).filter(id =>
        typeof id === 'number' &&
        Number.isFinite(id) &&
        Number.isInteger(id) &&
        id > 0
      )

      // Check if any invalid IDs were filtered out
      if (recipientIds.length !== selectedRecipients.size) {
        console.warn('Some invalid recipient IDs were filtered out')
      }

      // Ensure we have valid IDs to send
      if (recipientIds.length === 0 && selectedRecipients.size > 0) {
        toast.error("No valid recipient IDs found")
        setSavingRecipients(false)
        return
      }

      const response = await fetch(
        `${API_BASE}/rootly/integrations/${selectedOrganization}/survey-recipients`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${authToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ recipient_ids: recipientIds }),
        }
      )

      if (response.ok) {
        setSavedRecipients(new Set(selectedRecipients))
        recipientsCache.current.set(selectedOrganization, new Set(selectedRecipients))
        toast.success("Survey recipients saved")
      } else {
        toast.error("Failed to save survey recipients")
      }
    } catch (error) {
      console.error("Error saving survey recipients:", error)
      toast.error("Error saving survey recipients")
    } finally {
      setSavingRecipients(false)
    }
  }

  // Find the currently selected integration (used for context elsewhere on the page)
  const selectedIntegration = selectedOrganization
    ? integrations.find(i => i.id.toString() === selectedOrganization)
    : null
  const getTeamScopeLabel = (integration: Integration) => {
    if (integration.platform !== "rootly") return null
    return `Team: ${integration.team_name || "All users"}`
  }

  // Check if any primary integration (Rootly or PagerDuty) exists
  // Since the integrations array only contains Rootly and PagerDuty entries, length > 0 is sufficient
  const hasPrimaryIntegration = integrations.length > 0

  // Filter and sort users
  const filteredUsers = syncedUsers
    .filter(user => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase()
        const matchesSearch = (
          user.email?.toLowerCase().includes(query) ||
          user.github_username?.toLowerCase().includes(query) ||
          user.jira_email?.toLowerCase().includes(query)
        )
        if (!matchesSearch) return false
      }
      return true
    })
    .sort((a, b) => {
      // Always show logged-in user at the top
      const currentUserEmail = localStorage.getItem('user_email')?.toLowerCase()
      const aIsCurrentUser = a.email?.toLowerCase() === currentUserEmail
      const bIsCurrentUser = b.email?.toLowerCase() === currentUserEmail

      if (aIsCurrentUser && !bIsCurrentUser) return -1
      if (!aIsCurrentUser && bIsCurrentUser) return 1

      // Then apply regular sorting
      if (!sortBy) return 0

      let comparison = 0
      if (sortBy === 'name') {
        const aName = a.email?.split('@')[0] || ''
        const bName = b.email?.split('@')[0] || ''
        comparison = aName.localeCompare(bName)
      } else if (sortBy === 'email') {
        comparison = (a.email || '').localeCompare(b.email || '')
      } else if (sortBy === 'oncall') {
        comparison = (a.is_oncall ? 1 : 0) - (b.is_oncall ? 1 : 0)
      }

      return sortDirection === 'asc' ? comparison : -comparison
    })

  // Pagination
  const totalPages = Math.ceil(filteredUsers.length / TEAM_MEMBERS_PER_PAGE)
  const startIndex = (currentPage - 1) * TEAM_MEMBERS_PER_PAGE
  const paginatedUsers = filteredUsers.slice(startIndex, startIndex + TEAM_MEMBERS_PER_PAGE)

  // Get integration logos for a user (filtered by currently connected integrations)
  const getUserIntegrations = (user: any) => {
    const integrations = []

    // Only show GitHub if user is mapped AND exists in current integration data
    if (user.github_username && connectedIntegrations.has('github')) {
      // Only show logo if data is loaded AND user exists in the current integration
      if (githubUsers.length > 0 && githubUsers.includes(user.github_username)) {
        integrations.push('github')
      }
    }

    // Only show Jira if user is mapped AND exists in current integration data
    if (user.jira_account_id && connectedIntegrations.has('jira')) {
      // Only show logo if data is loaded AND user exists in the current integration
      if (jiraUsers.length > 0 && jiraUsers.some(u =>
        u.account_id === user.jira_account_id || u.accountId === user.jira_account_id
      )) {
        integrations.push('jira')
      }
    }

    // Only show Linear if user is mapped AND exists in current integration data
    if (user.linear_user_id && connectedIntegrations.has('linear')) {
      // Only show logo if data is loaded AND user exists in the current integration
      if (linearUsers.length > 0 && linearUsers.some(u => u.id === user.linear_user_id)) {
        integrations.push('linear')
      }
    }

    // Show Slack if user is mapped and Slack is connected
    // Unlike other integrations, we don't validate against slackUsers
    // because the slack_user_id is already saved and we trust it
    if (user.slack_user_id && connectedIntegrations.has('slack')) {
      integrations.push('slack')
    }

    return integrations
  }

  // Get display name for Jira user from account ID
  const getJiraDisplayName = (accountId: string | null | undefined) => {
    if (!accountId) return 'Not mapped'

    // Show loading indicator until data is actually loaded (prevents ID flash)
    if (jiraUsers.length === 0) {
      return 'Loading...'
    }

    const jiraUser = jiraUsers.find(u => u.account_id === accountId || u.accountId === accountId)
    // Never show raw ID - show "Unmapped" instead for privacy
    return jiraUser?.display_name || jiraUser?.displayName || jiraUser?.email || jiraUser?.emailAddress || 'Unmapped'
  }

  // Get display name for Linear user from user ID
  const getLinearDisplayName = (userId: string | null | undefined) => {
    if (!userId) return 'Not mapped'

    // Show loading indicator until data is actually loaded (prevents ID flash)
    if (linearUsers.length === 0) {
      return 'Loading...'
    }

    const linearUser = linearUsers.find(u => u.id === userId)
    // Never show raw ID - show "Unmapped" instead for privacy
    return linearUser?.name || linearUser?.email || 'Unmapped'
  }

  // Get display name for Slack user from user ID
  const getSlackDisplayName = (userId: string | null | undefined) => {
    if (!userId) return 'Not mapped'

    // Show loading indicator until data is actually loaded (prevents ID flash)
    if (slackUsers.length === 0) {
      return 'Loading...'
    }

    const slackUser = slackUsers.find(u => u.id === userId)
    // Never show raw ID - show "Unmapped" instead for privacy
    return slackUser?.name || slackUser?.email || 'Unmapped'
  }

  // Handle column header click for sorting
  const handleSort = (column: 'name' | 'email' | 'oncall') => {
    if (sortBy === column) {
      // Toggle direction if same column
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      // New column, default to ascending
      setSortBy(column)
      setSortDirection('asc')
    }
  }

  // Get sort icon for column
  const getSortIcon = (column: 'name' | 'email' | 'oncall') => {
    if (sortBy !== column) {
      return <ArrowUpDown className="w-4 h-4 text-neutral-400" />
    }
    return sortDirection === 'asc'
      ? <ArrowUp className="w-4 h-4 text-purple-700" />
      : <ArrowDown className="w-4 h-4 text-purple-700" />
  }

  return (
    <div className="flex flex-col h-screen w-full bg-neutral-50">
      <TopPanel />
      <main className="flex-1 overflow-hidden w-full bg-neutral-50">
        <div className="h-full w-full overflow-y-auto">
          <div className="p-6 lg:p-8">
            <div className="max-w-4xl mx-auto">
            {/* Header with Title and View Mode Toggle */}
          <div className="mb-6 flex flex-col-reverse md:flex-row md:items-start md:justify-between md:pl-4 gap-4 md:gap-0">
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-semibold text-neutral-900">
                {viewMode === 'organization' ? 'Organization Management' : 'Team Management'}
              </h1>
              <p className="text-sm text-neutral-600 mt-1">
                {viewMode === 'organization'
                  ? 'Sync team data, manage incident response integrations, and track on-call status'
                  : 'Add team members, assign roles, manage access permissions, and control who can view and edit team data'}
              </p>
            </div>
            {/* View Mode Toggle */}
            <div className="relative grid grid-cols-2 bg-white border border-neutral-200 rounded-lg p-1 md:flex-shrink-0">
              <button
                onClick={() => setViewMode('organization')}
                className={`relative z-10 flex items-center justify-center px-3 py-1.5 text-sm font-medium rounded transition-all duration-200 ${
                  viewMode === 'organization'
                    ? 'text-purple-700'
                    : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                Synced Org
              </button>
              <button
                onClick={() => setViewMode('company')}
                className={`relative z-10 flex items-center justify-center px-3 py-1.5 text-sm font-medium rounded transition-all duration-200 ${
                  viewMode === 'company'
                    ? 'text-purple-700'
                    : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                Team Roles
              </button>
              <div
                className={`absolute top-1 bottom-1 bg-purple-100 rounded transition-all duration-300 ease-in-out w-[calc(50%-0.25rem)] ${
                  viewMode === 'organization' ? 'left-1' : 'left-[calc(50%+0.125rem)]'
                }`}
              />
            </div>
          </div>

          {/* Organization Management Section */}
          {(selectedOrganization || !hasPrimaryIntegration) && !loadingIntegrations && (
              <div className="bg-white rounded-lg border border-neutral-200 shadow-sm">
              {viewMode === 'organization' ? (
                <>
                  {/* Organization View */}
                  {/* Header with Organization Selector and Sync Button */}
                  <div className="p-6 border-b border-neutral-200">

                    {/* Organization Selector and Members Section - Only show when primary integration exists */}
                    {hasPrimaryIntegration && (
                      <div className="space-y-4">
                        {/* Sync Button - Mobile Only (Above Select Organization) */}
                        <div className="md:hidden flex flex-col gap-2">
                          <Button
                            onClick={() => {
                              setSyncProgress(null) // Reset sync progress when opening modal
                              setShowSyncConfirmModal(true)
                            }}
                            disabled={loadingSyncedUsers || !hasPrimaryIntegration}
                            className="bg-purple-700 hover:bg-purple-800 text-white w-full"
                          >
                            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                            Sync Now
                          </Button>
                          {lastSyncInfo && (
                            <p className="text-xs text-neutral-500 text-center">
                              Last synced {new Date(lastSyncInfo.synced_at).toLocaleString()}
                            </p>
                          )}
                        </div>

                        {/* Top row: Organization Selector and Sync Button */}
                        <div className="flex flex-col md:flex-row md:items-center md:justify-between pb-3 border-b border-neutral-200 gap-4 md:gap-0">
                          <div className="flex-shrink-0">
                            <label className="text-sm font-medium text-neutral-900 mb-2 block">Select Organization</label>
                            <Select
                              value={selectedOrganization}
                              onValueChange={(value) => {
                                setSelectedOrganization(value)
                                setStoredSelectedOrganization(value)
                              }}
                              disabled={loadingIntegrations || !hasPrimaryIntegration}
                            >
                              <SelectTrigger className="w-full sm:w-72">
                                <SelectValue placeholder="Select an organization...">
                                  {selectedIntegration && (
                                    <div className="flex items-center gap-2 min-w-0">
                                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${selectedIntegration.platform === "rootly" ? "bg-purple-500" : "bg-green-500"}`}></span>
                                      <span className="truncate">{selectedIntegration.name || `Integration #${selectedIntegration.id}`}</span>
                                      {getTeamScopeLabel(selectedIntegration) && (
                                        <span className="ml-auto inline-flex max-w-[140px] items-center truncate rounded bg-purple-100 px-1.5 py-0.5 text-[11px] font-medium text-purple-700 flex-shrink-0">
                                          {getTeamScopeLabel(selectedIntegration)}
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </SelectValue>
                              </SelectTrigger>
                              <SelectContent>
                                {integrations.map((integration) => (
                                  <SelectItem key={integration.id} value={integration.id.toString()}>
                                    <div className="flex items-center gap-2 min-w-0">
                                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${integration.platform === "rootly" ? "bg-purple-500" : "bg-green-500"}`}></span>
                                      <span className="truncate">{integration.name || `Integration #${integration.id}`}</span>
                                      {getTeamScopeLabel(integration) && (
                                        <span className="ml-auto inline-flex max-w-[140px] items-center truncate rounded bg-purple-100 px-1.5 py-0.5 text-[11px] font-medium text-purple-700 flex-shrink-0">
                                          {getTeamScopeLabel(integration)}
                                        </span>
                                      )}
                                    </div>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="hidden md:flex flex-col items-end gap-2">
                            <Button
                              onClick={() => {
                                setSyncProgress(null) // Reset sync progress when opening modal
                                setShowSyncConfirmModal(true)
                              }}
                              disabled={loadingSyncedUsers || !hasPrimaryIntegration}
                              className="bg-purple-700 hover:bg-purple-800 text-white"
                            >
                              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                              </svg>
                              Sync Now
                            </Button>
                            {lastSyncInfo && (
                              <p className="text-xs text-neutral-500">
                                Last synced {new Date(lastSyncInfo.synced_at).toLocaleString()}
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Bottom row: Organization Members and Search Bar */}
                        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-semibold text-neutral-900">Organization Members</h3>
                            {loadingSyncedUsers ? (
                              <Loader2 className="w-4 h-4 animate-spin text-neutral-400" />
                            ) : (
                              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-neutral-200 text-xs font-medium text-neutral-700">{syncedUsers.length}</span>
                            )}
                          </div>
                          <div className="w-full sm:w-64 md:w-80">
                            <div className="relative">
                              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                              <Input
                                type="text"
                                placeholder="Search members..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-9 w-full border-neutral-300"
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Management Table */}
              {loadingIntegrations ? (
                // LOADING INTEGRATIONS STATE
                <div className="flex items-center justify-center h-96">
                  <Loader2 className="w-8 h-8 animate-spin text-purple-700" />
                </div>
              ) : !hasPrimaryIntegration ? (
                // NO PRIMARY INTEGRATION EMPTY STATE
                <div className="flex items-center justify-center h-96">
                  <div className="text-center max-w-md">
                    <div className="bg-red-50 border border-red-200 rounded-lg p-6 mb-4">
                      <div className="flex items-start gap-3">
                        <svg className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                        </svg>
                        <div className="text-left flex-1">
                          <h3 className="text-sm font-semibold text-red-800 mb-1">
                            No Primary Integrations Connected
                          </h3>
                          <p className="text-sm text-red-700">
                            To sync members, you need to connect at least one primary integration (Rootly or PagerDuty).
                          </p>
                        </div>
                      </div>
                    </div>
                    <Button
                      onClick={() => router.push('/integrations')}
                      className="bg-purple-700 hover:bg-purple-800"
                    >
                      Go to Integrations
                    </Button>
                  </div>
                </div>
              ) : loadingSyncedUsers ? (
                // LOADING STATE
                <div className="flex items-center justify-center h-96">
                  <Loader2 className="w-8 h-8 animate-spin text-purple-700" />
                </div>
              ) : filteredUsers.length === 0 ? (
                // EMPTY STATE (no users synced)
                <div className="flex items-center justify-center h-96">
                  <div className="text-center">
                    {syncedUsers.length === 0 ? (
                      <>
                        <Users className="w-16 h-16 text-neutral-300 mx-auto mb-4" />
                        <p className="text-neutral-600">No team members synced yet</p>
                      </>
                    ) : (
                      <p className="text-neutral-600">No members found</p>
                    )}
                  </div>
                </div>
              ) : (
                // TABLE
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-neutral-200 bg-neutral-50">
                          <th className="text-left py-3 px-6">
                            <button
                              onClick={() => handleSort('name')}
                              className="flex items-center gap-2 text-sm font-semibold text-neutral-700 hover:text-neutral-900 transition-colors"
                            >
                              Name
                              {getSortIcon('name')}
                            </button>
                          </th>
                          <th className="text-left py-3 px-6 text-sm font-semibold text-neutral-700">Email</th>
                          <th className="text-left py-3 px-6">
                            <button
                              onClick={() => handleSort('oncall')}
                              className="flex items-center gap-2 text-sm font-semibold text-neutral-700 hover:text-neutral-900 transition-colors"
                            >
                              On-Call Status
                              {getSortIcon('oncall')}
                            </button>
                          </th>
                          <th className="text-left py-3 px-6 text-sm font-semibold text-neutral-700">Integrations</th>
                          <th className="text-left py-3 px-6 text-sm font-semibold text-neutral-700"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedUsers.map((user, index) => {
                          const integrations = getUserIntegrations(user)
                          const displayName = user.email?.split('@')[0] || 'Unknown'
                          const currentUserEmail = localStorage.getItem('user_email')?.toLowerCase()
                          const isCurrentUser = user.email?.toLowerCase() === currentUserEmail

                          return (
                            <tr key={user.id} className={`border-b border-neutral-100 hover:bg-neutral-50 ${index === paginatedUsers.length - 1 ? 'border-b-0' : ''}`}>
                              <td className="py-3 px-6">
                                <div className="flex items-center gap-3">
                                  <Avatar className="w-9 h-9">
                                    {user.avatar_url && <AvatarImage src={user.avatar_url} alt={displayName} />}
                                    <AvatarFallback className="text-sm font-medium">
                                      {displayName
                                        .split('.')
                                        .map((p: string) => p[0])
                                        .join('')
                                        .toUpperCase()
                                        .substring(0, 2)}
                                    </AvatarFallback>
                                  </Avatar>
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-medium text-neutral-900 capitalize">
                                      {displayName.replace(/[._]/g, ' ')}
                                    </span>
                                    {isCurrentUser && (
                                      <Badge className="bg-purple-100 text-purple-700 hover:bg-purple-100 text-xs px-2 py-0.5">
                                        You
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                              </td>
                              <td className="py-3 px-6">
                                <span className="text-sm text-neutral-600">{user.email}</span>
                              </td>
                              <td className="py-3 px-6">
                                {user.is_oncall ? (
                                  <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
                                    <span className="w-1.5 h-1.5 bg-green-600 rounded-full mr-1.5"></span>
                                    Active
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="border-neutral-300 text-neutral-600">
                                    <span className="w-1.5 h-1.5 bg-neutral-400 rounded-full mr-1.5"></span>
                                    Inactive
                                  </Badge>
                                )}
                              </td>
                              <td className="py-3 px-6">
                                <div className="flex items-center gap-2">
                                  {integrations.length > 0 ? (
                                    integrations.map((integration) => (
                                      <div
                                        key={integration}
                                        className="w-6 h-6 flex items-center justify-center"
                                        title={integration.charAt(0).toUpperCase() + integration.slice(1)}
                                      >
                                        {integration === 'github' && (
                                          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                                            <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
                                          </svg>
                                        )}
                                        {integration === 'jira' && (
                                          <svg className="w-5 h-5 text-blue-600" viewBox="0 0 24 24" fill="currentColor">
                                            <path d="M11.571 11.513H0a5.218 5.218 0 0 0 5.232 5.215h2.13v2.057A5.215 5.215 0 0 0 12.575 24V12.518a1.005 1.005 0 0 0-1.005-1.005zm5.723-5.756H5.736a5.215 5.215 0 0 0 5.215 5.214h2.129v2.058a5.218 5.218 0 0 0 5.215 5.214V6.758a1.001 1.001 0 0 0-1.001-1.001zM23.013 0H11.455a5.215 5.215 0 0 0 5.215 5.215h2.129v2.057A5.215 5.215 0 0 0 24 12.483V1.005A1.001 1.001 0 0 0 23.013 0z"/>
                                          </svg>
                                        )}
                                        {integration === 'linear' && (
                                          <Image src="/images/linear-logo.png" alt="Linear" width={20} height={20} />
                                        )}
                                        {integration === 'slack' && (
                                          <Image src="/images/slack-logo.png" alt="Slack" width={20} height={20} />
                                        )}
                                      </div>
                                    ))
                                  ) : (
                                    <span className="text-xs text-neutral-400">None</span>
                                  )}
                                </div>
                              </td>
                              <td className="py-3 px-6">
                                <div className="relative">
                                  <button
                                    ref={buttonRef}
                                    className="text-neutral-400 hover:text-neutral-600 transition-colors"
                                    onClick={(e) => {
                                      if (openMappingUserId === user.id) {
                                        setOpenMappingUserId(null)
                                        setPopupPosition(null)
                                      } else {
                                        const rect = e.currentTarget.getBoundingClientRect()
                                        const estimatedPopupHeight = 400 // Estimated height of the popup
                                        const spaceBelow = window.innerHeight - rect.bottom
                                        const spaceAbove = rect.top

                                        // If not enough space below and more space above, position above
                                        if (spaceBelow < estimatedPopupHeight && spaceAbove > spaceBelow) {
                                          setPopupPosition({
                                            bottom: window.innerHeight - rect.top + 8,
                                            right: window.innerWidth - rect.right
                                          })
                                        } else {
                                          // Position below
                                          setPopupPosition({
                                            top: rect.bottom + 8,
                                            right: window.innerWidth - rect.right
                                          })
                                        }
                                        setOpenMappingUserId(user.id)
                                      }
                                    }}
                                    title="Edit integration mappings"
                                  >
                                    <Pencil className="w-4 h-4" />
                                  </button>

                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>

                    {/* Inline Mapping Dropdown (Portal) */}
                    {openMappingUserId !== null && popupPosition && typeof window !== 'undefined' && (() => {
                      const user = filteredUsers.find(u => u.id === openMappingUserId)
                      if (!user) return null

                      return createPortal(
                        <div
                          ref={mappingDropdownRef}
                          className="fixed w-72 bg-white border border-neutral-200 rounded-lg shadow-lg z-50 p-4 max-h-96 overflow-y-auto"
                          style={{
                            ...(popupPosition.top !== undefined && { top: `${popupPosition.top}px` }),
                            ...(popupPosition.bottom !== undefined && { bottom: `${popupPosition.bottom}px` }),
                            right: `${popupPosition.right}px`
                          }}
                        >
                          <div className={connectedIntegrations.size > 0 ? "mb-3" : "mb-0"}>
                            <h4 className="text-sm font-semibold text-neutral-900">Integration Mappings</h4>
                            <p className="text-xs text-neutral-600">{user.email}</p>
                          </div>
                                      {connectedIntegrations.size > 0 ? (
                                        <div className="space-y-2">
                                        {/* GitHub */}
                                        {connectedIntegrations.has('github') && (
                                          <div className="border border-neutral-200 rounded">
                                            <button
                                              onClick={() => setExpandedIntegration(expandedIntegration === 'github' ? null : 'github')}
                                              className="w-full flex items-center justify-between p-2 hover:bg-neutral-50"
                                            >
                                              <div className="flex items-center gap-2">
                                                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                                                  <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
                                                </svg>
                                                <div className="text-left">
                                                  <div className="text-sm font-medium">GitHub</div>
                                                  <div className={`text-xs ${user.github_username ? 'text-green-600' : 'text-red-600'}`}>
                                                    {user.github_username || 'Not mapped'}
                                                  </div>
                                                </div>
                                              </div>
                                              <ChevronDown className={`w-4 h-4 transition-transform ${expandedIntegration === 'github' ? 'rotate-180' : ''}`} />
                                            </button>
                                            {expandedIntegration === 'github' && (
                                              <div className="p-2 border-t border-neutral-200">
                                                <input
                                                  type="text"
                                                  placeholder="Search GitHub users..."
                                                  value={integrationSearchQuery}
                                                  onChange={(e) => setIntegrationSearchQuery(e.target.value)}
                                                  className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-md mb-2"
                                                />
                                                <div className="max-h-32 overflow-y-auto space-y-1">
                                                  {loadingIntegrationUsers ? (
                                                    <div className="text-center py-2">
                                                      <Loader2 className="w-4 h-4 animate-spin mx-auto text-neutral-400" />
                                                    </div>
                                                  ) : (
                                                    <>
                                                      {user.github_username && (
                                                        <button
                                                          onClick={() => handleUserMapping(user.id, 'github', '')}
                                                          className="w-full text-left px-2 py-1 text-sm hover:bg-red-50 text-red-600 rounded border-b border-neutral-200 mb-1"
                                                        >
                                                          Clear mapping
                                                        </button>
                                                      )}
                                                      {githubUsers.filter(u => u.toLowerCase().includes(integrationSearchQuery.toLowerCase())).length > 0 ? (
                                                        githubUsers
                                                          .filter(u => u.toLowerCase().includes(integrationSearchQuery.toLowerCase()))
                                                          .map((username) => (
                                                            <button
                                                              key={username}
                                                              onClick={() => handleUserMapping(user.id, 'github', username)}
                                                              className="w-full text-left px-2 py-1 text-sm hover:bg-neutral-50 rounded"
                                                            >
                                                              {username}
                                                            </button>
                                                          ))
                                                      ) : (
                                                        <p className="text-xs text-neutral-500 text-center py-2">No users found</p>
                                                      )}
                                                    </>
                                                  )}
                                                </div>
                                              </div>
                                            )}
                                          </div>
                                        )}

                                        {/* Jira */}
                                        {connectedIntegrations.has('jira') && (
                                          <div className="border border-neutral-200 rounded">
                                            <button
                                              onClick={() => setExpandedIntegration(expandedIntegration === 'jira' ? null : 'jira')}
                                              className="w-full flex items-center justify-between p-2 hover:bg-neutral-50"
                                            >
                                              <div className="flex items-center gap-2">
                                                <svg className="w-4 h-4 text-blue-600" viewBox="0 0 24 24" fill="currentColor">
                                                  <path d="M11.571 11.513H0a5.218 5.218 0 0 0 5.232 5.215h2.13v2.057A5.215 5.215 0 0 0 12.575 24V12.518a1.005 1.005 0 0 0-1.004-1.005zm5.723-5.756H5.736a5.215 5.215 0 0 0 5.215 5.214h2.129v2.058a5.218 5.218 0 0 0 5.215 5.214V6.758a1.001 1.001 0 0 0-1.001-1.001zM23.013 0H11.455a5.215 5.215 0 0 0 5.215 5.215h2.129v2.057A5.215 5.215 0 0 0 24 12.483V1.005A1.001 1.001 0 0 0 23.013 0z"/>
                                                </svg>
                                                <div className="text-left">
                                                  <div className="text-sm font-medium">Jira</div>
                                                  <div className={`text-xs ${user.jira_account_id ? 'text-green-600' : 'text-red-600'}`}>
                                                    {user.jira_account_id ? getJiraDisplayName(user.jira_account_id) : 'Not mapped'}
                                                  </div>
                                                </div>
                                              </div>
                                              <ChevronDown className={`w-4 h-4 transition-transform ${expandedIntegration === 'jira' ? 'rotate-180' : ''}`} />
                                            </button>
                                            {expandedIntegration === 'jira' && (
                                              <div className="p-2 border-t border-neutral-200">
                                                <input
                                                  type="text"
                                                  placeholder="Search Jira users..."
                                                  value={integrationSearchQuery}
                                                  onChange={(e) => setIntegrationSearchQuery(e.target.value)}
                                                  className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-md mb-2"
                                                />
                                                <div className="max-h-32 overflow-y-auto space-y-1">
                                                  {loadingIntegrationUsers ? (
                                                    <div className="text-center py-2">
                                                      <Loader2 className="w-4 h-4 animate-spin mx-auto text-neutral-400" />
                                                    </div>
                                                  ) : (
                                                    <>
                                                      {user.jira_account_id && (
                                                        <button
                                                          onClick={() => handleUserMapping(user.id, 'jira', '')}
                                                          className="w-full text-left px-2 py-1 text-sm hover:bg-red-50 text-red-600 rounded border-b border-neutral-200 mb-1"
                                                        >
                                                          Clear mapping
                                                        </button>
                                                      )}
                                                      {(jiraUsers || []).filter(u => {
                                                        const name = u.display_name || u.displayName || u.email || u.emailAddress || ''
                                                        return name.toLowerCase().includes(integrationSearchQuery.toLowerCase())
                                                      }).length > 0 ? (
                                                        (jiraUsers || [])
                                                          .filter(u => {
                                                            const name = u.display_name || u.displayName || u.email || u.emailAddress || ''
                                                            return name.toLowerCase().includes(integrationSearchQuery.toLowerCase())
                                                          })
                                                          .map((jiraUser, idx) => (
                                                            <button
                                                              key={jiraUser.account_id || jiraUser.accountId || `jira-${idx}`}
                                                              onClick={() => handleUserMapping(user.id, 'jira', jiraUser.account_id || jiraUser.accountId)}
                                                              className="w-full text-left px-2 py-1 text-sm hover:bg-neutral-50 rounded"
                                                            >
                                                              {jiraUser.display_name || jiraUser.displayName || jiraUser.email || jiraUser.emailAddress}
                                                            </button>
                                                          ))
                                                      ) : (
                                                        <p className="text-xs text-neutral-500 text-center py-2">
                                                          {jiraUsers.length === 0 ? 'No Jira users available' : 'No users found'}
                                                        </p>
                                                      )}
                                                    </>
                                                  )}
                                                </div>
                                              </div>
                                            )}
                                          </div>
                                        )}

                                        {/* Linear */}
                                        {connectedIntegrations.has('linear') && (
                                          <div className="border border-neutral-200 rounded">
                                            <button
                                              onClick={() => setExpandedIntegration(expandedIntegration === 'linear' ? null : 'linear')}
                                              className="w-full flex items-center justify-between p-2 hover:bg-neutral-50"
                                            >
                                              <div className="flex items-center gap-2">
                                                <Image src="/images/linear-logo.png" alt="Linear" width={16} height={16} />
                                                <div className="text-left">
                                                  <div className="text-sm font-medium">Linear</div>
                                                  <div className={`text-xs ${user.linear_user_id ? 'text-green-600' : 'text-red-600'}`}>
                                                    {user.linear_user_id ? getLinearDisplayName(user.linear_user_id) : 'Not mapped'}
                                                  </div>
                                                </div>
                                              </div>
                                              <ChevronDown className={`w-4 h-4 transition-transform ${expandedIntegration === 'linear' ? 'rotate-180' : ''}`} />
                                            </button>
                                            {expandedIntegration === 'linear' && (
                                              <div className="p-2 border-t border-neutral-200">
                                                <input
                                                  type="text"
                                                  placeholder="Search Linear users..."
                                                  value={integrationSearchQuery}
                                                  onChange={(e) => setIntegrationSearchQuery(e.target.value)}
                                                  className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-md mb-2"
                                                />
                                                <div className="max-h-32 overflow-y-auto space-y-1">
                                                  {loadingIntegrationUsers ? (
                                                    <div className="text-center py-2">
                                                      <Loader2 className="w-4 h-4 animate-spin mx-auto text-neutral-400" />
                                                    </div>
                                                  ) : (
                                                    <>
                                                      {user.linear_user_id && (
                                                        <button
                                                          onClick={() => handleUserMapping(user.id, 'linear', '')}
                                                          className="w-full text-left px-2 py-1 text-sm hover:bg-red-50 text-red-600 rounded border-b border-neutral-200 mb-1"
                                                        >
                                                          Clear mapping
                                                        </button>
                                                      )}
                                                      {linearUsers.filter(u => (u.name || u.email || '').toLowerCase().includes(integrationSearchQuery.toLowerCase())).length > 0 ? (
                                                        linearUsers
                                                          .filter(u => (u.name || u.email || '').toLowerCase().includes(integrationSearchQuery.toLowerCase()))
                                                          .map((linearUser) => (
                                                            <button
                                                              key={linearUser.id}
                                                              onClick={() => handleUserMapping(user.id, 'linear', linearUser.id)}
                                                              className="w-full text-left px-2 py-1 text-sm hover:bg-neutral-50 rounded"
                                                            >
                                                              {linearUser.name || linearUser.email}
                                                            </button>
                                                          ))
                                                      ) : (
                                                        <p className="text-xs text-neutral-500 text-center py-2">No users found</p>
                                                      )}
                                                    </>
                                                  )}
                                                </div>
                                              </div>
                                            )}
                                          </div>
                                        )}

                                        {/* Slack */}
                                        {connectedIntegrations.has('slack') && (
                                          <div className="border border-neutral-200 rounded">
                                            <button
                                              onClick={() => setExpandedIntegration(expandedIntegration === 'slack' ? null : 'slack')}
                                              className="w-full flex items-center justify-between p-2 hover:bg-neutral-50"
                                            >
                                              <div className="flex items-center gap-2">
                                                <Image src="/images/slack-logo.png" alt="Slack" width={16} height={16} />
                                                <div className="text-left">
                                                  <div className="text-sm font-medium">Slack</div>
                                                  <div className={`text-xs ${user.slack_user_id ? 'text-green-600' : 'text-red-600'}`}>
                                                    {user.slack_user_id ? getSlackDisplayName(user.slack_user_id) : 'Not mapped'}
                                                  </div>
                                                </div>
                                              </div>
                                              <ChevronDown className={`w-4 h-4 transition-transform ${expandedIntegration === 'slack' ? 'rotate-180' : ''}`} />
                                            </button>
                                            {expandedIntegration === 'slack' && (
                                              <div className="p-2 border-t border-neutral-200">
                                                <input
                                                  type="text"
                                                  placeholder="Search Slack users..."
                                                  value={integrationSearchQuery}
                                                  onChange={(e) => setIntegrationSearchQuery(e.target.value)}
                                                  className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-md mb-2"
                                                />
                                                <div className="max-h-32 overflow-y-auto space-y-1">
                                                  {loadingIntegrationUsers ? (
                                                    <div className="text-center py-2">
                                                      <Loader2 className="w-4 h-4 animate-spin mx-auto text-neutral-400" />
                                                    </div>
                                                  ) : (
                                                    <>
                                                      {user.slack_user_id && (
                                                        <button
                                                          onClick={() => handleUserMapping(user.id, 'slack', '')}
                                                          className="w-full text-left px-2 py-1 text-sm hover:bg-red-50 text-red-600 rounded border-b border-neutral-200 mb-1"
                                                        >
                                                          Clear mapping
                                                        </button>
                                                      )}
                                                      {slackUsers.filter(u => (u.name || u.email || '').toLowerCase().includes(integrationSearchQuery.toLowerCase())).length > 0 ? (
                                                        slackUsers
                                                          .filter(u => (u.name || u.email || '').toLowerCase().includes(integrationSearchQuery.toLowerCase()))
                                                          .map((slackUser) => (
                                                            <button
                                                              key={slackUser.id}
                                                              onClick={() => handleUserMapping(user.id, 'slack', slackUser.id)}
                                                              className="w-full text-left px-2 py-1 text-sm hover:bg-neutral-50 rounded"
                                                            >
                                                              {slackUser.name || slackUser.email}
                                                            </button>
                                                          ))
                                                      ) : (
                                                        <p className="text-xs text-neutral-500 text-center py-2">No users found</p>
                                                      )}
                                                    </>
                                                  )}
                                                </div>
                                              </div>
                                            )}
                                          </div>
                                        )}
                                      </div>
                          ) : (
                            <p className="text-xs text-neutral-500 text-center py-2">No integrations connected</p>
                          )}
                        </div>,
                        document.body
                      )
                    })()}
                  </div>

                  {/* Pagination */}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between px-6 py-4 border-t border-neutral-200">
                      <p className="text-sm text-neutral-600">
                        Showing {startIndex + 1}-{Math.min(startIndex + TEAM_MEMBERS_PER_PAGE, filteredUsers.length)} of {filteredUsers.length}
                      </p>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-purple-700">
                          Page {currentPage} of {totalPages}
                        </span>
                        <Button
                          variant="outline"
                          onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                          disabled={currentPage === 1}
                          className="text-purple-700 hover:text-purple-800 h-8 w-8 p-0"
                        >
                          <ChevronLeft className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                          disabled={currentPage === totalPages}
                          className="text-purple-700 hover:text-purple-800 h-8 w-8 p-0"
                        >
                          <ChevronRight className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
                </>
              ) : (
                // Team View - Team Management
                <>
                  <OrganizationManagementDialog
                    open={true}
                    onOpenChange={() => {}}
                    inviteEmail={inviteEmail}
                    onInviteEmailChange={setInviteEmail}
                    inviteRole={inviteRole}
                    onInviteRoleChange={setInviteRole}
                    isInviting={isInviting}
                    onInvite={handleInvite}
                    loadingOrgData={loadingOrgData}
                    orgMembers={orgMembers}
                    pendingInvitations={pendingInvitations}
                    receivedInvitations={receivedInvitations}
                    userInfo={userInfo}
                    onRoleChange={handleRoleChange}
                    onRefreshOrgData={loadOrganizationData}
                    onClose={() => {}}
                    asInlineView={true}
                    title="Team Management"
                    subtitle="Add team members, assign roles, manage access permissions, and control who can view and edit team data"
                  />
                </>
              )}
              </div>
          )}
            </div>  {/* Close max-w-4xl mx-auto */}
          </div>  {/* Close p-6 lg:p-8 */}
        </div>  {/* Close h-full overflow-y-auto */}
      </main>

      {/* Sync Confirmation Modal */}
      <Dialog open={showSyncConfirmModal} onOpenChange={setShowSyncConfirmModal}>
        <DialogContent className="max-w-md">
          {!syncProgress ? (
            <>
              <DialogHeader>
                <DialogTitle>Sync Organization Users</DialogTitle>
                <DialogDescription>
                  This will sync all users from your connected integrations and match them with GitHub, Jira, Linear, and Slack accounts
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowSyncConfirmModal(false)}>
                  Cancel
                </Button>
                <Button onClick={performTeamSync} className="bg-purple-700 hover:bg-purple-800">
                  Start Sync
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              {syncProgress.isLoading ? (
                <>
                  <DialogHeader>
                    <DialogTitle>{syncProgress.stage}</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="flex items-center gap-3">
                      <Loader2 className="w-5 h-5 animate-spin text-purple-700" />
                      <p className="text-sm text-neutral-600">{syncProgress.details}</p>
                    </div>
                  </div>
                </>
              ) : syncProgress.error ? (
                <>
                  <DialogHeader className="sr-only">
                    <DialogTitle>Sync Failed</DialogTitle>
                  </DialogHeader>
                  <div className="py-6 px-6">
                    <div className="flex justify-center mb-4">
                      <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                        <AlertCircle className="w-7 h-7 text-red-600" />
                      </div>
                    </div>

                    <h2 className="text-xl font-semibold text-center mb-2">Sync Failed</h2>

                    <p className="text-sm text-neutral-600 text-center mb-6">
                      We couldn&apos;t sync users for this organization.
                    </p>

                    <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                      {syncProgress.error}
                    </div>
                  </div>

                  <DialogFooter className="px-6 pb-6">
                    <Button
                      onClick={() => {
                        setShowSyncConfirmModal(false)
                        setSyncProgress(null)
                      }}
                      className="w-full bg-purple-700 hover:bg-purple-800"
                    >
                      Close
                    </Button>
                  </DialogFooter>
                </>
              ) : (
                <>
                  <DialogHeader className="sr-only">
                    <DialogTitle>Sync Complete</DialogTitle>
                  </DialogHeader>
                  <div className="py-6 px-6">
                    {/* Success Icon */}
                    <div className="flex justify-center mb-4">
                      <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
                        <CheckCircle className="w-7 h-7 text-green-600" />
                      </div>
                    </div>

                    {/* Title */}
                    <h2 className="text-xl font-semibold text-center mb-2">Sync Complete</h2>

                    {/* Subtitle */}
                    {syncProgress.results && (
                      <p className="text-sm text-neutral-600 text-center mb-6">
                        {(syncProgress.results.created || 0) + (syncProgress.results.updated || 0) + (syncProgress.results.skipped || 0)} users processed successfully
                      </p>
                    )}

                    {syncProgress.results && (
                      <>
                        {/* Stats Grid - Unified Box */}
                        <div className="border rounded-lg mb-6">
                          <div className="grid grid-cols-3 divide-x">
                            {/* Created */}
                            <div className="p-4 text-center">
                              <div className="text-2xl font-bold text-neutral-900 mb-1">
                                {syncProgress.results.created || 0}
                              </div>
                              <div className="text-sm text-neutral-600">Created</div>
                            </div>

                            {/* Updated */}
                            <div className="p-4 text-center">
                              <div className="text-2xl font-bold text-neutral-900 mb-1">
                                {syncProgress.results.updated || 0}
                              </div>
                              <div className="text-sm text-neutral-600">Updated</div>
                            </div>

                            {/* Unchanged */}
                            <div className="p-4 text-center">
                              <div className="text-2xl font-bold text-neutral-900 mb-1">
                                {syncProgress.results.skipped || 0}
                              </div>
                              <div className="text-sm text-neutral-600">Unchanged</div>
                            </div>
                          </div>
                        </div>

                        {/* Newly Mapped Integrations */}
                        {(syncProgress.results.github_matched !== undefined ||
                          syncProgress.results.jira_matched !== undefined ||
                          syncProgress.results.linear_matched !== undefined ||
                          syncProgress.results.slack_matched !== undefined) && (
                          <div className="border rounded-lg p-4">
                            <div className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-3">
                              Newly Mapped Integrations
                            </div>
                            <div className="space-y-3">
                              {/* GitHub */}
                              {syncProgress.results.github_matched !== undefined && (
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                                      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
                                    </svg>
                                    <span className="text-sm font-medium text-neutral-700">GitHub</span>
                                  </div>
                                  <span className="text-sm font-semibold text-neutral-900">
                                    {syncProgress.results.github_matched}
                                  </span>
                                </div>
                              )}

                              {/* Jira */}
                              {syncProgress.results.jira_matched !== undefined && (
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <svg className="w-5 h-5 text-blue-600" viewBox="0 0 24 24" fill="currentColor">
                                      <path d="M11.571 11.513H0a5.218 5.218 0 0 0 5.232 5.215h2.13v2.057A5.215 5.215 0 0 0 12.575 24V12.518a1.005 1.005 0 0 0-1.005-1.005zm5.723-5.756H5.736a5.215 5.215 0 0 0 5.215 5.214h2.129v2.058a5.218 5.218 0 0 0 5.215 5.214V6.758a1.001 1.001 0 0 0-1.001-1.001zM23.013 0H11.455a5.215 5.215 0 0 0 5.215 5.215h2.129v2.057A5.215 5.215 0 0 0 24 12.483V1.005A1.001 1.001 0 0 0 23.013 0z"/>
                                    </svg>
                                    <span className="text-sm font-medium text-neutral-700">Jira</span>
                                  </div>
                                  <span className="text-sm font-semibold text-neutral-900">
                                    {syncProgress.results.jira_matched}
                                  </span>
                                </div>
                              )}

                              {/* Linear */}
                              {syncProgress.results.linear_matched !== undefined && (
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <Image src="/images/linear-logo.png" alt="Linear" width={20} height={20} />
                                    <span className="text-sm font-medium text-neutral-700">Linear</span>
                                  </div>
                                  <span className="text-sm font-semibold text-neutral-900">
                                    {syncProgress.results.linear_matched}
                                  </span>
                                </div>
                              )}

                              {/* Slack */}
                              {syncProgress.results.slack_matched !== undefined && (
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <Image src="/images/slack-logo.png" alt="Slack" width={20} height={20} />
                                    <span className="text-sm font-medium text-neutral-700">Slack</span>
                                  </div>
                                  <span className="text-sm font-semibold text-neutral-900">
                                    {syncProgress.results.slack_matched}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  {/* Footer Button */}
                  <DialogFooter className="px-6 pb-6">
                    <Button
                      onClick={() => {
                        setShowSyncConfirmModal(false)
                        setSyncProgress(null)
                      }}
                      className="w-full bg-purple-700 hover:bg-purple-800"
                    >
                      Done
                    </Button>
                  </DialogFooter>
                </>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* User Mapping Drawer */}
      <UserMappingDrawer
        isOpen={mappingDrawerOpen}
        onClose={closeMappingDrawer}
        user={selectedUserForMapping}
        selectedOrganization={selectedOrganization}
        onMappingUpdated={handleMappingUpdated}
        connectedIntegrations={connectedIntegrations}
      />
    </div>
  )
}

export default function TeamPage() {
  return (
    <Suspense>
      <TeamPageContent />
    </Suspense>
  )
}
