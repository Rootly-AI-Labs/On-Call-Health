"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { AlertTriangle, Loader2, ChevronDown, ChevronUp, ExternalLink } from "lucide-react"

interface IncidentUser {
  id?: string
  email?: string
  name?: string
}

interface Incident {
  id?: string
  slug?: string
  attributes?: {
    title?: string
    summary?: string
    severity?: string
    created_at?: string
    started_at?: string
    resolved_at?: string
    mitigated_at?: string
    status?: string
    slug?: string
    user?: IncidentUser
    started_by?: IncidentUser
    resolved_by?: IncidentUser
    mitigated_by?: IncidentUser
    all_user_ids?: string[]
    assigned_to?: IncidentUser
  }
  // PagerDuty normalized format (flat structure)
  title?: string
  severity?: string
  created_at?: string
  started_at?: string
  resolved_at?: string
  mitigated_at?: string
  status?: string
  html_url?: string
  user?: IncidentUser
  started_by?: IncidentUser
  resolved_by?: IncidentUser
  mitigated_by?: IncidentUser
  all_user_ids?: string[]
  assigned_to?: IncidentUser
}

// Safely extract numeric value, handling NaN and non-numbers
const safeNum = (val: unknown): number => {
  if (typeof val !== 'number' || isNaN(val)) return 0
  return val
}

interface UserIncidentCardProps {
  memberData: {
    user_id?: string
    user_name?: string
    user_email?: string
    email?: string
    incident_count?: number
    metrics?: {
      severity_distribution?: Record<string, number>
      after_hours_percentage?: number
    }
  }
  timeRange?: number
  platform?: string
  loading?: boolean
  incidents?: Incident[]
}

// Calculate and format incident duration
function formatIncidentDuration(incident: Incident): string | null {
  const attrs = incident.attributes || incident
  const startStr = attrs.started_at || attrs.created_at
  const endStr = attrs.resolved_at || attrs.mitigated_at

  if (!startStr || !endStr) return null

  try {
    const start = new Date(startStr)
    const end = new Date(endStr)
    const durationMs = end.getTime() - start.getTime()

    if (durationMs <= 0) return null

    const minutes = Math.floor(durationMs / (1000 * 60))
    const hours = Math.floor(minutes / 60)
    const days = Math.floor(hours / 24)

    const remainingHours = hours % 24
    const remainingMinutes = minutes % 60

    const parts: string[] = []
    if (days > 0) parts.push(`${days}d`)
    if (remainingHours > 0) parts.push(`${remainingHours}h`)
    if (remainingMinutes > 0 && days === 0) parts.push(`${remainingMinutes}m`)

    return parts.length > 0 ? parts.join(" ") : "<1m"
  } catch {
    return null
  }
}

// Validate URL to prevent XSS via javascript: or data: protocols
function isValidHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
  } catch {
    return false
  }
}

// Sanitize incident ID to prevent injection
function sanitizeId(id: string | undefined): string | null {
  if (!id) return null
  // Only allow alphanumeric, hyphens, and underscores
  const sanitized = id.replace(/[^a-zA-Z0-9_-]/g, '')
  return sanitized.length > 0 ? sanitized : null
}

function getIncidentUrl(incident: Incident, platform: string): string | null {
  // For PagerDuty, use html_url if available and valid
  if (platform === "pagerduty") {
    if (incident.html_url && isValidHttpUrl(incident.html_url)) {
      return incident.html_url
    }
    // Construct URL if we have a valid ID
    const safeId = sanitizeId(incident.id)
    if (safeId) {
      return `https://app.pagerduty.com/incidents/${safeId}`
    }
    return null
  }

  // For Rootly, use slug to construct URL
  // Rootly URL format: https://rootly.com/account/incidents/{slug}
  const slug = incident.slug || incident.attributes?.slug
  const safeSlug = sanitizeId(slug)
  if (safeSlug) {
    return `https://rootly.com/account/incidents/${safeSlug}`
  }

  return null
}

