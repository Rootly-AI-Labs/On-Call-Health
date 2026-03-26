"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Area,
  AreaChart,
  Bar,
  ComposedChart,
  XAxis,
  YAxis,
  Line,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine
} from "recharts"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Info, TrendingUp, TrendingDown, Minus } from "lucide-react"
import { getRiskScore100FromTrend } from "@/lib/scoring"

interface ObjectiveDataCardProps {
  currentAnalysis: any
  loadingTrends: boolean
}

interface TrendDirection {
  direction: 'up' | 'down' | 'stable'
  percentage: number
}

interface MetricConfig {
  label: string
  color: string
  yAxisLabel: string
  dataKey: string
  weeklyDataKey: string
  showMeanLine: boolean
  transformer: (trend: any) => number
}

interface MetricDescription {
  title: string
  description: string
}

const METRIC_CONFIG: Record<string, MetricConfig> = {
  health_score: {
    label: "Risk Level",
    color: "#7C63D6",
    yAxisLabel: "Risk Level",
    dataKey: "dailyScore",
    weeklyDataKey: "riskLevel",
    showMeanLine: true,
    transformer: (trend: any) => getRiskScore100FromTrend(trend)
  },
  incident_load: {
    label: "Incident Count",
    color: "#7C63D6",
    yAxisLabel: "Incident Count",
    dataKey: "incidentCount",
    weeklyDataKey: "incidentCount",
    showMeanLine: true,
    transformer: (trend: any) => trend.incident_count || 0
  },
  after_hours: {
    label: "After Hours Activity",
    color: "#7C63D6",
    yAxisLabel: "After Hours Activity %",
    dataKey: "afterHoursPercentage",
    weeklyDataKey: "afterHoursPercentage",
    showMeanLine: true,
    transformer: (trend: any) => trend.after_hours_percentage || 0
  },
  severity_weighted: {
    label: "Workload Intensity",
    color: "#7C63D6",
    yAxisLabel: "Severity-Weighted Load",
    dataKey: "severityWeightedCount",
    weeklyDataKey: "severityWeighted",
    showMeanLine: true,
    transformer: (trend: any) => Math.round(trend.severity_weighted_count || 0)
  }
}

const METRIC_DESCRIPTIONS: Record<string, MetricDescription> = {
  health_score: {
    title: "Risk Level",
    description: "Measures the team's overall on-call health based on factors such as incident frequency, after-hours work and severity. Higher scores indicate higher risk of overwork."
  },
  incident_load: {
    title: "Incident Count",
    description: "Total count of incidents handled per day. Counts all incidents regardless of severity or timing."
  },
  after_hours: {
    title: "After Hours Activity",
    description: "Incidents occurring outside business hours (before 9 AM or after 5 PM) or on weekends. Timezone-aware based on each team member's local time."
  },
  severity_weighted: {
    title: "Workload Intensity",
    description: "Measures workload stress by weighting incidents based on their severity level. Higher values indicate more stressful workload."
  }
}

function getWeekStartDate(date: Date): string {
  const dayOfWeek = date.getDay()
  const monday = new Date(date)
  monday.setDate(date.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1))
  return monday.toISOString().split('T')[0]
}

