import { toast } from "sonner"
import { type Integration, API_BASE } from "../types"

/**
 * Test connection to Rootly or PagerDuty with API token
 */
export async function testConnection(
  platform: "rootly" | "pagerduty",
  token: string,
  setIsTestingConnection: (loading: boolean) => void,
  setConnectionStatus: React.Dispatch<React.SetStateAction<"error" | "success" | "idle" | "duplicate">>,
  setPreviewData: (data: any) => void,
  setDuplicateInfo: (info: any) => void
): Promise<void> {
  setIsTestingConnection(true)
  setConnectionStatus('idle')
  setPreviewData(null)

  try {
    const authToken = localStorage.getItem('auth_token')
    if (!authToken) {
      throw new Error('No authentication token found')
    }

    const endpoint = platform === 'rootly'
      ? `${API_BASE}/rootly/token/test`
      : `${API_BASE}/pagerduty/token/test`


    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        token: token
      })
    })

    const data = await response.json()


    // Check for duplicate token first
    if (response.ok && data.status === 'duplicate_token') {
      setConnectionStatus('duplicate')
      setDuplicateInfo(data)
    } else if (response.ok && (data.valid || data.status === 'success')) {
      setConnectionStatus('success')
      if (platform === 'rootly') {
        setPreviewData({
          organization_name: data.preview?.organization_name || data.account_info?.organization_name,
          total_users: data.preview?.total_users || data.account_info?.total_users,
          suggested_name: data.preview?.suggested_name || data.account_info?.suggested_name,
          can_add: data.preview?.can_add || data.account_info?.can_add,
          permissions: data.account_info?.permissions
        })
      } else {
        setPreviewData(data.account_info)
      }
    } else if (response.status === 409) {
      setConnectionStatus('duplicate')
      setDuplicateInfo(data.detail)
    } else {
      setConnectionStatus('error')
    }
  } catch (error) {
    console.error('Connection test error:', error)
    setConnectionStatus('error')
  } finally {
    setIsTestingConnection(false)
  }
}

/**
 * Load Rootly integrations with caching
 */
export async function loadRootlyIntegrations(
  forceRefresh: boolean,
  setIntegrations: React.Dispatch<React.SetStateAction<Integration[]>>,
  setLoadingRootly: (loading: boolean) => void
): Promise<void> {
  // Check cache first
  if (!forceRefresh) {
    const cachedIntegrations = localStorage.getItem('all_integrations')
    if (cachedIntegrations) {
      try {
        const parsed = JSON.parse(cachedIntegrations)
        const rootlyIntegrations = parsed.filter((i: Integration) => i.platform === 'rootly')
        setIntegrations(prev => [
          ...prev.filter(i => i.platform !== 'rootly'),
          ...rootlyIntegrations
        ])
        setLoadingRootly(false)
        return
      } catch (e) {
        // Cache parse failed, continue to API call
      }
    }
  }

  try {
    const authToken = localStorage.getItem('auth_token')
    if (!authToken) return

    const response = await fetch(`${API_BASE}/rootly/integrations`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    })

    const data = response.ok ? await response.json() : { integrations: [] }
    const rootlyIntegrations = data.integrations.map((i: Integration) => ({ ...i, platform: 'rootly' }))

    setIntegrations(prev => {
      const updatedIntegrations = [
        ...prev.filter(i => i.platform !== 'rootly'),
        ...rootlyIntegrations
      ]

      // Update cache with fresh data when force refreshing
      if (forceRefresh) {
        localStorage.setItem('all_integrations', JSON.stringify(updatedIntegrations))
        localStorage.setItem('all_integrations_timestamp', Date.now().toString())
      }

      return updatedIntegrations
    })
  } catch (error) {
    console.error('Error loading Rootly integrations:', error)
  } finally {
    setLoadingRootly(false)
  }
}

/**
 * Load PagerDuty integrations with caching
 */
export async function loadPagerDutyIntegrations(
  forceRefresh: boolean,
  setIntegrations: React.Dispatch<React.SetStateAction<Integration[]>>,
  setLoadingPagerDuty: (loading: boolean) => void
): Promise<void> {
  // Check cache first
  if (!forceRefresh) {
    const cachedIntegrations = localStorage.getItem('all_integrations')
    if (cachedIntegrations) {
      try {
        const parsed = JSON.parse(cachedIntegrations)
        const pagerdutyIntegrations = parsed.filter((i: Integration) => i.platform === 'pagerduty')
        setIntegrations(prev => [
          ...prev.filter(i => i.platform !== 'pagerduty'),
          ...pagerdutyIntegrations
        ])
        setLoadingPagerDuty(false)
        return
      } catch (e) {
        // Cache parse failed, continue to API call
      }
    }
  }

  try {
    const authToken = localStorage.getItem('auth_token')
    if (!authToken) return

    const response = await fetch(`${API_BASE}/pagerduty/integrations`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    })

    const data = response.ok ? await response.json() : { integrations: [] }
    const pagerdutyIntegrations = data.integrations || []

    setIntegrations(prev => {
      const updatedIntegrations = [
        ...prev.filter(i => i.platform !== 'pagerduty'),
        ...pagerdutyIntegrations
      ]

      // Update cache with fresh data when force refreshing
      if (forceRefresh) {
        localStorage.setItem('all_integrations', JSON.stringify(updatedIntegrations))
        localStorage.setItem('all_integrations_timestamp', Date.now().toString())
      }

      return updatedIntegrations
    })
  } catch (error) {
    console.error('Error loading PagerDuty integrations:', error)
  } finally {
    setLoadingPagerDuty(false)
  }
}

