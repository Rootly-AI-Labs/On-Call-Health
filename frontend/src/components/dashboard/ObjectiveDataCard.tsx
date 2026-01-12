"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { LineChart, Line, Area, AreaChart, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts"
import { Info } from "lucide-react"

interface ObjectiveDataCardProps {
  currentAnalysis: any
  loadingTrends: boolean
}

export function ObjectiveDataCard({
  currentAnalysis,
  loadingTrends
}: ObjectiveDataCardProps) {
  const [selectedMetric, setSelectedMetric] = useState<string>("health_score")

  // Metric configuration
  const METRIC_CONFIG: any = {
    health_score: {
      label: "Risk Level",
      color: "#7C63D6",
      yAxisLabel: "Risk Level",
      dataKey: "dailyScore",
      showMeanLine: true,
      transformer: (trend: any) => Math.max(0, Math.min(100, 100 - Math.round(trend.overall_score * 10)))
    },
    incident_load: {
      label: "Incident Count",
      color: "#7C63D6",
      yAxisLabel: "Incident Count",
      dataKey: "incidentCount",
      showMeanLine: true,
      transformer: (trend: any) => trend.incident_count || 0
    },
    after_hours: {
      label: "After Hours Activity",
      color: "#7C63D6",
      yAxisLabel: "After Hours Incidents",
      dataKey: "afterHoursCount",
      showMeanLine: true,
      transformer: (trend: any) => trend.after_hours_count || 0
    },
    severity_weighted: {
      label: "Workload Intensity",
      color: "#7C63D6",
      yAxisLabel: "Severity-Weighted Load",
      dataKey: "severityWeightedCount",
      showMeanLine: true,
      transformer: (trend: any) => Math.round(trend.severity_weighted_count || 0)
    }
  }

  // Metric descriptions for the info tooltip
  const METRIC_DESCRIPTIONS: any = {
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

  // Calculate statistics from daily trends
  const calculateStats = (dailyTrends: any[], metric: string, individualData?: any) => {
    if (!dailyTrends || dailyTrends.length === 0) {
      return { mean: 0, min: 0, max: 0, trend: 'neutral' };
    }

    const config = METRIC_CONFIG[metric];

    const values = dailyTrends.map(d => config.transformer(d));

    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const min = Math.min(...values);
    const max = Math.max(...values);

    // Determine trend: compare first third vs last third
    const third = Math.floor(values.length / 3);
    const firstThirdAvg = values.slice(0, third).reduce((a, b) => a + b, 0) / third;
    const lastThirdAvg = values.slice(-third).reduce((a, b) => a + b, 0) / third;

    // For health score, lower is better; for other metrics, higher is worse
    let trend: string;
    if (metric === 'health_score') {
      trend = lastThirdAvg < firstThirdAvg ? 'improving' : lastThirdAvg > firstThirdAvg ? 'declining' : 'stable';
    } else {
      trend = lastThirdAvg > firstThirdAvg ? 'declining' : lastThirdAvg < firstThirdAvg ? 'improving' : 'stable';
    }

    return { mean, min, max, trend };
  };

  // Calculate 7-day running average
  const calculate7DayRunningAverage = (scores: number[]) => {
    return scores.map((score, index) => {
      // For points with < 7 previous data points, use average up to that point (inclusive)
      // edit running average here
      const windowSize = Math.min(7, index + 1);
      const start = Math.max(0, index - windowSize + 1);
      const window = scores.slice(start, index + 1);
      const average = window.reduce((a, b) => a + b, 0) / window.length;
      return Math.round(average);
    });
  };

  // Aggregate weekend work from individual user data
  const aggregateWeekendWork = (date: string, individualData: any): number => {
    if (!individualData || typeof individualData !== 'object') {
      return 0
    }

    let totalWeekendCount = 0

    try {
      Object.keys(individualData).forEach((userEmail) => {
        const userData = individualData[userEmail]
        if (userData && userData[date]) {
          totalWeekendCount += userData[date].weekend_count || 0
        }
      })
    } catch (error) {
      console.warn('Error aggregating weekend work:', error)
      return 0
    }

    return totalWeekendCount
  };

  // Get chart mode from backend analysis data (default to 'normal')
  const chartMode = currentAnalysis?.analysis_data?.chart_mode || 'normal';

  // Get the chart data
  const getChartData = (metric: string) => {
    const dailyTrends = currentAnalysis?.analysis_data?.daily_trends;
    const individualData = currentAnalysis?.analysis_data?.individual_daily_data;
    const config = METRIC_CONFIG[metric];

    if (!dailyTrends || !Array.isArray(dailyTrends) || dailyTrends.length === 0) {
      return [];
    }

    // Convert daily trends to chart format
    const chartData = dailyTrends.map((trend: any) => {
      let metricValue: number;

      // Special handling for weekend work
      if (metric === 'weekend_work') {
        metricValue = aggregateWeekendWork(trend.date, individualData);
      } else {
        metricValue = config.transformer(trend);
      }

      return {
        date: new Date(trend.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        originalDate: trend.date,
        [config.dataKey]: metricValue,
        // Keep these for tooltip
        incidentCount: trend.incident_count || 0,
        afterHours: trend.after_hours_count || 0,
        membersAtRisk: trend.members_at_risk || 0,
        totalMembers: trend.total_members || 0,
        hasData: trend.incident_count > 0
      };
    });

    // Calculate mean
    const values = chartData.map(d => d[config.dataKey]);
    const mean = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;

    // Apply running average only for health_score
    let displayValues = values;
    if (chartMode === 'running_average' && metric === 'health_score') {
      displayValues = calculate7DayRunningAverage(values);
    }

    // Add mean and display value
    const dataWithMean = chartData.map((d, index) => ({
      ...d,
      [config.dataKey]: displayValues[index],
      meanScore: Math.round(mean)
    }));

    return dataWithMean;
  };

  const chartData = getChartData(selectedMetric);
  const individualData = currentAnalysis?.analysis_data?.individual_daily_data;
  const stats = calculateStats(
    currentAnalysis?.analysis_data?.daily_trends || [],
    selectedMetric,
    individualData
  );
  const timeRange = currentAnalysis?.time_range || currentAnalysis?.analysis_data?.metadata?.days_analyzed || 30;

  const hasData = chartData.length > 0;

  return (
    <Card className="mb-6 flex flex-col min-h-full">
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="space-y-1.5">
          <CardTitle>Team Trends</CardTitle>
          <CardDescription>
            {hasData
              ? `Over the last ${timeRange} days, the average ${METRIC_CONFIG[selectedMetric].yAxisLabel.toLowerCase()} was ${Math.round(stats.mean)}${selectedMetric === 'health_score' ? ' points' : ''}.`
              : "No daily trend data available for this analysis"
            }
          </CardDescription>
        </div>

        <div className="flex items-center space-x-2">
          {/* Info icon with tooltip */}
          <div className="relative group">
            <Info className="w-4 h-4 text-neutral-500 cursor-help hover:text-neutral-700 transition-colors" />
            <div className="absolute top-full right-0 mt-2 px-3 py-2 bg-neutral-900/95 text-white text-xs rounded-lg w-64 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
              <div className="font-semibold mb-1">{METRIC_DESCRIPTIONS[selectedMetric].title}</div>
              <div>{METRIC_DESCRIPTIONS[selectedMetric].description}</div>
              <div className="absolute bottom-full right-4 w-0 h-0 border-l-4 border-r-4 border-b-4 border-l-transparent border-r-transparent border-b-gray-900/95"></div>
            </div>
          </div>

          <Select value={selectedMetric} onValueChange={setSelectedMetric}>
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="health_score">Risk Level</SelectItem>
              <SelectItem value="incident_load">Incident Count</SelectItem>
              <SelectItem value="after_hours">After Hours Activity</SelectItem>
              <SelectItem value="severity_weighted">Workload Intensity</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col pb-2">
        <div className="space-y-3 flex-1 flex flex-col">
          {/* Chart */}
          <div className="h-[300px]">
            {loadingTrends ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <div className="animate-spin w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full mx-auto mb-2"></div>
                  <p className="text-sm text-neutral-500">Loading objective data...</p>
                </div>
              </div>
            ) : !hasData ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <div className="w-12 h-12 bg-neutral-200 rounded-full flex items-center justify-center mx-auto mb-3">
                    <svg className="w-6 h-6 text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                  </div>
                  <p className="text-sm text-neutral-500 font-medium">No Objective Data Available</p>
                  <p className="text-xs text-neutral-500 mt-1">Run an analysis to view health trends</p>
                </div>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={chartData}
                  margin={{
                    top: 20,
                    right: 30,
                    left: selectedMetric === 'health_score' ? 10 : 60,
                    bottom: 60
                  }}
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
                    interval={Math.floor(chartData.length / 7) || 0}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={selectedMetric !== 'health_score' ? { fontSize: 12, fill: '#6B7280' } : false}
                    label={selectedMetric !== 'health_score' ? {
                      value: METRIC_CONFIG[selectedMetric].yAxisLabel,
                      angle: -90,
                      position: 'insideLeft',
                      style: { textAnchor: 'middle', fontSize: 12, fill: '#6B7280' }
                    } : false}
                  />
                  <Tooltip
                    content={({ payload, label }) => {
                      if (payload && payload.length > 0) {
                        const data = payload[0]?.payload;
                        const config = METRIC_CONFIG[selectedMetric];
                        const metricValue = data?.[config.dataKey] || 0;
                        const meanScore = data?.meanScore || 0;

                        // Calculate percentage difference from mean
                        const percentageChange = meanScore !== 0
                          ? ((metricValue - meanScore) / meanScore) * 100
                          : 0;

                        // Format the date
                        const dateObj = new Date(data?.originalDate);
                        const formattedDate = dateObj.toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric'
                        });

                        // For health score: higher % = worse (red)
                        // For other metrics: higher % = more incidents (red)
                        const isNegative = selectedMetric === 'health_score'
                          ? percentageChange >= 0
                          : percentageChange >= 0;

                        return (
                          <div className="bg-neutral-900 p-3 border border-neutral-700 rounded-lg shadow-lg">
                            {/* Percentage change */}
                            <p className={`text-base font-bold mb-2 ${isNegative ? 'text-red-400' : 'text-green-400'}`}>
                              {percentageChange >= 0 ? '↑' : '↓'} {Math.abs(percentageChange).toFixed(1)}%
                            </p>

                            {/* Metric value */}
                            {selectedMetric !== 'health_score' && (
                              <p className="text-sm text-neutral-300">
                                {config.label}: {metricValue.toFixed(selectedMetric === 'severity_weighted' ? 1 : 0)}
                              </p>
                            )}

                            {/* Incidents count - only show for incident load */}
                            {selectedMetric === 'incident_load' && (
                              <p className="text-sm text-neutral-300">
                                Incidents: {data.incidentCount || 0}
                              </p>
                            )}

                            {/* At-risk members - only show for health score */}
                            {selectedMetric === 'health_score' && data.membersAtRisk > 0 && (
                              <p className="text-sm text-orange-400">
                                At Risk: {data.membersAtRisk}/{data.totalMembers} members
                              </p>
                            )}

                            {/* Date */}
                            <p className="text-xs text-neutral-400 pt-2 border-t border-neutral-700">
                              {formattedDate}
                            </p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  {/* Dynamic metric area with gradient */}
                  <Area
                    type="monotone"
                    dataKey={METRIC_CONFIG[selectedMetric].dataKey}
                    stroke={METRIC_CONFIG[selectedMetric].color}
                    strokeWidth={2}
                    fill="url(#purpleGradient)"
                    dot={false}
                    isAnimationActive={true}
                    name={METRIC_CONFIG[selectedMetric].label}
                    connectNulls={true}
                  />
                  {/* Mean line */}
                  {METRIC_CONFIG[selectedMetric].showMeanLine && (
                    <Line
                      type="monotone"
                      dataKey="meanScore"
                      stroke="#9C84E8"
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      dot={false}
                      isAnimationActive={false}
                      name={`${timeRange}-Day Mean`}
                      connectNulls={true}
                    />
                  )}
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Legend */}
          <div className="mt-4 flex items-center space-x-6 text-xs text-neutral-700">
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 rounded" style={{ backgroundColor: METRIC_CONFIG[selectedMetric].color }}></div>
              <span>{METRIC_CONFIG[selectedMetric].label}</span>
            </div>
            {METRIC_CONFIG[selectedMetric].showMeanLine && (
              <div className="flex items-center space-x-2">
                <div className="w-3 h-0.5 bg-purple-500"></div>
                <span className="ml-1">{timeRange}-Day Mean</span>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}