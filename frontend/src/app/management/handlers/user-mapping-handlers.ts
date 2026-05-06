import { API_BASE } from "@/app/integrations/types"
import { toast } from "sonner"

/**
 * Update user correlation mappings
 */
export async function updateUserCorrelation(
  userId: number,
  updates: {
    github_username?: string
    jira_account_id?: string
    jira_email?: string
    linear_user_id?: string
    slack_user_id?: string
    openai_user_id?: string
  }
): Promise<boolean> {
  const authToken = localStorage.getItem("auth_token")
  if (!authToken) {
    toast.error("Please log in")
    return false
  }

  try {
    // Update each integration field with separate PATCH requests
    const promises: Promise<Response>[] = []

    if (updates.github_username !== undefined) {
      promises.push(
        fetch(
          `${API_BASE}/rootly/user-correlation/${userId}/github-username?github_username=${encodeURIComponent(updates.github_username)}`,
          {
            method: "PATCH",
            headers: { Authorization: `Bearer ${authToken}` },
          }
        )
      )
    }

    if (updates.jira_account_id !== undefined) {
      const params = new URLSearchParams()
      params.append("jira_account_id", updates.jira_account_id)
      if (updates.jira_email) {
        params.append("jira_email", updates.jira_email)
      }
      promises.push(
        fetch(
          `${API_BASE}/rootly/user-correlation/${userId}/jira-mapping?${params}`,
          {
            method: "PATCH",
            headers: { Authorization: `Bearer ${authToken}` },
          }
        )
      )
    }

    if (updates.linear_user_id !== undefined) {
      promises.push(
        fetch(
          `${API_BASE}/rootly/user-correlation/${userId}/linear-mapping?linear_user_id=${encodeURIComponent(updates.linear_user_id)}`,
          {
            method: "PATCH",
            headers: { Authorization: `Bearer ${authToken}` },
          }
        )
      )
    }

    if (updates.slack_user_id !== undefined) {
      promises.push(
        fetch(
          `${API_BASE}/rootly/user-correlation/${userId}/slack-mapping?slack_user_id=${encodeURIComponent(updates.slack_user_id)}`,
          {
            method: "PATCH",
            headers: { Authorization: `Bearer ${authToken}` },
          }
        )
      )
    }

    if (updates.openai_user_id !== undefined) {
      promises.push(
        fetch(
          `${API_BASE}/rootly/user-correlation/${userId}/openai-mapping?openai_user_id=${encodeURIComponent(updates.openai_user_id)}`,
          {
            method: "PATCH",
            headers: { Authorization: `Bearer ${authToken}` },
          }
        )
      )
    }

    // Wait for all requests to complete
    const responses = await Promise.all(promises)

    // Check if all responses are OK
    for (const response of responses) {
      if (!response.ok) {
        // Provide specific error messages based on status code
        let errorMessage = "Failed to update mappings"

        try {
          const error = await response.json()
          const detail = error.detail || ""

          switch (response.status) {
            case 400:
              errorMessage = `Validation error: ${detail || "Invalid data provided"}`
              break
            case 401:
              errorMessage = "Session expired. Please log in again"
              // Clear auth token on 401
              localStorage.removeItem("auth_token")
              break
            case 403:
              errorMessage = "You don't have permission to update user mappings"
              break
            case 404:
              errorMessage = "User not found. They may have been removed"
              break
            case 409:
              errorMessage = `Conflict: ${detail || "This mapping may already exist"}`
              break
            case 500:
            case 502:
            case 503:
              errorMessage = "Server error. Please try again later"
              break
            default:
              errorMessage = detail || "Failed to update mappings"
          }
        } catch {
          // If response body is not JSON, use status-based message
          errorMessage = response.status === 401
            ? "Session expired. Please log in again"
            : `Server error (${response.status})`
        }

        toast.error(errorMessage)
        return false
      }
    }

    return true
  } catch (error) {
    console.error("Error updating user correlation:", error)
    // Network or other errors
    if (error instanceof TypeError && error.message.includes("fetch")) {
      toast.error("Network error. Check your connection and try again")
    } else {
      toast.error(error instanceof Error ? error.message : "Error updating mappings")
    }
    return false
  }
}

/**
 * Fetch available GitHub users from organization
 */
export async function fetchGithubUsers(
  organizationId: string
): Promise<string[]> {
  const authToken = localStorage.getItem("auth_token")
  if (!authToken) return []

  try {
    const response = await fetch(
      `${API_BASE}/integrations/github/org-members`,
      {
        headers: { Authorization: `Bearer ${authToken}` },
      }
    )

    if (response.ok) {
      const data = await response.json()
      return data.members || []
    }
    return []
  } catch (error) {
    console.error("Error fetching GitHub users:", error)
    return []
  }
}

/**
 * Fetch available Jira users from integration
 */
export async function fetchJiraUsers(
  integrationId: string
): Promise<any[]> {
  const authToken = localStorage.getItem("auth_token")
  if (!authToken) return []

  try {
    const response = await fetch(
      `${API_BASE}/integrations/jira/jira-users`,
      {
        headers: { Authorization: `Bearer ${authToken}` },
      }
    )

    if (response.ok) {
      const data = await response.json()
      return data.users || []
    }
    return []
  } catch (error) {
    console.error("Error fetching Jira users:", error)
    return []
  }
}

/**
 * Fetch available Linear users from integration
 */
export async function fetchLinearUsers(
  integrationId: string
): Promise<any[]> {
  const authToken = localStorage.getItem("auth_token")
  if (!authToken) return []

  try {
    const response = await fetch(
      `${API_BASE}/integrations/linear/linear-users`,
      {
        headers: { Authorization: `Bearer ${authToken}` },
      }
    )

    if (response.ok) {
      const data = await response.json()
      return data.users || []
    }
    return []
  } catch (error) {
    console.error("Error fetching Linear users:", error)
    return []
  }
}

/**
 * Fetch OpenAI org members for manual mapping
 */
export async function fetchOpenAIMembers(): Promise<{ id: string; email: string }[]> {
  const authToken = localStorage.getItem("auth_token")
  if (!authToken) return []

  try {
    const response = await fetch(`${API_BASE}/integrations/ai-usage/openai-members`, {
      headers: { Authorization: `Bearer ${authToken}` },
    })
    if (response.ok) {
      const data = await response.json()
      return data.members || []
    }
    return []
  } catch (error) {
    console.error("Error fetching OpenAI members:", error)
    return []
  }
}

/**
 * Fetch available Slack users from workspace
 */
export async function fetchSlackUsers(
  integrationId: string
): Promise<any[]> {
  const authToken = localStorage.getItem("auth_token")
  if (!authToken) return []

  try {
    const response = await fetch(
      `${API_BASE}/integrations/slack/slack-users`,
      {
        headers: { Authorization: `Bearer ${authToken}` },
      }
    )

    if (response.ok) {
      const data = await response.json()
      return data.users || []
    }
    return []
  } catch (error) {
    console.error("Error fetching Slack users:", error)
    return []
  }
}
