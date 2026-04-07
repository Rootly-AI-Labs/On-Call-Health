"use client"

import { useState, useMemo } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { InfoTooltip } from "@/components/ui/info-tooltip"

interface AlertsLeaderboardProps {
  currentAnalysis?: any
  topAlerts?: any[]
  title?: string
  platform?: string
}

type FilterKey = "total" | "noise" | "night_time" | "after_hours" | "no_incident" | "escalated" | "retriggered"

const FILTERS: { key: FilterKey; label: string; description: string }[] = [
  { key: "total",       label: "Most Fired",      description: "Alerts that fired the most times in this period." },
  { key: "noise",       label: "Noisiest",        description: "Alerts classified as noise (firing without being actionable)." },
  { key: "night_time",  label: "Night-Time",      description: "Alerts firing during deep night hours (10pm–6am)." },
  { key: "after_hours", label: "After-Hours",     description: "Alerts firing outside business hours (6pm–9am), evenings and weekends." },
  { key: "no_incident", label: "No Incident",     description: "Alerts that fired but never escalated into a full incident (potential noise or misconfiguration)." },
  { key: "escalated",   label: "Escalated",       description: "Alerts that were escalated to another responder or level." },
  { key: "retriggered", label: "Retriggered",     description: "Alerts that fired again after being acknowledged or resolved." },
]

const BAR_COLORS: Record<FilterKey, string> = {
  total:       "bg-neutral-400",
  noise:       "bg-red-400",
  night_time:  "bg-indigo-400",
  after_hours: "bg-violet-400",
  no_incident: "bg-orange-400",
  escalated:   "bg-yellow-400",
  retriggered: "bg-pink-400",
}

export function AlertsLeaderboard({ currentAnalysis, topAlerts: topAlertsProp, title, platform }: AlertsLeaderboardProps) {
  const [activeKey, setActiveKey] = useState<FilterKey>("total")

  const resolvedPlatform = platform ?? currentAnalysis?.platform

  const topAlerts: any[] = useMemo(() => {
    if (topAlertsProp !== undefined) return topAlertsProp
    return currentAnalysis?.analysis_data?.metadata?.alerts?.top_alerts ?? []
  }, [currentAnalysis, topAlertsProp])

  if (resolvedPlatform === 'pagerduty') {
    return (
      <Card className="bg-white flex flex-col h-full overflow-hidden">
        <CardHeader className="pb-2 shrink-0">
          <div className="space-y-1">
            <CardTitle className="text-neutral-900">{title ?? "Team Alert Leaderboard"}</CardTitle>
            <CardDescription>Top alerts ranked by negative impact criteria</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center py-10 text-center gap-2">
          <p className="text-sm font-medium text-neutral-600">Alert data is not available for PagerDuty</p>
          <p className="text-xs text-neutral-400">Connect Rootly to access alert insights</p>
        </CardContent>
      </Card>
    )
  }

  const activeFilter = FILTERS.find((f) => f.key === activeKey)!

  const sorted = useMemo(() => {
    return [...topAlerts]
      .filter((a) => (a[activeKey] ?? 0) > 0)
      .sort((a, b) => (b[activeKey] ?? 0) - (a[activeKey] ?? 0))
  }, [topAlerts, activeKey])

  const maxVal = sorted.length > 0 ? (sorted[0][activeKey] ?? 0) : 1

  return (
    <Card className="bg-white flex flex-col h-full overflow-hidden">
      <CardHeader className="pb-2 shrink-0">
        <div className="space-y-1">
          <CardTitle className="text-neutral-900">{title ?? "Team Alert Leaderboard"}</CardTitle>
          <CardDescription>Top alerts ranked by negative impact criteria</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col flex-1 min-h-0 overflow-hidden">
        {/* Filter tabs */}
        <div className="flex flex-wrap gap-1.5 mb-2 shrink-0">
          {FILTERS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setActiveKey(key)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                activeKey === key
                  ? "bg-neutral-900 text-white"
                  : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Active filter description */}
        <div className="flex items-center justify-between mb-3 shrink-0">
          <p className="text-xs text-neutral-400">{activeFilter.description}</p>
          <InfoTooltip content="Results are limited to the top 50 alerts per filter." side="left" />
        </div>

        {topAlerts.length === 0 ? (
          <div className="text-sm text-neutral-400 text-center py-6">
            No alert data available — run a new analysis to populate this.
          </div>
        ) : sorted.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-sm text-neutral-400">No alerts match this filter</div>
        ) : (
          <div className="overflow-y-auto flex-1 space-y-2.5 pr-2 min-h-0">
            {sorted.map((alert, i) => {
              const val = alert[activeKey] ?? 0
              const total = alert.total ?? 0
              const barPct = Math.max(maxVal > 0 ? (val / maxVal) * 100 : 0, 2)
              const pct = total > 0 ? Math.round((val / total) * 100) : null

              return (
                <div key={alert.title + i} className="space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-xs text-neutral-700 font-medium leading-tight flex-1 min-w-0 truncate" title={alert.title}>
                      {alert.title}
                    </span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-xs font-semibold text-neutral-800 w-6 text-right">{val}</span>
                    </div>
                  </div>
                  <div className="h-1.5 w-full bg-neutral-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${BAR_COLORS[activeKey]}`}
                      style={{ width: `${barPct}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
