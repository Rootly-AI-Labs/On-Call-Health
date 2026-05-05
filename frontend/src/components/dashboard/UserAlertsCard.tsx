"use client"

import { useState, useRef, useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { TrendingUp, TrendingDown, Minus, ChevronRight, ChevronLeft, Eye, EyeOff } from "lucide-react"
import { InfoTooltip } from "@/components/ui/info-tooltip"

function formatDate(value?: string): string {
  if (!value) return "unknown"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "unknown"
  return date.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })
}

const SOURCE_COLORS = [
  "bg-blue-500", "bg-green-500", "bg-orange-400", "bg-purple-500",
  "bg-pink-500", "bg-yellow-400", "bg-cyan-500", "bg-red-400",
]

type AlertTrendKey = "total" | "incidents" | "after_hours" | "night_time" | "escalated" | "retrigger"
type UserPopupTab = "breakdown" | "sources"

const METRIC_CONFIGS: { key: AlertTrendKey; label: string; color: string }[] = [
  { key: "total",       label: "All Alerts",     color: "#6b7280" },
  { key: "incidents",   label: "With incidents", color: "#3b82f6" },
  { key: "after_hours", label: "After-hours",    color: "#f97316" },
  { key: "night_time",  label: "Night-time",     color: "#a855f7" },
  { key: "escalated",   label: "Escalated",      color: "#ef4444" },
  { key: "retrigger",   label: "Retriggered",    color: "#ec4899" },
]

function buildMonthlyData(daily: Record<string, any>): Record<string, any> {
  const monthData: Record<string, any> = {}
  Object.keys(daily).sort().forEach((day) => {
    const key = day.slice(0, 7) + "-01"
    if (!monthData[key]) monthData[key] = { total: 0, incidents: 0, after_hours: 0, night_time: 0, escalated: 0, retrigger: 0 }
    const d = daily[day] || {}
    monthData[key].total      += d.total      ?? 0
    monthData[key].incidents  += d.incidents  ?? 0
    monthData[key].after_hours+= d.after_hours?? 0
    monthData[key].night_time += d.night_time ?? 0
    monthData[key].escalated  += d.escalated  ?? 0
    monthData[key].retrigger  += d.retrigger  ?? 0
  })
  return monthData
}

function buildWeeklyData(daily: Record<string, any>): Record<string, any> {
  const weekData: Record<string, any> = {}
  Object.keys(daily).sort().forEach((day) => {
    const date = new Date(day + "T00:00:00")
    const dow = date.getDay()
    const daysBack = dow === 0 ? 6 : dow - 1
    const monday = new Date(date)
    monday.setDate(date.getDate() - daysBack)
    const key = monday.toISOString().split("T")[0]
    if (!weekData[key]) weekData[key] = { total: 0, incidents: 0, after_hours: 0, night_time: 0, escalated: 0, retrigger: 0 }
    const d = daily[day] || {}
    weekData[key].total      += d.total      ?? 0
    weekData[key].incidents  += d.incidents  ?? 0
    weekData[key].after_hours+= d.after_hours?? 0
    weekData[key].night_time += d.night_time ?? 0
    weekData[key].escalated  += d.escalated  ?? 0
    weekData[key].retrigger  += d.retrigger  ?? 0
  })
  return weekData
}

function calcTotalAlertTrend(daily: Record<string, { total: number }>): number | null {
  const days = Object.keys(daily).sort()
  if (days.length < 2) return null
  const values = days.map((d) => daily[d].total ?? 0)
  const n = values.length
  const xMean = (n - 1) / 2
  const yMean = values.reduce((s, v) => s + v, 0) / n
  let num = 0, den = 0
  for (let i = 0; i < n; i++) {
    num += (i - xMean) * (values[i] - yMean)
    den += (i - xMean) ** 2
  }
  const slope = den !== 0 ? num / den : 0
  const intercept = yMean - slope * xMean
  const predicted0 = intercept
  const predictedN = intercept + slope * (n - 1)
  if (predicted0 <= 0 && predictedN <= 0) return 0
  if (predicted0 <= 0) return predictedN > 0 ? 100 : 0
  return Math.round(((predictedN - predicted0) / predicted0) * 100)
}

