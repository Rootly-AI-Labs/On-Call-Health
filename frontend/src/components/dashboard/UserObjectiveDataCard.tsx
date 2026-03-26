"use client"

import { useState, useEffect, useMemo } from "react"
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
import { getRiskScore100FromDailyHealth } from "@/lib/scoring"

interface UserObjectiveDataCardProps {
  memberData: any
  analysisId?: number | string
  timeRange?: number | string
  currentAnalysis?: any
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
  transformer: (day: any) => number
}

const METRIC_CONFIG: Record<string, MetricConfig> = {
  health_score: {
    label: "Risk Level",
    color: "#7C63D6",
    yAxisLabel: "Risk Level",
    dataKey: "dailyScore",
    weeklyDataKey: "riskLevel",
    showMeanLine: true,
    transformer: (day: any) => getRiskScore100FromDailyHealth(day)
  },
  incident_load: {
    label: "Incident Count",
    color: "#7C63D6",
    yAxisLabel: "Incident Count",
    dataKey: "incidentCount",
    weeklyDataKey: "incidentCount",
    showMeanLine: true,
    transformer: (day: any) => day.incident_count || 0
  },
  after_hours: {
    label: "After Hours Activity",
    color: "#7C63D6",
    yAxisLabel: "After Hours Activity",
    dataKey: "afterHoursCount",
    weeklyDataKey: "afterHoursCount",
    showMeanLine: true,
    transformer: (day: any) => day.after_hours_count || 0
  },
  severity_weighted: {
    label: "Workload Intensity",
    color: "#7C63D6",
    yAxisLabel: "Severity-Weighted Load",
    dataKey: "severityWeightedCount",
    weeklyDataKey: "severityWeighted",
    showMeanLine: true,
    transformer: (day: any) => Math.round(day.severity_weighted_count || 0)
  }
}

