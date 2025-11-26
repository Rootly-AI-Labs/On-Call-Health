import { toast } from "sonner"
import { type JiraIntegration, type JiraWorkspacesResponse, API_BASE } from "../types"

/**
 * Load Jira integration from API with caching
 */
export async function loadJiraIntegration(
  forceRefresh: boolean,
  setJiraIntegration: (integration: JiraIntegration | null) => void,
  setLoadingJira: (loading: boolean) => void
): Promise<void> {
  if (!forceRefresh) {
    const cached = localStorage.getItem('jira_integration')
    if (cached) {
      try {
        const jiraData = JSON.parse(cached)
        setJiraIntegration(jiraData.connected ? jiraData.integration : null)
        setLoadingJira(false)
        return
      } catch (e) {
        // Cache parse failed, continue to API call
      }
    }
  }

  try {
    const authToken = localStorage.getItem('auth_token')
    if (!authToken) return

    const response = await fetch(`${API_BASE}/integrations/jira/status`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    })

    const jiraData = response.ok ? await response.json() : { connected: false, integration: null }
    setJiraIntegration(jiraData.connected ? jiraData.integration : null)
    localStorage.setItem('jira_integration', JSON.stringify(jiraData))
  } catch (error) {
    console.error('Error loading Jira integration:', error)
  } finally {
    setLoadingJira(false)
  }
}

/**
 * Connect Jira integration via OAuth
 */
export async function handleJiraConnect(
  setIsConnectingJira: (loading: boolean) => void,
  setActiveEnhancementTab: (tab: "github" | "slack" | "jira" | null) => void,
  loadJiraIntegration: () => Promise<void>
): Promise<void> {
  try {
    setIsConnectingJira(true)
    const authToken = localStorage.getItem('auth_token')
    if (!authToken) {
      toast.error('Please log in to connect Jira')
      return
    }

    // Request authorization URL from backend
    const response = await fetch(`${API_BASE}/integrations/jira/connect`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.detail || 'Failed to initiate Jira OAuth')
    }

    const data = await response.json()
    const authUrl = data.authorization_url

    if (!authUrl) {
      throw new Error('No authorization URL received from server')
    }

    // Store state to validate callback
    if (data.state) {
      sessionStorage.setItem('jira_oauth_state', data.state)
    }

    // Redirect to Jira OAuth
    window.location.href = authUrl

  } catch (error) {
    console.error('Error connecting Jira:', error)
    toast.error(error instanceof Error ? error.message : 'Failed to connect Jira')
    setIsConnectingJira(false)
  }
}

/**
 * Disconnect Jira integration
 */
export async function handleJiraDisconnect(
  setIsDisconnectingJira: (loading: boolean) => void,
  setJiraIntegration: (integration: JiraIntegration | null) => void,
  setActiveEnhancementTab: (tab: "github" | "slack" | "jira" | null) => void
): Promise<void> {
  try {
    setIsDisconnectingJira(true)
    const authToken = localStorage.getItem('auth_token')
    if (!authToken) {
      toast.error('Authentication required')
      return
    }

    const response = await fetch(`${API_BASE}/integrations/jira/disconnect`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${authToken}` }
    })

    if (!response.ok) {
      throw new Error('Failed to disconnect Jira')
    }

    setJiraIntegration(null)
    localStorage.removeItem('jira_integration')
    setActiveEnhancementTab(null)
    toast.success('Jira disconnected successfully')

  } catch (error) {
    console.error('Error disconnecting Jira:', error)
    toast.error('Failed to disconnect Jira')
  } finally {
    setIsDisconnectingJira(false)
  }
}

/**
 * Test Jira integration connection
 */
export async function handleJiraTest(
  toast: any
): Promise<void> {
  try {
    const authToken = localStorage.getItem('auth_token')
    if (!authToken) {
      toast.error('Authentication required')
      return
    }

    const response = await fetch(`${API_BASE}/integrations/jira/test`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${authToken}` }
    })

    if (!response.ok) {
      throw new Error('Connection test failed')
    }

    const result = await response.json()

    if (result.success) {
      toast.success('Jira connection is working correctly!')

      // Log all the data we're collecting
      console.log('[Jira] ========== TEST CONNECTION RESULTS ==========')
      console.log('[Jira] Permissions:', result.permissions)
      console.log('[Jira] Connected User:', result.user_info)

      // Log detailed information about all users and their tickets
      if (result.workload_preview && result.workload_preview.per_responder) {
        console.log(`[Jira] Total issues found: ${result.workload_preview.total_issues}`)
        console.log(`[Jira] Users with tickets: ${result.workload_preview.per_responder.length}`)
        console.log('[Jira] ========== USER DETAILS ==========')

        result.workload_preview.per_responder.forEach((user: any, index: number) => {
          console.log(`\n[Jira] User ${index + 1}:`)
          console.log(`  Name: ${user.assignee_name}`)
          console.log(`  User ID: ${user.assignee_account_id}`)
          console.log(`  Email: ${user.assignee_email || 'N/A'}`)
          console.log(`  Total Tickets: ${user.count}`)
          console.log(`  Priority Summary:`, user.priorities)
          console.log(`  Tickets:`)
          user.tickets.forEach((ticket: any) => {
            console.log(`    - ${ticket.key} | Priority: ${ticket.priority} | Due: ${ticket.duedate || 'No due date'}`)
          })
        })
        console.log('[Jira] =====================================')
      }
    } else {
      toast.error(result.message || 'Connection test failed')
    }

  } catch (error) {
    console.error('Error testing Jira connection:', error)
    toast.error('Failed to test connection')
  }
}

