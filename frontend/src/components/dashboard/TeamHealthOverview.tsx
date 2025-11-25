"use client"

import {
  Heart,
  Shield,
  BarChart3,
  Database,
  CheckCircle,
  Minus,
  ChevronDown,
  ChevronRight,
  Info
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

interface TeamHealthOverviewProps {
  currentAnalysis: any
  historicalTrends: any
  expandedDataSources: {
    incident: boolean
    github: boolean
    slack: boolean
  }
  setExpandedDataSources: (fn: (prev: any) => any) => void
}

export function TeamHealthOverview({
  currentAnalysis,
  historicalTrends,
  expandedDataSources,
  setExpandedDataSources
}: TeamHealthOverviewProps) {
  return (
    <>
      {/* OCB Score Tooltip Portal */}
      <div className="fixed z-[99999] invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-gray-900 text-white text-xs rounded-lg p-3 w-72 shadow-lg pointer-events-none"
        id="ocb-score-tooltip"
        style={{ top: '-200px', left: '-200px' }}>
        <div className="space-y-2">
          <div className="text-purple-300 font-semibold mb-2">On-Call Burnout (OCB)</div>
          <div className="text-gray-300 text-sm">
            OCB scores range from <strong>0 to 100</strong>, where higher scores indicate more burnout risk.
          </div>
          <div className="text-gray-300 text-xs mt-2 pt-2 border-t border-gray-600">
            Scientifically validated burnout assessment methodology
          </div>
        </div>
        <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-gray-900"></div>
      </div>

      {/* Info Icon Rubric Tooltip Portal */}
      <div className="fixed z-[99999] invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-gray-900 text-white text-xs rounded-lg p-4 w-80 shadow-lg pointer-events-none"
        id="health-rubric-tooltip"
        style={{ top: '-200px', left: '-200px' }}>
        <div className="space-y-3">
          <div className="text-purple-300 font-semibold text-sm mb-3">OCB Risk Level Scale</div>

          <div className="space-y-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                  <span className="text-green-300 font-medium">Healthy</span>
                </div>
                <span className="text-gray-300">0-24</span>
              </div>
              <div className="text-gray-400 text-xs pl-5">No significant burnout symptoms</div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
                  <span className="text-yellow-300 font-medium">Fair</span>
                </div>
                <span className="text-gray-300">25-49</span>
              </div>
              <div className="text-gray-400 text-xs pl-5">Mild burnout symptoms, monitor trends</div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-orange-500 rounded-full"></div>
                  <span className="text-orange-300 font-medium">Poor</span>
                </div>
                <span className="text-gray-300">50-74</span>
              </div>
              <div className="text-gray-400 text-xs pl-5">Moderate burnout, intervention recommended</div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                  <span className="text-red-300 font-medium">Critical</span>
                </div>
                <span className="text-gray-300">75-100</span>
              </div>
              <div className="text-gray-400 text-xs pl-5">Severe burnout risk, immediate action needed</div>
            </div>
          </div>

          <div className="text-gray-400 text-xs pt-2 border-t border-gray-700">
            Higher scores indicate greater burnout risk
          </div>
        </div>
        <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-gray-900"></div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6 overflow-visible">
        <Card className="border-2 border-purple-200 bg-white/70 backdrop-blur-sm shadow-lg overflow-visible">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-purple-700 flex items-center space-x-2">
              <Heart className="w-4 h-4" />
              <span>Team Health</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {currentAnalysis?.analysis_data?.team_health || (currentAnalysis?.analysis_data?.team_analysis && currentAnalysis?.status === 'completed') ? (
              <div>
                <div className="flex items-start space-x-3">
                  <div>
                    <div className="text-2xl font-bold text-gray-900">{(() => {
                      // Helper function to calculate OCB score from team data - FORCE FRONTEND CALCULATION
                      const calculateOCBFromTeam = () => {
                        const teamAnalysis = currentAnalysis?.analysis_data?.team_analysis;
                        const members = Array.isArray(teamAnalysis) ? teamAnalysis : teamAnalysis?.members;

                        if (!members || members.length === 0) return null;

                        // ALWAYS calculate from individual member OCB scores first
                        const ocbScores = members
                          .map((m: any) => m.ocb_score)
                          .filter((s: any) => s !== undefined && s !== null && s > 0);

                        if (ocbScores.length > 0) {
                          const avgOcbScore = ocbScores.reduce((a: number, b: number) => a + b, 0) / ocbScores.length;
                          return Math.round(avgOcbScore); // Round to whole integer
                        }

                        // No OCB scores available - return null
                        return null;
                      };

                      // FORCE FRONTEND OCB CALCULATION FIRST - Don't trust backend at all!
                      const teamOcbScore = calculateOCBFromTeam();
                      if (teamOcbScore !== null) {
                        return (
                          <>
                            <span>{teamOcbScore}</span>
                            <span
                              className="text-xs text-gray-500 cursor-help ml-1"
                              onMouseEnter={(e) => {
                                const tooltip = document.getElementById('ocb-score-tooltip')
                                if (tooltip) {
                                  const rect = e.currentTarget.getBoundingClientRect()
                                  tooltip.style.top = `${rect.top - 180}px`
                                  tooltip.style.left = `${rect.left - 120}px`
                                  tooltip.classList.remove('invisible', 'opacity-0')
                                  tooltip.classList.add('visible', 'opacity-100')
                                }
                              }}
                              onMouseLeave={() => {
                                const tooltip = document.getElementById('ocb-score-tooltip')
                                if (tooltip) {
                                  tooltip.classList.add('invisible', 'opacity-0')
                                  tooltip.classList.remove('visible', 'opacity-100')
                                }
                              }}
                            >
                              OCB
                            </span>
                          </>
                        );
                      }


                      // Use the latest point from health trends for consistency with chart
                      if (historicalTrends?.daily_trends?.length > 0) {
                        const latestTrend = historicalTrends.daily_trends[historicalTrends.daily_trends.length - 1];
                        return `${Math.round(latestTrend.overall_score * 10)}%`;
                      }
                      // Fallback to current analysis daily trends if available
                      if (currentAnalysis?.analysis_data?.daily_trends?.length > 0) {
                        const latestTrend = currentAnalysis.analysis_data.daily_trends[currentAnalysis.analysis_data.daily_trends.length - 1];
                        return `${Math.round(latestTrend.overall_score * 10)}%`;
                      }

                      // Show real data from team_health if available
                      if (currentAnalysis?.analysis_data?.team_health) {
                        return `${Math.round(currentAnalysis.analysis_data.team_health.overall_score * 10)}%`;
                      }
                      if (currentAnalysis?.analysis_data?.team_summary) {
                        return `${Math.round(currentAnalysis.analysis_data.team_summary.average_score * 10)}%`;
                      }
                      // NO FALLBACK DATA - show actual system state
                      return "No data";
                    })()}</div>
                    <div className="text-xs text-gray-500">Current</div>
                  </div>
                  {(() => {
                    // Show average if we have either historical data OR OCB scores (since we can compute meaningful averages from OCB)
                    const teamAnalysis = currentAnalysis?.analysis_data?.team_analysis;
                    const members = Array.isArray(teamAnalysis) ? teamAnalysis : teamAnalysis?.members;
                    const hasOCBScores = members && members.some((m: any) => m.ocb_score !== undefined && m.ocb_score !== null);
                    const hasHistoricalData = (historicalTrends?.daily_trends?.length > 0) ||
                      (currentAnalysis?.analysis_data?.daily_trends?.length > 0);

                    // Remove average section completely
                    return false;
                  })() && (
                      <div className="hidden">
                        <div className="text-2xl font-bold text-gray-900 flex items-baseline space-x-1">{(() => {
                          // PRIORITY 1: Use OCB scores for meaningful 30-day average (same as current calculation)
                          const teamAnalysis = currentAnalysis?.analysis_data?.team_analysis;
                          const members = Array.isArray(teamAnalysis) ? teamAnalysis : teamAnalysis?.members;

                          if (members && members.length > 0) {
                            // Only include on-call members (those with incidents during the analysis period)
                            const onCallMembers = members.filter((m: any) => m.incident_count > 0);
                            
                            const ocbScores = onCallMembers
                              .map((m: any) => m.ocb_score)
                              .filter((s: any) => s !== undefined && s !== null && s > 0);

                            if (ocbScores.length > 0) {
                              const avgOcbScore = ocbScores.reduce((a: number, b: number) => a + b, 0) / ocbScores.length;
                              const roundedScore = Math.round(avgOcbScore * 10) / 10;

                              return (
                                <>
                                  <span>{roundedScore}</span>
                                  <span
                                    className="text-xs text-gray-500 cursor-help ml-1"
                                    onMouseEnter={(e) => {
                                      const tooltip = document.getElementById('ocb-score-tooltip')
                                      if (tooltip) {
                                        const rect = e.currentTarget.getBoundingClientRect()
                                        tooltip.style.top = `${rect.top - 180}px`
                                        tooltip.style.left = `${rect.left - 120}px`
                                        tooltip.classList.remove('invisible', 'opacity-0')
                                        tooltip.classList.add('visible', 'opacity-100')
                                      }
                                    }}
                                    onMouseLeave={() => {
                                      const tooltip = document.getElementById('ocb-score-tooltip')
                                      if (tooltip) {
                                        tooltip.classList.add('invisible', 'opacity-0')
                                        tooltip.classList.remove('visible', 'opacity-100')
                                      }
                                    }}
                                  >
                                    OCB
                                  </span>
                                </>
                              );
                            }
                          }

                          // PRIORITY 2: Fallback to backend historical data if no OCB scores

                          // Calculate average from Health Trends chart data (legacy method)
                          if (historicalTrends?.daily_trends?.length > 0) {
                            const dailyScores = historicalTrends.daily_trends.map((d: any) => d.overall_score);
                            const average = dailyScores.reduce((a: number, b: number) => a + b, 0) / dailyScores.length;

                            return `${Math.round(average * 10)}%`; // Convert 0-10 to 0-100%
                          }

                          // Fallback: Calculate from current analysis daily trends  
                          if (currentAnalysis?.analysis_data?.daily_trends?.length > 0) {
                            const dailyScores = currentAnalysis.analysis_data.daily_trends.map((d: any) => d.overall_score);
                            const average = dailyScores.reduce((a: number, b: number) => a + b, 0) / dailyScores.length;

                            return `${Math.round(average * 10)}%`; // Convert 0-10 to 0-100%
                          }

                          // Use current score if daily trends are empty but historical available
                          if (historicalTrends?.daily_trends?.length > 0) {
                            const latestTrend = historicalTrends.daily_trends[historicalTrends.daily_trends.length - 1];
                            return `${Math.round(latestTrend.overall_score * 10)}%`;
                          }
                          return "No data";
                        })()}</div>
                        <div className="text-xs text-gray-500">{currentAnalysis?.time_range || 30}-day avg</div>
                      </div>
                    )}
                </div>
                <div className="mt-2 flex items-center space-x-1">
                  <div className="text-sm font-medium text-purple-600">{(() => {
                    // Helper function to get current health percentage
                    const getCurrentHealthPercentage = () => {
                      const teamAnalysis = currentAnalysis?.analysis_data?.team_analysis;
                      const members = Array.isArray(teamAnalysis) ? teamAnalysis : teamAnalysis?.members;

                      if (members && members.length > 0) {
                        // Only include on-call members (those with incidents during the analysis period)
                        const onCallMembers = members.filter((m: any) => m.incident_count > 0);
                        
                        if (onCallMembers.length > 0) {
                          const ocbScores = onCallMembers.map((m: any) => m.ocb_score).filter((s: any) => s !== undefined && s !== null);
                          
                          if (ocbScores.length > 0) {
                            const avgOcbScore = ocbScores.reduce((a: number, b: number) => a + b, 0) / ocbScores.length;
                            // OCB: Return raw OCB score (0-100 where higher = more burnout)
                            return avgOcbScore;
                          }
                        }

                        // No OCB scores - no health percentage available
                      }

                      // Fallback to existing daily trends logic
                      if (historicalTrends?.daily_trends?.length > 0) {
                        const latestTrend = historicalTrends.daily_trends[historicalTrends.daily_trends.length - 1];
                        return latestTrend.overall_score * 10;
                      } else if (currentAnalysis?.analysis_data?.daily_trends?.length > 0) {
                        const latestTrend = currentAnalysis.analysis_data.daily_trends[currentAnalysis.analysis_data.daily_trends.length - 1];
                        return latestTrend.overall_score * 10;
                      } else if (currentAnalysis?.analysis_data?.team_health) {
                        return currentAnalysis.analysis_data.team_health.overall_score * 10;
                      } else if (currentAnalysis?.analysis_data?.team_summary) {
                        return currentAnalysis.analysis_data.team_summary.average_score * 10;
                      }

                      return 0;
                    };

                    const ocbScore = getCurrentHealthPercentage();

                    // Convert to health status based on raw OCB score (0-100, higher=worse burnout)
                    // Match OCB ranges: Healthy (0-24), Fair (25-49), Poor (50-74), Critical (75-100)
                    if (ocbScore < 25) return 'Healthy';      // OCB 0-24 - Low/minimal burnout risk
                    if (ocbScore < 50) return 'Fair';         // OCB 25-49 - Mild burnout symptoms 
                    if (ocbScore < 75) return 'Poor';         // OCB 50-74 - Moderate burnout risk
                    return 'Critical';                        // OCB 75-100 - High/severe burnout risk
                  })()}</div>
                  <Info className="w-3 h-3 text-purple-500"
                    onMouseEnter={(e) => {
                      const tooltip = document.getElementById('health-rubric-tooltip')
                      if (tooltip) {
                        const rect = e.currentTarget.getBoundingClientRect()
                        tooltip.style.top = `${rect.top - 220}px`
                        tooltip.style.left = `${rect.left - 160}px`
                        tooltip.classList.remove('invisible', 'opacity-0')
                        tooltip.classList.add('visible', 'opacity-100')
                      }
                    }}
                    onMouseLeave={() => {
                      const tooltip = document.getElementById('health-rubric-tooltip')
                      if (tooltip) {
                        tooltip.classList.add('invisible', 'opacity-0')
                        tooltip.classList.remove('visible', 'opacity-100')
                      }
                    }} />
                </div>
                <p className="text-xs text-gray-600 mt-1">
                  {(() => {
                    // Use the same health calculation logic for consistency 
                    const getCurrentHealthPercentage = () => {
                      const teamAnalysis = currentAnalysis?.analysis_data?.team_analysis;
                      const members = Array.isArray(teamAnalysis) ? teamAnalysis : teamAnalysis?.members;

                      if (members && members.length > 0) {
                        // Only include on-call members (those with incidents during the analysis period)
                        const onCallMembers = members.filter((m: any) => m.incident_count > 0);
                        
                        if (onCallMembers.length > 0) {
                          const ocbScores = onCallMembers.map((m: any) => m.ocb_score).filter((s: any) => s !== undefined && s !== null);
                          
                          if (ocbScores.length > 0) {
                            const avgOcbScore = ocbScores.reduce((a: number, b: number) => a + b, 0) / ocbScores.length;
                            return avgOcbScore; // Return raw OCB score
                          }
                        }

                        // No OCB scores - return null
                      }

                      // Fallback to legacy daily trends logic
                      if (historicalTrends?.daily_trends?.length > 0) {
                        const latestTrend = historicalTrends.daily_trends[historicalTrends.daily_trends.length - 1];
                        return latestTrend.overall_score * 10;
                      } else if (currentAnalysis?.analysis_data?.daily_trends?.length > 0) {
                        const latestTrend = currentAnalysis.analysis_data.daily_trends[currentAnalysis.analysis_data.daily_trends.length - 1];
                        return latestTrend.overall_score * 10;
                      }

                      return 50; // Default middle value
                    };

                    const ocbScore = getCurrentHealthPercentage();

                    // Match OCB score ranges and descriptions (0-100, higher = more burnout)
                    if (ocbScore < 25) {
                      return 'Low/minimal burnout risk, sustainable workload'  // Healthy
                    } else if (ocbScore < 50) {
                      return 'Mild burnout symptoms, watch for trends'         // Fair
                    } else if (ocbScore < 75) {
                      return 'Moderate burnout risk, intervention recommended' // Poor
                    } else {
                      return 'High/severe burnout risk, urgent action needed'  // Critical
                    }
                  })()}
                </p>
              </div>
            ) : (
              <div className="text-gray-500">
                {currentAnalysis?.status === 'failed' ? 'Analysis failed' : 'Analysis in progress...'}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-2 border-purple-200 bg-white/70 backdrop-blur-sm shadow-lg">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-purple-700 flex items-center space-x-2">
              <Shield className="w-4 h-4" />
              <span>At Risk</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {currentAnalysis?.analysis_data?.team_health || (currentAnalysis?.analysis_data?.team_analysis && currentAnalysis?.status === 'completed') ? (
              <div>
                <div className="space-y-1">
                  {(() => {
                    // Calculate OCB-based risk distribution from team members
                    const teamAnalysis = currentAnalysis?.analysis_data?.team_analysis;
                    const members = Array.isArray(teamAnalysis) ? teamAnalysis : teamAnalysis?.members;

                    if (members && members.length > 0) {
                      // Only include on-call members (those with incidents during the analysis period)
                      const onCallMembers = members.filter((m: any) => m.incident_count > 0);
                      
                      const riskCounts = { critical: 0, high: 0, medium: 0, low: 0 };

                      onCallMembers.forEach((member: any) => {
                        if (member.ocb_score !== undefined && member.ocb_score !== null) {
                          // Use OCB scoring (0-100, higher = worse)
                          if (member.ocb_score >= 75) riskCounts.critical++;
                          else if (member.ocb_score >= 50) riskCounts.high++;
                          else if (member.ocb_score >= 25) riskCounts.medium++;
                          else riskCounts.low++;
                        }
                        // No fallback - only count members with OCB scores
                      });

                      return (
                        <>
                          {riskCounts.critical > 0 && (
                            <div className="flex items-center space-x-2">
                              <div className="text-2xl font-bold text-red-800">{riskCounts.critical}</div>
                              <span className="text-sm text-gray-600">Critical (OCB 75-100)</span>
                            </div>
                          )}
                          {riskCounts.high > 0 && (
                            <div className="flex items-center space-x-2">
                              <div className="text-2xl font-bold text-red-600">{riskCounts.high}</div>
                              <span className="text-sm text-gray-600">High (OCB 50-74)</span>
                            </div>
                          )}
                          {riskCounts.medium > 0 && (
                            <div className="flex items-center space-x-2">
                              <div className="text-2xl font-bold text-orange-600">{riskCounts.medium}</div>
                              <span className="text-sm text-gray-600">Medium (OCB 25-49)</span>
                            </div>
                          )}
                          {/* Only show low risk count if it's the majority or no other risks */}
                          {(riskCounts.low > 0 && (riskCounts.critical + riskCounts.high + riskCounts.medium === 0)) && (
                            <div className="flex items-center space-x-2">
                              <div className="text-2xl font-bold text-green-600">{riskCounts.low}</div>
                              <span className="text-sm text-gray-600">Low (OCB 0-24)</span>
                            </div>
                          )}
                          {/* Show "Everyone healthy" message if all low risk */}
                          {(riskCounts.critical + riskCounts.high + riskCounts.medium === 0) && (
                            <div className="text-center py-2">
                              <div className="text-sm text-green-700 font-medium">🎉 Team shows healthy burnout levels</div>
                              <div className="text-xs text-green-600">{riskCounts.low} member{riskCounts.low !== 1 ? 's' : ''} with low burnout risk</div>
                            </div>
                          )}
                        </>
                      );
                    }

                    // Fallback to legacy risk distribution
                    return (
                      <>
                        {(currentAnalysis.analysis_data.team_health?.risk_distribution?.critical > 0 || currentAnalysis.analysis_data.team_summary?.risk_distribution?.critical > 0) && (
                          <div className="flex items-center space-x-2">
                            <div className="text-2xl font-bold text-red-800">{currentAnalysis.analysis_data.team_health?.risk_distribution?.critical || currentAnalysis.analysis_data.team_summary?.risk_distribution?.critical || 0}</div>
                            <span className="text-sm text-gray-600">Critical risk</span>
                          </div>
                        )}
                        <div className="flex items-center space-x-2">
                          <div className="text-2xl font-bold text-red-600">{currentAnalysis.analysis_data.team_health?.risk_distribution?.high || currentAnalysis.analysis_data.team_summary?.risk_distribution?.high || 0}</div>
                          <span className="text-sm text-gray-600">High risk</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <div className="text-2xl font-bold text-orange-600">{currentAnalysis.analysis_data.team_health?.risk_distribution?.medium || currentAnalysis.analysis_data.team_summary?.risk_distribution?.medium || 0}</div>
                          <span className="text-sm text-gray-600">Medium risk</span>
                        </div>
                      </>
                    );
                  })()}
                </div>
                <p className="text-xs text-gray-600 mt-2">
                  Out of {Array.isArray(currentAnalysis.analysis_data.team_analysis) ? currentAnalysis.analysis_data.team_analysis.length : (currentAnalysis.analysis_data.team_analysis?.members?.length || 0)} members
                </p>
              </div>
            ) : (
              <div className="text-gray-500">
                {currentAnalysis?.status === 'failed' ? 'Analysis failed' : 'Analysis in progress...'}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-2 border-purple-200 bg-white/70 backdrop-blur-sm shadow-lg">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-purple-700 flex items-center space-x-2">
              <BarChart3 className="w-4 h-4" />
              <span>Total Incidents</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900">
              {(currentAnalysis.analysis_data as any)?.metadata?.total_incidents !== undefined
                ? (currentAnalysis.analysis_data as any).metadata.total_incidents
                : (currentAnalysis.analysis_data as any)?.team_analysis?.total_incidents !== undefined
                  ? (currentAnalysis.analysis_data as any).team_analysis.total_incidents
                  : currentAnalysis.analysis_data?.partial_data?.incidents?.length || 0}
            </div>
            <p className="text-xs text-gray-600 mt-1">
              In the last {currentAnalysis.time_range || 30} days
            </p>
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
                  sev4_count: metadataBreakdown.sev4_count || 0
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
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <div className="bg-red-50 rounded-lg p-2 text-center">
                      <div className="text-xs font-semibold text-red-700">High Urgency</div>
                      <div className="text-lg font-bold text-red-600">
                        {severityBreakdown.sev1_count}
                      </div>
                    </div>
                    <div className="bg-green-50 rounded-lg p-2 text-center">
                      <div className="text-xs font-semibold text-green-700">Low Urgency</div>
                      <div className="text-lg font-bold text-green-600">
                        {severityBreakdown.sev4_count}
                      </div>
                    </div>
                  </div>
                ) : (
                  // Rootly: Show standard SEV0-SEV4
                  <div className={`mt-4 grid ${severityBreakdown.sev0_count > 0 ? 'grid-cols-5' : 'grid-cols-4'} gap-2`}>
                    {severityBreakdown.sev0_count > 0 && (
                      <div className="bg-purple-50 rounded-lg p-2 text-center">
                        <div className="text-xs font-semibold text-purple-700">SEV0</div>
                        <div className="text-lg font-bold text-purple-600">
                          {severityBreakdown.sev0_count}
                        </div>
                      </div>
                    )}
                    <div className="bg-red-50 rounded-lg p-2 text-center">
                      <div className="text-xs font-semibold text-red-700">SEV1</div>
                      <div className="text-lg font-bold text-red-600">
                        {severityBreakdown.sev1_count}
                      </div>
                    </div>
                    <div className="bg-orange-50 rounded-lg p-2 text-center">
                      <div className="text-xs font-semibold text-orange-700">SEV2</div>
                      <div className="text-lg font-bold text-orange-600">
                        {severityBreakdown.sev2_count}
                      </div>
                    </div>
                    <div className="bg-yellow-50 rounded-lg p-2 text-center">
                      <div className="text-xs font-semibold text-yellow-700">SEV3</div>
                      <div className="text-lg font-bold text-yellow-600">
                        {severityBreakdown.sev3_count}
                      </div>
                    </div>
                    <div className="bg-green-50 rounded-lg p-2 text-center">
                      <div className="text-xs font-semibold text-green-700">SEV4</div>
                      <div className="text-lg font-bold text-green-600">
                        {severityBreakdown.sev4_count}
                      </div>
                    </div>
                  </div>
                )
              );
            })()}
            {currentAnalysis.analysis_data?.session_hours !== undefined && (
              <p className="text-xs text-gray-600 mt-1">
                {currentAnalysis.analysis_data.session_hours?.toFixed(1) || '0.0'} total hours
              </p>
            )}
          </CardContent>
        </Card>

        {/* Data Sources Card */}
        <Card className="border-2 border-blue-200 bg-white/70 backdrop-blur-sm shadow-lg">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-blue-700 flex items-center space-x-2">
              <Database className="w-4 h-4" />
              <span>Data Sources</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {/* Incident Data */}
              <div className="space-y-2">
                <div
                  className="flex items-center cursor-pointer hover:bg-gray-50 rounded px-1 py-0.5 transition-colors"
                  onClick={() => setExpandedDataSources(prev => ({ ...prev, incident: !prev.incident }))}
                >
                  {expandedDataSources.incident ?
                    <ChevronDown className="w-3 h-3 mr-1 text-gray-500" /> :
                    <ChevronRight className="w-3 h-3 mr-1 text-gray-500" />
                  }
                  <div className="w-2 h-2 bg-purple-500 rounded-full mr-2"></div>
                  <span className="text-xs font-medium text-slate-700 flex-1">Incident Management</span>
                  <CheckCircle className="w-3 h-3 text-green-600 ml-2" />
                </div>
                {expandedDataSources.incident && (
                  <div className="ml-7 text-xs text-gray-600 space-y-1">
                    <div>• {(currentAnalysis?.analysis_data as any)?.metadata?.total_incidents || 0} incidents</div>
                    <div>• {(currentAnalysis?.analysis_data as any)?.team_analysis?.members?.length || 0} users</div>
                  </div>
                )}
              </div>

              {/* GitHub Data */}
              <div className="space-y-2">
                <div
                  className="flex items-center cursor-pointer hover:bg-gray-50 rounded px-1 py-0.5 transition-colors"
                  onClick={() => setExpandedDataSources(prev => ({ ...prev, github: !prev.github }))}
                >
                  {expandedDataSources.github ?
                    <ChevronDown className="w-3 h-3 mr-1 text-gray-500" /> :
                    <ChevronRight className="w-3 h-3 mr-1 text-gray-500" />
                  }
                  <div className="w-2 h-2 bg-gray-900 rounded-full mr-2"></div>
                  <span className="text-xs font-medium text-slate-700 flex-1">GitHub Activity</span>
                  {currentAnalysis?.analysis_data?.data_sources?.github_data ? (
                    <CheckCircle className="w-3 h-3 text-green-600 ml-2" />
                  ) : (
                    <Minus className="w-3 h-3 text-gray-400 ml-2" />
                  )}
                </div>
                {expandedDataSources.github && currentAnalysis?.analysis_data?.data_sources?.github_data && (
                  <div className="ml-7 text-xs text-gray-600 space-y-1">
                    <div>• {currentAnalysis?.analysis_data?.github_insights?.total_commits?.toLocaleString() || '0'} commits</div>
                    <div>• {currentAnalysis?.analysis_data?.github_insights?.total_pull_requests?.toLocaleString() || '0'} PRs</div>
                  </div>
                )}
              </div>

              {/* Slack Data */}
              <div className="space-y-2">
                <div
                  className="flex items-center cursor-pointer hover:bg-gray-50 rounded px-1 py-0.5 transition-colors"
                  onClick={() => setExpandedDataSources(prev => ({ ...prev, slack: !prev.slack }))}
                >
                  {expandedDataSources.slack ?
                    <ChevronDown className="w-3 h-3 mr-1 text-gray-500" /> :
                    <ChevronRight className="w-3 h-3 mr-1 text-gray-500" />
                  }
                  <div className="w-2 h-2 bg-purple-500 rounded-full mr-2"></div>
                  <span className="text-xs font-medium text-slate-700 flex-1">Slack Communications</span>
                  {currentAnalysis?.analysis_data?.data_sources?.slack_data ? (
                    <CheckCircle className="w-3 h-3 text-green-600 ml-2" />
                  ) : (
                    <Minus className="w-3 h-3 text-gray-400 ml-2" />
                  )}
                </div>
                {expandedDataSources.slack && currentAnalysis?.analysis_data?.data_sources?.slack_data && (
                  <div className="ml-7 text-xs text-gray-600 space-y-1">
                    <div>• {currentAnalysis?.analysis_data?.slack_insights?.total_messages?.toLocaleString() || '0'} messages</div>
                    <div>• {currentAnalysis?.analysis_data?.slack_insights?.active_channels?.toLocaleString() || '0'} channels</div>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  )
}