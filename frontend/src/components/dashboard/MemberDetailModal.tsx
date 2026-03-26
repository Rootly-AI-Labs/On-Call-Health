"use client"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, BarChart, Bar } from "recharts"
import { Info, RefreshCw, BarChart3, Activity } from "lucide-react"
import { useState, useEffect, useRef } from "react"
import { UserObjectiveDataCard } from "@/components/dashboard/UserObjectiveDataCard"
import { UserRiskFactorsCard } from "@/components/dashboard/UserRiskFactorsCard"
import { UserIncidentCard } from "@/components/dashboard/UserIncidentCard"
import { SurveyResultsCard } from "@/components/dashboard/SurveyResultsCard"
import { TicketingCard } from "@/components/dashboard/TicketingCard"
import { UserAlertsCard } from "@/components/dashboard/UserAlertsCard"
import { getRiskScore100FromDailyHealth, getRiskScore100FromMember } from "@/lib/scoring"

// OCH risk level helpers
function getOCHRiskInfo(score: number | undefined | null): { level: string; label: string } {
  if (score === undefined || score === null) {
    return { level: 'unknown', label: 'Unknown Risk' }
  }
  if (score >= 75) return { level: 'critical', label: 'Critical' }
  if (score >= 50) return { level: 'poor', label: 'Poor' }
  if (score >= 25) return { level: 'fair', label: 'Fair' }
  return { level: 'healthy', label: 'Healthy' }
}

function getOCHBadgeColor(level: string): string {
  switch (level) {
    case 'critical': return 'bg-red-100 text-red-800'
    case 'poor': return 'bg-red-50 text-red-600'
    case 'fair': return 'bg-yellow-50 text-yellow-600'
    case 'healthy': return 'bg-green-50 text-green-600'
    default: return 'bg-gray-50 text-gray-600'
  }
}

function getOCHScoreColor(score: number | undefined): string {
  if (score === undefined) return 'text-gray-900'
  if (score >= 75) return 'text-red-600'
  if (score >= 50) return 'text-orange-600'
  if (score >= 25) return 'text-yellow-600'
  return 'text-green-600'
}

function getGridColsClass(count: number): string {
  if (count === 1) return 'grid-cols-1'
  if (count === 2) return 'grid-cols-2'
  return 'grid-cols-3'
}

