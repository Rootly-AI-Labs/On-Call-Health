"use client"

import { Suspense, useState, useMemo, useEffect, useRef, type JSX } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { MappingDrawer } from "@/components/mapping-drawer"
import { Separator } from "@/components/ui/separator"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts"
import {
  Activity,
  Play,
  Clock,
  FileText,
  Settings,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  Download,
  AlertCircle,
  Trash2,
  Users,
  Star,
  Info,
  CalendarIcon,
  ArrowRight,
  RefreshCw,
  Loader2,
  ChevronRight,
  ChevronLeft,
  Bookmark,
  Timer,
} from "lucide-react"

// Helper function for platform-based colors
function getPlatformColor(platform: string | undefined): string {
  if (platform === 'rootly') return 'bg-purple-500'
  if (platform === 'pagerduty') return 'bg-green-500'
  return 'bg-neutral-1000'
}

// Helper function for severity badge styles
function getSeverityBadgeClass(severity: string | undefined): string {
  switch (severity) {
    case 'Critical':
      return 'bg-red-100 text-red-800'
    case 'Poor':
      return 'bg-orange-100 text-orange-800'
    case 'Fair':
      return 'bg-yellow-100 text-yellow-800'
    default:
      return 'bg-green-100 text-green-800'
  }
}
import { TeamHealthOverview } from "@/components/dashboard/TeamHealthOverview"
import { AnalysisProgressSection } from "@/components/dashboard/AnalysisProgressSection"
import { TeamMembersList } from "@/components/dashboard/TeamMembersList"
import { ObjectiveDataCard } from "@/components/dashboard/ObjectiveDataCard"
import { TeamRiskFactorsCard, FACTOR_DESCRIPTIONS } from "@/components/dashboard/TeamRiskFactorsCard"
import { AlertsCountCard } from "@/components/dashboard/AlertsCountCard"
import { OpenAIUsageCard } from "@/components/dashboard/OpenAIUsageCard"
import { AnthropicUsageCard } from "@/components/dashboard/AnthropicUsageCard"
import { AlertsLeaderboard } from "@/components/dashboard/AlertsLeaderboard"
import { InfoTooltip } from "@/components/ui/info-tooltip"
import { MemberDetailModal } from "@/components/dashboard/MemberDetailModal"
import GitHubAllMetricsPopup from "@/components/dashboard/GitHubAllMetricsPopup"
import RiskFactorsAllPopup from "@/components/dashboard/RiskFactorsAllPopup"
import { DeleteAnalysisDialog } from "@/components/dashboard/dialogs/DeleteAnalysisDialog"
import Image from "next/image"
import { format, formatDistanceToNow } from "date-fns"
import { cn } from "@/lib/utils"
import useDashboard from "@/hooks/useDashboard"
import { TopPanel } from "@/components/TopPanel"
import { useOnboarding } from "@/hooks/useOnboarding"
import IntroGuide from "@/components/IntroGuide"

/** Measures Team Alerts' natural height and locks Alerts Leaderboard to that same height. */
function AlertsCardsRow({ currentAnalysis }: { currentAnalysis: any }) {
  const teamAlertsRef = useRef<HTMLDivElement>(null)
  const [teamAlertsHeight, setTeamAlertsHeight] = useState<number | null>(null)

  useEffect(() => {
    const el = teamAlertsRef.current
    if (!el) {
      setTeamAlertsHeight(null)
      return
    }
    const observer = new ResizeObserver(() => {
      setTeamAlertsHeight(el.offsetHeight)
    })
    observer.observe(el)
    setTeamAlertsHeight(el.offsetHeight)
    return () => observer.disconnect()
  }, [currentAnalysis])

  const isPagerDuty = currentAnalysis?.platform === 'pagerduty'
  const hasAlertsData = !!currentAnalysis?.analysis_data?.metadata?.alerts
  if (!isPagerDuty && !hasAlertsData) return null

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6 items-start">
      <div ref={teamAlertsRef}>
        <AlertsCountCard currentAnalysis={currentAnalysis} />
      </div>
      <div style={teamAlertsHeight ? { height: teamAlertsHeight } : undefined} className="flex flex-col overflow-hidden">
        <AlertsLeaderboard currentAnalysis={currentAnalysis} />
      </div>
    </div>
  )
}

