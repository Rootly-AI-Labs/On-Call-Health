"use client"

import { useEffect, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Loader2, Mail, Trash2, UserPlus } from "lucide-react"
import { toast } from "sonner"

interface PromotableUser {
  id: number
  name: string
  email: string
  role: string
}

interface DigestPreference {
  enabled: boolean
  has_auto_refresh: boolean
  last_sent_at: string | null
  next_send_at: string | null
}

interface AccountSettingsDialogProps {
  isOpen: boolean
  onClose: () => void
  userEmail: string
}

export function AccountSettingsDialog({
  isOpen,
  onClose,
  userEmail,
}: AccountSettingsDialogProps) {
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false)
  const [emailConfirmation, setEmailConfirmation] = useState("")
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [showPromoteUsers, setShowPromoteUsers] = useState(false)
  const [promotableUsers, setPromotableUsers] = useState<PromotableUser[]>([])
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [promotingUserId, setPromotingUserId] = useState<number | null>(null)
  const [digestPreference, setDigestPreference] = useState<DigestPreference | null>(null)
  const [preferenceLoading, setPreferenceLoading] = useState(false)
  const [togglingDigest, setTogglingDigest] = useState(false)
  const [sendingDigestTest, setSendingDigestTest] = useState(false)

  const fetchDigestPreference = async () => {
    setPreferenceLoading(true)
    try {
      const authToken = localStorage.getItem("auth_token")
      const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
      if (!authToken) return

      const response = await fetch(`${API_BASE}/api/digests/weekly/preference`, {
        headers: { Authorization: `Bearer ${authToken}` },
      })

      if (response.ok) {
        setDigestPreference(await response.json())
      }
    } catch (error) {
      console.error("Error fetching digest preference:", error)
    } finally {
      setPreferenceLoading(false)
    }
  }

  const handleToggleDigest = async (enabled: boolean) => {
    setTogglingDigest(true)
    try {
      const authToken = localStorage.getItem("auth_token")
      const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

      const response = await fetch(`${API_BASE}/api/digests/weekly/preference`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${authToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ enabled }),
      })

      if (response.ok) {
        const data = await response.json()
        setDigestPreference((prev) =>
          prev ? { ...prev, enabled: data.enabled } : null
        )
        toast.success(enabled ? "Weekly digest enabled" : "Weekly digest disabled")
      } else {
        toast.error("Failed to update preference")
      }
    } catch (error) {
      console.error("Error toggling digest:", error)
      toast.error("Failed to update preference")
    } finally {
      setTogglingDigest(false)
    }
  }

  const fetchPromotableUsers = async () => {
    setLoadingUsers(true)
    try {
      const authToken = localStorage.getItem("auth_token")
      const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

      const response = await fetch(`${API_BASE}/auth/users/promotable`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      })

      if (response.ok) {
        const data = await response.json()
        setPromotableUsers(data.users || [])
      }
    } catch (error) {
      console.error("Error fetching promotable users:", error)
    } finally {
      setLoadingUsers(false)
    }
  }

  const handlePromoteUser = async (userId: number) => {
    setPromotingUserId(userId)
    try {
      const authToken = localStorage.getItem("auth_token")
      const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

      const response = await fetch(`${API_BASE}/auth/users/${userId}/role?new_role=admin`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      })

      if (response.ok) {
        await fetchPromotableUsers()
        setShowPromoteUsers(false)
        setDeleteError(null)
      } else {
        const error = await response.json()
        setDeleteError(error.detail || "Failed to promote user")
      }
    } catch (error) {
      console.error("Error promoting user:", error)
      setDeleteError("An unexpected error occurred")
    } finally {
      setPromotingUserId(null)
    }
  }

  const handleDeleteAccount = async () => {
    if (emailConfirmation !== userEmail) {
      setDeleteError("Email address does not match")
      return
    }

    setIsDeleting(true)
    setDeleteError(null)

    try {
      const authToken = localStorage.getItem("auth_token")
      const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

      const response = await fetch(`${API_BASE}/auth/users/me`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${authToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email_confirmation: emailConfirmation,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        const errorMessage = error.detail || "Failed to delete account"

        if (errorMessage.includes("promote another team member")) {
          setShowPromoteUsers(true)
          await fetchPromotableUsers()
        }

        throw new Error(errorMessage)
      }

      alert("Account successfully deleted. All analyses and API keys have been permanently removed.")
      localStorage.clear()
      window.location.href = "/"
    } catch (error) {
      console.error("Error deleting account:", error)
      setDeleteError(
        error instanceof Error
          ? error.message
          : "An unexpected error occurred. Please try again."
      )
      setIsDeleting(false)
    }
  }

  const handleClose = () => {
    setShowDeleteConfirmation(false)
    setEmailConfirmation("")
    setDeleteError(null)
    onClose()
  }

  const handleSendDigestTest = async () => {
    setSendingDigestTest(true)
    try {
      const authToken = localStorage.getItem("auth_token")
      const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

      if (!authToken) {
        toast.error("Please log in to send a test digest")
        return
      }

      const response = await fetch(`${API_BASE}/api/digests/weekly/test`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${authToken}`,
          "Content-Type": "application/json",
        },
      })

      if (response.ok) {
        toast.success("Weekly digest test email sent")
      } else {
        const errorData = await response.json()
        toast.error(errorData.detail || "Failed to send test email")
      }
    } catch (error) {
      console.error("Error sending digest test:", error)
      toast.error("Failed to send test email")
    } finally {
      setSendingDigestTest(false)
    }
  }

  useEffect(() => {
    if (isOpen) {
      fetchDigestPreference()
    }
  }, [isOpen])

  const formatDate = (isoString: string) =>
    new Date(isoString).toLocaleDateString("en-US", {
      weekday: "long",
      month: "short",
      day: "numeric",
    })

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl gap-0 p-0">
        <DialogHeader className="px-6 pt-6 pb-4">
          <DialogTitle className="text-2xl font-semibold tracking-tight text-neutral-900">
            Account Settings
          </DialogTitle>
          <DialogDescription className="text-neutral-600 mt-1.5 text-[15px]">
            Manage your account preferences and settings
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 pb-6">
          <Tabs defaultValue="account" className="w-full">
            <TabsList className="grid w-full grid-cols-2 bg-neutral-100/70">
              <TabsTrigger value="account" className="data-[state=active]:bg-white">
                Account
              </TabsTrigger>
              <TabsTrigger value="weekly" className="data-[state=active]:bg-white">
                Weekly Digest
              </TabsTrigger>
            </TabsList>

            <TabsContent value="weekly" className="mt-6">
              <div className="border border-neutral-200 rounded-xl p-5 bg-white shadow-xs space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-neutral-900 tracking-tight">
                      Weekly Digest
                    </h3>
                    <p className="text-[15px] text-neutral-600 mt-1.5 leading-relaxed">
                      Sends a summary every Tuesday at 10:00 AM in your local timezone.
                    </p>
                  </div>
                  <Switch
                    checked={digestPreference?.enabled ?? false}
                    disabled={
                      !digestPreference?.has_auto_refresh ||
                      togglingDigest ||
                      preferenceLoading
                    }
                    onCheckedChange={handleToggleDigest}
                  />
                </div>

                <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-4 text-[14px] text-neutral-700">
                  {preferenceLoading ? (
                    <div className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Loading...
                    </div>
                  ) : !digestPreference?.has_auto_refresh ? (
                    <div className="space-y-1">
                      <div className="font-medium text-neutral-900">Status: Not available</div>
                      <div>Run an auto-refresh analysis to enable weekly digests.</div>
                    </div>
                  ) : digestPreference.enabled ? (
                    <div className="space-y-1.5">
                      <div className="font-medium text-neutral-900">Status: Enabled</div>
                      {digestPreference.last_sent_at && (
                        <div className="text-neutral-600">
                          Last sent: {formatDate(digestPreference.last_sent_at)}
                        </div>
                      )}
                      {digestPreference.next_send_at && (
                        <div className="text-neutral-600">
                          Next digest: {formatDate(digestPreference.next_send_at)} at 10:00 AM
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <div className="font-medium text-neutral-900">Status: Disabled</div>
                      <div>Enable the toggle above to receive weekly digest emails.</div>
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    onClick={handleSendDigestTest}
                    disabled={!digestPreference?.has_auto_refresh || sendingDigestTest}
                    className="bg-purple-600 hover:bg-purple-700 transition-all duration-200 font-medium"
                  >
                    {sendingDigestTest ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Sending...
                      </>
                    ) : (
                      <>
                        <Mail className="w-4 h-4 mr-2" />
                        Send Test Email
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="account" className="mt-6">
              <div className="pt-6 border-t border-neutral-200">
                <div className="mb-5">
                  <h3 className="text-lg font-semibold text-neutral-900 tracking-tight">
                    Delete Account
                  </h3>
                  <p className="text-[15px] text-neutral-600 mt-1.5 leading-relaxed">
                    Permanently remove your account and all associated data
                  </p>
                </div>

              {!showDeleteConfirmation ? (
                <div className="bg-neutral-50/50 border border-neutral-200 rounded-xl p-5 shadow-xs">
                  <p className="text-[15px] text-neutral-700 mb-4 leading-relaxed">
                    This action cannot be undone. This will permanently delete your account and remove all data from our servers.
                  </p>
                  <Button
                    variant="outline"
                    onClick={() => setShowDeleteConfirmation(true)}
                    className="bg-red-50 text-red-600 border-red-200 hover:bg-red-100 hover:border-red-300 hover:text-red-700 transition-all duration-200 font-medium"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete Account
                  </Button>
                </div>
              ) : (
                <div className="space-y-5">
                  <div className="bg-amber-50/70 border border-amber-200/80 rounded-xl p-5 shadow-xs">
                    <div className="flex gap-3.5">
                      <div className="shrink-0 mt-0.5">
                        <svg className="w-5 h-5 text-amber-600" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                      </div>
                      <div>
                        <h4 className="text-[15px] font-semibold text-amber-900 mb-2">
                          This action cannot be undone
                        </h4>
                        <p className="text-[15px] text-amber-800/90 mb-2.5">
                          This will permanently delete:
                        </p>
                        <ul className="text-[14px] text-amber-800/90 space-y-1.5 ml-4 list-disc marker:text-amber-600">
                          <li>All health analyses and insights</li>
                          <li>Integration connections (Rootly, PagerDuty, GitHub, Slack, Jira)</li>
                          <li>Team member mappings</li>
                          <li>Account credentials</li>
                        </ul>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label htmlFor="email-confirm" className="block text-[15px] font-medium text-neutral-900 mb-2.5">
                      Confirm by typing your email:{" "}
                      <span className="font-mono text-[14px] bg-neutral-100 px-2.5 py-1 rounded-md border border-neutral-200">
                        {userEmail}
                      </span>
                    </label>
                    <Input
                      id="email-confirm"
                      type="email"
                      value={emailConfirmation}
                      onChange={(e) => setEmailConfirmation(e.target.value)}
                      placeholder="Enter your email address"
                      className="bg-white border-neutral-300 focus:border-neutral-400 focus:ring-neutral-400 h-11 text-[15px] transition-all duration-200"
                      disabled={isDeleting}
                      autoFocus
                    />
                  </div>

                  {deleteError && (
                    <div className="bg-red-50/70 border border-red-200/80 rounded-xl p-4 shadow-xs">
                      <p className="text-[15px] text-red-800 leading-relaxed">{deleteError}</p>
                    </div>
                  )}

                  {showPromoteUsers && (
                    <div className="bg-blue-50/70 border border-blue-200/80 rounded-xl p-5 shadow-xs">
                      <div className="flex items-center gap-2.5 mb-3">
                        <UserPlus className="w-5 h-5 text-blue-600" />
                        <h4 className="text-[15px] font-semibold text-blue-900">
                          Promote a Team Member to Admin
                        </h4>
                      </div>
                      <p className="text-[15px] text-blue-800/90 mb-4 leading-relaxed">
                        Select a team member to promote to admin before deleting your account:
                      </p>
                      {loadingUsers ? (
                        <div className="flex items-center justify-center py-6">
                          <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
                        </div>
                      ) : promotableUsers.length === 0 ? (
                        <p className="text-[15px] text-blue-800/90 leading-relaxed">
                          No team members with accounts found. Please invite a team member first.
                        </p>
                      ) : (
                        <div className="space-y-2.5">
                          {promotableUsers.map((user) => (
                            <div
                              key={user.id}
                              className="flex items-center justify-between p-3.5 bg-white rounded-lg border border-blue-200/80 hover:border-blue-300 hover:shadow-xs transition-all duration-200"
                            >
                              <div>
                                <p className="font-medium text-neutral-900 text-[15px]">{user.name}</p>
                                <p className="text-[14px] text-neutral-600 mt-0.5">{user.email}</p>
                              </div>
                              <Button
                                size="sm"
                                onClick={() => handlePromoteUser(user.id)}
                                disabled={promotingUserId !== null}
                                className="bg-blue-600 hover:bg-blue-700 transition-all duration-200 font-medium"
                              >
                                {promotingUserId === user.id ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  "Promote to Admin"
                                )}
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex gap-3 pt-3">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setShowDeleteConfirmation(false)
                        setEmailConfirmation("")
                        setDeleteError(null)
                      }}
                      disabled={isDeleting}
                      className="flex-1 border-neutral-300 hover:bg-neutral-50 transition-all duration-200 font-medium h-11"
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={handleDeleteAccount}
                      disabled={emailConfirmation !== userEmail || isDeleting}
                      className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 transition-all duration-200 font-medium h-11"
                    >
                      {isDeleting ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Deleting...
                        </>
                      ) : (
                        "Delete Account Permanently"
                      )}
                    </Button>
                  </div>
                </div>
              )}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  )
}
