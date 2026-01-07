import { toast } from "sonner"
import { type GitHubIntegration, API_BASE } from "../types"

/**
 * Load GitHub integration from API with caching
 */
export async function loadGitHubIntegration(
  forceRefresh: boolean,
  setGithubIntegration: (integration: GitHubIntegration | null) => void,
  setLoadingGitHub: (loading: boolean) => void
): Promise<void> {
  if (!forceRefresh) {
    const cached = localStorage.getItem('github_integration')
    if (cached) {
      try {
        const githubData = JSON.parse(cached)
        setGithubIntegration(githubData.connected ? githubData.integration : null)
        setLoadingGitHub(false)
        return
      } catch (e) {
        // Cache parse failed, continue to API call
      }
    }
  }

  try {
    const authToken = localStorage.getItem('auth_token')
    if (!authToken) return

    const response = await fetch(`${API_BASE}/integrations/github/status`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    })

    const githubData = response.ok ? await response.json() : { connected: false, integration: null }
    setGithubIntegration(githubData.connected ? githubData.integration : null)
    localStorage.setItem('github_integration', JSON.stringify(githubData))
  } catch (error) {
    console.error('Error loading GitHub integration:', error)
  } finally {
    setLoadingGitHub(false)
  }
}

/**
 * Connect GitHub integration with personal access token
 */
export async function handleGitHubConnect(
  token: string,
  setIsConnectingGithub: (loading: boolean) => void,
  setGithubToken: (token: string) => void,
  setActiveEnhancementTab: (tab: "github" | "slack" | null) => void,
  loadGitHubIntegration: (forceRefresh: boolean) => void
): Promise<void> {
  setIsConnectingGithub(true)
  try {
    const authToken = localStorage.getItem('auth_token')
    if (!authToken) {
      throw new Error('No authentication token found')
    }

    const response = await fetch(`${API_BASE}/integrations/github/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({ token })
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.detail || 'Failed to connect GitHub')
    }

    toast.success("Your GitHub account has been connected successfully.")

    setGithubToken('')
    setActiveEnhancementTab(null)
    loadGitHubIntegration(true) // Force refresh to update cache
  } catch (error) {
    console.error('Error connecting GitHub:', error)
    toast.error(error instanceof Error ? error.message : "An unexpected error occurred.")
  } finally {
    setIsConnectingGithub(false)
  }
}

/**
 * Disconnect GitHub integration
 */
export async function handleGitHubDisconnect(
  setIsDisconnectingGithub: (loading: boolean) => void,
  setGithubDisconnectDialogOpen: (open: boolean) => void,
  loadGitHubIntegration: (forceRefresh: boolean) => void
): Promise<void> {
  setIsDisconnectingGithub(true)
  try {
    const authToken = localStorage.getItem('auth_token')
    if (!authToken) return

    const response = await fetch(`${API_BASE}/integrations/github/disconnect`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    })

    if (response.ok) {
      toast.success("Your GitHub integration has been removed.")
      setGithubDisconnectDialogOpen(false)
      loadGitHubIntegration(true) // Force refresh after changes
    }
  } catch (error) {
    console.error('Error disconnecting GitHub:', error)
    toast.error(error instanceof Error ? error.message : "An unexpected error occurred.")
  } finally {
    setIsDisconnectingGithub(false)
  }
}

/**
 * Test GitHub connection and permissions
 */
export async function handleGitHubTest(): Promise<void> {
  try {
    const authToken = localStorage.getItem('auth_token')
    if (!authToken) {
      toast.error("Please log in to test your GitHub integration.")
      return
    }

    toast.info("Testing GitHub connection...")

    const response = await fetch(`${API_BASE}/integrations/github/test`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    })

    if (response.ok) {
      const data = await response.json()

      // Build the success message with data summary
      let successMessage = `✅ Connected as ${data.user_info?.username || 'GitHub user'}`

      // Add data summary if available
      if (data.data_summary) {
        const summary = data.data_summary
        if (summary.note) {
          // No team members synced yet
          toast.info(`${successMessage}. ${summary.note}`)
          return
        }

        const totalActivity = summary.total_commits + summary.total_pull_requests + summary.total_reviews

        if (totalActivity > 0) {
          successMessage += ` • Last 30 days: ${summary.total_commits} commits, ${summary.total_pull_requests} PRs, ${summary.total_reviews} reviews (${summary.synced_members} team members)`
          toast.success(successMessage)
        } else {
          successMessage += ` • No GitHub activity found in the last 30 days for synced team members (${summary.synced_members} synced)`
          toast.info(successMessage)
        }
      } else {
        // Fallback to permissions message if no data summary
        if (data.permissions) {
          const missingPerms = []
          if (!data.permissions.repo_access) missingPerms.push('repository access')
          if (!data.permissions.org_access) missingPerms.push('organization access')

          if (missingPerms.length > 0) {
            toast.warning(`${successMessage}, but missing: ${missingPerms.join(', ')}`)
          } else {
            toast.success(`${successMessage} with full access.`)
          }
        } else {
          toast.success(`${successMessage}. Integration is working properly.`)
        }
      }
    } else {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.detail || 'Connection test failed')
    }
  } catch (error) {
    console.error('Error testing GitHub connection:', error)
    toast.error(`❌ GitHub test failed: ${error instanceof Error ? error.message : "Unable to test GitHub connection."}`)
  }
}
