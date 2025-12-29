"use client"

import { useState } from "react"
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
import { Loader2, Trash2 } from "lucide-react"

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
        throw new Error(error.detail || "Failed to delete account")
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
          <DialogDescription className="text-gray-600">
            Manage your account preferences and settings
          </DialogDescription>
        </DialogHeader>

        {/* Future sections will go here: Change Password, Notifications, etc. */}

        {/* Account Deletion Section */}
        <div className="mt-8 pt-8 border-t border-gray-200">
          <div className="flex items-start gap-3 mb-4">
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-50 flex items-center justify-center">
              <Trash2 className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">
                Delete Account
              </h3>
              <p className="text-sm text-gray-600 mt-1">
                Permanently remove your account and all associated data
              </p>
            </div>
          </div>

          {!showDeleteConfirmation ? (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <p className="text-sm text-gray-700 mb-3">
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
                <label htmlFor="email-confirm" className="block text-sm font-medium text-gray-900 mb-2">
                  Confirm by typing your email:{" "}
                  <span className="font-mono text-sm bg-gray-100 px-2 py-0.5 rounded">
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