function formatDateShort(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function aggregateToWeekly(dailyData: any[]): any[] {
  if (!dailyData || dailyData.length === 0) return []

  const weeklyBuckets = new Map<string, any[]>()

  for (const day of dailyData) {
    const weekKey = getWeekStartDate(new Date(day.date))
    const bucket = weeklyBuckets.get(weekKey) || []
    bucket.push(day)
    weeklyBuckets.set(weekKey, bucket)
  }

  return Array.from(weeklyBuckets.entries())
    .map(([weekStart, days]) => {
      const dayCount = days.length
      const teamSize = days[0]?.total_members || 1

      const avgRiskLevel = days.reduce((sum, d) => sum + getRiskScore100FromTrend(d), 0) / dayCount
      const totalIncidents = days.reduce((sum, d) => sum + (d.incident_count || 0), 0)
      const avgAfterHours = days.reduce((sum, d) => sum + (d.after_hours_percentage || 0), 0) / dayCount
      const avgSeverityWeighted = days.reduce((sum, d) => sum + (d.severity_weighted_count || 0), 0) / dayCount
      const totalAfterHoursCount = days.reduce((sum, d) => sum + (d.after_hours_count || 0), 0)
      const totalHighSeverity = days.reduce((sum, d) => sum + (d.high_severity_count || 0), 0)

      const rawBreakdown = days.reduce((acc, d) => {
        const breakdown = d.severity_breakdown || { sev0: 0, sev1: 0, sev2: 0, sev3: 0, low: 0 }
        return {
          sev0: acc.sev0 + (breakdown.sev0 || 0),
          sev1: acc.sev1 + (breakdown.sev1 || 0),
          sev2: acc.sev2 + (breakdown.sev2 || 0),
          sev3: acc.sev3 + (breakdown.sev3 || 0),
          low: acc.low + (breakdown.low || 0),
        }
      }, { sev0: 0, sev1: 0, sev2: 0, sev3: 0, low: 0 })

      const incidentPenalty = Math.min((totalIncidents / dayCount / teamSize) * 0.8, 2.0)
      const severityPenalty = Math.min((avgSeverityWeighted / teamSize) * 1.2, 3.0)
      const afterHoursPenalty = Math.min((totalAfterHoursCount / dayCount) * 0.5, 1.5)
      const highSeverityPenalty = Math.min((totalHighSeverity / dayCount) * 0.8, 2.0)
      const totalPenalty = incidentPenalty + severityPenalty + afterHoursPenalty + highSeverityPenalty

      const factors = totalPenalty > 0
        ? {
            incidents: Math.round((incidentPenalty / totalPenalty) * 100),
            severity: Math.round((severityPenalty / totalPenalty) * 100),
            afterHours: Math.round((afterHoursPenalty / totalPenalty) * 100),
            highSeverity: Math.round((highSeverityPenalty / totalPenalty) * 100),
          }
        : { incidents: 0, severity: 0, afterHours: 0, highSeverity: 0 }

      const weekDate = new Date(weekStart)
      const weekEnd = new Date(weekStart)
      weekEnd.setDate(weekEnd.getDate() + 6)

      return {
        weekStart,
        weekLabel: formatDateShort(weekDate),
        weekRange: `${formatDateShort(weekDate)} - ${formatDateShort(weekEnd)}`,
        riskLevel: Math.round(avgRiskLevel),
        incidentCount: totalIncidents,
        afterHoursPercentage: Math.round(avgAfterHours),
        severityWeighted: Math.round(avgSeverityWeighted),
        factors,
        daysInWeek: dayCount,
        severityBreakdown: {
          critical: rawBreakdown.sev0 + rawBreakdown.sev1,
          high: rawBreakdown.sev2,
          mediumLow: rawBreakdown.sev3 + rawBreakdown.low,
        }
      }
    })
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart))
}

function calculateTrend(current: number, previous: number): TrendDirection {
  if (previous === 0) return { direction: 'stable', percentage: 0 }

  const change = ((current - previous) / previous) * 100
  if (Math.abs(change) < 15) return { direction: 'stable', percentage: Math.round(change) }

  return {
    direction: change > 0 ? 'up' : 'down',
    percentage: Math.round(Math.abs(change))
  }
}

function getTrendStatusClass(direction: 'up' | 'down' | 'stable'): string {
  switch (direction) {
    case 'down':
      return 'bg-green-100 text-green-700 border border-green-200'
    case 'up':
      return 'bg-red-100 text-red-700 border border-red-200'
    default:
      return 'bg-purple-50 text-purple-600 border border-purple-200'
  }
}

function getTrendLabel(direction: 'up' | 'down' | 'stable'): string {
  switch (direction) {
    case 'down':
      return 'Improving'
    case 'up':
      return 'Needs Attention'
    default:
      return 'Stable'
  }
}

