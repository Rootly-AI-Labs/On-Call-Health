"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts"
import { useState, useEffect, useMemo } from "react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface UserObjectiveDataCardProps {
  memberData: any
  analysisId?: number | string
  timeRange?: number | string
  currentAnalysis?: any
}

export function UserObjectiveDataCard({
  memberData,
  analysisId,
  timeRange = 30,
  currentAnalysis
}: UserObjectiveDataCardProps) {

  const [dailyHealthData, setDailyHealthData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedMetric, setSelectedMetric] = useState<string>("health_score");

  // Metric configuration for dropdown selector
  const METRIC_CONFIG: Record<string, {
    label: string
    color: string
    yAxisLabel: string
    dataKey: string
    showMeanLine: boolean
    transformer: (day: any) => number
  }> = {
    health_score: {
      label: "Health Score",
      color: "#3b82f6",  // Blue
      yAxisLabel: "OCB Health Score",
      dataKey: "dailyScore",
      showMeanLine: true,
      transformer: (day: any) => day.health_score || 0
    },
    incident_load: {
      label: "Incident Load",
      color: "#8b5cf6",  // Purple
      yAxisLabel: "Incident Count",
      dataKey: "incidentCount",
      showMeanLine: true,
      transformer: (day: any) => day.incident_count || 0
    },
    after_hours: {
      label: "After Hours Activity",
      color: "#f59e0b",  // Amber
      yAxisLabel: "After Hours Incidents",
      dataKey: "afterHoursCount",
      showMeanLine: true,
      transformer: (day: any) => day.after_hours_count || 0
    },
    severity_weighted: {
      label: "Workload Intensity",
      color: "#ef4444",  // Red
      yAxisLabel: "Severity-Weighted Load",
      dataKey: "severityWeightedCount",
      showMeanLine: true,
      transformer: (day: any) => Math.round(day.severity_weighted_count || 0)
    },
    weekend_work: {
      label: "Weekend Work",
      color: "#10b981",  // Green
      yAxisLabel: "Weekend Incidents",
      dataKey: "weekendCount",
      showMeanLine: true,
      transformer: (day: any) => day.weekend_count || 0
    }
  };

  // Calculate 7-day running average
  const calculate7DayRunningAverage = (scores: number[]) => {
    return scores.map((score, index) => {
      // For points with < 7 previous data points, use average up to that point (inclusive)
      const windowSize = Math.min(7, index + 1);
      const start = Math.max(0, index - windowSize + 1);
      const window = scores.slice(start, index + 1);
      const average = window.reduce((a, b) => a + b, 0) / window.length;
      return Math.round(average);
    });
  };

  useEffect(() => {
    const fetchDailyHealth = async () => {
      if (!memberData?.user_email || !analysisId) {
        return;
      }

      setLoading(true);

      try {
        const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
        const url = `${API_BASE}/analyses/${analysisId}/members/${encodeURIComponent(memberData.user_email)}/daily-health`;

        const response = await fetch(url, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
            'Content-Type': 'application/json'
          }
        });

        if (response.ok) {
          const result = await response.json();
          if (result.status === 'success' && result.data?.daily_health) {
            setDailyHealthData(result.data.daily_health);
          }
        }
      } catch (err) {
        console.error('Error fetching user daily health:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchDailyHealth();
  }, [memberData?.user_email, analysisId]);

  // Get the chart data with dynamic metric support
  const getChartData = () => {
    if (!dailyHealthData || dailyHealthData.length === 0) {
      return [];
    }

    const config = METRIC_CONFIG[selectedMetric];

    // Transform data using metric-specific transformer
    const chartData = dailyHealthData.map((day: any) => {
      const metricValue = config.transformer(day);

      return {
        date: new Date(day.date).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric'
        }),
        originalDate: day.date,
        [config.dataKey]: metricValue,
        incidentCount: day.incident_count || 0,
        hasData: day.has_data || false
      };
    });

    // Calculate mean for the selected metric
    const values = chartData
      .filter((d: any) => d.hasData)
      .map((d: any) => d[config.dataKey]);

    const mean = values.length > 0
      ? values.reduce((a: number, b: number) => a + b, 0) / values.length
      : 0;

    // Add mean to each data point
    return chartData.map((d: any) => ({
      ...d,
      meanScore: Math.round(mean)
    }));
  };

  // Calculate statistics from daily health data
  const stats = useMemo(() => {
    const chartData = getChartData();
    const config = METRIC_CONFIG[selectedMetric];

    const values = chartData
      .filter((d: any) => d.hasData)
      .map((d: any) => d[config.dataKey]);

    if (values.length === 0) {
      return { mean: 0, min: 0, max: 0 };
    }

    const mean = values.reduce((a: number, b: number) => a + b, 0) / values.length;
    const min = Math.min(...values);
    const max = Math.max(...values);

    return { mean, min, max };
  }, [dailyHealthData, selectedMetric]);

  // Get chart mode from backend analysis data (default to 'normal')
  const chartMode = currentAnalysis?.analysis_data?.chart_mode || 'normal';

  // Get base chart data
  const chartData = getChartData();
  const hasData = chartData.length > 0;

  // Apply running average if mode is set (only for health_score)
  const processedChartData = (() => {
    if (chartMode === 'running_average' && chartData.length > 0 && selectedMetric === 'health_score') {
      const config = METRIC_CONFIG[selectedMetric];
      const scores = chartData.map(d => d[config.dataKey]);
      const averagedScores = calculate7DayRunningAverage(scores);
      return chartData.map((d, index) => ({
        ...d,
        [config.dataKey]: averagedScores[index]
      }));
    }
    return chartData;
  })();

  const config = METRIC_CONFIG[selectedMetric];

  return (
    <Card className="mb-6">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="space-y-1.5">
            <CardTitle>User Objective Data</CardTitle>
            <CardDescription>
              {hasData
                ? `Over the last ${timeRange} days, average ${
                    config.yAxisLabel.toLowerCase()
                  } was ${Math.round(stats.mean)}${
                    selectedMetric === 'health_score' ? ' points' : ''
                  }.`
                : "No daily trend data available for this user"
              }
            </CardDescription>
          </div>

          {/* Dropdown Selector */}
          <Select value={selectedMetric} onValueChange={setSelectedMetric}>
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="health_score">Health Score</SelectItem>
              <SelectItem value="incident_load">Incident Load</SelectItem>
              <SelectItem value="after_hours">After Hours</SelectItem>
              <SelectItem value="severity_weighted">Workload Intensity</SelectItem>
              <SelectItem value="weekend_work">Weekend Work</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Chart */}
          <div className="h-[300px]">
            {loading ? (
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
                  <p className="text-sm text-gray-500 font-medium">No User Objective Data Available</p>
                  <p className="text-xs text-gray-400 mt-1">This user had no incident involvement during the analysis period</p>
                </div>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={processedChartData}
                  margin={{
                    top: 10,
                    right: 10,
                    left: selectedMetric === 'health_score' ? -20 : 20,
                    bottom: 0,
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
                    interval={Math.floor(processedChartData.length / 7) || 0}
                  />
                  <YAxis
                    hide={selectedMetric === 'health_score'}
                    label={
                      selectedMetric !== 'health_score'
                        ? {
                            value: config.yAxisLabel,
                            angle: -90,
                            position: 'insideLeft',
                            style: { textAnchor: 'middle', fontSize: '12px', fill: '#6b7280' },
                          }
                        : undefined
                    }
                  />
                  <Tooltip
                    content={({ payload }) => {
                      if (!payload || payload.length === 0) return null;

                      const data = payload[0]?.payload;
                      const metricValue = data?.[config.dataKey] || 0;
                      const meanScore = data?.meanScore || 0;

                      const percentageChange = meanScore !== 0
                        ? ((metricValue - meanScore) / meanScore) * 100
                        : 0;

                      // For health_score: higher = better (green), lower = worse (red)
                      // For other metrics: lower = better (green), higher = worse (red)
                      const isPositive = selectedMetric === 'health_score'
                        ? percentageChange >= 0
                        : percentageChange <= 0;

                      return (
                        <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
                          <p className="text-sm font-medium text-gray-600 mb-2">
                            {data?.date}
                          </p>
                          <p className={`text-base font-bold mb-2 ${
                            isPositive ? 'text-green-600' : 'text-red-600'
                          }`}>
                            {percentageChange >= 0 ? '↑' : '↓'} {Math.abs(percentageChange).toFixed(1)}%
                          </p>
                          <p className="text-sm text-gray-600">
                            {config.label}: <span className="font-semibold">{metricValue}</span>
                          </p>
                          <p className="text-xs text-gray-500 mt-1">
                            Mean: {meanScore}
                          </p>
                          {data?.incidentCount > 0 && (
                            <p className="text-xs text-gray-500 mt-1">
                              {data.incidentCount} incident{data.incidentCount !== 1 ? 's' : ''}
                            </p>
                          )}
                        </div>
                      );
                    }}
                  />
                  {/* Dynamic Metric Line */}
                  <Line
                    type="monotone"
                    dataKey={config.dataKey}
                    stroke={config.color}
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={true}
                    name={config.label}
                    connectNulls={true}
                  />
                  {/* Mean Score Line */}
                  {config.showMeanLine && (
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
          <div className="mt-4 flex items-center justify-start space-x-6 text-sm text-gray-600">
            <div className="flex items-center space-x-2">
              <div
                className="w-3 h-3 rounded"
                style={{ backgroundColor: config.color }}
              ></div>
              <span>{config.label}</span>
            </div>
            {config.showMeanLine && (
              <div className="flex items-center space-x-2">
                <div className="w-3 h-0.5 bg-red-500 border-dashed"></div>
                <span>Mean</span>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
