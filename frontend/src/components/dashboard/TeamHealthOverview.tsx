"use client"

import {
  BarChart3,
  Heart,
  Info,
  Shield
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { AIInsightsCard } from "./insights/AIInsightsCard"
import { getRiskScore100FromMember, getRiskScore100FromTeamHealth, getRiskScore100FromTrend, getRiskStatusDescription, getRiskStatusLabel } from "@/lib/scoring"

interface TeamHealthOverviewProps {
  currentAnalysis: any
  historicalTrends: any
}

// Helper to get members array from team analysis
function getTeamMembers(currentAnalysis: any): any[] {
  const teamAnalysis = currentAnalysis?.analysis_data?.team_analysis
  return Array.isArray(teamAnalysis) ? teamAnalysis : teamAnalysis?.members || []
}

// Helper to get on-call members (those with incidents)
function getOnCallMembers(currentAnalysis: any): any[] {
  return getTeamMembers(currentAnalysis).filter((m: any) => m.incident_count > 0)
}

// Calculate team OCH score from member scores
function calculateTeamOCHScore(currentAnalysis: any): number | null {
  const members = getTeamMembers(currentAnalysis)
  if (!members || members.length === 0) return null

  const ochScores = members
    .map((m: any) => getRiskScore100FromMember(m))
    .filter((s: any) => s > 0)

  if (ochScores.length === 0) return null
  return Math.round(ochScores.reduce((a: number, b: number) => a + b, 0) / ochScores.length)
}

// Get health percentage from on-call members or fallback sources
function getHealthPercentage(currentAnalysis: any, historicalTrends: any): number {
  const onCallMembers = getOnCallMembers(currentAnalysis)

  if (onCallMembers.length > 0) {
    const ochScores = onCallMembers
      .map((m: any) => getRiskScore100FromMember(m))
      .filter((s: any) => s > 0)

    if (ochScores.length > 0) {
      return ochScores.reduce((a: number, b: number) => a + b, 0) / ochScores.length
    }
  }

  // Fallback to daily trends
  if (historicalTrends?.daily_trends?.length > 0) {
    const latestTrend = historicalTrends.daily_trends[historicalTrends.daily_trends.length - 1]
    return getRiskScore100FromTrend(latestTrend)
  }
  if (currentAnalysis?.analysis_data?.daily_trends?.length > 0) {
    const latestTrend = currentAnalysis.analysis_data.daily_trends[currentAnalysis.analysis_data.daily_trends.length - 1]
    return getRiskScore100FromTrend(latestTrend)
  }
  if (currentAnalysis?.analysis_data?.team_health) {
    return getRiskScore100FromTeamHealth(currentAnalysis.analysis_data.team_health)
  }
  if (currentAnalysis?.analysis_data?.team_summary) {
    const summary = currentAnalysis.analysis_data.team_summary
    if (typeof summary.average_risk_score_100 === "number") return summary.average_risk_score_100
    if (typeof summary.average_health_score_100 === "number") return 100 - summary.average_health_score_100
    const averageScore = summary.average_score
    if (typeof averageScore === "number") return averageScore > 10 ? averageScore : averageScore * 10
  }
  return 0
}

// Convert OCH score to health status label
function getHealthStatusLabel(ochScore: number): string {
  return getRiskStatusLabel(ochScore)
}

// Get health status description
function getHealthStatusDescription(ochScore: number): string {
  return getRiskStatusDescription(ochScore)
}

// Tooltip show/hide helpers
function showTooltip(tooltipId: string, rect: DOMRect, topOffset: number, leftOffset: number): void {
  const tooltip = document.getElementById(tooltipId)
  if (tooltip) {
    tooltip.style.top = `${rect.top - topOffset}px`
    tooltip.style.left = `${rect.left - leftOffset}px`
    tooltip.classList.remove('invisible', 'opacity-0')
    tooltip.classList.add('visible', 'opacity-100')
  }
}

function hideTooltip(tooltipId: string): void {
  const tooltip = document.getElementById(tooltipId)
  if (tooltip) {
    tooltip.classList.add('invisible', 'opacity-0')
    tooltip.classList.remove('visible', 'opacity-100')
  }
}

export function TeamHealthOverview({
  currentAnalysis,
  historicalTrends
}: TeamHealthOverviewProps) {
  return (
    <>
      {/* OCH Risk Level Tooltip Portal */}
      <div className="fixed z-[99999] invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-neutral-900 text-white text-xs rounded-lg p-3 w-72 shadow-lg pointer-events-none"
        id="och-score-tooltip"
        style={{ top: '-200px', left: '-200px' }}>
        <div className="space-y-2">
          <div className="text-purple-300 font-semibold mb-2">On-Call Health Risk Level</div>
          <div className="text-neutral-300 text-xs leading-relaxed">
            Compound score from <strong>0 to 100</strong> combining on-call hours, incident frequency, after-hours pages, and workload distribution. Higher scores indicate higher risk of overwork and burnout.
          </div>
        </div>
        <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-gray-900"></div>
      </div>

      {/* Info Icon Rubric Tooltip Portal */}
      <div className="fixed z-[99999] invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-neutral-900 text-white text-xs rounded-lg p-4 w-80 shadow-lg pointer-events-none"
        id="health-rubric-tooltip"
        style={{ top: '-200px', left: '-200px' }}>
        <div className="space-y-3">
          <div className="text-purple-300 font-semibold text-sm mb-3">On-Call Health Risk Level Scale</div>

          <div className="space-y-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                  <span className="text-green-300 font-medium">Healthy</span>
                </div>
                <span className="text-neutral-500">0-24</span>
              </div>
              <div className="text-neutral-500 text-xs pl-5">Sustainable workload</div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
                  <span className="text-yellow-300 font-medium">Fair</span>
                </div>
                <span className="text-neutral-500">25-49</span>
              </div>
              <div className="text-neutral-500 text-xs pl-5">Monitor for trends</div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-orange-500 rounded-full"></div>
                  <span className="text-orange-300 font-medium">Poor</span>
                </div>
                <span className="text-neutral-500">50-74</span>
              </div>
              <div className="text-neutral-500 text-xs pl-5">Consider intervention</div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                  <span className="text-red-300 font-medium">Critical</span>
                </div>
                <span className="text-neutral-500">75-100</span>
              </div>
              <div className="text-neutral-500 text-xs pl-5">Immediate action needed</div>
            </div>
          </div>

        </div>
        <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-gray-900"></div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6 mb-6 overflow-visible">
        <Card className="border border-neutral-300 overflow-visible min-h-[200px]">
          <CardHeader className="pb-1 md:pb-2 px-2 md:px-4 py-2 md:py-3">
            <CardTitle className="text-xs md:text-base font-medium text-purple-700 flex items-center space-x-1 md:space-x-2">
              <Heart className="w-3 md:w-4 h-3 md:h-4" />
              <span>Team Health</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-0 px-2 md:px-4 py-2 md:py-3">
            {currentAnalysis?.analysis_data?.team_health || (currentAnalysis?.analysis_data?.team_analysis && currentAnalysis?.status === 'completed') ? (
              (() => {
                const teamOchScore = calculateTeamOCHScore(currentAnalysis)
                const scoreValue = teamOchScore ?? (() => {
                  if (historicalTrends?.daily_trends?.length > 0) return Math.round(getRiskScore100FromTrend(historicalTrends.daily_trends[historicalTrends.daily_trends.length - 1]))
                  if (currentAnalysis?.analysis_data?.daily_trends?.length > 0) return Math.round(getRiskScore100FromTrend(currentAnalysis.analysis_data.daily_trends[currentAnalysis.analysis_data.daily_trends.length - 1]))
                  if (currentAnalysis?.analysis_data?.team_health) return Math.round(getRiskScore100FromTeamHealth(currentAnalysis.analysis_data.team_health))
                  if (currentAnalysis?.analysis_data?.team_summary) return Math.round(getHealthPercentage(currentAnalysis, historicalTrends))
                  return null
                })()
                const barColor = scoreValue === null ? 'bg-neutral-300'
                  : scoreValue >= 75 ? 'bg-red-500'
                  : scoreValue >= 50 ? 'bg-orange-500'
                  : scoreValue >= 25 ? 'bg-yellow-500'
                  : 'bg-green-500'

                return (
                  <div>
                    {/* Score */}
                    <div className="text-center mb-2 md:mb-3">
                      <div className="text-xl md:text-3xl font-bold text-neutral-900">
                        {scoreValue !== null ? scoreValue : 'N/A'}
                        <span className="text-[10px] md:text-sm font-normal text-neutral-400 ml-0.5">/100</span>
                      </div>
                      <p className="text-[10px] md:text-xs text-neutral-500 inline-flex items-center gap-0.5 md:gap-1">
                        Risk Level
                        <Info
                          className="w-2.5 md:w-3 h-2.5 md:h-3 text-neutral-400 cursor-help hover:text-neutral-600 transition-colors"
                          onMouseEnter={(e) => showTooltip('och-score-tooltip', e.currentTarget.getBoundingClientRect(), 180, 120)}
                          onMouseLeave={() => hideTooltip('och-score-tooltip')}
                        />
                      </p>
                    </div>

                    {/* Progress bar */}
                    {scoreValue !== null && (
                      <div className="mb-2 md:mb-3">
                        <div className="flex h-1.5 md:h-2 rounded-full overflow-hidden bg-neutral-100">
                          <div className={`${barColor} rounded-full transition-all`} style={{ width: `${Math.min(scoreValue, 100)}%` }} />
                        </div>
                        <div className="flex justify-between mt-0.5 md:mt-1">
                          <span className="text-[8px] md:text-[10px] text-neutral-400">Healthy</span>
                          <span className="text-[8px] md:text-[10px] text-neutral-400">Critical</span>
                        </div>
                      </div>
                    )}

                    {/* Status */}
                    <div className="flex items-center justify-center space-x-0.5 md:space-x-1">
                      <div className="text-[10px] md:text-sm font-medium text-purple-600">
                        {getHealthStatusLabel(getHealthPercentage(currentAnalysis, historicalTrends))}
                      </div>
                      <Info
                        className="w-2.5 md:w-3 h-2.5 md:h-3 text-purple-500 cursor-help"
                        onMouseEnter={(e) => showTooltip('health-rubric-tooltip', e.currentTarget.getBoundingClientRect(), 220, 160)}
                        onMouseLeave={() => hideTooltip('health-rubric-tooltip')}
                      />
                    </div>
                    <p className="text-[9px] md:text-xs text-neutral-500 text-center mt-0.5">
                      {getHealthStatusDescription(getHealthPercentage(currentAnalysis, historicalTrends))}
                    </p>
                  </div>
                )
              })()
            ) : (
              <div className="text-neutral-500">
                {currentAnalysis?.status === 'failed' ? 'Analysis failed' : 'Analysis in progress...'}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border border-neutral-300 min-h-[200px]">
          <CardHeader className="pb-1 md:pb-2 px-2 md:px-4 py-2 md:py-3">
            <CardTitle className="text-xs md:text-base font-medium text-purple-700 flex items-center space-x-1 md:space-x-2">
              <Shield className="w-3 md:w-4 h-3 md:h-4" />
              <span>At Risk</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-0 px-2 md:px-4 py-2 md:py-3">
            {currentAnalysis?.analysis_data?.team_health || (currentAnalysis?.analysis_data?.team_analysis && currentAnalysis?.status === 'completed') ? (
              <div>
                <div className="space-y-1">
                  {(() => {
                    // Calculate OCH-based risk distribution from team members
                    const teamAnalysis = currentAnalysis?.analysis_data?.team_analysis;
                    const members = Array.isArray(teamAnalysis) ? teamAnalysis : teamAnalysis?.members;

                    if (members && members.length > 0) {
                      // Only include on-call members (those with incidents during the analysis period)
                      const onCallMembers = members.filter((m: any) => m.incident_count > 0);

                      const riskCounts = { critical: 0, high: 0, medium: 0, low: 0 };

                      onCallMembers.forEach((member: any) => {
                        const riskScore = getRiskScore100FromMember(member)
                        if (riskScore > 0 || member?.och_score === 0 || member?.risk_score_100 === 0) {
                          // Use OCH scoring (0-100, higher = worse)
                          if (riskScore >= 75) riskCounts.critical++;
                          else if (riskScore >= 50) riskCounts.high++;
                          else if (riskScore >= 25) riskCounts.medium++;
                          else riskCounts.low++;
                        }
                        // No fallback - only count members with OCH risk levels
                      });

                      const atRiskTotal = riskCounts.critical + riskCounts.high + riskCounts.medium;

                      if (atRiskTotal === 0) {
                        return (
                          <div className="text-center py-2 md:py-3">
                            <div className="text-lg md:text-2xl font-bold text-green-600 mb-0.5 md:mb-1">0</div>
                            <div className="text-[10px] md:text-sm text-green-700 font-medium">Team shows healthy levels</div>
                            <div className="text-[9px] md:text-xs text-neutral-500 mt-0.5 md:mt-1">{riskCounts.low} member{riskCounts.low !== 1 ? 's' : ''} with low risk</div>
                          </div>
                        );
                      }

                      const totalOnCall = onCallMembers.length || 1;

                      return (
                        <>
                          {/* Summary number */}
                          <div className="text-center mb-2 md:mb-3">
                            <div className="text-xl md:text-3xl font-bold text-neutral-900">{atRiskTotal}</div>
                            <p className="text-[9px] md:text-xs text-neutral-500">members at risk</p>
                          </div>

                          {/* Risk breakdown - 2x2 on mobile, 4 cols on md+ */}
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-1 md:gap-2">
                            <div className="bg-red-50 rounded-lg p-1 md:p-2 text-center">
                              <div className="text-[8px] md:text-xs font-semibold text-red-800">Critical</div>
                              <div className="text-sm md:text-lg font-bold text-red-700">{riskCounts.critical}</div>
                            </div>
                            <div className="bg-orange-50 rounded-lg p-1 md:p-2 text-center">
                              <div className="text-[8px] md:text-xs font-semibold text-orange-700">High</div>
                              <div className="text-sm md:text-lg font-bold text-orange-600">{riskCounts.high}</div>
                            </div>
                            <div className="bg-yellow-50 rounded-lg p-1 md:p-2 text-center">
                              <div className="text-[8px] md:text-xs font-semibold text-yellow-700">Medium</div>
                              <div className="text-sm md:text-lg font-bold text-yellow-600">{riskCounts.medium}</div>
                            </div>
                            <div className="bg-green-50 rounded-lg p-1 md:p-2 text-center">
                              <div className="text-[8px] md:text-xs font-semibold text-green-700">Low</div>
                              <div className="text-sm md:text-lg font-bold text-green-600">{riskCounts.low}</div>
                            </div>
                          </div>
                        </>
                      );
                    }

                    // Fallback to legacy risk distribution
                    return (
                      <>
                        {(currentAnalysis.analysis_data.team_health?.risk_distribution?.critical > 0 || currentAnalysis.analysis_data.team_summary?.risk_distribution?.critical > 0) && (
                          <div className="flex items-center space-x-2">
                            <div className="text-2xl font-bold text-red-800">{currentAnalysis.analysis_data.team_health?.risk_distribution?.critical || currentAnalysis.analysis_data.team_summary?.risk_distribution?.critical || 0}</div>
                            <span className="text-sm text-neutral-700">Critical risk</span>
                          </div>
                        )}
                        <div className="flex items-center space-x-2">
                          <div className="text-2xl font-bold text-red-600">{currentAnalysis.analysis_data.team_health?.risk_distribution?.high || currentAnalysis.analysis_data.team_summary?.risk_distribution?.high || 0}</div>
                          <span className="text-sm text-neutral-700">High risk</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <div className="text-2xl font-bold text-orange-600">{currentAnalysis.analysis_data.team_health?.risk_distribution?.medium || currentAnalysis.analysis_data.team_summary?.risk_distribution?.medium || 0}</div>
                          <span className="text-sm text-neutral-700">Medium risk</span>
                        </div>
                      </>
                    );
                  })()}
                </div>
                <p className="text-[9px] md:text-xs text-neutral-400 mt-2 md:mt-3 text-center">
                  {Array.isArray(currentAnalysis.analysis_data.team_analysis) ? currentAnalysis.analysis_data.team_analysis.length : (currentAnalysis.analysis_data.team_analysis?.members?.length || 0)} total members
                </p>
              </div>
            ) : (
              <div className="text-neutral-500">
                {currentAnalysis?.status === 'failed' ? 'Analysis failed' : 'Analysis in progress...'}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border border-neutral-300 min-h-[200px]">
          <CardHeader className="pb-1 md:pb-2 px-2 md:px-4 py-2 md:py-3">
            <CardTitle className="text-xs md:text-base font-medium text-purple-700 flex items-center space-x-1 md:space-x-2">
              <BarChart3 className="w-3 md:w-4 h-3 md:h-4" />
              <span>Total Incidents</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-0 px-2 md:px-4 py-2 md:py-3">
            <div className="text-center mb-2 md:mb-3">
              <div className="text-xl md:text-3xl font-bold text-neutral-900">
                {getTeamMembers(currentAnalysis).reduce((sum: number, m: any) => sum + (m.incident_count || 0), 0) ||
                  currentAnalysis.analysis_data?.partial_data?.incidents?.length || 0}
              </div>
              <p className="text-[9px] md:text-xs text-neutral-500">
                In the last {currentAnalysis.time_range || 30} days
              </p>
            </div>
            {(() => {
              // Only show severity breakdown if we have real data - no fake/generated data
              const metadataBreakdown = (currentAnalysis.analysis_data as any)?.metadata?.severity_breakdown;

              let severityBreakdown = null;
              if (metadataBreakdown) {
                // Use existing metadata breakdown (from actual API data)
                severityBreakdown = {
                  sev0_count: metadataBreakdown.sev0_count || 0,
                  sev1_count: metadataBreakdown.sev1_count || 0,
                  sev2_count: metadataBreakdown.sev2_count || 0,
                  sev3_count: metadataBreakdown.sev3_count || 0,
                  sev4_count: metadataBreakdown.sev4_count || 0,
                };
              } else {
                // Only aggregate from daily trends if they contain real incident data
                const dailyTrends = (currentAnalysis.analysis_data as any)?.daily_trends;
                if (dailyTrends && Array.isArray(dailyTrends)) {
                  const aggregated = {
                    sev0_count: 0,
                    sev1_count: 0,
                    sev2_count: 0,
                    sev3_count: 0,
                    sev4_count: 0
                  };

                  dailyTrends.forEach((day: any) => {
                    const dayBreakdown = day.severity_breakdown;
                    // Only count if this day has real incident data (not generated)
                    if (dayBreakdown && day.incident_count > 0) {
                      aggregated.sev0_count += dayBreakdown.sev0 || 0;
                      aggregated.sev1_count += dayBreakdown.sev1 || 0;
                      aggregated.sev2_count += dayBreakdown.sev2 || 0;
                      aggregated.sev3_count += dayBreakdown.sev3 || 0;
                      aggregated.sev4_count += dayBreakdown.low || 0;
                    }
                  });

                  // Only show if we have actual incident data
                  const total = Object.values(aggregated).reduce((sum, count) => sum + count, 0);
                  if (total > 0) {
                    severityBreakdown = aggregated;
                  }
                }
              }

              const isPagerDuty = currentAnalysis?.platform === 'pagerduty';

              return severityBreakdown && (
                isPagerDuty ? (
                  // PagerDuty: Show only High/Low urgency
                  <div className="mt-2 md:mt-4 grid grid-cols-2 gap-1 md:gap-2">
                    <div className="bg-red-50 rounded-lg p-1 md:p-2 text-center">
                      <div className="text-[8px] md:text-xs font-semibold text-red-700">High Urgency</div>
                      <div className="text-sm md:text-lg font-bold text-red-600">
                        {severityBreakdown.sev1_count}
                      </div>
                    </div>
                    <div className="bg-green-50 rounded-lg p-1 md:p-2 text-center">
                      <div className="text-[8px] md:text-xs font-semibold text-green-700">Low Urgency</div>
                      <div className="text-sm md:text-lg font-bold text-green-600">
                        {severityBreakdown.sev4_count}
                      </div>
                    </div>
                  </div>
                ) : (
                  // Rootly: Show standard SEV0-SEV4
                  <div className={`mt-2 md:mt-4 grid ${severityBreakdown.sev0_count > 0 ? 'grid-cols-2 md:grid-cols-5' : 'grid-cols-2 md:grid-cols-4'} gap-1 md:gap-2`}>
                    {severityBreakdown.sev0_count > 0 && (
                      <div className="bg-red-100 rounded-lg p-1 md:p-2 text-center">
                        <div className="text-[8px] md:text-xs font-semibold text-red-800">SEV0</div>
                        <div className="text-sm md:text-lg font-bold text-red-800">
                          {severityBreakdown.sev0_count}
                        </div>
                      </div>
                    )}
                    <div className="bg-red-50 rounded-lg p-1 md:p-2 text-center">
                      <div className="text-[8px] md:text-xs font-semibold text-red-600">SEV1</div>
                      <div className="text-sm md:text-lg font-bold text-red-600">
                        {severityBreakdown.sev1_count}
                      </div>
                    </div>
                    <div className="bg-orange-50 rounded-lg p-1 md:p-2 text-center">
                      <div className="text-[8px] md:text-xs font-semibold text-orange-600">SEV2</div>
                      <div className="text-sm md:text-lg font-bold text-orange-600">
                        {severityBreakdown.sev2_count}
                      </div>
                    </div>
                    <div className="bg-yellow-50 rounded-lg p-1 md:p-2 text-center">
                      <div className="text-[8px] md:text-xs font-semibold text-yellow-600">SEV3</div>
                      <div className="text-sm md:text-lg font-bold text-yellow-600">
                        {severityBreakdown.sev3_count}
                      </div>
                    </div>
                    <div className="bg-green-50 rounded-lg p-1 md:p-2 text-center">
                      <div className="text-[8px] md:text-xs font-semibold text-green-600">SEV4</div>
                      <div className="text-sm md:text-lg font-bold text-green-600">
                        {severityBreakdown.sev4_count}
                      </div>
                    </div>
                  </div>
                )
              );
            })()}
          </CardContent>
        </Card>

        {/* AI Insights Card */}
        <AIInsightsCard currentAnalysis={currentAnalysis} />
      </div>
    </>
  )
}
