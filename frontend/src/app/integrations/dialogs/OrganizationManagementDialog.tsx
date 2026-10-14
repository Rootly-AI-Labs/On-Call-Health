import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Users, Mail, Loader2, Search, ChevronLeft, ChevronRight, AlertCircle, Trash2, Send, Info, ChevronDown, ChevronUp, X } from "lucide-react"
import { useState } from "react"
import { UserInfo } from "../types"
import { toast } from "sonner"

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

/**
 * Check if an email address is a Gmail account
 * @param email - Email address to check
 * @returns true if the email is a Gmail or GoogleMail address
 */
const isGmailAddress = (email: string): boolean => {
  if (!email) return false
  const domain = email.toLowerCase().split('@')[1]
  return domain === 'gmail.com' || domain === 'googlemail.com'
}

const TEAM_MEMBERS_PER_PAGE = 10

interface OrganizationMember {
  id: number | string
  invitation_id?: number
  name: string
  email: string
  role: string
  status: 'active' | 'pending'
  is_current_user: boolean
  joined_at?: string
  invited_at?: string
  expires_at?: string
}

interface PendingInvitation {
  id: number
  email: string
  role: string
  invited_by: { name: string } | null
  created_at: string
  expires_at: string
  is_expired: boolean
}

interface ReceivedInvitation {
  id: number
  organization_id: number
  organization_name: string
  email: string
  role: string
  status: string
  created_at: string
  expires_at: string
  invited_by: { name: string } | null
}

interface OrganizationManagementDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  inviteEmail: string
  onInviteEmailChange: (email: string) => void
  inviteRole: string
  onInviteRoleChange: (role: string) => void
  isInviting: boolean
  onInvite: () => void
  loadingOrgData: boolean
  orgMembers: OrganizationMember[]
  pendingInvitations: PendingInvitation[]
  receivedInvitations: ReceivedInvitation[]
  userInfo: UserInfo | null
  onRoleChange: (userId: number, newRole: string) => void
  onRefreshOrgData: () => Promise<void>
  onClose: () => void
  asInlineView?: boolean  // Flag to render as inline view instead of modal
  title?: string  // Custom title (defaults to "Organization Management")
  subtitle?: string  // Custom subtitle
}

