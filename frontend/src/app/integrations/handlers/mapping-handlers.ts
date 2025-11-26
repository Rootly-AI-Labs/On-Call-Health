import { toast } from "sonner"
import { API_BASE, IntegrationMapping, MappingStatistics } from "../types"

export async function loadMappingData(
  platform: 'github' | 'slack' | 'jira',
  showMappingDialog: boolean,
  setLoadingMappingData: (loading: boolean) => void,
  setSelectedMappingPlatform: (platform: 'github' | 'slack' | 'jira') => void,
  setMappingData: (data: IntegrationMapping[]) => void,
  setMappingStats: (stats: MappingStatistics) => void,
  setAnalysisMappingStats: (stats: any) => void,
  setCurrentAnalysisId: (id: number | null) => void,
  setShowMappingDialog: (show: boolean) => void
): Promise<void> {
  setLoadingMappingData(true)
  setSelectedMappingPlatform(platform)

  try {
    const authToken = localStorage.getItem('auth_token')
    if (!authToken) {
      toast.error('Please log in to view mapping data')
      return
    }

    // Use the existing working endpoints

    const [mappingsResponse, statsResponse] = await Promise.all([
      fetch(`${API_BASE}/integrations/mappings/platform/${platform}`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      }),
      fetch(`${API_BASE}/integrations/mappings/success-rate?platform=${platform}`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      })
    ])


    if (mappingsResponse.ok && statsResponse.ok) {
      const mappings = await mappingsResponse.json()
      const stats = await statsResponse.json()

      const failedMappings = mappings.filter(m => !m.target_identifier)
      const successfulMappings = mappings.filter(m => m.target_identifier)


      setMappingData(mappings)
      setMappingStats(stats)
      setAnalysisMappingStats(null)
      setCurrentAnalysisId(null)
      setShowMappingDialog(true)


      // Show success message only if dialog is already open (refresh action)
      if (showMappingDialog) {
        const platformName = platform === 'github' ? 'GitHub' : platform === 'slack' ? 'Slack' : 'Jira'
        toast.success(`${platformName} mapping data refreshed successfully`)
      }
    } else {
      throw new Error(`Failed to fetch mapping data - Mappings: ${mappingsResponse.status}, Stats: ${statsResponse.status}`)
    }
  } catch (error) {
    toast.error(`Failed to load mapping data: ${error.message}`)
  } finally {
    setLoadingMappingData(false)
  }
}

export async function validateGithubUsername(
  username: string,
  setValidatingGithub: (loading: boolean) => void,
  setGithubValidation: (validation: { valid: boolean; message: string } | null) => void
): Promise<boolean> {
  if (!username.trim()) {
    setGithubValidation({ valid: false, message: 'Username cannot be empty' })
    return false
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

    if (response.ok && data.valid) {
      setGithubValidation({ valid: true, message: `Found: ${data.name || data.username}` })
      return true
    } else {
      const errorMsg = data.message || data.error || `API Error (${response.status})`
      setGithubValidation({ valid: false, message: errorMsg })
      return false
    }
  } catch (error) {
    console.error('Error validating GitHub username:', error)
    setGithubValidation({ valid: false, message: 'Validation failed' })
    return false
  } finally {
    setValidatingGithub(false)
  }
}

