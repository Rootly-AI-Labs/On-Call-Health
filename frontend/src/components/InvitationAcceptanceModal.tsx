"use client"

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { CheckCircle, AlertCircle, Loader2, Building2, Users, Mail } from 'lucide-react'
import { toast } from 'sonner'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

interface Invitation {
  id: number
  organization_id: number
  email: string
  role: string
  status: string
  created_at: string
  expires_at?: string
  organization_name: string
}

interface InvitationAcceptanceModalProps {
  invitationId: number | null
  isOpen: boolean
  onClose: () => void
  onAccepted?: () => void
}

export function InvitationAcceptanceModal({
  invitationId,
  isOpen,
  onClose,
  onAccepted
}: InvitationAcceptanceModalProps) {
  const [invitation, setInvitation] = useState<Invitation | null>(null)
  const [loading, setLoading] = useState(false)
  const [accepting, setAccepting] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen && invitationId) {
      fetchInvitation()
    }
  }, [isOpen, invitationId])

  const fetchInvitation = async () => {
    if (!invitationId) return

    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`${API_BASE}/api/invitations/${invitationId}`)

      if (!response.ok) {
        throw new Error('Invitation not found')
      }

      const data = await response.json()
      setInvitation(data.invitation)

      if (!data.is_pending) {
        if (data.is_expired) {
          setError('This invitation has expired')
        } else if (data.invitation.status === 'accepted') {
          setError('This invitation has already been accepted')
        } else {
          setError('This invitation is no longer valid')
        }
      }
    } catch (error) {
      console.error('Error fetching invitation:', error)
      setError('Failed to load invitation details')
    } finally {
      setLoading(false)
    }
  }

  const handleAccept = async () => {
    if (!invitation) return

    setAccepting(true)
    setError(null)

    try {
      const token = localStorage.getItem('auth_token')
      const response = await fetch(`${API_BASE}/api/invitations/accept/${invitation.id}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.detail || 'Failed to accept invitation')
      }

      if (data.success) {
        toast.success(`🎉 Welcome to ${invitation.organization_name}!`, {
          description: `You've successfully joined as a ${invitation.role}.`,
          duration: 4000,
        })

        // Update local storage with new role/org
        if (data.organization) {
          localStorage.setItem('user_organization_id', data.organization.id)
          localStorage.setItem('user_organization_name', data.organization.name)
        }
        if (data.role) {
          localStorage.setItem('user_role', data.role)
        }

        onAccepted?.()
        onClose()

        // Refresh the page to update all org-based UI
        setTimeout(() => {
          window.location.reload()
        }, 500)
      }
    } catch (error: any) {
      console.error('Error accepting invitation:', error)
      setError(error.message || 'Failed to accept invitation')
      toast.error(error.message || 'Failed to accept invitation')
    } finally {
      setAccepting(false)
    }
  }

  const handleReject = async () => {
    if (!invitation) return

    setRejecting(true)
    setError(null)

    try {
      const token = localStorage.getItem('auth_token')
      const response = await fetch(`${API_BASE}/api/invitations/reject/${invitation.id}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.detail || 'Failed to reject invitation')
      }

      if (data.success) {
        toast.info('Invitation declined')
        onClose()
      }
    } catch (error: any) {
      console.error('Error rejecting invitation:', error)
      setError(error.message || 'Failed to reject invitation')
      toast.error(error.message || 'Failed to reject invitation')
    } finally {
      setRejecting(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <Building2 className="w-5 h-5" />
            <span>Organization Invitation</span>
          </DialogTitle>
          <DialogDescription>
            You've been invited to join an organization
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
            <span className="ml-3 text-gray-600">Loading invitation...</span>
          </div>
        ) : error ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : invitation ? (
          <div className="space-y-6">
            <div className="text-center space-y-3">
              <h3 className="text-lg font-semibold text-gray-900">
                You're invited to join
              </h3>
              <div className="bg-slate-50 rounded-lg p-4">
                <div className="flex items-center justify-center space-x-2 mb-2">
                  <Building2 className="h-5 w-5 text-slate-600" />
                  <span className="text-lg font-medium">{invitation.organization_name}</span>
                </div>
                <div className="flex items-center justify-center space-x-4 text-sm text-slate-600">
                  <div className="flex items-center space-x-1">
                    <Users className="h-4 w-4" />
                    <span>Role: {invitation.role}</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <Mail className="h-4 w-4" />
                    <span>{invitation.email}</span>
                  </div>
                </div>
              </div>
            </div>

            {invitation.expires_at && (
              <div className="text-center text-sm text-gray-500">
                <p>This invitation expires on {new Date(invitation.expires_at).toLocaleDateString()}</p>
              </div>
            )}

            <div className="flex space-x-3">
              <Button
                onClick={handleAccept}
                disabled={accepting || rejecting}
                className="flex-1"
              >
                {accepting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Accepting...
                  </>
                ) : (
                  <>
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Accept
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                onClick={handleReject}
                disabled={accepting || rejecting}
                className="flex-1"
              >
                {rejecting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Declining...
                  </>
                ) : (
                  'Decline'
                )}
              </Button>
            </div>

            <div className="text-center">
              <p className="text-xs text-gray-500">
                By accepting this invitation, you'll join the organization and gain access to team burnout analytics and integrations.
              </p>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
