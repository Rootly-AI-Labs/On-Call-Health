"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts"
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
      label: "Health Score",
      color: "#3b82f6",
      yAxisLabel: "OCB Health Score",
      dataKey: "dailyScore",
      showMeanLine: true,
      transformer: (trend: any) => Math.max(0, Math.min(100, 100 - Math.round(trend.overall_score * 10)))
    },
    incident_load: {
      label: "Incident Load",
      color: "#8b5cf6",
      yAxisLabel: "Incident Count",
      dataKey: "incidentCount",
      showMeanLine: true,
      transformer: (trend: any) => trend.incident_count || 0
    },
    after_hours: {
      label: "After Hours Activity",
      color: "#f59e0b",
      yAxisLabel: "After Hours Incidents",
      dataKey: "afterHoursCount",
      showMeanLine: true,
      transformer: (trend: any) => trend.after_hours_count || 0
    },
    severity_weighted: {
      label: "Workload Intensity",
      color: "#ef4444",
      yAxisLabel: "Severity-Weighted Load",
      dataKey: "severityWeightedCount",
      showMeanLine: true,
      transformer: (trend: any) => Math.round(trend.severity_weighted_count || 0)
    },
    weekend_work: {
      label: "Weekend Work",
      color: "#10b981",
      yAxisLabel: "Weekend Incidents",
      dataKey: "weekendCount",
      showMeanLine: true,
      transformer: null
    }
  }

  // Metric descriptions for the info tooltip
  const METRIC_DESCRIPTIONS: any = {
    health_score: {
      title: "Health Score",
      description: "OCB Health Score (0-100) measures team on-call health based on incident frequency, after-hours work, and severity. Uses PRIMARY integration (Rootly/PagerDuty incidents). Lower scores indicate higher burnout risk."
    },
    incident_load: {
      title: "Incident Load",
      description: "Total count of incidents handled per day. Uses PRIMARY integration (Rootly/PagerDuty incidents). Counts all incidents regardless of severity or timing."
    },
    after_hours: {
      title: "After Hours Activity",
      description: "Incidents occurring outside business hours (before 9 AM or after 5 PM) or on weekends. Uses PRIMARY integration (Rootly/PagerDuty incidents). Timezone-aware based on each team member's local time."
    },
    severity_weighted: {
      title: "Workload Intensity",
      description: "Measures workload stress by weighting incidents based on their severity level. Uses PRIMARY integration (Rootly/PagerDuty incidents). Higher values indicate more stressful workload."
    },
    weekend_work: {
      title: "Weekend Work",
      description: "Incidents handled on Saturdays and Sundays. Uses PRIMARY integration (Rootly/PagerDuty incidents). Aggregated from individual user data and timezone-aware."
    }
  }

  // Calculate statistics from daily trends
  const calculateStats = (dailyTrends: any[], metric: string, individualData?: any) => {
    if (!dailyTrends || dailyTrends.length === 0) {
      return { mean: 0, min: 0, max: 0, trend: 'neutral' };
    }

    const config = METRIC_CONFIG[metric];

    const values = dailyTrends.map(d => {
      if (metric === 'weekend_work') {
        return aggregateWeekendWork(d.date, individualData);
      } else {
        return config.transformer(d);
      }
    });

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
          <CardTitle>Team Objective Data</CardTitle>
          <CardDescription>
            {hasData
              ? `Over the last ${timeRange} days, your average ${METRIC_CONFIG[selectedMetric].yAxisLabel.toLowerCase()} was ${Math.round(stats.mean)}${selectedMetric === 'health_score' ? ' points' : ''}.`
              : "No daily trend data available for this analysis"
            }
          </CardDescription>
        </div>

        <Select value={selectedMetric} onValueChange={setSelectedMetric}>
          <SelectTrigger className="w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="health_score">Health Score</SelectItem>
            <SelectItem value="incident_load">Incident Load</SelectItem>
            <SelectItem value="after_hours">After Hours Activity</SelectItem>
            <SelectItem value="severity_weighted">Workload Intensity</SelectItem>
            <SelectItem value="weekend_work">Weekend Work</SelectItem>
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col pb-4">
        <div className="space-y-3 flex-1 flex flex-col">
          {/* Chart */}
          <div className="h-[300px]">
            {loadingTrends ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <div className="animate-spin w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full mx-auto mb-2"></div>
                  <p className="text-sm text-gray-500">Loading objective data...</p>
                </div>
              </div>
            ) : !hasData ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                    <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                  </div>
                  <p className="text-sm text-gray-500 font-medium">No Objective Data Available</p>
                  <p className="text-xs text-gray-400 mt-1">Run an analysis to view health trends</p>
                </div>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={chartData}
                  margin={{
                    top: 20,
                    right: 30,
                    left: selectedMetric === 'health_score' ? 10 : 60,
                    bottom: 60
                  }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
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
                          <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
                            {/* Percentage change */}
                            <p className={`text-base font-bold mb-2 ${isNegative ? 'text-red-600' : 'text-green-600'}`}>
                              {percentageChange >= 0 ? '↑' : '↓'} {Math.abs(percentageChange).toFixed(1)}%
                            </p>

                            {/* Metric value */}
                            {selectedMetric !== 'health_score' && (
                              <p className="text-sm text-gray-600">
                                {config.label}: {metricValue.toFixed(selectedMetric === 'severity_weighted' ? 1 : 0)}
                              </p>
                            )}

                            {/* Incidents count (always show for context) */}
                            <p className="text-sm text-gray-600">
                              Incidents: {data.incidentCount || 0}
                            </p>

                            {/* At-risk members */}
                            {data.membersAtRisk > 0 && (
                              <p className="text-sm text-orange-600">
                                At Risk: {data.membersAtRisk}/{data.totalMembers} members
                              </p>
                            )}

                            {/* Date */}
                            <p className="text-xs text-gray-500 pt-2 border-t">
                              {formattedDate}
                            </p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  {/* Dynamic metric line */}
                  <Line
                    type="monotone"
                    dataKey={METRIC_CONFIG[selectedMetric].dataKey}
                    stroke={METRIC_CONFIG[selectedMetric].color}
                    strokeWidth={2}
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
                      stroke="#ef4444"
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      dot={false}
                      isAnimationActive={false}
                      name={`${timeRange}-Day Mean`}
                      connectNulls={true}
                    />
                  )}
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Legend */}
          <div className="mt-4 flex items-center justify-between text-xs text-gray-600">
            <div className="flex items-center space-x-6">
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 rounded" style={{ backgroundColor: METRIC_CONFIG[selectedMetric].color }}></div>
                <span>{METRIC_CONFIG[selectedMetric].label}</span>
              </div>
              {METRIC_CONFIG[selectedMetric].showMeanLine && (
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-0.5 bg-red-500"></div>
                  <span className="ml-1">{timeRange}-Day Mean</span>
                </div>
              )}
            </div>
            {/* Info icon with tooltip */}
            <div className="relative group">
              <Info className="w-4 h-4 text-gray-500 cursor-help hover:text-gray-700 transition-colors" />
              <div className="absolute bottom-full right-0 mb-2 px-3 py-2 bg-gray-900/95 text-white text-xs rounded-lg w-64 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
                <div className="font-semibold mb-1">{METRIC_DESCRIPTIONS[selectedMetric].title}</div>
                <div>{METRIC_DESCRIPTIONS[selectedMetric].description}</div>
                <div className="absolute top-full right-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-gray-900/95"></div>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}