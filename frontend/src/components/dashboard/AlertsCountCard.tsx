"use client"

import { useState, useRef, useMemo } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { AlertTriangle, Clock, TrendingUp, TrendingDown, Minus, RefreshCw, ChevronRight, X, Eye, EyeOff } from "lucide-react"
import { InfoTooltip } from "@/components/ui/info-tooltip"

interface AlertsCountCardProps {
  currentAnalysis: any
}

function formatDate(value?: string): string {
  if (!value) return "unknown"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "unknown"
  return date.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })
}

const SOURCE_COLORS = [
  "bg-blue-500",
  "bg-green-500",
  "bg-orange-400",
  "bg-purple-500",
  "bg-pink-500",
  "bg-yellow-400",
  "bg-cyan-500",
  "bg-red-400",
]

const URGENCY_COLORS: Record<string, string> = {
  high: "bg-red-500",
  medium: "bg-orange-400",
  low: "bg-gray-300",
}

const URGENCY_DOT_COLORS: Record<string, string> = {
  high: "bg-red-500",
  medium: "bg-orange-400",
  low: "bg-gray-400",
}

type AlertTrendKey = "incidents" | "after_hours" | "night_time" | "escalated" | "retrigger"

const METRIC_CONFIGS: { key: AlertTrendKey; label: string; color: string }[] = [
  { key: "incidents",   label: "With incidents", color: "#3b82f6" },
  { key: "after_hours", label: "After-hours",    color: "#f97316" },
  { key: "night_time",  label: "Night-time",     color: "#a855f7" },
  { key: "escalated",   label: "Escalated",      color: "#ef4444" },
  { key: "retrigger",   label: "Retriggered",    color: "#ec4899" },
]

/**
 * Fit a simple OLS linear regression through the daily total counts and return
 * the predicted % change from day-0 to day-N (positive = worsening, negative = improving).
 * Returns null if insufficient data (< 4 days).
 */
