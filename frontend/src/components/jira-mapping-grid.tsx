"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  AlertCircle,
  CheckCircle,
  Loader2,
  X,
  AlertTriangle,
} from "lucide-react"
import { toast } from "sonner"

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

interface TeamMember {
  email: string
  name?: string
  jira_account_id?: string | null
  jira_display_name?: string | null
  jira_email?: string | null
  mapping_successful?: boolean
}

interface JiraUser {
  account_id: string
  display_name: string
  email?: string | null
  active: boolean
}

interface JiraMapppingGridProps {
  platform: string
  onMappingsChanged?: () => void
}

export function JiraMapppingGrid({
  platform,
  onMappingsChanged
}: JiraMapppingGridProps) {
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [unmappedJiraUsers, setUnmappedJiraUsers] = useState<JiraUser[]>([])
  const [loadingData, setLoadingData] = useState(true)
  const [loadingMappingId, setLoadingMappingId] = useState<string | null>(null)
  const [loadingRemovalId, setLoadingRemovalId] = useState<string | null>(null)

  // Fetch team members (those with PD/Rootly data)
  const loadTeamMembers = useCallback(async () => {
    try {
      const authToken = localStorage.getItem('auth_token')
      if (!authToken) {
        toast.error('Authentication required')
        return
      }

      const response = await fetch(
        `${API_BASE}/integrations/mappings/platform/${platform}`,
        {
          headers: { 'Authorization': `Bearer ${authToken}` }
        }
      )

      if (response.ok) {
        const data = await response.json()
        // Transform to team member format, deduplicate by email
        const deduplicatedMembers = data.reduce((acc: TeamMember[], current: any) => {
          const existingIndex = acc.findIndex(
            m => m.email.toLowerCase() === current.source_identifier.toLowerCase()
          )

          if (existingIndex === -1) {
            acc.push({
              email: current.source_identifier.toLowerCase(),
              name: current.source_name || current.source_identifier,
              jira_account_id: current.jira_account_id,
              jira_display_name: current.jira_display_name,
              jira_email: current.jira_email,
              mapping_successful: current.mapping_successful,
            })
          } else {
            // Keep the most recent mapping
            const existing = acc[existingIndex]
            if (current.is_manual || (!existing.jira_account_id && current.jira_account_id)) {
              acc[existingIndex] = {
                email: current.source_identifier.toLowerCase(),
                name: current.source_name || current.source_identifier,
                jira_account_id: current.jira_account_id,
                jira_display_name: current.jira_display_name,
                jira_email: current.jira_email,
                mapping_successful: current.mapping_successful,
              }
            }
          }
          return acc
        }, [])

        setTeamMembers(deduplicatedMembers)
      } else {
        toast.error('Failed to load team members')
      }
    } catch (error) {
      toast.error('Error loading team members')
    }
  }, [platform])

  // Fetch unmapped Jira users
  const loadUnmappedJiraUsers = useCallback(async () => {
    try {
      const authToken = localStorage.getItem('auth_token')
      if (!authToken) return

      const response = await fetch(
        `${API_BASE}/integrations/jira/unmapped-users`,
        {
          headers: { 'Authorization': `Bearer ${authToken}` }
        }
      )

      if (response.ok) {
        const data = await response.json()
        setUnmappedJiraUsers(data.unmapped_users || [])
      } else {
        toast.error('Failed to load unmapped Jira users')
      }
    } catch (error) {
      toast.error('Error loading unmapped Jira users')
    }
  }, [])

  // Initial load
  useEffect(() => {
    const loadAllData = async () => {
      setLoadingData(true)
      await Promise.all([loadTeamMembers(), loadUnmappedJiraUsers()])
      setLoadingData(false)
    }
    loadAllData()
  }, [loadTeamMembers, loadUnmappedJiraUsers])

  // Create manual mapping
  const createMapping = async (teamMemberEmail: string, jiraAccountId: string) => {
    const jiraUser = unmappedJiraUsers.find(u => u.account_id === jiraAccountId)
    if (!jiraUser) return

    setLoadingMappingId(jiraAccountId)
    try {
      const authToken = localStorage.getItem('auth_token')
      if (!authToken) {
        toast.error('Authentication required')
        return
      }

      const response = await fetch(
        `${API_BASE}/integrations/jira/manual-mapping`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            source_email: teamMemberEmail,
            jira_account_id: jiraAccountId,
            jira_display_name: jiraUser.display_name,
            jira_email: jiraUser.email
          })
        }
      )

      if (response.ok) {
        toast.success(`Mapped ${jiraUser.display_name} to ${teamMemberEmail}`)
        await Promise.all([loadTeamMembers(), loadUnmappedJiraUsers()])
        onMappingsChanged?.()
      } else {
        const error = await response.json()
        toast.error(error.detail || 'Failed to create mapping')
      }
    } catch (error) {
      toast.error('Error creating mapping')
    } finally {
      setLoadingMappingId(null)
    }
  }

  // Remove mapping
  const removeMapping = async (email: string) => {
    setLoadingRemovalId(email)
    try {
      const authToken = localStorage.getItem('auth_token')
      if (!authToken) {
        toast.error('Authentication required')
        return
      }

      const response = await fetch(
        `${API_BASE}/integrations/jira/mapping/${encodeURIComponent(email)}`,
        {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${authToken}` }
        }
      )

      if (response.ok) {
        toast.success(`Removed Jira mapping for ${email}`)
        await Promise.all([loadTeamMembers(), loadUnmappedJiraUsers()])
        onMappingsChanged?.()
      } else {
        const error = await response.json()
        toast.error(error.detail || 'Failed to remove mapping')
      }
    } catch (error) {
      toast.error('Error removing mapping')
    } finally {
      setLoadingRemovalId(null)
    }
  }

  if (loadingData) {
    return (
      <div className="flex justify-center items-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        <span className="ml-2 text-gray-600">Loading mapping data...</span>
      </div>
    )
  }

  if (teamMembers.length === 0) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <div className="flex items-start space-x-3">
          <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" />
          <div>
            <h3 className="font-medium text-yellow-900">No team members found</h3>
            <p className="text-sm text-yellow-700 mt-1">
              Connect GitHub or Slack integration first to see team members for Jira mapping.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto border rounded-lg">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50">
              <th className="px-4 py-3 text-left font-semibold text-gray-700">
                Team Member
              </th>
              <th className="px-4 py-3 text-left font-semibold text-gray-700">
                Status
              </th>
              <th className="px-4 py-3 text-left font-semibold text-gray-700">
                Mapped Jira User
              </th>
            </tr>
          </thead>
          <tbody>
            {teamMembers.map((member) => (
              <tr key={member.email} className="border-b hover:bg-gray-50">
                {/* Column 1: Team Member */}
                <td className="px-4 py-3">
                  <div className="font-medium text-gray-900">{member.name}</div>
                  <div className="text-xs text-gray-500">{member.email}</div>
                </td>

                {/* Column 2: Status */}
                <td className="px-4 py-3">
                  {member.jira_account_id ? (
                    <Badge variant="default" className="bg-green-100 text-green-800">
                      <CheckCircle className="w-3 h-3 mr-1" />
                      Mapped
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="bg-red-100 text-red-800">
                      <AlertTriangle className="w-3 h-3 mr-1" />
                      Not Found
                    </Badge>
                  )}
                </td>

                {/* Column 3: Mapped User or Dropdown */}
                <td className="px-4 py-3">
                  {member.jira_account_id ? (
                    // Show mapped user with remove button
                    <div className="flex items-center justify-between group">
                      <div>
                        <div className="font-medium text-gray-900">
                          {member.jira_display_name}
                        </div>
                        <div className="text-xs text-gray-500">
                          {member.jira_account_id}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => removeMapping(member.email)}
                        disabled={loadingRemovalId === member.email}
                      >
                        {loadingRemovalId === member.email ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <X className="w-4 h-4 text-red-500" />
                        )}
                      </Button>
                    </div>
                  ) : (
                    // Show dropdown for manual selection
                    <Select
                      onValueChange={(value) =>
                        createMapping(member.email, value)
                      }
                      disabled={loadingMappingId !== null}
                    >
                      <SelectTrigger className="w-[200px]">
                        <SelectValue placeholder="-" />
                      </SelectTrigger>
                      <SelectContent>
                        {unmappedJiraUsers.length > 0 ? (
                          unmappedJiraUsers.map((jiraUser) => (
                            <SelectItem
                              key={jiraUser.account_id}
                              value={jiraUser.account_id}
                            >
                              <div>
                                <div className="font-medium">
                                  {jiraUser.display_name}
                                </div>
                                {jiraUser.email && (
                                  <div className="text-xs text-gray-500">
                                    {jiraUser.email}
                                  </div>
                                )}
                              </div>
                            </SelectItem>
                          ))
                        ) : (
                          <SelectItem value="no-users" disabled>
                            No unmapped Jira users available
                          </SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-4 mt-6">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="text-sm font-medium text-blue-900">Total Members</div>
          <div className="text-2xl font-bold text-blue-600 mt-1">
            {teamMembers.length}
          </div>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="text-sm font-medium text-green-900">Mapped</div>
          <div className="text-2xl font-bold text-green-600 mt-1">
            {teamMembers.filter(m => m.jira_account_id).length}
          </div>
        </div>
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="text-sm font-medium text-yellow-900">Not Found</div>
          <div className="text-2xl font-bold text-yellow-600 mt-1">
            {teamMembers.filter(m => !m.jira_account_id).length}
          </div>
        </div>
      </div>
    </div>
  )
}
