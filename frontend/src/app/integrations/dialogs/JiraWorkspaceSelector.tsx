"use client"

import { useState, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Loader2, ExternalLink, Check } from "lucide-react"
import { toast } from "sonner"
import type { JiraWorkspace } from "../types"

interface JiraWorkspaceSelectorProps {
  open: boolean
  onClose: () => void
  onWorkspaceSelected: () => void
}

export function JiraWorkspaceSelector({
  open,
  onClose,
  onWorkspaceSelected,
}: JiraWorkspaceSelectorProps) {
  const [workspaces, setWorkspaces] = useState<JiraWorkspace[]>([])
  const [loading, setLoading] = useState(true)
  const [selecting, setSelecting] = useState(false)
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      loadWorkspaces()
    }
  }, [open])

  const loadWorkspaces = async () => {
    setLoading(true)
    try {
      const token = localStorage.getItem("token")
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/integrations/jira/workspaces`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      )

      if (!response.ok) {
        throw new Error("Failed to fetch workspaces")
      }

      const data = await response.json()
      setWorkspaces(data.workspaces || [])

      // Set the currently selected workspace as default
      const currentWorkspace = data.workspaces?.find((w: JiraWorkspace) => w.is_selected)
      if (currentWorkspace) {
        setSelectedWorkspaceId(currentWorkspace.id)
      }
    } catch (error) {
      console.error("Error loading Jira workspaces:", error)
      toast.error("Failed to load workspaces")
    } finally {
      setLoading(false)
    }
  }

  const handleSelectWorkspace = async () => {
    if (!selectedWorkspaceId) {
      toast.error("Please select a workspace")
      return
    }

    setSelecting(true)
    try {
      const token = localStorage.getItem("token")
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/integrations/jira/select-workspace`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ cloud_id: selectedWorkspaceId }),
        }
      )

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || "Failed to select workspace")
      }

      const data = await response.json()
      toast.success(data.message || "Workspace selected successfully")
      onWorkspaceSelected()
      onClose()
    } catch (error) {
      console.error("Error selecting workspace:", error)
      toast.error(error instanceof Error ? error.message : "Failed to select workspace")
    } finally {
      setSelecting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Select Jira Workspace</DialogTitle>
          <DialogDescription>
            Choose which Jira workspace you want to connect to. You can change this later from the integrations page.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : workspaces.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            No workspaces found. Please try reconnecting your Jira account.
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              You have access to {workspaces.length} workspace{workspaces.length !== 1 ? 's' : ''}:
            </p>

            <div className="max-h-[400px] space-y-2 overflow-y-auto">
              {workspaces.map((workspace) => (
                <button
                  key={workspace.id}
                  onClick={() => setSelectedWorkspaceId(workspace.id)}
                  className={`w-full rounded-lg border p-4 text-left transition-all hover:border-blue-400 ${
                    selectedWorkspaceId === workspace.id
                      ? "border-blue-500 bg-blue-50/50 dark:bg-blue-950/20"
                      : "border-border bg-card"
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        {workspace.avatarUrl && (
                          <img
                            src={workspace.avatarUrl}
                            alt={workspace.name}
                            className="h-5 w-5 rounded-sm"
                          />
                        )}
                        <h4 className="font-semibold">{workspace.name}</h4>
                      </div>

                      <a
                        href={workspace.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {workspace.url}
                        <ExternalLink className="h-3 w-3" />
                      </a>

                      {workspace.scopes && workspace.scopes.length > 0 && (
                        <p className="text-xs text-muted-foreground">
                          Scopes: {workspace.scopes.join(", ")}
                        </p>
                      )}
                    </div>

                    {selectedWorkspaceId === workspace.id && (
                      <div className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-500 text-white">
                        <Check className="h-3 w-3" />
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-4">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={selecting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSelectWorkspace}
            disabled={loading || selecting || !selectedWorkspaceId}
          >
            {selecting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Selecting...
              </>
            ) : (
              "Connect Workspace"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
