"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { toast } from "sonner"

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'


import type {
  Integration,
  GitHubIntegration,
  SlackIntegration,
  OrganizationMember,
  AnalysisResult,
  AnalysisStage,
} from "@/lib/types";


export default function useDashboard() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [integrations, setIntegrations] = useState<Integration[]>([])
  const [selectedIntegration, setSelectedIntegration] = useState<string>("")
  const [loadingIntegrations, setLoadingIntegrations] = useState(false)
  const [dropdownLoading, setDropdownLoading] = useState(false)
  const [analysisRunning, setAnalysisRunning] = useState(false)
  const [analysisStage, setAnalysisStage] = useState<AnalysisStage>("loading")
  const [analysisProgress, setAnalysisProgress] = useState(0)
  const [currentRunningAnalysisId, setCurrentRunningAnalysisId] = useState<number | null>(null)
  const [currentStageIndex, setCurrentStageIndex] = useState(0)
  const [targetProgress, setTargetProgress] = useState(0)
  const [currentAnalysis, setCurrentAnalysis] = useState<AnalysisResult | null>(null)
  const [previousAnalyses, setPreviousAnalyses] = useState<AnalysisResult[]>([])
  const [hasMoreAnalyses, setHasMoreAnalyses] = useState(true)
  const [loadingMoreAnalyses, setLoadingMoreAnalyses] = useState(false)
  const [totalAnalysesCount, setTotalAnalysesCount] = useState(0)
  const [selectedMember, setSelectedMember] = useState<OrganizationMember | null>(null)
  const [timeRange, setTimeRange] = useState("30")
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [analysisToDelete, setAnalysisToDelete] = useState<AnalysisResult | null>(null)
  const [deletingAnalysis, setDeletingAnalysis] = useState(false)
  const [debugSectionOpen, setDebugSectionOpen] = useState(false)
  // Removed member view mode - only showing radar chart now
  const [historicalTrends, setHistoricalTrends] = useState<any>(null)
  const [loadingTrends, setLoadingTrends] = useState(false)
  const [initialDataLoaded, setInitialDataLoaded] = useState(false)
  const [loadingAnalyses, setLoadingAnalyses] = useState(false)  // Start false to prevent hydration mismatch
  const [analysisMappings, setAnalysisMappings] = useState<any>(null)
  const [hasDataFromCache, setHasDataFromCache] = useState(false)

  // Cache for full analysis data to prevent repeated API calls
  const [analysisCache, setAnalysisCache] = useState<Map<string, AnalysisResult>>(new Map())
  // Cache for trends and GitHub timeline data
  const [trendsCache, setTrendsCache] = useState<Map<string, any>>(new Map())
  const [githubTimelineCache, setGithubTimelineCache] = useState<Map<string, any>>(new Map())

  // Debug function to inspect cache (accessible in browser console)
  useEffect(() => {
    (window as any).debugAnalysisCache = () => {
      return { analysisCache, trendsCache, githubTimelineCache }
    }
  }, [analysisCache, trendsCache, githubTimelineCache])

  // Mapping drawer states
  const [mappingDrawerOpen, setMappingDrawerOpen] = useState(false)
  const [mappingDrawerPlatform, setMappingDrawerPlatform] = useState<'github' | 'slack'>('github')
  
  // Data source expansion states
  const [expandedDataSources, setExpandedDataSources] = useState<{
    incident: boolean
    github: boolean
    slack: boolean
  }>({
    incident: false,
    github: false,
    slack: false
  })
  // Initialize redirectingToSuggested to true if there's an analysis ID in URL
  const [redirectingToSuggested, setRedirectingToSuggested] = useState(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search)
      return urlParams.get('analysis') !== null
    }
    return false
  })
  
  const router = useRouter()
  const searchParams = useSearchParams()

  // Flag to prevent duplicate auth error toasts/redirects
  const [hasShownAuthError, setHasShownAuthError] = useState(false)

  // Centralized auth check helper
  const checkAuthToken = useCallback((): string | null => {
    const authToken = localStorage.getItem('auth_token')
    if (!authToken && !hasShownAuthError) {
      setHasShownAuthError(true)
      toast.error("No authentication token found - please log in")
      router.push('/auth/login')
    }
    return authToken
  }, [hasShownAuthError, router])

  // Backend health monitoring - temporarily disabled



  // Function to update URL with analysis ID (UUID)
  const updateURLWithAnalysis = (analysisId: string | null) => {
    const params = new URLSearchParams(searchParams.toString())
    
    if (analysisId) {
      params.set('analysis', analysisId)
    } else {
      params.delete('analysis')
    }
    
    // Update URL without page reload
    router.push(`/dashboard?${params.toString()}`, { scroll: false })
  }


  const cancelRunningAnalysis = async () => {
    try {
      // If there's a running analysis, delete it
      if (currentRunningAnalysisId) {
        const authToken = localStorage.getItem('auth_token')
        if (authToken) {
          const response = await fetch(`${API_BASE}/analyses/${currentRunningAnalysisId}`, {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${authToken}`
            }
          })

          if (response.ok) {
            toast.success("Analysis canceled successfully")
          } else {
            toast.error("Failed to cancel analysis")
          }
        }
      }
    } catch (error) {
      console.error('Error canceling analysis:', error)
      toast.error("Error canceling analysis")
    } finally {
      // Reset all analysis state
      setAnalysisRunning(false)
      setCurrentRunningAnalysisId(null)
      setCurrentRunningAnalysisId(null)
      setAnalysisProgress(0)
      setAnalysisStage("loading")
      setCurrentStageIndex(0)
      setTargetProgress(0)

      // Refresh the analysis list to remove the deleted analysis
      await loadPreviousAnalyses()
    }
  }

  // Helper function to determine if insufficient data card should be shown
  const shouldShowInsufficientDataCard = () => {
    if (!currentAnalysis || analysisRunning) return false
    
    // Show for failed analyses
    if (currentAnalysis.status === 'failed') return true
    
    // Show for completed analyses with no meaningful data
    if (currentAnalysis.status === 'completed') {
      // Check if analysis_data is completely missing
      if (!currentAnalysis.analysis_data) {
        return true
      }
      
      // Check if we have team_health or team_summary data but with no meaningful content
      if (currentAnalysis.analysis_data?.team_health || currentAnalysis.analysis_data?.team_summary) {
        // Check if the analysis has 0 members - this indicates insufficient data
        const teamAnalysis = currentAnalysis.analysis_data.team_analysis
        
        // Handle both array format (team_analysis directly) and object format (team_analysis.members)
        const members = Array.isArray(teamAnalysis) ? teamAnalysis : teamAnalysis?.members
        const hasNoMembers = !members || members.length === 0
        
        if (hasNoMembers) {
          return true // Show insufficient data card
        }
        
        return false // Has meaningful data - even if 0 incidents, show normal dashboard
      }
      
      // If we have partial data with incidents/users, show the partial data UI
      if (currentAnalysis.analysis_data?.partial_data) {
        return false
      }
      
      // If we have team_analysis with members, we have data
      const teamAnalysis = currentAnalysis.analysis_data?.team_analysis
      const members = Array.isArray(teamAnalysis) ? teamAnalysis : teamAnalysis?.members
      if (members && members.length > 0) {
        return false
      }
      
      // Otherwise, insufficient data
      return true
    }
    
    return false
  }

  useEffect(() => {
    // Check for organization parameter from URL
    const urlParams = new URLSearchParams(window.location.search)
    const orgId = urlParams.get('org')
    const analysisId = urlParams.get('analysis')
    
    // Add event listener for page focus to refresh integrations (less aggressive)
    const handlePageFocus = () => {
      // Only refresh if we haven't refreshed in the last 30 seconds
      const lastRefresh = localStorage.getItem('last_integrations_refresh')
      const now = Date.now()
      if (!lastRefresh || now - parseInt(lastRefresh) > 30000) {
        localStorage.setItem('last_integrations_refresh', now.toString())
        loadIntegrations(true, false)
      }

      // Also sync selected organization from localStorage when page gains focus
      const savedOrg = localStorage.getItem('selected_organization')
      if (savedOrg && savedOrg !== selectedIntegration) {
        setSelectedIntegration(savedOrg)
      }
    }

    // Load cached integrations FIRST (before event listeners)
    const cachedIntegrations = localStorage.getItem('all_integrations')
    const cacheTimestamp = localStorage.getItem('all_integrations_timestamp')
    
    if (cachedIntegrations && cacheTimestamp) {
      // Check if cache is less than 5 minutes old for more frequent updates
      const cacheAge = Date.now() - parseInt(cacheTimestamp)
      const fiveMinutes = 5 * 60 * 1000
      
      if (cacheAge < fiveMinutes) {
        try {
          const parsed = JSON.parse(cachedIntegrations)
          setIntegrations(parsed)
          
          // Also load GitHub and Slack from cache if available
          const cachedGithub = localStorage.getItem('github_integration')
          const cachedSlack = localStorage.getItem('slack_integration')
          
          if (cachedGithub) {
            const githubData = JSON.parse(cachedGithub)
            if (githubData.connected && githubData.integration) {
              setGithubIntegration(githubData.integration)
            } else {
              setGithubIntegration(null)
            }
          }
          
          if (cachedSlack) {
            const slackData = JSON.parse(cachedSlack)
            if (slackData.connected && slackData.integration) {
              setSlackIntegration(slackData.integration)
            } else {
              setSlackIntegration(null)
            }
          }
          
          // Set integration based on URL parameter, saved preference, or first available
          if (orgId) {
            setSelectedIntegration(orgId)
            // Save this selection for future use
            localStorage.setItem('selected_organization', orgId)
          } else {
            // Check for saved organization preference
            const savedOrg = localStorage.getItem('selected_organization')
            if (savedOrg && parsed.find((i: Integration) => i.id.toString() === savedOrg)) {
              setSelectedIntegration(savedOrg)
            } else if (parsed.length > 0) {
              // Fall back to first available organization
              setSelectedIntegration(parsed[0].id.toString())
              localStorage.setItem('selected_organization', parsed[0].id.toString())
            }
          }
        } catch (e) {
          }
        
        // Set loading to false when using cache
        setLoadingIntegrations(false)
        setHasDataFromCache(true)
        setInitialDataLoaded(true) // Mark as loaded since we have cached data

        // Don't return yet - we still need to set up event listeners and load analyses
      }
    }

    // Add event listeners for page focus/visibility changes
    window.addEventListener('focus', handlePageFocus)
    const visibilityHandler = () => {
      if (!document.hidden) {
        handlePageFocus()
      }
    }
    document.addEventListener('visibilitychange', visibilityHandler)

    let isMounted = true

    const loadInitialData = async () => {
      try {
        // Load data with individual error handling to prevent blocking
        const results = await Promise.allSettled([
          loadPreviousAnalyses(),
          loadIntegrations(false, false) // Don't force refresh, don't show global loading
        ])

        // Log any failures but don't block the UI
        results.forEach((result, index) => {
          const functionNames = ['loadPreviousAnalyses', 'loadIntegrations']
          if (result.status === 'rejected') {
            }
        })

        // Mark as loaded - the data is ready even if currentAnalysis isn't set yet
        // The UI will update when currentAnalysis is set in the next render
        if (isMounted) {
          setInitialDataLoaded(true)
        }
      } catch (error) {
        // Always set to true to prevent endless loading, even if some data fails
        if (isMounted) {
          setInitialDataLoaded(true)
        }
      }
    }

    loadInitialData()
    
    // Fallback timeout to prevent endless loading (max 15 seconds)
    const timeoutId = setTimeout(() => {
      if (isMounted) {
        setInitialDataLoaded(true)
      }
    }, 15000)

    // Listen for localStorage changes (when integrations are updated on other pages)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'all_integrations' && e.newValue) {
        try {
          const updatedIntegrations = JSON.parse(e.newValue)
          setIntegrations(updatedIntegrations)

          // Also check for GitHub/Slack updates
          const githubCache = localStorage.getItem('github_integration')
          const slackCache = localStorage.getItem('slack_integration')

          if (githubCache) {
            const githubData = JSON.parse(githubCache)
            setGithubIntegration(githubData.connected ? githubData.integration : null)
          }

          if (slackCache) {
            const slackData = JSON.parse(slackCache)
            setSlackIntegration(slackData.integration)
          }
        } catch (e) {
        }
      }

      // Listen for changes to selected organization
      if (e.key === 'selected_organization' && e.newValue) {
        setSelectedIntegration(e.newValue)
      }
    }
    
    window.addEventListener('storage', handleStorageChange)

    // Cleanup event listeners and timeout
    return () => {
      isMounted = false
      window.removeEventListener('focus', handlePageFocus)
      document.removeEventListener('visibilitychange', visibilityHandler)
      window.removeEventListener('storage', handleStorageChange)
      clearTimeout(timeoutId)
    }
  }, [])

  // Check if URL analysis exists in loaded analyses and show loader if not
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search)
    const analysisId = urlParams.get('analysis')
    
    if (analysisId && previousAnalyses.length > 0 && !redirectingToSuggested) {
      // Check if this analysis ID exists in our current analyses list
      const analysisExists = previousAnalyses.some(analysis => 
        analysis.id.toString() === analysisId || 
        (analysis.uuid && analysis.uuid === analysisId)
      )
      
      // If this ID doesn't exist, show loader immediately
      if (!analysisExists) {
        setRedirectingToSuggested(true)
      }
    }
  }, [previousAnalyses, redirectingToSuggested])

  // Load specific analysis from URL - with delay to ensure auth token is available
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search)
    const analysisId = urlParams.get('analysis')

    if (analysisId) {
      let retryCount = 0
      const maxRetries = 10 // Max 5 seconds of retries
      let timeoutId: NodeJS.Timeout | null = null

      // Small delay to ensure auth token and integrations are loaded
      const loadAnalysisWithDelay = () => {
        const authToken = localStorage.getItem('auth_token')
        if (authToken) {
          loadSpecificAnalysis(analysisId)
        } else if (retryCount < maxRetries) {
          retryCount++
          // Retry after another short delay
          timeoutId = setTimeout(loadAnalysisWithDelay, 500)
        } else {
          // Max retries exceeded - redirect to login
          toast.error("Authentication required - please log in")
          router.push('/auth/login')
        }
      }

      // Initial delay to let other useEffects run first
      timeoutId = setTimeout(loadAnalysisWithDelay, 100)

      // Cleanup timeout on unmount
      return () => {
        if (timeoutId) {
          clearTimeout(timeoutId)
        }
      }
    }
  }, []) // Only run once on mount

  // Smooth progress animation effect
  useEffect(() => {
    if (!analysisRunning) return

    const interval = setInterval(() => {
      setAnalysisProgress(currentProgress => {
        if (currentProgress < targetProgress) {
          // Increment by 1 towards target, with small random variations
          const increment = Math.random() > 0.7 ? 2 : 1 // Occasionally jump by 2
          return Math.min(currentProgress + increment, targetProgress)
        }
        return currentProgress
      })
    }, 200) // Update every 200ms for smooth animation

    return () => clearInterval(interval)
  }, [analysisRunning, targetProgress])

  // Only load historical trends when we have a valid current analysis
  useEffect(() => {
    if (currentAnalysis && currentAnalysis.status === 'completed') {
      loadHistoricalTrends()
    } else {
      // Clear trends data when no valid analysis
      setHistoricalTrends(null)
      setLoadingTrends(false)
    }
  }, [currentAnalysis])

  // Sync selectedIntegration with localStorage when integrations change
  // This ensures the dashboard uses the correct organization after user changes it on integrations page
  useEffect(() => {
    if (integrations.length > 0) {
      const savedOrg = localStorage.getItem('selected_organization')

      // Only update if saved org exists in integrations and is different from current selection
      if (savedOrg && integrations.find(i => i.id.toString() === savedOrg) && savedOrg !== selectedIntegration) {
        setSelectedIntegration(savedOrg)
      }
    }
  }, [integrations, selectedIntegration])

  const loadPreviousAnalyses = async (append = false, silent = false): Promise<boolean> => {
    // CRITICAL: Set loading state FIRST before any async operations
    if (append) {
      setLoadingMoreAnalyses(true)
    } else {
      setLoadingAnalyses(true)
    }

    try {
      const authToken = checkAuthToken()
      if (!authToken) {
        setLoadingAnalyses(false)
        return false
      }

      let response
      try {
        const limit = 3
        const offset = append ? previousAnalyses.length : 0

        // Add timeout to prevent indefinite waiting
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 10000) // 10 second timeout

        try {
          response = await fetch(`${API_BASE}/analyses?limit=${limit}&offset=${offset}`, {
            headers: {
              'Authorization': `Bearer ${authToken}`
            },
            signal: controller.signal
          })
        } finally {
          clearTimeout(timeoutId)
        }
      } catch (networkError) {
        console.error('Network error during fetch', networkError)

        if (networkError.name === 'AbortError') {
          throw new Error('Request timed out - server may be slow')
        } else {
          throw new Error('Cannot connect to backend server')
        }
      }

      if (!response) {
        throw new Error('No response received from server')
      }

      if (response.ok) {
        const data = await response.json()
        const newAnalyses = data.analyses || []

        if (append) {
          setPreviousAnalyses(prev => {
            // Deduplicate analyses by ID to prevent duplicate keys
            const existingIds = new Set(prev.map(a => a.id))
            const uniqueNewAnalyses = newAnalyses.filter((analysis: any) => !existingIds.has(analysis.id))
            return [...prev, ...uniqueNewAnalyses]
          })
        } else {
          setPreviousAnalyses(newAnalyses)
        }

        setTotalAnalysesCount(data.total || newAnalyses.length)
        setHasMoreAnalyses(newAnalyses.length === 3 && (!data.total || previousAnalyses.length + newAnalyses.length < data.total))

        // If no specific analysis is loaded and we have analyses, load the most recent one (only for initial load)
        if (!append) {
          const urlParams = new URLSearchParams(window.location.search)
          const analysisId = urlParams.get('analysis')

          if (!analysisId && data.analyses && data.analyses.length > 0 && !currentAnalysis) {
            const mostRecentAnalysis = data.analyses[0] // Analyses should be ordered by created_at desc
            setCurrentAnalysis(mostRecentAnalysis)
            // Platform mappings will be fetched by the dedicated useEffect
          }
        }

        setLoadingAnalyses(false)
        return newAnalyses.length > 0
      } else {
        // Handle API errors (401, 404, 500, etc.)
        let errorText = 'Unknown error'
        try {
          errorText = await response.text()
        } catch (parseError) {
          console.error('Could not parse error response:', parseError)
        }

        console.error(`API error ${response.status}:`, errorText)

        if (response.status === 401) {
          toast.error("Authentication failed - please log in again")
        } else if (response.status >= 500) {
          toast.error("Server error - please try again later")
        } else {
          toast.error("Failed to load analyses")
        }
        setLoadingAnalyses(false)
        return false
      }
    } catch (error) {
      // Check if this is a network connectivity issue (expected during Railway startup)
      const isNetworkError = error instanceof Error && (
        error.message.includes('fetch') ||
        error.message.includes('network') ||
        error.message.includes('Failed to fetch') ||
        error.message.includes('TypeError') ||
        error.name === 'TypeError'
      )

      // Only log non-network errors
      if (!isNetworkError) {
        console.error('Unexpected error in loadPreviousAnalyses:', error)
      }

      if (!silent) {
        if (isNetworkError) {
          toast.error("Cannot connect to backend")
        } else {
          toast.error("Error loading analyses")
        }
      }
      return false
    } finally {
      // CRITICAL: ALWAYS reset loading state in finally block
      if (append) {
        setLoadingMoreAnalyses(false)
      } else {
        setLoadingAnalyses(false)
      }
    }
  }

  const loadSpecificAnalysis = async (analysisId: string) => {
    try {
      const authToken = checkAuthToken()
      if (!authToken) {
        return
      }

      // Check cache first
      const cachedAnalysis = analysisCache.get(analysisId)
      if (cachedAnalysis && cachedAnalysis.analysis_data && cachedAnalysis.analysis_data.team_analysis) {
        setCurrentAnalysis(cachedAnalysis)
        setRedirectingToSuggested(false)
        return
      }
      // Check if analysisId is a UUID (contains hyphens) or integer ID
      const isUuid = analysisId.includes('-')

      // Use the unified endpoint that handles both UUIDs and integer IDs
      const endpoint = `${API_BASE}/analyses/by-id/${analysisId}`
      
      const response = await fetch(endpoint, {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      })

      if (response.ok) {
        const analysis = await response.json()
        // Cache the analysis data
        const cacheKey = analysis.uuid || analysis.id.toString()
        setAnalysisCache(prev => new Map(prev.set(cacheKey, analysis)))
        setCurrentAnalysis(analysis)
        // Platform mappings will be fetched by the dedicated useEffect
        // Turn off redirect loader since we successfully loaded the analysis
        setRedirectingToSuggested(false)
        // Update URL to use UUID if we loaded by integer ID
        if (!isUuid && analysis.uuid) {
          updateURLWithAnalysis(analysis.uuid || analysis.id)
        }
      } else {
        
        // Show user-friendly error message and handle suggested redirect
        if (response.status === 404) {
          try {
            const errorData = await response.json()
            
            // Check if backend provided a suggested analysis ID
            const suggestionMatch = errorData.detail?.match(/Most recent analysis available: (.+)$/)
            if (suggestionMatch && suggestionMatch[1]) {
              const suggestedId = suggestionMatch[1]
              
              // Set redirect state to show loader instead of error (don't clear analysis yet)
              setRedirectingToSuggested(true)
              
              // Auto-redirect to suggested analysis after a brief delay
              setTimeout(() => {
                updateURLWithAnalysis(suggestedId)
                loadSpecificAnalysis(suggestedId)
                setRedirectingToSuggested(false)
              }, 1000) // Reduced to 1 second since we're showing a loader
              
              return // Exit early to prevent clearing analysis state
            }
          } catch (parseError) {
          }
        }
        
        // Only clear analysis state if we couldn't auto-redirect
        setCurrentAnalysis(null)
        setHistoricalTrends(null)
        // Remove invalid analysis ID from URL
        updateURLWithAnalysis(null)
      }
    } catch (error) {
    }
  }

  const loadHistoricalTrends = async () => {
    try {
      const cacheKey = 'historical-trends-30days' // Cache key for 30-day trends

      // Check cache first
      const cachedTrends = trendsCache.get(cacheKey)
      if (cachedTrends) {
        setHistoricalTrends(cachedTrends)
        setLoadingTrends(false)
        return
      }

      const authToken = checkAuthToken()
      if (!authToken) {
        setLoadingTrends(false)
        return
      }

      setLoadingTrends(true)
      
      // Use 30 days to get more historical data points for all integrations
      const params = new URLSearchParams({ days_back: '30' })
      // No integration filtering - show data from all integrations

      const fullUrl = `${API_BASE}/analyses/trends/historical?${params}`
      
      // Test the main analyses endpoint with same auth token to verify auth works
      try {
        const testResponse = await fetch(`${API_BASE}/analyses`, {
          headers: {
            'Authorization': `Bearer ${authToken}`
          }
        })
      } catch (testError) {
      }
      
      let response
      try {
        response = await fetch(fullUrl, {
          headers: {
            'Authorization': `Bearer ${authToken}`
          }
        })
      } catch (networkError) {
        throw new Error('Cannot connect to backend server')
      }

      if (response.ok) {
        const data = await response.json()

        // Cache the data
        setTrendsCache(prev => new Map(prev.set(cacheKey, data)))
        setHistoricalTrends(data)
      } else {
        const errorText = await response.text()
      }
    } catch (error) {
      console.error('Unexpected error loading trends:', error)
    } finally {
      setLoadingTrends(false)
    }
  }

  const openDeleteDialog = (analysis: AnalysisResult, event: React.MouseEvent) => {
    event.stopPropagation() // Prevent triggering the analysis selection
    setAnalysisToDelete(analysis)
    setDeleteDialogOpen(true)
  }

  const confirmDeleteAnalysis = async () => {
    if (!analysisToDelete) return

    setDeletingAnalysis(true)
    try {
      const authToken = checkAuthToken()
      if (!authToken) {
        return
      }

      
      const response = await fetch(`${API_BASE}/analyses/${analysisToDelete.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      })

      // Treat both 200 and 404 as success (404 means already deleted)
      if (response.ok || response.status === 404) {

        // Immediately remove from local state - be more explicit about ID matching
        setPreviousAnalyses(prev => {
          const filtered = prev.filter(a => {
            const match = a.id === analysisToDelete.id || String(a.id) === String(analysisToDelete.id)
            return !match
          })
          return filtered
        })

        // If the deleted analysis was currently selected, clear it
        if (currentAnalysis?.id === analysisToDelete.id) {
          setCurrentAnalysis(null)
          updateURLWithAnalysis(null)
        }

        toast.success("Analysis deleted")

        // Close dialog and reset state
        setDeleteDialogOpen(false)
        setAnalysisToDelete(null)

        // Also reload from server to ensure consistency
        setTimeout(() => loadPreviousAnalyses(), 500)

      } else {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'Failed to delete analysis')
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete analysis")
      setDeleteDialogOpen(false)
      setAnalysisToDelete(null)
    } finally {
      setDeletingAnalysis(false)
    }
  }

  // Function to fetch platform mappings (same as integrations page)
  const fetchPlatformMappings = useCallback(async () => {
    try {
      const authToken = checkAuthToken()
      if (!authToken) {
        return
      }

      // Fetch both GitHub and Slack mappings like the integrations page does
      const [githubResponse, slackResponse] = await Promise.all([
        fetch(`${API_BASE}/integrations/mappings/platform/github`, {
          headers: { 'Authorization': `Bearer ${authToken}` }
        }),
        fetch(`${API_BASE}/integrations/mappings/platform/slack`, {
          headers: { 'Authorization': `Bearer ${authToken}` }
        })
      ])

      let allMappings: any[] = []

      if (githubResponse.ok) {
        const githubMappings = await githubResponse.json()
        allMappings = allMappings.concat(githubMappings)
      }

      if (slackResponse.ok) {
        const slackMappings = await slackResponse.json()
        allMappings = allMappings.concat(slackMappings)
      }

      setAnalysisMappings({ mappings: allMappings })
    } catch (error) {
    }
  }, [checkAuthToken])

  // Load platform mappings on component mount (same as integrations page)
  useEffect(() => {
    fetchPlatformMappings()
  }, [fetchPlatformMappings])

  // Helper function to check if user has GitHub mapping (only if actually mapped)
  const hasGitHubMapping = (userEmail: string) => {
    if (!analysisMappings?.mappings) {
      return false
    }
    
    const hasMapping = analysisMappings.mappings.some((mapping: any) => 
      mapping.source_identifier === userEmail && 
      mapping.target_platform === "github" &&
      mapping.target_identifier && // Must have a target identifier
      mapping.target_identifier !== "unknown" && // Must not be "unknown"
      mapping.target_identifier.trim() !== "" // Must not be empty
    )
    
    return hasMapping
  }

  // Helper function to check if user has Slack mapping (only if actually mapped)
  const hasSlackMapping = (userEmail: string) => {
    if (!analysisMappings?.mappings) return false
    
    return analysisMappings.mappings.some((mapping: any) => 
      mapping.source_identifier === userEmail && 
      mapping.target_platform === "slack" &&
      mapping.target_identifier && // Must have a target identifier
      mapping.target_identifier !== "unknown" && // Must not be "unknown"
      mapping.target_identifier.trim() !== "" // Must not be empty
    )
  }

  // Functions to open mapping drawer
  const openMappingDrawer = (platform: 'github' | 'slack') => {
    setMappingDrawerPlatform(platform)
    setMappingDrawerOpen(true)
  }

  const loadIntegrations = async (forceRefresh = false, showGlobalLoading = true) => {
    // Check if we have valid cached data and don't need to refresh
    if (!forceRefresh && integrations.length > 0) {
      return
    }

    // Check localStorage cache
    if (!forceRefresh) {
      const cachedIntegrations = localStorage.getItem('all_integrations')
      const cacheTimestamp = localStorage.getItem('all_integrations_timestamp')
      
      if (cachedIntegrations && cacheTimestamp) {
        const cacheAge = Date.now() - parseInt(cacheTimestamp)
        const fiveMinutes = 5 * 60 * 1000
        
        if (cacheAge < fiveMinutes) {
          try {
            const cached = JSON.parse(cachedIntegrations)
            setIntegrations(cached)
            
            // Also load GitHub and Slack from cache if available
            const cachedGithub = localStorage.getItem('github_integration')
            const cachedSlack = localStorage.getItem('slack_integration')
            
            if (cachedGithub) {
              const githubData = JSON.parse(cachedGithub)
              if (githubData.connected && githubData.integration) {
                setGithubIntegration(githubData.integration)
              } else {
                setGithubIntegration(null)
              }
            }
            
            if (cachedSlack) {
              const slackData = JSON.parse(cachedSlack)
              if (slackData.connected && slackData.integration) {
                setSlackIntegration(slackData.integration)
              } else {
                setSlackIntegration(null)
              }
            }
            
            // Set integration based on saved preference
            const savedOrg = localStorage.getItem('selected_organization')
            if (savedOrg && cached.find((i: Integration) => i.id.toString() === savedOrg)) {
              setSelectedIntegration(savedOrg)
            } else if (cached.length > 0) {
              setSelectedIntegration(cached[0].id.toString())
              localStorage.setItem('selected_organization', cached[0].id.toString())
            }
            
            // Set loading to false when using cache
            setLoadingIntegrations(false)
            setHasDataFromCache(true)

            return
          } catch (error) {
              // Continue to fetch fresh data
          }
        }
      }
    }

    // Only show global loading if requested and we don't have any integrations yet
    if (showGlobalLoading && integrations.length === 0) {
      setLoadingIntegrations(true)
    }

    try {
      const authToken = checkAuthToken()
      if (!authToken) {
        return
      }

      // Load both Rootly, PagerDuty, GitHub, and Slack integrations
      
      let rootlyResponse, pagerdutyResponse, githubResponse, slackResponse
      try {
        [rootlyResponse, pagerdutyResponse, githubResponse, slackResponse] = await Promise.all([
          fetch(`${API_BASE}/rootly/integrations`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
          }),
          fetch(`${API_BASE}/pagerduty/integrations`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
          }),
          fetch(`${API_BASE}/integrations/github/status`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
          }),
          fetch(`${API_BASE}/integrations/slack/status`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
          })
        ])
      } catch (networkError) {
        throw new Error('Cannot connect to backend server. Please check if the backend is running and try again.')
      }

      const rootlyData = rootlyResponse.ok ? await rootlyResponse.json() : { integrations: [] }
      const pagerdutyData = pagerdutyResponse.ok ? await pagerdutyResponse.json() : { integrations: [] }
      const githubData = githubResponse.ok ? await githubResponse.json() : { connected: false, integration: null }
      const slackData = slackResponse.ok ? await slackResponse.json() : { connected: false, integration: null }


      // Set GitHub and Slack integration states
      if (githubData.connected && githubData.integration) {
        setGithubIntegration(githubData.integration)
      } else {
        setGithubIntegration(null)
      }
      
      if (slackData.connected && slackData.integration) {
        setSlackIntegration(slackData.integration)
      } else {
        setSlackIntegration(null)
      }
      
      // Cache GitHub and Slack integration status separately
      localStorage.setItem('github_integration', JSON.stringify(githubData))
      localStorage.setItem('slack_integration', JSON.stringify(slackData))

      // Ensure platform is set
      const rootlyIntegrations = (rootlyData.integrations || []).map((i: Integration, index: number) => {
        return { ...i, platform: 'rootly' as const }
      })
      const pagerdutyIntegrations = (pagerdutyData.integrations || []).map((i: Integration, index: number) => {
        return { ...i, platform: 'pagerduty' as const }
      })
      
      const allIntegrations = [...rootlyIntegrations, ...pagerdutyIntegrations]
      
      setIntegrations(allIntegrations)
      
      // Cache the integrations
      localStorage.setItem('all_integrations', JSON.stringify(allIntegrations))
      localStorage.setItem('all_integrations_timestamp', Date.now().toString())
        
      // Set integration based on saved preference if not already set
      if (!selectedIntegration) {
        const savedOrg = localStorage.getItem('selected_organization')
        if (savedOrg && allIntegrations.find((i: Integration) => i.id.toString() === savedOrg)) {
          setSelectedIntegration(savedOrg)
        } else if (allIntegrations.length > 0) {
          setSelectedIntegration(allIntegrations[0].id.toString())
          localStorage.setItem('selected_organization', allIntegrations[0].id.toString())
        }
      }
    } catch (error) {
      
      // Check if this is a network connectivity issue
      const isNetworkError = error instanceof Error && (
        error.message.includes('fetch') || 
        error.message.includes('network') ||
        error.message.includes('Failed to fetch') ||
        error.name === 'TypeError'
      )
      
      toast.error(isNetworkError ? "Cannot connect to backend server" : "Failed to load integrations")
    } finally {
      setLoadingIntegrations(false)
    }
  }

  // Format radar chart labels to fit in multiple lines
  const formatRadarLabel = (value: string) => {
    // If text is short enough, keep it as is
    if (value.length <= 8) return value;
    
    const words = value.split(' ');
    if (words.length <= 1) {
      // Single long word - try to break it intelligently
      if (value.length > 10) {
        const mid = Math.floor(value.length / 2);
        return `${value.substring(0, mid)}\n${value.substring(mid)}`;
      }
      return value;
    }
    
    // For multiple words, put each word on separate line if reasonable
    if (words.length === 2) {
      return `${words[0]}\n${words[1]}`;
    }
    
    // For more words, split in half
    const midpoint = Math.ceil(words.length / 2);
    const firstLine = words.slice(0, midpoint).join(' ');
    const secondLine = words.slice(midpoint).join(' ');
    
    return `${firstLine}\n${secondLine}`;
  };

  // Accurate analysis stages based on actual backend workflow and data sources
  const getAnalysisStages = () => {
    const stages = [
      { key: "loading", label: "Initializing Analysis", detail: "Setting up analysis parameters", progress: 5 },
      { key: "connecting", label: "Connecting to Platform", detail: "Validating API credentials", progress: 12 },
      { key: "fetching_users", label: "Fetching Organization Members", detail: "Loading user profiles and permissions", progress: 20 },
      { key: "fetching", label: "Collecting Incident Data", detail: "Gathering 30-day incident history", progress: 35 }
    ]

    let currentProgress = 35
    const hasGithub = includeGithub && githubIntegration
    const hasSlack = includeSlack && slackIntegration  
    const hasAI = enableAI

    // Add GitHub data collection if enabled (Step 2 extension)
    if (hasGithub) {
      stages.push({
        key: "fetching_github",
        label: "Collecting GitHub Data",
        detail: "Gathering commits, PRs, and code review patterns", 
        progress: 45
      })
      currentProgress = 45
    }

    // Add Slack data collection if enabled (Step 2 extension)  
    if (hasSlack) {
      stages.push({
        key: "fetching_slack",
        label: "Collecting Slack Data",
        detail: "Gathering messaging patterns and team communication",
        progress: hasGithub ? 52 : 45
      })
      currentProgress = hasGithub ? 52 : 45
    }

    // Backend Step 3: Team analysis (main processing phase)
    stages.push({
      key: "analyzing_team",
      label: "Analyzing Team Data", 
      detail: "Processing incidents and calculating member metrics",
      progress: currentProgress + 15
    })
    currentProgress += 15

    // Backend Step 4: Team health calculation
    stages.push({
      key: "calculating_health",
      label: "Calculating Team Health",
      detail: "Computing burnout scores and risk levels", 
      progress: currentProgress + 10
    })
    currentProgress += 10

    // Backend Step 5: Insights generation
    stages.push({
      key: "generating_insights",
      label: "Generating Insights",
      detail: "Analyzing patterns and creating recommendations",
      progress: currentProgress + 8
    })
    currentProgress += 8

    // Backend Step 7: AI enhancement (if enabled)
    if (hasAI) {
      stages.push({
        key: "ai_analysis", 
        label: "AI Team Analysis",
        detail: "Generating intelligent insights and narratives",
        progress: currentProgress + 12
      })
      currentProgress += 12
    }

    // Final preparation 
    stages.push({
      key: "preparing",
      label: "Finalizing Analysis",
      detail: "Preparing results",
      progress: 95
    })

    stages.push({
      key: "complete",
      label: "Analysis Complete",
      detail: "Results ready",
      progress: 100
    })

    return stages
  }

  const getAnalysisDescription = () => {
    const sources = []
    sources.push("incident response patterns")
    if (includeGithub && githubIntegration) sources.push("code activity")
    if (includeSlack && slackIntegration) sources.push("communication patterns")
    
    if (sources.length === 1) return sources[0]
    if (sources.length === 2) return `${sources[0]} and ${sources[1]}`
    return `${sources.slice(0, -1).join(", ")}, and ${sources[sources.length - 1]}`
  }

  const [showTimeRangeDialog, setShowTimeRangeDialog] = useState(false)
  const [selectedTimeRange, setSelectedTimeRange] = useState("30")
  const [dialogSelectedIntegration, setDialogSelectedIntegration] = useState<string>("")
  
  // GitHub/Slack integration states
  const [githubIntegration, setGithubIntegration] = useState<GitHubIntegration | null>(null)
  const [slackIntegration, setSlackIntegration] = useState<SlackIntegration | null>(null)
  const [includeGithub, setIncludeGithub] = useState(true)
  const [includeSlack, setIncludeSlack] = useState(true)
  const [enableAI, setEnableAI] = useState(true)
  const [llmConfig, setLlmConfig] = useState<{has_token: boolean, provider?: string} | null>(null)
  const [isLoadingGitHubSlack, setIsLoadingGitHubSlack] = useState(false)

  // Load LLM configuration
  const loadLlmConfig = async () => {
    try {
      const authToken = checkAuthToken()
      if (!authToken) {
        return
      }

      let response
      try {
        response = await fetch(`${API_BASE}/llm/token`, {
          headers: {
            'Authorization': `Bearer ${authToken}`
          }
        })
      } catch (networkError) {
        throw new Error('Cannot connect to backend server')
      }

      if (response.ok) {
        const config = await response.json()
        setLlmConfig(config)
      }
    } catch (error) {
      
      // Check if this is a network connectivity issue
      const isNetworkError = error instanceof Error && (
        error.message.includes('fetch') || 
        error.message.includes('network') ||
        error.message.includes('Failed to fetch') ||
        error.name === 'TypeError'
      )
      
      if (isNetworkError) {
        toast.error("Cannot connect to backend")
      }
    }
  }

  const startAnalysis = async () => {
    let currentIntegrations = integrations
    
    // Check if we have basic integrations cached
    if (currentIntegrations.length === 0) {
      // Check if we have cached data in localStorage first
      const cachedIntegrations = localStorage.getItem('all_integrations')
      const cacheTimestamp = localStorage.getItem('all_integrations_timestamp')
      
      if (cachedIntegrations && cacheTimestamp) {
        const cacheAge = Date.now() - parseInt(cacheTimestamp)
        if (cacheAge < 5 * 60 * 1000) { // 5 minutes
          // Load from cache without API call
          const cached = JSON.parse(cachedIntegrations)
          // Cache is stored as a flat array of integrations
          const loadedIntegrations = Array.isArray(cached) ? cached : []
          setIntegrations(loadedIntegrations)

          // Also load GitHub and Slack from their separate cache keys
          const cachedGithub = localStorage.getItem('github_integration')
          const cachedSlack = localStorage.getItem('slack_integration')
          if (cachedGithub) {
            const githubData = JSON.parse(cachedGithub)
            setGithubIntegration(githubData?.connected ? githubData.integration : null)
          }
          if (cachedSlack) {
            const slackData = JSON.parse(cachedSlack)
            setSlackIntegration(slackData?.integration || null)
          }

          currentIntegrations = loadedIntegrations
        } else {
          // Cache is stale, need to load fresh data
          await loadIntegrations(true, false) // Force refresh but don't show global loading
          // After async load, get the updated integrations from state or cache
          const freshCachedIntegrations = localStorage.getItem('all_integrations')
          if (freshCachedIntegrations) {
            const cached = JSON.parse(freshCachedIntegrations)
            currentIntegrations = Array.isArray(cached) ? cached : []
          }
        }
      } else {
        // No cache, need to load fresh data
        await loadIntegrations(true, false) // Force refresh but don't show global loading
        // After async load, get the updated integrations from cache
        const freshCachedIntegrations = localStorage.getItem('all_integrations')
        if (freshCachedIntegrations) {
          const cached = JSON.parse(freshCachedIntegrations)
          currentIntegrations = Array.isArray(cached) ? cached : []
        }
      }
      
      // Only show error if we still don't have any integrations after loading
      if (currentIntegrations.length === 0) {
        toast.error("No integrations found - please add an integration first")
        return
      }
    }

    // Always check localStorage for the latest selected organization
    // This ensures we use the correct org even if state is stale
    const savedOrg = localStorage.getItem('selected_organization')
    let integrationToUse = selectedIntegration

    // Prefer localStorage value if it exists and is valid
    if (savedOrg && currentIntegrations.find(i => i.id.toString() === savedOrg)) {
      integrationToUse = savedOrg
      // Update state if it's different
      if (integrationToUse !== selectedIntegration) {
        setSelectedIntegration(integrationToUse)
      }
    } else if (!integrationToUse && currentIntegrations.length > 0) {
      // Fallback to first available if no saved preference
      integrationToUse = currentIntegrations[0].id.toString()
      localStorage.setItem('selected_organization', integrationToUse)
      setSelectedIntegration(integrationToUse)
    }

    if (!integrationToUse) {
      toast.error("No integration available")
      return
    }

    // Set the dialog integration to the currently selected one by default
    setDialogSelectedIntegration(integrationToUse)
    setShowTimeRangeDialog(true)

    // Refresh permissions in background after modal opens
    // Modal will show loading state until permissions are loaded
    loadIntegrations(true)  // Force refresh to get latest permissions

    // Load cached GitHub/Slack data immediately if we don't have it in state
    if (!githubIntegration || !slackIntegration) {
    const cachedGitHub = localStorage.getItem('github_integration');
    const cachedSlack  = localStorage.getItem('slack_integration');

    if (cachedGitHub && !githubIntegration) {
        try {
        const gh = JSON.parse(cachedGitHub);
        setGithubIntegration(gh?.connected && gh?.integration ? gh.integration : null);
        } catch {}
    }

    if (cachedSlack && !slackIntegration) {
        try {
        const sl = JSON.parse(cachedSlack);
        setSlackIntegration(sl?.connected && sl?.integration ? sl.integration : null);
        } catch {}
    }
    }

    // Check cache validity for GitHub/Slack data
    const lastIntegrationsLoad = localStorage.getItem('all_integrations_timestamp')
    const integrationsCacheAge = lastIntegrationsLoad ? Date.now() - parseInt(lastIntegrationsLoad) : Infinity
    const integrationsCacheValid = integrationsCacheAge < 15 * 60 * 1000 // 15 minutes (increased from 5)
    
    // Only load GitHub/Slack data if we don't have it in state yet
    // The modal can function without this data - it's only needed for the toggle switches
    const needsGitHubSlackData = (!githubIntegration || !slackIntegration) && !integrationsCacheValid
    const needsLlmConfig = !llmConfig
    
    if (needsGitHubSlackData || needsLlmConfig) {
      setIsLoadingGitHubSlack(true)
      
      const promises = []
      if (needsGitHubSlackData) {
        promises.push(loadIntegrations(true, false)) // Refresh integrations without showing loading
      }
      if (needsLlmConfig) {
        promises.push(loadLlmConfig())
      }
      
      Promise.all(promises).then(() => {
        setIsLoadingGitHubSlack(false)
      }).catch(_ => {
        setIsLoadingGitHubSlack(false)
      })
    } else {
    }
  }

  const runAnalysisWithTimeRange = async () => {
    // Check permissions before running - only for Rootly integrations
    const selectedIntegration = integrations.find(i => i.id.toString() === dialogSelectedIntegration);
    
    // Only check permissions for Rootly integrations, not PagerDuty
    if (selectedIntegration?.platform === 'rootly') {
      const hasUserPermission = selectedIntegration?.permissions?.users?.access;
      const hasIncidentPermission = selectedIntegration?.permissions?.incidents?.access;
      
      if (!hasUserPermission || !hasIncidentPermission) {
        toast.error("Missing required permissions - update API token")
        return;
      }
    }
    
    setShowTimeRangeDialog(false)
    setTimeRange(selectedTimeRange)
    setAnalysisRunning(true)
    setAnalysisStage("loading")
    setAnalysisProgress(0)
    setTargetProgress(5) // Initial target
    setCurrentStageIndex(0)

    try {
      const authToken = checkAuthToken()
      if (!authToken) {
        setAnalysisRunning(false)
        return
      }

      // Debug log the request data
      // Handle both string (beta) and numeric (regular) integration IDs
      const integrationId = isNaN(parseInt(dialogSelectedIntegration)) 
        ? dialogSelectedIntegration  // Keep as string for beta integrations
        : parseInt(dialogSelectedIntegration);  // Convert to number for regular integrations
      
      const requestData = {
        integration_id: integrationId,
        time_range: parseInt(selectedTimeRange),
        include_weekends: true,
        include_github: githubIntegration ? includeGithub : false,
        include_slack: slackIntegration ? includeSlack : false,
        enable_ai: enableAI  // User can toggle, uses Railway token when enabled
      }
      

      // Start the analysis
      let response
      try {
        response = await fetch(`${API_BASE}/analyses/run`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`
          },
          body: JSON.stringify(requestData),
        })
      } catch (networkError) {
        throw new Error('Cannot connect to backend server. Please check if the backend is running and try again.')
      }

      if (!response) {
        throw new Error('No response from server. Please check if the backend is running.')
      }

      let responseData
      try {
        responseData = await response.json()
      } catch (parseError) {
        throw new Error(`Server returned invalid response (${response.status}). The backend may be experiencing issues.`)
      }
      
      if (!response.ok) {
        throw new Error(responseData.detail || responseData.message || `Analysis failed with status ${response.status}`)
      }

      const { id: analysis_id } = responseData
      setCurrentRunningAnalysisId(analysis_id)
      
      if (!analysis_id) {
        throw new Error('No analysis ID returned from server')
      }


      // Refresh the analyses list to show the new running analysis in sidebar
      // Use silent mode - if this fails, it's not critical as polling will continue
      await loadPreviousAnalyses(false, true)

      // Poll for analysis completion
      let pollRetryCount = 0
      const maxRetries = 10 // Stop after 10 failed polls
      
      // Set initial progress target
      setTargetProgress(10)
      setAnalysisStage("loading")
      
      const pollAnalysis = async () => {
        try {
          if (!analysis_id) {
            setAnalysisRunning(false)
      setCurrentRunningAnalysisId(null)
            setCurrentRunningAnalysisId(null)
            return
          }
          
          let pollResponse
          try {
            pollResponse = await fetch(`${API_BASE}/analyses/${analysis_id}`, {
              headers: {
                'Authorization': `Bearer ${authToken}`
              }
            })
          } catch (networkError) {
            // Network error (including CORS errors from 502) - retry with backoff
            pollRetryCount++

            if (pollRetryCount >= maxRetries) {
              setAnalysisRunning(false)
              setCurrentRunningAnalysisId(null)
              toast.error("Cannot connect to backend - analysis may still be running. Please refresh the page.")
              return
            }

            // Continue polling with exponential backoff
            setTimeout(pollAnalysis, Math.min(2000 * pollRetryCount, 10000))
            return
          }

          if (pollResponse.ok) {
            // Response is OK, continue to process
          } else if (pollResponse.status === 404) {
            // Analysis was deleted during polling - stop immediately
            setAnalysisRunning(false)
            setCurrentRunningAnalysisId(null)
            toast.error("Analysis was deleted or no longer exists")

            // Try to load the most recent analysis as fallback
            await loadPreviousAnalyses()
            return
          } else if (pollResponse.status === 502 || pollResponse.status === 503) {
            // Backend temporarily unavailable - retry with backoff
            pollRetryCount++

            if (pollRetryCount >= maxRetries) {
              setAnalysisRunning(false)
              setCurrentRunningAnalysisId(null)
              toast.error("Backend server unavailable - analysis may still be running. Please try again later.")
              return
            }

            // Continue polling with exponential backoff
            setTimeout(pollAnalysis, Math.min(2000 * pollRetryCount, 10000))
            return
          } else {
            // Other HTTP errors - treat as polling failure
            throw new Error(`HTTP ${pollResponse.status}: ${pollResponse.statusText}`)
          }
          
          let analysisData
          if (pollResponse.ok) {
            analysisData = await pollResponse.json()
            
            if (analysisData.status === 'completed') {
              
              // Set progress to 95% first, then jump to 100% right before showing data
              setTargetProgress(95)
              setAnalysisStage("complete")
              
              // Wait for progress to reach 95%, then show 100% briefly before showing data
              setTimeout(() => {
                setTargetProgress(100)
                setTimeout(() => {
                  setAnalysisRunning(false)
      setCurrentRunningAnalysisId(null)
            setCurrentRunningAnalysisId(null)
                  setCurrentRunningAnalysisId(null)
                  setCurrentAnalysis(analysisData)
                  setRedirectingToSuggested(false) // Turn off redirect loader
                  updateURLWithAnalysis(analysisData.uuid || analysisData.id)
                }, 500) // Show 100% for just 0.5 seconds before showing data
              }, 800) // Wait 0.8 seconds to reach 95%
              
              // Reload previous analyses from API to ensure sidebar is up-to-date
              await loadPreviousAnalyses()
              
              toast.success("Analysis completed!")
              return
            } else if (analysisData.status === 'failed') {
              setAnalysisRunning(false)
      setCurrentRunningAnalysisId(null)
            setCurrentRunningAnalysisId(null)
              
              // Check if we have partial data to display
              if (analysisData.analysis_data?.partial_data) {
                setCurrentAnalysis(analysisData)
                updateURLWithAnalysis(analysisData.uuid)
                toast("Analysis completed with partial data")
                await loadPreviousAnalyses()
              } else {
                toast.error(analysisData.error_message || "Analysis failed - please try again")
              }
              return
            } else if (analysisData.status === 'running') {
              // Update progress through stages based on analysis status
              
              // Check if we have progress information from the API
              if (analysisData.progress !== undefined) {
                setTargetProgress(Math.min(analysisData.progress, 85))
              } else if (analysisData.stage) {
                // If the API provides a stage, use it
                const stageData = getAnalysisStages().find(s => s.key === analysisData.stage)
                if (stageData) {
                  setAnalysisStage(analysisData.stage as AnalysisStage)
                  
                  // If we're fetching users and have progress info
                  if (analysisData.stage === 'fetching_users' && analysisData.users_processed && analysisData.total_users) {
                    // Calculate progress between 20% and 40% based on users processed
                    const userProgress = (analysisData.users_processed / analysisData.total_users) * 20
                    setTargetProgress(20 + userProgress)
                  } else if (analysisData.stage === 'fetching' && analysisData.incidents_processed) {
                    // Calculate progress between 40% and 60% based on incidents processed
                    const baseProgress = 40
                    const progressRange = 20
                    // Assume we'll process ~100-200 incidents, scale accordingly
                    const incidentProgress = Math.min((analysisData.incidents_processed / 100) * progressRange, progressRange)
                    setTargetProgress(baseProgress + incidentProgress)
                  } else {
                    setTargetProgress(stageData.progress)
                  }
                }
              } else {
                // Simulate progress through stages - advance conservatively with random increments
                setCurrentStageIndex(prevIndex => {
                  // Allow simulation to progress further while waiting for API
                  const currentStages = getAnalysisStages()
                  const maxSimulatedIndex = currentStages.length - 2 // Stop before final stage
                  const stageIndex = Math.min(prevIndex, currentStages.length - 1)
                  const stage = currentStages[stageIndex]
                  setAnalysisStage(stage.key as AnalysisStage)
                  
                  // Add some randomness to the target progress but respect stage boundaries
                  const baseProgress = stage.progress
                  const randomOffset = Math.floor(Math.random() * 3) // 0-2 random offset (smaller for more predictable feel)
                  const targetWithRandomness = Math.min(baseProgress + randomOffset, 88) // Cap at 88% for simulation
                  setTargetProgress(targetWithRandomness)
                  
                  // Add realistic timing delays based on stage type
                  const stageTimings = {
                    'loading': 1500,
                    'connecting': 2000, 
                    'fetching_users': 2500,
                    'fetching': 3000,
                    'fetching_github': 4000, // GitHub can be slower
                    'fetching_slack': 3500,  
                    'analyzing_team': 4500,  // Main processing takes longer
                    'calculating_health': 2000,
                    'generating_insights': 2500,
                    'ai_analysis': 5000,     // AI processing is slower
                    'preparing': 1000
                  }
                  
                  // Log timing for this stage
                  const timing = stageTimings[stage.key] || 2000
                  
                  // Only advance if we haven't reached the max simulated stage
                  if (prevIndex < maxSimulatedIndex) {
                    const nextIndex = prevIndex + 1
                    return nextIndex
                  } else {
                    return prevIndex
                  }
                })
              }
            }
          }

          // Continue polling only if analysis is still running
          if (analysisData.status !== 'completed' && analysisData.status !== 'failed') {
            pollRetryCount = 0 // Reset retry count on successful poll
            setTimeout(pollAnalysis, 2000)
          } else {
            // Analysis is complete - stop polling
            setAnalysisRunning(false)
            setCurrentRunningAnalysisId(null)
          }
        } catch (error) {
          pollRetryCount++
          
          if (pollRetryCount >= maxRetries) {
            setAnalysisRunning(false)
      setCurrentRunningAnalysisId(null)
            setCurrentRunningAnalysisId(null)
            toast.error("Analysis polling failed - please try again")
            return
          }
          
          // Continue polling with exponential backoff
          setTimeout(pollAnalysis, Math.min(2000 * pollRetryCount, 10000))
        }
      }

      // Start polling after a short delay
      setTimeout(pollAnalysis, 1000)

    } catch (error) {
      setAnalysisRunning(false)
      setCurrentRunningAnalysisId(null)
      toast.error(error instanceof Error ? error.message : "Failed to run analysis")
    }
  }

  const getRiskColor = (riskLevel: string) => {
    switch (riskLevel) {
      // OCB 4-tier system
      case "critical":
        return "text-red-800 bg-red-100 border-red-300"    // Critical (75-100): Dark red
      case "poor": 
        return "text-red-600 bg-red-50 border-red-200"     // Poor (50-74): Red
      case "fair":
        return "text-yellow-600 bg-yellow-50 border-yellow-200" // Fair (25-49): Yellow  
      case "healthy":
        return "text-green-600 bg-green-50 border-green-200"    // Healthy (0-24): Green
      
      // Legacy 3-tier system fallback
      case "high":
        return "text-red-600 bg-red-50 border-red-200"
      case "medium":
        return "text-yellow-600 bg-yellow-50 border-yellow-200"
      case "low":
        return "text-green-600 bg-green-50 border-green-200"
      default:
        return "text-gray-600 bg-gray-50 border-gray-200"
    }
  }

  const getProgressColor = (riskLevel: string) => {
    switch (riskLevel) {
      case "high":
        return "bg-red-500"
      case "medium":
        return "bg-yellow-500"
      case "low":
        return "bg-green-500"
      default:
        return "bg-gray-500"
    }
  }

  
  const getTrendIcon = (trend?: string) => {
    switch (trend) {
      case "up":
        return { icon: "up" as const, className: "w-4 h-4 text-red-500" };
      case "down":
        return { icon: "down" as const, className: "w-4 h-4 text-green-500" };
      default:
        return { icon: "flat" as const, className: "w-4 h-4 text-gray-500" };
    }
  };


  const exportAsJSON = () => {
    if (!currentAnalysis) return
    
    // Create a clean export object
    const exportData = {
      analysis_id: currentAnalysis.id,
      export_date: new Date().toISOString(),
      integration_id: currentAnalysis.integration_id,
      time_range_days: currentAnalysis.time_range,
      organization_name: selectedIntegrationData?.name,
      ...currentAnalysis.analysis_data
    }
    
    const dataStr = JSON.stringify(exportData, null, 2)
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr)
    const exportFileDefaultName = `burnout-analysis-${selectedIntegrationData?.name || 'organization'}-${new Date().toISOString().split('T')[0]}.json`
    const linkElement = document.createElement('a')
    linkElement.setAttribute('href', dataUri)
    linkElement.setAttribute('download', exportFileDefaultName)
    linkElement.click()
  }

  const handleManageIntegrations = () => {
    router.push('/integrations')
  }

  const ensureIntegrationsLoaded = async () => {
    if (integrations.length === 0 && !dropdownLoading) {
      setDropdownLoading(true)
      try {
        await loadIntegrations(true, false) // Force refresh, no global loading
      } finally {
        setDropdownLoading(false)
      }
    }
  }

  const handleSignOut = () => {
    localStorage.removeItem('auth_token')
    router.push('/')
  }

  const selectedIntegrationData = integrations.find(i => i.id.toString() === selectedIntegration)
  
  // Generate chart data from real historical analysis results
  const chartData = historicalTrends?.daily_trends?.length > 0 
    ? historicalTrends.daily_trends.slice(-7).map((trend: any) => ({
        date: new Date(trend.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        score: Math.round((10 - trend.overall_score) * 10) // Convert 0-10 burnout to 0-100 health scale
      }))
    : currentAnalysis?.analysis_data?.team_health 
      ? [{ 
          date: "Current", 
          score: Math.round(currentAnalysis.analysis_data.team_health.overall_score * 10) 
        }] 
      : []
  
  const memberBarData = (() => {
    const teamAnalysis = currentAnalysis?.analysis_data?.team_analysis
    const members = Array.isArray(teamAnalysis) ? teamAnalysis : teamAnalysis?.members
    return members
      ?.filter((member) => {
        // Only include members with OCB scores
        const memberWithOcb = member as any;
        return memberWithOcb.ocb_score !== undefined && memberWithOcb.ocb_score !== null && memberWithOcb.ocb_score > 0
      })
      ?.map((member) => {
        // Use OCB scoring system (0-100 scale, higher = more burnout)
        const score = (member as any).ocb_score || 0
        
        const burnoutScore = Math.max(0, score);
        
        // Official OCB 4-color system based on burnout score (higher = worse)
        const getRiskFromBurnoutScore = (burnoutScore: number) => {
          if (burnoutScore < 25) return { level: 'low', color: '#10b981' };      // Green - Low/minimal burnout (0-24)
          if (burnoutScore < 50) return { level: 'mild', color: '#eab308' };     // Yellow - Mild burnout symptoms (25-49)  
          if (burnoutScore < 75) return { level: 'moderate', color: '#f97316' }; // Orange - Moderate/significant burnout (50-74)
          return { level: 'high', color: '#dc2626' };                           // Red - High/severe burnout (75-100)
        };
        
        const riskInfo = getRiskFromBurnoutScore(burnoutScore);
        
        return {
          name: member.user_name.split(" ")[0],
          fullName: member.user_name,
          score: burnoutScore,
          riskLevel: riskInfo.level,
          backendRiskLevel: member.risk_level, // Keep original for reference
          scoreType: 'OCB',
          fill: riskInfo.color,
        }
      })
      ?.sort((a, b) => b.score - a.score) // Sort by score descending (highest burnout first)
      || []
  })();
  
  const members = (() => {
    const teamAnalysis = currentAnalysis?.analysis_data?.team_analysis
    return Array.isArray(teamAnalysis) ? teamAnalysis : (teamAnalysis?.members || [])
  })();
  
  // Helper function to get color based on severity
  const getFactorColor = (value) => {
    if (value >= 7) return '#DC2626' // Red - Critical
    if (value >= 5) return '#F59E0B' // Orange - Warning  
    if (value >= 3) return '#10B981' // Green - Good
    return '#6B7280' // Gray - Low risk
  }
  
  // Helper function to get recommendations
  const getRecommendation = (factor) => {
    switch(factor.toLowerCase()) {
      case 'workload':
        return 'Consider redistributing incidents or adding team members'
      case 'after hours':
        return 'Implement on-call rotation limits and recovery time'
      case 'weekend work':
        return 'Establish weekend work policies and coverage plans'
      case 'incident load':
        return 'Review incident prevention and escalation procedures'
      case 'resolution time':
        return 'Review escalation procedures and skill gaps'
      default:
        return 'Monitor this factor closely and consider intervention'
    }
  }
  
  // NO FALLBACK DATA: Only show burnout factors if we have REAL API data
  // Include ALL members with burnout scores, not just those with incidents
  // Members with high GitHub activity but no incidents should still be included
  // Filter members with OCB scores only
  const membersWithOcbScores = useMemo(() => members.filter((m: any) =>
    m?.ocb_score !== undefined && m?.ocb_score !== null && m?.ocb_score > 0
  ), [members]);

  // For backward compatibility, keep membersWithIncidents for other parts of the code
  const membersWithIncidents = members.filter((m: any) => (m?.incident_count || 0) > 0);

  // Check if we have any real factors data from the API (not calculated/fake values)
  const hasRealFactorsData = membersWithIncidents.length > 0 &&
    membersWithIncidents.some((m: any) => m?.factors && (
      (m.factors.after_hours !== undefined && m.factors.after_hours !== null) ||
      (m.factors.weekend_work !== undefined && m.factors.weekend_work !== null) ||
      (m.factors.incident_load !== undefined && m.factors.incident_load !== null) ||
      (m.factors.response_time !== undefined && m.factors.response_time !== null)
    ));

  // Use backend-calculated factors for organization-level metrics
  // Backend provides pre-calculated factors - frontend should ONLY display, never recalculate
  const membersWithGitHubData = members.filter((m: any) =>
    m?.github_activity && (m.github_activity.commits_count > 0 || m.github_activity.commits_per_week > 0));

  const allActiveMembers = membersWithOcbScores;

  const burnoutFactors = useMemo(() => (allActiveMembers.length > 0) ? [
    {
      factor: "Workload Intensity",
      value: (() => {
        if (allActiveMembers.length === 0) return null;

        // Use backend-calculated workload factors
        const workloadScores = allActiveMembers
          .map((m: any) => m?.factors?.workload ?? 0)
          .filter(score => score > 0);

        if (workloadScores.length === 0) return 0;

        const sum = workloadScores.reduce((total, score) => total + score, 0);
        const average = sum / workloadScores.length;
        // Convert 0-10 scale to OCB 0-100 scale (whole integer)
        return Math.round(average * 10);
      })(),
      metrics: `Average workload factor from ${allActiveMembers.length} active team members`
    },
    {
      factor: "After Hours Activity",
      value: (() => {
        if (allActiveMembers.length === 0) return null;

        // Use backend-calculated after_hours factors
        const afterHoursScores = allActiveMembers
          .map((m: any) => m?.factors?.after_hours ?? 0)
          .filter(score => score > 0);

        if (afterHoursScores.length === 0) return 0;

        const sum = afterHoursScores.reduce((total, score) => total + score, 0);
        const average = sum / afterHoursScores.length;
        // Convert 0-10 scale to OCB 0-100 scale (whole integer)
        return Math.round(average * 10);
      })(),
      metrics: `Average after-hours factor from ${allActiveMembers.length} active team members`
    },
    {
      factor: "Weekend Work",
      value: (() => {
        if (allActiveMembers.length === 0) return null;

        // Use backend-calculated weekend_work factors
        const weekendScores = allActiveMembers
          .map((m: any) => m?.factors?.weekend_work ?? 0)
          .filter(score => score > 0);

        if (weekendScores.length === 0) return 0;

        const sum = weekendScores.reduce((total, score) => total + score, 0);
        const average = sum / weekendScores.length;
        // Convert 0-10 scale to OCB 0-100 scale (whole integer)
        return Math.round(average * 10);
      })(),
      metrics: `Average weekend work factor from ${allActiveMembers.length} active team members`
    },
    {
      factor: "Response Time",
      value: (() => {
        if (allActiveMembers.length === 0) return null;

        // Use backend-calculated response_time factors
        const responseScores = allActiveMembers
          .map((m: any) => m?.factors?.response_time ?? 0)
          .filter(score => score > 0);

        if (responseScores.length === 0) return 0;

        const sum = responseScores.reduce((total, score) => total + score, 0);
        const average = sum / responseScores.length;
        // Convert 0-10 scale to OCB 0-100 scale (whole integer)
        return Math.round(average * 10);
      })(),
      metrics: `Average response time factor from ${allActiveMembers.length} active team members`
    },
    {
      factor: "Incident Load",
      value: (() => {
        if (allActiveMembers.length === 0) return null;

        // Use backend-calculated incident_load factors
        const incidentLoadScores = allActiveMembers
          .map((m: any) => m?.factors?.incident_load ?? 0)
          .filter(score => score > 0);

        if (incidentLoadScores.length === 0) return 0;

        const sum = incidentLoadScores.reduce((a: number, b: number) => a + b, 0);
        const average = sum / incidentLoadScores.length;
        // Convert 0-10 scale to OCB 0-100 scale (whole integer)
        return Math.round(average * 10);
      })(),
      metrics: `Average incident load factor from ${allActiveMembers.length} active team members`
    },
  ].map(factor => ({
    ...factor,
    color: getFactorColor(factor.value!),
    recommendation: getRecommendation(factor.factor),
    severity: factor.value! >= 70 ? 'Critical' : factor.value! >= 50 ? 'Poor' : factor.value! >= 30 ? 'Fair' : 'Good'
  })) : [], [allActiveMembers]);
  
  // Get high-risk factors for emphasis (OCB scale 0-100)
  const highRiskFactors = burnoutFactors.filter(f => f.value >= 50).sort((a, b) => b.value - a.value);

  // sort descending for RiskFactors 
  const sortedBurnoutFactors = useMemo(
    () =>
      [...burnoutFactors].sort(
        (a, b) => (b.value ?? -1) - (a.value ?? -1) 
      ),
    [burnoutFactors]
  );

return {
  // config, routing
  API_BASE,
  router,
  searchParams,

  // loading, lifecycle
  loadingIntegrations,
  initialDataLoaded,
  hasDataFromCache,
  loadingAnalyses,
  loadingTrends,
  analysisRunning,
  analysisStage,
  analysisProgress,
  targetProgress,
  redirectingToSuggested,
  hasMoreAnalyses,
  loadingMoreAnalyses,
  dropdownLoading,

  // ui states
  sidebarCollapsed,
  setSidebarCollapsed,
  debugSectionOpen,
  setDebugSectionOpen,
  expandedDataSources,
  setExpandedDataSources,

  // selections & ids
  selectedIntegration,
  setSelectedIntegration,
  selectedIntegrationData,
  currentRunningAnalysisId,
  selectedMember,
  setSelectedMember,
  timeRange,
  setTimeRange,

  // core data
  integrations,
  currentAnalysis,
  previousAnalyses,
  totalAnalysesCount,
  historicalTrends,
  analysisMappings,

  // caches
  analysisCache,
  setAnalysisCache,
  githubTimelineCache,
  setGithubTimelineCache,

  // members
  members,
  allActiveMembers,
  membersWithIncidents,
  membersWithGitHubData,

  // derived data
  chartData,
  memberBarData,
  burnoutFactors,
  highRiskFactors,
  sortedBurnoutFactors,

  // integrations & options
  githubIntegration,
  slackIntegration,
  includeGithub,
  setIncludeGithub,
  includeSlack,
  setIncludeSlack,
  enableAI,
  setEnableAI,
  llmConfig,
  isLoadingGitHubSlack,

  // mapping drawer
  mappingDrawerOpen,
  setMappingDrawerOpen,
  mappingDrawerPlatform,
  openMappingDrawer,

  // helpers
  getTrendIcon,
  getRiskColor,
  getProgressColor,
  formatRadarLabel,
  getAnalysisStages,
  getAnalysisDescription,

  // actions
  startAnalysis,
  runAnalysisWithTimeRange,
  cancelRunningAnalysis,
  openDeleteDialog,
  confirmDeleteAnalysis,
  loadPreviousAnalyses,
  loadSpecificAnalysis,
  loadHistoricalTrends,
  fetchPlatformMappings,
  hasGitHubMapping,
  hasSlackMapping,
  ensureIntegrationsLoaded,
  handleManageIntegrations,
  handleSignOut,
  exportAsJSON,
  shouldShowInsufficientDataCard,
  updateURLWithAnalysis,

  // start-analysis modal
  showTimeRangeDialog,
  setShowTimeRangeDialog,
  selectedTimeRange,
  setSelectedTimeRange,
  dialogSelectedIntegration,
  setDialogSelectedIntegration,

  // delete modal
  deleteDialogOpen,
  setDeleteDialogOpen,
  deletingAnalysis,
  analysisToDelete,
  setAnalysisToDelete,

  // direct setters
  setCurrentAnalysis,
  setRedirectingToSuggested
};
}
