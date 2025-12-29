import { toast } from "sonner"
import { type SlackIntegration, API_BASE } from "../types"

/**
 * Load Slack integration from API with caching
 */
export async function loadSlackIntegration(
  forceRefresh: boolean,
  setSlackIntegration: (integration: SlackIntegration | null) => void,
  setLoadingSlack: (loading: boolean) => void
): Promise<void> {
  if (!forceRefresh) {
    const cached = localStorage.getItem('slack_integration')
    if (cached) {
      try {
        const slackData = JSON.parse(cached)
        setSlackIntegration(slackData.integration)
        setLoadingSlack(false)
        return
      } catch (e) {
        // Cache parse failed, continue to API call
      }
    }
  }

  try {
    const authToken = localStorage.getItem('auth_token')
    if (!authToken) return

    const response = await fetch(`${API_BASE}/integrations/slack/status`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    })

    const slackData = response.ok ? await response.json() : { integration: null }

    setSlackIntegration(slackData.integration)
    localStorage.setItem('slack_integration', JSON.stringify(slackData))
  } catch (error) {
    console.error('Error loading Slack integration:', error)
  } finally {
    setLoadingSlack(false)
  }
}

/**
 * Connect Slack integration with webhook and bot token
 */
export async function handleSlackConnect(
  webhookUrl: string,
  botToken: string,
  setIsConnectingSlack: (loading: boolean) => void,
  setSlackWebhookUrl: (url: string) => void,
  setSlackBotToken: (token: string) => void,
  setActiveEnhancementTab: (tab: "github" | "slack" | null) => void,
  loadSlackIntegration: (forceRefresh: boolean) => void
): Promise<void> {
  setIsConnectingSlack(true)
  try {
    const authToken = localStorage.getItem('auth_token')
    if (!authToken) {
      throw new Error('No authentication token found')
    }

    const response = await fetch(`${API_BASE}/integrations/slack/setup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        webhook_url: webhookUrl,
        token: botToken
      })
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.detail || 'Failed to connect Slack')
    }

    toast.success("Your Slack workspace has been connected successfully.")

    setSlackWebhookUrl('')
    setSlackBotToken('')
    setActiveEnhancementTab(null)
    loadSlackIntegration(true)
  } catch (error) {
    console.error('Error connecting Slack:', error)
    toast.error(error instanceof Error ? error.message : "An unexpected error occurred.")
  } finally {
    setIsConnectingSlack(false)
  }
}

/**
 * Disconnect Slack integration
 */
export async function handleSlackDisconnect(
  setIsDisconnectingSlack: (loading: boolean) => void,
  setSlackDisconnectDialogOpen: (open: boolean) => void,
  loadSlackIntegration: (forceRefresh: boolean) => void
): Promise<void> {
  setIsDisconnectingSlack(true)
  try {
    const authToken = localStorage.getItem('auth_token')
    if (!authToken) {
      toast.error("Please log in to disconnect Slack")
      setSlackDisconnectDialogOpen(false)
      return
    }

    const response = await fetch(`${API_BASE}/integrations/slack/disconnect`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    })

    if (response.ok) {
      toast.success("Your Slack integration has been removed.")
      setSlackDisconnectDialogOpen(false)
      loadSlackIntegration(true) // Force refresh after changes
    } else {
      // Handle error responses
      const errorData = await response.json().catch(() => ({}))
      const errorMessage = errorData.detail || `Failed to disconnect: ${response.statusText}`
      toast.error(errorMessage)
      // Still close the dialog since the UI shows it's disconnected in the background
      setSlackDisconnectDialogOpen(false)
      // Refresh to get actual state from backend
      loadSlackIntegration(true)
    }
  } catch (error) {
    console.error('Error disconnecting Slack:', error)
    toast.error(error instanceof Error ? error.message : "An unexpected error occurred.")
    // Close dialog on error too
    setSlackDisconnectDialogOpen(false)
  } finally {
    setIsDisconnectingSlack(false)
  }
}

/**
 * Test Slack connection and permissions
 */
export async function handleSlackTest(
  setSlackPermissions: (permissions: any) => void,
  setSlackIntegration: React.Dispatch<React.SetStateAction<SlackIntegration | null>>
): Promise<void> {
  try {
    const authToken = localStorage.getItem('auth_token')
    if (!authToken) {
      toast.error("Please log in to test your Slack integration.")
      return
    }

    toast.info("Testing Slack connection...")

    const response = await fetch(`${API_BASE}/integrations/slack/test`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    })

    if (response.ok) {
      const data = await response.json()
      setSlackPermissions(data.permissions)

      // Store channels list if available
      if (data.channels) {
        setSlackIntegration(prev => prev ? {...prev, channels: data.channels} : null)
      }

      const workspaceName = data.workspace_info?.team_name || 'your workspace'
      const userName = data.user_info?.name || 'Slack user'

      toast.success(`✅ Slack test successful! Connected as ${userName} in ${workspaceName}. Permissions updated.`)
    } else {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.detail || 'Connection test failed')
    }
  } catch (error) {
    console.error('Error testing Slack connection:', error)
    toast.error(`❌ Slack test failed: ${error instanceof Error ? error.message : "Unable to test Slack connection."}`)
  }
}

/**
 * Load Slack permissions
 */
export async function loadSlackPermissions(
  slackIntegration: SlackIntegration | null,
  setIsLoadingPermissions: (loading: boolean) => void,
  setSlackPermissions: (permissions: any) => void
): Promise<void> {
  if (!slackIntegration) return

  // Skip permissions test for OAuth integrations - they use workspace-level bot tokens
  // Only user-based integrations (manual token setup) need permission testing
  if (slackIntegration.is_oauth || slackIntegration.token_source === 'oauth') {
    setIsLoadingPermissions(false)
    return
  }

  setIsLoadingPermissions(true)
  try {
    const authToken = localStorage.getItem('auth_token')
    if (!authToken) return

    const response = await fetch(`${API_BASE}/integrations/slack/test`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    })

    if (response.ok) {
      const data = await response.json()
      setSlackPermissions(data.permissions)
    }
  } catch (error) {
    // Silently handle permission loading errors
  } finally {
    setIsLoadingPermissions(false)
  }
}