// Individual Daily Health Chart component
function IndividualDailyHealthChart({ memberData, analysisId, currentAnalysis }: {
  memberData: any
  analysisId?: number | string
  currentAnalysis?: any
}) {
  const [dailyHealthData, setDailyHealthData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchDailyHealth = async () => {
      if (!memberData?.user_email || !analysisId) {
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
        const url = `${API_BASE}/analyses/${analysisId}/members/${encodeURIComponent(memberData.user_email)}/daily-health`;

        const response = await fetch(url, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
            'Content-Type': 'application/json'
          }
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }

        const result = await response.json();

        if (result.status === 'success' && result.data?.daily_health) {
          const formattedData = result.data.daily_health.map((day: any) => {
            const has_data = day.has_data !== undefined ? day.has_data : day.incident_count > 0;
            const health_score = getRiskScore100FromDailyHealth(day);

            // Calculate fill color based on health score and has_data
            const fill = !has_data ? '#D1D5DB' :
              health_score >= 75 ? '#EF4444' :
              health_score >= 50 ? '#F97316' :
              health_score >= 25 ? '#F59E0B' :
              '#10B981';

            return {
              date: day.date,
              health_score: health_score,
              incident_count: day.incident_count,
              team_health: day.team_health,
              day_name: day.day_name || new Date(day.date).toLocaleDateString('en-US', {
                weekday: 'short', month: 'short', day: 'numeric'
              }),
              factors: day.factors,
              has_data: has_data,
              tooltip_summary: day.tooltip_summary,
              fill: fill,
              stroke: !has_data ? '#9CA3AF' : 'none',
              strokeWidth: !has_data ? 2 : 0,
              strokeDasharray: !has_data ? '4,4' : 'none',
              opacity: !has_data ? 0.7 : 1
            };
          });

          setDailyHealthData(formattedData);
        } else {
          setError(result.message || 'No daily health data available');
        }
      } catch (err) {
        console.error('Error fetching daily health:', err);
        setError('No individual daily health data available - this member had no incident involvement during the analysis period');
      } finally {
        setLoading(false);
      }
    };

    fetchDailyHealth();
  }, [memberData?.user_email, analysisId]);

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <RefreshCw className="w-8 h-8 animate-spin text-neutral-500 mx-auto mb-2" />
          <p className="text-sm text-neutral-700">Loading daily health data...</p>
        </CardContent>
      </Card>
    );
  }

  if (error || !dailyHealthData || dailyHealthData.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <BarChart3 className="w-8 h-8 text-neutral-500 mx-auto mb-2" />
          <p className="text-neutral-500 mb-2">{error || 'No daily health data available'}</p>
          <p className="text-sm text-neutral-700">
            Daily health scores are calculated for days when incidents occur
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Daily Health Timeline</CardTitle>
        <CardDescription>
          Individual daily risk level over the analysis period
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-4 flex flex-wrap items-center gap-4 text-xs text-neutral-500">
          <div className="flex items-center space-x-1">
            <div className="w-3 h-3 bg-red-500 rounded"></div>
            <span>Critical (75-100)</span>
          </div>
          <div className="flex items-center space-x-1">
            <div className="w-3 h-3 bg-orange-500 rounded"></div>
            <span>Poor (50-74)</span>
          </div>
          <div className="flex items-center space-x-1">
            <div className="w-3 h-3 bg-yellow-500 rounded"></div>
            <span>Fair (25-49)</span>
          </div>
          <div className="flex items-center space-x-1">
            <div className="w-3 h-3 bg-green-500 rounded"></div>
            <span>Healthy (0-24)</span>
          </div>
        </div>

        <div style={{ width: '100%', height: '250px' }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={dailyHealthData}
              margin={{ top: 20, right: 30, left: 40, bottom: 60 }}
            >
              <XAxis
                dataKey="day_name"
                fontSize={9}
                angle={-45}
                textAnchor="end"
                height={60}
                tick={{ fill: '#6B7280' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                domain={[0, 100]}
                fontSize={10}
                tick={{ fill: '#6B7280' }}
                axisLine={false}
                tickLine={false}
                label={{
                  value: 'Health Score',
                  angle: -90,
                  position: 'insideLeft',
                  style: { textAnchor: 'middle', fill: '#6B7280', fontSize: '11px' }
                }}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload[0]) {
                    const data = payload[0].payload;
                    if (data.tooltip_summary) {
                      return (
                        <div className="bg-white p-4 border border-neutral-300 rounded-lg shadow-xl text-sm max-w-sm">
                          <div className="whitespace-pre-line text-neutral-900 font-medium leading-relaxed">
                            {data.tooltip_summary}
                          </div>
                          <div className="mt-3 pt-3 border-t border-neutral-300 text-xs">
                            <div className="flex justify-between text-neutral-700 font-semibold">
                              <span>Health Score: {data.health_score}/100</span>
                              <span>Team Avg: {data.team_health}/100</span>
                            </div>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div className="bg-white p-4 border border-neutral-300 rounded-lg shadow-xl text-sm max-w-xs">
                        <p className="font-bold text-neutral-900 mb-3">{data.day_name}</p>
                        {data.has_data ? (
                          <>
                            <p className="text-blue-700 font-semibold mb-1">Health Score: {data.health_score}/100</p>
                            <p className="text-red-700 font-semibold mb-1">Incidents: {data.incident_count}</p>
                            <p className="text-green-700 font-semibold">Team Average: {data.team_health}/100</p>
                          </>
                        ) : (
                          <>
                            <p className="text-neutral-900 font-semibold">No Incidents</p>
                            <p className="text-neutral-700 text-xs font-medium mt-1">Healthy day - no incident involvement</p>
                          </>
                        )}
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Bar
                dataKey="health_score"
                radius={[4, 4, 0, 0]}
                maxBarSize={40}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>

      </CardContent>
    </Card>
  );
}

interface MemberDetailModalProps {
  selectedMember: any | null
  setSelectedMember: (member: any | null) => void
  members: any[]
  analysisId?: number | string
  currentAnalysis?: any
  timeRange?: number | string
  integrations?: any[]
}

export function MemberDetailModal({
  selectedMember,
  setSelectedMember,
  members,
  analysisId,
  currentAnalysis,
  integrations = [],
  timeRange
}: MemberDetailModalProps) {
  const [dailyCommitsData, setDailyCommitsData] = useState<any[]>([]);
  const [loadingCommits, setLoadingCommits] = useState(false);
  const dialogContentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchDailyCommits = async () => {
      if (!selectedMember?.email || !analysisId) {
        return;
      }

      setLoadingCommits(true);
      try {
        const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
        const url = `${API_BASE}/analyses/users/${encodeURIComponent(selectedMember.email)}/github-daily-commits?analysis_id=${analysisId}`;

        const response = await fetch(url, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
            'Content-Type': 'application/json'
          }
        });

        if (response.ok) {
          const result = await response.json();
          if (result.status === 'success' && result.data?.daily_commits) {
            setDailyCommitsData(result.data.daily_commits);
          }
        }
      } catch (err) {
        console.error('Error fetching daily commits:', err);
      } finally {
        setLoadingCommits(false);
      }
    };

    fetchDailyCommits();
  }, [selectedMember?.email, analysisId]);

  // Scroll to top when member changes
  useEffect(() => {
    if (selectedMember && dialogContentRef.current) {
      // Set scrollTop directly and wait for animation to complete
      setTimeout(() => {
        if (dialogContentRef.current) {
          dialogContentRef.current.scrollTop = 0;
        }
      }, 50);
    }
  }, [selectedMember?.email]);

  if (!selectedMember) return null

  return (
    <Dialog open={!!selectedMember} onOpenChange={() => setSelectedMember(null)}>
      <DialogContent
        ref={dialogContentRef}
        className="w-[calc(100vw-1rem)] sm:w-[calc(100vw-3rem)] md:w-auto md:max-w-6xl max-h-[80vh] overflow-y-auto overflow-x-hidden p-3 sm:p-4 md:p-6"
        aria-describedby="member-detail-description"
      >
        {selectedMember && (() => {
          // Find the correct member data from the analysis (consistent with dashboard)
          const memberData = members?.find(m => m.user_id && m.user_id === selectedMember.id)
            || members?.find(m => m.user_email && m.user_email === selectedMember.email)
            || members?.find(m => m.user_name && m.user_name === selectedMember.name);

          return (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center space-x-4">
                  <Avatar className="w-16 h-16">
                    <AvatarImage src={selectedMember?.avatar_url || selectedMember?.avatar} />
                    <AvatarFallback className="text-lg">
                      {selectedMember?.name
                        .split(" ")
                        .map((n) => n[0])
                        .join("")}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h2 className="text-xl font-semibold break-words">{selectedMember?.name}</h2>
                        <p className="text-neutral-700 break-words text-sm">{selectedMember?.role || selectedMember?.email}</p>
                      </div>
                    </div>
                  </div>
                </DialogTitle>
                <DialogDescription id="member-detail-description" className="sr-only">
                  Detailed health analysis and daily health timeline for team member.
                  Shows risk factors, incident response metrics, and daily health scores.
                </DialogDescription>
              </DialogHeader>

              <div className="mt-4 space-y-6">
                {/* Overall Risk Level - Always shown first */}
                {(() => {
                  const score = getRiskScore100FromMember(memberData)
                  const scoreNum = score !== undefined ? Math.round(score) : null
                  const riskInfo = getOCHRiskInfo(score)
                  const barColor = scoreNum === null ? 'bg-neutral-300'
                    : scoreNum >= 75 ? 'bg-red-500'
                    : scoreNum >= 50 ? 'bg-orange-500'
                    : scoreNum >= 25 ? 'bg-yellow-500'
                    : 'bg-green-500'
                  const hasBreakdown = memberData?.och_personal_score !== undefined && memberData?.och_work_score !== undefined

                  return (
                    <Card>
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                          <div className="flex-1 space-y-1.5">
                            <CardTitle>Risk Level</CardTitle>
                            <CardDescription>On-Call Health assessment</CardDescription>
                          </div>
                          <Badge className={`px-3 py-1 text-sm ${getOCHBadgeColor(riskInfo.level)}`}>
                            {riskInfo.label}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="pt-0 pb-6">
                        <div className="mb-4">
                          {/* Score centered above bar */}
                          <div className="text-center mb-2">
                            <span className={`text-4xl font-bold ${getOCHScoreColor(score)}`}>
                              {scoreNum !== null ? scoreNum : 'N/A'}
                            </span>
                            <span className="text-lg text-neutral-400 ml-1">/100</span>
                          </div>
                          {/* Bar + labels */}
                          {scoreNum !== null && (
                            <div>
                              <div className="flex h-3 rounded-full overflow-hidden bg-neutral-100">
                                <div className={`${barColor} rounded-full transition-all`} style={{ width: `${Math.min(scoreNum, 100)}%` }} />
                              </div>
                              <div className="flex justify-between mt-1">
                                <span className="text-[10px] text-neutral-400">Healthy</span>
                                <span className="text-[10px] text-neutral-400">Critical</span>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Personal/Work-Related breakdown */}
                        {hasBreakdown && (
                          <div className="grid grid-cols-2 gap-2">
                            <div className="bg-blue-50 rounded-lg p-2 text-center">
                              <div className="text-xs font-semibold text-blue-600">Personal</div>
                              <div className="text-lg font-bold text-blue-600">{memberData.och_personal_score.toFixed(0)}</div>
                            </div>
                            <div className="bg-orange-50 rounded-lg p-2 text-center">
                              <div className="text-xs font-semibold text-orange-600">Work-Related</div>
                              <div className="text-lg font-bold text-orange-600">{memberData.och_work_score.toFixed(0)}</div>
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )
                })()}

                {/* Dynamic tile ordering - tiles with data appear first */}
                {(() => {
                  // Define all tiles with their data availability checks
                  const isRootly = currentAnalysis?.platform === 'rootly'
                  const tiles = [
                    {
                      id: 'userTrends',
                      order: 1,
                      hasData: memberData?.incident_count > 0, // User trends has data if there are incidents
                      component: (
                        <UserObjectiveDataCard
                          key="userTrends"
                          memberData={memberData}
                          analysisId={analysisId}
                          timeRange={timeRange ?? currentAnalysis?.time_range ?? 30}
                          currentAnalysis={currentAnalysis}
                        />
                      )
                    },
                    ...(isRootly ? [{
                      id: 'userAlerts',
                      order: 2,
                      hasData: true,
                      component: (
                        <UserAlertsCard
                          key="userAlerts"
                          memberData={memberData || selectedMember}
                          alertsMeta={currentAnalysis?.analysis_data?.metadata?.alerts}
                        />
                      )
                    }] : []),
                    {
                      id: 'riskFactors',
                      order: 3,
                      hasData: (memberData?.och_factors?.all?.length || 0) > 0,
                      component: (
                        <UserRiskFactorsCard key="riskFactors" selectedMember={memberData || selectedMember} />
                      )
                    },
                    {
                      id: 'incidents',
                      order: 4,
                      hasData: (memberData?.incident_count || 0) > 0,
                      component: (
                        <UserIncidentCard
                          key="incidents"
                          memberData={memberData || selectedMember}
                          timeRange={typeof timeRange === 'string' ? parseInt(timeRange) : timeRange}
                          platform={currentAnalysis?.platform}
                          incidents={currentAnalysis?.analysis_data?.raw_incident_data || []}
                        />
                      )
                    },
                    {
                      id: 'survey',
                      order: 5,
                      hasData: (currentAnalysis?.analysis_data?.member_surveys?.[selectedMember.user_email || selectedMember.email]?.survey_count_in_period || 0) > 0,
                      component: (
                        <SurveyResultsCard
                          key="survey"
                          surveyData={currentAnalysis?.analysis_data?.member_surveys?.[selectedMember.user_email || selectedMember.email] || null}
                        />
                      )
                    },
                    {
                      id: 'githubSlack',
                      order: 6,
                      hasData: true,
                      component: (() => {
                        const hasGitHubData = !!selectedMember.github_activity

                        const hasSlackData = selectedMember.slack_activity?.messages_sent > 0 ||
                          selectedMember.slack_activity?.channels_active > 0

                        // GitHub tab temporarily hidden — tabCount excludes it
                        const tabCount = [hasSlackData].filter(Boolean).length
                        const defaultTab = "communication"

                        return (
                          <Tabs key="githubSlack" defaultValue={defaultTab} className="w-full">
                            {tabCount > 1 && (
                              <TabsList className={`grid w-full ${getGridColsClass(tabCount)}`}>
                                {/* <TabsTrigger value="github">GitHub</TabsTrigger> */}
                                {hasSlackData && <TabsTrigger value="communication">Communication</TabsTrigger>}
                              </TabsList>
                            )}

                            {/* GitHub Activity Card — temporarily commented out
                            <TabsContent value="github" className="space-y-4">
                              {selectedMember.github_activity ? (
                                <Card>
                                  <CardHeader>
                                    <CardTitle>GitHub Activity</CardTitle>
                                  </CardHeader>
                                  <CardContent className="space-y-4">
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                      <div className="bg-neutral-100 p-3 rounded-md">
                                        <p className="text-xs text-neutral-700">Commits</p>
                                        <p className="text-lg font-semibold text-neutral-900">{selectedMember.github_activity?.commits_count || 0}</p>
                                      </div>
                                      <div className="bg-neutral-100 p-3 rounded-md">
                                        <p className="text-xs text-neutral-700">Commits/Week</p>
                                        <p className="text-lg font-semibold text-neutral-900">{selectedMember.github_activity?.commits_per_week?.toFixed(1) || '0.0'}</p>
                                      </div>
                                      <div className="bg-neutral-100 p-3 rounded-md">
                                        <p className="text-xs text-neutral-700">After Hours</p>
                                        <p className="text-lg font-semibold text-neutral-900">{selectedMember.github_activity?.after_hours_commits || 0}</p>
                                      </div>
                                      <div className="bg-neutral-100 p-3 rounded-md">
                                        <p className="text-xs text-neutral-700">Weekend</p>
                                        <p className="text-lg font-semibold text-neutral-900">{selectedMember.github_activity?.weekend_commits || 0}</p>
                                      </div>
                                    </div>

                                    <Separator />

                                    <div>
                                      {loadingCommits ? (
                                        <div className="text-center py-8">
                                          <RefreshCw className="w-4 h-4 animate-spin text-neutral-500 mx-auto mb-2" />
                                          <p className="text-xs text-neutral-500">Loading commit data...</p>
                                        </div>
                                      ) : dailyCommitsData && dailyCommitsData.length > 0 ? (
                                        <div className="space-y-3">
                                          <div className="h-32">
                                            <ResponsiveContainer width="100%" height="100%">
                                              <AreaChart data={dailyCommitsData}>
                                                <XAxis
                                                  dataKey="date"
                                                  fontSize={10}
                                                  tick={{ fontSize: 10 }}
                                                  domain={[0, 'dataMax']}
                                                />
                                                <YAxis
                                                  fontSize={10}
                                                  tick={{ fontSize: 10 }}
                                                  domain={[0, 'dataMax']}
                                                />
                                                <Tooltip
                                                  content={({ payload, label }) => {
                                                    if (payload && payload.length > 0) {
                                                      const data = payload[0].payload;
                                                      return (
                                                        <div className="bg-white p-2 border border-neutral-200 rounded-lg shadow-lg">
                                                          <p className="text-xs font-semibold text-neutral-900">{label}</p>
                                                          <p className="text-xs text-indigo-600">
                                                            {data.commits} commits
                                                            {data.weekend_commits > 0 && <span className="text-neutral-500 ml-1">(Weekend)</span>}
                                                          </p>
                                                          {data.after_hours_commits > 0 && (
                                                            <p className="text-xs text-neutral-500">
                                                              {data.after_hours_commits} after hours
                                                            </p>
                                                          )}
                                                        </div>
                                                      );
                                                    }
                                                    return null;
                                                  }}
                                                />
                                                <Area
                                                  type="monotone"
                                                  dataKey="commits"
                                                  stroke="#6366F1"
                                                  strokeWidth={2}
                                                  fillOpacity={1}
                                                  fill="url(#colorCommits)"
                                                />
                                              </AreaChart>
                                            </ResponsiveContainer>
                                          </div>
                                          <div className="text-xs text-indigo-600 text-center">
                                            Average: {selectedMember.github_activity.commits_per_week?.toFixed(1) || '0'} commits/week
                                            {selectedMember.github_activity.after_hours_commits > 0 && (
                                              <span className="ml-2">
                                                • {((selectedMember.github_activity.after_hours_commits / selectedMember.github_activity.commits_count) * 100).toFixed(0)}% after hours
                                              </span>
                                            )}
                                          </div>
                                        </div>
                                      ) : (
                                        <div className="text-center py-4">
                                          <p className="text-xs text-neutral-500">Daily commit data not available</p>
                                          <p className="text-xs text-neutral-500 mt-1">
                                            Total: {selectedMember.github_activity?.commits_count || 0} commits
                                          </p>
                                        </div>
                                      )}
                                    </div>

                                    <Separator />

                                    <div className="grid grid-cols-2 gap-4">
                                      <div className="space-y-3">
                                        <div className="bg-neutral-100 p-3 rounded-md">
                                          <p className="text-xs text-neutral-700">Pull Requests</p>
                                          <p className="text-lg font-semibold text-neutral-900">{selectedMember.github_activity?.pull_requests_count || 0}</p>
                                        </div>
                                        <div className="bg-neutral-100 p-3 rounded-md">
                                          <p className="text-xs text-neutral-700">Code Reviews</p>
                                          <p className="text-lg font-semibold text-neutral-900">{selectedMember.github_activity?.reviews_count || 0}</p>
                                        </div>
                                        <div className="bg-neutral-100 p-3 rounded-md">
                                          <p className="text-xs text-neutral-700">Avg PR Size</p>
                                          <p className="text-lg font-semibold text-neutral-900">{selectedMember.github_activity?.avg_pr_size > 0 ? `${selectedMember.github_activity.avg_pr_size} lines` : 'N/A'}</p>
                                        </div>
                                      </div>
                                      <div className="space-y-3">
                                        <div className="bg-neutral-100 p-3 rounded-md">
                                          <p className="text-xs text-neutral-700">After-Hours</p>
                                          <p className="text-lg font-semibold text-orange-600">
                                            {selectedMember.github_activity?.commits_count > 0
                                              ? ((selectedMember.github_activity.after_hours_commits / selectedMember.github_activity.commits_count) * 100).toFixed(1)
                                              : 0}%
                                          </p>
                                        </div>
                                        <div className="bg-neutral-100 p-3 rounded-md">
                                          <p className="text-xs text-neutral-700">Weekend</p>
                                          <p className="text-lg font-semibold text-purple-600">
                                            {selectedMember.github_activity?.commits_count > 0
                                              ? ((selectedMember.github_activity.weekend_commits / selectedMember.github_activity.commits_count) * 100).toFixed(1)
                                              : 0}%
                                          </p>
                                        </div>
                                      </div>
                                    </div>
                                  </CardContent>
                                </Card>
                              ) : (
                                <Card>
                                  <CardContent className="p-6 text-center">
                                    <p className="text-neutral-500">No GitHub activity data available</p>
                                  </CardContent>
                                </Card>
                              )}
                            </TabsContent>
                            */}

                            <TabsContent value="communication" className="space-y-4">
                              {selectedMember.slack_activity ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  <Card className="border border-neutral-200">
                                    <CardHeader>
                                      <CardTitle className="text-sm">Communication Activity</CardTitle>
                                    </CardHeader>
                                    <CardContent className="space-y-3">
                                      <div className="flex justify-between">
                                        <span className="text-sm">Messages Sent</span>
                                        <span className="font-medium">{selectedMember.slack_activity?.messages_sent || 0}</span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span className="text-sm">Active Channels</span>
                                        <span className="font-medium">{selectedMember.slack_activity?.channels_active || 0}</span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span className="text-sm">After Hours Messages</span>
                                        <span className="font-medium">{selectedMember.slack_activity?.after_hours_messages || 0}</span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span className="text-sm">Sentiment Score</span>
                                        <span className="font-medium">{selectedMember.slack_activity?.sentiment_score || 'N/A'}</span>
                                      </div>
                                    </CardContent>
                                  </Card>
                                </div>
                              ) : (
                                <Card>
                                  <CardContent className="p-6 text-center">
                                    <p className="text-neutral-500">No Slack activity data available</p>
                                  </CardContent>
                                </Card>
                              )}
                            </TabsContent>
                          </Tabs>
                        );
                      })()
                    },
                    {
                      id: 'ticketing',
                      order: 7,
                      hasData: (memberData?.jira_tickets?.length || 0) > 0 || (memberData?.linear_issues?.length || 0) > 0,
                      component: <TicketingCard key="ticketing" memberData={memberData} />
                    }
                  ]

                  // Sort tiles: those with data first, those without data last
                  const sortedTiles = [...tiles].sort((a, b) => {
                    if (a.hasData && !b.hasData) return -1
                    if (!a.hasData && b.hasData) return 1
                    return (a.order ?? 0) - (b.order ?? 0)
                  })

                  // Render sorted tiles (filter out null components)
                  return sortedTiles.map(tile => tile.component).filter(Boolean)
                })()}
              </div>
            </>
          )
        })()}
      </DialogContent>
    </Dialog>
  )
}
