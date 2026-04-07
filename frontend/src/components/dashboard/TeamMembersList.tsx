"use client"

import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ChevronDown, ChevronRight, Users, Loader2, TrendingUp, TrendingDown, Minus, ChevronsUp, ChevronsDown, Info } from "lucide-react"
import { useState } from "react"
import Image from "next/image"
import {
  getRiskScore100FromDailyHealth,
  getRiskScore100FromMember,
  hasMemberRiskScore,
} from "@/lib/scoring"

// User trend categories (5 levels)
type UserTrend = 'significantly_worsening' | 'worsening' | 'stable' | 'improving' | 'significantly_improving'

interface TrendInfo {
  trend: UserTrend
  percentage: number
  firstHalfScore: number
  secondHalfScore: number
}

// Get Monday of the week for a given date (same as UserObjectiveDataCard)
function getWeekStartDate(date: Date): string {
  const dayOfWeek = date.getDay()
  const monday = new Date(date)
  monday.setDate(date.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1))
  return monday.toISOString().split('T')[0]
}

// Aggregate daily data into weekly buckets using health_score (same as UserObjectiveDataCard)
function aggregateToWeekly(dailyData: Record<string, any>): { weekStart: string; score: number }[] {
  const dates = Object.keys(dailyData).sort()
  if (dates.length === 0) return []

  // Group by calendar week (Monday-Sunday) - same as UserObjectiveDataCard
  const weeklyBuckets = new Map<string, number[]>()

  for (const date of dates) {
    const dayData = dailyData[date]
    const dayScore = getRiskScore100FromDailyHealth(dayData)
    const weekKey = getWeekStartDate(new Date(date))

    const bucket = weeklyBuckets.get(weekKey) || []
    bucket.push(dayScore)
    weeklyBuckets.set(weekKey, bucket)
  }

  return Array.from(weeklyBuckets.entries())
    .map(([weekStart, scores]) => ({
      weekStart,
      score: scores.reduce((a, b) => a + b, 0) / scores.length
    }))
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart))
}

// Calculate user trend using OLS linear regression on weekly scores
function calculateUserTrend(
  userEmail: string,
  individualDailyData: Record<string, Record<string, any>> | undefined
): TrendInfo {
  const defaultTrend: TrendInfo = { trend: 'stable', percentage: 0, firstHalfScore: 0, secondHalfScore: 0 }

  if (!individualDailyData || !userEmail) return defaultTrend

  const userData = individualDailyData[userEmail] || individualDailyData[userEmail.toLowerCase()]
  if (!userData) return defaultTrend

  const weeklyData = aggregateToWeekly(userData)
  if (weeklyData.length < 2) return defaultTrend

  const scores = weeklyData.map((w) => w.score)

  // If all weekly scores are zero there is nothing to trend on
  if (scores.every((s) => s <= 0)) return defaultTrend
  const n = scores.length
  const xMean = (n - 1) / 2
  const yMean = scores.reduce((s, v) => s + v, 0) / n

  let num = 0, den = 0
  for (let i = 0; i < n; i++) {
    num += (i - xMean) * (scores[i] - yMean)
    den += (i - xMean) ** 2
  }

  const slope = den !== 0 ? num / den : 0
  const intercept = yMean - slope * xMean

  const predicted0 = intercept
  const predictedN = intercept + slope * (n - 1)

  // If the regression predicts the user ends at or below zero, they have no meaningful risk trend
  if (predictedN <= 0) return defaultTrend

  // For low absolute scores use point diff to avoid misleading % (e.g. 0→3 = "300%")
  const bothLow = predicted0 < 10 && predictedN < 10
  const absDiff = predictedN - predicted0

  let change: number
  if (bothLow) {
    change = absDiff
  } else {
    const baseline = Math.abs(predicted0) > 0 ? predicted0 : 1
    change = ((predictedN - predicted0) / baseline) * 100
  }

  let trend: UserTrend
  if (bothLow) {
    if (absDiff <= -5)      trend = 'significantly_improving'
    else if (absDiff <= -2) trend = 'improving'
    else if (absDiff >= 5)  trend = 'significantly_worsening'
    else if (absDiff >= 2)  trend = 'worsening'
    else                    trend = 'stable'
  } else {
    if (change <= -30)      trend = 'significantly_improving'
    else if (change <= -15) trend = 'improving'
    else if (change >= 30)  trend = 'significantly_worsening'
    else if (change >= 15)  trend = 'worsening'
    else                    trend = 'stable'
  }

  const displayPercentage = bothLow ? Math.round(Math.abs(absDiff)) : Math.round(Math.abs(change))
  return { trend, percentage: displayPercentage, firstHalfScore: predicted0, secondHalfScore: predictedN }
}