function getTrendTooltipMessage(
  direction: 'up' | 'down' | 'stable',
  percentage: number,
  firstHalfAvg: number,
  secondHalfAvg: number,
  weeklyMean: number,
  metricLabel: string
): string {
  switch (direction) {
    case 'down':
      return `${metricLabel} dropped ${percentage}% from ${Math.round(firstHalfAvg)} to ${Math.round(secondHalfAvg)} (first vs second half)`
    case 'up':
      return `${metricLabel} increased ${percentage}% from ${Math.round(firstHalfAvg)} to ${Math.round(secondHalfAvg)} (first vs second half)`
    default:
      return `${metricLabel} stable around ${Math.round(weeklyMean)} (less than 5% change)`
  }
}

function getTrendIcon(direction: 'up' | 'down' | 'stable') {
  switch (direction) {
    case 'down':
      return <TrendingDown className="w-4 h-4" />
    case 'up':
      return <TrendingUp className="w-4 h-4" />
    default:
      return <Minus className="w-4 h-4" />
  }
}

function getComparisonClass(direction: 'up' | 'down' | 'stable'): string {
  switch (direction) {
    case 'down':
      return 'text-green-600'
    case 'up':
      return 'text-red-600'
    default:
      return 'text-neutral-500'
  }
}

function formatComparison(trend: TrendDirection): string {
  if (trend.direction === 'stable') return '—'
  const arrow = trend.direction === 'down' ? '↓' : '↑'
  return `${arrow}${trend.percentage}%`
}

function buildDailyChartData(dailyTrends: any[], config: MetricConfig): any[] {
  if (!dailyTrends || dailyTrends.length === 0) return []

  const chartData = dailyTrends.map((trend: any) => ({
    date: formatDateShort(new Date(trend.date)),
    [config.dataKey]: config.transformer(trend),
    incidentCount: trend.incident_count || 0,
    afterHours: trend.after_hours_count || 0,
  }))

  const values = chartData.map((d: any) => d[config.dataKey])
  const mean = values.length > 0 ? values.reduce((a: number, b: number) => a + b, 0) / values.length : 0

  return chartData.map((d: any) => ({ ...d, meanScore: Math.round(mean) }))
}

function calculateWeeklyStats(weeklyData: any[], config: MetricConfig) {
  const weeklyMean = weeklyData.length > 0
    ? weeklyData.reduce((sum, w) => sum + w[config.weeklyDataKey], 0) / weeklyData.length
    : 0

  const halfIndex = Math.floor(weeklyData.length / 2)
  const firstHalfAvg = halfIndex > 0
    ? weeklyData.slice(0, halfIndex).reduce((sum, w) => sum + w[config.weeklyDataKey], 0) / halfIndex
    : 0
  const secondHalfAvg = weeklyData.length - halfIndex > 0
    ? weeklyData.slice(halfIndex).reduce((sum, w) => sum + w[config.weeklyDataKey], 0) / (weeklyData.length - halfIndex)
    : 0

  const currentWeek = weeklyData[weeklyData.length - 1]
  const previousWeek = weeklyData[weeklyData.length - 2]

  return {
    weeklyMean,
    overallTrend: calculateTrend(secondHalfAvg, firstHalfAvg),
    firstHalfAvg,
    secondHalfAvg,
    currentWeek,
    vsLastWeek: currentWeek && previousWeek
      ? calculateTrend(currentWeek[config.weeklyDataKey], previousWeek[config.weeklyDataKey])
      : null,
    vsMean: currentWeek
      ? calculateTrend(currentWeek[config.weeklyDataKey], weeklyMean)
      : null,
  }
}

