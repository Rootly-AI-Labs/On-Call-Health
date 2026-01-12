"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Loader2, Trash2, UserPlus } from "lucide-react"

interface PromotableUser {
  id: number
  name: string
  email: string
  role: string
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
  const router = useRouter()
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false)
  const [emailConfirmation, setEmailConfirmation] = useState("")
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [showPromoteUsers, setShowPromoteUsers] = useState(false)
  const [promotableUsers, setPromotableUsers] = useState<PromotableUser[]>([])
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [promotingUserId, setPromotingUserId] = useState<number | null>(null)

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
        // Refresh promotable users list
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

        // Check if error is about being sole admin
        if (errorMessage.includes("promote another team member")) {
          setShowPromoteUsers(true)
          await fetchPromotableUsers()
        }

        throw new Error(errorMessage)
      }

      // Success - clear all localStorage and redirect
      localStorage.clear()

      // Redirect to home page with full reload to clear Dialog state
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

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-2xl font-semibold">
            Account Settings
          </DialogTitle>
          <DialogDescription className="text-neutral-700">
            Manage your account preferences and settings
          </DialogDescription>
        </DialogHeader>

        {/* Future sections will go here: Change Password, Notifications, etc. */}

        {/* Account Deletion Section */}
        <div className="mt-8 pt-8 border-t border-neutral-200">
          <div className="flex items-start gap-3 mb-4">
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-50 flex items-center justify-center">
              <Trash2 className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-neutral-900">
                Delete Account
              </h3>
              <p className="text-sm text-neutral-700 mt-1">
                Permanently remove your account and all associated data
              </p>
            </div>
          </div>

          {!showDeleteConfirmation ? (
            <div className="bg-neutral-100 border border-neutral-200 rounded-lg p-4">
              <p className="text-sm text-neutral-700 mb-3">
                This action cannot be undone. This will permanently delete your account and remove all data from our servers.
              </p>
              <Button
                variant="outline"
                onClick={() => setShowDeleteConfirmation(true)}
                className="text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete Account
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <div className="flex gap-3">
                  <div className="flex-shrink-0">
                    <svg className="w-5 h-5 text-amber-600" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-amber-900 mb-1">
                      This action cannot be undone
                    </h4>
                    <p className="text-sm text-amber-800 mb-2">
                      This will permanently delete:
                    </p>
                    <ul className="text-sm text-amber-800 space-y-1 ml-4 list-disc">
                      <li>All burnout analyses and insights</li>
                      <li>Integration connections (Rootly, PagerDuty, GitHub, Slack, Jira)</li>
                      <li>Team member mappings</li>
                      <li>Account credentials</li>
                    </ul>
                  </div>
                </div>
              </div>

              <div>
                <label htmlFor="email-confirm" className="block text-sm font-medium text-neutral-900 mb-2">
                  Confirm by typing your email:{" "}
                  <span className="font-mono text-sm bg-neutral-200 px-2 py-0.5 rounded">
                    {userEmail}
                  </span>
                </label>
                <Input
                  id="email-confirm"
                  type="email"
                  value={emailConfirmation}
                  onChange={(e) => setEmailConfirmation(e.target.value)}
                  placeholder="Enter your email address"
                  className="bg-white"
                  disabled={isDeleting}
                  autoFocus
                />
              </div>

              {deleteError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-sm text-red-800">{deleteError}</p>
                </div>
              )}

              {showPromoteUsers && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <UserPlus className="w-5 h-5 text-blue-600" />
                    <h4 className="text-sm font-semibold text-blue-900">
                      Promote a Team Member to Admin
                    </h4>
                  </div>
                  <p className="text-sm text-blue-800 mb-3">
                    Select a team member to promote to admin before deleting your account:
                  </p>
                  {loadingUsers ? (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
                    </div>
                  ) : promotableUsers.length === 0 ? (
                    <p className="text-sm text-blue-700">
                      No team members with accounts found. Please invite a team member first.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {promotableUsers.map((user) => (
                        <div
                          key={user.id}
                          className="flex items-center justify-between p-3 bg-white rounded border border-blue-200"
                        >
                          <div>
                            <p className="font-medium text-neutral-900">{user.name}</p>
                            <p className="text-sm text-neutral-700">{user.email}</p>
                          </div>
                          <Button
                            size="sm"
                            onClick={() => handlePromoteUser(user.id)}
                            disabled={promotingUserId !== null}
                            className="bg-blue-600 hover:bg-blue-700"
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

              <div className="flex gap-3 pt-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowDeleteConfirmation(false)
                    setEmailConfirmation("")
                    setDeleteError(null)
                  }}
                  disabled={isDeleting}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleDeleteAccount}
                  disabled={emailConfirmation !== userEmail || isDeleting}
                  className="flex-1 bg-red-600 hover:bg-red-700"
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
      </DialogContent>
    </Dialog>
  )
}