function calcAlertTrend(daily: Record<string, any>, key: AlertTrendKey): number | null {
  const days = Object.keys(daily).sort()
  if (days.length === 0) return null
  if (days.length === 1) return 0
  const values = days.map((d) => {
    const day = daily[d]
    return day.total > 0 ? (day[key] ?? 0) / day.total : 0
  })
  const n = values.length
  const xMean = (n - 1) / 2
  const yMean = values.reduce((s, v) => s + v, 0) / n
  let num = 0, den = 0
  for (let i = 0; i < n; i++) {
    num += (i - xMean) * (values[i] - yMean)
    den += (i - xMean) ** 2
  }
  const slope = den !== 0 ? num / den : 0
  const intercept = yMean - slope * xMean
  const predicted0 = intercept
  const predictedN = intercept + slope * (n - 1)
  if (predicted0 <= 0 && predictedN <= 0) return 0
  if (predicted0 <= 0) return predictedN > 0 ? 100 : 0
  return Math.round(((predictedN - predicted0) / predicted0) * 100)
}

function TrendTag({ change }: { change: number | null }) {
  if (change === null) return null
  if (change <= -30) return (
    <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold px-1.5 py-0.5 rounded-full border bg-green-100 text-green-700 border-green-200">
      <TrendingUp className="w-2.5 h-2.5" /><TrendingUp className="w-2.5 h-2.5" />Improving Fast
    </span>
  )
  if (change <= -15) return (
    <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold px-1.5 py-0.5 rounded-full border bg-green-50 text-green-600 border-green-100">
      <TrendingUp className="w-2.5 h-2.5" />Improving
    </span>
  )
  if (change >= 30) return (
    <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold px-1.5 py-0.5 rounded-full border bg-red-100 text-red-700 border-red-200">
      <TrendingDown className="w-2.5 h-2.5" /><TrendingDown className="w-2.5 h-2.5" />Critical
    </span>
  )
  if (change >= 15) return (
    <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold px-1.5 py-0.5 rounded-full border bg-yellow-50 text-yellow-700 border-yellow-100">
      <TrendingDown className="w-2.5 h-2.5" />Worsening
    </span>
  )
  return (
    <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold px-1.5 py-0.5 rounded-full border bg-purple-50 text-purple-600 border-purple-200">
      <Minus className="w-2.5 h-2.5" />Stable
    </span>
  )
}

interface UserAlertsCardProps {
  memberData: any
  alertsMeta?: any
  platform?: string
}