/**
 * Add new integration (Rootly or PagerDuty)
 */
export async function addIntegration(
  platform: "rootly" | "pagerduty",
  previewData: any,
  form: any,
  integrations: Integration[],
  setIsAddingRootly: (loading: boolean) => void,
  setIsAddingPagerDuty: (loading: boolean) => void,
  setConnectionStatus: React.Dispatch<React.SetStateAction<"error" | "success" | "idle" | "duplicate">>,
  setPreviewData: (data: any) => void,
  setAddingPlatform: React.Dispatch<React.SetStateAction<"rootly" | "pagerduty" | null>>,
  setReloadingIntegrations: (loading: boolean) => void,
  loadRootlyIntegrations: (forceRefresh: boolean) => Promise<void>,
  loadPagerDutyIntegrations: (forceRefresh: boolean) => Promise<void>
): Promise<void> {
  if (!previewData) return

  // Set service-specific loading state
  if (platform === 'rootly') {
    setIsAddingRootly(true)
  } else {
    setIsAddingPagerDuty(true)
  }

  try {
    const authToken = localStorage.getItem('auth_token')
    if (!authToken) {
      throw new Error('No authentication token found')
    }

    const values = form.getValues()
    const token = platform === 'rootly' ? (values as any).rootlyToken : (values as any).pagerdutyToken
    const nickname = values.nickname

    const endpoint = platform === 'rootly'
      ? `${API_BASE}/rootly/token/add`
      : `${API_BASE}/pagerduty/integrations`

    const body = platform === 'rootly'
      ? {
          token: token,
          name: nickname || previewData.suggested_name || previewData.organization_name,
        }
      : {
          token: token,
          name: nickname || previewData.organization_name,
          platform: 'pagerduty'
        }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify(body)
    })

    const responseData = await response.json()

    if (response.ok) {
      toast.success(`Your ${platform === 'rootly' ? 'Rootly' : 'PagerDuty'} account has been connected successfully.`)

      // Show loading toast for the reload process
      const loadingToastId = toast.loading(`Adding ${platform === 'rootly' ? 'Rootly' : 'PagerDuty'} integration to your dashboard...`, {
        duration: 0 // Persistent until dismissed
      })

      // Clear local storage cache
      localStorage.removeItem(`${platform}_integrations`)
      localStorage.removeItem(`${platform}_integrations_timestamp`)
      localStorage.removeItem('all_integrations')
      localStorage.removeItem('all_integrations_timestamp')

      // If this is the first integration, set it as selected for dashboard
      try {
        const newIntegrationId = responseData.integration?.id || responseData.id
        if (newIntegrationId && integrations.length === 0) {
          localStorage.setItem('selected_organization', newIntegrationId.toString())
        }
      } catch (error) {
        console.error('Error setting default integration:', error)
        // Continue without setting default - not critical
      }

      // Reset form and state
      form.reset()
      setConnectionStatus('idle')
      setPreviewData(null)
      setAddingPlatform(null)

      // Reload integrations to show the newly added one
      setReloadingIntegrations(true)
      try {
        // Add delay to ensure backend has processed the new integration
        await new Promise(resolve => setTimeout(resolve, 500))

        if (platform === 'rootly') {
          await loadRootlyIntegrations(true)
        } else {
          await loadPagerDutyIntegrations(true)
        }

        // Dismiss loading toast and show success
        toast.dismiss(loadingToastId)
        toast.success(`${platform === 'rootly' ? 'Rootly' : 'PagerDuty'} integration added to dashboard!`)
      } catch (reloadError) {
        console.error('Error reloading integrations:', reloadError)
        toast.dismiss(loadingToastId)
        toast.error('Integration added but failed to refresh list. Please refresh the page.')
      } finally {
        setReloadingIntegrations(false)
      }
    } else {
      throw new Error(responseData.detail?.message || responseData.message || 'Failed to add integration')
    }
  } catch (error) {
    console.error('Add integration error:', error)
    toast.error(error instanceof Error ? error.message : "An unexpected error occurred.")
  } finally {
    // Reset service-specific loading state
    if (platform === 'rootly') {
      setIsAddingRootly(false)
    } else {
      setIsAddingPagerDuty(false)
    }
  }
}

