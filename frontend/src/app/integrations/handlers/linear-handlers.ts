import { toast } from "sonner"
import { type LinearIntegration, type LinearTeamsResponse, API_BASE } from "../types"

/**
 * Load Linear integration from API with caching
 */
export async function loadLinearIntegration(
  forceRefresh: boolean,
  setLinearIntegration: (integration: LinearIntegration | null) => void,
  setLoadingLinear: (loading: boolean) => void
): Promise<void> {
  if (!forceRefresh) {
    const cached = localStorage.getItem('linear_integration')
    if (cached) {
      try {
        const linearData = JSON.parse(cached)
        setLinearIntegration(linearData.connected ? linearData.integration : null)
        setLoadingLinear(false)
        return
      } catch (e) {
        // Cache parse failed, continue to API call
      }
    }
  }

  try {
    const authToken = localStorage.getItem('auth_token')
    if (!authToken) return

    const response = await fetch(`${API_BASE}/integrations/linear/status`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    })

    const linearData = response.ok ? await response.json() : { connected: false, integration: null }
    setLinearIntegration(linearData.connected ? linearData.integration : null)
    localStorage.setItem('linear_integration', JSON.stringify(linearData))
  } catch (error) {
    console.error('Error loading Linear integration:', error)
  } finally {
    setLoadingLinear(false)
  }
}

/**
 * Connect Linear integration via OAuth with PKCE
 */
export async function handleLinearConnect(
  setIsConnectingLinear: (loading: boolean) => void,
  setActiveEnhancementTab: (tab: "github" | "slack" | "jira" | "linear" | null) => void,
  loadLinearIntegration: () => Promise<void>
): Promise<void> {
  try {
    setIsConnectingLinear(true)
    const authToken = localStorage.getItem('auth_token')
    if (!authToken) {
      toast.error('Please log in to connect Linear')
      return
    }

    // Request authorization URL from backend
    const response = await fetch(`${API_BASE}/integrations/linear/connect`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.detail || 'Failed to initiate Linear OAuth')
    }

    const data = await response.json()
    const authUrl = data.authorization_url

    if (!authUrl) {
      throw new Error('No authorization URL received from server')
    }

    // Store state to validate callback
    if (data.state) {
      sessionStorage.setItem('linear_oauth_state', data.state)
    }

    // Redirect to Linear OAuth
    window.location.href = authUrl

  } catch (error) {
    console.error('Error connecting Linear:', error)
    toast.error(error instanceof Error ? error.message : 'Failed to connect Linear')
    setIsConnectingLinear(false)
  }
}

/**
 * Disconnect Linear integration
 */
export async function handleLinearDisconnect(
  setIsDisconnectingLinear: (loading: boolean) => void,
  setLinearIntegration: (integration: LinearIntegration | null) => void,
  setActiveEnhancementTab: (tab: "github" | "slack" | "jira" | "linear" | null) => void
): Promise<void> {
  try {
    setIsDisconnectingLinear(true)
    const authToken = localStorage.getItem('auth_token')
    if (!authToken) {
      toast.error('Authentication required')
      return
    }

    const response = await fetch(`${API_BASE}/integrations/linear/disconnect`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${authToken}` }
    })

    if (!response.ok) {
      throw new Error('Failed to disconnect Linear')
    }

    setLinearIntegration(null)
    localStorage.removeItem('linear_integration')
    setActiveEnhancementTab(null)
    toast.success('Linear disconnected successfully')

  } catch (error) {
    console.error('Error disconnecting Linear:', error)
    toast.error('Failed to disconnect Linear')
  } finally {
    setIsDisconnectingLinear(false)
  }
}

/**
 * Test Linear integration connection
 */
export async function handleLinearTest(
  toast: any
): Promise<void> {
  try {
    const authToken = localStorage.getItem('auth_token')
    if (!authToken) {
      toast.error('Authentication required')
      return
    }

    const response = await fetch(`${API_BASE}/integrations/linear/test`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${authToken}` }
    })

    if (!response.ok) {
      throw new Error('Connection test failed')
    }

    const result = await response.json()

    if (result.success) {
      const preview = result.workload_preview || {}
      toast.success(
        `Linear connection is working! Found ${preview.total_issues || 0} issues across ${preview.assignee_count || 0} assignees.`
      )
    } else {
      toast.error(result.message || 'Connection test failed')
    }

  } catch (error) {
    console.error('Error testing Linear connection:', error)
    toast.error('Failed to test connection')
  }
}