export async function saveEditedMapping(
  mappingId: number | string,
  email: string,
  inlineEditingValue: string,
  selectedMappingPlatform: 'github' | 'slack' | 'jira' | null,
  githubValidation: { valid: boolean; message?: string } | null,
  setSavingInlineMapping: (saving: boolean) => void,
  setMappingData: React.Dispatch<React.SetStateAction<any[]>>,
  setInlineEditingId: (id: number | string | null) => void,
  setInlineEditingValue: (value: string) => void,
  setGithubValidation: (validation: { valid: boolean; message?: string } | null) => void,
  validateGithubUsername: (username: string) => Promise<boolean>
): Promise<void> {
  if (!inlineEditingValue.trim()) {
    toast.error('Please enter a valid username')
    return
  }

  const authToken = localStorage.getItem('auth_token')
  if (!authToken) {
    toast.error('Please log in to edit mappings')
    return
  }

  // Validate GitHub username first (for both manual and auto mappings)
  if (selectedMappingPlatform === 'github') {
    if (!githubValidation || githubValidation.valid !== true) {
      const isValid = await validateGithubUsername(inlineEditingValue)
      if (!isValid) {
        toast.error(`Invalid GitHub username: ${githubValidation?.message || 'User not found'}`, {
          duration: 4000
        })
        return
      }
    }
  }

  // Handle manual mappings differently (use UserMapping endpoint during migration period)
  if (typeof mappingId === 'string' && mappingId.startsWith('manual_')) {
    // Extract the numeric ID from "manual_123" format
    const numericId = parseInt(mappingId.replace('manual_', ''))

    setSavingInlineMapping(true)
    try {
      // Use the manual mappings endpoint instead
      const response = await fetch(`${API_BASE}/integrations/manual-mappings/${numericId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          target_identifier: inlineEditingValue.trim()
        })
      })

      if (response.ok) {
        const result = await response.json()
        toast.success(`Successfully updated manual mapping to '${inlineEditingValue}'`)

        // Update the local mapping data
        setMappingData(prevData =>
          prevData.map(m =>
            m.id === mappingId
              ? { ...m, target_identifier: inlineEditingValue.trim(), mapping_successful: true }
              : m
          )
        )

        // Clear editing state
        setInlineEditingId(null)
        setInlineEditingValue('')
        setGithubValidation(null)
        return
      } else {
        const errorData = await response.json()
        toast.error(errorData.detail || 'Failed to update manual mapping')
        return
      }
    } catch (error) {
      console.error('Manual mapping edit error:', error)
      toast.error('Failed to update manual mapping')
      return
    } finally {
      setSavingInlineMapping(false)
    }
  }

  setSavingInlineMapping(true)
  try {

    const response = await fetch(`${API_BASE}/integrations/mappings/${mappingId}/edit?new_target_identifier=${encodeURIComponent(inlineEditingValue.trim())}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      }
    })

    if (response.ok) {
      const result = await response.json()
      toast.success(result.message || `Successfully updated mapping to '${inlineEditingValue}'`)

      // Update the local mapping data
      setMappingData(prevData =>
        prevData.map(m =>
          m.id === mappingId
            ? {
                ...m,
                target_identifier: inlineEditingValue.trim(),
                mapping_successful: true,
                is_manual: true,  // It becomes manual after editing
                source: 'manual',
                mapping_method: 'manual_edit',
                last_updated: new Date().toISOString()
              }
            : m
        )
      )

      // Clear editing state
      setInlineEditingId(null)
      setInlineEditingValue('')
      setGithubValidation(null)
    } else {
      const errorData = await response.json()
      toast.error(errorData.message || 'Failed to update mapping')
    }
  } catch (error) {
    console.error('Error updating mapping:', error)
    toast.error('Failed to update mapping')
  } finally {
    setSavingInlineMapping(false)
  }
}

export async function saveInlineMapping(
  mappingId: number | string,
  email: string,
  inlineEditingValue: string,
  selectedMappingPlatform: 'github' | 'slack' | 'jira' | null,
  githubValidation: { valid: boolean; message?: string } | null,
  setSavingInlineMapping: (saving: boolean) => void,
  setMappingData: React.Dispatch<React.SetStateAction<any[]>>,
  setInlineEditingId: (id: number | string | null) => void,
  setInlineEditingValue: (value: string) => void,
  validateGithubUsername: (username: string) => Promise<boolean>
): Promise<void> {
  // Skip manual mappings - they can't be edited inline as they already exist
  if (typeof mappingId === 'string' && mappingId.startsWith('manual_')) {
    toast.error('Manual mappings cannot be edited inline')
    return
  }
  if (!inlineEditingValue.trim()) {
    toast.error('Please enter a GitHub username')
    return
  }

  // Validate GitHub username first
  if (selectedMappingPlatform === 'github') {
    // If we haven't validated yet or validation failed, validate now
    if (!githubValidation || githubValidation.valid !== true) {
      const isValid = await validateGithubUsername(inlineEditingValue)
      if (!isValid) {
        toast.error(`Invalid GitHub username: ${githubValidation?.message || 'User not found'}`, {
          duration: 4000
        })
        return
      }
    }
  }

  setSavingInlineMapping(true)
  try {
    const authToken = localStorage.getItem('auth_token')
    if (!authToken) {
      toast.error('Please log in to save mappings')
      return
    }

    const response = await fetch(`${API_BASE}/integrations/manual-mappings`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        source_platform: 'rootly',
        source_identifier: email,
        target_platform: selectedMappingPlatform,
        target_identifier: inlineEditingValue.trim()
      })
    })

    if (response.ok) {
      toast.success(`Manual mapping saved: ${email} → ${inlineEditingValue}`)

      // Update the local mapping data to show the change immediately
      setMappingData(prevData =>
        prevData.map(m =>
          m.id === mappingId
            ? {
                ...m,
                target_identifier: inlineEditingValue.trim(),
                mapping_successful: true,
                error_message: null,
                mapping_method: 'manual'
              }
            : m
        )
      )

      // Reset inline editing state
      setInlineEditingId(null)
      setInlineEditingValue('')

      // Note: The manual mapping is saved but won't show in IntegrationMapping
      // until the next analysis is run
      toast.info('Manual mapping saved. Run a new analysis to use this mapping.', {
        duration: 5000
      })
    } else {
      const error = await response.json()
      toast.error(`Failed to save mapping: ${error.detail || 'Unknown error'}`)
    }
  } catch (error) {
    console.error('Error saving manual mapping:', error)
    toast.error('Failed to save mapping')
  } finally {
    setSavingInlineMapping(false)
  }
}

