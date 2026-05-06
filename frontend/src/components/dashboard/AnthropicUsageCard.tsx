"use client"

import { useState, useRef, useMemo, useId } from "react"
import Image from "next/image"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { TrendingUp, TrendingDown, Minus } from "lucide-react"

type DailyEntry = { input_tokens: number; output_tokens: number; total_tokens: number; requests: number }
type UsageData = Record<string, DailyEntry>

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function formatDate(iso: string): string {
  const d = new Date(iso + "T00:00:00Z")
  return d.toLocaleDateString([], { month: "short", day: "numeric" })
}

function buildSortedDays(usage: UsageData): string[] {
  return Object.keys(usage).sort()
}

function sumUsage(usage: UsageData): DailyEntry {
  const out = { input_tokens: 0, output_tokens: 0, total_tokens: 0, requests: 0 }
  for (const v of Object.values(usage)) {
    out.input_tokens += v.input_tokens
    out.output_tokens += v.output_tokens
    out.total_tokens += v.total_tokens
    out.requests += v.requests
  }
  return out
}

function computeTrend(usage: UsageData, days: number): number | null {
  const sorted = buildSortedDays(usage)
  if (sorted.length < 2) return null
  const recent = sorted.slice(-days)
  const prior = sorted.slice(-days * 2, -days)
  if (prior.length === 0) return null
  const recentTotal = recent.reduce((s, d) => s + (usage[d]?.total_tokens ?? 0), 0)
  const priorTotal = prior.reduce((s, d) => s + (usage[d]?.total_tokens ?? 0), 0)
  if (priorTotal === 0) return null
  return Math.round(((recentTotal - priorTotal) / priorTotal) * 100)
}

const CHART_H = 64
const CHART_PADDING_Y = 4

function Sparkline({ usage, days, metric, color }: { usage: UsageData; days: string[]; metric: keyof DailyEntry; color: string }) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const gradId = useId()

  const values = days.map(d => usage[d]?.[metric] ?? 0)
  const maxVal = Math.max(...values, 1)
  const W = 400
  const stepX = W / Math.max(days.length - 1, 1)

  function ptX(i: number) { return i * stepX }
  function ptY(v: number) { return CHART_H - CHART_PADDING_Y - ((v / maxVal) * (CHART_H - CHART_PADDING_Y * 2)) }

  const pathD = values.map((v, i) => `${i === 0 ? "M" : "L"}${ptX(i)},${ptY(v)}`).join(" ")
  const hoverEntry = hoverIdx !== null ? { day: days[hoverIdx], val: values[hoverIdx] } : null

  return (
    <div className="relative w-full" style={{ height: CHART_H }}>
      <svg ref={svgRef} viewBox={`0 0 ${W} ${CHART_H}`} preserveAspectRatio="none" className="w-full h-full"
        onMouseMove={(e) => {
          const rect = svgRef.current!.getBoundingClientRect()
          const x = ((e.clientX - rect.left) / rect.width) * W
          setHoverIdx(Math.min(Math.max(Math.round(x / stepX), 0), days.length - 1))
        }}
        onMouseLeave={() => setHoverIdx(null)}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.15" />
            <stop offset="100%" stopColor={color} stopOpacity="0.01" />
          </linearGradient>
        </defs>
        {values.length > 1 && <path d={`${pathD} L${ptX(values.length - 1)},${CHART_H} L0,${CHART_H} Z`} fill={`url(#${gradId})`} />}
        <path d={pathD} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
        {hoverIdx !== null && <circle cx={ptX(hoverIdx)} cy={ptY(values[hoverIdx])} r="3" fill={color} />}
      </svg>
      {hoverEntry && (
        <div className="absolute top-0 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
          <div className="bg-neutral-900 text-white text-xs rounded px-2 py-1 whitespace-nowrap shadow-lg">
            <div className="font-medium text-neutral-300">{formatDate(hoverEntry.day)}</div>
            <div className="font-semibold">{formatTokens(hoverEntry.val)}</div>
          </div>
        </div>
      )}
    </div>
  )
}

export function AnthropicUsageCard({ currentAnalysis, enabled }: { currentAnalysis: any; enabled: boolean }) {
  const [activeMetric, setActiveMetric] = useState<keyof DailyEntry>("total_tokens")

  const metadata = currentAnalysis?.analysis_data?.metadata
  const usage: UsageData = useMemo(() => (metadata?.anthropic_usage as UsageData | undefined) ?? {}, [metadata])
  const days = useMemo(() => buildSortedDays(usage), [usage])
  const totals = useMemo(() => sumUsage(usage), [usage])
  const trend = useMemo(() => computeTrend(usage, 7), [usage])

  if (!enabled) return null

  const metricOptions: { key: keyof DailyEntry; label: string; color: string }[] = [
    { key: "total_tokens",  label: "Total tokens",  color: "#cc6b2c" },
    { key: "input_tokens",  label: "Input tokens",  color: "#e8873a" },
    { key: "output_tokens", label: "Output tokens", color: "#f5a55c" },
    { key: "requests",      label: "Requests",      color: "#b85520" },
  ]
  const activeConfig = metricOptions.find(m => m.key === activeMetric)!
  const TrendIcon = trend === null ? Minus : trend > 0 ? TrendingUp : TrendingDown
  const trendColor = trend === null ? "text-neutral-400" : trend > 0 ? "text-green-600" : "text-red-500"

  const hasData = Object.keys(usage).length > 0

  return (
    <div className="h-full">
      <Card className="bg-white flex flex-col h-full">
        <CardHeader className="pb-2 shrink-0">
          <div className="flex items-center gap-2">
            <Image src="/images/anthropic-logo.svg" alt="Anthropic" width={16} height={16} className="w-4 h-4" />
            <CardTitle className="text-neutral-900">Anthropic Team Usage</CardTitle>
          </div>
          <CardDescription>Past {currentAnalysis?.time_range ?? days.length} days of token consumption</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!hasData ? (
            <div className="flex flex-col items-center justify-center py-8 text-center gap-2">
              <div className="text-2xl">📊</div>
              <p className="text-sm font-medium text-neutral-600">No usage data yet</p>
              <p className="text-xs text-neutral-400">Anthropic is connected — usage will appear here after your team makes API calls during the analysis period.</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-4 gap-3">
                {metricOptions.map(m => (
                  <button key={m.key} onClick={() => setActiveMetric(m.key)}
                    className={`rounded-lg p-2.5 text-left transition-colors border ${activeMetric === m.key ? "border-neutral-300 bg-neutral-50" : "border-neutral-200 bg-white hover:border-neutral-300"}`}
                  >
                    <div className="text-xs text-neutral-400 mb-0.5">{m.label}</div>
                    <div className="text-base font-bold" style={{ color: activeMetric === m.key ? m.color : "#171717" }}>
                      {formatTokens(totals[m.key])}
                    </div>
                  </button>
                ))}
              </div>
              <div>
                <span className="text-xs text-neutral-400">{activeConfig.label} / day</span>
                <Sparkline usage={usage} days={days} metric={activeMetric} color={activeConfig.color} />
                <div className="flex justify-between mt-1">
                  <span className="text-xs text-neutral-300">{days[0] ? formatDate(days[0]) : ""}</span>
                  <span className="text-xs text-neutral-300">{days[days.length - 1] ? formatDate(days[days.length - 1]) : ""}</span>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