function DashboardContent() {
  const {
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
  loadingAnalysisId,
  setLoadingAnalysisId,

  // ui states
  sidebarCollapsed,
  setSidebarCollapsed,
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
  autoRefreshAnalysis,
  previousAnalyses,
  totalAnalysesCount,
  historicalTrends,
  analysisMappings,

  // caches
  analysisCache,
  setAnalysisCache,

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
  jiraIntegration,
  linearIntegration,
  includeGithub,
  setIncludeGithub,
  includeSlack,
  setIncludeSlack,
  includeJira,
  setIncludeJira,
  includeLinear,
  setIncludeLinear,
  includeAIUsage,
  setIncludeAIUsage,
  aiUsageConnected,
  openaiUsageEnabled,
  anthropicUsageEnabled,
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
  getAnalysisStages,
  getAnalysisDescription,

  // actions
  startAnalysis,
  runAnalysisWithTimeRange,
  cancelRunningAnalysis,
  openDeleteDialog,
  confirmDeleteAnalysis,
  loadPreviousAnalyses,
  saveCurrentAnalysis,
  loadAutoRefreshAnalysis,
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
  hasNoIncidentsInPeriod,
  updateURLWithAnalysis,
  refreshCurrentAnalysis,

  // start-analysis modal
  showTimeRangeDialog,
  setShowTimeRangeDialog,
  selectedTimeRange,
  setSelectedTimeRange,
  customStartDate,
  setCustomStartDate,
  isCustomRange,
  setIsCustomRange,
  validateCustomDate,
  dialogSelectedIntegration,
  setDialogSelectedIntegration,
  noIntegrationsFound,
  setNoIntegrationsFound,
  autoRefreshEnabled,
  setAutoRefreshEnabled,
  autoRefreshInterval,
  setAutoRefreshInterval,

  // delete modal
  deleteDialogOpen,
  setDeleteDialogOpen,
  deletingAnalysis,
  analysisToDelete,
  setAnalysisToDelete,

  // direct setters
  setCurrentAnalysis,
  setRedirectingToSuggested
  } = useDashboard()

  // Helper function to safely sanitize untrusted strings to prevent XSS
  const sanitizeString = (str: any): string => {
    if (typeof str !== 'string') {
      return String(str || '')
    }
    // Create a temporary element to use browser's HTML parsing for safe text extraction
    const temp = document.createElement('div')
    temp.textContent = str
    return temp.textContent ?? ''
  }

  // Helper function to check if run analysis button should be disabled
  const isRunAnalysisDisabled = (): boolean => {
    if (!dialogSelectedIntegration) return true
    if (isCustomRange && !validateCustomDate(customStartDate).valid) return true

    const selectedIntegration = integrations.find(i => i.id.toString() === dialogSelectedIntegration)
    if (!selectedIntegration) return true

    // Check if no team members synced
    if ((selectedIntegration.total_users || 0) === 0) return true

    // Only check permissions for Rootly integrations, not PagerDuty
    if (selectedIntegration.platform === 'rootly') {
      const hasUserPermission = selectedIntegration.permissions?.users?.access
      const hasIncidentPermission = selectedIntegration.permissions?.incidents?.access
      return !hasUserPermission || !hasIncidentPermission
    }

    // For PagerDuty or other platforms, don't block based on permissions
    return false
  }

  // Get userId from localStorage for user-specific onboarding tracking
  const userId = typeof window !== 'undefined' ? localStorage.getItem("user_id") : null
  const onboarding = useOnboarding(userId)

  // Track if component has mounted on client to prevent hydration mismatch
  const [mounted, setMounted] = useState(false)
  const sidebarRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    setMounted(true)
  }, [])

  // Click outside sidebar detection for mobile collapse
  useEffect(() => {
    // Only handle click-outside on mobile
    if (typeof window === 'undefined') return
    if (window.innerWidth >= 768) return

    const handleClickOutside = (event: MouseEvent) => {
      if (!sidebarCollapsed &&
          sidebarRef.current &&
          !sidebarRef.current.contains(event.target as Node)) {
        setSidebarCollapsed(true)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [sidebarCollapsed, setSidebarCollapsed])

  // Auto-open analysis dialog when redirected from integrations page with ?run=true
  useEffect(() => {
    if (mounted && searchParams.get('run') === 'true' && !analysisRunning) {
      startAnalysis()
      router.replace('/dashboard', { scroll: false })
    }
  }, [mounted, searchParams, analysisRunning, startAnalysis, router])

  // Snapshot-derived AI flags — stable once analysis loads, not subject to live-API race conditions
  const hasOpenAISnapshot = useMemo(() =>
    Object.keys(currentAnalysis?.analysis_data?.metadata?.openai_usage ?? {}).length > 0,
    [currentAnalysis]
  )
  const hasAnthropicSnapshot = useMemo(() =>
    Object.keys(currentAnalysis?.analysis_data?.metadata?.anthropic_usage ?? {}).length > 0,
    [currentAnalysis]
  )

  const hasJiraSnapshot = !!(currentAnalysis?.analysis_data?.data_sources as any)?.jira_data
  const hasLinearSnapshot = !!(currentAnalysis?.analysis_data?.data_sources as any)?.linear_data
  const hasGithubSnapshot = !!(currentAnalysis?.analysis_data?.data_sources as any)?.github_data
  const hasSlackSnapshot = !!(currentAnalysis?.analysis_data?.data_sources as any)?.slack_data

  // Derive connected integrations from useDashboard data (avoids 4 duplicate API calls)
  const connectedIntegrations = useMemo(() => {
    const connected = new Set<string>()
    if (githubIntegration || hasGithubSnapshot) connected.add('github')
    if (slackIntegration || hasSlackSnapshot) connected.add('slack')
    if (jiraIntegration || hasJiraSnapshot) connected.add('jira')
    if (linearIntegration || hasLinearSnapshot) connected.add('linear')
    if (openaiUsageEnabled || hasOpenAISnapshot) connected.add('openai-usage')
    return connected
  }, [githubIntegration, slackIntegration, jiraIntegration, linearIntegration, openaiUsageEnabled, hasOpenAISnapshot, hasGithubSnapshot, hasSlackSnapshot, hasJiraSnapshot, hasLinearSnapshot])

  // GitHub All Metrics Popup State
  const [showAllMetricsPopup, setShowAllMetricsPopup] = useState(false)

  // Risk Factors All Popup State
  const [showAllRiskFactorsPopup, setShowAllRiskFactorsPopup] = useState(false)

  // Extract members array from current analysis
  const membersArray = useMemo(() => {
    if (!currentAnalysis?.analysis_data?.team_analysis) return []
    const teamAnalysis = currentAnalysis.analysis_data.team_analysis
    return Array.isArray(teamAnalysis) ? teamAnalysis : (teamAnalysis as any)?.members || []
  }, [currentAnalysis])

  // Map the hook's meta to actual Lucide icons
  const renderTrendIcon = (trend?: string) => {
    const meta = getTrendIcon(trend)
    if (meta.icon === "up") return <TrendingUp className={meta.className} />
    if (meta.icon === "down") return <TrendingDown className={meta.className} />
    return <Minus className={meta.className} />
  }

  return (
    <div className="flex flex-col h-screen w-full bg-neutral-100">
      <TopPanel />
      {!onboarding.hasSeenOnboarding && (
        <IntroGuide
          isOpen={onboarding.isOpen}
          currentStep={onboarding.currentStep}
          onNext={onboarding.nextStep}
          onPrev={onboarding.prevStep}
          onClose={onboarding.skipOnboarding}
        />
      )}
      <div className="flex flex-1 overflow-hidden">
        {/* Unified Sidebar - Works on all screen sizes */}
        <div
          ref={sidebarRef}
          className={`flex ${sidebarCollapsed ? "w-10 sm:w-12 md:w-16" : "w-60"} bg-neutral-900 text-white transition-all duration-300 flex-col overflow-hidden cursor-pointer md:cursor-default relative group md:relative`}
          style={
            mounted && !sidebarCollapsed && typeof window !== 'undefined' && window.innerWidth < 768
              ? { position: 'fixed', left: 0, top: 0, height: '100vh', zIndex: 50 }
              : {}
          }
        >
          {/* Clickable overlay for mobile */}
          {sidebarCollapsed && (
            <div
              onClick={(e) => {
                if (typeof window !== 'undefined' && window.innerWidth < 768) {
                  e.stopPropagation()
                  setSidebarCollapsed(false)
                }
              }}
              onTouchEnd={(e) => {
                if (typeof window !== 'undefined' && window.innerWidth < 768) {
                  e.stopPropagation()
                  setSidebarCollapsed(false)
                }
              }}
              className="absolute inset-0 z-10 md:hidden"
              style={{ pointerEvents: 'auto' }}
            />
          )}
        {/* Navigation */}
        <div className={`flex-1 flex flex-col min-h-0 ${sidebarCollapsed ? 'p-1 sm:p-1.5 md:p-2' : 'p-4'} space-y-2 relative z-0`}>
          {/* New Analysis Button - show when expanded, or on desktop when collapsed */}
          {sidebarCollapsed ? (
            <Button
              onClick={startAnalysis}
              disabled={analysisRunning}
              className="w-full h-10 bg-purple-700 hover:bg-purple-800 text-white hidden md:flex items-center justify-center"
            >
              <Play className="w-5 h-5" />
            </Button>
          ) : (
            <Button
              onClick={startAnalysis}
              disabled={analysisRunning}
              className="w-full justify-start bg-purple-700 hover:bg-purple-800 text-white text-base mt-2"
            >
              <Play className="w-5 h-5 mr-2" />
              New Analysis
            </Button>
          )}

          {!sidebarCollapsed ? (
            <div className="flex-1 space-y-1 min-h-0 flex flex-col overflow-y-auto scrollbar-dark">

              {/* AUTO ANALYSIS section */}
              <p className="text-xs text-neutral-500 uppercase tracking-wide px-2 py-1 mt-4 flex items-center gap-1">
                <Timer className="w-3 h-3" />
                Auto Analysis
              </p>
              {autoRefreshAnalysis ? (() => {
                const arDate = new Date(autoRefreshAnalysis.created_at)
                const arTimeStr = arDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true })
                const arDateStr = arDate.toLocaleDateString([], { month: 'short', day: 'numeric' })
                const arOrgName = sanitizeString((autoRefreshAnalysis as any).integration_name || 'Unknown')
                const arPlatform = (autoRefreshAnalysis as any).platform
                const arColor = getPlatformColor(arPlatform)
                const isArSelected = currentAnalysis?.id === autoRefreshAnalysis.id
                const isArRunning = autoRefreshAnalysis.status === 'running' || autoRefreshAnalysis.status === 'pending'
                return (
                  <div className={`relative group ${isArSelected ? 'bg-neutral-800' : ''} rounded`}>
                    <Button
                      variant="ghost"
                      disabled={analysisRunning || loadingAnalysisId !== null}
                      className={`w-full justify-start text-neutral-500 hover:text-white hover:bg-neutral-800 py-2 h-auto ${isArSelected ? 'bg-neutral-800 text-white' : ''}`}
                      onClick={async () => {
                        setLoadingAnalysisId(autoRefreshAnalysis.id)
                        try {
                          const authToken = localStorage.getItem('auth_token')
                          if (!authToken) return
                          const resp = await fetch(`${API_BASE}/analyses/${autoRefreshAnalysis.id}`, {
                            headers: { 'Authorization': `Bearer ${authToken}` }
                          })
                          if (resp.ok) {
                            const full = await resp.json()
                            setCurrentAnalysis(full)
                            setRedirectingToSuggested(false)
                            updateURLWithAnalysis(String(full.id))
                          }
                        } finally {
                          setLoadingAnalysisId(null)
                        }
                      }}
                    >
                      <div className="flex flex-col items-start w-full text-sm pr-8">
                        <div className="flex justify-between items-center w-full mb-1 gap-2">
                          <div className="flex items-center space-x-2 min-w-0">
                            {arColor !== 'bg-neutral-1000' && (
                              <div className={`w-2.5 h-2.5 rounded-full ${arColor} flex-shrink-0`}></div>
                            )}
                            <span className="font-medium truncate">{arOrgName}</span>
                          </div>
                          <span className="text-neutral-500 flex-shrink-0">{autoRefreshAnalysis.time_range || 30}d</span>
                        </div>
                        <div className="flex justify-between items-center w-full text-neutral-500">
                          <span>{arDateStr}</span>
                          <span>{arTimeStr}</span>
                        </div>
                        {isArRunning && (
                          <div className="mt-1 flex items-center gap-1 text-xs text-blue-400">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse"></span>
                            <span>Refreshing</span>
                          </div>
                        )}
                      </div>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity p-1 h-6 w-6 text-neutral-500 hover:text-red-400 hover:bg-red-900/20"
                      onClick={(e) => openDeleteDialog(autoRefreshAnalysis, e)}
                      title="Delete auto analysis"
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                )
              })() : (
                <div className="px-2 py-2 text-neutral-600 text-xs">
                  <p>No auto analysis</p>
                  <p className="mt-0.5 text-neutral-700">Enable Auto Refresh when running</p>
                </div>
              )}

              {/* SAVED section */}
              <p className="text-xs text-neutral-500 uppercase tracking-wide px-2 py-1 mt-3 flex items-center gap-1">
                <Bookmark className="w-3 h-3" />
                Saved
              </p>
              {loadingAnalyses && previousAnalyses.length === 0 ? (
                <div className="flex items-center justify-center py-4">
                  <div className="flex items-center space-x-2">
                    <div className="w-4 h-4 border-2 border-neutral-400 border-t-transparent rounded-full animate-spin"></div>
                    <span className="text-sm text-neutral-500">Loading...</span>
                  </div>
                </div>
              ) : previousAnalyses.length === 0 ? (
                <div className="text-center py-4 text-neutral-600 text-xs">
                  <p>No saved analyses yet</p>
                  <p className="mt-0.5 text-neutral-700">Save an analysis to see it here</p>
                </div>
              ) : (
                previousAnalyses.map((analysis) => {
                  const analysisDate = new Date(analysis.created_at)
                  const timeStr = analysisDate.toLocaleTimeString([], {
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true,
                    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
                  })
                  const dateStr = analysisDate.toLocaleDateString([], {
                    month: 'short',
                    day: 'numeric',
                    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
                  })
                  const rawName = (analysis as any).integration_name || 'Unknown Integration'
                  const organizationName = sanitizeString(rawName)
                  const analysisPlatform = (analysis as any).platform
                  const isSelected = currentAnalysis?.id === analysis.id
                  const platformColor = getPlatformColor(analysisPlatform)
                  return (
                    <div key={analysis.id} className={`relative group ${isSelected ? 'bg-neutral-800' : ''} rounded`}>
                      <Button
                        variant="ghost"
                        disabled={analysisRunning || loadingAnalysisId !== null}
                        className={`w-full justify-start text-neutral-500 hover:text-white hover:bg-neutral-800 py-2 h-auto ${isSelected ? 'bg-neutral-800 text-white' : ''} ${loadingAnalysisId === analysis.id ? 'bg-neutral-700 text-white' : ''} ${analysisRunning ? 'opacity-50 cursor-not-allowed' : ''}`}
                        onClick={async () => {
                          setLoadingAnalysisId(analysis.id)
                          const analysisKey = analysis.uuid || analysis.id.toString()
                          const teamAnalysis = analysis.analysis_data?.team_analysis
                          const members = Array.isArray(teamAnalysis) ? teamAnalysis : (teamAnalysis as any)?.members
                          const cachedAnalysis = analysisCache.get(analysisKey)
                          const cachedTeamAnalysis = cachedAnalysis?.analysis_data?.team_analysis
                          const cachedMembers = Array.isArray(cachedTeamAnalysis) ? cachedTeamAnalysis : (cachedTeamAnalysis as any)?.members
                          const hasCachedAnalysisData = cachedAnalysis?.analysis_data
                          const hasCachedMembers = Array.isArray(cachedMembers) && cachedMembers.length > 0

                          if (hasCachedAnalysisData && hasCachedMembers) {
                            setCurrentAnalysis(cachedAnalysis)
                            setRedirectingToSuggested(false)
                            updateURLWithAnalysis(String(cachedAnalysis.id))
                            setLoadingAnalysisId(null)
                            return
                          }

                          if (!analysis.analysis_data || !members || !Array.isArray(members) || members.length === 0) {
                            try {
                              const authToken = localStorage.getItem('auth_token')
                              if (!authToken) { setLoadingAnalysisId(null); return }
                              const response = await fetch(`${API_BASE}/analyses/${analysis.id}`, {
                                headers: { 'Authorization': `Bearer ${authToken}` }
                              })
                              if (response.ok) {
                                const fullAnalysis = await response.json()
                                setAnalysisCache(prev => new Map(prev.set(analysisKey, fullAnalysis)))
                                setCurrentAnalysis(fullAnalysis)
                                setRedirectingToSuggested(false)
                                updateURLWithAnalysis(String(fullAnalysis.id))
                              } else {
                                setRedirectingToSuggested(false)
                              }
                            } catch (error) {
                              setRedirectingToSuggested(false)
                            } finally {
                              setLoadingAnalysisId(null)
                            }
                          } else {
                            setAnalysisCache(prev => new Map(prev.set(analysisKey, analysis)))
                            setCurrentAnalysis(analysis)
                            setRedirectingToSuggested(false)
                            updateURLWithAnalysis(String(analysis.id))
                            setLoadingAnalysisId(null)
                          }
                        }}
                      >
                        <div className="flex flex-col items-start w-full text-sm pr-8">
                          <div className="flex justify-between items-center w-full mb-1 gap-2">
                            <div className="flex items-center space-x-2 min-w-0">
                              {platformColor !== 'bg-neutral-1000' && (
                                <div className={`w-2.5 h-2.5 rounded-full ${platformColor} flex-shrink-0`}></div>
                              )}
                              <span className="font-medium truncate">{organizationName}</span>
                            </div>
                            <span className="text-neutral-500 flex-shrink-0">{analysis.time_range || 30}d</span>
                          </div>
                          <div className="flex justify-between items-center w-full text-neutral-500">
                            <span>{dateStr}</span>
                            <span>{timeStr}</span>
                          </div>
                        </div>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity p-1 h-6 w-6 text-neutral-500 hover:text-red-400 hover:bg-red-900/20"
                        onClick={(e) => openDeleteDialog(analysis, e)}
                        title="Delete analysis"
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  )
                })
              )}

              {/* Load More Button */}
              {hasMoreAnalyses && (
                <div className="px-3 py-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => loadPreviousAnalyses(true)}
                    disabled={loadingMoreAnalyses || analysisRunning}
                    className="w-full border-neutral-500 bg-neutral-800 text-neutral-200 hover:bg-neutral-700 hover:text-white hover:border-neutral-400 text-sm"
                  >
                    {(loadingMoreAnalyses || (loadingAnalyses && previousAnalyses.length === 0)) ? (
                      <>
                        <div className="w-3 h-3 border border-neutral-300 border-t-transparent rounded-full animate-spin mr-2" />
                        Loading...
                      </>
                    ) : (
                      <>+ {Math.min(3, totalAnalysesCount - previousAnalyses.length)} more</>
                    )}
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center pt-2 md:hidden">
              {/* Collapsed state - show chevron arrow at top (click sidebar to expand) - mobile only */}
              <ChevronRight className="w-6 h-6 text-white" />
            </div>
          )}
        </div>

        {/* Close button for expanded mobile sidebar */}
        {!sidebarCollapsed && (
          <div className="md:hidden flex items-center justify-end p-2 bg-neutral-900">
            <button
              onClick={(e) => {
                e.stopPropagation()
                setSidebarCollapsed(true)
              }}
              className="text-white hover:text-neutral-300 transition-colors p-1"
              title="Close sidebar"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
          </div>
        )}
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto bg-neutral-200 relative">
        {/* Loading overlay when switching analyses */}
        {loadingAnalysisId !== null && (
          <div className="absolute inset-0 bg-neutral-900/50 z-50 flex items-center justify-center">
            <div className="bg-neutral-800 rounded-lg p-6 flex flex-col items-center gap-3 shadow-xl">
              <RefreshCw className="w-8 h-8 animate-spin text-white" />
              <p className="text-white font-medium">Loading analysis...</p>
            </div>
          </div>
        )}
        <div className="p-6">
          {/* Save Banner: shown when analysis is complete, unsaved, and not auto-refresh */}
          {currentAnalysis?.status === 'completed' &&
           currentAnalysis?.is_saved === false &&
           currentAnalysis?.is_auto_refresh === false && (
            <div className="mb-4 flex items-center justify-between gap-4 rounded-lg border border-violet-200 bg-violet-50 px-4 py-3">
              <div className="flex items-center gap-2 text-violet-800 text-sm">
                <Bookmark className="w-4 h-4 flex-shrink-0" />
                <span>This analysis hasn&apos;t been saved yet.</span>
              </div>
              <button
                onClick={saveCurrentAnalysis}
                className="flex-shrink-0 rounded-md bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700 transition-colors"
              >
                Save Analysis
              </button>
            </div>
          )}

          {/* Auto-Refresh Info Bar: shown when viewing an auto-refresh analysis */}
          {currentAnalysis?.is_auto_refresh === true && currentAnalysis?.status === 'completed' && !analysisRunning && (
            <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
              <div className="flex items-center gap-1.5 font-medium">
                <Timer className="w-4 h-4" />
                Auto Analysis
              </div>
              <span className="text-blue-600">|</span>
              <span>Time Range: Last {currentAnalysis.time_range || 30} days</span>
              {currentAnalysis.auto_refresh_interval && (
                <>
                  <span className="text-blue-600">|</span>
                  <span>Refreshes every {currentAnalysis.auto_refresh_interval}</span>
                </>
              )}
              {currentAnalysis.config?.auto_refresh_blocked && (
                <>
                  <span className="text-blue-600">|</span>
                  <span
                    className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700"
                    title={`${(currentAnalysis.config as any).auto_refresh_blocked?.provider || 'Integration'} ${(currentAnalysis.config as any).auto_refresh_blocked?.message || 'Token expired or removed.'}`}
                  >
                    Token expired or removed
                  </span>
                </>
              )}
              {currentAnalysis.config?.include_github || currentAnalysis.config?.include_jira || currentAnalysis.config?.include_linear ? (
                <>
                  <span className="text-blue-600">|</span>
                  <span className="flex items-center gap-1">
                    Integrations:
                    {currentAnalysis.config?.include_github && <span className="ml-1 text-xs bg-blue-100 px-1.5 py-0.5 rounded">GitHub</span>}
                    {currentAnalysis.config?.include_jira && <span className="ml-1 text-xs bg-blue-100 px-1.5 py-0.5 rounded">Jira</span>}
                    {currentAnalysis.config?.include_linear && <span className="ml-1 text-xs bg-blue-100 px-1.5 py-0.5 rounded">Linear</span>}
                  </span>
                </>
              ) : null}
              {currentAnalysis.completed_at && (
                <>
                  <span className="text-blue-600 ml-auto">|</span>
                  <span className="flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5" />
                    Last updated {formatDistanceToNow(new Date(currentAnalysis.completed_at))} ago
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={refreshCurrentAnalysis}
                      disabled={analysisRunning}
                      className="h-6 px-1.5 text-blue-700 hover:text-blue-900 hover:bg-blue-100"
                      title="Refresh analysis now"
                    >
                      <RefreshCw className={analysisRunning ? "w-3.5 h-3.5 animate-spin" : "w-3.5 h-3.5"} />
                    </Button>
                    
                  </span>
                </>
              )}
            </div>
          )}

          <AnalysisProgressSection
            analysisRunning={analysisRunning}
            analysisStage={analysisStage}
            analysisProgress={analysisProgress}
            currentAnalysis={currentAnalysis}
            shouldShowInsufficientDataCard={shouldShowInsufficientDataCard}
            hasNoIncidentsInPeriod={hasNoIncidentsInPeriod}
            getAnalysisStages={getAnalysisStages}
            cancelRunningAnalysis={cancelRunningAnalysis}
            startAnalysis={startAnalysis}
            openDeleteDialog={openDeleteDialog}
          />

          {/* Analysis Complete State - Only show if analysis has meaningful data */}
          {!shouldShowInsufficientDataCard() && !analysisRunning && currentAnalysis && (currentAnalysis.analysis_data?.team_health || currentAnalysis.analysis_data?.team_summary || currentAnalysis.analysis_data?.partial_data || currentAnalysis.analysis_data?.team_analysis) && (
            <>
              {/* Demo Analysis Banner */}
              {currentAnalysis?.config?.is_demo && (
                <div className="mb-6 p-4 bg-gradient-to-r from-amber-500 to-orange-500 rounded-lg shadow-lg">
                  <div className="flex items-center justify-between flex-wrap gap-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-white/20 rounded-full">
                        <Info className="h-5 w-5 text-white" />
                      </div>
                      <div>
                        <p className="text-white font-semibold text-lg">You&apos;re viewing sample data</p>
                        <p className="text-white/90 text-sm">
                          {integrations.some(i => i.platform === 'rootly' || i.platform === 'pagerduty')
                            ? 'Run an analysis to see real insights'
                            : 'Connect your incident management platform and run an analysis to see real insights'}
                        </p>
                      </div>
                    </div>
                    {integrations.some(i => i.platform === 'rootly' || i.platform === 'pagerduty') ? (
                      <button
                        onClick={() => setShowTimeRangeDialog(true)}
                        className="px-6 py-2.5 bg-white text-orange-600 font-semibold rounded-lg hover:bg-orange-50 transition-colors shadow-md"
                      >
                        New Analysis →
                      </button>
                    ) : (
                      <a
                        href="/integrations"
                        className="px-6 py-2.5 bg-white text-orange-600 font-semibold rounded-lg hover:bg-orange-50 transition-colors shadow-md"
                      >
                        Connect Integrations →
                      </a>
                    )}
                  </div>
                </div>
              )}

              {/* GitHub Integration Connected but No Data Warning */}
              {!currentAnalysis?.config?.is_demo &&
               connectedIntegrations.has('github') &&
               !currentAnalysis?.analysis_data?.data_sources?.github_data && (
                <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-center justify-between flex-wrap gap-4">
                    <div className="flex items-center gap-3">
                      <Info className="h-5 w-5 text-blue-600" />
                      <div>
                        <p className="text-blue-900 font-semibold">No GitHub Data Available</p>
                        <p className="text-blue-700 text-sm">
                          Sync members in the Management page to link GitHub accounts with your team.
                        </p>
                      </div>
                    </div>
                    <a
                      href="/management"
                      className="px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      Sync Members →
                    </a>
                  </div>
                </div>
              )}

              {/* Summary Cards */}
              <TeamHealthOverview
                currentAnalysis={currentAnalysis}
                historicalTrends={historicalTrends}
              />


              {/* Partial Data Warning */}
              {currentAnalysis?.analysis_data?.error && currentAnalysis?.analysis_data?.partial_data && (
                <Card className="mb-6 border-yellow-200 bg-yellow-50">
                  <CardHeader>
                    <CardTitle className="flex items-center space-x-2 text-yellow-800">
                      <AlertTriangle className="w-5 h-5" />
                      <span>Partial Data Available</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-yellow-700 mb-4">
                      Analysis processing failed, but we successfully collected raw data from Rootly:
                    </p>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="font-medium">Users collected:</span>
                        <p className="text-lg font-bold text-yellow-800">
                          {currentAnalysis.analysis_data.partial_data.users?.length || 0}
                        </p>
                      </div>
                      <div>
                        <span className="font-medium">Incidents collected:</span>
                        <p className="text-lg font-bold text-yellow-800">
                          {currentAnalysis.analysis_data.partial_data.incidents?.length || 0}
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 p-3 bg-yellow-100 rounded-lg">
                      <p className="text-xs text-yellow-600">
                        <strong>Error:</strong> {currentAnalysis.analysis_data.error}
                      </p>
                    </div>
                    <div className="mt-4 flex space-x-3">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          const partialData = {
                            analysis_id: currentAnalysis.id,
                            export_date: new Date().toISOString(),
                            data_collection_successful: currentAnalysis.analysis_data.data_collection_successful,
                            failure_stage: currentAnalysis.analysis_data.failure_stage,
                            error: currentAnalysis.analysis_data.error,
                            users: currentAnalysis.analysis_data.partial_data.users,
                            incidents: currentAnalysis.analysis_data.partial_data.incidents,
                            metadata: currentAnalysis.analysis_data.partial_data.metadata
                          }
                          
                          const blob = new Blob([JSON.stringify(partialData, null, 2)], { type: 'application/json' })
                          const url = URL.createObjectURL(blob)
                          const a = document.createElement('a')
                          a.href = url
                          a.download = `rootly-partial-data-${currentAnalysis.id}.json`
                          document.body.appendChild(a)
                          a.click()
                          document.body.removeChild(a)
                          URL.revokeObjectURL(url)
                        }}
                        className="border-yellow-300 text-yellow-700 hover:bg-yellow-100"
                      >
                        <Download className="w-4 h-4 mr-2" />
                        Export Raw Data
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Individual Risk Scores and AI Insights Grid */}
              {(() => {
                const hasAIInsights = currentAnalysis?.analysis_data?.ai_team_insights?.available;
                return (
                  <div className={`grid grid-cols-1 ${hasAIInsights ? 'lg:grid-cols-3' : 'lg:grid-cols-1'} gap-6 mb-6`}>
                    {/* Individual Risk Scores - Takes 2/3 width on large screens, full width if no AI Insights */}
                    {/* <Card className={hasAIInsights ? "lg:col-span-2" : ""}>
                      <CardHeader>
                        <CardTitle>Individual Risk Levels</CardTitle>
                        <CardDescription>Team member risk levels (higher = more risk)</CardDescription>
                      </CardHeader>
                      <CardContent>
                        {memberBarData.length > 0 ? (
                          <div className="h-[350px]">
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={memberBarData} margin={{ top: 20, right: 30, bottom: 60, left: 20 }}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis
                                  dataKey="fullName"
                                  angle={-45}
                                  textAnchor="end"
                                  height={60}
                                  interval={0}
                                  tick={{ fontSize: 11 }}
                                />
                                <YAxis domain={[0, 100]} />
                                <Tooltip
                                  formatter={(value, name, props) => {
                                    const data = props.payload;
                                    const getRiskLabel = (level: string) => {
                                      switch(level) {
                                        case 'low': return 'Low/Minimal Risk';
                                        case 'mild': return 'Mild Risk Symptoms';
                                        case 'moderate': return 'Moderate/Significant Risk';
                                        case 'high': return 'High/Severe Risk';
                                        default: return level;
                                      }
                                    };
                                    return [
                                      `${Number(value).toFixed(1)}/100`,
                                      `${data.scoreType} Score (${getRiskLabel(data.riskLevel)})`
                                    ];
                                  }}
                                  labelFormatter={(label, payload) => {
                                    const data = payload?.[0]?.payload;
                                    return data ? `${data.fullName}` : label;
                                  }}
                                  contentStyle={{
                                    backgroundColor: 'white',
                                    border: '1px solid #e5e7eb',
                                    borderRadius: '8px',
                                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                                  }}
                                />
                                <Bar
                                  dataKey="score"
                                  radius={[4, 4, 0, 0]}
                                />
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        ) : (
                          <div className="h-[350px] flex items-center justify-center text-neutral-500">
                            <div className="text-center">
                              <p className="text-lg font-medium">No incident data available</p>
                              <p className="text-sm mt-2">Members with zero incidents are not displayed in this chart</p>
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card> */}

                    {/* AI Insights Card - Takes 1/3 width on large screens */}
                    {/* {hasAIInsights && (
                      <div className="lg:col-span-1">
                        <AIInsightsCard currentAnalysis={currentAnalysis} />
                      </div>
                    )} */}
                  </div>
                );
              })()
              }
              {/* Charts Section */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                {/* Team Objective Data - Daily View */}
                <div className="lg:col-span-2">
                  <ObjectiveDataCard
                    currentAnalysis={currentAnalysis}
                    loadingTrends={loadingTrends}
                  />
                </div>
              </div>

              {/* Risk Factors Section */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                {/* Risk Factors Radar Chart */}
                {burnoutFactors.length > 0 && (
                  <TeamRiskFactorsCard
                    factorsData={burnoutFactors}
                    highRiskFactorsCount={highRiskFactors.length}
                    description={(() => {
                      const hasGitHubMembers = membersWithGitHubData.length > 0;
                      const hasIncidentMembers = membersWithIncidents.length > 0;

                      if (hasGitHubMembers && hasIncidentMembers) {
                        return `Incidents + GitHub activity for ${allActiveMembers.length} members`;
                      } else if (hasGitHubMembers && !hasIncidentMembers) {
                        return `GitHub activity for ${membersWithGitHubData.length} developers`;
                      } else if (!hasGitHubMembers && hasIncidentMembers) {
                        return `Incident data for ${membersWithIncidents.length} responders`;
                      } else {
                        return "Based on available activity data";
                      }
                    })()}
                    loadingAnalysis={loadingAnalyses}
                  />
                )}
                
                {/* Risk Factors Bar Chart - Always show if we have any factors */}
                {burnoutFactors.length > 0 && (
                  <Card className="h-fit">
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div className="space-y-1.5">
                          <CardTitle>Risk Factors</CardTitle>
                          <CardDescription>
                            Current factors affecting team health
                          </CardDescription>
                        </div>                        {/* commented out the vie affected members 
                        <button
                          onClick={() => setShowAllRiskFactorsPopup(true)}
                          className="flex items-center gap-1 text-red-600 hover:text-red-700 transition-colors text-sm font-medium whitespace-nowrap ml-4"
                        >
                          View Affected Members
                          <ArrowRight className="w-4 h-4" />
                        </button>
                      */}
                      </div>
                    </CardHeader>

                      <CardContent className="px-4 pt-0 pb-0">
                      {(() => {
                        // One source of truth for risk colors (severity preferred; fallback to value thresholds)
                        const getRiskHex = (severity?: string, value?: number) => {
                          if (severity) {
                            if (severity === 'Critical') return '#EF4444' // red-500
                            if (severity === 'Poor')     return '#F97316' // orange-500
                            if (severity === 'Fair')     return '#F59E0B' // yellow-500
                            return '#10B981'                               // green-500
                          }
                          const v = value ?? 0
                          if (v < 30) return '#10B981'
                          if (v < 50) return '#F59E0B'
                          if (v < 70) return '#F97316'
                          return '#EF4444'
                        }

                        return (
                          <div className="space-y-1.5 mb-8">
                            {sortedBurnoutFactors.map((factor) => {
                              const color = getRiskHex(factor.severity, factor.value)
                              return (
                                <div key={factor.factor} className="relative rounded-lg p-4 bg-white">
                                  <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-1.5">
                                      <span className="font-medium text-neutral-900">{factor.factor}</span>
                                      {FACTOR_DESCRIPTIONS[factor.factor] && (
                                        <InfoTooltip content={FACTOR_DESCRIPTIONS[factor.factor]} side="top" />
                                      )}
                                    </div>
                                    <span
                                      className={`px-2 py-1 rounded-full text-xs font-medium ${getSeverityBadgeClass(factor.severity)}`}
                                    >
                                      {factor.severity}
                                    </span>
                                  </div>

                                  <div
                                    className="w-full relative mb-2 cursor-default"
                                    onMouseEnter={(e) => {
                                      const tooltip = e.currentTarget.querySelector('[data-bar-tooltip]') as HTMLElement
                                      if (tooltip) tooltip.style.opacity = '1'
                                    }}
                                    onMouseLeave={(e) => {
                                      const tooltip = e.currentTarget.querySelector('[data-bar-tooltip]') as HTMLElement
                                      if (tooltip) tooltip.style.opacity = '0'
                                    }}
                                  >
                                    <div className="bg-neutral-300 rounded-full h-2">
                                      <div
                                        className="h-2 rounded-full transition-all duration-500"
                                        style={{
                                          width: `${Math.max(factor.value, 2)}%`,
                                          backgroundColor: color,
                                        }}
                                      />
                                    </div>
                                    <div
                                      data-bar-tooltip
                                      className="absolute -top-7 left-1/2 -translate-x-1/2 px-2 py-1 rounded bg-neutral-900 text-white text-xs font-medium pointer-events-none z-50 transition-opacity"
                                      style={{ opacity: 0 }}
                                    >
                                      {Math.round(factor.value)}%
                                    </div>
                                  </div>

                                  <div className="text-sm text-neutral-700">
                                    <div>{factor.metrics}</div>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        )
                      })()}
                    </CardContent>


                  </Card>
                )}
              </div>


              {/* Metrics Popups */}
              <GitHubAllMetricsPopup
                isOpen={showAllMetricsPopup}
                onClose={() => setShowAllMetricsPopup(false)}
                members={membersArray}
                onMemberClick={(member) => {
                  setSelectedMember(member)
                  setShowAllMetricsPopup(false)
                }}
              />

              <RiskFactorsAllPopup
                isOpen={showAllRiskFactorsPopup}
                onClose={() => setShowAllRiskFactorsPopup(false)}
                members={membersArray}
                onMemberClick={(member) => {
                  setSelectedMember(member)
                  setShowAllRiskFactorsPopup(false)
                }}
              />

              {/* Show Alerts cards for Rootly and PagerDuty (PagerDuty shows no-data state) */}
              {(currentAnalysis?.platform === 'rootly' || currentAnalysis?.platform === 'pagerduty') && (
                <AlertsCardsRow currentAnalysis={currentAnalysis} />
              )}

              {/* AI Coding Assistant Usage (shown when AI usage data is present in analysis) */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6 items-stretch">
                <OpenAIUsageCard currentAnalysis={currentAnalysis} enabled={openaiUsageEnabled || hasOpenAISnapshot} />
                <AnthropicUsageCard currentAnalysis={currentAnalysis} enabled={anthropicUsageEnabled || hasAnthropicSnapshot} />
              </div>

              <TeamMembersList
                currentAnalysis={currentAnalysis}
                setSelectedMember={setSelectedMember}
                connectedIntegrations={connectedIntegrations}
              />
            </>
          )}

          {/* Analysis Selected But Insufficient Data (For completed analyses with no meaningful data) */}
          {shouldShowInsufficientDataCard() && currentAnalysis.status !== 'failed' && (
            <Card className="text-center p-8 border-yellow-200 bg-yellow-50">
              <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertTriangle className="w-8 h-8 text-yellow-600" />
              </div>
              <h3 className="text-lg font-semibold mb-2 text-yellow-800">
                {hasNoIncidentsInPeriod() ? 'No Incidents in Time Period' : 'Insufficient Data'}
              </h3>
              <p className="text-yellow-700 mb-4">
                {hasNoIncidentsInPeriod()
                  ? `No incidents were found in the selected ${timeRange}-day period. Try selecting a longer time range or check if there are any incidents in your ${selectedIntegrationData?.platform || 'organization'}.`
                  : 'This analysis has insufficient data to generate meaningful insights. This could be due to lack of organization member data, incident history, or API access issues.'
                }
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Button 
                  onClick={startAnalysis} 
                  className="bg-yellow-600 hover:bg-yellow-700 text-white"
                >
                  <Play className="w-4 h-4 mr-2" />
                  Change Analysis Settings
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => {
                    if (currentAnalysis) {
                      openDeleteDialog(currentAnalysis, { stopPropagation: () => {} } as React.MouseEvent)
                    }
                  }}
                  className="border-red-300 text-red-700 hover:bg-red-100"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Cancel Analysis
                </Button>
              </div>
            </Card>
          )}

          {/* Analysis Not Found State or Auto-Redirect Loader */}
          {mounted && !analysisRunning && searchParams.get('analysis') && (redirectingToSuggested || !currentAnalysis) && (
            <Card className={`text-center p-8 ${redirectingToSuggested ? 'border-blue-200 bg-blue-50' : 'border-red-200 bg-red-50'}`}>
              {redirectingToSuggested ? (
                <>
                  <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-blue-600 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  </div>
                  <h3 className="text-xl font-semibold text-blue-900 mb-2">Redirecting to Recent Analysis</h3>
                  <p className="text-blue-700 mb-6">
                    Analysis "{searchParams.get('analysis')}" not found. Redirecting to your most recent analysis...
                  </p>
                </>
              ) : (
                <>
                  <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.728-.833-2.498 0L4.316 15.5c-.77.833.192 2.5 1.732 2.5z" />
                    </svg>
                  </div>
                  <h3 className="text-xl font-semibold text-red-900 mb-2">Analysis Not Found</h3>
                  <p className="text-red-700 mb-6">
                    The analysis with ID "{searchParams.get('analysis')}" could not be found or may have been deleted.
                  </p>
                </>
              )}
              {!redirectingToSuggested && (
                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                  <Button 
                    onClick={() => {
                      updateURLWithAnalysis(null)
                      if (previousAnalyses.length > 0) {
                        setCurrentAnalysis(previousAnalyses[0])
                        updateURLWithAnalysis(String(previousAnalyses[0].id))
                      }
                    }}
                    className="bg-red-600 hover:bg-red-700"
                  >
                    Load Most Recent Analysis
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={() => updateURLWithAnalysis(null)}
                    className="border-red-300 text-red-700 hover:bg-red-50"
                  >
                    Clear URL and Start Fresh
                  </Button>
                </div>
              )}
            </Card>
          )}

          {/* Empty State or Loading State */}
          {!analysisRunning && !currentAnalysis && !searchParams.get('analysis') && (
            <>
              {/* Show loading state while initial data hasn't settled yet, or while a subsequent reload is running */}
              {(!initialDataLoaded || loadingAnalyses) ? (
                <Card className="text-center p-8">
                  <div className="w-16 h-16 bg-neutral-200 rounded-full flex items-center justify-center mx-auto mb-4">
                    <div className="w-8 h-8 border-2 border-neutral-400 border-t-transparent rounded-full animate-spin"></div>
                  </div>
                  <h3 className="text-lg font-semibold mb-2">Loading Your Analyses</h3>
                  <p className="text-neutral-700 mb-4">
                    We're checking for your previous analyses...
                  </p>
                </Card>
              ) : (
                <>
                  {/* Show setup required ONLY if we definitely have no integrations (not during loading) */}
                  {integrations.length === 0 && !loadingIntegrations && !hasDataFromCache ? (
                <Card className="text-center p-8">
                  <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Settings className="w-8 h-8 text-blue-600" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">Setup Required</h3>
                  <p className="text-neutral-700 mb-4">
                    Connect your first integration to start analyzing metrics. Both Rootly and PagerDuty are supported.
                  </p>
                  <Button onClick={() => router.push('/integrations')} className="bg-blue-600 hover:bg-blue-700">
                    <Settings className="w-4 h-4 mr-2" />
                    Setup Integrations
                  </Button>
                </Card>
              ) : (
                <>
                  {/* Check for missing platforms */}
                  {(() => {
                    const hasRootly = integrations.some(i => i.platform === 'rootly')
                    
                    if (!hasRootly) {
                      return (
                        <div className="space-y-4 mb-6">
                          {!hasRootly && (
                            <Alert className="border-purple-200 bg-purple-50">
                              <Info className="w-4 h-4 text-purple-700" />
                              <AlertDescription className="text-purple-800">
                                <div className="flex items-center justify-between">
                                  <div>
                                    <strong>Rootly Integration Available</strong>
                                    <span className="block text-sm mt-1">
                                      Connect Rootly for comprehensive incident management and team analysis.
                                    </span>
                                  </div>
                                  <Button 
                                    size="sm" 
                                    onClick={() => router.push('/integrations')} 
                                    className="bg-purple-700 hover:bg-purple-800 ml-4"
                                  >
                                    Setup Rootly
                                  </Button>
                                </div>
                              </AlertDescription>
                            </Alert>
                          )}
                        </div>
                      )
                    }
                    return null
                  })()}
                  
                  {/* Standard empty state */}
                  <Card className="text-center p-8">
                    <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Activity className="w-8 h-8 text-purple-700" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">No Analysis Yet</h3>
                    <p className="text-neutral-700 mb-4">
                      Click "New Analysis" to start analyzing your organization's metrics
                    </p>
                    <Button onClick={startAnalysis} className="bg-purple-700 hover:bg-purple-800">
                      <Play className="w-4 h-4 mr-2" />
                      New Analysis
                    </Button>
                  </Card>
                </>
              )}
                </>
              )}
            </>
          )}

          {/* Export Button and Footer */}
          {!shouldShowInsufficientDataCard() && currentAnalysis && currentAnalysis.analysis_data && !analysisRunning && (
            <div className="flex justify-end mt-6">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    className="flex items-center space-x-2 border-neutral-300 hover:bg-neutral-100"
                    title="Export analysis data"
                  >
                    <Download className="w-5 h-5" />
                    <span>Export</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem onClick={exportAsJSON} className="flex items-center space-x-2">
                    <Download className="w-5 h-5" />
                    <div className="flex flex-col">
                      <span className="font-medium text-base">Export as JSON</span>
                      <span className="text-sm text-neutral-500">Complete analysis data</span>
                    </div>
                  </DropdownMenuItem>
                  <DropdownMenuItem disabled className="flex items-center space-x-2 opacity-50">
                    <Download className="w-5 h-5" />
                    <div className="flex flex-col">
                      <span className="font-medium text-base">Export as CSV</span>
                      <span className="text-sm text-neutral-500">Organization member scores</span>
                    </div>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem disabled className="flex items-center space-x-2 opacity-50">
                    <FileText className="w-5 h-5" />
                    <div className="flex flex-col">
                      <span className="font-medium text-base">Generate PDF Report</span>
                      <span className="text-sm text-neutral-500">Executive summary</span>
                    </div>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}

          {/* Powered by Rootly AI Footer */}
          <div className="mt-12 pt-8 border-t border-neutral-200 text-center">
            <a
              href="https://rootly.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex flex-col items-center space-y-1 hover:opacity-80 transition-opacity"
            >
              <span className="text-lg text-neutral-700">powered by</span>
              <Image
                src="/images/rootly-ai-logo.png"
                alt="Rootly AI"
                width={200}
                height={80}
                className="h-12 w-auto"
              />
            </a>
          </div>
        </div>
      </div>

      {/* Time Range Selection Dialog */}
      <Dialog open={showTimeRangeDialog} onOpenChange={setShowTimeRangeDialog}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Start New Analysis</DialogTitle>
          </DialogHeader>

          {/* No Integrations State */}
          {noIntegrationsFound ? (
            <div className="space-y-4">
              <Alert className="border-red-200 bg-red-50">
                <AlertCircle className="w-4 h-4 text-red-600" />
                <AlertDescription className="text-red-800">
                  <strong>No Primary Integrations Connected</strong>
                  <span className="block mt-2">
                    To start an analysis, you need to connect at least one primary integration (Rootly or PagerDuty).
                  </span>
                </AlertDescription>
              </Alert>

              <button
                onClick={() => {
                  setShowTimeRangeDialog(false)
                  setNoIntegrationsFound(false)
                  router.push('/integrations')
                }}
                className="w-full px-4 py-2 bg-purple-700 text-white rounded-lg font-medium hover:bg-purple-800 transition-colors"
              >
                Go to Integrations
              </button>
            </div>
          ) : (
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-neutral-700 mb-2 block">
                Organization
              </label>
              <div className="p-3 bg-neutral-100 rounded-md border border-neutral-200">
                {(() => {
                  const selected = integrations.find(i => i.id.toString() === dialogSelectedIntegration)
                  if (selected) {
                    const organizationName = selected.name
                    
                    // Use platform field from backend (not inferred from name)
                    let platformColor = 'bg-neutral-1000' // default
                    if (selected.platform === 'rootly') {
                      platformColor = 'bg-purple-500'  // Rootly = Purple
                    } else if (selected.platform === 'pagerduty') {
                      platformColor = 'bg-green-500'   // PagerDuty = Green
                    }
                    // For beta integrations, fallback to ID-based detection
                    else if (String(selected.id) === 'beta-rootly') {
                      platformColor = 'bg-purple-500'  // Rootly = Purple
                    } else if (String(selected.id) === 'beta-pagerduty') {
                      platformColor = 'bg-green-500'   // PagerDuty = Green
                    }
                    
                    return (
                      <div>
                        <div className="flex items-center">
                          <div className={`w-2 h-2 rounded-full mr-2 ${platformColor}`}></div>
                          <div className="min-w-0">
                            <span className="font-medium block truncate">{organizationName}</span>
                            {selected.platform === 'rootly' && selected.team_name && (
                              <span className="mt-1 inline-flex px-1.5 py-0.5 text-xs font-medium rounded bg-purple-100 text-purple-700">
                                Team scope: {selected.team_name}
                              </span>
                            )}
                          </div>
                          <Star className="w-4 h-4 text-yellow-500 fill-yellow-500 ml-auto" />
                        </div>
                        <button 
                          onClick={() => {
                            setShowTimeRangeDialog(false)
                            router.push('/integrations')
                          }}
                          className="text-xs text-blue-600 hover:text-blue-800 hover:underline mt-1 block"
                        >
                          Manage integrations
                        </button>
                      </div>
                    )
                  }
                  return <span className="text-neutral-500">No organization selected</span>
                })()}
              </div>
            </div>

            {/* Team Members Info */}
            {dialogSelectedIntegration && (() => {
              const selectedIntegration = integrations.find(i => i.id.toString() === dialogSelectedIntegration);
              const syncedCount = selectedIntegration?.total_users || 0;

              if (syncedCount === 0) {
                return (
                  <Alert className="border-amber-200 bg-amber-50 py-2 px-3">
                    <AlertCircle className="w-4 h-4 text-amber-600" />
                    <AlertDescription className="text-amber-800 text-sm">
                      <strong>No team members synced</strong>
                      <span className="block mt-1">
                        Visit the integrations page to sync your team members for analysis.
                      </span>
                      <button
                        onClick={() => {
                          setShowTimeRangeDialog(false)
                          router.push('/integrations')
                        }}
                        className="text-xs text-amber-700 hover:text-amber-900 font-medium underline mt-1 inline-block"
                      >
                        Go to integrations →
                      </button>
                    </AlertDescription>
                  </Alert>
                );
              }

              return (
                <div className="p-3 bg-neutral-100 rounded-md border border-neutral-200">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Users className="w-4 h-4 text-neutral-500" />
                      <span className="text-sm font-medium text-neutral-700">
                        {syncedCount} team {syncedCount === 1 ? 'member' : 'members'} synced
                      </span>
                    </div>
                    <button
                      onClick={() => {
                        setShowTimeRangeDialog(false)
                        router.push('/integrations')
                      }}
                      className="text-xs text-blue-600 hover:text-blue-800 hover:underline"
                    >
                      Manage team
                    </button>
                  </div>
                  <p className="text-xs text-neutral-500 mt-1">
                    Sync team members if there are changes to your organization
                  </p>
                </div>
              );
            })()}

            {/* Permission Error Alert - Only for Rootly */}
            {dialogSelectedIntegration && (() => {
              const selectedIntegration = integrations.find(i => i.id.toString() === dialogSelectedIntegration);

              // Only check permissions for Rootly integrations, not PagerDuty
              if (selectedIntegration?.platform === 'rootly') {
                // Check if permissions have been loaded (undefined = not loaded yet, null = checking, false/true = loaded)
                const permissionsLoaded = selectedIntegration?.permissions !== undefined;
                const hasUserPermission = selectedIntegration?.permissions?.users?.access;
                const hasIncidentPermission = selectedIntegration?.permissions?.incidents?.access;

                // Show loader if permissions haven't been loaded yet OR if they're explicitly null (being checked)
                const isCheckingPermissions = hasUserPermission === null || hasIncidentPermission === null;
                if (!permissionsLoaded || loadingIntegrations || isCheckingPermissions) {
                  return (
                    <Alert className="border-blue-200 bg-blue-50 py-2 px-3">
                      <div className="flex items-center gap-2">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                        <AlertDescription className="text-blue-800 text-sm">
                          Checking permissions...
                        </AlertDescription>
                      </div>
                    </Alert>
                  );
                }

                // Show error only if permissions are loaded but missing
                if (!hasUserPermission || !hasIncidentPermission) {
                  return (
                    <Alert className="border-red-200 bg-red-50 py-2 px-3">
                      <AlertCircle className="w-4 h-4 text-red-600" />
                      <AlertDescription className="text-red-800 text-sm">
                        <strong>Missing Required Permissions</strong>
                        <span className="block mt-1">
                          {!hasUserPermission && !hasIncidentPermission
                            ? "User and incident read access required"
                            : !hasUserPermission
                            ? "User read access required"
                            : "Incident read access required"}
                        </span>
                        <span className="text-xs opacity-75">Update API token permissions in Rootly settings</span>
                      </AlertDescription>
                    </Alert>
                  );
                }
              }
              return null;
            })()}

            {/* Data Sources */}
            {true && (
              <div>
                <label className="text-sm font-medium text-neutral-700 mb-2 block">
                  Additional Data Sources
                </label>
                {isLoadingGitHubSlack ? (
                  <div className="flex items-center justify-center py-6">
                    <Loader2 className="w-5 h-5 animate-spin text-neutral-400" />
                  </div>
                ) : (
                <div className="grid grid-cols-2 gap-3">
                  {/* GitHub Toggle Card */}
                  {connectedIntegrations.has('github') && (
                    <div className={`border rounded-lg p-3 transition-all ${includeGithub && githubIntegration ? 'border-neutral-900 bg-neutral-100' : 'border-neutral-200 bg-white'}`}>
                      {/* Always show GitHub content immediately, no skeleton loader */}
                      {(
                        <>
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex items-center space-x-2">
                              <div className="w-6 h-6 bg-neutral-900 rounded flex items-center justify-center">
                                <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M10 0C4.477 0 0 4.484 0 10.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0110 4.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.203 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.942.359.31.678.921.678 1.856 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0020 10.017C20 4.484 15.522 0 10 0z" clipRule="evenodd" />
                                </svg>
                              </div>
                              <div>
                                <h3 className="text-sm font-medium text-neutral-900">GitHub</h3>
                              </div>
                            </div>
                            <Switch
                              checked={includeGithub && !!githubIntegration}
                              onCheckedChange={(checked) => {
                                if (!githubIntegration) {
                                  toast.error(
                                    <span>
                                      GitHub not connected - please connect on <a href="/integrations" className="underline font-medium hover:text-red-800">integrations page</a>
                                    </span>
                                  )
                                } else {
                                  setIncludeGithub(checked)
                                }
                              }}
                              disabled={false}
                            />
                          </div>
                          <p className="text-xs text-neutral-700 mb-1">Code patterns & activity</p>
                          <p className="text-xs text-neutral-500">{githubIntegration?.github_username || 'Not connected'}</p>
                        </>
                      )}
                    </div>
                  )}

                  {/* Slack Toggle Card */}
                  {true && (
                    <div className="border rounded-lg p-3 transition-all border-neutral-200 bg-neutral-50 opacity-60 cursor-not-allowed">
                      <>
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center space-x-2">
                            <div className="w-6 h-6 rounded flex items-center justify-center opacity-50">
                              <svg className="w-6 h-6" viewBox="0 0 124 124" fill="none">
                                <path d="M26.3996 78.2003C26.3996 84.7003 21.2996 89.8003 14.7996 89.8003C8.29961 89.8003 3.19961 84.7003 3.19961 78.2003C3.19961 71.7003 8.29961 66.6003 14.7996 66.6003H26.3996V78.2003Z" fill="#E01E5A"/>
                                <path d="M32.2996 78.2003C32.2996 71.7003 37.3996 66.6003 43.8996 66.6003C50.3996 66.6003 55.4996 71.7003 55.4996 78.2003V109.2C55.4996 115.7 50.3996 120.8 43.8996 120.8C37.3996 120.8 32.2996 115.7 32.2996 109.2V78.2003Z" fill="#E01E5A"/>
                                <path d="M43.8996 26.4003C37.3996 26.4003 32.2996 21.3003 32.2996 14.8003C32.2996 8.30026 37.3996 3.20026 43.8996 3.20026C50.3996 3.20026 55.4996 8.30026 55.4996 14.8003V26.4003H43.8996Z" fill="#36C5F0"/>
                                <path d="M43.8996 32.3003C50.3996 32.3003 55.4996 37.4003 55.4996 43.9003C55.4996 50.4003 50.3996 55.5003 43.8996 55.5003H12.8996C6.39961 55.5003 1.29961 50.4003 1.29961 43.9003C1.29961 37.4003 6.39961 32.3003 12.8996 32.3003H43.8996Z" fill="#36C5F0"/>
                                <path d="M95.5996 43.9003C95.5996 37.4003 100.7 32.3003 107.2 32.3003C113.7 32.3003 118.8 37.4003 118.8 43.9003C118.8 50.4003 113.7 55.5003 107.2 55.5003H95.5996V43.9003Z" fill="#2EB67D"/>
                                <path d="M89.6996 43.9003C89.6996 50.4003 84.5996 55.5003 78.0996 55.5003C71.5996 55.5003 66.4996 50.4003 66.4996 43.9003V12.9003C66.4996 6.40026 71.5996 1.30026 78.0996 1.30026C84.5996 1.30026 89.6996 6.40026 89.6996 12.9003V43.9003Z" fill="#2EB67D"/>
                                <path d="M78.0996 95.6003C84.5996 95.6003 89.6996 100.7 89.6996 107.2C89.6996 113.7 84.5996 118.8 78.0996 118.8C71.5996 118.8 66.4996 113.7 66.4996 107.2V95.6003H78.0996Z" fill="#ECB22E"/>
                                <path d="M78.0996 89.7003C71.5996 89.7003 66.4996 84.6003 66.4996 78.1003C66.4996 71.6003 71.5996 66.5003 78.0996 66.5003H109.1C115.6 66.5003 120.7 71.6003 120.7 78.1003C120.7 84.6003 115.6 89.7003 109.1 89.7003H78.0996Z" fill="#ECB22E"/>
                              </svg>
                            </div>
                            <div>
                              <h3 className="text-sm font-medium text-neutral-500">Slack</h3>
                            </div>
                          </div>
                          <Switch
                            checked={false}
                            disabled={true}
                          />
                        </div>
                        <p className="text-xs text-neutral-500 mb-1">Sentiment analysis</p>
                        <Badge className="bg-purple-100 text-purple-700 border-purple-300 text-xs font-semibold">
                          Coming Soon
                        </Badge>
                      </>
                    </div>
                  )}

                  {/* Jira Toggle Card */}
                  {connectedIntegrations.has('jira') && (
                    <div className={`border rounded-lg p-3 transition-all ${includeJira && jiraIntegration ? 'border-blue-500 bg-blue-50' : 'border-neutral-200 bg-white'}`}>
                      {/* Always show Jira content immediately, no skeleton loader */}
                      {(
                        <>
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex items-center space-x-2">
                              <div className="w-6 h-6 bg-blue-600 rounded flex items-center justify-center">
                                <svg
                                  viewBox="0 0 24 24"
                                  className="w-4 h-4 text-white"
                                  fill="currentColor"
                                >
                                  <path d="M11.571 11.513H0a5.218 5.218 0 0 0 5.232 5.215h2.13v2.057A5.215 5.215 0 0 0 12.575 24V12.518a1.005 1.005 0 0 0-1.005-1.005zm5.723-5.756H5.736a5.215 5.215 0 0 0 5.215 5.214h2.129v2.058a5.218 5.218 0 0 0 5.215 5.232V6.758a1.001 1.001 0 0 0-1.001-1.001zM23.013 0H11.455a5.215 5.215 0 0 0 5.215 5.215h2.129v2.057A5.215 5.215 0 0 0 24 12.483V1.005A1.001 1.001 0 0 0 23.013 0Z"/>
                                </svg>
                              </div>
                              <div>
                                <h3 className="text-sm font-medium text-neutral-900">Jira</h3>
                              </div>
                            </div>
                            <Switch
                              checked={includeJira && !!jiraIntegration}
                              onCheckedChange={(checked) => {
                                if (!jiraIntegration) {
                                  toast.error(
                                    <span>
                                      Jira not connected - please connect on <a href="/integrations" className="underline font-medium hover:text-red-800">integrations page</a>
                                    </span>
                                  )
                                } else {
                                  setIncludeJira(checked)
                                }
                              }}
                              disabled={false}
                            />
                          </div>
                          <p className="text-xs text-neutral-700 mb-1">Issue tracking</p>
                        </>
                      )}
                    </div>
                  )}

                  {/* Linear Toggle Card */}
                  {connectedIntegrations.has('linear') && (
                    <div className={`border rounded-lg p-3 transition-all ${includeLinear && linearIntegration ? 'border-purple-500 bg-purple-50' : 'border-neutral-200 bg-white'}`}>
                      {(
                        <>
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex items-center space-x-2">
                              <Image src="/images/linear-logo.png" alt="Linear" width={24} height={24} className="rounded" />
                              <div>
                                <h3 className="text-sm font-medium text-neutral-900">Linear</h3>
                              </div>
                            </div>
                            <Switch
                              checked={includeLinear && !!linearIntegration}
                              onCheckedChange={(checked) => {
                                if (!linearIntegration) {
                                  toast.error("Linear not connected - please connect on integrations page")
                                } else {
                                  setIncludeLinear(checked)
                                }
                              }}
                              disabled={false}
                            />
                          </div>
                          <p className="text-xs text-neutral-700 mb-1">Issue tracking</p>
                        </>
                      )}
                    </div>
                  )}

                  {/* OpenAI Usage Toggle Card */}
                  {openaiUsageEnabled && (
                    <div className={`border rounded-lg p-3 transition-all cursor-pointer ${includeAIUsage ? 'border-neutral-900 bg-neutral-100' : 'border-neutral-200 bg-white'}`}
                      onClick={() => setIncludeAIUsage(!includeAIUsage)}>
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center space-x-2">
                          <Image src="/images/openai-logo.svg" alt="OpenAI" width={24} height={24} className="w-6 h-6" />
                          <div>
                            <h3 className="text-sm font-medium text-neutral-900">OpenAI</h3>
                          </div>
                        </div>
                        <Switch
                          checked={includeAIUsage}
                          onCheckedChange={setIncludeAIUsage}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>
                      <p className="text-xs text-neutral-700 mb-1">Token consumption</p>
                    </div>
                  )}

                  {/* Anthropic Usage Toggle Card */}
                  {anthropicUsageEnabled && (
                    <div className={`border rounded-lg p-3 transition-all cursor-pointer ${includeAIUsage ? 'border-neutral-900 bg-neutral-100' : 'border-neutral-200 bg-white'}`}
                      onClick={() => setIncludeAIUsage(!includeAIUsage)}>
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center space-x-2">
                          <Image src="/images/anthropic-logo.svg" alt="Anthropic" width={24} height={24} className="w-6 h-6" />
                          <div>
                            <h3 className="text-sm font-medium text-neutral-900">Anthropic</h3>
                          </div>
                        </div>
                        <Switch
                          checked={includeAIUsage}
                          onCheckedChange={setIncludeAIUsage}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>
                      <p className="text-xs text-neutral-700 mb-1">Token consumption</p>
                    </div>
                  )}
                </div>
                )}
              </div>
            )}

            {/* AI Insights Toggle */}
            <div>
              <label className="text-sm font-medium text-neutral-700 mb-2 block">
                AI Insights
              </label>
              <div className={`border rounded-lg p-4 transition-all ${enableAI ? 'border-blue-500 bg-blue-50' : 'border-neutral-200 bg-white'} ${!llmConfig?.has_token ? 'opacity-60' : ''}`}>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center space-x-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${llmConfig?.has_token ? 'bg-blue-100' : 'bg-neutral-100'}`}>
                      <div className={`w-5 h-5 ${llmConfig?.has_token ? 'text-blue-600' : 'text-neutral-400'}`}>🤖</div>
                    </div>
                    <div>
                      <h3 className="text-sm font-medium text-neutral-900">Executive Summary</h3>
                      <p className="text-xs text-neutral-700">Analyze the data and generates a report</p>
                    </div>
                  </div>
                  <Switch
                    checked={enableAI}
                    onCheckedChange={setEnableAI}
                    disabled={!llmConfig?.has_token}
                  />
                </div>

                <div className="space-y-2">
                  {llmConfig?.has_token ? (
                    <div className="flex items-center space-x-2">
                      <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                      <span className="text-xs font-medium text-green-700">
                        Anthropic Claude Connected
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center space-x-2">
                      <div className="w-2 h-2 bg-neutral-400 rounded-full"></div>
                      <span className="text-xs font-medium text-neutral-500">
                        Enable AI Insights in Integrations first
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
            
            <div className="space-y-3">
              <label className="text-sm font-medium text-neutral-700 mb-2 block">
                Analysis Time Range
              </label>

              {/* Preset Time Range Selector */}
              <Select
                value={isCustomRange ? "custom" : selectedTimeRange}
                onValueChange={(value) => {
                  if (value === "custom") {
                    setIsCustomRange(true)
                    // Set default to 30 days ago as starting point
                    const defaultDate = new Date()
                    defaultDate.setDate(defaultDate.getDate() - 30)
                    setCustomStartDate(defaultDate)
                    setAutoRefreshEnabled(false)
                  } else {
                    setIsCustomRange(false)
                    setSelectedTimeRange(value)
                    if (value !== "30" && value !== "90") {
                      setAutoRefreshEnabled(false)
                    }
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">Last 7 days</SelectItem>
                  <SelectItem value="30">Last 30 days</SelectItem>
                  <SelectItem value="90">Last 90 days</SelectItem>
                  <SelectItem value="custom">Custom Range</SelectItem>
                </SelectContent>
              </Select>

              {/* Custom Date Picker (shown when "Custom Range" is selected) */}
              {isCustomRange && (
                <div className="space-y-2">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !customStartDate && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {customStartDate ? (
                          format(customStartDate, "PPP")
                        ) : (
                          <span>Pick a start date</span>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="range"
                        selected={{
                          from: customStartDate,
                          to: new Date()
                        }}
                        onSelect={(range) => {
                          if (range?.from) {
                            setCustomStartDate(range.from)
                          }
                        }}
                        disabled={(date) => {
                          const today = new Date()
                          const oneYearAgo = new Date()
                          oneYearAgo.setFullYear(today.getFullYear() - 1)

                          // Disable future dates and dates older than 1 year
                          return date > today || date < oneYearAgo
                        }}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>

                  {/* Date Range Display and Validation */}
                  {customStartDate && (() => {
                    const validation = validateCustomDate(customStartDate)
                    return (
                      <div className="text-sm">
                        {validation.valid ? (
                          <p className="text-neutral-700 flex items-center gap-2">
                            <Info className="h-4 w-4" />
                            Analyzing {validation.days} days (from {format(customStartDate, "MMM d, yyyy")} to today)
                          </p>
                        ) : (
                          <p className="text-red-600 flex items-center gap-2">
                            <AlertCircle className="h-4 w-4" />
                            {validation.error}
                          </p>
                        )}
                      </div>
                    )
                  })()}
                </div>
              )}
            </div>

            {/* Auto Refresh Section */}
            {(() => {
              const autoRefreshAvailable = selectedTimeRange === "30" || selectedTimeRange === "90"
              return (
                <div className="space-y-2">
                  {/* Header row */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <RefreshCw className="w-4 h-4 text-neutral-600" />
                      <span className="text-sm font-medium text-neutral-700">Auto Refresh</span>
                      <Popover>
                        <PopoverTrigger asChild>
                          <button className="text-neutral-400 hover:text-neutral-600 transition-colors">
                            <Info className="w-3.5 h-3.5" />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-64 text-sm text-neutral-700 p-3" side="top" align="start">
                          Auto Refresh is available for Last 30 days or Last 90 days time ranges. Once enabled, select how often you want the analysis to automatically re-run.
                        </PopoverContent>
                      </Popover>
                    </div>
                    <Switch
                      checked={autoRefreshEnabled}
                      onCheckedChange={(checked) => {
                        if (autoRefreshAvailable) {
                          setAutoRefreshEnabled(checked)
                        }
                      }}
                      disabled={!autoRefreshAvailable}
                    />
                  </div>

                  {/* Body box */}
                  <div className={`rounded-md border p-3 space-y-2 transition-colors ${
                    autoRefreshEnabled
                      ? "border-purple-300 bg-purple-50"
                      : "border-neutral-200 bg-neutral-50"
                  }`}>
                    <p className={`text-xs ${autoRefreshEnabled ? "text-purple-700" : "text-neutral-400"}`}>
                      {autoRefreshEnabled
                        ? "Analysis will automatically refresh at the selected interval"
                        : "Enable to automatically re-run analysis on a schedule"}
                    </p>
                    <Select
                      value={autoRefreshInterval}
                      onValueChange={setAutoRefreshInterval}
                      disabled={!autoRefreshEnabled}
                    >
                      <SelectTrigger className={`bg-white ${!autoRefreshEnabled ? "opacity-50" : ""}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="24h">Every 24 hours</SelectItem>
                        <SelectItem value="7d">Every 7 days</SelectItem>
                      </SelectContent>
                    </Select>
                    {autoRefreshEnabled && (
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-green-500" />
                        <span className="text-xs font-medium text-green-700">Auto refresh enabled</span>
                      </div>
                    )}
                  </div>
                </div>
              )
            })()}

            <div className="flex justify-end space-x-2 pt-4">
              <Button variant="outline" onClick={() => setShowTimeRangeDialog(false)}>
                Cancel
              </Button>
              <Button
                onClick={runAnalysisWithTimeRange}
                className="bg-purple-700 hover:bg-purple-800"
                disabled={isRunAnalysisDisabled()}
              >
                <>
                  <Play className="w-4 h-4 mr-2" />
                  Start Analysis
                </>
              </Button>
            </div>
          </div>
          )}
        </DialogContent>
      </Dialog>

      <MemberDetailModal
        selectedMember={selectedMember}
        setSelectedMember={setSelectedMember}
        members={members}
        analysisId={currentAnalysis?.id || currentAnalysis?.uuid}
        currentAnalysis={currentAnalysis}
        timeRange={currentAnalysis?.time_range || timeRange}
        integrations={integrations}
        openaiUsageEnabled={openaiUsageEnabled || hasOpenAISnapshot}
      />

      {/* Delete Analysis Dialog */}
      <DeleteAnalysisDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        analysisToDelete={analysisToDelete}
        integrations={integrations}
        onConfirmDelete={confirmDeleteAnalysis}
        isDeleting={deletingAnalysis}
        onCancel={() => {
          setDeleteDialogOpen(false)
          setAnalysisToDelete(null)
        }}
      />

      {/* Mapping Drawer */}
      <MappingDrawer
        isOpen={mappingDrawerOpen}
        onClose={() => setMappingDrawerOpen(false)}
        platform={mappingDrawerPlatform}
        onRefresh={fetchPlatformMappings}
      />
      </div>
    </div>
  )
}

export default function Dashboard() {
  return (
    <Suspense fallback={
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-neutral-900 mx-auto"></div>
          <p className="mt-4 text-neutral-700">Loading dashboard...</p>
        </div>
      </div>
    }>
      <DashboardContent />
    </Suspense>
  )
}