export function OrganizationManagementDialog({
  open,
  onOpenChange,
  inviteEmail,
  onInviteEmailChange,
  inviteRole,
  onInviteRoleChange,
  isInviting,
  onInvite,
  loadingOrgData,
  orgMembers,
  pendingInvitations,
  receivedInvitations,
  userInfo,
  onRoleChange,
  onRefreshOrgData,
  onClose,
  asInlineView = false,  // Default to modal view
  title = "Organization Management",  // Default title
  subtitle = "Invite new members and manage your organization"  // Default subtitle
}: OrganizationManagementDialogProps) {
  // State from HEAD - invitation and member removal
  const [processingInvitationId, setProcessingInvitationId] = useState<number | null>(null)
  const [confirmingInvitationId, setConfirmingInvitationId] = useState<number | null>(null)
  const [removingUserId, setRemovingUserId] = useState<number | null>(null)
  const [confirmRemoveUserId, setConfirmRemoveUserId] = useState<number | null>(null)

  // State from feature/management_page - search and pagination
  const [searchQuery, setSearchQuery] = useState("")
  const [currentPage, setCurrentPage] = useState(1)
  const [showRoleTooltip, setShowRoleTooltip] = useState(false)
  const [showPendingInvitations, setShowPendingInvitations] = useState(false)

  // Handler functions from HEAD
  const handleAcceptInvitation = async (invitationId: number, skipWarning = false) => {
    // Check if user is already in an org and show warning first
    if (!skipWarning && userInfo?.organization_id) {
      setConfirmingInvitationId(invitationId)
      return
    }

    setProcessingInvitationId(invitationId)
    setConfirmingInvitationId(null)
    try {
      const token = localStorage.getItem('auth_token')
      const response = await fetch(`${API_BASE}/api/invitations/accept/${invitationId}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.detail || 'Failed to accept invitation')
      }

      const data = await response.json()

      if (data.success) {
        toast.success(data.message || 'Successfully joined organization!')

        // Update localStorage if org info returned
        if (data.organization) {
          localStorage.setItem('user_organization_id', data.organization.id)
          localStorage.setItem('user_organization_name', data.organization.name)
        }
        if (data.role) {
          localStorage.setItem('user_role', data.role)
        }

        // Reload page to reflect new org membership
        setTimeout(() => {
          // Stay on the same page if already on management, otherwise go to integrations
          const currentPath = window.location.pathname
          if (currentPath === '/management') {
            window.location.href = '/management?view=team'
          } else {
            window.location.href = '/integrations?openOrgModal=true'
          }
        }, 500)
      }
    } catch (error: any) {
      console.error('Error accepting invitation:', error)
      toast.error(error.message || 'Failed to accept invitation')
    } finally {
      setProcessingInvitationId(null)
    }
  }

  const handleRejectInvitation = async (invitationId: number) => {
    setProcessingInvitationId(invitationId)
    setConfirmingInvitationId(null)
    try {
      const token = localStorage.getItem('auth_token')
      const response = await fetch(`${API_BASE}/api/invitations/reject/${invitationId}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.detail || 'Failed to reject invitation')
      }

      const data = await response.json()

      if (data.success) {
        toast.info('Invitation declined')
        await onRefreshOrgData()
      }
    } catch (error: any) {
      console.error('Error rejecting invitation:', error)
      toast.error(error.message || 'Failed to reject invitation')
    } finally {
      setProcessingInvitationId(null)
    }
  }

  const handleRemoveMember = async (userId: number, userName: string) => {
    setRemovingUserId(userId)
    setConfirmRemoveUserId(null)
    try {
      const token = localStorage.getItem('auth_token')
      const response = await fetch(`${API_BASE}/auth/organizations/members/${userId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.detail || 'Failed to remove member')
      }

      const data = await response.json()

      if (data.success) {
        toast.success(`${userName} has been removed from the organization`)
        await onRefreshOrgData()
      }
    } catch (error: any) {
      console.error('Error removing member:', error)
      toast.error(error.message || 'Failed to remove member')
    } finally {
      setRemovingUserId(null)
    }
  }

  const handleCancelInvitation = async (invitationId: number, email: string) => {
    setProcessingInvitationId(invitationId)
    try {
      const token = localStorage.getItem('auth_token')
      const response = await fetch(`${API_BASE}/api/invitations/${invitationId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.detail || 'Failed to cancel invitation')
      }

      if (data.success) {
        toast.success(`Invitation to ${email} has been cancelled`)
        await onRefreshOrgData()
      }
    } catch (error: any) {
      console.error('Error cancelling invitation:', error)
      toast.error(error.message || 'Failed to cancel invitation')
    } finally {
      setProcessingInvitationId(null)
    }
  }

  // Filter members based on search query (from feature/management_page)
  const filteredMembers = orgMembers.filter((member) => {
    if (!searchQuery) return true
    const query = searchQuery.toLowerCase()
    return (
      member.name.toLowerCase().includes(query) ||
      member.email.toLowerCase().includes(query)
    )
  })

  // Pagination calculations (from feature/management_page)
  const totalPages = Math.ceil(filteredMembers.length / TEAM_MEMBERS_PER_PAGE)
  const startIndex = (currentPage - 1) * TEAM_MEMBERS_PER_PAGE
  const paginatedMembers = filteredMembers.slice(startIndex, startIndex + TEAM_MEMBERS_PER_PAGE)

  const dialogContentBody = (
    <>
      <div className="space-y-6">
          {/* Received Invitations - Show at top if user has any */}
          {receivedInvitations.length > 0 && (
            <div className={asInlineView ? "space-y-3 mx-6 mt-6" : "space-y-3"}>
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-neutral-500" />
                <h3 className="text-sm font-medium text-neutral-700">
                  Pending Invitation{receivedInvitations.length > 1 ? 's' : ''}
                </h3>
              </div>

              <div className="space-y-2">
                {receivedInvitations.map((invitation) => (
                  <div key={invitation.id} className="group relative rounded-lg border border-neutral-200 bg-white hover:border-neutral-300 hover:shadow-xs transition-all">
                    <div className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-medium text-neutral-900 truncate">{invitation.organization_name}</h4>
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-neutral-100 text-neutral-700 capitalize">
                              {invitation.role}
                            </span>
                          </div>
                          <p className="text-sm text-neutral-600">
                            From {invitation.invited_by?.name || 'Unknown'}
                          </p>
                          <p className="text-xs text-neutral-500 mt-1">
                            Expires {new Date(invitation.expires_at).toLocaleDateString()}
                          </p>

                          {/* Warning about leaving current org - Always visible if user is in an org */}
                          {userInfo?.organization_id && (
                            <div className="mt-3 flex items-start gap-2 p-3 rounded-md bg-orange-50 border-2 border-orange-300">
                              <AlertCircle className="h-5 w-5 text-orange-600 shrink-0 mt-0.5" />
                              <div>
                                <p className="text-sm font-semibold text-orange-900 mb-1">
                                  ⚠️ You will leave your current organization
                                </p>
                                <p className="text-xs text-orange-800">
                                  Accepting this invitation will remove you from your current organization and move you to <span className="font-semibold">{invitation.organization_name}</span>
                                </p>
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleRejectInvitation(invitation.id)}
                            disabled={processingInvitationId !== null}
                            className="text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100"
                          >
                            {processingInvitationId === invitation.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              'Decline'
                            )}
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => handleAcceptInvitation(invitation.id)}
                            disabled={processingInvitationId !== null}
                            className="bg-neutral-900 hover:bg-neutral-800 text-white"
                          >
                            {processingInvitationId === invitation.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              'Accept'
                            )}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Invite New Member Section - Only visible to admins */}
          {(userInfo?.role === 'admin') && (
            <div className={asInlineView ? "mx-6 mt-6 pb-6 border-b border-neutral-200" : "pb-6 border-b border-neutral-200"}>
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-neutral-900">Invite a team member</h3>
                <div className="flex flex-col gap-3 md:flex-row md:items-end">
                  <div className="flex flex-col">
                    <label htmlFor="invite-email" className="text-xs font-medium text-neutral-600 mb-1">Email</label>
                    <Input
                      id="invite-email"
                      type="email"
                      placeholder="colleague@company.com"
                      value={inviteEmail}
                      onChange={(e) => onInviteEmailChange(e.target.value)}
                      className="w-full md:w-72"
                    />
                  </div>
                  <div className="flex flex-col">
                    <label htmlFor="invite-role" className="text-xs font-medium text-neutral-600 mb-1">Role</label>
                    <select
                      id="invite-role"
                      value={inviteRole}
                      onChange={(e) => onInviteRoleChange(e.target.value)}
                      className="px-3 py-2.5 border border-neutral-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-purple-500 bg-white text-sm h-10"
                    >
                      <option value="member">Member</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                  <div className="flex flex-col">
                    <label className="text-xs font-medium text-neutral-600 mb-1">&nbsp;</label>
                    <Button
                      onClick={onInvite}
                      disabled={isInviting || !inviteEmail.trim()}
                      className="bg-purple-700 hover:bg-purple-800 h-10 px-4 py-2.5"
                    >
                      {isInviting ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <>
                          <Send className="w-4 h-4 mr-2" />
                          Invite
                        </>
                      )}
                    </Button>
                  </div>
                </div>

                {/* Pending Invitations Collapsible - Under Invite Section */}
                {pendingInvitations.length > 0 && (
                  <div className="mt-3">
                    <button
                      onClick={() => setShowPendingInvitations(!showPendingInvitations)}
                      className="flex items-center gap-2 text-xs text-blue-600 hover:text-blue-700 transition-colors"
                    >
                      <AlertCircle className="w-3.5 h-3.5" />
                      <span>{pendingInvitations.length} pending invitation{pendingInvitations.length > 1 ? 's' : ''}</span>
                      {showPendingInvitations ? (
                        <ChevronUp className="w-3 h-3" />
                      ) : (
                        <ChevronDown className="w-3 h-3" />
                      )}
                    </button>

                    {showPendingInvitations && (
                      <div className="mt-3 space-y-2">
                        {pendingInvitations.map((invitation) => (
                          <div key={invitation.id} className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between md:gap-3 p-3 bg-blue-50 rounded-md border border-blue-200 text-xs">
                            <span className="font-medium text-neutral-900 shrink-0">{invitation.email}</span>
                            <span className={`px-2 py-0.5 rounded-full capitalize shrink-0 ${
                              invitation.role === 'admin'
                                ? 'bg-red-100 text-red-800'
                                : 'bg-yellow-100 text-yellow-800'
                            }`}>
                              {invitation.role}
                            </span>
                            <span className="text-neutral-600 shrink-0">Invited by {invitation.invited_by?.name || 'Unknown'}</span>
                            <span className="text-neutral-500 shrink-0">Expires {new Date(invitation.expires_at).toLocaleDateString()}</span>
                            <button
                              onClick={() => handleCancelInvitation(invitation.id, invitation.email)}
                              disabled={processingInvitationId === invitation.id}
                              className="flex items-center gap-1 px-2 py-1 text-red-600 hover:text-red-700 hover:bg-red-50 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                              title="Cancel invitation"
                            >
                              {processingInvitationId === invitation.id ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <>
                                  <X className="w-3.5 h-3.5" />
                                  <span>Cancel</span>
                                </>
                              )}
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Current Members & Pending Invitations */}
          {loadingOrgData ? (
            <div className="text-center py-8">
              <Loader2 className="w-8 h-8 mx-auto mb-4 animate-spin text-neutral-500" />
              <p className="text-neutral-500">Loading organization data...</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Team Members Header and Search Bar */}
              {orgMembers.length > 0 && (
                <div className={`${asInlineView ? "px-6 mt-4" : "mt-4"} flex flex-col gap-4 md:flex-row md:items-center md:justify-between`}>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-neutral-900">Team Members</h3>
                    <span className="flex items-center justify-center w-6 h-6 rounded-full bg-neutral-200 text-xs font-medium text-neutral-700">{orgMembers.length}</span>
                  </div>
                  <div className="w-full sm:w-64 md:w-80">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                      <Input
                        type="text"
                        placeholder="Search members..."
                        value={searchQuery}
                        onChange={(e) => {
                          setSearchQuery(e.target.value)
                          setCurrentPage(1)
                        }}
                        className="pl-9 w-full"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Current Members */}
              {filteredMembers.length > 0 && (
                <div>
                  <div className="overflow-x-auto overflow-y-visible">
                    <table className="w-full overflow-visible">
                      <thead className="overflow-visible">
                        <tr className="border-t border-b border-neutral-200 bg-neutral-50 overflow-visible">
                          <th className="text-left py-3 px-6 text-sm font-semibold text-neutral-700">Name</th>
                          <th className="text-left py-3 px-6 text-sm font-semibold text-neutral-700">Email</th>
                          <th className="text-left py-3 px-6 text-sm font-semibold text-neutral-700 overflow-visible">
                            <div className="flex items-center gap-2 relative overflow-visible">
                              <span>Role</span>
                              <button
                                type="button"
                                onMouseEnter={() => setShowRoleTooltip(true)}
                                onMouseLeave={() => setShowRoleTooltip(false)}
                                className="cursor-help"
                              >
                                <Info className="w-4 h-4 text-neutral-500 hover:text-neutral-700" />
                              </button>
                              {showRoleTooltip && (
                                <div className="absolute bg-neutral-900 text-white text-xs rounded-md px-3 py-2 w-60 whitespace-normal pointer-events-auto" style={{
                                  top: '100%',
                                  left: '50%',
                                  marginTop: '8px',
                                  transform: 'translateX(-50%)',
                                  zIndex: 9999
                                }}>
                                  <div className="absolute -top-1 left-1/2 -translate-x-1/2 border-4 border-transparent border-b-neutral-900"></div>
                                  <div className="text-xs">
                                    <strong>Admin:</strong> Full access: manage members, integrations, run analyses, send surveys, and configure settings.
                                  </div>
                                  <div className="text-xs mt-1">
                                    <strong>Member:</strong> Can view team health data, run analyses, and send surveys.
                                  </div>
                                </div>
                              )}
                            </div>
                          </th>
                          <th className="text-left py-3 px-6 text-sm font-semibold text-neutral-700"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedMembers.map((member, index) => (
                          <tr key={member.id} className="border-b border-neutral-100 hover:bg-neutral-50">
                            <td className="py-2 px-6">
                              <div className="flex items-center gap-3">
                                <span className="text-sm font-medium text-neutral-900">
                                  {member.name}
                                  {member.is_current_user && (
                                    <span className="ml-2 text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">You</span>
                                  )}
                                </span>
                              </div>
                            </td>
                            <td className="py-2 px-6">
                              <span className="text-sm text-neutral-600">{member.email}</span>
                            </td>
                            <td className="py-2 px-6">
                              {userInfo?.role === 'admin' && !member.is_current_user ? (
                                <select
                                  value={member.role || 'member'}
                                  onChange={(e) => onRoleChange(member.id as number, e.target.value)}
                                  className="text-sm px-2 py-1 border border-neutral-300 rounded-md focus:outline-hidden focus:ring-2 focus:ring-purple-500 bg-white"
                                >
                                  <option value="member">Member</option>
                                  <option value="admin">Admin</option>
                                </select>
                              ) : (
                                <span className="text-sm text-neutral-900 capitalize px-3 py-2.5">
                                  {member.role?.replace('_', ' ') || 'member'}
                                </span>
                              )}
                            </td>
                            <td className="py-2 px-6">
                              <div className="flex justify-end">
                                {!member.is_current_user && userInfo?.role === 'admin' && (
                                  confirmRemoveUserId === member.id ? (
                                    <div className="flex items-center gap-2">
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => handleRemoveMember(member.id as number, member.name)}
                                        disabled={removingUserId !== null}
                                        className="h-7 text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
                                      >
                                        {removingUserId === member.id ? (
                                          <Loader2 className="w-3 h-3 animate-spin" />
                                        ) : (
                                          'Confirm'
                                        )}
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => setConfirmRemoveUserId(null)}
                                        disabled={removingUserId !== null}
                                        className="h-7 text-xs"
                                      >
                                        Cancel
                                      </Button>
                                    </div>
                                  ) : (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => setConfirmRemoveUserId(member.id as number)}
                                      disabled={removingUserId !== null}
                                      className="h-8 w-8 p-0 text-neutral-500 hover:text-red-600 hover:bg-red-50"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </Button>
                                  )
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {/* Pagination Controls */}
                  <div className="flex items-center justify-between px-6 py-4 border-t border-neutral-200">
                    <p className="text-sm text-neutral-600">
                      Showing {startIndex + 1}-{Math.min(startIndex + TEAM_MEMBERS_PER_PAGE, filteredMembers.length)} of {filteredMembers.length}
                    </p>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-neutral-600">
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
                </div>
              )}

              {/* Empty State - No results from search */}
              {filteredMembers.length === 0 && orgMembers.length > 0 && (
                <div className={asInlineView ? "px-6 text-center py-8 text-neutral-500" : "text-center py-8 text-neutral-500"}>
                  <p>No members found matching your search</p>
                </div>
              )}

              {/* Empty State - No members at all */}
              {!loadingOrgData && orgMembers.length === 0 && pendingInvitations.length === 0 && (
                <div className={asInlineView ? "px-6 text-center py-8 text-neutral-500" : "text-center py-8 text-neutral-500"}>
                  <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  {userInfo && isGmailAddress(userInfo.email) ? (
                    <>
                      <p>Organizations are available for company email addresses</p>
                      <p className="text-sm mt-1">
                        Gmail users can join organizations when invited by someone with a company email
                      </p>
                    </>
                  ) : (
                    <>
                      <p>No organization members or pending invitations found</p>
                      <p className="text-sm mt-1">Start by inviting team members above</p>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

      {!asInlineView && (
        <DialogFooter>
          <Button
            variant="outline"
            onClick={onClose}
          >
            Close
          </Button>
        </DialogFooter>
      )}
    </>
  )

  // Get the invitation being confirmed for the modal
  const confirmingInvitation = receivedInvitations.find(inv => inv.id === confirmingInvitationId)

  // If inline view, render content without Dialog wrapper
  if (asInlineView) {
    return (
      <>
        {/* Content */}
        {dialogContentBody}

        {/* Confirmation Modal */}
        {confirmingInvitation && userInfo?.organization_id && (
          <Dialog open={!!confirmingInvitationId} onOpenChange={() => setConfirmingInvitationId(null)}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 text-orange-600" />
                  <span>Leave Current Organization?</span>
                </DialogTitle>
                <div className="text-left pt-4 space-y-3">
                  <div className="text-sm font-medium text-neutral-900">
                    You are about to leave your current organization and join <span className="font-semibold text-orange-600">{confirmingInvitation.organization_name}</span>.
                  </div>
                  <div className="bg-orange-50 border border-orange-200 rounded-md p-3">
                    <div className="text-xs text-orange-900">
                      <span className="font-semibold">⚠️ Warning:</span> This action will remove you from your current organization. You will lose access to all data and resources associated with it.
                    </div>
                  </div>
                  <div className="text-sm text-neutral-600">
                    Are you sure you want to continue?
                  </div>
                </div>
              </DialogHeader>
              <DialogFooter className="gap-2">
                <Button
                  variant="ghost"
                  onClick={() => setConfirmingInvitationId(null)}
                  disabled={processingInvitationId !== null}
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => handleAcceptInvitation(confirmingInvitationId!, true)}
                  disabled={processingInvitationId !== null}
                  className="bg-orange-600 hover:bg-orange-700 text-white"
                >
                  {processingInvitationId === confirmingInvitationId ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    'Yes, Leave and Join'
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </>
    )
  }

  // Original modal rendering
  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center space-x-2">
              <Users className="w-5 h-5" />
              <span>{title}</span>
            </DialogTitle>
            <DialogDescription>
              {subtitle}
            </DialogDescription>
          </DialogHeader>

          {dialogContentBody}
        </DialogContent>
      </Dialog>

      {/* Confirmation Modal */}
      {confirmingInvitation && userInfo?.organization_id && (
        <Dialog open={!!confirmingInvitationId} onOpenChange={() => setConfirmingInvitationId(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-orange-600" />
                <span>Leave Current Organization?</span>
              </DialogTitle>
              <DialogDescription className="text-left pt-4">
                <div className="space-y-3">
                  <p className="text-sm font-medium text-neutral-900">
                    You are about to leave your current organization and join <span className="font-semibold text-orange-600">{confirmingInvitation.organization_name}</span>.
                  </p>
                  <div className="bg-orange-50 border border-orange-200 rounded-md p-3">
                    <p className="text-xs text-orange-900">
                      <span className="font-semibold">⚠️ Warning:</span> This action will remove you from your current organization. You will lose access to all data and resources associated with it.
                    </p>
                  </div>
                  <p className="text-sm text-neutral-600">
                    Are you sure you want to continue?
                  </p>
                </div>
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2">
              <Button
                variant="ghost"
                onClick={() => setConfirmingInvitationId(null)}
                disabled={processingInvitationId !== null}
              >
                Cancel
              </Button>
              <Button
                onClick={() => handleAcceptInvitation(confirmingInvitationId!, true)}
                disabled={processingInvitationId !== null}
                className="bg-orange-600 hover:bg-orange-700 text-white"
              >
                {processingInvitationId === confirmingInvitationId ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  'Yes, Leave and Join'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}