export async function loadManualMappings(
  platform: 'github' | 'slack' | 'jira',
  setLoadingManualMappings: (loading: boolean) => void,
  setSelectedManualMappingPlatform: (platform: 'github' | 'slack' | 'jira' | null) => void,
  setManualMappings: (mappings: any[]) => void,
  setManualMappingStats: (stats: any) => void,
  setShowManualMappingDialog: (show: boolean) => void
): Promise<void> {
  try {
    setLoadingManualMappings(true)
    setSelectedManualMappingPlatform(platform)

    const authToken = localStorage.getItem('auth_token')
    if (!authToken) {
      toast.error('Please log in to view manual mappings')
      return
    }

    const [mappingsResponse, statsResponse] = await Promise.all([
      fetch(`${API_BASE}/integrations/manual-mappings?target_platform=${platform}`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        }
      }),
      fetch(`${API_BASE}/integrations/manual-mappings/statistics`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        }
      })
    ])

    if (mappingsResponse.ok && statsResponse.ok) {
      const mappingsData = await mappingsResponse.json()
      const statsData = await statsResponse.json()

      setManualMappings(mappingsData)
      setManualMappingStats(statsData)
      setShowManualMappingDialog(true)
    } else {
      toast.error('Failed to load manual mappings')
    }
  } catch (error) {
    console.error('Error loading manual mappings:', error)
    toast.error('Failed to load manual mappings')
  } finally {
    setLoadingManualMappings(false)
  }
}

export async function createManualMapping(
  newMappingForm: any,
  showManualMappingDialog: boolean,
  selectedManualMappingPlatform: 'github' | 'slack' | 'jira' | null,
  setNewMappingDialogOpen: (open: boolean) => void,
  setNewMappingForm: (form: any) => void,
  loadManualMappings: (platform: 'github' | 'slack' | 'jira') => Promise<void>
): Promise<void> {
  try {
    const authToken = localStorage.getItem('auth_token')
    if (!authToken) {
      toast.error('Please log in to create mappings')
      return
    }

    const response = await fetch(`${API_BASE}/integrations/manual-mappings`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(newMappingForm)
    })

    if (response.ok) {
      toast.success('Manual mapping created successfully')
      // Reload mappings if dialog is open
      if (showManualMappingDialog && selectedManualMappingPlatform) {
        loadManualMappings(selectedManualMappingPlatform)
      }
      setNewMappingDialogOpen(false)
      setNewMappingForm({
        source_platform: 'rootly',
        source_identifier: '',
        target_platform: selectedManualMappingPlatform || 'github',
        target_identifier: ''
      })
    } else {
      const errorData = await response.json()
      toast.error(errorData.detail || 'Failed to create mapping')
    }
  } catch (error) {
    console.error('Error creating manual mapping:', error)
    toast.error('Failed to create mapping')
  }
}

export async function updateManualMapping(
  mappingId: number,
  targetIdentifier: string,
  showManualMappingDialog: boolean,
  selectedManualMappingPlatform: 'github' | 'slack' | 'jira' | null,
  setEditingMapping: (mapping: any) => void,
  loadManualMappings: (platform: 'github' | 'slack' | 'jira') => Promise<void>
): Promise<void> {
  try {
    const authToken = localStorage.getItem('auth_token')
    if (!authToken) {
      toast.error('Please log in to update mappings')
      return
    }

    const response = await fetch(`${API_BASE}/integrations/manual-mappings/${mappingId}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ target_identifier: targetIdentifier })
    })

    if (response.ok) {
      toast.success('Manual mapping updated successfully')
      // Reload mappings
      if (showManualMappingDialog && selectedManualMappingPlatform) {
        loadManualMappings(selectedManualMappingPlatform)
      }
      setEditingMapping(null)
    } else {
      const errorData = await response.json()
      toast.error(errorData.detail || 'Failed to update mapping')
    }
  } catch (error) {
    console.error('Error updating manual mapping:', error)
    toast.error('Failed to update mapping')
  }
}

export async function deleteManualMapping(
  mappingId: number,
  showManualMappingDialog: boolean,
  selectedManualMappingPlatform: 'github' | 'slack' | 'jira' | null,
  loadManualMappings: (platform: 'github' | 'slack' | 'jira') => Promise<void>
): Promise<void> {
  try {
    const authToken = localStorage.getItem('auth_token')
    if (!authToken) {
      toast.error('Please log in to delete mappings')
      return
    }

    const response = await fetch(`${API_BASE}/integrations/manual-mappings/${mappingId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      }
    })

    if (response.ok) {
      toast.success('Manual mapping deleted successfully')
      // Reload mappings
      if (showManualMappingDialog && selectedManualMappingPlatform) {
        loadManualMappings(selectedManualMappingPlatform)
      }
    } else {
      const errorData = await response.json()
      toast.error(errorData.detail || 'Failed to delete mapping')
    }
  } catch (error) {
    console.error('Error deleting manual mapping:', error)
    toast.error('Failed to delete mapping')
  }
}
