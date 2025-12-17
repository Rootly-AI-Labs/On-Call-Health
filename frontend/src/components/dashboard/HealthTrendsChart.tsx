"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from "recharts"

interface HealthTrendsChartProps {
  currentAnalysis: any
  historicalTrends: any
  loadingTrends: boolean
}

export function HealthTrendsChart({
  currentAnalysis,
  historicalTrends,
  loadingTrends
}: HealthTrendsChartProps) {
  return (
    <Card>
        <CardHeader>
          <CardTitle>Health Trends</CardTitle>
          <CardDescription>
            {(() => {
              if (!currentAnalysis) {
                return "No analysis selected - please select an analysis to view health trends";
              }
              if (currentAnalysis?.analysis_data?.daily_trends?.length > 0) {
                return `Health trends from ${currentAnalysis.analysis_data.daily_trends.length} days with active incidents`;
              }
              if (historicalTrends?.daily_trends?.length > 0) {
                return `Health trends from ${historicalTrends.daily_trends.length} days with active incidents`;
              }
              return "No daily trend data available for this analysis";
            })()}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[250px]">
            {loadingTrends ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <div className="animate-spin w-6 h-6 border-2 border-purple-600 border-t-transparent rounded-full mx-auto mb-2"></div>
                  <p className="text-sm text-gray-500">Loading trends...</p>
                </div>
              </div>
            ) : (() => {
              // Check if we have any data to show before rendering the chart
              const hasData = (() => {
                if (!currentAnalysis || currentAnalysis.status !== 'completed') {
                  return false;
                }
                return (currentAnalysis?.analysis_data?.daily_trends?.length > 0) || 
                       (historicalTrends?.daily_trends?.length > 0);
              })()
              
              if (!hasData) {
                return (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center">
                      <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                        <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                        </svg>
                      </div>
                      <p className="text-sm text-gray-500 font-medium">No Health Trends Data</p>
                      <p className="text-xs text-gray-400 mt-1">
                        {!currentAnalysis 
                          ? "Select an analysis to view health trends"
                          : "This analysis has no daily trend data available"
                        }
                      </p>
                    </div>
                  </div>
                );
              }
              
              // Generate chart data
              const chartData = (() => {
                // ONLY show data if we have a valid current analysis - NO FALLBACK DATA
                if (!currentAnalysis || currentAnalysis.status !== 'completed') {
                  return []; // Return empty array - no fallback data
                }
                
                // Use daily_trends from current analysis (primary source)
                if (currentAnalysis?.analysis_data?.daily_trends?.length > 0) {
                  const dailyTrends = currentAnalysis.analysis_data.daily_trends;
                  
                  // Transform data and detect standout events with real data tracking
                  const chartData = dailyTrends.map((trend: any, index: number) => {
                    const incidentCount = trend.incident_count || trend.analysis_count || 0;
                    const hasRealData = incidentCount > 0; // True if incidents occurred on this day
                    
                    return {
                      date: new Date(trend.date).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' }),
                      // Use OCB score methodology (0-100, where higher = more burnout)
                      // Convert health score (0-10) to OCB scale (0-100): OCB = 100 - (health * 10)
                      score: hasRealData ? Math.max(0, Math.min(100, 100 - Math.round(trend.overall_score * 10))) : 0, 
                      // Calculate risk level based on OCB score (0-100, higher = more burnout)
                      riskLevel: hasRealData ? (() => {
                        const ocbScore = 100 - Math.round(trend.overall_score * 10);
                        if (ocbScore < 25) return 'healthy';      // 0-24: Healthy
                        if (ocbScore < 50) return 'fair';         // 25-49: Fair
                        if (ocbScore < 75) return 'poor';         // 50-74: Poor
                        return 'critical';                        // 75-100: Critical
                      })() : null,
                      membersAtRisk: hasRealData ? trend.members_at_risk : null,
                      totalMembers: hasRealData ? trend.total_members : null,
                      healthStatus: hasRealData ? trend.health_status : null,
                      incidentCount: incidentCount,
                      rawScore: hasRealData ? trend.overall_score : null,
                      originalDate: trend.date,
                      index: index,
                      hasRealData: hasRealData,
                      dataType: hasRealData ? 'real' : 'no_data'
                    };
                  });
                  
                  return chartData;
                }
                
                return []; // Return empty if no data - NO FALLBACK
              })();
              
              if (chartData.length === 0) {
                return (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center">
                      <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                        <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                        </svg>
                      </div>
                      <p className="text-sm text-gray-500 font-medium">No Chart Data Available</p>
                    </div>
                  </div>
                );
              }
              
              return (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart 
                    data={chartData} 
                    margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
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
                      interval="preserveStartEnd"
                    />
                    <YAxis 
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 11, fill: '#6B7280' }}
                      domain={[0, 100]}
                      tickFormatter={(value) => `${value}%`}
                    />
                    <Tooltip 
                      content={({ payload, label }) => {
                        if (payload && payload.length > 0) {
                          const data = payload[0].payload as any;
                          return (
                            <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
                              <p className="font-semibold text-gray-900 mb-2">{label}</p>
                              {data.hasRealData ? (
                                <>
                                  <p className="text-green-600 mb-1">OCB Score: {data.score}%</p>
                                  <p className="text-sm text-gray-600">Incidents: {data.incidentCount}</p>
                                  {data.membersAtRisk > 0 && (
                                    <p className="text-sm text-orange-600">At Risk: {data.membersAtRisk}/{data.totalMembers} members</p>
                                  )}
                                </>
                              ) : (
                                <p className="text-gray-500 text-sm">No incidents on this day</p>
                              )}
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Bar dataKey="score" radius={[4, 4, 0, 0]}>
                      {chartData.map((entry: any, index: number) => (
                        <Cell 
                          key={`cell-${index}`}
                          fill={
                            !entry.hasRealData ? '#E5E7EB' :     // Gray for no data
                            entry.score < 25 ? '#10B981' :       // Green for healthy (0-24)
                            entry.score < 50 ? '#F59E0B' :       // Yellow for fair (25-49)
                            entry.score < 75 ? '#F97316' :       // Orange for poor (50-74)
                            '#EF4444'                            // Red for critical (75-100)
                          }
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )
            })()}
          </div>
          
          {/* Legend/Key for bar colors */}
          {(() => {
            // Only show legend if we have chart data
            const hasData = currentAnalysis?.analysis_data?.daily_trends?.length > 0;
            if (!hasData) return null;
            
            return (
              <div className="mt-4 flex items-center justify-center space-x-3 text-xs text-gray-500">
                <div className="flex items-center space-x-1">
                  <div className="w-3 h-3 bg-green-500 rounded"></div>
                  <span>Healthy (0-24)</span>
                </div>
                <div className="flex items-center space-x-1">
                  <div className="w-3 h-3 bg-yellow-500 rounded"></div>
                  <span>Fair (25-49)</span>
                </div>
                <div className="flex items-center space-x-1">
                  <div className="w-3 h-3 bg-orange-500 rounded"></div>
                  <span>Poor (50-74)</span>
                </div>
                <div className="flex items-center space-x-1">
                  <div className="w-3 h-3 bg-red-500 rounded"></div>
                  <span>Critical (75-100)</span>
                </div>
                <div className="flex items-center space-x-1">
                  <div className="w-3 h-3 bg-gray-300 border border-gray-400 border-dashed rounded"></div>
                  <span>No Incidents</span>
                </div>
              </div>
            );
          })()}
        </CardContent>
    </Card>
  )
}