export function UserIncidentCard({
  memberData,
  timeRange = 30,
  platform = "rootly",
  loading = false,
  incidents = []
}: UserIncidentCardProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  const memberName = memberData?.user_name || 'Team Member'
  const incidentCount = memberData?.incident_count || 0
  const severityDist = memberData?.metrics?.severity_distribution || {}

  // Filter incidents for this user
  const userId = memberData?.user_id
  const userEmail = memberData?.user_email || memberData?.email

  const userIncidents = incidents.filter(incident => {
    const attrs = incident.attributes || incident

    // Primary: Rootly-style nested user objects (user, started_by, resolved_by, mitigated_by)
    const involvedUsers = [
      attrs.user,
      attrs.started_by,
      attrs.resolved_by,
      attrs.mitigated_by
    ].filter(Boolean)

    const matchedByUser = involvedUsers.some(u =>
      (userId && u?.id === userId) ||
      (userEmail && u?.email?.toLowerCase() === userEmail?.toLowerCase())
    )
    if (matchedByUser) return true

    // Fallback: PagerDuty analytics format stores all_user_ids + assigned_to.email
    const allUserIds: string[] = attrs.all_user_ids || []
    if (userId && allUserIds.includes(String(userId))) return true
    if (userEmail) {
      const assignedEmail = attrs.assigned_to?.email || attrs.user?.email
      if (assignedEmail?.toLowerCase() === userEmail.toLowerCase()) return true
    }

    return false
  })

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Incidents</CardTitle>
          <CardDescription>Incident load for {memberName}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-32 flex items-center justify-center">
            <div className="flex flex-col items-center space-y-3">
              <Loader2 className="w-8 h-8 text-purple-500 animate-spin" />
              <p className="text-sm text-neutral-500">Loading incidents...</p>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  const hasSeverityData = Object.keys(severityDist).length > 0
  const isPagerDuty = platform === 'pagerduty'

  // Safely extract numeric value, handling NaN and non-numbers
  const safeNum = (val: unknown): number => {
    if (typeof val !== 'number' || isNaN(val)) return 0
    return val
  }

  const pagerDutyCounts = {
    high: safeNum(severityDist.sev1) + safeNum(severityDist.high) + safeNum(severityDist.critical),
    low: safeNum(severityDist.sev4) + safeNum(severityDist.sev5) + safeNum(severityDist.low) + safeNum(severityDist.medium)
  }

  const rootlyCounts = {
    sev0: safeNum(severityDist.sev0 ?? severityDist.critical),
    sev1: safeNum(severityDist.sev1 ?? severityDist.high),
    sev2: safeNum(severityDist.sev2 ?? severityDist.medium),
    sev3: safeNum(severityDist.sev3 ?? severityDist.low),
    sev4: safeNum(severityDist.sev4 ?? severityDist.info)
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex-1 space-y-1.5">
            <CardTitle>
              Incidents
            </CardTitle>
            <CardDescription>Past {timeRange} days</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0 pb-6">
        {/* Total incidents */}
        <div className="text-center mb-4">
          <div className="text-3xl font-bold text-neutral-900">{incidentCount}</div>
          <p className="text-sm text-neutral-500">Total Incidents Handled</p>
        </div>

        {/* Severity breakdown */}
        {hasSeverityData && incidentCount > 0 && isPagerDuty && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div className="bg-red-50 rounded-lg p-3 text-center">
              <div className="text-xs font-semibold text-red-700 mb-1">High Urgency</div>
              <div className="text-xl font-bold text-red-600">{pagerDutyCounts.high}</div>
            </div>
            <div className="bg-green-50 rounded-lg p-3 text-center">
              <div className="text-xs font-semibold text-green-700 mb-1">Low Urgency</div>
              <div className="text-xl font-bold text-green-600">{pagerDutyCounts.low}</div>
            </div>
          </div>
        )}

        {hasSeverityData && incidentCount > 0 && !isPagerDuty && (
          <div className={`grid ${rootlyCounts.sev0 > 0 ? 'grid-cols-2 sm:grid-cols-3 md:grid-cols-5' : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4'} gap-2`}>
            {rootlyCounts.sev0 > 0 && (
              <div className="bg-red-100 rounded-lg p-2 text-center">
                <div className="text-xs font-semibold text-red-800">SEV0</div>
                <div className="text-lg font-bold text-red-800">{rootlyCounts.sev0}</div>
              </div>
            )}
            <div className="bg-red-50 rounded-lg p-2 text-center">
              <div className="text-xs font-semibold text-red-600">SEV1</div>
              <div className="text-lg font-bold text-red-600">{rootlyCounts.sev1}</div>
            </div>
            <div className="bg-orange-50 rounded-lg p-2 text-center">
              <div className="text-xs font-semibold text-orange-600">SEV2</div>
              <div className="text-lg font-bold text-orange-600">{rootlyCounts.sev2}</div>
            </div>
            <div className="bg-yellow-50 rounded-lg p-2 text-center">
              <div className="text-xs font-semibold text-yellow-600">SEV3</div>
              <div className="text-lg font-bold text-yellow-600">{rootlyCounts.sev3}</div>
            </div>
            <div className="bg-green-50 rounded-lg p-2 text-center">
              <div className="text-xs font-semibold text-green-600">SEV4</div>
              <div className="text-lg font-bold text-green-600">{rootlyCounts.sev4}</div>
            </div>
          </div>
        )}

        {/* No severity data message */}
        {(!hasSeverityData || incidentCount === 0) && (
          <div className="text-center text-sm text-neutral-500 py-2">
            No severity breakdown available
          </div>
        )}

        {/* Collapsible incident list */}
        {userIncidents.length > 0 && (
          <div className="mt-4 border-t border-neutral-200 pt-4">
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="w-full flex items-center justify-between text-sm font-medium text-neutral-700 hover:text-neutral-900 transition-colors"
            >
              <span>View incidents ({userIncidents.length})</span>
              {isExpanded ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </button>

            {isExpanded && (
              <div className="mt-3 space-y-2 max-h-64 overflow-y-auto">
                {userIncidents.map((incident, index) => {
                  const attrs = incident.attributes || incident
                  const title = attrs.title || 'Untitled Incident'
                  const severity = (attrs.severity || 'unknown').toUpperCase()
                  const status = attrs.status || 'unknown'
                  const createdAt = attrs.created_at
                    ? new Date(attrs.created_at).toLocaleDateString()
                    : ''

                  // Get severity color
                  const getSeverityColor = (sev: string) => {
                    const s = sev.toLowerCase()
                    if (s.includes('sev0') || s.includes('critical') || s.includes('emergency')) return 'bg-red-200 text-red-800'
                    if (s.includes('sev1') || s.includes('high')) return 'bg-red-100 text-red-700'
                    if (s.includes('sev2') || s.includes('medium')) return 'bg-orange-100 text-orange-700'
                    if (s.includes('sev3')) return 'bg-yellow-100 text-yellow-700'
                    return 'bg-green-100 text-green-700'
                  }

                  // Get status color
                  const getStatusColor = (st: string) => {
                    const s = st.toLowerCase()
                    if (s.includes('resolved') || s.includes('closed')) return 'text-green-600'
                    if (s.includes('mitigated')) return 'text-blue-600'
                    if (s.includes('active') || s.includes('triggered') || s.includes('open')) return 'text-red-600'
                    if (s.includes('acknowledged')) return 'text-orange-600'
                    return 'text-neutral-500'
                  }

                  const incidentUrl = getIncidentUrl(incident, platform)
                  const duration = formatIncidentDuration(incident)

                  const incidentContent = (
                    <>
                      <span className={`px-2 py-0.5 text-xs font-semibold rounded ${getSeverityColor(severity)}`}>
                        {severity}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-neutral-800 break-words">{title}</p>
                        <p className="text-xs text-neutral-500">
                          {createdAt}
                          {duration && (
                            <span className="ml-2 text-purple-600 font-medium">({duration})</span>
                          )}
                        </p>
                      </div>
                      <span className={`text-xs font-medium capitalize flex-shrink-0 ${getStatusColor(status)}`}>
                        {status}
                      </span>
                      {incidentUrl && (
                        <ExternalLink className="w-3.5 h-3.5 text-neutral-400 flex-shrink-0" />
                      )}
                    </>
                  )

                  return incidentUrl ? (
                    <a
                      key={incident.id || index}
                      href={incidentUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-start gap-2 p-2 rounded-lg bg-neutral-50 hover:bg-purple-50 hover:border-purple-200 border border-transparent transition-colors cursor-pointer"
                    >
                      {incidentContent}
                    </a>
                  ) : (
                    <div
                      key={incident.id || index}
                      className="flex items-start gap-2 p-2 rounded-lg bg-neutral-50"
                    >
                      {incidentContent}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
