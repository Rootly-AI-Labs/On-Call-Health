import { toast } from "sonner"
import { API_BASE } from "../types"

/**
 * Send invitation to new organization member
 */
export async function handleInvite(
  inviteEmail: string,
  inviteRole: string,
  setIsInviting: (loading: boolean) => void,
  setInviteEmail: (email: string) => void,
  setInviteRole: (role: string) => void,
  setShowInviteModal: (show: boolean) => void,
  loadOrganizationData: () => Promise<void>
): Promise<void> {
  if (!inviteEmail.trim()) {
    toast.error("Please enter an email address")
    return
  }

  setIsInviting(true)
  try {
    const authToken = localStorage.getItem('auth_token')
    if (!authToken) {
      toast.error("Authentication required")
      return
    }

    const apiUrl = `${API_BASE}/api/invitations/create`

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: inviteEmail.trim(),
        role: inviteRole
      })
    })

    if (!response.ok) {
      const responseText = await response.text()

      // Try to parse as JSON, fallback to text
      let errorMessage = 'Failed to send invitation'
      try {
        const errorData = JSON.parse(responseText)
        errorMessage = errorData.detail || errorMessage
      } catch {
        errorMessage = responseText.includes('<!DOCTYPE')
          ? 'API server not available or wrong URL'
          : responseText
      }

      throw new Error(errorMessage)
    }

    const data = await response.json()
    toast.success(`Invitation sent to ${inviteEmail}! They'll receive a notification and can accept within 30 days.`)

    // Reset form and refresh organization data
    setInviteEmail("")
    setInviteRole("member")
    setShowInviteModal(false)

    // Refresh the organization data to show the new invitation
    await loadOrganizationData()

  } catch (error) {
    console.error('Failed to send invitation:', error)
    toast.error(error instanceof Error ? error.message : "Failed to send invitation")
  } finally {
    setIsInviting(false)
  }
}

/**
 * Update role for organization member
 */
export async function handleRoleChange(
  userId: number,
  newRole: string,
  loadOrganizationData: () => Promise<void>
): Promise<void> {
  const authToken = localStorage.getItem('auth_token')
  if (!authToken) {
    toast.error("Authentication required")
    return
  }

  try {
    const response = await fetch(`${API_BASE}/api/auth/users/${userId}/role?new_role=${newRole}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${authToken}`,
      }
    })

    if (response.ok) {
      const data = await response.json()
      toast.success(data.message || `Role updated successfully`)
      // Reload organization data to reflect the change
      await loadOrganizationData()
    } else {
      const errorData = await response.json()
      throw new Error(errorData.detail || 'Failed to update role')
    }
  } catch (error) {
    console.error('Failed to update role:', error)
    toast.error(error instanceof Error ? error.message : 'Failed to update role')
  }
}

/**
 * Load organization members and pending invitations
 */
export async function loadOrganizationData(
  setLoadingOrgData: (loading: boolean) => void,
  setOrgMembers: (members: any[]) => void,
  setPendingInvitations: (invitations: any[]) => void
): Promise<void> {
  const authToken = localStorage.getItem('auth_token')
  if (!authToken) return

  setLoadingOrgData(true)
  try {
    // Load organization members
    const membersResponse = await fetch(`${API_BASE}/api/invitations/organization/members`, {
      headers: {
        'Authorization': `Bearer ${authToken}`,
      }
    })

    if (membersResponse.ok) {
      const membersData = await membersResponse.json()
      setOrgMembers(membersData.members || [])
    }

    // Load pending invitations
    const invitationsResponse = await fetch(`${API_BASE}/api/invitations/pending`, {
      headers: {
        'Authorization': `Bearer ${authToken}`,
      }
    })

    if (invitationsResponse.ok) {
      const invitationsData = await invitationsResponse.json()
      setPendingInvitations(invitationsData.invitations || [])
    }

  } catch (error) {
    console.error('Failed to load organization data:', error)
  } finally {
    setLoadingOrgData(false)
  }
}