/**
 * Delete integration
 */
export async function deleteIntegration(
  integrationToDelete: Integration,
  integrations: Integration[],
  setIsDeleting: (loading: boolean) => void,
  setIntegrations: React.Dispatch<React.SetStateAction<Integration[]>>,
  setDeleteDialogOpen: (open: boolean) => void,
  setIntegrationToDelete: (integration: Integration | null) => void,
  syncedUsersCache?: Map<string, any[]>,
  recipientsCache?: Map<string, Set<number>>
): Promise<void> {
  setIsDeleting(true)
  try {
    const authToken = localStorage.getItem('auth_token')
    if (!authToken) return

    // Check if this is a legacy beta integration (stored only in localStorage)
    const isBetaIntegration = ['beta-rootly', 'beta-pagerduty'].includes(String(integrationToDelete.id))

    let success = false

    if (isBetaIntegration) {
      // Beta integrations don't exist in the backend, just remove from localStorage
      success = true
    } else {
      // Regular integration - make API call
      const endpoint = integrationToDelete.platform === 'rootly'
        ? `${API_BASE}/rootly/integrations/${integrationToDelete.id}`
        : `${API_BASE}/pagerduty/integrations/${integrationToDelete.id}`

      const response = await fetch(endpoint, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      })

      success = response.ok
    }

    if (success) {
      toast.success("The integration has been removed.")

      // Optimized: Update local state directly instead of full reload
      const updatedIntegrations = integrations.filter(i => i.id !== integrationToDelete.id)
      setIntegrations(updatedIntegrations)

      // Update cache with filtered results
      localStorage.setItem('all_integrations', JSON.stringify(updatedIntegrations))
      localStorage.setItem('all_integrations_timestamp', Date.now().toString())

      // Clear platform-specific cache
      localStorage.removeItem(`${integrationToDelete.platform}_integrations`)
      localStorage.removeItem(`${integrationToDelete.platform}_integrations_timestamp`)

      // Clear synced users and recipients cache for this integration
      const integrationIdStr = integrationToDelete.id.toString()
      if (syncedUsersCache?.has(integrationIdStr)) {
        syncedUsersCache.delete(integrationIdStr)
      }
      if (recipientsCache?.has(integrationIdStr)) {
        recipientsCache.delete(integrationIdStr)
      }

      // If we deleted the currently selected integration, clear the selection
      const selectedOrg = localStorage.getItem('selected_organization')
      if (selectedOrg === integrationIdStr) {
        localStorage.removeItem('selected_organization')
      }

      setDeleteDialogOpen(false)
      setIntegrationToDelete(null)
    } else {
      throw new Error('Failed to delete integration')
    }
  } catch (error) {
    console.error('Delete error:', error)
    toast.error("An error occurred while deleting the integration.")
  } finally {
    setIsDeleting(false)
  }
}

/**
 * Update integration name
 */
export async function updateIntegrationName(
  integration: Integration,
  newName: string,
  setSavingIntegrationId: (id: number | null) => void,
  setIntegrations: React.Dispatch<React.SetStateAction<Integration[]>>,
  setEditingIntegration: (id: number | null) => void
): Promise<void> {
  setSavingIntegrationId(integration.id)
  try {
    const authToken = localStorage.getItem('auth_token')
    if (!authToken) return

    const endpoint = integration.platform === 'rootly'
      ? `${API_BASE}/rootly/integrations/${integration.id}`
      : `${API_BASE}/pagerduty/integrations/${integration.id}`

    const response = await fetch(endpoint, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name: newName })
    })

    if (response.ok) {
      toast.success("Integration name updated successfully")

      // Update local state
      setIntegrations(prev => prev.map(i =>
        i.id === integration.id ? { ...i, name: newName } : i
      ))

      // Update cache
      const cachedIntegrations = localStorage.getItem('all_integrations')
      if (cachedIntegrations) {
        try {
          const parsed = JSON.parse(cachedIntegrations)
          const updated = parsed.map((i: Integration) =>
            i.id === integration.id ? { ...i, name: newName } : i
          )
          localStorage.setItem('all_integrations', JSON.stringify(updated))
        } catch (e) {
          // If cache update fails, just clear it
          localStorage.removeItem('all_integrations')
        }
      }

      setEditingIntegration(null)
    } else {
      throw new Error('Failed to update integration name')
    }
  } catch (error) {
    console.error('Update error:', error)
    toast.error("Failed to update integration name")
  } finally {
    setSavingIntegrationId(null)
  }
}
