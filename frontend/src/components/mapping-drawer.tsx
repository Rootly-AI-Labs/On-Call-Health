"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Tooltip } from "@/components/ui/tooltip"
import {
  AlertCircle,
  ArrowUpDown,
  CheckCircle,
  Database,
  Loader2,
  Users,
  Users2,
  X,
  Edit2
} from "lucide-react"
import { toast } from "sonner"

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

interface IntegrationMapping {
  id: number | string
  source_platform: string
  source_identifier: string
  source_name?: string
  target_platform: string
  target_identifier: string | null
  mapping_successful: boolean
  mapping_method: string | null
  error_message: string | null
  data_collected: boolean
  data_points_count: number | null
  created_at: string | null
  updated_at: string | null
  source: string
  is_manual: boolean
  mapping_type?: string
  status?: string
  confidence_score?: number
  last_verified?: string
}

interface MappingStatistics {
  overall_success_rate: number
  total_attempts: number
  mapped_members?: number
  members_with_data?: number
  manual_mappings_count?: number
  github_was_enabled?: boolean | null
  attempted_mappings?: number
  unmapped_members?: number
}

interface MappingDrawerProps {
  isOpen: boolean
  onClose: () => void
  platform: 'github' | 'slack' | 'jira'
  onRefresh?: () => void
}