function calcTotalAlertTrend(
  daily: Record<string, { total: number }>
): number | null {
  const days = Object.keys(daily).sort()
  if (days.length < 4) return null

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

/**
 * Fit a simple OLS linear regression through the daily rates and return the
 * predicted % change from day-0 to day-N (positive = worsening, negative = improving).
 * Returns null if insufficient data (< 4 days).
 */
function calcAlertTrend(
  daily: Record<string, { total: number; incidents: number; after_hours: number; night_time: number; escalated: number; retrigger: number }>,
  key: AlertTrendKey
): number | null {
  const days = Object.keys(daily).sort()
  if (days.length < 4) return null

  const values = days.map((d) => {
    const day = daily[d]
    return day.total > 0 ? day[key] / day.total : 0
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

const TREND_IMPROVING_FAST = -30
const TREND_IMPROVING = -15
const TREND_WORSENING = 15
const TREND_CRITICAL = 30

function getTrendConfig(change: number): { label: string; icon: React.ReactNode; className: string } {
  if (change <= TREND_IMPROVING_FAST) return {
    label: "Improving Fast",
    icon: <><TrendingUp className="w-2.5 h-2.5" /><TrendingUp className="w-2.5 h-2.5" /></>,
    className: "bg-green-100 text-green-700 border-green-200",
  }
  if (change <= TREND_IMPROVING) return {
    label: "Improving",
    icon: <TrendingUp className="w-2.5 h-2.5" />,
    className: "bg-green-50 text-green-600 border-green-100",
  }
  if (change >= TREND_CRITICAL) return {
    label: "Critical",
    icon: <><TrendingDown className="w-2.5 h-2.5" /><TrendingDown className="w-2.5 h-2.5" /></>,
    className: "bg-red-100 text-red-700 border-red-200",
  }
  if (change >= TREND_WORSENING) return {
    label: "Worsening",
    icon: <TrendingDown className="w-2.5 h-2.5" />,
    className: "bg-yellow-50 text-yellow-700 border-yellow-100",
  }
  return {
    label: "Stable",
    icon: <Minus className="w-2.5 h-2.5" />,
    className: "bg-purple-50 text-purple-600 border-purple-200",
  }
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

function getSparklineColor(change: number | null): string {
  if (change === null) return "text-neutral-400"
  if (change <= -15) return "text-green-500"
  if (change >= 30)  return "text-red-400"
  if (change >= 15)  return "text-orange-400"
  return "text-purple-400"
}

function Sparkline({ daily, metricKey }: { daily: Record<string, any>; metricKey: AlertTrendKey }) {
  const days = Object.keys(daily).sort()
  if (days.length < 2) return null
  const values = days.map((d) => {
    const day = daily[d]
    return day.total > 0 ? day[metricKey] / day.total : 0
  })
  const max = Math.max(...values)
  const min = Math.min(...values)
  const range = max - min || 1
  const W = 56
  const H = 24
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * W
    const y = H - ((v - min) / range) * H
    return `${x},${y}`
  })
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="opacity-60">
      <polyline
        points={pts.join(" ")}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function TrendTag({ change }: { change: number | null }) {
  if (change === null) return null
  const { label, icon, className } = getTrendConfig(change)
  return (
    <Badge className={`inline-flex items-center gap-0.5 ${className} border text-[9px] px-1 py-0`}>
      {icon}
      {label}
    </Badge>
  )
}

type PopupTab = "breakdown" | "sources"
type LeaderboardKey = "total" | "noise" | "night_time" | "after_hours" | "no_incident" | "escalated" | "retriggered"

const LEADERBOARD_FILTERS: { key: LeaderboardKey; label: string; description: string; color: string }[] = [
  { key: "total",       label: "Most Fired",      description: "Alerts that fired the most times in this period.",                               color: "bg-neutral-400" },
  { key: "noise",       label: "Noisiest",        description: "Alerts classified as noise (firing without being actionable).",               color: "bg-red-400" },
  { key: "night_time",  label: "Night-Time",      description: "Alerts firing during deep night hours (10pm–6am).",                             color: "bg-indigo-400" },
  { key: "after_hours", label: "After-Hours",     description: "Alerts firing outside business hours (6pm–9am), evenings and weekends.",        color: "bg-violet-400" },
  { key: "no_incident", label: "No Incident",     description: "Alerts that fired but never escalated into a full incident.",                    color: "bg-orange-400" },
  { key: "escalated",   label: "Escalated",       description: "Alerts that were escalated to another responder or level.",                      color: "bg-yellow-500" },
  { key: "retriggered", label: "Retriggered",     description: "Alerts that fired again after being acknowledged or resolved.",                  color: "bg-pink-400" },
]

function AlertBreakdownChart({
  daily,
  visibleKeys,
  sourceEntries,
  sourceMax,
  topAlerts,
  initialTab = "breakdown",
  onClose,
}: {
  daily: Record<string, any>
  visibleKeys: Set<AlertTrendKey>
  sourceEntries: [string, unknown][]
  sourceMax: number
  topAlerts: any[]
  initialTab?: PopupTab
  onClose: () => void
}) {
  const [tab, setTab] = useState<PopupTab>(initialTab)
  const [leaderboardKey, setLeaderboardKey] = useState<LeaderboardKey>("total")
  const [hidden, setHidden] = useState<Set<AlertTrendKey>>(new Set())
  const [hoveredChip, setHoveredChip] = useState<AlertTrendKey | null>(null)
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)
  const [overlayMode, setOverlayMode] = useState<"none" | "dod" | "wow">("none")
  const svgRef = useRef<SVGSVGElement>(null)

  const days = Object.keys(daily).sort()
  if (days.length === 0) return null

  const overlayOffset = overlayMode !== "none" ? 1 : 0
  const chartData = overlayMode === "wow" ? buildWeeklyData(daily) : daily
  const chartDays = Object.keys(chartData).sort()

  const toggle = (key: AlertTrendKey) => {
    setHidden((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  const activeMetrics = METRIC_CONFIGS.filter((m) => visibleKeys.has(m.key))

  const allValues = activeMetrics
    .filter((m) => !hidden.has(m.key))
    .flatMap((m) => chartDays.map((d) => (chartData[d]?.[m.key] ?? 0) as number))
  const overlayValues = overlayOffset > 0
    ? activeMetrics
        .filter((m) => !hidden.has(m.key))
        .flatMap((m) => chartDays.slice(overlayOffset).map((_, i) => (chartData[chartDays[i]]?.[m.key] ?? 0) as number))
    : []
  const yMax = Math.max(...allValues, ...overlayValues, 1)

  // Chart dimensions
  const ML = 44, MR = 16, MT = 12, MB = 36
  const VW = 480, VH = 150
  const plotW = VW - ML - MR
  const plotH = VH - MT - MB

  const xOf = (i: number) => ML + (i / Math.max(chartDays.length - 1, 1)) * plotW
  const yOf = (v: number) => MT + plotH - (v / yMax) * plotH

  const yTicks = Array.from(new Set(Array.from({ length: 5 }, (_, i) => Math.round((yMax / 4) * i))))

  const xLabelStep = Math.max(1, Math.floor(chartDays.length / 6))
  const xLabels = chartDays
    .map((d, i) => ({ d, i }))
    .filter(({ i }) => i % xLabelStep === 0 || i === chartDays.length - 1)

  const xLabelFormat = (d: string) => overlayMode === "wow"
    ? `Wk ${new Date(d).toLocaleDateString([], { month: "short", day: "numeric" })}`
    : new Date(d).toLocaleDateString([], { month: "short", day: "numeric" })

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
    const plotX = svgX - ML
    const fraction = plotX / plotW
    const idx = Math.round(fraction * (chartDays.length - 1))
    setHoverIndex(Math.max(0, Math.min(chartDays.length - 1, idx)))
  }

  const hoverX = hoverIndex !== null ? xOf(hoverIndex) : null
  const hoverDay = hoverIndex !== null ? chartDays[hoverIndex] : null
  const hoverLabel = hoverDay
    ? overlayMode === "wow"
      ? `Week of ${new Date(hoverDay).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}`
      : new Date(hoverDay).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })
    : null

  // Flip tooltip to left side if near right edge
  const tooltipOnLeft = hoverIndex !== null && hoverIndex > chartDays.length * 0.65

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-4xl mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-end mb-3">
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-4 border-b border-neutral-200">
          {(["breakdown", "sources"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium rounded-t transition-colors ${
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
          <>
            {/* Toggle chips + overlay toggles */}
            <div className="flex flex-wrap items-center gap-2 mb-4">
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
              <div className="flex gap-1.5 ml-auto">
                {(["dod", "wow"] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setOverlayMode((prev) => prev === mode ? "none" : mode)}
                    className={`text-[10px] px-2.5 py-0.5 rounded border transition-colors ${
                      overlayMode === mode
                        ? "bg-neutral-800 text-white border-neutral-800"
                        : "bg-white text-neutral-400 border-neutral-200 hover:border-neutral-400 hover:text-neutral-600"
                    }`}
                  >
                    {mode === "dod" ? "Day-over-Day" : "Week-over-Week"}
                  </button>
                ))}
              </div>
            </div>
            {overlayMode !== "none" && (
              <div className="flex items-center gap-1.5 mb-2 text-[10px] text-neutral-400">
                <svg width="20" height="8" viewBox="0 0 20 8"><line x1="0" y1="4" x2="20" y2="4" stroke="#9ca3af" strokeWidth="1.5" strokeDasharray="3 2" /></svg>
                {overlayMode === "dod" ? "Dotted line = previous day" : "Dotted line = same day 1 week ago"}
              </div>
            )}

            {/* SVG chart */}
            <svg
              ref={svgRef}
              viewBox={`0 0 ${VW} ${VH}`}
              className="w-full cursor-crosshair"
              onMouseMove={handleMouseMove}
              onMouseLeave={() => setHoverIndex(null)}
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
                  {hoverLabel && hoverDay && (() => {
                    const visibleMetrics = activeMetrics.filter((m) => !hidden.has(m.key))
                    const hasOverlay = overlayOffset > 0
                    const histIdx = hoverIndex - overlayOffset
                    const histDay = hasOverlay && histIdx >= 0 ? chartDays[histIdx] : null
                    const histLabel = histDay
                      ? overlayMode === "wow"
                        ? `Week of ${new Date(histDay).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}`
                        : new Date(histDay).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })
                      : null
                    const boxW = hasOverlay ? 148 : 100
                    const boxH = hasOverlay
                      ? 12 + visibleMetrics.length * 13 + 8 + 11 + visibleMetrics.length * 13 + 6
                      : 12 + visibleMetrics.length * 13 + 6
                    const boxX = tooltipOnLeft ? hoverX - boxW - 10 : hoverX + 10
                    const boxY = MT
                    const histRowStart = 12 + visibleMetrics.length * 13 + 16
                    return (
                      <g>
                        <rect x={boxX} y={boxY} width={boxW} height={boxH} rx="3" fill="white" stroke="#e5e7eb" strokeWidth="1" filter="drop-shadow(0 1px 3px rgba(0,0,0,0.12))" />

                        {/* Current date header */}
                        <text x={boxX + 6} y={boxY + 10} fontSize="6" fontWeight="700" fill="#374151">{hoverLabel}</text>

                        {/* Current values */}
                        {visibleMetrics.map((m, idx) => {
                          const v = (chartData[hoverDay]?.[m.key] ?? 0) as number
                          return (
                            <g key={m.key}>
                              <circle cx={boxX + 9} cy={boxY + 18 + idx * 13} r="2.5" fill={m.color} />
                              <text x={boxX + 16} y={boxY + 22 + idx * 13} fontSize="6" fill="#6b7280">{m.label}</text>
                              <text x={boxX + boxW - 6} y={boxY + 22 + idx * 13} fontSize="6" fontWeight="600" fill="#111827" textAnchor="end">{v}</text>
                            </g>
                          )
                        })}

                        {/* Overlay section */}
                        {hasOverlay && histLabel && (
                          <>
                            <line x1={boxX + 4} y1={boxY + histRowStart - 7} x2={boxX + boxW - 4} y2={boxY + histRowStart - 7} stroke="#e5e7eb" strokeWidth="0.75" />
                            {/* Historical date header — same style as current */}
                            <text x={boxX + 6} y={boxY + histRowStart + 2} fontSize="6" fontWeight="700" fill="#374151">{histLabel}</text>

                            {/* Historical values — faded circle swatch + delta */}
                            {visibleMetrics.map((m, idx) => {
                              const v = (chartData[hoverDay]?.[m.key] ?? 0) as number
                              const histV = histDay ? (chartData[histDay]?.[m.key] ?? 0) as number : null
                              const pct = histV !== null ? (histV > 0 ? Math.round(((v - histV) / histV) * 100) : v > 0 ? 100 : 0) : null
                              return (
                                <g key={`hist-${m.key}`}>
                                  <circle cx={boxX + 9} cy={boxY + histRowStart + 9 + idx * 13} r="2.5" fill={m.color} opacity={0.35} />
                                  <text x={boxX + 16} y={boxY + histRowStart + 13 + idx * 13} fontSize="6" fill="#6b7280">{m.label}</text>
                                  {pct !== null && (
                                    <text x={boxX + boxW - 20} y={boxY + histRowStart + 13 + idx * 13} fontSize="5.5" fontWeight="600" fill={pct > 0 ? "#ef4444" : pct < 0 ? "#22c55e" : "#9ca3af"} textAnchor="end">
                                      {pct > 0 ? `+${pct}%` : pct < 0 ? `${pct}%` : "—"}
                                    </text>
                                  )}
                                  <text x={boxX + boxW - 4} y={boxY + histRowStart + 13 + idx * 13} fontSize="6" fontWeight="600" fill="#374151" textAnchor="end">{histV ?? "—"}</text>
                                </g>
                              )
                            })}
                          </>
                        )}
                      </g>
                    )
                  })()}
                </g>
              )}
            </svg>
          </>
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
      </div>
    </div>
  )
}