// Get trend display config
function getTrendConfig(trend: UserTrend) {
  switch (trend) {
    case 'significantly_improving':
      return {
        label: 'Improving Fast',
        icon: <><TrendingUp className="w-4 h-4" /><TrendingUp className="w-4 h-4" /></>,
        className: 'bg-green-100 text-green-700 border-green-200',
        tooltip: 'Workload decreased significantly'
      }
    case 'improving':
      return {
        label: 'Improving',
        icon: <TrendingUp className="w-4 h-4" />,
        className: 'bg-green-50 text-green-600 border-green-100',
        tooltip: 'Workload trending down'
      }
    case 'stable':
      return {
        label: 'Stable',
        icon: <Minus className="w-4 h-4" />,
        className: 'bg-purple-50 text-purple-600 border-purple-200',
        tooltip: 'Workload consistent'
      }
    case 'worsening':
      return {
        label: 'Worsening',
        icon: <TrendingDown className="w-4 h-4" />,
        className: 'bg-yellow-50 text-yellow-700 border-yellow-100',
        tooltip: 'Workload trending up'
      }
    case 'significantly_worsening':
      return {
        label: 'Critical',
        icon: <><TrendingDown className="w-4 h-4" /><TrendingDown className="w-4 h-4" /></>,
        className: 'bg-red-100 text-red-700 border-red-200',
        tooltip: 'Workload increased significantly'
      }
  }
}

interface TeamMembersListProps {
  currentAnalysis: any
  setSelectedMember: (member: any) => void
  connectedIntegrations?: Set<string>
}

