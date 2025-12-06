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
import { Separator } from "@/components/ui/separator"
import { AlertTriangle, Loader2, Trash2 } from "lucide-react"

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

        {/* Danger Zone Section */}
        <div className="mt-6">
          <Separator className="mb-6" />

          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center">
                <AlertTriangle className="w-4 h-4 text-red-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">
                Danger Zone
              </h3>
            </div>

            <p className="text-sm text-gray-600">
              Once you delete your account, there is no going back. This will
              permanently delete all your data.
            </p>

            {!showDeleteConfirmation ? (
              <Button
                variant="destructive"
                onClick={() => setShowDeleteConfirmation(true)}
                className="bg-red-600 hover:bg-red-700"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete Account
              </Button>
            ) : (
              <div className="space-y-4 p-4 border-2 border-red-200 rounded-lg bg-red-50">
                <div>
                  <p className="text-sm font-semibold text-red-900 mb-2">
                    Are you absolutely sure?
                  </p>
                  <p className="text-sm text-red-800 mb-3">
                    This will permanently delete your account and all associated
                    data including:
                  </p>
                  <ul className="text-sm text-red-800 list-disc list-inside space-y-1 mb-4">
                    <li>All burnout analyses</li>
                    <li>
                      Integration connections (Rootly, PagerDuty, GitHub, Slack,
                      Jira)
                    </li>
                    <li>Team member mappings and correlations</li>
                    <li>Account credentials and OAuth providers</li>
                  </ul>
                  <p className="text-sm font-medium text-red-900 mb-2">
                    Type your email address{" "}
                    <span className="font-mono bg-white px-1 rounded">
                      {userEmail}
                    </span>{" "}
                    to confirm:
                  </p>
                  <Input
                    type="email"
                    value={emailConfirmation}
                    onChange={(e) => setEmailConfirmation(e.target.value)}
                    placeholder="Enter your email address"
                    className="border-red-300 focus:border-red-500 focus:ring-red-500"
                    disabled={isDeleting}
                  />
                </div>

                {deleteError && (
                  <div className="p-3 bg-red-100 border border-red-300 rounded-md">
                    <p className="text-sm text-red-800">{deleteError}</p>
                  </div>
                )}

                <div className="flex gap-2">
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
                        Deleting Account...
                      </>
                    ) : (
                      <>
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete My Account
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