export function MappingDrawer({ isOpen, onClose, platform, onRefresh }: MappingDrawerProps) {
  const [mappings, setMappings] = useState<IntegrationMapping[]>([])
  const [mappingStats, setMappingStats] = useState<MappingStatistics | null>(null)
  const [loadingMappingData, setLoadingMappingData] = useState(false)
  const [sortField, setSortField] = useState<'source_identifier' | 'target_identifier' | 'status' | 'method'>('source_identifier')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [githubOrganizations, setGithubOrganizations] = useState<string[]>([])
  const [loadingGithubOrgs, setLoadingGithubOrgs] = useState(false)
  
  // Inline editing states
  const [inlineEditingId, setInlineEditingId] = useState<number | string | null>(null)
  const [inlineEditingValue, setInlineEditingValue] = useState('')
  const [savingInlineMapping, setSavingInlineMapping] = useState(false)
  const [githubValidation, setGithubValidation] = useState<{valid?: boolean, message?: string} | null>(null)
  const [validatingGithub, setValidatingGithub] = useState(false)
  
  // Auto-mapping states
  const [runningAutoMapping, setRunningAutoMapping] = useState(false)
  
  // Remove mapping states
  const [removingMappingId, setRemovingMappingId] = useState<number | string | null>(null)
  
  // Cleanup duplicates states
  const [runningCleanup, setRunningCleanup] = useState(false)
  const [cleanupResults, setCleanupResults] = useState<any>(null)
  const [mappingProgress, setMappingProgress] = useState<{
    total: number
    processed: number
    mapped: number
    notFound: number
    errors: number
  } | null>(null)
  const [mappingResults, setMappingResults] = useState<Array<{
    email: string
    name: string
    github_username: string | null
    status: 'mapped' | 'not_found' | 'error'
    error?: string
    platform?: string
  }>>([])
  const [showMappingResults, setShowMappingResults] = useState(false)

  const loadMappingData = useCallback(async () => {
    if (!isOpen) {
      return
    }
    
    try {
      setLoadingMappingData(true)
      const authToken = localStorage.getItem('auth_token')
      
      if (!authToken) {
        toast.error('Authentication required')
        return
      }
      
      const [mappingsResponse, statsResponse] = await Promise.all([
        fetch(`${API_BASE}/integrations/mappings/platform/${platform}`, {
          headers: { 'Authorization': `Bearer ${authToken}` }
        }),
        fetch(`${API_BASE}/integrations/mappings/success-rate?platform=${platform}`, {
          headers: { 'Authorization': `Bearer ${authToken}` }
        })
      ])

      if (mappingsResponse.ok && statsResponse.ok) {
        const mappingsData = await mappingsResponse.json()
        const statsData = await statsResponse.json()
        
        // Deduplicate mappings by email, keeping the most recent or manual mapping
        const deduplicatedMappings = mappingsData.reduce((acc: IntegrationMapping[], current: IntegrationMapping) => {
          const existingIndex = acc.findIndex(m => m.source_identifier.toLowerCase() === current.source_identifier.toLowerCase())
          
          if (existingIndex === -1) {
            // No duplicate found, add this mapping
            acc.push(current)
          } else {
            const existing = acc[existingIndex]
            // Prefer manual mappings over automated, and newer over older
            const shouldReplace = 
              (current.is_manual && !existing.is_manual) ||
              (current.is_manual === existing.is_manual && current.id > existing.id)
            
            if (shouldReplace) {
              acc[existingIndex] = current
            }
          }
          return acc
        }, [])
        
        
        // Calculate stats from deduplicated mappings (frontend truth)
        const totalAttempts = deduplicatedMappings.length
        const mappedMembers = deduplicatedMappings.filter(m => {
          const hasValidTarget = m.target_identifier && 
                                 m.target_identifier.trim() !== '' && 
                                 m.target_identifier !== 'unknown'
          return m.mapping_successful && hasValidTarget
        }).length
        const unmappedMembers = totalAttempts - mappedMembers
        const membersWithData = deduplicatedMappings.filter(m => 
          m.data_collected && m.data_points_count > 0
        ).length
        const successRate = totalAttempts > 0 ? (mappedMembers / totalAttempts * 100) : 0
        
        const frontendStats = {
          total_attempts: totalAttempts,
          mapped_members: mappedMembers,
          unmapped_members: unmappedMembers,
          members_with_data: membersWithData,
          overall_success_rate: Math.round(successRate * 10) / 10,
          manual_mappings_count: deduplicatedMappings.filter(m => m.is_manual).length
        }
        
        setMappings(deduplicatedMappings)
        setMappingStats(frontendStats) // Use frontend calculated stats instead of backend
      } else {
        toast.error('Failed to load mapping data')
      }
    } catch (error) {
      toast.error('Error loading mapping data')
    } finally {
      setLoadingMappingData(false)
    }
  }, [isOpen, platform])

  // Fetch GitHub organizations when platform is GitHub
  const fetchGithubOrganizations = useCallback(async () => {
    if (platform !== 'github' || !isOpen) return
    
    try {
      setLoadingGithubOrgs(true)
      const authToken = localStorage.getItem('auth_token')
      
      if (!authToken) return
      
      const response = await fetch(`${API_BASE}/integrations/github/status`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      })
      
      if (response.ok) {
        const data = await response.json()
        if (data.connected && data.integration?.organizations) {
          setGithubOrganizations(data.integration.organizations)
        }
      }
    } catch (error) {
    } finally {
      setLoadingGithubOrgs(false)
    }
  }, [platform, isOpen])

  useEffect(() => {
    if (isOpen) {
      loadMappingData()
      fetchGithubOrganizations()
    }
  }, [isOpen, loadMappingData, fetchGithubOrganizations])

  const handleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  const sortedMappings = [...mappings].sort((a, b) => {
    let aValue: string | number = ''
    let bValue: string | number = ''
    
    switch (sortField) {
      case 'source_identifier':
        aValue = a.source_name || a.source_identifier || ''
        bValue = b.source_name || b.source_identifier || ''
        break
      case 'target_identifier':
        aValue = a.target_identifier || ''
        bValue = b.target_identifier || ''
        break
      case 'status':
        aValue = a.mapping_successful ? 'success' : 'failed'
        bValue = b.mapping_successful ? 'success' : 'failed'
        break
      case 'method':
        aValue = a.is_manual ? 'manual' : a.mapping_method || ''
        bValue = b.is_manual ? 'manual' : b.mapping_method || ''
        break
    }
    
    if (sortDirection === 'asc') {
      return aValue < bValue ? -1 : aValue > bValue ? 1 : 0
    } else {
      return aValue > bValue ? -1 : aValue < bValue ? 1 : 0
    }
  })

  const startInlineEdit = (mappingId: number | string, currentValue: string = '') => {
    setInlineEditingId(mappingId)
    setInlineEditingValue(currentValue)
    setGithubValidation(null)
  }

  const cancelInlineEdit = () => {
    setInlineEditingId(null)
    setInlineEditingValue('')
    setGithubValidation(null)
  }

  const validateGitHubUsername = useCallback(async (username: string) => {
    if (platform !== 'github' || !username.trim()) {
      setGithubValidation(null)
      return
    }

    setValidatingGithub(true)
    try {
      const authToken = localStorage.getItem('auth_token')
      if (!authToken) {
        setGithubValidation({ valid: false, message: 'Not authenticated' })
        return false
      }
      
      const response = await fetch(`${API_BASE}/integrations/mappings/github/validate/${encodeURIComponent(username.trim())}`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      })
      
      const data = await response.json()
      
      if (data.valid) {
        setGithubValidation({ valid: true, message: `Valid user: ${data.name || data.username}` })
        return true
      } else {
        setGithubValidation({ valid: false, message: data.message || 'Invalid username' })
        return false
      }
    } catch (error) {
      setGithubValidation({ valid: false, message: 'Validation failed' })
      return false
    } finally {
      setValidatingGithub(false)
    }
  }, [platform])

  useEffect(() => {
    if (inlineEditingValue && platform === 'github') {
      const timeoutId = setTimeout(() => {
        validateGitHubUsername(inlineEditingValue)
      }, 500)
      return () => clearTimeout(timeoutId)
    }
  }, [inlineEditingValue, platform, validateGitHubUsername])

  const runAutoMapping = async () => {
    if (platform !== 'github' && platform !== 'jira') {
      toast.error(`Auto-mapping is only available for GitHub and Jira`)
      return
    }
    setRunningAutoMapping(true)
    setMappingProgress(null)
    setMappingResults([])

    try {
      const authToken = localStorage.getItem('auth_token')
      if (!authToken) {
        toast.error('Authentication required')
        return
      }

      // Use platform-specific endpoint
      const endpoint = platform === 'github'
        ? `${API_BASE}/integrations/manual-mappings/run-github-mapping`
        : `${API_BASE}/integrations/manual-mappings/run-jira-mapping`

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        }
      })


      if (!response.ok) {
        const error = await response.json().catch(() => ({}))

        if (error.detail === 'GitHub integration not found' || error.detail === 'Jira integration not found') {
          toast.error(`Please connect a ${platformTitle} integration first before running auto-mapping`)
          return
        }

        throw new Error(error.detail || error.message || `HTTP ${response.status}: Failed to run auto-mapping`)
      }

      const result = await response.json()

      setMappingProgress({
        total: result.total_processed,
        processed: result.total_processed,
        mapped: result.mapped,
        notFound: result.not_found,
        errors: result.errors
      })

      setMappingResults(result.results)
      setShowMappingResults(true)

      if (result.mapped > 0) {
        toast.success(`✅ Successfully mapped ${result.mapped} users to ${platformTitle}`)
        // Reload mapping data to show new mappings
        await loadMappingData()
      } else if (result.total_processed > 0) {
        // Users were processed but none were successfully mapped
        const failureReasons = []
        if (result.not_found > 0) failureReasons.push(`${result.not_found} not found in ${platformTitle}`)
        if (result.errors > 0) failureReasons.push(`${result.errors} errors occurred`)

        const reasonText = failureReasons.length > 0 ? ` (${failureReasons.join(', ')})` : ''
        toast.warning(`⚠️ Processed ${result.total_processed} users but found no successful mappings${reasonText}`)
      } else {
        toast.info('ℹ️ No users found to process for auto-mapping')
      }

    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to run auto-mapping')
    } finally {
      setRunningAutoMapping(false)
    }
  }

  const debugMappings = async () => {
    try {
      const authToken = localStorage.getItem('auth_token')
      if (!authToken) return
      
      
    } catch (error) {
    }
  }

  const runCleanupDuplicates = async (dryRun: boolean = true) => {
    setRunningCleanup(true)
    setCleanupResults(null)
    
    try {
      const authToken = localStorage.getItem('auth_token')
      if (!authToken) {
        toast.error('Authentication required')
        return
      }
      
      const url = `${API_BASE}/integrations/manual-mappings/cleanup-duplicates?target_platform=${platform}&dry_run=${dryRun}&remove_test_emails=true`
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      })
      
      
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.detail || 'Failed to clean up duplicates')
      }
      
      const result = await response.json()
      setCleanupResults(result)
      
      if (result.total_to_remove === 0) {
        toast.info('No duplicate mappings found!')
      } else if (dryRun) {
        toast.info(`Found ${result.total_to_remove} duplicate mappings. Review and confirm to remove them.`)
      } else {
        toast.success(`Successfully removed ${result.total_to_remove} duplicate mappings!`)
        await loadMappingData()
        onRefresh?.()
      }
      
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to clean up duplicates')
    } finally {
      setRunningCleanup(false)
    }
  }

  const removeMapping = async (mappingId: number | string) => {
    const mapping = mappings.find(m => m.id === mappingId)
    if (!mapping) {
      toast.error('Mapping not found')
      return
    }

    setRemovingMappingId(mappingId)
    
    try {
      const authToken = localStorage.getItem('auth_token')
      if (!authToken) {
        toast.error('Authentication required')
        return
      }

      let response

      if (mapping.is_manual) {
        // Delete the manual mapping directly
        response = await fetch(`${API_BASE}/integrations/manual-mappings/${mappingId}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${authToken}`
          }
        })
      } else {
        // For auto mappings, create a manual "override" mapping with empty target to effectively remove it
        response = await fetch(`${API_BASE}/integrations/manual-mappings`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            source_platform: mapping.source_platform,
            source_identifier: mapping.source_identifier,
            target_platform: platform,
            target_identifier: "", // Empty string to "clear" the mapping
            is_removal_override: true // Flag to indicate this is removing an auto mapping
          })
        })
      }

      if (response.ok) {
        toast.success(`${platform === 'github' ? 'GitHub' : 'Slack'} username removed successfully!`)
        await loadMappingData()
        onRefresh?.()
      } else {
        const errorData = await response.json().catch(() => ({}))
        
        // Handle different error response formats
        let errorMessage = 'Failed to remove mapping'
        if (typeof errorData === 'string') {
          errorMessage = errorData
        } else if (errorData.detail && typeof errorData.detail === 'string') {
          errorMessage = errorData.detail
        } else if (errorData.message && typeof errorData.message === 'string') {
          errorMessage = errorData.message
        } else if (Array.isArray(errorData.detail)) {
          // Handle validation error arrays
          errorMessage = errorData.detail.map(err => err.msg || err).join(', ')
        }
        
        toast.error(errorMessage)
      }
    } catch (error) {
      toast.error('Network error occurred')
    } finally {
      setRemovingMappingId(null)
    }
  }

  const saveInlineMapping = async (mappingId: number | string, email: string) => {
    if (!inlineEditingValue.trim()) {
      toast.error(`Please enter a ${platform === 'github' ? 'GitHub username' : 'Slack user ID'}`)
      return
    }

    if (platform === 'github' && githubValidation?.valid !== true) {
      toast.error(`Cannot save invalid username: ${githubValidation?.message || 'Please enter a valid GitHub username'}`)
      return
    }

    setSavingInlineMapping(true)
    try {
      const authToken = localStorage.getItem('auth_token')
      if (!authToken) {
        toast.error('Authentication required')
        return
      }

      const mapping = mappings.find(m => m.id === mappingId)
      let response

      if (mapping && mapping.is_manual) {
        // Update existing manual mapping
        response = await fetch(`${API_BASE}/integrations/manual-mappings/${mappingId}`, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            target_identifier: inlineEditingValue.trim()
          })
        })
      } else {
        // Create new manual mapping (for auto mappings or new entries)
        response = await fetch(`${API_BASE}/integrations/manual-mappings`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            source_platform: mapping?.source_platform || 'rootly',
            source_identifier: email,
            target_platform: platform,
            target_identifier: inlineEditingValue.trim()
          })
        })
      }

      if (response.ok) {
        toast.success(`${platform === 'github' ? 'GitHub' : 'Slack'} username saved successfully!`)
        cancelInlineEdit()
        await loadMappingData()
        onRefresh?.()
      } else {
        const errorData = await response.json().catch(() => ({}))
        toast.error(errorData.detail || 'Failed to save mapping')
      }
    } catch (error) {
      toast.error('Network error occurred')
    } finally {
      setSavingInlineMapping(false)
    }
  }

  // Clear all mappings function
  const [clearingAllMappings, setClearingAllMappings] = useState(false)
  
  const clearAllMappings = async () => {
    if (!mappings.length) {
      toast.info('No mappings to clear')
      return
    }

    // Show confirmation dialog
    const confirmed = window.confirm(
      `Are you sure you want to remove ALL ${mappings.length} GitHub mappings?\n\nThis action cannot be undone and will remove all user mappings from your account.`
    )
    
    if (!confirmed) return

    setClearingAllMappings(true)

    try {
      const authToken = localStorage.getItem('auth_token')
      if (!authToken) {
        toast.error('Authentication required')
        setClearingAllMappings(false)
        return
      }


      // Remove each mapping individually (handle manual vs auto mappings)
      const removePromises = mappings.map(async mapping => {
        try {
          let response
          
          if (mapping.is_manual) {
            // Delete the manual mapping directly
            response = await fetch(`${API_BASE}/integrations/manual-mappings/${mapping.id}`, {
              method: 'DELETE',
              headers: {
                'Authorization': `Bearer ${authToken}`
              }
            })
          } else {
            // For auto mappings, create a manual "override" mapping with empty target
            response = await fetch(`${API_BASE}/integrations/manual-mappings`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                source_platform: mapping.source_platform,
                source_identifier: mapping.source_identifier,
                target_platform: platform,
                target_identifier: "", // Empty string to "clear" the mapping
                is_removal_override: true // Flag to indicate this is removing an auto mapping
              })
            })
          }

          return {
            id: mapping.id,
            email: mapping.source_identifier,
            isManual: mapping.is_manual,
            success: response.ok,
            status: response.status,
            response
          }
        } catch (error) {
          return {
            id: mapping.id,
            email: mapping.source_identifier,
            isManual: mapping.is_manual,
            success: false,
            status: 0,
            error: error.message
          }
        }
      })

      toast.info(`Removing ${mappings.length} mappings...`)
      
      const results = await Promise.allSettled(removePromises)
      
      // Count successful and failed removals
      let successful = 0
      let failed = 0
      const errors = []

      results.forEach((result, index) => {
        if (result.status === 'fulfilled' && result.value.success) {
          successful++
        } else {
          failed++
          let error
          if (result.status === 'fulfilled') {
            const type = result.value.isManual ? 'manual' : 'auto'
            error = result.value.error 
              ? `${result.value.email} (${type}): ${result.value.error}`
              : `${result.value.email} (${type}): HTTP ${result.value.status}`
          } else {
            error = `${mappings[index].source_identifier}: ${result.reason}`
          }
          errors.push(error)
        }
      })

      // Show results
      if (successful > 0) {
        toast.success(`Successfully removed ${successful} mappings${failed > 0 ? ` (${failed} failed)` : ''}`)
        await loadMappingData() // Refresh the list
        onRefresh?.()
      } else {
        toast.error(`Failed to remove all ${mappings.length} mappings`)
      }


    } catch (error) {
      toast.error('Network error occurred while clearing mappings')
    } finally {
      setClearingAllMappings(false)
    }
  }

  const platformTitle = platform === 'github' ? 'GitHub' : platform === 'jira' ? 'Jira' : 'Slack'
  const platformColor = platform === 'github' ? 'blue' : platform === 'jira' ? 'blue' : 'purple'

  // Platform logo component
  const PlatformLogo = ({ platform, size = 'sm' }: { platform: string, size?: 'sm' | 'md' }) => {
    const sizeClass = size === 'sm' ? 'w-4 h-4' : 'w-5 h-5'
    
    if (platform === 'rootly') {
      return (
        <div className={`${sizeClass} rounded bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center`} title="Rootly">
          <span className="text-white font-bold text-[10px]">R</span>
        </div>
      )
    } else if (platform === 'pagerduty') {
      return (
        <div className={`${sizeClass} rounded bg-gradient-to-br from-green-500 to-green-600 flex items-center justify-center`} title="PagerDuty">
          <span className="text-white font-bold text-[10px]">PD</span>
        </div>
      )
    }
    return null
  }


  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent className="sm:max-w-4xl lg:max-w-5xl">
        <SheetHeader>
          <SheetTitle className="flex items-center space-x-2">
            <Users className="w-5 h-5" />
            <span>{platformTitle} Data Mapping</span>
          </SheetTitle>
          <SheetDescription>
            View and manage user mappings for {platformTitle} integration
          </SheetDescription>
          {platform === 'github' && githubOrganizations.length > 0 && (
            <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-md">
              <p className="text-sm text-blue-800">
                <span className="font-medium">Organization Restriction:</span> GitHub mappings are limited to members of{' '}
                {githubOrganizations.length === 1 ? (
                  <span className="font-mono">{githubOrganizations[0]}</span>
                ) : (
                  <>
                    {githubOrganizations.slice(0, -1).map((org, i) => (
                      <span key={org}>
                        {i > 0 && ', '}
                        <span className="font-mono">{org}</span>
                      </span>
                    ))}
                    {' and '}
                    <span className="font-mono">{githubOrganizations[githubOrganizations.length - 1]}</span>
                  </>
                )}
              </p>
            </div>
          )}
        </SheetHeader>

        <div className="mt-6">
          {loadingMappingData ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin mr-2" />
              <span>Loading mapping data...</span>
            </div>
          ) : (
            <>
              {/* Statistics and Auto-Mapping */}
              {mappingStats && (
                <div className="mb-8">
                  <div className="mb-6 flex items-center justify-between">
                    <h3 className="font-semibold text-gray-900">Mapping Statistics</h3>
                    {(platform === 'github' || platform === 'jira') && (
                      <div className="flex space-x-2">
                        <Button
                          onClick={runAutoMapping}
                          disabled={runningAutoMapping}
                          className="bg-blue-600 hover:bg-blue-700 text-white"
                          size="sm"
                        >
                          {runningAutoMapping ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              Running Auto-Mapping...
                            </>
                          ) : (
                            <>
                              <Users className="w-4 h-4 mr-2" />
                              Run {platformTitle} Auto-Mapping
                            </>
                          )}
                        </Button>
                        <Button
                          onClick={() => runCleanupDuplicates(true)}
                          disabled={runningCleanup}
                          variant="outline"
                          size="sm"
                        >
                          {runningCleanup ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              Cleaning...
                            </>
                          ) : (
                            <>
                              <Database className="w-4 h-4 mr-2" />
                              Clean Up Mappings
                            </>
                          )}
                        </Button>
                        <Button
                          onClick={debugMappings}
                          variant="ghost"
                          size="sm"
                          className="text-xs"
                        >
                          🔍 Debug
                        </Button>
                        <Button
                          onClick={clearAllMappings}
                          variant="destructive"
                          size="sm"
                          disabled={!mappings.length || clearingAllMappings}
                        >
                          {clearingAllMappings ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              Removing...
                            </>
                          ) : (
                            <>
                              <X className="w-4 h-4 mr-2" />
                              Clear All ({mappings.length})
                            </>
                          )}
                        </Button>
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-4 gap-4">
                    <Card className="p-4 border-purple-200">
                      <div className="flex items-center space-x-2">
                        <Users2 className="w-4 h-4 text-blue-600" />
                        <div>
                          <div className="text-2xl font-bold">{mappingStats.total_attempts || 0}</div>
                          <div className="text-sm text-gray-600">Total Team</div>
                        </div>
                      </div>
                    </Card>
                    <Card className="p-4 border-purple-200">
                      <div className="flex items-center space-x-2">
                        <CheckCircle className="w-4 h-4 text-green-600" />
                        <div>
                          <div className="text-2xl font-bold text-green-600">{mappingStats.mapped_members || 0}</div>
                          <div className="text-sm text-gray-600">Mapped</div>
                        </div>
                      </div>
                    </Card>
                    <Card className="p-4 border-purple-200">
                      <div className="flex items-center space-x-2">
                        <AlertCircle className="w-4 h-4 text-orange-600" />
                        <div>
                          <div className="text-2xl font-bold text-orange-600">{mappingStats.unmapped_members || 0}</div>
                          <div className="text-sm text-gray-600">Unmapped</div>
                        </div>
                      </div>
                    </Card>
                    <Card className="p-4 border-purple-200">
                      <div className="flex items-center space-x-2">
                        <Database className="w-4 h-4 text-purple-600" />
                        <div>
                          <div className="text-2xl font-bold">{mappingStats.members_with_data || 0}</div>
                          <div className="text-sm text-gray-600">With Data</div>
                        </div>
                      </div>
                    </Card>
                  </div>
                  
                  {/* Success Rate Summary */}
                  <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <CheckCircle className="w-5 h-5 text-green-600" />
                        <span className="font-medium text-gray-900">
                          Success Rate: <span className="text-green-600">{mappingStats.overall_success_rate}%</span>
                        </span>
                        <span className="text-sm text-gray-500">
                          ({mappingStats.mapped_members || 0} of {mappingStats.total_attempts || 0} team members)
                        </span>
                      </div>
                      {(mappingStats.unmapped_members || 0) > 0 && (
                        <div className="text-sm text-orange-600">
                          {mappingStats.unmapped_members} members need GitHub usernames
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Auto-Mapping Progress */}
              {runningAutoMapping && (
                <div className="mb-6 p-4 bg-blue-50 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-blue-700">
                      <Loader2 className="w-3 h-3 inline-block mr-1 animate-spin" />
                      {platform === 'github' ? 'Searching for GitHub usernames...' : platform === 'jira' ? 'Searching for Jira users...' : 'Searching for Slack users...'}
                    </span>
                    {mappingProgress && (
                      <span className="text-sm text-blue-600">
                        {mappingProgress.processed} / {mappingProgress.total}
                      </span>
                    )}
                  </div>
                  {mappingProgress && (
                    <>
                      <div className="w-full bg-blue-100 rounded-full h-2 mb-2">
                        <div
                          className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                          style={{ width: `${(mappingProgress.processed / mappingProgress.total) * 100}%` }}
                        />
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-xs text-blue-700">
                        <div>✓ Mapped: {mappingProgress.mapped}</div>
                        <div>✗ Not Found: {mappingProgress.notFound}</div>
                        <div>⚠ Errors: {mappingProgress.errors}</div>
                      </div>
                    </>
                  )}
                  {!mappingProgress && (
                    <div className="text-xs text-blue-600 mt-2">
                      {platform === 'github' ? 'Analyzing team member emails and searching GitHub for matches...' : platform === 'jira' ? 'Analyzing team member names and searching Jira for matches...' : 'Analyzing team member emails and searching Slack for matches...'}
                    </div>
                  )}
                </div>
              )}

              {/* Cleanup Results */}
              {cleanupResults && cleanupResults.total_to_remove > 0 && (
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-medium text-gray-900">
                      {cleanupResults.dry_run ? 'Duplicate Cleanup Preview' : 'Cleanup Results'}
                    </h4>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setCleanupResults(null)}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                  <div className="border rounded-lg p-4 space-y-3">
                    <div className="text-sm space-y-1">
                      {cleanupResults.total_duplicates_found > 0 && (
                        <div><strong>Duplicates:</strong> {cleanupResults.total_duplicate_groups} users with {cleanupResults.total_duplicates_found} duplicate mappings</div>
                      )}
                      {cleanupResults.total_test_emails_found > 0 && (
                        <div><strong>Test emails:</strong> {cleanupResults.total_test_emails_found} mappings with + symbols</div>
                      )}
                      <div className="font-medium">
                        Total to remove: {cleanupResults.total_to_remove}
                      </div>
                    </div>
                    {cleanupResults.dry_run && cleanupResults.total_to_remove > 0 && (
                      <div className="flex space-x-2">
                        <Button
                          onClick={() => runCleanupDuplicates(false)}
                          disabled={runningCleanup}
                          className="bg-red-600 hover:bg-red-700 text-white"
                          size="sm"
                        >
                          Confirm & Remove Duplicates
                        </Button>
                        <Button
                          onClick={() => setCleanupResults(null)}
                          variant="outline"
                          size="sm"
                        >
                          Cancel
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Auto-Mapping Results */}
              {showMappingResults && mappingResults.length > 0 && (
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-medium text-gray-900">Auto-Mapping Results</h4>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowMappingResults(false)}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                  <div className="max-h-48 overflow-y-auto border rounded-lg p-3 space-y-2">
                    {mappingResults.map((result, idx) => (
                      <div key={idx} className="flex items-center justify-between text-sm">
                        <div className="flex items-center space-x-2">
                          {result.platform && <PlatformLogo platform={result.platform} size="sm" />}
                          <span className="font-medium truncate max-w-[200px]" title={result.email}>
                            {result.name || result.email}
                          </span>
                          {result.status === 'mapped' && result.github_username && (
                            <>
                              <span className="text-gray-500">→</span>
                              <span className="text-blue-600">{platform === 'github' ? '@' : ''}{result.github_username}</span>
                            </>
                          )}
                        </div>
                        <div>
                          {result.status === 'mapped' && (
                            <Badge variant="secondary" className="bg-green-100 text-green-700 border-0">Mapped</Badge>
                          )}
                          {result.status === 'not_found' && (
                            <Badge variant="secondary" className="bg-gray-100 text-gray-700 border-0">Not Found</Badge>
                          )}
                          {result.status === 'error' && (
                            <Badge variant="destructive" className="bg-red-100 text-red-700 border-0" title={result.error}>Error</Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Mapping Results */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-gray-900">Mapping Results</h3>
                </div>

                {/* Header Row */}
                <div className="bg-gray-100 px-4 py-2 rounded-t-lg">
                  <div className="grid grid-cols-4 gap-4 text-xs font-medium text-gray-700 uppercase tracking-wide">
                    <div className="flex items-center space-x-1">
                      <button 
                        onClick={() => handleSort('source_identifier')}
                        className="flex items-center space-x-1 hover:text-gray-900"
                      >
                        <span>Team Member</span>
                        {sortField === 'source_identifier' ? (
                          sortDirection === 'asc' ? <ArrowUpDown className="w-3 h-3 rotate-180" /> : <ArrowUpDown className="w-3 h-3" />
                        ) : (
                          <ArrowUpDown className="w-3 h-3 opacity-50" />
                        )}
                      </button>
                    </div>
                    <div className="flex items-center space-x-1">
                      <button 
                        onClick={() => handleSort('status')}
                        className="flex items-center space-x-1 hover:text-gray-900"
                      >
                        <span>Status</span>
                        {sortField === 'status' ? (
                          sortDirection === 'asc' ? <ArrowUpDown className="w-3 h-3 rotate-180" /> : <ArrowUpDown className="w-3 h-3" />
                        ) : (
                          <ArrowUpDown className="w-3 h-3 opacity-50" />
                        )}
                      </button>
                    </div>
                    <div>
                      <span>{platformTitle} User</span>
                      <div className="text-[10px] text-gray-500 normal-case">Click + to add missing</div>
                    </div>
                    <div className="flex items-center space-x-1">
                      <button 
                        onClick={() => handleSort('method')}
                        className="flex items-center space-x-1 hover:text-gray-900"
                      >
                        <span>Method</span>
                        {sortField === 'method' ? (
                          sortDirection === 'asc' ? <ArrowUpDown className="w-3 h-3 rotate-180" /> : <ArrowUpDown className="w-3 h-3" />
                        ) : (
                          <ArrowUpDown className="w-3 h-3 opacity-50" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Data Rows */}
                <div className="divide-y max-h-[32rem] overflow-y-auto">
                  {sortedMappings.length > 0 ? sortedMappings.map((mapping) => (
                    <div key={mapping.id} className="px-4 py-3">
                      <div className="grid grid-cols-4 gap-4 text-sm">
                        <div className="font-medium" title={mapping.source_identifier}>
                          <div className="truncate">
                            {mapping.source_name ? (
                              <>
                                <span className="font-semibold">{mapping.source_name}</span>
                                <div className="text-xs text-gray-500 truncate">{mapping.source_identifier}</div>
                              </>
                            ) : (
                              mapping.source_identifier
                            )}
                          </div>
                        </div>
                        
                        <div className="space-y-1">
                          {(() => {
                            // More accurate success determination
                            const hasValidTarget = mapping.target_identifier && 
                                                  mapping.target_identifier !== "unknown" && 
                                                  mapping.target_identifier !== "";
                            const isManualMapping = mapping.is_manual;
                            const isSuccessful = hasValidTarget && (mapping.mapping_successful !== false);
                            
                            if (isSuccessful) {
                              return (
                                <Badge variant="default" className="bg-green-100 text-green-800 border-green-200">
                                  <CheckCircle className="w-3 h-3 mr-1" />
                                  {isManualMapping ? 'Mapped' : 'Success'}
                                </Badge>
                              );
                            } else {
                              return (
                                <Badge variant="destructive" className="bg-red-100 text-red-800 border-red-200">
                                  <AlertCircle className="w-3 h-3 mr-1" />
                                  {hasValidTarget ? 'No Data' : 'Not Mapped'}
                                </Badge>
                              );
                            }
                          })()}
                          <div className="text-xs text-gray-500">
                            {mapping.data_points_count ? (
                              <span>{mapping.data_points_count} data points</span>
                            ) : (
                              // Only show "No data" if GitHub was enabled in the analysis
                              mappingStats?.github_was_enabled && platform === 'github' ? (
                                <span>No data</span>
                              ) : null
                            )}
                          </div>
                        </div>

                        <div className="truncate" title={mapping.target_identifier || mapping.error_message || ''}>
                          {(() => {
                            const isCurrentlyEditing = inlineEditingId === mapping.id
                            const hasTargetId = !!mapping.target_identifier
                            
                            // Show input field if this mapping is being edited
                            if (isCurrentlyEditing) {
                              return (
                                <div className="flex items-center space-x-2">
                                  <Input
                                value={inlineEditingValue}
                                onChange={(e) => setInlineEditingValue(e.target.value)}
                                placeholder={`Enter ${platform === 'github' ? 'GitHub username' : 'Slack user ID'}`}
                                className={`flex-1 px-2 py-1 text-xs border rounded focus:outline-none focus:ring-1 ${
                                  githubValidation?.valid === false 
                                    ? 'border-red-300 focus:ring-red-500' 
                                    : githubValidation?.valid === true
                                    ? 'border-green-300 focus:ring-green-500'
                                    : 'border-gray-300 focus:ring-blue-500'
                                }`}
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    saveInlineMapping(mapping.id, mapping.source_identifier)
                                  } else if (e.key === 'Escape') {
                                    cancelInlineEdit()
                                  }
                                }}
                              />
                              <button
                                onClick={() => {
                                  if (platform === 'github' && githubValidation?.valid !== true) {
                                    toast.error(`Cannot save invalid username: ${githubValidation?.message || 'Please enter a valid GitHub username'}`)
                                    return
                                  }
                                  saveInlineMapping(mapping.id, mapping.source_identifier)
                                }}
                                disabled={savingInlineMapping || validatingGithub}
                                className={`p-1 hover:opacity-80 disabled:opacity-50 ${
                                  platform === 'github' && githubValidation?.valid !== true
                                    ? 'text-gray-400 cursor-not-allowed'
                                    : 'text-green-600 hover:text-green-700'
                                }`}
                                title="Save changes"
                              >
                                <CheckCircle className="w-4 h-4" />
                              </button>
                              <button
                                onClick={cancelInlineEdit}
                                disabled={savingInlineMapping}
                                className="p-1 text-gray-400 hover:text-red-600 disabled:opacity-50"
                                title="Cancel"
                              >
                                <X className="w-4 h-4" />
                              </button>
                                </div>
                              )
                            }
                            
                            // Show edit button if has target_identifier and not editing
                            if (hasTargetId && !isCurrentlyEditing) {
                              return (
                                <div className="flex items-center space-x-2">
                                  <span className="truncate">{mapping.target_identifier}</span>
                                  {mapping.is_manual && (
                                    <Tooltip content="This is a manual mapping. Data will show after running an analysis.">
                                      <Badge 
                                        variant="outline"
                                        className={`text-xs px-1.5 py-0.5 bg-${platformColor}-50 text-${platformColor}-700 border-${platformColor}-200`}
                                      >
                                        Manual
                                      </Badge>
                                    </Tooltip>
                                  )}
                                  <button 
                                    onClick={() => startInlineEdit(mapping.id, mapping.target_identifier || '')}
                                    className="text-gray-400 hover:text-gray-600"
                                    title="Edit mapping"
                                  >
                                    <Edit2 className="w-3 h-3" />
                                  </button>
                                  <button 
                                    onClick={() => removeMapping(mapping.id)}
                                    disabled={removingMappingId === mapping.id}
                                    className={`${
                                      removingMappingId === mapping.id 
                                        ? 'text-gray-300 cursor-not-allowed' 
                                        : 'text-gray-400 hover:text-red-600'
                                    }`}
                                    title={removingMappingId === mapping.id 
                                      ? 'Removing...' 
                                      : `Remove ${platform === 'github' ? 'GitHub username' : 'Slack user ID'}${mapping.is_manual ? '' : ' (will override auto-detection)'}`
                                    }
                                  >
                                    {removingMappingId === mapping.id ? (
                                      <Loader2 className="w-3 h-3 animate-spin" />
                                    ) : (
                                      <X className="w-3 h-3" />
                                    )}
                                  </button>
                                </div>
                              )
                            }
                            
                            // Show add button if no target_identifier and not editing
                            if (!hasTargetId && !isCurrentlyEditing) {
                              return (
                                <button
                                  onClick={() => startInlineEdit(mapping.id)}
                                  className="flex items-center space-x-1 px-3 py-1 text-xs text-gray-500 border border-dashed border-gray-300 rounded hover:bg-gray-50 hover:border-gray-400 hover:text-gray-700 transition-colors"
                                >
                                  <span>+ Click to add {platform === 'github' ? 'GitHub username' : 'Slack user ID'}</span>
                                </button>
                              )
                            }
                            
                            return null
                          })()}
                          
                          {platform === 'github' && inlineEditingId === mapping.id && githubValidation && (
                            <div className={`text-xs mt-1 ${githubValidation.valid ? 'text-green-600' : 'text-red-600'}`}>
                              {validatingGithub ? 'Validating...' : githubValidation.message}
                            </div>
                          )}
                        </div>

                        <div className="text-xs">
                          {mapping.is_manual ? (
                            <Badge variant="outline" className="bg-blue-50 text-blue-700">
                              Manual
                            </Badge>
                          ) : (
                            <span className="text-gray-600">{mapping.mapping_method || 'Unknown'}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  )) : (
                    <div className="px-4 py-8 text-center text-gray-500">
                      No mapping data available
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}