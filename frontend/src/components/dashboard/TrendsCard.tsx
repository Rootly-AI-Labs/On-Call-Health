"use client"

import type { ReactElement } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Area, AreaChart, XAxis, YAxis, Line, Tooltip, ResponsiveContainer } from "recharts"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Info } from "lucide-react"

interface TrendsCardProps {
  title: string
  description: string
  chartData: any[]
  loading: boolean
  selectedMetric: string
  onMetricChange: (metric: string) => void
  metricConfig: Record<string, any>
  metricDescriptions: Record<string, any>
  timeRange: number
}

function LoadingState(): ReactElement {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center">
        <div className="animate-spin w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full mx-auto mb-2" />
        <p className="text-sm text-neutral-500">Loading trends...</p>
      </div>
    </div>
  )
}

function EmptyState(): ReactElement {
  return (
    <div className="flex items-center justify-center h-full">
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
  )
}

export function TrendsCard({
  title,
  description,
  chartData,
  loading,
  selectedMetric,
  onMetricChange,
  metricConfig,
  metricDescriptions,
  timeRange
}: TrendsCardProps): ReactElement {
  const config = metricConfig[selectedMetric]
  const hasData = chartData.length > 0

  return (
    <Card className="mb-6">
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="space-y-1.5">
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>

        <div className="flex items-center space-x-2">
          {/* Info icon with tooltip */}
          <div className="relative group">
            <Info className="w-4 h-4 text-neutral-500 cursor-help hover:text-neutral-700 transition-colors" />
            <div className="absolute top-full right-0 mt-2 px-3 py-2 bg-neutral-900/95 text-white text-xs rounded-lg w-64 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
              <div className="font-semibold mb-1">{metricDescriptions[selectedMetric].title}</div>
              <div>{metricDescriptions[selectedMetric].description}</div>
              <div className="absolute bottom-full right-4 w-0 h-0 border-l-4 border-r-4 border-b-4 border-l-transparent border-r-transparent border-b-gray-900/95"></div>
            </div>
          </div>

          {/* Dropdown Selector */}
          <Select value={selectedMetric} onValueChange={onMetricChange}>
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(metricConfig).map(([key, value]: [string, any]) => (
                <SelectItem key={key} value={key}>
                  {value.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>

      <CardContent className="pb-6">
        <div className="flex flex-col gap-3">
          <div className="h-[300px]">
            {loading ? <LoadingState /> : !hasData ? <EmptyState /> : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={chartData}
                  margin={{
                    top: 10,
                    right: 10,
                    left: selectedMetric === 'health_score' ? -20 : 20,
                    bottom: 0,
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

                      // For all metrics (risk level, incidents, after hours, workload),
                      // higher values are worse, so decrease is positive (green)
                      const isPositive = percentageChange <= 0;

                      return (
                        <div className="bg-neutral-900/95 p-3 border border-neutral-700 rounded-lg shadow-lg backdrop-blur-xs">
                          <p className="text-sm font-medium text-neutral-300 mb-2">
                            {data?.date}
                          </p>
                          <p className={`text-base font-bold mb-2 ${
                            isPositive ? 'text-green-400' : 'text-red-400'
                          }`}>
                            {percentageChange >= 0 ? '↑' : '↓'} {Math.abs(percentageChange).toFixed(1)}%
                          </p>
                          {selectedMetric === 'risk_level' ? (
                            <>
                              <p className="text-sm text-neutral-300 font-semibold">{metricValue}</p>
                              <p className="text-xs text-neutral-400 mt-1">{meanScore}</p>
                            </>
                          ) : selectedMetric === 'after_hours' ? (
                            <>
                              <p className="text-sm text-neutral-300">
                                {config.label}: <span className="font-semibold">{metricValue}%</span>
                              </p>
                              <p className="text-xs text-neutral-400 mt-1">
                                {data?.afterHours || 0} of {data?.totalActivities || 0} activities
                              </p>
                              <p className="text-xs text-neutral-400 mt-1">
                                • After Hours Incidents: {data?.afterHoursIncidents || 0}
                              </p>
                              <p className="text-xs text-neutral-400">
                                • After Hours Commits: {data?.afterHoursCommits || 0}
                              </p>
                              <p className="text-xs text-neutral-400 mt-1">
                                Mean: {meanScore}%
                              </p>
                            </>
                          ) : (
                            <>
                              <p className="text-sm text-neutral-300">
                                {config.label}: <span className="font-semibold">{metricValue}</span>
                              </p>
                              {selectedMetric !== 'incident_load' && selectedMetric !== 'after_hours' && selectedMetric !== 'severity_weighted' && (
                                <p className="text-xs text-neutral-400 mt-1">
                                  Mean: {meanScore}
                                </p>
                              )}
                            </>
                          )}
                        </div>
                      );
                    }}
                  />
                  {/* Dynamic Metric Area with Gradient */}
                  <Area
                    type="monotone"
                    dataKey={config.dataKey}
                    stroke={config.color}
                    strokeWidth={2}
                    fill="url(#purpleGradient)"
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
          <div className="flex items-center justify-start space-x-6 text-sm text-neutral-700">
            <div className="flex items-center space-x-2">
              <div
                className="w-3 h-3 rounded-sm"
                style={{ backgroundColor: config.color }}
              ></div>
              <span>{config.label}</span>
            </div>
            {config.showMeanLine && (
              <div className="flex items-center space-x-2">
                <div className="w-3 h-0.5 bg-purple-500 border-dashed"></div>
                <span>Mean</span>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