const METRIC_DESCRIPTIONS: Record<string, { title: string; description: string }> = {
  health_score: {
    title: "Risk Level",
    description: "Measures this member's on-call health based on factors such as incident frequency, after-hours work and severity. Higher scores indicate higher risk of overwork."
  },
  incident_load: {
    title: "Incident Count",
    description: "Total count of incidents handled per day. Counts all incidents regardless of severity or timing."
  },
  after_hours: {
    title: "After Hours Activity",
    description: "Incidents occurring outside business hours (before 9 AM or after 5 PM) or on weekends. Timezone-aware based on this member's local time."
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

function aggregateToWeekly(dailyData: any[], config: MetricConfig): any[] {
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

      const avgRiskLevel = days.reduce((sum, d) => sum + getRiskScore100FromDailyHealth(d), 0) / dayCount
      const totalIncidents = days.reduce((sum, d) => sum + (d.incident_count || 0), 0)
      const totalAfterHours = days.reduce((sum, d) => sum + (d.after_hours_count || 0), 0)
      const avgSeverityWeighted = days.reduce((sum, d) => sum + (d.severity_weighted_count || 0), 0) / dayCount

      const weekDate = new Date(weekStart)
      const weekEnd = new Date(weekStart)
      weekEnd.setDate(weekEnd.getDate() + 6)

      return {
        weekStart,
        weekLabel: formatDateShort(weekDate),
        weekRange: `${formatDateShort(weekDate)} - ${formatDateShort(weekEnd)}`,
        riskLevel: Math.round(avgRiskLevel),
        incidentCount: totalIncidents,
        afterHoursCount: totalAfterHours,
        severityWeighted: Math.round(avgSeverityWeighted),
        daysInWeek: dayCount
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
    case 'down': return 'bg-green-100 text-green-700 border border-green-200'
    case 'up': return 'bg-red-100 text-red-700 border border-red-200'
    default: return 'bg-purple-50 text-purple-600 border border-purple-200'
  }
}

function getTrendLabel(direction: 'up' | 'down' | 'stable'): string {
  switch (direction) {
    case 'down': return 'Improving'
    case 'up': return 'Needs Attention'
    default: return 'Stable'
  }
}

function getTrendIcon(direction: 'up' | 'down' | 'stable') {
  switch (direction) {
    case 'down': return <TrendingDown className="w-4 h-4" />
    case 'up': return <TrendingUp className="w-4 h-4" />
    default: return <Minus className="w-4 h-4" />
  }
}

function getComparisonClass(direction: 'up' | 'down' | 'stable'): string {
  switch (direction) {
    case 'down': return 'text-green-600'
    case 'up': return 'text-red-600'
    default: return 'text-neutral-500'
  }
}

function formatComparison(trend: TrendDirection): string {
  if (trend.direction === 'stable') return '—'
  const arrow = trend.direction === 'down' ? '↓' : '↑'
  return `${arrow}${trend.percentage}%`
}

export function UserObjectiveDataCard({
  memberData,
  analysisId,
  timeRange = 30,
  currentAnalysis
}: UserObjectiveDataCardProps) {
  const [dailyHealthData, setDailyHealthData] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedMetric, setSelectedMetric] = useState<string>("health_score")
  const [viewMode, setViewMode] = useState<'weekly' | 'daily'>('weekly')

  const individualDailyData = useMemo(() => {
    return currentAnalysis?.analysis_data?.individual_daily_data
  }, [currentAnalysis?.analysis_data?.individual_daily_data])

  useEffect(() => {
    const fetchDailyHealth = async () => {
      if (!memberData?.user_email || !analysisId) {
        return
      }

      setLoading(true)

      try {
        const userEmail = memberData.user_email.toLowerCase()

        if (individualDailyData && individualDailyData[userEmail]) {
          const dailyData = individualDailyData[userEmail]
          const transformedData = Object.entries(dailyData)
            .map(([dateStr, dayData]: [string, any]) => ({
              date: dateStr,
              health_score: getRiskScore100FromDailyHealth(dayData),
              incident_count: dayData.incident_count || 0,
              team_health: dayData.team_health || 0,
              day_name: dayData.day_name || new Date(dateStr).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
              has_data: dayData.has_data || false,
              severity_weighted_count: dayData.severity_weighted_count || 0,
              after_hours_count: dayData.after_hours_count || 0,
              after_hours_incidents_count: dayData.after_hours_incidents_count || 0,
              github_after_hours_count: dayData.github_after_hours_count || 0
            }))
            .sort((a, b) => a.date.localeCompare(b.date))
          // No longer limiting to 30 days - show all data from analysis period

          setDailyHealthData(transformedData)
          setLoading(false)
          return
        }

        const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
        const url = `${API_BASE}/analyses/${analysisId}/members/${encodeURIComponent(memberData.user_email)}/daily-health`

        const response = await fetch(url, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
            'Content-Type': 'application/json'
          }
        })

        if (response.ok) {
          const result = await response.json()
          if (result.status === 'success' && result.data?.daily_health) {
            setDailyHealthData(result.data.daily_health)
          }
        }
      } catch (err) {
        console.error('Error fetching user daily health:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchDailyHealth()
  }, [memberData?.user_email, analysisId, individualDailyData])

  const config = METRIC_CONFIG[selectedMetric]

  // Build daily chart data
  const dailyChartData = useMemo(() => {
    if (!dailyHealthData || dailyHealthData.length === 0) return []

    const chartData = dailyHealthData.map((day: any) => ({
      date: formatDateShort(new Date(day.date)),
      originalDate: day.date,
      dailyScore: getRiskScore100FromDailyHealth(day),
      incidentCount: day.incident_count || 0,
      afterHoursCount: day.after_hours_count || 0,
      severityWeightedCount: day.severity_weighted_count || 0,
      hasData: day.has_data || false
    }))

    const values = chartData.map((d: any) => d[config.dataKey])
    const mean = values.length > 0 ? values.reduce((a: number, b: number) => a + b, 0) / values.length : 0

    return chartData.map((d: any) => ({ ...d, meanScore: Math.round(mean) }))
  }, [dailyHealthData, config.dataKey])

  // Aggregate to weekly
  const weeklyData = useMemo(() => {
    return aggregateToWeekly(dailyHealthData, config)
  }, [dailyHealthData, config])

  // Calculate weekly stats
  const weeklyStats = useMemo(() => {
    if (weeklyData.length === 0) return { weeklyMean: 0, overallTrend: { direction: 'stable' as const, percentage: 0 }, currentWeek: null, vsLastWeek: null, vsMean: null }

    const weeklyMean = weeklyData.reduce((sum, w) => sum + w[config.weeklyDataKey], 0) / weeklyData.length

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
      currentWeek,
      vsLastWeek: currentWeek && previousWeek
        ? calculateTrend(currentWeek[config.weeklyDataKey], previousWeek[config.weeklyDataKey])
        : null,
      vsMean: currentWeek
        ? calculateTrend(currentWeek[config.weeklyDataKey], weeklyMean)
        : null,
    }
  }, [weeklyData, config.weeklyDataKey])

  const hasData = viewMode === 'weekly' ? weeklyData.length > 0 : dailyChartData.length > 0
  const dailyMean = dailyChartData.length > 0 ? dailyChartData[0]?.meanScore : 0

  const description = hasData
    ? viewMode === 'weekly'
      ? `Weekly averages over ${weeklyData.length} weeks. Mean: ${Math.round(weeklyStats.weeklyMean)} ${config.label.toLowerCase()}.`
      : `Over the last ${timeRange} days, average ${config.yAxisLabel.toLowerCase()} was ${Math.round(dailyMean)} points.`
    : "No daily trend data available for this user"

  if (loading) {
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
      <CardHeader className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1.5 min-w-0 md:flex-1">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <CardTitle>User Trends</CardTitle>
            {viewMode === 'weekly' && hasData && weeklyData.length >= 2 && (() => {
              // Compare first week(s) to last week(s) for true overall direction
              const numWeeksToCompare = Math.min(2, Math.floor(weeklyData.length / 2))
              const firstWeeksAvg = weeklyData.slice(0, numWeeksToCompare).reduce((sum, w) => sum + w[config.weeklyDataKey], 0) / numWeeksToCompare
              const lastWeeksAvg = weeklyData.slice(-numWeeksToCompare).reduce((sum, w) => sum + w[config.weeklyDataKey], 0) / numWeeksToCompare
              const overallDirection = calculateTrend(lastWeeksAvg, firstWeeksAvg)

              return (
                <div className="relative group flex-shrink-0 w-fit">
                  <div className={`px-1 sm:px-1.5 py-0.5 rounded-full text-[10px] sm:text-xs font-medium flex items-center gap-0.5 cursor-help whitespace-nowrap ${getTrendStatusClass(overallDirection.direction)}`}>
                    {getTrendIcon(overallDirection.direction)}
                    {getTrendLabel(overallDirection.direction)}
                  </div>
                  <div className="absolute top-full left-0 mt-2 px-3 py-2 bg-neutral-900/95 text-white text-xs rounded-lg w-52 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
                    <span>
                      {overallDirection.direction === 'down'
                        ? `Down ${overallDirection.percentage}% from start to end`
                        : overallDirection.direction === 'up'
                        ? `Up ${overallDirection.percentage}% from start to end`
                        : `Returned to similar level (${Math.round(firstWeeksAvg)} → ${Math.round(lastWeeksAvg)})`}
                    </span>
                  </div>
                </div>
              )
            })()}
          </div>
          <CardDescription>{description}</CardDescription>
        </div>

        <div className="flex flex-row gap-2 items-center">
          {/* View Toggle */}
          <div className="flex items-center bg-neutral-100 rounded-lg p-0.5 w-auto">
            <button
              onClick={() => setViewMode('weekly')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                viewMode === 'weekly'
                  ? 'bg-white text-neutral-900 shadow-sm'
                  : 'text-neutral-500 hover:text-neutral-700'
              }`}
            >
              Weekly
            </button>
            <button
              onClick={() => setViewMode('daily')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                viewMode === 'daily'
                  ? 'bg-white text-neutral-900 shadow-sm'
                  : 'text-neutral-500 hover:text-neutral-700'
              }`}
            >
              Daily
            </button>
          </div>

          {/* Info icon */}
          <div className="relative group">
            <Info className="w-4 h-4 text-neutral-500 cursor-help hover:text-neutral-700 transition-colors flex-shrink-0" />
            <div className="absolute top-full left-0 mt-2 px-3 py-2 bg-neutral-900/95 text-white text-xs rounded-lg w-64 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
              <div className="font-semibold mb-1">{METRIC_DESCRIPTIONS[selectedMetric].title}</div>
              <div>{METRIC_DESCRIPTIONS[selectedMetric].description}</div>
            </div>
          </div>

          {/* Metric selector */}
          <Select value={selectedMetric} onValueChange={setSelectedMetric}>
            <SelectTrigger className="w-full sm:w-[160px] ml-auto">
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

      <CardContent className="px-3 sm:px-4 md:px-6 pb-6">
        {!hasData ? (
          <div className="flex items-center justify-center h-[300px]">
            <div className="text-center">
              <div className="w-12 h-12 bg-neutral-200 rounded-full flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <p className="text-sm text-neutral-500 font-medium">No Data Available</p>
              <p className="text-xs text-neutral-500 mt-1">No incident data for this user</p>
            </div>
          </div>
        ) : viewMode === 'weekly' ? (
          <>
            {/* Weekly Bar Chart */}
            <div className="h-[280px] -mx-3 sm:-mx-4 md:mx-0">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={weeklyData}
                  margin={{ top: 20, right: 30, left: 0, bottom: 5 }}
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
                  {selectedMetric === 'health_score' && (
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      tick={{ fontSize: 11, fill: '#F59E0B' }}
                      axisLine={false}
                      tickLine={false}
                    />
                  )}
                  <ReferenceLine
                    yAxisId="left"
                    y={weeklyStats.weeklyMean}
                    stroke="#9C84E8"
                    strokeDasharray="5 5"
                  />
                  <Tooltip
                    content={({ payload }) => {
                      if (!payload || payload.length === 0) return null
                      const data = payload[0]?.payload

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
                        </div>
                      )
                    }}
                  />
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
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {/* Legend */}
            <div className="flex items-center justify-center gap-6 mt-2 text-sm text-neutral-600">
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
              <div className="flex items-center gap-2">
                <div className="w-4 border-t-2 border-dashed border-purple-400"></div>
                <span>Mean</span>
              </div>
            </div>

            {/* Week-over-Week Comparison */}
            {weeklyStats.currentWeek && (
              <div className="mt-4 flex items-center justify-center gap-6 text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-neutral-500">This week:</span>
                  <span className="font-semibold text-neutral-900">{weeklyStats.currentWeek[config.weeklyDataKey]}</span>
                </div>
                {weeklyStats.vsLastWeek && (
                  <div className="flex items-center gap-2">
                    <span className="text-neutral-500">vs last week:</span>
                    <span className={`font-medium ${getComparisonClass(weeklyStats.vsLastWeek.direction)}`}>
                      {formatComparison(weeklyStats.vsLastWeek)}
                    </span>
                  </div>
                )}
                {weeklyStats.vsMean && (
                  <div className="flex items-center gap-2">
                    <span className="text-neutral-500">vs mean:</span>
                    <span className={`font-medium ${getComparisonClass(weeklyStats.vsMean.direction)}`}>
                      {formatComparison(weeklyStats.vsMean)}
                    </span>
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          <>
            {/* Daily Area Chart */}
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={dailyChartData}
                  margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="userPurpleGradient" x1="0" y1="0" x2="0" y2="1">
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
                      const diff = metricValue - meanScore
                      const isAbove = diff > 0
                      const isEqual = diff === 0

                      return (
                        <div className="bg-neutral-900/95 p-3 border border-neutral-700 rounded-lg shadow-lg min-w-[160px]">
                          <p className="text-sm font-medium text-neutral-300 mb-2">{data?.date}</p>
                          <p className="text-sm text-neutral-300">
                            {config.label}: <span className="text-lg font-bold text-white">{metricValue}</span>
                          </p>
                          <p className="text-xs text-neutral-400 mt-1">
                            Mean: {meanScore}
                            {!isEqual && (
                              <span className={`ml-2 font-medium ${isAbove ? 'text-red-400' : 'text-green-400'}`}>
                                ({isAbove ? '+' : ''}{diff} {isAbove ? 'above' : 'below'})
                              </span>
                            )}
                          </p>
                        </div>
                      )
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey={config.dataKey}
                    stroke={config.color}
                    strokeWidth={2}
                    fill="url(#userPurpleGradient)"
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
            <div className="mt-4 flex items-center justify-start space-x-6 text-sm text-neutral-700">
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
