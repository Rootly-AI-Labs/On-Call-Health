"use client"

import { useState, useEffect } from "react"
import { OrganizationManagementDialog } from "@/app/integrations/dialogs/OrganizationManagementDialog"
import { toast } from "sonner"

interface TeamManagementDialogProps {
  isOpen: boolean
  onClose: () => void
}

export function TeamManagementDialog({ isOpen, onClose }: TeamManagementDialogProps) {
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteRole, setInviteRole] = useState("member")
  const [isInviting, setIsInviting] = useState(false)
  const [orgMembers, setOrgMembers] = useState([])
  const [pendingInvitations, setPendingInvitations] = useState([])
  const [loadingOrgData, setLoadingOrgData] = useState(false)
  const [userInfo, setUserInfo] = useState<{ name: string; email: string; role: string } | null>(null)

  // Load user info from localStorage
  useEffect(() => {
    const userName = localStorage.getItem("user_name")
    const userEmail = localStorage.getItem("user_email")
    const userRole = localStorage.getItem("user_role")
    if (userName && userEmail) {
      setUserInfo({ name: userName, email: userEmail, role: userRole || "member" })
    }
  }, [])

  // Fetch organization data when dialog opens
  useEffect(() => {
    if (isOpen) {
      fetchOrganizationData()
    }
  }, [isOpen])

  const fetchOrganizationData = async () => {
    setLoadingOrgData(true)
    try {
      const token = localStorage.getItem("auth_token")
      const headers = { Authorization: `Bearer ${token}` }

      // Fetch organization members
      const membersResponse = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/organizations/members`,
        { headers }
      )
      if (membersResponse.ok) {
        const membersData = await membersResponse.json()
        setOrgMembers(membersData)
      }

      // Fetch pending invitations
      const invitationsResponse = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/invitations/pending`,
        { headers }
      )
      if (invitationsResponse.ok) {
        const invitationsData = await invitationsResponse.json()
        setPendingInvitations(invitationsData)
      }
    } catch (error) {
      console.error("Error fetching organization data:", error)
      toast.error("Failed to load team data")
    } finally {
      setLoadingOrgData(false)
    }
  }

  const handleInvite = async () => {
    if (!inviteEmail) {
      toast.error("Please enter an email address")
      return
    }

    setIsInviting(true)
    try {
      const token = localStorage.getItem("auth_token")
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/invitations`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          email: inviteEmail,
          role: inviteRole,
        }),
      })

      if (response.ok) {
        toast.success(`Invitation sent to ${inviteEmail}`)
        setInviteEmail("")
        setInviteRole("member")
        // Refresh the data
        await fetchOrganizationData()
      } else {
        const errorData = await response.json()
        toast.error(errorData.detail || "Failed to send invitation")
      }
    } catch (error) {
      console.error("Error sending invitation:", error)
      toast.error("Failed to send invitation")
    } finally {
      setIsInviting(false)
    }
  }

  const handleRoleChange = async (userId: number, newRole: string) => {
    try {
      const token = localStorage.getItem("auth_token")
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/users/${userId}/role?new_role=${newRole}`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      )

      if (response.ok) {
        toast.success("Role updated successfully")
        // Refresh the data
        await fetchOrganizationData()
      } else {
        const errorData = await response.json()
        toast.error(errorData.detail || "Failed to update role")
      }
    } catch (error) {
      console.error("Error updating role:", error)
      toast.error("Failed to update role")
    }
  }

  const handleClose = () => {
    setInviteEmail("")
    setInviteRole("member")
    onClose()
  }

  return (
    <OrganizationManagementDialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) handleClose()
      }}
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
      onClose={handleClose}
    />
  )
}
