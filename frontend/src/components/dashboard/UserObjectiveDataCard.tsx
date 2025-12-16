"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts"
import { useState, useEffect } from "react"

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

  // Calculate statistics from daily health data
  const calculateStats = (data: any[]) => {
    if (!data || data.length === 0) {
      return { mean: 0 };
    }

    const scores = data.map(d => d.health_score || 0);
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;

    return { mean };
  };

  // Get the chart data
  const getChartData = () => {
    if (!dailyHealthData || dailyHealthData.length === 0) {
      return [];
    }

    // Convert daily health data to chart format
    const chartData = dailyHealthData.map((trend: any) => {
      // Daily health score is already on 0-100 scale
      const dailyScore = trend.health_score || 0;

      return {
        date: new Date(trend.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        originalDate: trend.date,
        dailyScore: dailyScore,
        incidentCount: trend.incident_count || 0,
        hasData: trend.incident_count > 0
      };
    });

    // Calculate mean
    const scores = chartData.map(d => d.dailyScore);
    const mean = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;

    // Add mean to each data point
    const dataWithMean = chartData.map(d => ({
      ...d,
      meanScore: Math.round(mean)
    }));

    return dataWithMean;
  };

  // Get chart mode from backend analysis data (default to 'normal')
  const chartMode = currentAnalysis?.analysis_data?.chart_mode || 'normal';

  // Apply running average if mode is set
  const processedChartData = (() => {
    const data = getChartData();
    if (chartMode === 'running_average' && data.length > 0) {
      const scores = data.map(d => d.dailyScore);
      const averagedScores = calculate7DayRunningAverage(scores);
      return data.map((d, index) => ({
        ...d,
        dailyScore: averagedScores[index]
      }));
    }
    return data;
  })();

  const chartData = getChartData();
  const stats = calculateStats(dailyHealthData);
  const hasData = chartData.length > 0;

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle>User Objective Data</CardTitle>
        <CardDescription>
          {hasData
            ? `Over the last ${timeRange} days, average workload index was ${Math.round(stats.mean)} points.`
            : "No daily trend data available for this user"
          }
        </CardDescription>
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
                  margin={{ top: 20, right: 30, left: 30, bottom: 60 }}
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
                  <Tooltip
                    content={({ payload, label }) => {
                      if (payload && payload.length > 0) {
                        const data = payload[0]?.payload;
                        const dailyScore = data?.dailyScore || 0;
                        const meanScore = data?.meanScore || 0;

                        // Calculate percentage difference from mean
                        const percentageChange = meanScore !== 0
                          ? ((dailyScore - meanScore) / meanScore) * 100
                          : 0;

                        // Format the date
                        const dateObj = new Date(data?.originalDate);
                        const formattedDate = dateObj.toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric'
                        });

                        return (
                          <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
                            <p className={`text-sm font-bold mb-2 ${percentageChange >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                              {percentageChange >= 0 ? '+' : ''}{percentageChange.toFixed(1)}%
                            </p>
                            <p className="text-xs text-gray-500 pt-2 border-t">
                              {formattedDate}
                            </p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  {/* Daily User Health Score Line */}
                  <Line
                    type="monotone"
                    dataKey="dailyScore"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={true}
                    name="Daily User Health Score"
                    connectNulls={true}
                  />
                  {/* Mean Score Line */}
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
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Legend */}
          <div className="mt-4 flex items-center justify-start space-x-6 text-xs text-gray-600">
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 bg-blue-500 rounded"></div>
              <span>Daily Health Score</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-3 h-0.5 bg-red-500"></div>
              <span className="ml-1">{timeRange}-Day Mean</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