export function ObjectiveDataCard({
  currentAnalysis,
  loadingTrends
}: ObjectiveDataCardProps) {
  const [selectedMetric, setSelectedMetric] = useState<string>("health_score")
  const [viewMode, setViewMode] = useState<'weekly' | 'daily'>('weekly')

  const dailyTrends = currentAnalysis?.analysis_data?.daily_trends || []
  const timeRange = currentAnalysis?.time_range || currentAnalysis?.analysis_data?.metadata?.days_analyzed || 30
  const config = METRIC_CONFIG[selectedMetric]

  const weeklyData = aggregateToWeekly(dailyTrends)
  const dailyChartData = buildDailyChartData(dailyTrends, config)
  const { weeklyMean, overallTrend, firstHalfAvg, secondHalfAvg, currentWeek, vsLastWeek, vsMean } = calculateWeeklyStats(weeklyData, config)

  const hasData = viewMode === 'weekly' ? weeklyData.length > 0 : dailyChartData.length > 0
  const dailyMean = dailyChartData.length > 0 ? dailyChartData[0]?.meanScore : 0

  function getDescription(): string {
    if (!hasData) {
      return "No trend data available for this analysis"
    }
    if (viewMode === 'weekly') {
      return `Weekly averages over ${timeRange} days. Mean: ${Math.round(weeklyMean)} ${config.label.toLowerCase()}.`
    }
    return `Over the last ${timeRange} days, the average ${config.yAxisLabel.toLowerCase()} was ${Math.round(dailyMean)} points.`
  }

  const description = getDescription()

  if (loadingTrends) {
    return (
      <Card className="mb-6">
        <CardContent className="flex items-center justify-center h-[400px]">
          <div className="text-center">
            <div className="animate-spin w-6 h-6 border-2 border-purple-600 border-t-transparent rounded-full mx-auto mb-2" />
            <p className="text-sm text-neutral-500">Loading trends...</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="mb-6">
      <CardHeader className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-3">
            <CardTitle>Team Trends</CardTitle>
            {viewMode === 'weekly' && hasData && weeklyData.length >= 2 && (() => {
              // Compare first week(s) to last week(s) for true overall direction
              const numWeeksToCompare = Math.min(2, Math.floor(weeklyData.length / 2))
              const firstWeeksAvg = weeklyData.slice(0, numWeeksToCompare).reduce((sum, w) => sum + w[config.weeklyDataKey], 0) / numWeeksToCompare
              const lastWeeksAvg = weeklyData.slice(-numWeeksToCompare).reduce((sum, w) => sum + w[config.weeklyDataKey], 0) / numWeeksToCompare
              const overallDirection = calculateTrend(lastWeeksAvg, firstWeeksAvg)

              return (
                <div className="relative group">
                  <div className={`px-1.5 py-0 md:px-1.5 md:py-0.5 text-xs md:text-xs font-medium flex items-center gap-0.5 md:gap-1 cursor-help rounded-full ${getTrendStatusClass(overallDirection.direction)}`}>
                    {getTrendIcon(overallDirection.direction)}
                    {getTrendLabel(overallDirection.direction)}
                  </div>
                  <div className="absolute top-full left-1/2 transform -translate-x-1/2 mt-2 px-3 py-2 bg-neutral-900/95 text-white text-xs rounded-lg w-52 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
                    <span>
                      {overallDirection.direction === 'down'
                        ? `${config.label} down ${overallDirection.percentage}% from start to end`
                        : overallDirection.direction === 'up'
                        ? `${config.label} up ${overallDirection.percentage}% from start to end`
                        : `${config.label} stable (${Math.round(firstWeeksAvg || 0)} → ${Math.round(lastWeeksAvg || 0)})`}
                    </span>
                  </div>
                </div>
              )
            })()}
          </div>
          <CardDescription>{description}</CardDescription>
        </div>

        <div className="flex items-center flex-wrap gap-2 w-full md:w-auto md:space-x-2">
          {/* View Toggle */}
          <div className="flex items-center bg-neutral-100 rounded-lg p-0.5 flex-1 md:flex-none">
            <button
              onClick={() => setViewMode('weekly')}
              className={`px-3 py-0.5 md:py-1.5 text-xs font-medium rounded-md transition-colors min-h-[32px] md:min-h-0 flex-1 ${
                viewMode === 'weekly'
                  ? 'bg-white text-neutral-900 shadow-sm'
                  : 'text-neutral-500 hover:text-neutral-700'
              }`}
            >
              Weekly
            </button>
            <button
              onClick={() => setViewMode('daily')}
              className={`px-3 py-0.5 md:py-1.5 text-xs font-medium rounded-md transition-colors min-h-[32px] md:min-h-0 flex-1 ${
                viewMode === 'daily'
                  ? 'bg-white text-neutral-900 shadow-sm'
                  : 'text-neutral-500 hover:text-neutral-700'
              }`}
            >
              Daily
            </button>
          </div>

          {/* Info tooltip */}
          <div className="relative group">
            <Info className="w-4 h-4 text-neutral-500 cursor-help hover:text-neutral-700 transition-colors" />
            <div className="absolute top-full right-0 mt-2 px-3 py-2 bg-neutral-900/95 text-white text-xs rounded-lg w-64 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
              <div className="font-semibold mb-1">{METRIC_DESCRIPTIONS[selectedMetric].title}</div>
              <div>{METRIC_DESCRIPTIONS[selectedMetric].description}</div>
            </div>
          </div>

          {/* Metric selector */}
          <Select value={selectedMetric} onValueChange={setSelectedMetric}>
            <SelectTrigger className="w-full md:w-[170px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(METRIC_CONFIG).map(([key, value]: [string, any]) => (
                <SelectItem key={key} value={key}>
                  {value.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>

      <CardContent className="pb-6">
        {!hasData ? (
          <div className="flex items-center justify-center h-[300px]">
            <div className="text-center">
              <div className="w-12 h-12 bg-neutral-200 rounded-full flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <p className="text-sm text-neutral-500 font-medium">No Data Available</p>
              <p className="text-xs text-neutral-500 mt-1">Run an analysis to view trends</p>
            </div>
          </div>
        ) : viewMode === 'weekly' ? (
          <>
            {/* Weekly Bar Chart */}
            <div className="h-[280px] -mx-6 sm:-mx-4 md:mx-0">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={weeklyData}
                  margin={{ top: 20, right: 10, left: -20, bottom: 5 }}
                >
                  <XAxis
                    dataKey="weekLabel"
                    tick={{ fontSize: 11, fill: '#6B7280' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    yAxisId="left"
                    tick={{ fontSize: 11, fill: '#6B7280' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  {(selectedMetric === 'health_score' || selectedMetric === 'incident_load') && (
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      tick={{ fontSize: 11, fill: selectedMetric === 'incident_load' ? '#7C63D6' : '#F59E0B' }}
                      axisLine={false}
                      tickLine={false}
                    />
                  )}
                  <ReferenceLine
                    yAxisId="left"
                    y={weeklyMean}
                    stroke="#9C84E8"
                    strokeDasharray="5 5"
                  />
                  <Tooltip
                    content={({ payload }) => {
                      if (!payload || payload.length === 0) return null
                      const data = payload[0]?.payload
                      const factors = data?.factors || {}
                      const hasFactors = factors.incidents > 0 || factors.severity > 0 || factors.afterHours > 0 || factors.highSeverity > 0
                      const sevBreakdown = data?.severityBreakdown || {}

                      return (
                        <div className="bg-neutral-900/95 p-3 border border-neutral-700 rounded-lg shadow-lg min-w-[200px]">
                          <p className="text-sm font-medium text-neutral-300 mb-2">{data?.weekRange}</p>
                          <p className="text-lg font-bold text-white mb-1">
                            {data?.[config.weeklyDataKey]} {config.label}
                          </p>
                          {selectedMetric === 'health_score' && (
                            <p className="text-sm text-amber-400 mb-2">
                              {data?.incidentCount} incidents this week
                            </p>
                          )}
                          {selectedMetric === 'incident_load' && (
                            <>
                              <p className="text-sm text-purple-400 mb-2">
                                Risk Level: {data?.riskLevel}
                              </p>
                              <div className="border-t border-neutral-700 pt-2 mt-2">
                                <p className="text-xs font-semibold text-neutral-300 mb-2 uppercase tracking-wide">By Severity</p>
                                <div className="space-y-1">
                                  {sevBreakdown.critical > 0 && (
                                    <div className="flex justify-between text-xs">
                                      <span className="text-red-400">Critical (SEV0-1)</span>
                                      <span className="text-white font-medium">{sevBreakdown.critical}</span>
                                    </div>
                                  )}
                                  {sevBreakdown.high > 0 && (
                                    <div className="flex justify-between text-xs">
                                      <span className="text-orange-400">High (SEV2)</span>
                                      <span className="text-white font-medium">{sevBreakdown.high}</span>
                                    </div>
                                  )}
                                  {sevBreakdown.mediumLow > 0 && (
                                    <div className="flex justify-between text-xs">
                                      <span className="text-neutral-400">Medium/Low (SEV3+)</span>
                                      <span className="text-white font-medium">{sevBreakdown.mediumLow}</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </>
                          )}
                          {selectedMetric === 'health_score' && hasFactors && (
                            <div className="border-t border-neutral-700 pt-2 mt-2">
                              <p className="text-xs font-semibold text-neutral-300 mb-2 uppercase tracking-wide">Risk breakdown</p>
                              <div className="space-y-1">
                                {[
                                  { key: 'severity', label: 'Severity impact', value: factors.severity },
                                  { key: 'incidents', label: 'Incident volume', value: factors.incidents },
                                  { key: 'highSeverity', label: 'High severity', value: factors.highSeverity },
                                  { key: 'afterHours', label: 'After hours', value: factors.afterHours },
                                ]
                                  .filter(f => f.value > 0)
                                  .sort((a, b) => b.value - a.value)
                                  .map(factor => (
                                    <div key={factor.key} className="flex justify-between text-xs">
                                      <span className="text-neutral-400">{factor.label}</span>
                                      <span className="text-white font-medium">{factor.value}%</span>
                                    </div>
                                  ))
                                }
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    }}
                  />
                  {selectedMetric === 'incident_load' ? (
                    <>
                      {/* Stacked bars for incident severity breakdown */}
                      <Bar yAxisId="left" dataKey="severityBreakdown.mediumLow" stackId="incidents" fill="#9CA3AF" maxBarSize={50} name="Medium/Low" />
                      <Bar yAxisId="left" dataKey="severityBreakdown.high" stackId="incidents" fill="#F97316" maxBarSize={50} name="High" />
                      <Bar yAxisId="left" dataKey="severityBreakdown.critical" stackId="incidents" fill="#EF4444" radius={[4, 4, 0, 0]} maxBarSize={50} name="Critical" />
                      {/* Risk level overlay line */}
                      <Line
                        yAxisId="right"
                        type="monotone"
                        dataKey="riskLevel"
                        stroke="#7C63D6"
                        strokeWidth={2}
                        dot={{ fill: '#7C63D6', r: 4 }}
                      />
                    </>
                  ) : (
                    <>
                      <Bar
                        yAxisId="left"
                        dataKey={config.weeklyDataKey}
                        fill="#7C63D6"
                        radius={[4, 4, 0, 0]}
                        maxBarSize={50}
                      />
                      {selectedMetric === 'health_score' && (
                        <Line
                          yAxisId="right"
                          type="monotone"
                          dataKey="incidentCount"
                          stroke="#F59E0B"
                          strokeWidth={2}
                          dot={{ fill: '#F59E0B', r: 4 }}
                        />
                      )}
                    </>
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {/* Legend */}
            <div className="flex items-center justify-center flex-wrap gap-3 md:gap-6 mt-2 text-sm text-neutral-600">
              {selectedMetric === 'incident_load' ? (
                <>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded bg-red-500"></div>
                    <span>Critical</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded bg-orange-500"></div>
                    <span>High</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded bg-neutral-400"></div>
                    <span>Medium/Low</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-0.5 bg-purple-600"></div>
                    <span>Risk Level</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded bg-purple-600"></div>
                    <span>{config.label}</span>
                  </div>
                  {selectedMetric === 'health_score' && (
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-0.5 bg-amber-500"></div>
                      <span>Incidents</span>
                    </div>
                  )}
                </>
              )}
              <div className="flex items-center gap-2">
                <div className="w-4 border-t-2 border-dashed border-purple-400"></div>
                <span>Mean</span>
              </div>
            </div>

            {/* Week-over-Week Comparison */}
            {currentWeek && (
              <div className="mt-4 flex items-center justify-center flex-wrap gap-3 md:gap-6 text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-neutral-500">This week:</span>
                  <span className="font-semibold text-neutral-900">{currentWeek[config.weeklyDataKey]}</span>
                </div>
                {vsLastWeek && (
                  <div className="flex items-center gap-2">
                    <span className="text-neutral-500">vs last week:</span>
                    <span className={`font-medium ${getComparisonClass(vsLastWeek.direction)}`}>
                      {formatComparison(vsLastWeek)}
                    </span>
                  </div>
                )}
                {vsMean && (
                  <div className="flex items-center gap-2">
                    <span className="text-neutral-500">vs mean:</span>
                    <span className={`font-medium ${getComparisonClass(vsMean.direction)}`}>
                      {formatComparison(vsMean)}
                    </span>
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          <>
            {/* Daily Area Chart */}
            <div className="h-[300px] -mx-6 sm:-mx-4 md:mx-0">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={dailyChartData}
                  margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="purpleGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#7C63D6" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="#7C63D6" stopOpacity={0.01} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="date"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 10, fill: '#6B7280' }}
                    angle={-45}
                    textAnchor="end"
                    height={50}
                    interval={Math.floor(dailyChartData.length / 7) || 0}
                  />
                  <YAxis hide={selectedMetric === 'health_score'} />
                  <Tooltip
                    content={({ payload }) => {
                      if (!payload || payload.length === 0) return null
                      const data = payload[0]?.payload
                      const metricValue = data?.[config.dataKey] || 0
                      const meanScore = data?.meanScore || 0
                      const percentageChange = meanScore !== 0 ? ((metricValue - meanScore) / meanScore) * 100 : 0
                      const isPositive = percentageChange <= 0

                      return (
                        <div className="bg-neutral-900/95 p-3 border border-neutral-700 rounded-lg shadow-lg">
                          <p className="text-sm font-medium text-neutral-300 mb-2">{data?.date}</p>
                          <p className={`text-base font-bold mb-2 ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
                            {percentageChange >= 0 ? '↑' : '↓'} {Math.abs(percentageChange).toFixed(1)}%
                          </p>
                          <p className="text-sm text-neutral-300">
                            {config.label}: <span className="font-semibold">{metricValue}</span>
                          </p>
                          <p className="text-xs text-neutral-400 mt-1">Mean: {meanScore}</p>
                        </div>
                      )
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey={config.dataKey}
                    stroke={config.color}
                    strokeWidth={2}
                    fill="url(#purpleGradient)"
                    dot={false}
                  />
                  {config.showMeanLine && (
                    <Line
                      type="monotone"
                      dataKey="meanScore"
                      stroke="#9C84E8"
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      dot={false}
                    />
                  )}
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Legend */}
            <div className="mt-4 flex items-center justify-start flex-wrap gap-3 md:gap-6 text-sm text-neutral-700">
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 rounded" style={{ backgroundColor: config.color }}></div>
                <span>{config.label}</span>
              </div>
              {config.showMeanLine && (
                <div className="flex items-center space-x-2">
                  <div className="w-4 border-t-2 border-dashed border-purple-500"></div>
                  <span>Mean</span>
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