/**
 * Check if user has access to multiple Jira workspaces
 * Returns true if the user has more than 1 workspace
 */
export async function checkMultipleWorkspaces(): Promise<boolean> {
  try {
    const authToken = localStorage.getItem('auth_token')
    if (!authToken) return false

    const response = await fetch(`${API_BASE}/integrations/jira/workspaces`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    })

    if (!response.ok) return false

    const data: JiraWorkspacesResponse = await response.json()
    return (data.workspaces?.length || 0) > 1
  } catch (error) {
    console.error('Error checking workspaces:', error)
    return false
  }
}

/**
 * Load all available Jira workspaces
 */
export async function loadJiraWorkspaces(): Promise<JiraWorkspacesResponse | null> {
  try {
    const authToken = localStorage.getItem('auth_token')
    if (!authToken) {
      toast.error('Authentication required')
      return null
    }

    const response = await fetch(`${API_BASE}/integrations/jira/workspaces`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    })

    if (!response.ok) {
      throw new Error('Failed to load workspaces')
    }

    return await response.json()
  } catch (error) {
    console.error('Error loading Jira workspaces:', error)
    toast.error('Failed to load workspaces')
    return null
  }
}

/**
 * Select a specific Jira workspace
 */
export async function selectJiraWorkspace(
  cloudId: string,
  onSuccess?: () => void
): Promise<boolean> {
  try {
    const authToken = localStorage.getItem('auth_token')
    if (!authToken) {
      toast.error('Authentication required')
      return false
    }

    const response = await fetch(`${API_BASE}/integrations/jira/select-workspace`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ cloud_id: cloudId })
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.detail || 'Failed to select workspace')
    }

    const data = await response.json()

    // Clear cache to force reload
    localStorage.removeItem('jira_integration')

    toast.success(data.message || 'Workspace selected successfully')

    if (onSuccess) {
      onSuccess()
    }

    return true
  } catch (error) {
    console.error('Error selecting workspace:', error)
    toast.error(error instanceof Error ? error.message : 'Failed to select workspace')
    return false
  }
}

/**
 * Sync Jira users to UserCorrelation table
 */
export async function syncJiraUsers(
  setLoadingSync: (loading: boolean) => void,
  onProgress?: (message: string) => void,
  fetchSyncedUsers?: () => Promise<void>
): Promise<{ matched: number; created: number; updated: number; skipped: number }> {
  try {
    setLoadingSync(true)
    onProgress?.('🔄 Starting Jira user sync...')

    const authToken = localStorage.getItem('auth_token')
    if (!authToken) {
      toast.error('Please log in to sync Jira users')
      throw new Error('Not authenticated')
    }

    onProgress?.('📡 Fetching users from Jira workspace...')

    const response = await fetch(`${API_BASE}/integrations/jira/sync-users`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.detail || 'Failed to sync Jira users')
    }

    onProgress?.('✅ Received response from server')
    const data = await response.json()
    const stats = data.stats || {}

    onProgress?.(`📊 Matched ${stats.matched} users`)
    onProgress?.(`🔄 Updated ${stats.updated} user records`)
    onProgress?.(`⏭️  Skipped ${stats.skipped} users (no match found)`)

    // Build success message
    const message = `Synced ${stats.matched} Jira users to team members (${stats.updated} updated, ${stats.skipped} skipped).`
    toast.success(message)

    onProgress?.('🔄 Reloading team members...')

    // Reload synced users if callback provided
    if (fetchSyncedUsers) {
      await fetchSyncedUsers()
    }

    onProgress?.('✅ Sync completed successfully!')

    return {
      matched: stats.matched || 0,
      created: stats.created || 0,
      updated: stats.updated || 0,
      skipped: stats.skipped || 0
    }

  } catch (error) {
    console.error('Error syncing Jira users:', error)
    onProgress?.(`❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
    const errorMsg = error instanceof Error ? error.message : 'Failed to sync Jira users'
    toast.error(errorMsg)
    throw error
  } finally {
    setLoadingSync(false)
  }
}