export function TeamMembersList({
  currentAnalysis,
  setSelectedMember,
  connectedIntegrations = new Set()
}: TeamMembersListProps) {
  const [showMembersWithoutIncidents, setShowMembersWithoutIncidents] = useState(false);
  const [sortBy, setSortBy] = useState<'risk' | 'trend'>('risk');
  const dataSources = currentAnalysis?.analysis_data?.data_sources;
  const analysisConfig = currentAnalysis?.config;
  const individualDailyData = currentAnalysis?.analysis_data?.individual_daily_data;

  const isDataSourceEnabled = (source: 'github' | 'slack' | 'jira' | 'linear') => {
    if (Array.isArray(dataSources)) {
      return dataSources.includes(source);
    }

    if (dataSources && typeof dataSources === 'object') {
      const keyMap = {
        github: 'github_data',
        slack: 'slack_data',
        jira: 'jira_data',
        linear: 'linear_data'
      } as const;
      const value = (dataSources as any)[keyMap[source]];
      if (typeof value === 'boolean') {
        return value;
      }
    }

    if (analysisConfig) {
      const configMap = {
        github: 'include_github',
        slack: 'include_slack',
        jira: 'include_jira',
        linear: 'include_linear'
      } as const;
      const value = (analysisConfig as any)[configMap[source]];
      if (typeof value === 'boolean') {
        return value;
      }
    }

    return false;
  };

  
  const isLoading = !currentAnalysis || !currentAnalysis.analysis_data

  // OCH 4-color system for progress bars (0-100 scale, higher = more health risk)
  function getOCHProgressColor(score: number): string {
    const clampedScore = Math.max(0, Math.min(100, score))
    if (clampedScore < 25) return '#4ade80'  // Green-400 - Low/minimal health risk (0-24)
    if (clampedScore < 50) return '#facc15'  // Yellow-400 - Mild health risk (25-49)
    if (clampedScore < 75) return '#fb923c'  // Orange-400 - Moderate/significant health risk (50-74)
    return '#f87171'                          // Red-400 - High/severe health risk (75-100)
  }

  const handleMemberClick = (member: any, trendInfo: any) => {
    const memberRiskScore = getRiskScore100FromMember(member)

    setSelectedMember({
      id: member.user_id || '',
      name: member.user_name || 'Unknown',
      email: member.user_email || '',
      avatar_url: member.avatar_url || null,
      healthScore: memberRiskScore,
      riskLevel: (member.risk_level || 'low') as 'high' | 'medium' | 'low',
      trend: trendInfo.trend,
      trendPercentage: trendInfo.percentage,
      incidentsHandled: member.incident_count || 0,
      avgResponseTime: `${Math.round(member.metrics?.avg_response_time_minutes || 0)}m`,
      factors: {
        workload: Math.round(((member.factors?.workload || (member as any).key_metrics?.incidents_per_week || 0)) * 10) / 10,
        afterHours: Math.round(((member.factors?.after_hours || (member as any).key_metrics?.after_hours_percentage || 0)) * 10) / 10,
        incidentLoad: Math.round(((member.factors?.incident_load || (member as any).key_metrics?.incidents_per_week || 0)) * 10) / 10,
      },
      metrics: member.metrics || {},
      github_activity: member.github_activity || null,
      slack_activity: member.slack_activity || null
    })
  }

  const renderMemberRow = (member: any, index: number) => {
    const memberRiskScore = getRiskScore100FromMember(member)
    const rawTrendInfo = calculateUserTrend(member.user_email, individualDailyData)
    const trendInfo = memberRiskScore <= 0 ? { trend: 'stable' as const, percentage: 0, firstHalfScore: 0, secondHalfScore: 0 } : rawTrendInfo
    const trendConfig = getTrendConfig(trendInfo.trend)
    const hasRiskScore = hasMemberRiskScore(member)

    return (
      <tr
        key={`member-${index}-${member.user_email}`}
        className={`cursor-pointer hover:bg-neutral-100 transition-colors border-b border-neutral-100 last:border-b-0 ${index % 2 === 1 ? 'bg-neutral-50' : ''}`}
        onClick={() => handleMemberClick(member, trendInfo)}
      >
        {/* Avatar + Name - Stack on mobile */}
        <td className="py-2 px-2 sm:py-3 sm:px-4 md:py-3 md:px-4">
          <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-3">
            <Avatar className="h-8 w-8 flex-shrink-0">
              {member.avatar_url && (
                <AvatarImage src={member.avatar_url} alt={member.user_name || 'User avatar'} />
              )}
              <AvatarFallback className="text-xs">
                {member.user_name
                  ? member.user_name.split(" ").map((n: string) => n[0]).join("")
                  : member.user_email?.charAt(0).toUpperCase() || "?"}
              </AvatarFallback>
            </Avatar>
            <span className="font-medium text-sm">{member.user_name || member.user_email}</span>
          </div>
        </td>

        {/* Risk Level + Trend (stacked on mobile) */}
        <td className="py-2 px-2 sm:py-3 sm:px-4 md:py-3 md:px-4">
          {hasRiskScore ? (
            <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-3">
              {/* Trend badge (mobile only) */}
              <div className="relative group md:hidden">
                <Badge className={`inline-flex items-center gap-1.5 ${trendConfig.className} border text-xs`}>
                  {trendConfig.icon}
                  {trendConfig.label}
                </Badge>
                {trendInfo.percentage > 0 && (
                  <div className="absolute bottom-full left-0 mb-1 px-2 py-1 bg-neutral-900/95 text-white text-xs rounded whitespace-nowrap opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
                    {trendInfo.trend.includes('improving')
                      ? `Down ${trendInfo.percentage}% (${Math.round(trendInfo.firstHalfScore)} → ${Math.round(trendInfo.secondHalfScore)})`
                      : trendInfo.trend.includes('worsening')
                      ? `Up ${trendInfo.percentage}% (${Math.round(trendInfo.firstHalfScore)} → ${Math.round(trendInfo.secondHalfScore)})`
                      : `Stable (${Math.round(trendInfo.firstHalfScore)} → ${Math.round(trendInfo.secondHalfScore)})`}
                  </div>
                )}
              </div>
              {/* Risk Level Bar and Score */}
              <div className="flex items-center gap-2 md:gap-3">
                <div className="relative h-2 w-16 md:w-24 overflow-hidden rounded-full bg-neutral-200 flex-shrink-0">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${memberRiskScore}%`,
                      backgroundColor: getOCHProgressColor(memberRiskScore)
                    }}
                  />
                </div>
                <span className="text-sm font-medium text-neutral-700 tabular-nums">{Math.round(memberRiskScore)}</span>
              </div>
            </div>
          ) : (
            <span className="text-xs text-neutral-400">No data</span>
          )}
        </td>

        {/* Trend (desktop only) */}
        <td className="py-2 px-2 sm:py-3 sm:px-4 md:py-3 md:px-4 hidden md:table-cell">
          <div className="relative group">
            <Badge className={`inline-flex items-center gap-1.5 ${trendConfig.className} border text-xs`}>
              {trendConfig.icon}
              {trendConfig.label}
            </Badge>
            {trendInfo.percentage > 0 && (
              <div className="absolute bottom-full left-0 mb-1 px-2 py-1 bg-neutral-900/95 text-white text-xs rounded whitespace-nowrap opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
                {trendInfo.trend.includes('improving')
                  ? `Down ${trendInfo.percentage}% (${Math.round(trendInfo.firstHalfScore)} → ${Math.round(trendInfo.secondHalfScore)})`
                  : trendInfo.trend.includes('worsening')
                  ? `Up ${trendInfo.percentage}% (${Math.round(trendInfo.firstHalfScore)} → ${Math.round(trendInfo.secondHalfScore)})`
                  : `Stable (${Math.round(trendInfo.firstHalfScore)} → ${Math.round(trendInfo.secondHalfScore)})`}
              </div>
            )}
          </div>
        </td>

        {/* Incidents */}
        <td className="py-2 px-2 sm:py-3 sm:px-4 md:py-3 md:px-4 hidden md:table-cell">
          <span className="text-sm font-semibold tabular-nums text-neutral-700">{member.incident_count || 0}</span>
        </td>

        {/* On-Call Status */}
        <td className="py-2 px-2 sm:py-3 sm:px-4 md:py-3 md:px-4 hidden md:table-cell">
          {member.is_oncall && (
            <Badge className="bg-purple-50 text-purple-700 border border-purple-200 text-xs">
              ON-CALL
            </Badge>
          )}
        </td>

        {/* Data Sources - mapped icons first, then greyed-out unmapped */}
        <td className="py-2 px-2 sm:py-3 sm:px-4 md:py-3 md:px-4 hidden md:table-cell">
          {(() => {
            const githubEnabled = connectedIntegrations.has('github') && isDataSourceEnabled('github');
            const slackEnabled = connectedIntegrations.has('slack') && isDataSourceEnabled('slack');
            const jiraEnabled = connectedIntegrations.has('jira') && isDataSourceEnabled('jira');
            const linearEnabled = connectedIntegrations.has('linear') && isDataSourceEnabled('linear');

            const hasSurvey = !!currentAnalysis?.analysis_data?.member_surveys?.[member.user_email];

            const integrations = [
              ...(githubEnabled ? [{ key: 'github', mapped: !!member.github_username, title: member.github_username ? `GitHub: ${member.github_username}` : 'GitHub: not mapped' }] : []),
              ...(slackEnabled ? [{ key: 'slack', mapped: !!member.slack_user_id, title: member.slack_user_id ? 'Slack: mapped' : 'Slack: not mapped' }] : []),
              ...(jiraEnabled ? [{ key: 'jira', mapped: !!member.jira_account_id, title: member.jira_account_id ? 'Jira: mapped' : 'Jira: not mapped' }] : []),
              ...(linearEnabled ? [{ key: 'linear', mapped: !!member.linear_user_id, title: member.linear_user_id ? 'Linear: mapped' : 'Linear: not mapped' }] : []),
            ];

            // Mapped first, then unmapped
            const sorted = [...integrations.filter(i => i.mapped), ...integrations.filter(i => !i.mapped)];

            const renderIcon = (key: string, mapped: boolean, title: string) => {
              const opacity = mapped ? '' : 'opacity-25';
              switch (key) {
                case 'github':
                  return (
                    <div key={key} className={`flex items-center justify-center w-5 h-5 bg-neutral-200 rounded-full ${opacity}`} title={title}>
                      <svg className="w-3 h-3 text-neutral-700" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"/>
                      </svg>
                    </div>
                  );
                case 'slack':
                  return (
                    <div key={key} className={`flex items-center justify-center w-5 h-5 bg-white rounded-full border border-neutral-200 ${opacity}`} title={title}>
                      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none">
                        <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52z" fill="#E01E5A"/>
                        <path d="M6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313z" fill="#E01E5A"/>
                        <path d="M8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834z" fill="#36C5F0"/>
                        <path d="M8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312z" fill="#36C5F0"/>
                        <path d="M18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834z" fill="#2EB67D"/>
                        <path d="M17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312z" fill="#2EB67D"/>
                        <path d="M15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52z" fill="#ECB22E"/>
                        <path d="M15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z" fill="#ECB22E"/>
                      </svg>
                    </div>
                  );
                case 'jira':
                  return (
                    <div key={key} className={`flex items-center justify-center w-5 h-5 bg-blue-50 rounded-full border border-blue-200 ${opacity}`} title={title}>
                      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none">
                        <path d="M11.571 11.513H0a5.218 5.218 0 0 0 5.232 5.215h2.13v2.057A5.215 5.215 0 0 0 12.575 24V12.518a1.005 1.005 0 0 0-1.005-1.005zm5.723-5.756H5.736a5.215 5.215 0 0 0 5.215 5.214h2.129v2.058a5.218 5.218 0 0 0 5.215 5.214V6.758a1.001 1.001 0 0 0-1.001-1.001zM23.013 0H11.455a5.215 5.215 0 0 0 5.215 5.215h2.129v2.057A5.215 5.215 0 0 0 24 12.483V1.005A1.001 1.001 0 0 0 23.013 0z" fill="#2684FF"/>
                      </svg>
                    </div>
                  );
                case 'linear':
                  return (
                    <div key={key} className={`flex items-center justify-center w-5 h-5 ${opacity}`} title={title}>
                      <Image src="/images/linear-logo.png" alt="Linear" width={14} height={14} />
                    </div>
                  );
                default:
                  return null;
              }
            };

            return (
              <div className="flex gap-1">
                {/* Primary platform icon */}
                {member.rootly_user_id && (
                  <div className="flex items-center justify-center w-5 h-5 rounded" title="Rootly">
                    <Image src="/images/rootly-logo-icon.jpg" alt="Rootly" width={14} height={14} className="rounded" />
                  </div>
                )}
                {/* Mapped integrations first, then unmapped */}
                {sorted.map(i => <span key={i.key}>{renderIcon(i.key, i.mapped, i.title)}</span>)}
                {/* Survey */}
                {hasSurvey && (
                  <div className="flex items-center justify-center w-5 h-5 bg-blue-50 rounded-full border border-blue-200" title="Survey Data Available">
                    <svg className="w-3 h-3 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                )}
              </div>
            );
          })()}
        </td>
      </tr>
    )
  }

  const renderMemberTable = (members: any[]) => (
    <table className="w-full">
      <thead>
        <tr className="border-b border-neutral-200">
          <th className="text-left text-xs font-medium text-neutral-500 uppercase tracking-wide py-2 px-4 sm:py-2 sm:px-4 md:py-2 md:px-4">Member</th>
          <th className="text-left text-xs font-medium text-neutral-500 uppercase tracking-wide py-2 px-4 sm:py-2 sm:px-4 md:py-2 md:px-4">
            <span className="md:hidden">Risk Level / Trends</span>
            <span className="hidden md:inline">Risk Level</span>
          </th>
          <th className="text-left text-xs font-medium text-neutral-500 uppercase tracking-wide py-2 px-4 sm:py-2 sm:px-4 md:py-2 md:px-4 hidden md:table-cell">Trend ({currentAnalysis?.time_range || 30}d)</th>
          <th className="text-left text-xs font-medium text-neutral-500 uppercase tracking-wide py-2 px-4 sm:py-2 sm:px-4 md:py-2 md:px-4 hidden md:table-cell">Incidents</th>
          <th className="text-left text-xs font-medium text-neutral-500 uppercase tracking-wide py-2 px-4 sm:py-2 sm:px-4 md:py-2 md:px-4 hidden md:table-cell">Status</th>
          <th className="text-left text-xs font-medium text-neutral-500 uppercase tracking-wide py-2 px-4 sm:py-2 sm:px-4 md:py-2 md:px-4 hidden md:table-cell">Data Sources</th>
        </tr>
      </thead>
      <tbody>
        {members.map(renderMemberRow)}
      </tbody>
    </table>
  )

  return (
    <>
      {/* Organization Members Grid */}
      <Card>
        <CardHeader className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <CardTitle className="flex flex-col md:flex-row md:items-center md:gap-1">
              <span className="md:inline">Team Member</span>
              <span className="md:inline">Risk Levels</span>
            </CardTitle>
            <CardDescription>Click on a member to view detailed analysis</CardDescription>
          </div>
          <div className="flex flex-col md:flex-row items-start md:items-center gap-2 md:gap-2 w-full md:w-auto">
            <span className="text-sm text-neutral-500">Sort by:</span>
            <div className="flex items-center bg-neutral-100 rounded-lg p-0.5">
              <button
                onClick={() => setSortBy('risk')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  sortBy === 'risk'
                    ? 'bg-white text-neutral-900 shadow-sm'
                    : 'text-neutral-500 hover:text-neutral-700'
                }`}
              >
                Risk Level
              </button>
              <button
                onClick={() => setSortBy('trend')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  sortBy === 'trend'
                    ? 'bg-white text-neutral-900 shadow-sm'
                    : 'text-neutral-500 hover:text-neutral-700'
                }`}
              >
                Trend
              </button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {(() => {
            const teamAnalysis = currentAnalysis?.analysis_data?.team_analysis
            const allMembers = Array.isArray(teamAnalysis) ? teamAnalysis : teamAnalysis?.members
            
            if (!allMembers || allMembers.length === 0) {
              return (
                <div className="text-center text-neutral-500 py-8">
                  No organization member data available yet
                </div>
              )
            }
            
            // Filter members with valid scores
            const validMembers = allMembers.filter((member) => hasMemberRiskScore(member))
            
            // Separate members with incidents/health risk and those with neither
            // Include members with incidents OR OCH risk level (e.g., from Jira) in main section
            const membersWithIncidents = validMembers.filter(member =>
              (member.incident_count || 0) > 0 || getRiskScore100FromMember(member) > 0
            )
            // Only hide members with BOTH zero incidents AND zero OCH risk level
            const membersWithoutIncidents = validMembers.filter(member =>
              (member.incident_count || 0) === 0 && getRiskScore100FromMember(member) === 0
            )

            // Sort members by selected criteria
            const sortMembers = (members: any[]) => {
              if (sortBy === 'risk') {
                // Sort by OCH risk level (higher score = higher risk)
                return [...members].sort((a, b) => getRiskScore100FromMember(b) - getRiskScore100FromMember(a));
              }

              // Sort by trend (worsening first, then stable, then improving)
              // For same trend level, sort by risk level (higher risk first)
              const trendOrder: Record<string, number> = {
                'significantly_worsening': 0,
                'worsening': 1,
                'stable': 2,
                'improving': 3,
                'significantly_improving': 4
              };

              return [...members].sort((a, b) => {
                const trendA = calculateUserTrend(a.user_email, individualDailyData);
                const trendB = calculateUserTrend(b.user_email, individualDailyData);
                // Use ?? instead of || because 0 is a valid order value (significantly_worsening)
                const trendComparison = (trendOrder[trendA.trend] ?? 2) - (trendOrder[trendB.trend] ?? 2);
                // If same trend level, sort by risk level (higher risk first)
                if (trendComparison === 0) {
                  return getRiskScore100FromMember(b) - getRiskScore100FromMember(a);
                }
                return trendComparison;
              });
            }

            // Sort members alphabetically by name
            const sortMembersAlphabetically = (members: any[]) => members.sort((a, b) => {
              const nameA = (a.user_name || '').toLowerCase();
              const nameB = (b.user_name || '').toLowerCase();
              return nameA.localeCompare(nameB);
            })

            return (
              <>
                {/* Members with incidents or health risk (from Jira, GitHub, etc.) */}
                {membersWithIncidents.length > 0 && (
                  <div className="mb-6">
                    {renderMemberTable(sortMembers(membersWithIncidents))}
                  </div>
                )}

                {/* Collapsible section for members with no activity (no incidents and no health risk) */}
                {(membersWithoutIncidents.length > 0 || isLoading) && (
                  <div className="mt-6">
                    <Button
                      variant="outline"
                      onClick={() => setShowMembersWithoutIncidents(!showMembersWithoutIncidents)}
                      className="w-full mb-4 py-3 md:py-2 px-3 h-auto text-neutral-700 border-neutral-300 hover:bg-neutral-100"
                      disabled={isLoading}
                    >
                      {/* Desktop: Single row */}
                      <div className="hidden md:flex items-center justify-center gap-2">
                        {isLoading ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          showMembersWithoutIncidents ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />
                        )}
                        <Users className="w-4 h-4" />
                        {isLoading ? (
                          'Loading team members...'
                        ) : (
                          <>
                            <span>
                              {showMembersWithoutIncidents ? 'Hide' : 'Show'} team members with no activity
                            </span>
                            <span className="ml-1 text-xs bg-neutral-300 px-2 py-1 rounded">
                              {membersWithoutIncidents.length}
                            </span>
                          </>
                        )}
                      </div>

                      {/* Mobile: Two rows */}
                      <div className="flex flex-col md:hidden gap-1 w-full">
                        {/* Row 1: Logo + First part of text */}
                        <div className="flex items-center gap-2 justify-center">
                          {isLoading ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            showMembersWithoutIncidents ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />
                          )}
                          <Users className="w-4 h-4" />
                          <span className="text-sm">
                            {isLoading ? 'Loading...' : `${showMembersWithoutIncidents ? 'Hide' : 'Show'} team members`}
                          </span>
                        </div>
                        {/* Row 2: Second part of text + Badge */}
                        {!isLoading && (
                          <div className="flex items-center justify-center gap-2">
                            <span className="text-sm">with no activity</span>
                            <span className="text-xs bg-neutral-300 px-2 py-1 rounded">
                              {membersWithoutIncidents.length}
                            </span>
                          </div>
                        )}
                      </div>
                    </Button>

                    {showMembersWithoutIncidents && !isLoading && (
                      <div>
                        {renderMemberTable(sortMembersAlphabetically(membersWithoutIncidents))}
                      </div>
                    )}
                  </div>
                )}

                {/* No members case */}
                {membersWithIncidents.length === 0 && membersWithoutIncidents.length === 0 && (
                  <div className="text-center text-neutral-500 py-8">
                    No team members with valid health data found
                  </div>
                )}
              </>
            )
          })()}
        </CardContent>
      </Card>
    </>
  )
}