export function UserAlertsCard({ memberData, alertsMeta, platform }: UserAlertsCardProps): React.ReactElement {
  const [showDetail, setShowDetail] = useState(false)
  const [tab, setTab] = useState<UserPopupTab>("breakdown")
  const [hidden, setHidden] = useState<Set<AlertTrendKey>>(new Set())
  const [hoveredChip, setHoveredChip] = useState<AlertTrendKey | null>(null)
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null)
  const [overlayMode, setOverlayMode] = useState<"none" | "wow" | "mom">("none")
  const svgRef = useRef<SVGSVGElement>(null)

  const daily: Record<string, any> = memberData?.alerts_daily_breakdown || {}

  const trends = useMemo(() => ({
    total:       calcTotalAlertTrend(daily),
    incidents:   calcAlertTrend(daily, "incidents"),
    after_hours: calcAlertTrend(daily, "after_hours"),
    night_time:  calcAlertTrend(daily, "night_time"),
    escalated:   calcAlertTrend(daily, "escalated"),
    retrigger:   calcAlertTrend(daily, "retrigger"),
  }), [memberData])

  if (platform === 'pagerduty') {
    return (
      <Card className="bg-white">
        <CardHeader className="pb-2">
          <CardTitle className="text-neutral-900">User Alerts</CardTitle>
          <CardDescription>Volume, signal quality and breakdown trends</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center py-10 text-center gap-2">
          <p className="text-sm font-medium text-neutral-600">Alert data is not available for PagerDuty</p>
          <p className="text-xs text-neutral-400">Connect Rootly to access alert insights</p>
        </CardContent>
      </Card>
    )
  }

  const count = memberData?.alerts_count
  const dateRange = alertsMeta ? `${formatDate(alertsMeta.start)} - ${formatDate(alertsMeta.end)}` : "unknown"

  const noiseCounts = memberData?.alerts_noise_counts || {}
  const totalForNoise = typeof count === "number" && count > 0 ? count : null
  const notNoiseCount = typeof noiseCounts.not_noise === "number" ? noiseCounts.not_noise : 0
  const notNoisePct = totalForNoise !== null ? Math.floor((notNoiseCount / totalForNoise) * 100) : null

  const alertsWithIncidentsCount = typeof memberData?.alerts_with_incidents_count === "number" ? memberData.alerts_with_incidents_count : null
  const alertsWithIncidentsPct = totalForNoise !== null && alertsWithIncidentsCount !== null ? Math.round((alertsWithIncidentsCount / totalForNoise) * 100) : null
  const afterHoursCount = typeof memberData?.alerts_after_hours_count === "number" ? memberData.alerts_after_hours_count : null
  const afterHoursPct = totalForNoise !== null && afterHoursCount !== null ? Math.ceil((afterHoursCount / totalForNoise) * 100) : null
  const nightTimeCount = typeof memberData?.alerts_night_time_count === "number" ? memberData.alerts_night_time_count : null
  const nightTimePct = totalForNoise !== null && nightTimeCount !== null ? Math.ceil((nightTimeCount / totalForNoise) * 100) : null
  const escalatedCount = typeof memberData?.alerts_escalated_count === "number" ? memberData.alerts_escalated_count : null
  const escalatedPct = totalForNoise !== null && escalatedCount !== null ? Math.floor((escalatedCount / totalForNoise) * 100) : null
  const retriggeredCount = typeof memberData?.alerts_retriggered_count === "number" ? memberData.alerts_retriggered_count : null
  const retriggeredPct = totalForNoise !== null && retriggeredCount !== null ? Math.floor((retriggeredCount / totalForNoise) * 100) : null

  const sourceCounts = memberData?.alerts_derived_source_counts || memberData?.alerts_source_counts || {}
  const sourceEntries = Object.entries(sourceCounts)
    .filter(([, value]) => typeof value === "number" && (value as number) > 0)
    .sort((a, b) => (b[1] as number) - (a[1] as number))
  const sourceMax = sourceEntries.length > 0 ? (sourceEntries[0][1] as number) : 1

  const breakdownItems = [
    alertsWithIncidentsCount !== null && { count: alertsWithIncidentsCount, pct: alertsWithIncidentsPct, label: "With incidents", trend: trends.incidents, metricKey: "incidents" as AlertTrendKey },
    afterHoursCount !== null          && { count: afterHoursCount,          pct: afterHoursPct,          label: "After-hours",   trend: trends.after_hours, metricKey: "after_hours" as AlertTrendKey },
    nightTimeCount !== null           && { count: nightTimeCount,           pct: nightTimePct,           label: "Night-time",    trend: trends.night_time,  metricKey: "night_time" as AlertTrendKey },
    escalatedCount !== null           && { count: escalatedCount,           pct: escalatedPct,           label: "Escalated",     trend: trends.escalated,   metricKey: "escalated" as AlertTrendKey },
    retriggeredCount !== null         && { count: retriggeredCount,         pct: retriggeredPct,         label: "Retriggered",   trend: trends.retrigger,   metricKey: "retrigger" as AlertTrendKey },
  ].filter(Boolean) as { count: number; pct: number | null; label: string; trend: number | null; metricKey: AlertTrendKey }[]

  const visibleKeys = new Set<AlertTrendKey>(["total", ...breakdownItems.map((i) => i.metricKey)])
  const activeMetrics = METRIC_CONFIGS.filter((m) => visibleKeys.has(m.key))

  // Chart geometry
  const days = Object.keys(daily).sort()
  const ML = 44, MR = 16, MT = 12, MB = 36
  const VW = 480, VH = 150
  const plotW = VW - ML - MR
  const plotH = VH - MT - MB

  const overlayOffset = overlayMode !== "none" ? 1 : 0
  const chartData = overlayMode === "wow" ? buildWeeklyData(daily) : overlayMode === "mom" ? buildMonthlyData(daily) : daily
  const chartDays = Object.keys(chartData).sort()

  const allValues = activeMetrics
    .filter((m) => !hidden.has(m.key))
    .flatMap((m) => chartDays.map((d) => (chartData[d]?.[m.key] ?? 0) as number))
  const overlayValues = overlayOffset > 0
    ? activeMetrics
        .filter((m) => !hidden.has(m.key))
        .flatMap((m) => chartDays.slice(overlayOffset).map((_, i) => (chartData[chartDays[i]]?.[m.key] ?? 0) as number))
    : []
  const yMax = Math.max(...allValues, ...overlayValues, 1)

  const xOf = (i: number) => ML + (i / Math.max(chartDays.length - 1, 1)) * plotW
  const yOf = (v: number) => MT + plotH - (v / yMax) * plotH
  const yTicks = Array.from(new Set(Array.from({ length: 5 }, (_, i) => Math.round((yMax / 4) * i))))
  const xLabelStep = Math.max(1, Math.floor(chartDays.length / 6))
  const xLabels = chartDays.map((d, i) => ({ d, i })).filter(({ i }) => i % xLabelStep === 0 || i === chartDays.length - 1)

  const xLabelFormat = (d: string) => overlayMode === "wow"
    ? `Wk ${new Date(d + "T00:00:00").toLocaleDateString([], { month: "short", day: "numeric" })}`
    : overlayMode === "mom"
    ? new Date(d + "T00:00:00").toLocaleDateString([], { month: "short", year: "numeric" })
    : new Date(d + "T00:00:00").toLocaleDateString([], { month: "short", day: "numeric" })

  const pathFor = (key: AlertTrendKey) =>
    chartDays.map((d, i) => {
      const v = (chartData[d]?.[key] ?? 0) as number
      return `${i === 0 ? "M" : "L"}${xOf(i)},${yOf(v)}`
    }).join(" ")

  const pathForOverlay = (key: AlertTrendKey) => {
    const pts: string[] = []
    let started = false
    chartDays.forEach((_, i) => {
      const histIdx = i - overlayOffset
      if (histIdx < 0) return
      const v = (chartData[chartDays[histIdx]]?.[key] ?? 0) as number
      pts.push(`${!started ? "M" : "L"}${xOf(i)},${yOf(v)}`)
      started = true
    })
    return pts.join(" ")
  }

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const svgX = ((e.clientX - rect.left) / rect.width) * VW
    const idx = Math.round(((svgX - ML) / plotW) * (chartDays.length - 1))
    setHoverIndex(Math.max(0, Math.min(chartDays.length - 1, idx)))
    setMousePos({ x: e.clientX, y: e.clientY })
  }

  const toggle = (key: AlertTrendKey) => {
    setHidden((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  const hoverX = hoverIndex !== null ? xOf(hoverIndex) : null
  const hoverDay = hoverIndex !== null ? chartDays[hoverIndex] : null
  const hoverLabel = hoverDay
    ? overlayMode === "wow"
      ? `Week of ${new Date(hoverDay + "T00:00:00").toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}`
      : overlayMode === "mom"
      ? new Date(hoverDay + "T00:00:00").toLocaleDateString([], { month: "long", year: "numeric" })
      : new Date(hoverDay + "T00:00:00").toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })
    : null
  const tooltipOnLeft = hoverIndex !== null && hoverIndex > chartDays.length * 0.65

  return (
    <Card className="bg-white">
      {!showDetail ? (
        <>
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <CardTitle className="text-neutral-900">User Alerts</CardTitle>
                <CardDescription>Volume, signal quality and breakdown trends</CardDescription>
              </div>
              <button
                onClick={() => setShowDetail(true)}
                className="flex items-center gap-0.5 text-xs text-neutral-500 hover:text-neutral-800 transition-colors shrink-0"
              >
                View Details <ChevronRight className="w-3 h-3" />
              </button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              <div className="inline-flex items-start gap-1.5">
                <span className="text-4xl font-bold text-neutral-900 leading-tight">
                  {typeof count === "number" ? count : "N/A"}
                </span>
                <TrendTag change={trends.total} />
              </div>
              <div className="text-xs text-neutral-400">{dateRange}</div>
            </div>

            {notNoisePct !== null && (
              <div className="my-4">
                <div className="flex items-center justify-between text-[13px] mb-1">
                  <div className="flex items-center gap-1">
                    <span className="text-neutral-700 font-medium">Signal Quality</span>
                    <InfoTooltip content="Percentage of alerts that are actionable (not noise)." side="bottom" />
                  </div>
                  <span className="text-green-600 font-medium">{notNoisePct}% actionable</span>
                </div>
                <div className="h-2 w-full bg-neutral-100 rounded-full overflow-hidden">
                  <div className="h-full bg-green-500 rounded-full" style={{ width: `${notNoisePct}%` }} />
                </div>
              </div>
            )}

            {breakdownItems.length > 0 && (
              <div>
                <div className="text-[13px] font-semibold text-neutral-800 mb-1">Alert Breakdown</div>
                <div className="flex justify-between items-start w-full">
                  {breakdownItems.map((item) => (
                    <div key={item.label} className="flex min-w-0 flex-col items-start text-left">
                      <div className="mb-0.5 self-start">
                        <TrendTag change={item.trend ?? null} />
                      </div>
                      <div className="flex flex-wrap items-baseline gap-x-1 gap-y-0.5">
                        <span className="text-base font-bold text-neutral-900 leading-tight">{item.count}</span>
                        {item.pct !== null && (
                          <span className="text-xs font-normal text-neutral-400">({item.pct}%)</span>
                        )}
                      </div>
                      <span className="text-[10px] mt-0.5 leading-tight text-neutral-400">{item.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </>
      ) : (
        <>
          <CardHeader className="pb-3">
            <button
              onClick={() => setShowDetail(false)}
              className="text-neutral-400 hover:text-neutral-700 transition-colors w-fit"
              aria-label="Back to User Alerts"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          </CardHeader>
          <CardContent>
            {/* Tabs */}
            <div className="flex gap-1 mb-4 border-b border-neutral-200">
              {(["breakdown", "sources"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`px-4 py-2 text-sm font-medium transition-colors ${
                    tab === t
                      ? "border-b-2 border-neutral-800 text-neutral-800 -mb-px"
                      : "text-neutral-400 hover:text-neutral-600"
                  }`}
                >
                  {t === "breakdown" ? "Alert Breakdown" : "Alert Sources"}
                </button>
              ))}
            </div>

            {tab === "breakdown" && (
              days.length === 0 ? (
                <p className="text-sm text-neutral-400 text-center py-6">No daily breakdown data available.</p>
              ) : (
                <>
                  {/* Toggle chips */}
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    {activeMetrics.map((m) => {
                      const isHidden = hidden.has(m.key)
                      return (
                        <button
                          key={m.key}
                          onClick={() => toggle(m.key)}
                          onMouseEnter={() => setHoveredChip(m.key)}
                          onMouseLeave={() => setHoveredChip(null)}
                          className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition-all duration-150 ${
                            isHidden
                              ? "opacity-30 border-neutral-200 bg-neutral-50 text-neutral-500"
                              : hoveredChip !== null && hoveredChip !== m.key
                              ? "opacity-30 border-neutral-200 bg-neutral-50 text-neutral-500"
                              : "border-neutral-300 bg-white text-neutral-700"
                          }`}
                        >
                          <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: m.color }} />
                          {m.label}
                          {isHidden ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                        </button>
                      )
                    })}
                  </div>

                  {/* Compare row */}
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">Compare:</span>
                    {(["wow", ...(days.length > 31 ? ["mom"] : [])] as ("wow" | "mom")[]).map((mode) => (
                      <button
                        key={mode}
                        onClick={() => setOverlayMode((prev) => prev === mode ? "none" : mode)}
                        className={`text-[10px] px-2.5 py-0.5 rounded border transition-colors ${
                          overlayMode === mode
                            ? "bg-neutral-800 text-white border-neutral-800"
                            : "bg-white text-neutral-400 border-neutral-200 hover:border-neutral-400 hover:text-neutral-600"
                        }`}
                      >
                        {mode === "wow" ? "Week-over-Week" : "Month-over-Month"}
                      </button>
                    ))}
                    {overlayMode !== "none" && (
                      <span className="flex items-center gap-1 text-[10px] text-neutral-400 ml-1">
                        <svg width="20" height="8" viewBox="0 0 20 8"><line x1="0" y1="4" x2="20" y2="4" stroke="#9ca3af" strokeWidth="1.5" strokeDasharray="3 2" /></svg>
                        {overlayMode === "mom" ? "Dotted line = same month last period" : "Dotted line = same day 1 week ago"}
                      </span>
                    )}
                  </div>

                  {/* SVG chart */}
                  <svg
                    ref={svgRef}
                    viewBox={`0 0 ${VW} ${VH}`}
                    className="w-full cursor-crosshair"
                    onMouseMove={handleMouseMove}
                    onMouseLeave={() => { setHoverIndex(null); setMousePos(null) }}
                  >
                    {yTicks.map((v, i) => (
                      <g key={`ytick-${i}-${v}`}>
                        <line x1={ML} y1={yOf(v)} x2={VW - MR} y2={yOf(v)} stroke="#e5e7eb" strokeWidth="1" />
                        <text x={ML - 6} y={yOf(v) + 4} textAnchor="end" fontSize="6" fill="#9ca3af">{v}</text>
                      </g>
                    ))}
                    {xLabels.map(({ d, i }) => (
                      <text key={d} x={xOf(i)} y={VH - MB + 14} textAnchor="middle" fontSize="6" fill="#9ca3af">
                        {xLabelFormat(d)}
                      </text>
                    ))}
                    {activeMetrics
                      .filter((m) => !hidden.has(m.key))
                      .map((m) => {
                        const faded = hoveredChip !== null && hoveredChip !== m.key
                        return (
                          <path
                            key={m.key}
                            d={pathFor(m.key)}
                            fill="none"
                            stroke={m.color}
                            strokeWidth={faded ? 0.75 : 1.25}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            opacity={faded ? 0.2 : 1}
                            style={{ transition: "opacity 0.15s, stroke-width 0.15s" }}
                          />
                        )
                      })}
                    {overlayOffset > 0 && activeMetrics
                      .filter((m) => !hidden.has(m.key))
                      .map((m) => (
                        <path
                          key={`overlay-${m.key}`}
                          d={pathForOverlay(m.key)}
                          fill="none"
                          stroke={m.color}
                          strokeWidth={0.75}
                          strokeDasharray="3 2"
                          strokeLinecap="round"
                          opacity={0.45}
                        />
                      ))}
                    {hoverX !== null && hoverIndex !== null && (
                      <g>
                        <line x1={hoverX} y1={MT} x2={hoverX} y2={MT + plotH} stroke="#6b7280" strokeWidth="1" strokeDasharray="4 3" />
                        {activeMetrics
                          .filter((m) => !hidden.has(m.key))
                          .map((m) => {
                            const v = (chartData[chartDays[hoverIndex]]?.[m.key] ?? 0) as number
                            return <circle key={m.key} cx={hoverX} cy={yOf(v)} r="3.5" fill={m.color} stroke="white" strokeWidth="1.5" />
                          })}
                      </g>
                    )}
                  </svg>
                  {mousePos && hoverIndex !== null && hoverDay && hoverLabel && (() => {
                    const visibleMetrics = activeMetrics.filter((m) => !hidden.has(m.key))
                    const hasOverlay = overlayOffset > 0
                    const histIdx = hoverIndex - overlayOffset
                    const histDay = hasOverlay && histIdx >= 0 ? chartDays[histIdx] : null
                    const histLabel = histDay
                      ? overlayMode === "wow"
                        ? `Week of ${new Date(histDay + "T00:00:00").toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}`
                        : overlayMode === "mom"
                        ? new Date(histDay + "T00:00:00").toLocaleDateString([], { month: "long", year: "numeric" })
                        : new Date(histDay + "T00:00:00").toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })
                      : null
                    return (
                      <div
                        className="fixed z-50 pointer-events-none"
                        style={{ left: tooltipOnLeft ? mousePos.x - 180 : mousePos.x + 16, top: mousePos.y - 10 }}
                      >
                        <div className="bg-white border border-neutral-200 rounded-lg shadow-lg text-xs p-2.5 min-w-[160px]">
                          <div className="font-semibold text-neutral-800 mb-1.5 text-[11px]">{hoverLabel}</div>
                          <div className="space-y-1">
                            {visibleMetrics.map((m) => {
                              const v = (chartData[hoverDay]?.[m.key] ?? 0) as number
                              return (
                                <div key={m.key} className="flex items-center justify-between gap-3">
                                  <div className="flex items-center gap-1.5">
                                    <span className="w-2 h-2 rounded-full inline-block shrink-0" style={{ backgroundColor: m.color }} />
                                    <span className="text-neutral-500">{m.label}</span>
                                  </div>
                                  <span className="font-semibold text-neutral-900">{v}</span>
                                </div>
                              )
                            })}
                          </div>
                          {hasOverlay && histLabel && (
                            <>
                              <div className="border-t border-neutral-100 my-1.5" />
                              <div className="font-semibold text-neutral-800 mb-1.5 text-[11px]">{histLabel}</div>
                              <div className="space-y-1">
                                {visibleMetrics.map((m) => {
                                  const v = (chartData[hoverDay]?.[m.key] ?? 0) as number
                                  const histV = histDay ? (chartData[histDay]?.[m.key] ?? 0) as number : null
                                  const pct = histV !== null ? (histV > 0 ? Math.round(((v - histV) / histV) * 100) : v > 0 ? 100 : 0) : null
                                  return (
                                    <div key={m.key} className="flex items-center justify-between gap-3">
                                      <div className="flex items-center gap-1.5">
                                        <span className="w-2 h-2 rounded-full inline-block shrink-0 opacity-40" style={{ backgroundColor: m.color }} />
                                        <span className="text-neutral-500">{m.label}</span>
                                      </div>
                                      <div className="flex items-center gap-1.5">
                                        {pct !== null && (
                                          <span className={`text-[10px] font-semibold ${pct > 0 ? "text-red-500" : pct < 0 ? "text-green-500" : "text-neutral-400"}`}>
                                            {pct > 0 ? `+${pct}%` : pct < 0 ? `${pct}%` : "—"}
                                          </span>
                                        )}
                                        <span className="font-semibold text-neutral-700">{histV ?? "—"}</span>
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    )
                  })()}
                </>
              )
            )}

            {tab === "sources" && (
              <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                {sourceEntries.length === 0 ? (
                  <p className="text-sm text-neutral-400">No source data available.</p>
                ) : (
                  sourceEntries.map(([key, value], i) => (
                    <div key={key}>
                      <div className="flex items-center justify-between text-xs text-neutral-600 mb-1">
                        <span className="capitalize">{key.replace(/_/g, " ")}</span>
                        <span className="font-semibold text-neutral-800">{value as number}</span>
                      </div>
                      <div className="h-2 w-full bg-neutral-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${SOURCE_COLORS[i % SOURCE_COLORS.length]}`}
                          style={{ width: `${Math.round(((value as number) / sourceMax) * 100)}%` }}
                        />
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </CardContent>
        </>
      )}
    </Card>
  )
}
