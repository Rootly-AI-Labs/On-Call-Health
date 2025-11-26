/**
 * Utility functions for integrations page
 */

/**
 * Copy text to clipboard
 */
export async function copyToClipboard(
  text: string,
  setCopied: (copied: boolean) => void
): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  } catch (err) {
    console.error('Failed to copy: ', err)
  }
}

/**
 * Check if cache is stale (older than 5 minutes)
 */
export function isCacheStale(): boolean {
  const timestamp = localStorage.getItem('all_integrations_timestamp')
  if (!timestamp) return true

  const age = Date.now() - parseInt(timestamp)
  const FIVE_MINUTES = 5 * 60 * 1000
  return age > FIVE_MINUTES
}

/**
 * Open mapping drawer for a specific platform
 */
export function openMappingDrawer(
  platform: 'github' | 'slack' | 'jira',
  setMappingDrawerPlatform: (platform: 'github' | 'slack' | 'jira') => void,
  setMappingDrawerOpen: (open: boolean) => void
): void {
  setMappingDrawerPlatform(platform)
  setMappingDrawerOpen(true)
}

/**
 * Handle sorting for mapping data
 */
export function handleSort(
  field: 'email' | 'status' | 'data' | 'method',
  sortField: string,
  sortDirection: 'asc' | 'desc',
  setSortField: React.Dispatch<React.SetStateAction<'email' | 'status' | 'data' | 'method'>>,
  setSortDirection: React.Dispatch<React.SetStateAction<'asc' | 'desc'>>
): void {
  if (sortField === field) {
    setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
  } else {
    setSortField(field)
    setSortDirection('asc')
  }
}

/**
 * Sort mappings by specified field and direction
 */
export function sortMappings(
  mappings: any[],
  sortField: string,
  sortDirection: 'asc' | 'desc'
): any[] {
  return [...mappings].sort((a, b) => {
    let aValue: any, bValue: any

    switch (sortField) {
      case 'email':
        aValue = a.source_identifier.toLowerCase()
        bValue = b.source_identifier.toLowerCase()
        break
      case 'status':
        aValue = a.mapping_successful ? 1 : 0
        bValue = b.mapping_successful ? 1 : 0
        break
      case 'data':
        aValue = a.data_points_count || 0
        bValue = b.data_points_count || 0
        break
      case 'method':
        aValue = a.mapping_method || ''
        bValue = b.mapping_method || ''
        break
      default:
        return 0
    }

    if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1
    if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1
    return 0
  })
}

/**
 * Filter mappings to show only failed ones if requested
 */
export function filterMappings(
  mappings: any[],
  showOnlyFailed: boolean
): any[] {
  return showOnlyFailed
    ? mappings.filter(m => !m.mapping_successful)
    : mappings
}
