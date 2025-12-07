"use client"

import { Suspense } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { MappingDrawer } from "@/components/mapping-drawer"
import { Separator } from "@/components/ui/separator"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Bar,
  BarChart,
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from "recharts"
import {
  Activity,
  ChevronLeft,
  ChevronRight,
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
  LogOut,
  BookOpen,
  Users,
  Star,
  Info,
  BarChart3,
} from "lucide-react"
import { TeamHealthOverview } from "@/components/dashboard/TeamHealthOverview"
import { AnalysisProgressSection } from "@/components/dashboard/AnalysisProgressSection"
import { TeamMembersList } from "@/components/dashboard/TeamMembersList"
import { HealthTrendsChart } from "@/components/dashboard/HealthTrendsChart"
import { MemberDetailModal } from "@/components/dashboard/MemberDetailModal"
import { GitHubCommitsTimeline } from "@/components/dashboard/charts/GitHubCommitsTimeline"
import { AIInsightsCard } from "@/components/dashboard/insights/AIInsightsCard"
import { DeleteAnalysisDialog } from "@/components/dashboard/dialogs/DeleteAnalysisDialog"
import Image from "next/image"
import useDashboard from "@/hooks/useDashboard"
import { TopPanel } from "@/components/TopPanel"
import { useOnboarding } from "@/hooks/useOnboarding"
import IntroGuide from "@/components/IntroGuide"

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
  jiraIntegration,
  includeGithub,
  setIncludeGithub,
  includeSlack,
  setIncludeSlack,
  includeJira,
  setIncludeJira,
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
  hasNoIncidentsInPeriod,
  updateURLWithAnalysis,

  // start-analysis modal
  showTimeRangeDialog,
  setShowTimeRangeDialog,
  selectedTimeRange,
  setSelectedTimeRange,
  dialogSelectedIntegration,
  setDialogSelectedIntegration,
  noIntegrationsFound,
  setNoIntegrationsFound,

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

  // Get userId from localStorage for user-specific onboarding tracking
  const userId = typeof window !== 'undefined' ? localStorage.getItem("user_id") : null
  const onboarding = useOnboarding(userId)

  // Map the hook's meta to actual Lucide icons
  const renderTrendIcon = (trend?: string) => {
    const meta = getTrendIcon(trend)
    if (meta.icon === "up") return <TrendingUp className={meta.className} />
    if (meta.icon === "down") return <TrendingDown className={meta.className} />
    return <Minus className={meta.className} />
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50">
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
        {/* Sidebar */}
        <div
          className={`${sidebarCollapsed ? "w-16" : "w-60"} bg-gray-900 text-white transition-all duration-300 flex flex-col`}
        >
        {/* Header */}
        <div className="relative h-12">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className={`text-gray-400 hover:text-white hover:bg-gray-800 absolute top-2 ${sidebarCollapsed ? 'left-2' : 'right-2'}`}
          >
            {sidebarCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </Button>
        </div>

        {/* Navigation */}
        <div className={`flex-1 flex flex-col ${sidebarCollapsed ? 'p-2' : 'p-4'} space-y-2`}>
          {!sidebarCollapsed ? (
            <div className="flex-1 space-y-2">
              <Button
                onClick={startAnalysis}
                disabled={analysisRunning}
                className="w-full justify-start bg-purple-600 hover:bg-purple-700 text-white text-base"
              >
                <Play className="w-5 h-5 mr-2" />
                New Analysis
              </Button>

            <div className="space-y-1">
              {!sidebarCollapsed && previousAnalyses.length > 0 && (
                <p className="text-sm text-gray-400 uppercase tracking-wide px-2 py-1 mt-4">Recent</p>
              )}
              <div className="max-h-96 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-800 relative">
                {loadingAnalyses && previousAnalyses.length === 0 ? (
                  // Show loading state for analyses
                  <div className="flex items-center justify-center py-8">
                    <div className="flex items-center space-x-2">
                      <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></div>
                      {!sidebarCollapsed && (
                        <span className="text-sm text-gray-400">Loading analyses...</span>
                      )}
                    </div>
                  </div>
                ) : previousAnalyses.length === 0 ? (
                  // Show empty state
                  !sidebarCollapsed && (
                    <div className="text-center py-8 text-gray-400">
                      <p className="text-sm">No analyses yet</p>
                      <p className="text-sm mt-1">Start your first analysis above</p>
                    </div>
                  )
                ) : (
                  // Show analyses list
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
                
                // SIMPLE: Use integration name and platform stored directly with analysis
                const organizationName = (analysis as any).integration_name || 'Unknown Integration'
                const analysisPlatform = (analysis as any).platform
                const isSelected = currentAnalysis?.id === analysis.id
                
                // Use stored platform data for colors
                let platformColor = 'bg-gray-500' // default for unknown
                if (analysisPlatform === 'rootly') {
                  platformColor = 'bg-purple-500'  // Rootly = Purple
                } else if (analysisPlatform === 'pagerduty') {
                  platformColor = 'bg-green-500'   // PagerDuty = Green
                }
                return (
                  <div key={analysis.id} className={`relative group ${isSelected ? 'bg-gray-800' : ''} rounded`}>
                    <Button
                      variant="ghost"
                      disabled={analysisRunning}
                      className={`w-full justify-start text-gray-300 hover:text-white hover:bg-gray-800 py-2 h-auto ${isSelected ? 'bg-gray-800 text-white' : ''} ${analysisRunning ? 'opacity-50 cursor-not-allowed' : ''}`}
                      onClick={async () => {
                        const analysisKey = analysis.uuid || analysis.id.toString()

                        // Get members array - handle both object and array formats
                        const teamAnalysis = analysis.analysis_data?.team_analysis
                        const members = Array.isArray(teamAnalysis) ? teamAnalysis : (teamAnalysis as any)?.members

                        // Check cache first - but only use if it has full analysis data with members
                        const cachedAnalysis = analysisCache.get(analysisKey)
                        const cachedTeamAnalysis = cachedAnalysis?.analysis_data?.team_analysis
                        const cachedMembers = Array.isArray(cachedTeamAnalysis) ? cachedTeamAnalysis : (cachedTeamAnalysis as any)?.members

                        if (cachedAnalysis && cachedAnalysis.analysis_data && cachedMembers && Array.isArray(cachedMembers) && cachedMembers.length > 0) {
                          // Use cached full analysis data
                          setCurrentAnalysis(cachedAnalysis)
                          setRedirectingToSuggested(false) // Turn off redirect loader
                          updateURLWithAnalysis(cachedAnalysis.uuid || cachedAnalysis.id)
                          return
                        }

                        // If analysis doesn't have full data with members, fetch it
                        if (!analysis.analysis_data || !members || !Array.isArray(members) || members.length === 0) {
                          try {
                            const authToken = localStorage.getItem('auth_token')
                            if (!authToken) return

                            const response = await fetch(`${API_BASE}/analyses/${analysis.id}`, {
                              headers: {
                                'Authorization': `Bearer ${authToken}`
                              }
                            })

                            if (response.ok) {
                              const fullAnalysis = await response.json()
                              // Cache the full analysis data
                              setAnalysisCache(prev => new Map(prev.set(analysisKey, fullAnalysis)))
                              setCurrentAnalysis(fullAnalysis)
                              setRedirectingToSuggested(false) // Turn off redirect loader
                              updateURLWithAnalysis(fullAnalysis.uuid || fullAnalysis.id)
                            } else {
                              console.error('Failed to fetch full analysis:', response.status)
                              setRedirectingToSuggested(false)
                            }
                          } catch (error) {
                            console.error('Error fetching full analysis:', error)
                            setRedirectingToSuggested(false)
                          }
                        } else {
                          // Analysis already has full data, cache it and use it
                          setAnalysisCache(prev => new Map(prev.set(analysisKey, analysis)))
                          setCurrentAnalysis(analysis)
                          setRedirectingToSuggested(false) // Turn off redirect loader
                          updateURLWithAnalysis(analysis.uuid || analysis.id)
                        }
                      }}
                    >
                      {sidebarCollapsed ? (
                        <Clock className="w-5 h-5" />
                      ) : (
                        <div className="flex flex-col items-start w-full text-sm pr-8">
                          <div className="flex justify-between items-center w-full mb-1 gap-2">
                            <div className="flex items-center space-x-2 min-w-0">
                              {/* Always show platform dot if we have a color */}
                              {platformColor !== 'bg-gray-500' && (
                                <div className={`w-2.5 h-2.5 rounded-full ${platformColor} flex-shrink-0`}></div>
                              )}
                              <span className="font-medium truncate">{organizationName}</span>
                            </div>
                            <span className="text-gray-500 flex-shrink-0">{analysis.time_range || 30}d</span>
                          </div>
                          <div className="flex justify-between items-center w-full text-gray-400">
                            <span>{dateStr}</span>
                            <span>{timeStr}</span>
                          </div>
                        </div>
                      )}
                    </Button>
                    {!sidebarCollapsed && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity p-1 h-6 w-6 text-gray-400 hover:text-red-400 hover:bg-red-900/20"
                        onClick={(e) => openDeleteDialog(analysis, e)}
                        title="Delete analysis"
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    )}
                  </div>
                )
                })
                )}
                
                {/* Load More Button */}
                {hasMoreAnalyses && !sidebarCollapsed && (
                  <div className="px-3 py-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => loadPreviousAnalyses(true)}
                      disabled={loadingMoreAnalyses || analysisRunning}
                      className="w-full border-gray-500 bg-gray-800 text-gray-200 hover:bg-gray-700 hover:text-white hover:border-gray-400 text-sm"
                    >
                      {(loadingMoreAnalyses || (loadingAnalyses && previousAnalyses.length === 0)) ? (
                        <>
                          <div className="w-3 h-3 border border-gray-300 border-t-transparent rounded-full animate-spin mr-2" />
                          Loading...
                        </>
                      ) : (
                        <>+ {Math.min(3, totalAnalysesCount - previousAnalyses.length)} more</>
                      )}
                    </Button>
                  </div>
                )}
              </div>
            </div>
            </div>
          ) : (
            <div className="flex-1">
              {/* Collapsed state - just show new analysis button */}
              <Button
                onClick={startAnalysis}
                disabled={analysisRunning}
                className="w-full bg-purple-600 hover:bg-purple-700 text-white p-2"
                title="New Analysis"
              >
                <Play className="w-5 h-5" />
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto bg-gray-100">
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center justify-between w-full">
              <div>
                <h1 className="text-4xl font-bold text-black">Analysis Dashboard</h1>
                <p className="text-lg text-gray-600">
                  {(() => {
                    if (currentAnalysis) {
                      // Find the integration for this specific analysis
                      const analysisIntegration = integrations.find(i => i.id === currentAnalysis.integration_id);

                      // Use multiple sources to get the organization name (to handle different integrations)
                      const orgName = analysisIntegration?.name ||
                                    analysisIntegration?.organization_name ||
                                    (currentAnalysis.analysis_data as any)?.metadata?.organization_name ||
                                    'Organization';

                      const analysisDateTime = new Date(currentAnalysis.created_at);
                      const date = analysisDateTime.toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                      });
                      const time = analysisDateTime.toLocaleTimeString('en-US', {
                        hour: 'numeric',
                        minute: '2-digit',
                        hour12: true
                      });
                      return `${orgName} • ${date} at ${time}`;
                    }
                    return '';
                  })()}
                </p>
              </div>
              <div className="flex items-center space-x-4">
                {/* Export Dropdown */}
                {!shouldShowInsufficientDataCard() && currentAnalysis && currentAnalysis.analysis_data && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="outline"
                        className="flex items-center space-x-2 border-gray-300 hover:bg-gray-50"
                        title="Export analysis data"
                      >
                        <Download className="w-5 h-5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      <DropdownMenuItem onClick={exportAsJSON} className="flex items-center space-x-2">
                        <Download className="w-5 h-5" />
                        <div className="flex flex-col">
                          <span className="font-medium text-base">Export as JSON</span>
                          <span className="text-sm text-gray-500">Complete analysis data</span>
                        </div>
                      </DropdownMenuItem>
                      <DropdownMenuItem disabled className="flex items-center space-x-2 opacity-50">
                        <Download className="w-5 h-5" />
                        <div className="flex flex-col">
                          <span className="font-medium text-base">Export as CSV</span>
                          <span className="text-sm text-gray-500">Organization member scores</span>
                        </div>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem disabled className="flex items-center space-x-2 opacity-50">
                        <FileText className="w-5 h-5" />
                        <div className="flex flex-col">
                          <span className="font-medium text-base">Generate PDF Report</span>
                          <span className="text-sm text-gray-500">Executive summary</span>
                        </div>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </div>
          </div>

          {/* Debug Section - Only show in development */}
          {false && process.env.NODE_ENV === 'development' && currentAnalysis && (
            <Card className="mb-6 bg-yellow-50 border-yellow-200">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-yellow-800 flex items-center">
                    <AlertCircle className="w-4 h-4 mr-2" />
                    Debug: Analysis Data Structure
                  </h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDebugSectionOpen(!debugSectionOpen)}
                    className="text-yellow-600 hover:text-yellow-800 hover:bg-yellow-100"
                  >
                    {debugSectionOpen ? 'Hide' : 'Show'} Debug Info
                  </Button>
                </div>
                
                {debugSectionOpen && (
                  <div className="space-y-3">
                    <div className="text-xs bg-white p-3 rounded border border-yellow-200">
                      <div className="font-medium text-gray-700 mb-2">Analysis Overview:</div>
                      <div className="space-y-1 text-gray-600">
                        <div>ID: {currentAnalysis.id}</div>
                        <div>Status: {currentAnalysis.status}</div>
                        <div>Created: {new Date(currentAnalysis.created_at).toLocaleString([], {
                          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                          hour12: true
                        })}</div>
                        <div>Integration ID: {currentAnalysis.integration_id}</div>
                        <div>Has analysis_data: {currentAnalysis.analysis_data ? 'Yes' : 'No'}</div>
                      </div>
                    </div>
                    
                    {currentAnalysis.analysis_data && (
                      <div className="text-xs bg-white p-3 rounded border border-yellow-200">
                        <div className="font-medium text-gray-700 mb-2">Analysis Data Structure:</div>
                        <div className="space-y-1 text-gray-600">
                          <div>Has team_health: {currentAnalysis.analysis_data.team_health ? 'Yes' : 'No'}</div>
                          <div>Has team_analysis: {currentAnalysis.analysis_data.team_analysis ? 'Yes' : 'No'}</div>
                          <div>Has partial_data: {currentAnalysis.analysis_data.partial_data ? 'Yes' : 'No'}</div>
                          
                          {currentAnalysis.analysis_data.team_analysis && (
                            <div className="ml-4 space-y-1 mt-2">
                              <div className="font-medium text-gray-700">Team Analysis:</div>
                              <div>Members count: {Array.isArray(currentAnalysis.analysis_data.team_analysis) ? (currentAnalysis.analysis_data.team_analysis as any[]).length : ((currentAnalysis.analysis_data.team_analysis as any)?.members?.length || 0)}</div>
                              <div>Has organization_health: {(currentAnalysis.analysis_data.team_analysis as any).organization_health ? 'Yes' : 'No'}</div>
                              <div>Has insights: {(currentAnalysis.analysis_data.team_analysis as any).insights ? 'Yes' : 'No'}</div>
                            </div>
                          )}
                          
                          {(() => {
                            const teamAnalysis = currentAnalysis.analysis_data.team_analysis
                            const members = Array.isArray(teamAnalysis) ? teamAnalysis : (teamAnalysis as any)?.members
                            return members && members.length > 0
                          })() && (
                            <div className="ml-4 space-y-1 mt-2">
                              <div className="font-medium text-gray-700">Sample Member Data Sources:</div>
                              {(() => {
                                const teamAnalysis = currentAnalysis.analysis_data.team_analysis
                                const members = Array.isArray(teamAnalysis) ? teamAnalysis : (teamAnalysis as any)?.members
                                const member = members[0]
                                return (
                                  <div className="ml-4 space-y-1">
                                    <div>Has GitHub data: {(member as any).github_data ? 'Yes' : 'No'}</div>
                                    <div>Has Slack data: {(member as any).slack_data ? 'Yes' : 'No'}</div>
                                    <div>Has incident data: {member.incident_count !== undefined ? 'Yes' : 'No'}</div>
                                    <div>Has metrics: {member.metrics ? 'Yes' : 'No'}</div>
                                    <div>Has factors: {member.factors ? 'Yes' : 'No'}</div>
                                  </div>
                                )
                              })()}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                    
                    <div className="text-xs bg-white p-3 rounded border border-yellow-200">
                      <div className="font-medium text-gray-700 mb-2">Raw Analysis Data (JSON):</div>
                      <pre className="text-xs text-gray-600 bg-gray-50 p-2 rounded border max-h-60 overflow-y-auto">
                        {JSON.stringify(currentAnalysis.analysis_data, null, 2)}
                      </pre>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
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
              {/* Debug Section - Development Only */}
              {false && process.env.NODE_ENV === 'development' && (
                <Card className="mb-6 border-yellow-300 bg-yellow-50">
                  <CardHeader>
                    <CardTitle className="text-yellow-800 text-sm">🐛 Debug: Analysis Data Sources</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-xs space-y-2">
                      <p><strong>Analysis ID:</strong> {currentAnalysis.id}</p>
                      <p><strong>Status:</strong> {currentAnalysis.status}</p>
                      <p><strong>Data Sources Present:</strong></p>
                      <ul className="ml-4 space-y-1">
                        <li>• data_sources object: {currentAnalysis.analysis_data?.data_sources ? '✅ Present' : '❌ Missing'}</li>
                        <li>• github_data flag: {currentAnalysis.analysis_data?.data_sources?.github_data ? '✅ True' : '❌ False/Missing'}</li>
                        <li>• slack_data flag: {currentAnalysis.analysis_data?.data_sources?.slack_data ? '✅ True' : '❌ False/Missing'}</li>
                        <li>• github_insights: {currentAnalysis.analysis_data?.github_insights ? '✅ Present' : '❌ Missing'}</li>
                        <li>• slack_insights: {currentAnalysis.analysis_data?.slack_insights ? '✅ Present' : '❌ Missing'}</li>
                        <li>• team_analysis.members count: {Array.isArray(currentAnalysis.analysis_data?.team_analysis) ? (currentAnalysis.analysis_data.team_analysis as any[]).length : ((currentAnalysis.analysis_data?.team_analysis as any)?.members?.length || 0)}</li>
                      </ul>
                      <p><strong>Metadata Check:</strong></p>
                      <ul className="ml-4 space-y-1">
                        <li>• metadata.include_github: {(currentAnalysis.analysis_data as any)?.metadata?.include_github ? '✅ True' : '❌ False/Missing'}</li>
                        <li>• metadata.include_slack: {(currentAnalysis.analysis_data as any)?.metadata?.include_slack ? '✅ True' : '❌ False/Missing'}</li>
                        <li>• metadata object: {(currentAnalysis.analysis_data as any)?.metadata ? '✅ Present' : '❌ Missing'}</li>
                      </ul>
                      <details className="mt-2">
                        <summary className="cursor-pointer text-yellow-700 hover:text-yellow-900">Raw analysis_data structure</summary>
                        <pre className="mt-2 p-2 bg-white rounded text-xs overflow-auto max-h-40">
                          {JSON.stringify(currentAnalysis.analysis_data, null, 2)}
                        </pre>
                      </details>
                      <details className="mt-2">
                        <summary className="cursor-pointer text-yellow-700 hover:text-yellow-900">GitHub insights data</summary>
                        <pre className="mt-2 p-2 bg-white rounded text-xs overflow-auto max-h-40">
                          {JSON.stringify(currentAnalysis.analysis_data?.github_insights, null, 2)}
                        </pre>
                      </details>
                      <details className="mt-2">
                        <summary className="cursor-pointer text-yellow-700 hover:text-yellow-900">Slack insights data</summary>
                        <pre className="mt-2 p-2 bg-white rounded text-xs overflow-auto max-h-40">
                          {JSON.stringify(currentAnalysis.analysis_data?.slack_insights, null, 2)}
                        </pre>
                      </details>
                    </div>
                  </CardContent>
                </Card>
              )}

              <TeamHealthOverview 
                currentAnalysis={currentAnalysis}
                historicalTrends={historicalTrends}
                expandedDataSources={expandedDataSources}
                setExpandedDataSources={setExpandedDataSources}
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

              {/* Individual Burnout Scores and AI Insights Grid */}
              {(() => {
                const hasAIInsights = currentAnalysis?.analysis_data?.ai_team_insights?.available;
                return (
                  <div className={`grid grid-cols-1 ${hasAIInsights ? 'lg:grid-cols-3' : 'lg:grid-cols-1'} gap-6 mb-6`}>
                    {/* Individual Burnout Scores - Takes 2/3 width on large screens, full width if no AI Insights */}
                    <Card className={hasAIInsights ? "lg:col-span-2" : ""}>
                      <CardHeader>
                        <CardTitle>Individual Burnout Scores</CardTitle>
                        <CardDescription>Team member OCB burnout scores (higher = more burnout risk)</CardDescription>
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
                                        case 'low': return 'Low/Minimal Burnout';
                                        case 'mild': return 'Mild Burnout Symptoms';
                                        case 'moderate': return 'Moderate/Significant Burnout';
                                        case 'high': return 'High/Severe Burnout';
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
                                >
                                  {memberBarData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.fill} />
                                  ))}
                                </Bar>
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        ) : (
                          <div className="h-[350px] flex items-center justify-center text-gray-500">
                            <div className="text-center">
                              <p className="text-lg font-medium">No incident data available</p>
                              <p className="text-sm mt-2">Members with zero incidents are not displayed in this chart</p>
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    {/* AI Insights Card - Takes 1/3 width on large screens */}
                    {hasAIInsights && (
                      <div className="lg:col-span-1">
                        <AIInsightsCard currentAnalysis={currentAnalysis} />
                      </div>
                    )}
                  </div>
                );
              })()
              }
              {/* Charts Section */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                {/* Burnout Journey Map */}
                <Card>
                  <CardHeader>
                    <CardTitle>Burnout Timeline</CardTitle>
                    <CardDescription>
                      {(() => {
                        if (currentAnalysis?.analysis_data?.daily_trends?.length > 0) {
                          const dailyTrends = currentAnalysis.analysis_data.daily_trends;
                          // Quick count of standout events
                          let standoutCount = 0;
                          for (let i = 1; i < dailyTrends.length - 1; i++) {
                            const prev = dailyTrends[i-1];
                            const curr = dailyTrends[i];
                            const next = dailyTrends[i+1];
                            const score = Math.round(curr.overall_score * 10);
                            const prevChange = prev ? score - Math.round(prev.overall_score * 10) : 0;
                            
                            if ((prev && next && score > Math.round(prev.overall_score * 10) && score > Math.round(next.overall_score * 10) && score >= 75) ||
                                (prev && next && score < Math.round(prev.overall_score * 10) && score < Math.round(next.overall_score * 10) && score <= 60) ||
                                Math.abs(prevChange) >= 20 ||
                                curr.incident_count >= 15 ||
                                (score <= 45 && curr.members_at_risk >= 3)) {
                              standoutCount++;
                            }
                          }
                          return `Timeline from ${standoutCount} significant events across the selected time range`;
                        }
                        return "Timeline of significant events and trends across the selected time range";
                      })()}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-6">
                      {loadingTrends ? (
                        <div className="flex items-center justify-center h-32">
                          <div className="text-center">
                            <div className="animate-spin w-6 h-6 border-2 border-purple-600 border-t-transparent rounded-full mx-auto mb-2"></div>
                            <p className="text-sm text-gray-500">Loading journey...</p>
                          </div>
                        </div>
                      ) : (
                        (() => {
                        // Calculate high risk members for journey map
                        const highRiskMembers = members.filter(m => m.risk_level === 'high' || m.risk_level === 'critical');
                        
                        // Calculate health score
                        const healthScore = currentAnalysis?.analysis_data?.team_health ? 
                          Math.round(currentAnalysis.analysis_data.team_health.overall_score * 10) : 92;
                        
                        // Generate timeline events using the same intelligent detection as the health trends chart
                        let journeyEvents = [];
                        
                        if (currentAnalysis?.analysis_data?.daily_trends?.length > 0) {
                          const dailyTrends = currentAnalysis.analysis_data.daily_trends;
                          
                          // Transform data and detect standout events (same logic as chart)
                          const chartData = dailyTrends.map((trend: any, index: number) => ({
                            date: trend.date,
                            // Use OCB score methodology (0-100, where higher = more burnout)
                            score: Math.round(trend.overall_score * 10), // Convert 0-10 to 0-100 OCB scale
                            membersAtRisk: trend.members_at_risk,
                            totalMembers: trend.total_members,
                            incidentCount: trend.incident_count || 0,
                            rawScore: trend.overall_score,
                            index: index
                          }));
                          
                          // Identify standout events (same algorithm as chart)
                          const identifyStandoutEvents = (data: any[]) => {
                            if (data.length < 3) return data;
                            
                            return data.map((point: any, i: number) => {
                              let eventType = 'normal';
                              let eventDescription = '';
                              let significance = 0;
                              
                              const prev = i > 0 ? data[i-1] : null;
                              const next = i < data.length-1 ? data[i+1] : null;
                              
                              // Calculate changes
                              const prevChange = prev ? point.score - prev.score : 0;
                              
                              // Detect peaks (local maxima)
                              if (prev && next && point.score > prev.score && point.score > next.score && point.score >= 75) {
                                eventType = 'peak';
                                // Convert health score to OCB score for display (100 - health_percentage = OCB score)
                                const ocbScore = Math.round(100 - point.score);
                                eventDescription = `Team wellness at peak (${ocbScore} OCB score) - ${point.incidentCount} incidents handled without stress signs`;
                                significance = point.score >= 90 ? 3 : 2;
                              }
                              // Detect valleys (local minima)  
                              else if (prev && next && point.score < prev.score && point.score < next.score && point.score <= 60) {
                                eventType = 'valley';
                                // Convert health score to OCB score for display (100 - health_percentage = OCB score)
                                const ocbScore = Math.round(100 - point.score);
                                eventDescription = `Team showing signs of strain (${ocbScore} OCB score) - ${point.incidentCount} incidents, ${point.membersAtRisk} team members need support`;
                                significance = point.score <= 40 ? 3 : 2;
                              }
                              // Detect sharp improvements
                              else if (prevChange >= 20) {
                                eventType = 'recovery';
                                // For improvement, show it as OCB score reduction (health increase = OCB decrease)
                                const ocbImprovement = Math.abs(prevChange);
                                eventDescription = `Great turnaround! Team burnout reduced by ${ocbImprovement} OCB points - interventions working well`;
                                significance = prevChange >= 30 ? 3 : 2;
                              }
                              // Detect sharp declines
                              else if (prevChange <= -20) {
                                eventType = 'decline';
                                // For decline, show it as OCB score increase (health decrease = OCB increase)
                                const ocbIncrease = Math.abs(prevChange);
                                eventDescription = `Warning: Team burnout increased by ${ocbIncrease} OCB points - immediate attention recommended`;
                                significance = prevChange <= -30 ? 3 : 2;
                              }
                              // Detect high incident volume days
                              else if (point.incidentCount >= 15) {
                                eventType = 'high-volume';
                                eventDescription = `Heavy workload day - ${point.incidentCount} incidents may be causing team stress`;
                                significance = point.incidentCount >= 25 ? 3 : 2;
                              }
                              // Detect critical health days
                              else if (point.score <= 45 && point.membersAtRisk >= 3) {
                                eventType = 'critical';
                                // Convert health score to OCB score for display (100 - health_percentage = OCB score)
                                const ocbScore = Math.round(100 - point.score);
                                eventDescription = `URGENT: Team at burnout risk (${ocbScore} OCB score) - ${point.membersAtRisk} members need immediate support`;
                                significance = 3;
                              }
                              
                              return {
                                ...point,
                                eventType,
                                eventDescription,
                                significance,
                                isStandout: significance > 0
                              };
                            });
                          };
                          
                          const standoutEvents = identifyStandoutEvents(chartData);
                          
                          // Convert standout events to timeline format, sorted by significance
                          journeyEvents = standoutEvents
                            .filter(event => event.isStandout)
                            .sort((a, b) => b.significance - a.significance) // Highest significance first
                            .slice(0, 8) // Limit to top 8 events
                            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()) // Sort by date for timeline
                            .map((event: any) => ({
                              date: new Date(event.date).toLocaleDateString('en-US', { 
                                month: 'short', 
                                day: 'numeric' 
                              }),
                              status: event.eventType,
                              title: event.eventType === 'peak' ? 'Team Wellness Peak' :
                                    event.eventType === 'valley' ? 'Team Support Needed' :
                                    event.eventType === 'recovery' ? 'Wellness Recovery' :
                                    event.eventType === 'decline' ? 'Burnout Risk Increase' :
                                    event.eventType === 'high-volume' ? 'High Workload Period' :
                                    event.eventType === 'critical' ? 'Burnout Alert' :
                                    'Significant Event',
                              description: event.eventDescription,
                              color: event.eventType === 'peak' ? 'bg-green-500' :
                                    event.eventType === 'valley' ? 'bg-red-500' :
                                    event.eventType === 'recovery' ? 'bg-blue-500' :
                                    event.eventType === 'decline' ? 'bg-orange-500' :
                                    event.eventType === 'high-volume' ? 'bg-purple-500' :
                                    event.eventType === 'critical' ? 'bg-red-600' :
                                    'bg-gray-500',
                              impact: event.eventType === 'peak' || event.eventType === 'recovery' ? 'positive' :
                                     event.eventType === 'valley' || event.eventType === 'decline' || event.eventType === 'critical' ? 'negative' :
                                     'neutral',
                              significance: event.significance
                            }));
                          
                          // Add current state
                          if (journeyEvents.length === 0 || journeyEvents[journeyEvents.length - 1].date !== 'Current') {
                            journeyEvents.push({
                              date: 'Current',
                              status: 'current',
                              title: 'Current State',
                              description: `${healthScore}% organization health score`,
                              color: 'bg-purple-500',
                              impact: healthScore >= 80 ? 'positive' : healthScore >= 60 ? 'neutral' : 'negative'
                            });
                          }
                        } else {
                          // Fallback to single current state
                          journeyEvents = [{
                            date: 'Current',
                            status: 'current',
                            title: 'Current State',
                            description: `${healthScore}% organization health score`,
                            color: 'bg-purple-500',
                            impact: healthScore >= 80 ? 'positive' : healthScore >= 60 ? 'neutral' : 'negative'
                          }];
                        }

                        return (
                          <div className="relative max-h-80 overflow-y-auto pr-2">
                            {/* Timeline line */}
                            <div className="absolute left-4 top-0 bottom-0 w-px bg-gray-200"></div>
                            
                            {journeyEvents.map((event, index) => (
                              <div key={index} className="relative flex items-start space-x-4 pb-6">
                                {/* Timeline dot */}
                                <div className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-full ${(() => {
                                  // Ensure success events have visible round colored backgrounds
                                  if (event.status === 'excellence') return 'bg-emerald-500';
                                  if (event.status === 'recovery') return 'bg-green-500';
                                  if (event.status === 'improvement') return 'bg-blue-500';
                                  if (event.status === 'risk-eliminated') return 'bg-green-500';
                                  if (event.status === 'risk-decrease') return 'bg-green-400';
                                  return event.color || 'bg-gray-500';
                                })()} shadow-sm ring-4 ring-white`}>
                                  {(() => {
                                    // Use more vibrant colors for success icons
                                    let iconColor = 'text-white'; // Default for dark backgrounds
                                    
                                    if (event.impact === 'positive' || event.status === 'risk-decrease' || event.status === 'improvement' || event.status === 'recovery' || event.status === 'excellence' || event.status === 'risk-eliminated') {
                                      // Success icons get vibrant colors based on event type
                                      if (event.status === 'excellence') {
                                        iconColor = 'text-green-800'; // Dark green on emerald for vibrant success
                                      } else if (event.status === 'risk-eliminated' || event.status === 'recovery') {
                                        iconColor = 'text-white'; // White on green for strong contrast
                                      } else if (event.status === 'risk-decrease') {
                                        iconColor = 'text-green-800'; // Dark green on light green
                                      } else if (event.status === 'improvement') {
                                        iconColor = 'text-white'; // White on blue
                                      } else {
                                        iconColor = 'text-white'; // Default white for other positive events
                                      }
                                      return <TrendingUp className={`h-4 w-4 ${iconColor}`} />;
                                    }
                                    if (event.impact === 'negative' || event.status === 'critical-burnout' || event.status === 'medium-risk' || event.status === 'decline' || event.status === 'risk-increase') {
                                      return <TrendingDown className={`h-4 w-4 text-white`} />;
                                    }
                                    if (event.impact === 'neutral' || event.status === 'current') {
                                      return <Minus className={`h-4 w-4 text-white`} />;
                                    }
                                    return null;
                                  })()}
                                </div>
                                
                                {/* Event content */}
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center justify-between">
                                    <p className="text-sm font-medium text-gray-900">{event.title}</p>
                                    <time className="text-xs text-gray-500">{event.date}</time>
                                  </div>
                                  <p className="text-sm text-gray-600 mt-1">{event.description}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        );
                        })()
                      )}
                    </div>
                  </CardContent>
                </Card>

                <HealthTrendsChart
                  currentAnalysis={currentAnalysis}
                  historicalTrends={historicalTrends}
                  loadingTrends={loadingTrends}
                />
              </div>

              {/* Burnout Factors Section */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                {/* Radar Chart */}
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle>Team Burnout Risk Factors</CardTitle>
                      {highRiskFactors.length > 0 && (
                        <div className="flex items-center space-x-2">
                          <AlertTriangle className="w-4 h-4 text-red-500" />
                          <span className="text-sm font-medium text-red-600">
                            {highRiskFactors.length} factor{highRiskFactors.length > 1 ? 's' : ''} need{highRiskFactors.length === 1 ? 's' : ''} attention
                          </span>
                        </div>
                      )}
                    </div>
                    <CardDescription>
                      {(() => {
                        const hasGitHubMembers = membersWithGitHubData.length > 0;
                        const hasIncidentMembers = membersWithIncidents.length > 0;
                        
                        if (hasGitHubMembers && hasIncidentMembers) {
                          return `Holistic burnout analysis combining incident response patterns and development activity across ${allActiveMembers.length} team members`;
                        } else if (hasGitHubMembers && !hasIncidentMembers) {
                          return `Development-focused burnout analysis based on GitHub activity patterns from ${membersWithGitHubData.length} active developers`;
                        } else if (!hasGitHubMembers && hasIncidentMembers) {
                          return `Incident response burnout analysis from ${membersWithIncidents.length} team members handling incidents`;
                        } else {
                          return "Team burnout risk assessment based on available activity data";
                        }
                      })()}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[450px] p-4">
                      <ResponsiveContainer width="100%" height="100%">
                        <RadarChart data={burnoutFactors} margin={{ top: 60, right: 80, bottom: 60, left: 80 }}>
                          <PolarGrid gridType="polygon" />
                          <PolarAngleAxis 
                            dataKey="factor" 
                            tick={{ fontSize: 13, fill: '#374151', fontWeight: 500 }}
                            className="text-sm"
                            tickFormatter={formatRadarLabel}
                          />
                          <PolarRadiusAxis
                            domain={[0, 100]}
                            tick={{ fontSize: 11, fill: '#6B7280' }}
                            tickCount={6}
                            angle={90}
                          />
                          <Radar 
                            dataKey="value" 
                            stroke="#8B5CF6" 
                            fill="#8B5CF6" 
                            fillOpacity={0.2}
                            strokeWidth={2}
                            dot={{ fill: '#8B5CF6', strokeWidth: 2, r: 4 }}
                          />
                          <Tooltip 
                            content={({ payload, label }) => {
                              if (payload && payload.length > 0) {
                                const data = payload[0].payload
                                return (
                                  <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
                                    <p className="font-semibold text-gray-900">{label}</p>
                                    <p className="text-purple-600">Score: {Math.round(data.value)}/100</p>
                                    <p className="text-xs text-gray-500 mt-1">
                                      {data.value < 30 ? 'Good' : 
                                       data.value < 50 ? 'Fair' : 
                                       data.value < 70 ? 'Poor' : 'Critical'}
                                    </p>
                                  </div>
                                )
                              }
                              return null
                            }}
                          />
                        </RadarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
                
                {/* Risk Factors Bar Chart - Always show if we have any factors */}
                {burnoutFactors.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center space-x-2">
                        {highRiskFactors.length > 0 ? (
                          <>
                            <span>Risk Factors</span>
                          </>
                        ) : (
                          <>
                            <BarChart3 className="w-5 h-5 text-blue-500" />
                            <span>Risk Factors</span>
                          </>
                        )}
                      </CardTitle>
                      <CardDescription>
                        {highRiskFactors.length > 0 
                          ? "Risk factors requiring immediate attention based on combined incident response and development activity patterns"
                          : "Current risk factors based on team activity patterns"
                        }
                      </CardDescription>
                    </CardHeader>
                    
                    <CardContent>
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
                          <div className="space-y-4">
                            {sortedBurnoutFactors.map((factor) => {
                              const color = getRiskHex(factor.severity, factor.value)
                              return (
                                <div key={factor.factor} className="relative">
                                  <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center space-x-2">
                                      <span className="font-medium text-gray-900">{factor.factor}</span>
                                      <span
                                        className={`px-2 py-1 rounded-full text-xs font-medium ${
                                          factor.severity === 'Critical'
                                            ? 'bg-red-100 text-red-800'
                                            : factor.severity === 'Poor'
                                            ? 'bg-orange-100 text-orange-800'
                                            : factor.severity === 'Fair'
                                            ? 'bg-yellow-100 text-yellow-800'
                                            : 'bg-green-100 text-green-800'
                                        }`}
                                      >
                                        {factor.severity}
                                      </span>
                                    </div>

                                    {/* Unified text color */}
                                    <span className="text-lg font-bold" style={{ color }}>
                                      {factor.value}/100
                                    </span>
                                  </div>

                                  <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
                                    {/* Unified bar color */}
                                    <div
                                      className="h-2 rounded-full transition-all duration-500"
                                      style={{
                                        width: `${factor.value}%`,
                                        backgroundColor: color,
                                      }}
                                    />
                                  </div>

                                  <div className="text-sm text-gray-600">
                                    <div>{factor.metrics}</div>
                                    {factor.value >= 5 && (
                                      <div className="mt-1 text-blue-600">
                                        <strong>Action:</strong> {factor.recommendation}
                                      </div>
                                    )}
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


              {/* GitHub and Slack Metrics Section */}
              {(currentAnalysis?.analysis_data?.github_insights || currentAnalysis?.analysis_data?.slack_insights) && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                  {/* GitHub Metrics Card */}
                  {currentAnalysis?.analysis_data?.github_insights && (
                    <Card className="border-2 border-gray-200 bg-white/70 backdrop-blur-sm shadow-lg">
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                          <CardTitle className="flex items-center space-x-2">
                            <div className="w-8 h-8 bg-gray-900 rounded-lg flex items-center justify-center">
                              <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M10 0C4.477 0 0 4.484 0 10.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0110 4.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.203 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.942.359.31.678.921.678 1.856 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0020 10.017C20 4.484 15.522 0 10 0z" clipRule="evenodd" />
                              </svg>
                            </div>
                            <span className="text-gray-900">GitHub Activity</span>
                          </CardTitle>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {(() => {
                          const github = currentAnalysis.analysis_data.github_insights
                          
                          // Check if we have any real GitHub data
                          const hasGitHubData = github && (
                            (github.total_commits && github.total_commits > 0) ||
                            (github.total_pull_requests && github.total_pull_requests > 0) ||
                            (github.total_reviews && github.total_reviews > 0)
                          )
                          
                          if (!hasGitHubData) {
                            return (
                              <div className="text-center py-8">
                                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                  <svg className="w-8 h-8 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M10 0C4.477 0 0 4.484 0 10.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0110 4.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.203 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.942.359.31.678.921.678 1.856 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0020 10.017C20 4.484 15.522 0 10 0z" clipRule="evenodd" />
                                  </svg>
                                </div>
                                <h3 className="text-lg font-medium text-gray-900 mb-2">No GitHub Data Available</h3>
                                <p className="text-sm text-gray-500">
                                  {currentAnalysis?.analysis_data?.data_sources?.github_data
                                    ? "No GitHub activity found for team members in this analysis period"
                                    : "GitHub integration not connected or no team members mapped to GitHub accounts"
                                  }
                                </p>
                              </div>
                            )
                          }
                          
                          return (
                            <>
          
                              {/* Commit Activity Timeline */}
                              <GitHubCommitsTimeline
                                analysisId={currentAnalysis?.id ? parseInt(currentAnalysis.id) : 0}
                                totalCommits={github.total_commits || 0}
                                weekendPercentage={(github.weekend_activity_percentage || github.weekend_commit_percentage || 0)}
                                cache={githubTimelineCache}
                                setCache={setGithubTimelineCache}
                              />

                              {/* GitHub Metrics Grid */}
                              <div className="grid grid-cols-2 gap-4">
                                <div className="bg-gray-50 rounded-lg p-3">
                                  <p className="text-xs text-gray-600 font-medium">Total Commits</p>
                                  {github.total_commits ? (
                                    <p className="text-lg font-bold text-gray-900">{github.total_commits.toLocaleString()}</p>
                                  ) : (
                                    <p className="text-lg font-bold text-gray-400 italic">No data</p>
                                  )}
                                </div>
                                <div className="bg-gray-50 rounded-lg p-3">
                                  <p className="text-xs text-gray-600 font-medium">Pull Requests</p>
                                  {github.total_pull_requests ? (
                                    <p className="text-lg font-bold text-gray-900">{github.total_pull_requests.toLocaleString()}</p>
                                  ) : (
                                    <p className="text-lg font-bold text-gray-400 italic">No data</p>
                                  )}
                                </div>
                                <div className="bg-gray-50 rounded-lg p-3">
                                  <p className="text-xs text-gray-600 font-medium">Code Reviews</p>
                                  {github.total_reviews ? (
                                    <p className="text-lg font-bold text-gray-900">{github.total_reviews.toLocaleString()}</p>
                                  ) : (
                                    <p className="text-lg font-bold text-gray-400 italic">No data</p>
                                  )}
                                </div>
                                <div className="bg-gray-50 rounded-lg p-3">
                                  <p className="text-xs text-gray-600 font-medium">After Hours</p>
                                  {github.after_hours_activity_percentage !== undefined && github.after_hours_activity_percentage !== null ? (
                                    <p className="text-lg font-bold text-gray-900">{github.after_hours_activity_percentage.toFixed(1)}%</p>
                                  ) : (
                                    <p className="text-lg font-bold text-gray-400 italic">No data</p>
                                  )}
                                </div>
                                <div className="bg-gray-50 rounded-lg p-3">
                                  <p className="text-xs text-gray-600 font-medium">Weekend Commits</p>
                                  {(github.weekend_activity_percentage !== undefined && github.weekend_activity_percentage !== null) || 
                                   (github.weekend_commit_percentage !== undefined && github.weekend_commit_percentage !== null) ? (
                                    <div>
                                      <p className="text-lg font-bold text-gray-900">{(github.weekend_activity_percentage || github.weekend_commit_percentage || 0).toFixed(1)}%</p>
                                      {github.activity_data?.weekend_commits !== undefined && (
                                        <p className="text-xs text-gray-500">{github.activity_data.weekend_commits} commits</p>
                                      )}
                                    </div>
                                  ) : (
                                    <p className="text-lg font-bold text-gray-400 italic">No data</p>
                                  )}
                                </div>
                              </div>

                              {/* Burnout Indicators */}
                              {github.burnout_indicators && (
                                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                                  <h4 className="text-sm font-semibold text-red-800 mb-2">Burnout Risk Indicators</h4>
                                  {/* Show total high-risk member count if available */}
                                  {(github as any).high_risk_member_count !== undefined && (github as any).high_risk_member_count > 0 && (
                                    <div className="mb-2 pb-2 border-b border-red-200">
                                      <div className="flex items-center space-x-2">
                                        <AlertTriangle className="w-4 h-4 text-red-600" />
                                        <span className="text-sm font-semibold text-red-800">
                                          {(github as any).high_risk_member_count} members with GitHub burnout indicators
                                        </span>
                                      </div>
                                      {/* Show risk distribution if available */}
                                      {(github as any).risk_distribution && (
                                        <div className="mt-1 text-xs text-gray-600">
                                          Overall risk levels: {
                                            (() => {
                                              const dist = (github as any).risk_distribution
                                              const parts = []
                                              if (dist.high > 0) parts.push(`${dist.high} high`)
                                              if (dist.medium > 0) parts.push(`${dist.medium} medium`)
                                              if (dist.low > 0) parts.push(`${dist.low} low`)
                                              
                                              return parts.join(', ') || 'Risk distribution unavailable'
                                            })()
                                          }
                                        </div>
                                      )}
                                    </div>
                                  )}
                                  <div className="space-y-1 text-xs">
                                    {github.burnout_indicators.excessive_late_night_commits > 0 && (
                                      <div className="flex items-center space-x-2">
                                        <AlertTriangle className="w-3 h-3 text-red-600" />
                                        <span className="text-red-700">{github.burnout_indicators.excessive_late_night_commits} members with excessive late-night commits</span>
                                      </div>
                                    )}
                                    {github.burnout_indicators.weekend_workers > 0 && (
                                      <div className="flex items-center space-x-2">
                                        <AlertTriangle className="w-3 h-3 text-red-600" />
                                        <span className="text-red-700">{github.burnout_indicators.weekend_workers} members working weekends</span>
                                      </div>
                                    )}
                                    {github.burnout_indicators.large_pr_pattern > 0 && (
                                      <div className="flex items-center space-x-2">
                                        <AlertTriangle className="w-3 h-3 text-red-600" />
                                        <span className="text-red-700">{github.burnout_indicators.large_pr_pattern} members with large PR patterns</span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}

                            </>
                          )
                        })()}
                      </CardContent>
                    </Card>
                  )}

                  {/* Slack Metrics Card */}
                  {currentAnalysis?.analysis_data?.slack_insights && (
                    <Card className="border-2 border-purple-200 bg-white/70 backdrop-blur-sm shadow-lg">
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                          <CardTitle className="flex items-center space-x-2">
                            <div className="w-8 h-8 rounded-lg flex items-center justify-center">
                              <svg className="w-8 h-8" viewBox="0 0 124 124" fill="none">
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
                            <span className="text-gray-900">Slack Communications</span>
                          </CardTitle>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {(() => {
                          const slack = currentAnalysis.analysis_data.slack_insights
                          
                          // Check if this analysis actually has valid Slack data
                          const teamAnalysis = currentAnalysis.analysis_data.team_analysis
                          const teamMembers = Array.isArray(teamAnalysis) ? teamAnalysis : (teamAnalysis?.members || [])
                          const hasRealSlackData = teamMembers.some(member => 
                            member.slack_activity && 
                            (member.slack_activity.messages_sent > 0 || member.slack_activity.channels_active > 0)
                          )
                          
                          // Check for API errors
                          const hasRateLimitErrors = (slack as any)?.errors?.rate_limited_channels?.length > 0
                          const hasOtherErrors = (slack as any)?.errors?.other_errors?.length > 0
                          
                          // If no real Slack data, show empty state
                          if (!hasRealSlackData && !hasRateLimitErrors && !hasOtherErrors) {
                            return (
                              <div className="text-center py-8">
                                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                  <svg className="w-8 h-8 text-gray-400" viewBox="0 0 124 124" fill="currentColor">
                                    <path d="M26.3996 78.2003C26.3996 84.7003 21.2996 89.8003 14.7996 89.8003C8.29961 89.8003 3.19961 84.7003 3.19961 78.2003C3.19961 71.7003 8.29961 66.6003 14.7996 66.6003H26.3996V78.2003Z" />
                                    <path d="M32.2996 78.2003C32.2996 71.7003 37.3996 66.6003 43.8996 66.6003C50.3996 66.6003 55.4996 71.7003 55.4996 78.2003V109.2C55.4996 115.7 50.3996 120.8 43.8996 120.8C37.3996 120.8 32.2996 115.7 32.2996 109.2V78.2003Z" />
                                    <path d="M43.8996 26.4003C37.3996 26.4003 32.2996 21.3003 32.2996 14.8003C32.2996 8.30026 37.3996 3.20026 43.8996 3.20026C50.3996 3.20026 55.4996 8.30026 55.4996 14.8003V26.4003H43.8996Z" />
                                    <path d="M43.8996 32.3003C50.3996 32.3003 55.4996 37.4003 55.4996 43.9003C55.4996 50.4003 50.3996 55.5003 43.8996 55.5003H12.8996C6.39961 55.5003 1.29961 50.4003 1.29961 43.9003C1.29961 37.4003 6.39961 32.3003 12.8996 32.3003H43.8996Z" />
                                    <path d="M97.5996 43.9003C97.5996 37.4003 102.7 32.3003 109.2 32.3003C115.7 32.3003 120.8 37.4003 120.8 43.9003C120.8 50.4003 115.7 55.5003 109.2 55.5003H97.5996V43.9003Z" />
                                    <path d="M91.6996 43.9003C91.6996 50.4003 86.5996 55.5003 80.0996 55.5003C73.5996 55.5003 68.4996 50.4003 68.4996 43.9003V12.9003C68.4996 6.40026 73.5996 1.30026 80.0996 1.30026C86.5996 1.30026 91.6996 6.40026 91.6996 12.9003V43.9003Z" />
                                    <path d="M80.0996 97.7003C86.5996 97.7003 91.6996 102.8 91.6996 109.3C91.6996 115.8 86.5996 120.9 80.0996 120.9C73.5996 120.9 68.4996 115.8 68.4996 109.3V97.7003H80.0996Z" />
                                    <path d="M80.0996 91.8003C73.5996 91.8003 68.4996 86.7003 68.4996 80.2003C68.4996 73.7003 73.5996 68.6003 80.0996 68.6003H111.1C117.6 68.6003 122.7 73.7003 122.7 80.2003C122.7 86.7003 117.6 91.8003 111.1 91.8003H80.0996Z" />
                                  </svg>
                                </div>
                                <h3 className="text-lg font-medium text-gray-900 mb-2">No Slack Data Available</h3>
                                <p className="text-sm text-gray-500">
                                  {currentAnalysis?.analysis_data?.data_sources?.slack_data
                                    ? "No Slack communication activity found for team members in this analysis period"
                                    : "Slack integration not connected or no team members mapped to Slack accounts"
                                  }
                                </p>
                              </div>
                            )
                          }
                          
                          return (
                            <>
                              {/* Error Messages */}
                              {hasRateLimitErrors && (
                                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                                  <div className="flex items-center space-x-2">
                                    <svg className="w-4 h-4 text-yellow-600" fill="currentColor" viewBox="0 0 20 20">
                                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                                    </svg>
                                    <span className="text-sm font-medium text-yellow-800">Rate Limited</span>
                                  </div>
                                  <p className="text-xs text-yellow-700 mt-1">
                                    Some channels were rate limited: {(slack as any).errors.rate_limited_channels.join(", ")}. 
                                    Data may be incomplete. <button 
                                      onClick={() => window.location.reload()} 
                                      className="text-yellow-800 underline hover:text-yellow-900"
                                    >
                                      Refresh to retry
                                    </button>
                                  </p>
                                </div>
                              )}
                              
                              {hasOtherErrors && (
                                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                                  <div className="flex items-center space-x-2">
                                    <svg className="w-4 h-4 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                                    </svg>
                                    <span className="text-sm font-medium text-red-800">Connection Issues</span>
                                  </div>
                                  <p className="text-xs text-red-700 mt-1">
                                    {(slack as any).errors.other_errors.slice(0, 2).join("; ")}
                                    {(slack as any).errors.other_errors.length > 2 && ` and ${(slack as any).errors.other_errors.length - 2} more...`}
                                  </p>
                                </div>
                              )}
                              
                              {/* Only show metrics if we have real data */}
                              {hasRealSlackData && (
                                <>
                                  {/* Slack Metrics Grid */}
                                  <div className="grid grid-cols-2 gap-4">
                                    <div className="bg-purple-50 rounded-lg p-3">
                                      <p className="text-xs text-purple-600 font-medium">Total Messages</p>
                                      {slack?.total_messages ? (
                                        <p className="text-lg font-bold text-purple-900">{slack.total_messages.toLocaleString()}</p>
                                      ) : (
                                        <p className="text-lg font-bold text-gray-400">No data</p>
                                      )}
                                    </div>
                                    <div className="bg-purple-50 rounded-lg p-3">
                                      <p className="text-xs text-purple-600 font-medium">Active Channels</p>
                                      {slack?.active_channels ? (
                                        <p className="text-lg font-bold text-purple-900">{slack.active_channels}</p>
                                      ) : (
                                        <p className="text-lg font-bold text-gray-400">No data</p>
                                      )}
                                    </div>
                                    <div className="bg-purple-50 rounded-lg p-3">
                                      <p className="text-xs text-purple-600 font-medium">After Hours</p>
                                      {slack?.after_hours_activity_percentage !== undefined && slack.after_hours_activity_percentage !== null ? (
                                        <p className="text-lg font-bold text-purple-900">{slack.after_hours_activity_percentage.toFixed(1)}%</p>
                                      ) : (
                                        <p className="text-lg font-bold text-gray-400">No data</p>
                                      )}
                                    </div>
                                    <div className="bg-purple-50 rounded-lg p-3">
                                      <p className="text-xs text-purple-600 font-medium">Weekend Messages</p>
                                      {(slack?.weekend_activity_percentage !== undefined && slack.weekend_activity_percentage !== null) || 
                                       (slack?.weekend_percentage !== undefined && slack.weekend_percentage !== null) ? (
                                        <p className="text-lg font-bold text-purple-900">{(slack.weekend_activity_percentage || slack.weekend_percentage || 0).toFixed(1)}%</p>
                                      ) : (
                                        <p className="text-lg font-bold text-gray-400">No data</p>
                                      )}
                                    </div>
                                    <div className="bg-purple-50 rounded-lg p-3">
                                      <p className="text-xs text-purple-600 font-medium">Avg Response Time</p>
                                      {slack?.avg_response_time_minutes ? (
                                        <p className="text-lg font-bold text-purple-900">{slack.avg_response_time_minutes.toFixed(0)}m</p>
                                      ) : (
                                        <p className="text-lg font-bold text-gray-400">No data</p>
                                      )}
                                    </div>
                                    <div className="bg-purple-50 rounded-lg p-3">
                                      <p className="text-xs text-purple-600 font-medium">Sentiment Score</p>
                                      {slack?.sentiment_analysis?.avg_sentiment !== undefined && slack.sentiment_analysis.avg_sentiment !== null ? (
                                        <p className="text-lg font-bold text-purple-900">{slack.sentiment_analysis.avg_sentiment.toFixed(2)}</p>
                                      ) : (
                                        <p className="text-lg font-bold text-gray-400">No data</p>
                                      )}
                                    </div>
                                  </div>


                                </>
                              )}
                            </>
                          )
                        })()}
                      </CardContent>
                    </Card>
                  )}
                </div>
              )}

              <TeamMembersList
                currentAnalysis={currentAnalysis}
                setSelectedMember={setSelectedMember}
                getRiskColor={getRiskColor}
                getProgressColor={getProgressColor}
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
                  : 'This analysis has insufficient data to generate meaningful burnout insights. This could be due to lack of organization member data, incident history, or API access issues.'
                }
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Button 
                  onClick={startAnalysis} 
                  className="bg-yellow-600 hover:bg-yellow-700 text-white"
                >
                  <Play className="w-4 h-4 mr-2" />
                  Rerun Analysis
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
                  Remove Selection
                </Button>
              </div>
            </Card>
          )}

          {/* Analysis Not Found State or Auto-Redirect Loader */}
          {!analysisRunning && searchParams.get('analysis') && (redirectingToSuggested || !currentAnalysis) && (
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
                        updateURLWithAnalysis(previousAnalyses[0].uuid || previousAnalyses[0].id)
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
              {/* Show loading state while analyses are loading OR if we have analyses but currentAnalysis isn't set */}
              {loadingAnalyses || (previousAnalyses.length > 0 && !currentAnalysis) ? (
                <Card className="text-center p-8">
                  <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <div className="w-8 h-8 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></div>
                  </div>
                  <h3 className="text-lg font-semibold mb-2">Loading Your Analyses</h3>
                  <p className="text-gray-600 mb-4">
                    We're checking for your previous burnout analyses...
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
                  <p className="text-gray-600 mb-4">
                    Connect your first integration to start analyzing burnout metrics. Both Rootly and PagerDuty are supported.
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
                              <Info className="w-4 h-4 text-purple-600" />
                              <AlertDescription className="text-purple-800">
                                <div className="flex items-center justify-between">
                                  <div>
                                    <strong>Rootly Integration Available</strong>
                                    <span className="block text-sm mt-1">
                                      Connect Rootly for comprehensive incident management and team burnout analysis.
                                    </span>
                                  </div>
                                  <Button 
                                    size="sm" 
                                    onClick={() => router.push('/integrations')} 
                                    className="bg-purple-600 hover:bg-purple-700 ml-4"
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
                      <Activity className="w-8 h-8 text-purple-600" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">No Analysis Yet</h3>
                    <p className="text-gray-600 mb-4">
                      Click "New Analysis" to start analyzing your organization's burnout metrics
                    </p>
                    <Button onClick={startAnalysis} className="bg-purple-600 hover:bg-purple-700">
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
        </div>
      </div>

      {/* Time Range Selection Dialog */}
      <Dialog open={showTimeRangeDialog} onOpenChange={setShowTimeRangeDialog}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Start New Analysis</DialogTitle>
            <DialogDescription>
              Configure your burnout analysis settings and data sources
            </DialogDescription>
          </DialogHeader>

          {/* No Integrations State */}
          {noIntegrationsFound ? (
            <div className="space-y-4">
              <Alert className="border-red-200 bg-red-50">
                <AlertCircle className="w-4 h-4 text-red-600" />
                <AlertDescription className="text-red-800">
                  <strong>No Primary Integrations Connected</strong>
                  <span className="block mt-2">
                    To start a burnout analysis, you need to connect at least one primary integration (Rootly or PagerDuty).
                  </span>
                </AlertDescription>
              </Alert>

              <button
                onClick={() => {
                  setShowTimeRangeDialog(false)
                  setNoIntegrationsFound(false)
                  router.push('/integrations')
                }}
                className="w-full px-4 py-2 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 transition-colors"
              >
                Go to Integrations
              </button>
            </div>
          ) : (
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-2 block">
                Organization
              </label>
              <div className="p-3 bg-gray-50 rounded-md border border-gray-200">
                {(() => {
                  const selected = integrations.find(i => i.id.toString() === dialogSelectedIntegration)
                  if (selected) {
                    // Use same logic as integrations page - show integration.name
                    const organizationName = selected.name
                    
                    // Use platform field from backend (not inferred from name)
                    let platformColor = 'bg-gray-500' // default
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
                          <span className="font-medium">
                            {organizationName}
                          </span>
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
                  return <span className="text-gray-500">No organization selected</span>
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
                <div className="p-3 bg-gray-50 rounded-md border border-gray-200">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Users className="w-4 h-4 text-gray-500" />
                      <span className="text-sm font-medium text-gray-700">
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
                  <p className="text-xs text-gray-500 mt-1">
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
                <label className="text-sm font-medium text-gray-700 mb-2 block">
                  Additional Data Sources
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {/* GitHub Toggle Card */}
                  {true && (
                    <div className={`border rounded-lg p-3 transition-all ${includeGithub && githubIntegration ? 'border-gray-900 bg-gray-50' : 'border-gray-200 bg-white'}`}>
                      {/* Always show GitHub content immediately, no skeleton loader */}
                      {(
                        <>
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex items-center space-x-2">
                              <div className="w-6 h-6 bg-gray-900 rounded flex items-center justify-center">
                                <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M10 0C4.477 0 0 4.484 0 10.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0110 4.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.203 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.942.359.31.678.921.678 1.856 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0020 10.017C20 4.484 15.522 0 10 0z" clipRule="evenodd" />
                                </svg>
                              </div>
                              <div>
                                <h3 className="text-sm font-medium text-gray-900">GitHub</h3>
                              </div>
                            </div>
                            <Switch
                              checked={includeGithub && !!githubIntegration}
                              onCheckedChange={(checked) => {
                                if (!githubIntegration) {
                                  toast.error("GitHub not connected - please connect on integrations page")
                                } else {
                                  setIncludeGithub(checked)
                                }
                              }}
                              disabled={false}
                            />
                          </div>
                          <p className="text-xs text-gray-600 mb-1">Code patterns & activity</p>
                          <p className="text-xs text-gray-500">{githubIntegration?.github_username || 'Not connected'}</p>
                        </>
                      )}
                    </div>
                  )}

                  {/* Slack Toggle Card */}
                  {true && (
                    <div className={`border rounded-lg p-3 transition-all ${includeSlack && slackIntegration ? 'border-purple-500 bg-purple-50' : 'border-gray-200 bg-white'}`}>
                      {/* Always show Slack content immediately, no skeleton loader */}
                      {(
                        <>
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex items-center space-x-2">
                              <div className="w-6 h-6 rounded flex items-center justify-center">
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
                                <h3 className="text-sm font-medium text-gray-900">Slack</h3>
                              </div>
                            </div>
                            <Switch
                              checked={includeSlack && !!slackIntegration && slackIntegration.communication_patterns_enabled === true}
                              onCheckedChange={(checked) => {
                                if (!slackIntegration) {
                                  toast.error("Slack not connected - please connect on integrations page")
                                } else if (!slackIntegration.communication_patterns_enabled) {
                                  toast.error("Slack communication patterns analysis is disabled. Enable it in the integrations page.")
                                } else {
                                  setIncludeSlack(checked)
                                }
                              }}
                              disabled={!slackIntegration || !slackIntegration.communication_patterns_enabled}
                            />
                          </div>
                          <p className="text-xs text-gray-600 mb-1">Communication patterns</p>
                        </>
                      )}
                    </div>
                  )}

                  {/* Jira Toggle Card */}
                  {true && (
                    <div className={`border rounded-lg p-3 transition-all ${includeJira && jiraIntegration ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white'}`}>
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
                                <h3 className="text-sm font-medium text-gray-900">Jira</h3>
                              </div>
                            </div>
                            <Switch
                              checked={includeJira && !!jiraIntegration}
                              onCheckedChange={(checked) => {
                                if (!jiraIntegration) {
                                  toast.error("Jira not connected - please connect on integrations page")
                                } else {
                                  setIncludeJira(checked)
                                }
                              }}
                              disabled={false}
                            />
                          </div>
                          <p className="text-xs text-gray-600 mb-1">Issue tracking</p>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* AI Insights Toggle */}
            <div>
              <label className="text-sm font-medium text-gray-700 mb-2 block">
                AI Insights
              </label>
              <div className={`border rounded-lg p-4 transition-all ${enableAI ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white'}`}>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                      <div className="w-5 h-5 text-blue-600">🤖</div>
                    </div>
                    <div>
                      <h3 className="text-sm font-medium text-gray-900">Executive Summary</h3>
                      <p className="text-xs text-gray-600">Analyze the data and generates a report</p>
                    </div>
                  </div>
                  <Switch
                    checked={enableAI}
                    onCheckedChange={setEnableAI}
                  />
                </div>
                
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    <span className="text-xs font-medium text-green-700">
                      Anthropic Claude Connected (Railway)
                    </span>
                  </div>
                </div>
              </div>
            </div>
            
            <div>
              <label className="text-sm font-medium text-gray-700 mb-2 block">
                Analysis Time Range
              </label>
              <Select value={selectedTimeRange} onValueChange={setSelectedTimeRange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">Last 7 days</SelectItem>
                  <SelectItem value="14">Last 14 days</SelectItem>
                  <SelectItem value="30">Last 30 days</SelectItem>
                  <SelectItem value="60">Last 60 days</SelectItem>
                  <SelectItem value="90">Last 90 days</SelectItem>
                  <SelectItem value="180">Last 6 months</SelectItem>
                  <SelectItem value="365">Last year</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end space-x-2 pt-4">
              <Button variant="outline" onClick={() => setShowTimeRangeDialog(false)}>
                Cancel
              </Button>
              <Button
                onClick={runAnalysisWithTimeRange}
                className="bg-purple-600 hover:bg-purple-700"
                disabled={!dialogSelectedIntegration || (() => {
                  const selectedIntegration = integrations.find(i => i.id.toString() === dialogSelectedIntegration);

                  // Check if no team members synced
                  if ((selectedIntegration?.total_users || 0) === 0) {
                    return true;
                  }

                  // Only check permissions for Rootly integrations, not PagerDuty
                  if (selectedIntegration?.platform === 'rootly') {
                    const hasUserPermission = selectedIntegration?.permissions?.users?.access;
                    const hasIncidentPermission = selectedIntegration?.permissions?.incidents?.access;
                    return !hasUserPermission || !hasIncidentPermission;
                  }

                  // For PagerDuty or other platforms, don't block based on permissions
                  return false;
                })()}
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
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    }>
      <DashboardContent />
    </Suspense>
  )
}