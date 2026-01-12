"use client"

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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

interface AcceptanceResponse {
  success: boolean
  message: string
  organization: {
    id: number
    name: string
  }
  role: string
  redirect_url?: string
  requires_auth?: boolean
}

export default function AcceptInvitationPage() {
  const params = useParams()
  const router = useRouter()
  const invitationId = params.invitationId as string

  const [invitation, setInvitation] = useState<Invitation | null>(null)
  const [loading, setLoading] = useState(true)
  const [accepting, setAccepting] = useState(false)
  const [accepted, setAccepted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [requiresAuth, setRequiresAuth] = useState(false)

  // Fetch invitation details
  useEffect(() => {
    const fetchInvitation = async () => {
      try {
        const response = await fetch(`${API_BASE}/api/invitations/${invitationId}`)

        if (!response.ok) {
          throw new Error('Invitation not found')
        }

        const data = await response.json()
        setInvitation(data.invitation)

        // Check if invitation is expired or already processed
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

    if (invitationId) {
      fetchInvitation()
    }
  }, [invitationId])

  const handleAcceptInvitation = async () => {
    if (!invitation) return

    setAccepting(true)
    setError(null)

    try {
      const response = await fetch(`${API_BASE}/api/invitations/accept/${invitation.id}`, {
        method: 'GET', // Use GET endpoint that handles auth check
        credentials: 'include'
      })

      const data: AcceptanceResponse = await response.json()

      if (!response.ok) {
        throw new Error(data.message || 'Failed to accept invitation')
      }

      if (data.requires_auth) {
        setRequiresAuth(true)
        // Redirect to login with return URL
        router.push(`/auth/login?returnUrl=${encodeURIComponent(window.location.pathname)}`)
        return
      }

      if (data.success) {
        setAccepted(true)

        // Show success toast
        toast.success(`🎉 Welcome to ${invitation.organization_name}!`, {
          description: `You've successfully joined as a ${invitation.role}. Redirecting to integrations...`,
          duration: 4000,
        })

        // Redirect after successful acceptance
        setTimeout(() => {
          if (data.redirect_url) {
            router.push(data.redirect_url)
          } else {
            router.push('/integrations')
          }
        }, 3000)
      }

    } catch (error: any) {
      console.error('Error accepting invitation:', error)
      setError(error.message || 'Failed to accept invitation')
    } finally {
      setAccepting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            <span className="ml-3 text-neutral-700">Loading invitation...</span>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (accepted) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
            <CardTitle className="text-2xl text-green-800">Welcome to the team!</CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-neutral-700">
              You've successfully joined <strong>{invitation?.organization_name}</strong> as a {invitation?.role}.
            </p>
            <p className="text-sm text-neutral-500">
              Redirecting you to integrations in a moment...
            </p>
            <Button
              onClick={() => router.push('/integrations')}
              className="w-full"
            >
              Go to Integrations
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4">
            <Building2 className="h-8 w-8 text-blue-600" />
          </div>
          <CardTitle className="text-2xl">Organization Invitation</CardTitle>
        </CardHeader>

        <CardContent className="space-y-6">
          {error ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : invitation ? (
            <>
              <div className="text-center space-y-3">
                <h3 className="text-xl font-semibold text-neutral-900">
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
                <div className="text-center text-sm text-neutral-500">
                  <p>This invitation expires on {new Date(invitation.expires_at).toLocaleDateString()}</p>
                </div>
              )}

              <Button
                onClick={handleAcceptInvitation}
                disabled={accepting}
                className="w-full"
                size="lg"
              >
                {accepting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Accepting Invitation...
                  </>
                ) : (
                  'Accept Invitation'
                )}
              </Button>

              <div className="text-center">
                <p className="text-xs text-neutral-500">
                  By accepting this invitation, you'll join the organization and gain access to team burnout analytics and integrations.
                </p>
              </div>
            </>
          ) : (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>Invitation not found or no longer valid.</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  )
}