/**
 * Load all available Linear teams
 */
export async function loadLinearTeams(): Promise<LinearTeamsResponse | null> {
  try {
    const authToken = localStorage.getItem('auth_token')
    if (!authToken) {
      toast.error('Authentication required')
      return null
    }

    const response = await fetch(`${API_BASE}/integrations/linear/teams`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    })

    if (!response.ok) {
      throw new Error('Failed to load teams')
    }

    return await response.json()
  } catch (error) {
    console.error('Error loading Linear teams:', error)
    toast.error('Failed to load teams')
    return null
  }
}

/**
 * Select teams to monitor for burnout analysis
 */
export async function selectLinearTeams(
  teamIds: string[],
  onSuccess?: () => void
): Promise<boolean> {
  try {
    const authToken = localStorage.getItem('auth_token')
    if (!authToken) {
      toast.error('Authentication required')
      return false
    }

    const response = await fetch(`${API_BASE}/integrations/linear/select-teams`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ team_ids: teamIds })
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.detail || 'Failed to select teams')
    }

    const data = await response.json()

    // Clear cache to force reload
    localStorage.removeItem('linear_integration')

    toast.success(`Selected ${data.selected_teams?.length || 0} teams for monitoring`)

    if (onSuccess) {
      onSuccess()
    }

    return true
  } catch (error) {
    console.error('Error selecting teams:', error)
    toast.error(error instanceof Error ? error.message : 'Failed to select teams')
    return false
  }
}

/**
 * Sync Linear users to UserCorrelation table
 */
export async function syncLinearUsers(
  setLoadingSync: (loading: boolean) => void,
  onProgress?: (message: string) => void,
  fetchSyncedUsers?: () => Promise<void>
): Promise<{ matched: number; created: number; skipped: number }> {
  try {
    setLoadingSync(true)
    onProgress?.('🔄 Starting Linear user sync...')

    const authToken = localStorage.getItem('auth_token')
    if (!authToken) {
      toast.error('Please log in to sync Linear users')
      throw new Error('Not authenticated')
    }

    onProgress?.('📡 Fetching users from Linear workspace...')

    const response = await fetch(`${API_BASE}/integrations/linear/sync-users`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.detail || 'Failed to sync Linear users')
    }

    onProgress?.('✅ Received response from server')
    const data = await response.json()

    onProgress?.(`📊 Matched ${data.matched || 0} users`)
    onProgress?.(`➕ Created ${data.created || 0} new user records`)
    onProgress?.(`⏭️  Skipped ${data.skipped || 0} users`)

    const message = `Synced ${data.total_linear_users || 0} Linear users (${data.matched || 0} matched, ${data.created || 0} created, ${data.skipped || 0} skipped).`
    toast.success(message)

    onProgress?.('🔄 Reloading team members...')

    if (fetchSyncedUsers) {
      await fetchSyncedUsers()
    }

    onProgress?.('✅ Sync completed successfully!')

    return {
      matched: data.matched || 0,
      created: data.created || 0,
      skipped: data.skipped || 0
    }

  } catch (error) {
    console.error('Error syncing Linear users:', error)
    onProgress?.(`❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
    const errorMsg = error instanceof Error ? error.message : 'Failed to sync Linear users'
    toast.error(errorMsg)
    throw error
  } finally {
    setLoadingSync(false)
  }
}
