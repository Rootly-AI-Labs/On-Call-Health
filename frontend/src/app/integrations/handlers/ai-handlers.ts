import { toast } from "sonner"
import { API_BASE } from "../types"

/**
 * Load LLM configuration
 */
export async function loadLlmConfig(
  setLoadingLlmConfig: (loading: boolean) => void,
  setLlmConfig: (config: any) => void,
  setLlmProvider: (provider: string) => void,
  setLlmModel: (model: string) => void
): Promise<void> {
  setLoadingLlmConfig(true)
  try {
    const authToken = localStorage.getItem('auth_token')
    if (!authToken) {
      return
    }

    const response = await fetch(`${API_BASE}/llm/token`, {
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    })

    if (response.ok) {
      const config = await response.json()
      setLlmConfig(config)
      if (config.provider) {
        setLlmProvider(config.provider)
        setLlmModel(config.provider === 'openai' ? 'gpt-4o-mini' : 'claude-3-haiku')
      }
    }
  } catch (error) {
    console.error('Failed to load LLM config:', error)
  } finally {
    setLoadingLlmConfig(false)
  }
}

/**
 * Connect AI/LLM provider with API token or system token
 */
export async function handleConnectAI(
  llmToken: string,
  llmProvider: string,
  llmModel: string,
  setIsConnectingAI: (loading: boolean) => void,
  setTokenError: (error: string | null) => void,
  setLlmConfig: (config: any) => void,
  setLlmToken: (token: string) => void,
  useSystemToken: boolean = false
): Promise<void> {
  // If using system token, no token input validation needed
  if (!useSystemToken && !llmToken.trim()) {
    setTokenError("Please enter your LLM API token")
    toast.error("Please enter your LLM API token")
    return
  }

  setIsConnectingAI(true)
  setTokenError(null) // Clear any previous errors
  try {
    const authToken = localStorage.getItem('auth_token')
    if (!authToken) {
      throw new Error('No authentication token found')
    }

    const response = await fetch(`${API_BASE}/llm/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        token: useSystemToken ? '' : llmToken,  // Empty token when using system
        provider: llmProvider,
        use_system_token: useSystemToken
      })
    })

    if (response.ok) {
      const result = await response.json()
      setLlmConfig({
        has_token: true,
        provider: result.provider,
        token_suffix: result.token_suffix,
        token_source: result.token_source
      })
      setLlmToken('')
      setTokenError(null) // Clear any errors on success

      const sourceLabel = result.token_source === 'system' ? 'system token' : 'custom token'
      toast.success(`Successfully connected ${result.provider} using ${sourceLabel}`)
    } else {
      const error = await response.json()
      const errorDetail = error.detail || 'Failed to connect AI'

      // Provide specific feedback based on error type
      let title = "Connection Failed"
      let description = errorDetail

      if (errorDetail.includes('format')) {
        title = "Invalid Token Format"
        description = `${llmProvider === 'openai' ? 'OpenAI' : 'Anthropic'} tokens must start with "${llmProvider === 'openai' ? 'sk-' : 'sk-ant-api'}"`
      } else if (errorDetail.includes('verification failed') || errorDetail.includes('check your')) {
        title = "Invalid API Token"
        description = `The ${llmProvider === 'openai' ? 'OpenAI' : 'Anthropic'} token appears to be invalid or expired. Please verify your token and try again.`
      } else if (errorDetail.includes('connect')) {
        title = "Connection Error"
        description = `Unable to connect to ${llmProvider === 'openai' ? 'OpenAI' : 'Anthropic'} API. Please check your internet connection and try again.`
      }

      throw new Error(description)
    }
  } catch (error) {
    console.error('Failed to connect AI:', error)
    const errorMessage = error instanceof Error ? error.message : "Failed to connect to AI service"

    // Determine toast title based on error content
    let toastTitle = "Connection Failed"
    if (errorMessage.includes('Invalid Token Format') || errorMessage.includes('must start with')) {
      toastTitle = "Invalid Token Format"
    } else if (errorMessage.includes('invalid or expired') || errorMessage.includes('verify your token')) {
      toastTitle = "Invalid API Token"
    } else if (errorMessage.includes('Connection Error') || errorMessage.includes('internet connection')) {
      toastTitle = "Connection Error"
    }

    // Set the error on the input field as well
    setTokenError(errorMessage)

    toast.error(errorMessage)
  } finally {
    setIsConnectingAI(false)
  }
}

/**
 * Disconnect AI/LLM provider
 */
export async function handleDisconnectAI(
  setLlmConfig: (config: any) => void
): Promise<void> {
  try {
    const authToken = localStorage.getItem('auth_token')
    if (!authToken) {
      throw new Error('No authentication token found')
    }

    const response = await fetch(`${API_BASE}/llm/token`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    })

    if (response.ok) {
      setLlmConfig({has_token: false})
      toast.success("LLM token removed successfully")
    } else {
      throw new Error('Failed to disconnect AI')
    }
  } catch (error) {
    console.error('Failed to disconnect AI:', error)
    toast.error("Failed to disconnect AI service")
  }
}