export function AlertsCountCard({ currentAnalysis }: AlertsCountCardProps): React.ReactElement | null {
  const [showChart, setShowChart] = useState(false)
  const [initialTab, setInitialTab] = useState<PopupTab>("breakdown")

  const trends = useMemo(() => {
    const d: Record<string, any> = currentAnalysis?.analysis_data?.metadata?.alerts?.daily_alert_breakdown || {}
    return {
      total:       calcTotalAlertTrend(d),
      incidents:   calcAlertTrend(d, "incidents"),
      after_hours: calcAlertTrend(d, "after_hours"),
      night_time:  calcAlertTrend(d, "night_time"),
      escalated:   calcAlertTrend(d, "escalated"),
      retrigger:   calcAlertTrend(d, "retrigger"),
    }
  }, [currentAnalysis])

  if (currentAnalysis?.platform === 'pagerduty') {
    return (
      <Card className="bg-white flex flex-col overflow-hidden">
        <CardHeader className="pb-2">
          <CardTitle className="text-neutral-900">Team Alerts</CardTitle>
          <CardDescription>Volume, signal quality and breakdown trends</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center py-10 text-center gap-2">
          <p className="text-sm font-medium text-neutral-600">Alert data is not available for PagerDuty</p>
          <p className="text-xs text-neutral-400">Connect Rootly to access alert insights</p>
        </CardContent>
      </Card>
    )
  }

  const alerts = currentAnalysis?.analysis_data?.metadata?.alerts
  if (!alerts) return null

  const daily: Record<string, any> = alerts.daily_alert_breakdown || {}

  const total = alerts.filtered_total ?? alerts.total
  const hasError = Boolean(alerts.error)
  const dateRange = `${formatDate(alerts.start)} - ${formatDate(alerts.end)}`

  const noiseCounts = alerts.noise_counts || {}
  const totalForNoise = typeof total === "number" && total > 0 ? total : null
  const notNoiseCount = typeof noiseCounts.not_noise === "number" ? noiseCounts.not_noise : 0
  const notNoisePct = totalForNoise !== null ? Math.floor((notNoiseCount / totalForNoise) * 100) : null

  const afterHoursCount = typeof alerts.after_hours_count === "number" ? alerts.after_hours_count : null
  const afterHoursPct = totalForNoise !== null && afterHoursCount !== null ? Math.ceil((afterHoursCount / totalForNoise) * 100) : null

  const nightTimeCount = typeof alerts.night_time_count === "number" ? alerts.night_time_count : null
  const nightTimePct = totalForNoise !== null && nightTimeCount !== null ? Math.ceil((nightTimeCount / totalForNoise) * 100) : null

  const alertsWithIncidentsCount = typeof alerts.alerts_with_incidents_count === "number" ? alerts.alerts_with_incidents_count : null
  const alertsWithIncidentsPct = totalForNoise !== null && alertsWithIncidentsCount !== null ? Math.round((alertsWithIncidentsCount / totalForNoise) * 100) : null

  const escalatedCount = typeof alerts.escalated_count === "number" ? alerts.escalated_count : null
  const escalatedPct = totalForNoise !== null && escalatedCount !== null ? Math.floor((escalatedCount / totalForNoise) * 100) : null

  const retriggerCount = typeof alerts.retrigger_count === "number" ? alerts.retrigger_count : null
  const retriggerPct = totalForNoise !== null && retriggerCount !== null ? Math.floor((retriggerCount / totalForNoise) * 100) : null

  const urgencyCounts = alerts.urgency_counts || {}
  const urgencyEntries = Object.entries(urgencyCounts)
    .filter(([, value]) => typeof value === "number" && (value as number) >= 0)
    .sort((a, b) => ["high", "medium", "low"].indexOf(a[0]) - ["high", "medium", "low"].indexOf(b[0]))
  const urgencyTotal = urgencyEntries.reduce((sum, [, v]) => sum + (v as number), 0)

  const sourceCounts = alerts.derived_source_counts || alerts.source_counts || {}
  const sourceEntries = Object.entries(sourceCounts)
    .filter(([, value]) => typeof value === "number" && (value as number) > 0)
    .sort((a, b) => (b[1] as number) - (a[1] as number))
  const sourceMax = sourceEntries.length > 0 ? (sourceEntries[0][1] as number) : 1

  const breakdownItems = [
    alertsWithIncidentsCount !== null && {
      icon: <AlertTriangle className="w-4 h-4" />,
      count: alertsWithIncidentsCount,
      pct: alertsWithIncidentsPct,
      label: "With incidents",
      metricKey: "incidents" as AlertTrendKey,
      trend: trends.incidents,
    },
    afterHoursCount !== null && {
      icon: <Clock className="w-4 h-4" />,
      count: afterHoursCount,
      pct: afterHoursPct,
      label: "After-hours",
      metricKey: "after_hours" as AlertTrendKey,
      trend: trends.after_hours,
    },
    nightTimeCount !== null && {
      icon: <Clock className="w-4 h-4" />,
      count: nightTimeCount,
      pct: nightTimePct,
      label: "Night-time",
      metricKey: "night_time" as AlertTrendKey,
      trend: trends.night_time,
    },
    escalatedCount !== null && escalatedCount > 0 && {
      icon: <TrendingUp className="w-4 h-4" />,
      count: escalatedCount,
      pct: escalatedPct,
      label: "Escalated",
      metricKey: "escalated" as AlertTrendKey,
      trend: trends.escalated,
    },
    retriggerCount !== null && retriggerCount > 0 && {
      icon: <RefreshCw className="w-4 h-4" />,
      count: retriggerCount,
      pct: retriggerPct,
      label: "Retriggered",
      metricKey: "retrigger" as AlertTrendKey,
      trend: trends.retrigger,
    },
  ].filter(Boolean) as { icon: React.ReactElement; count: number; pct: number | null; label: string; metricKey: AlertTrendKey; trend: number | null }[]

  const visibleKeys = new Set(breakdownItems.map((i) => i.metricKey))

  return (
    <>
      <Card className="bg-white flex flex-col">
        <CardHeader className="pb-2 shrink-0">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <CardTitle className="text-neutral-900">Team Alerts</CardTitle>
              <CardDescription>Volume, signal quality and breakdown trends</CardDescription>
            </div>
            <button
              onClick={() => { setInitialTab("breakdown"); setShowChart(true) }}
              className="inline-flex items-center gap-1 text-xs text-neutral-400 hover:text-neutral-600 transition-colors mt-1"
            >
              View Details <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </CardHeader>
        <CardContent className="flex-1 flex flex-col min-h-0 overflow-y-auto">
          {hasError ? (
            <div className="flex items-start gap-2 text-sm text-red-700">
              <AlertTriangle className="w-4 h-4 mt-0.5" />
              <span>Alerts data unavailable ({alerts.error})</span>
            </div>
          ) : (
            <div className="space-y-4">
              {alerts.truncated && (
                <div className="text-xs text-yellow-700">Alert count may be partial (page limit reached)</div>
              )}

              {/* Total count */}
              <div className="flex flex-col gap-0.5">
                <div className="inline-flex items-start gap-1.5">
                  <span className="text-4xl font-bold text-neutral-900 leading-tight">
                    {typeof total === "number" ? total : "N/A"}
                  </span>
                  <div className="mt-1">
                    <TrendTag change={trends.total} />
                  </div>
                </div>
                <span className="text-xs text-neutral-400">{dateRange}</span>
              </div>

              {/* Signal Quality */}
              {notNoisePct !== null && (
                <div className="my-6">
                  <div className="flex items-center justify-between text-[13px] mb-1">
                    <div className="flex items-center gap-1">
                      <span className="text-neutral-700 font-medium">Signal Quality</span>
                      <InfoTooltip content="Percentage of alerts that are actionable (not noise)." side="bottom" />
                    </div>
                    <span className="text-green-600 font-medium">{notNoisePct}% actionable</span>
                  </div>
                  <div className="h-2 w-full bg-neutral-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-green-500 rounded-full"
                      style={{ width: `${notNoisePct}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Alert Breakdown */}
              {breakdownItems.length > 0 && (
                <div>
                  <div className="text-[13px] font-semibold text-neutral-800 mb-1">Alert Breakdown</div>
                  <div className="grid grid-cols-5 gap-2">
                    {breakdownItems.map((item) => {
                      return (
                        <div
                          key={item.label}
                          className="flex flex-col p-2"
                        >
                          <div className="flex justify-end mb-0.5">
                            <TrendTag change={item.trend} />
                          </div>
                          <span className="text-base font-bold text-neutral-900 leading-tight">
                            {item.count}
                            {item.pct !== null && (
                              <span className="text-xs font-normal text-neutral-400 ml-1">({item.pct}%)</span>
                            )}
                          </span>
                          <span className="text-[10px] mt-0.5 leading-tight text-neutral-400">{item.label}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

            </div>
          )}
        </CardContent>
      </Card>

      {showChart && (
        <AlertBreakdownChart
          daily={daily}
          visibleKeys={visibleKeys}
          sourceEntries={sourceEntries}
          sourceMax={sourceMax}
          topAlerts={alerts.top_alerts ?? []}
          initialTab={initialTab}
          onClose={() => setShowChart(false)}
        />
      )}
    </>
  )
}
