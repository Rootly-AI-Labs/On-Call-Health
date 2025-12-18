import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Users, Mail, Loader2 } from "lucide-react"
import { UserInfo } from "../types"

interface OrganizationMember {
  id: number
  name: string
  email: string
  role: string
  is_current_user: boolean
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
  userInfo: UserInfo | null
  onRoleChange: (userId: number, newRole: string) => void
  onClose: () => void
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
  userInfo,
  onRoleChange,
  onClose
}: OrganizationManagementDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <Users className="w-5 h-5" />
            <span>Organization Management</span>
          </DialogTitle>
          <DialogDescription>
            Invite new members and manage your organization
          </DialogDescription>
        </DialogHeader>

        {/* Role descriptions - at the top of modal */}
        <div className="mt-4 px-4 py-3 bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg">
          <div className="space-y-1.5 text-xs">
            <div className="flex items-baseline space-x-2">
              <span className="font-semibold text-gray-900 min-w-[80px]">Admin</span>
              <span className="text-gray-700">Full access: manage members, integrations, run analyses, send surveys, and configure settings</span>
            </div>
            <div className="flex items-baseline space-x-2">
              <span className="font-semibold text-gray-900 min-w-[80px]">Member</span>
              <span className="text-gray-700">Can view team burnout data, run analyses, and send surveys</span>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          {/* Invite New Member Section - Only visible to admins */}
          {(userInfo?.role === 'admin' || userInfo?.role === 'org_admin') && (
            <div className="p-6 border rounded-lg bg-gradient-to-br from-purple-50 to-white">
              <div className="flex items-start space-x-4">
                <div className="flex-shrink-0 w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                  <Mail className="w-5 h-5 text-purple-600" />
                </div>
                <div className="flex-1 space-y-4">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">Invite Team Member</h3>
                    <p className="text-sm text-gray-500 mt-1">Send an invitation to join your organization</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="invite-email" className="block text-sm font-medium text-gray-700 mb-1.5">
                        Email Address
                      </label>
                      <Input
                        id="invite-email"
                        type="email"
                        placeholder="colleague@company.com"
                        value={inviteEmail}
                        onChange={(e) => onInviteEmailChange(e.target.value)}
                        className="w-full"
                      />
                    </div>
                    <div>
                      <label htmlFor="invite-role" className="block text-sm font-medium text-gray-700 mb-1.5">
                        Role
                      </label>
                      <select
                        id="invite-role"
                        value={inviteRole}
                        onChange={(e) => onInviteRoleChange(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white"
                      >
                        <option value="member">Member</option>
                        <option value="admin">Admin</option>
                      </select>
                    </div>
                  </div>

                  <Button
                    onClick={onInvite}
                    disabled={isInviting || !inviteEmail.trim()}
                    className="w-full md:w-auto bg-purple-600 hover:bg-purple-700"
                  >
                    {isInviting ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Sending Invitation...
                      </>
                    ) : (
                      <>
                        <Mail className="w-4 h-4 mr-2" />
                        Send Invitation
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Current Members & Pending Invitations */}
          {loadingOrgData ? (
            <div className="text-center py-8">
              <Loader2 className="w-8 h-8 mx-auto mb-4 animate-spin text-gray-400" />
              <p className="text-gray-500">Loading organization data...</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Current Members */}
              {orgMembers.length > 0 && (
                <div>
                  <h3 className="text-lg font-medium mb-3 flex items-center space-x-2">
                    <Users className="w-5 h-5" />
                    <span>Organization Members ({orgMembers.length})</span>
                  </h3>
                  <div className="border rounded-lg overflow-hidden">
                    <div className="bg-gray-50 px-4 py-2 border-b">
                      <div className="grid grid-cols-3 gap-4 text-sm font-medium text-gray-700">
                        <div>Name</div>
                        <div>Email</div>
                        <div>Role</div>
                      </div>
                    </div>
                    <div className="max-h-60 overflow-y-auto">
                      {orgMembers.map((member) => (
                        <div key={member.id} className="px-4 py-3 border-b last:border-b-0 bg-white hover:bg-gray-50">
                          <div className="grid grid-cols-3 gap-4 text-sm items-center">
                            <div className="font-medium text-gray-900">
                              {member.name}
                              {member.is_current_user && (
                                <span className="ml-2 text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">You</span>
                              )}
                            </div>
                            <div className="text-gray-600">{member.email}</div>
                            <div>
                              {member.is_current_user ? (
                                <span className="inline-block px-2 py-1 text-xs rounded-full bg-green-100 text-green-800 capitalize">
                                  {member.role?.replace('_', ' ') || 'member'}
                                </span>
                              ) : (
                                <div className="relative group">
                                  <select
                                    value={member.role || 'member'}
                                    onChange={(e) => onRoleChange(member.id, e.target.value)}
                                    className="text-xs px-2 py-1 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white disabled:opacity-60 disabled:cursor-not-allowed"
                                    disabled={userInfo?.role !== 'admin' && userInfo?.role !== 'org_admin'}
                                  >
                                    <option value="member">Member</option>
                                    <option value="admin">Admin</option>
                                  </select>
                                  {userInfo?.role !== 'admin' && userInfo?.role !== 'org_admin' && (
                                    <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
                                      Only admins can change roles
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Pending Invitations */}
              {pendingInvitations.length > 0 && (
                <div>
                  <h3 className="text-lg font-medium mb-3 flex items-center space-x-2">
                    <Mail className="w-5 h-5" />
                    <span>Pending Invitations ({pendingInvitations.length})</span>
                  </h3>
                  <div className="border rounded-lg overflow-hidden">
                    <div className="bg-gray-50 px-4 py-2 border-b">
                      <div className="grid grid-cols-5 gap-4 text-sm font-medium text-gray-700">
                        <div>Email</div>
                        <div>Role</div>
                        <div>Invited By</div>
                        <div>Sent</div>
                        <div>Expires</div>
                      </div>
                    </div>
                    <div className="max-h-60 overflow-y-auto">
                      {pendingInvitations.map((invitation) => (
                        <div key={invitation.id} className="px-4 py-3 border-b last:border-b-0 bg-yellow-50">
                          <div className="grid grid-cols-5 gap-4 text-sm">
                            <div className="font-medium text-gray-900">{invitation.email}</div>
                            <div>
                              <span className="inline-block px-2 py-1 text-xs rounded-full bg-yellow-100 text-yellow-800 capitalize">
                                {invitation.role?.replace('_', ' ') || 'member'}
                              </span>
                            </div>
                            <div className="text-gray-600">{invitation.invited_by?.name || 'Unknown'}</div>
                            <div className="text-gray-500 text-xs">
                              {new Date(invitation.created_at).toLocaleDateString()}
                            </div>
                            <div className="text-gray-500 text-xs">
                              {invitation.is_expired ? (
                                <span className="text-red-600">Expired</span>
                              ) : (
                                new Date(invitation.expires_at).toLocaleDateString()
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Empty State */}
              {!loadingOrgData && orgMembers.length === 0 && pendingInvitations.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No organization members or pending invitations found</p>
                  <p className="text-sm mt-1">Start by inviting team members above</p>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={onClose}
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
