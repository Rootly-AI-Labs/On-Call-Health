"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Clock, ChevronDown, ChevronRight } from "lucide-react"
import { formatDistanceToNow, isPast, parseISO, isBefore, addDays, isAfter } from "date-fns"

interface TicketingCardProps {
  memberData: any
}

// ADJUST THIS VALUE to change the character limit for ticket/issue titles
const TITLE_CHARACTER_LIMIT = 210

// Helper function to truncate text at character limit
function truncateTitle(title: string, limit: number = TITLE_CHARACTER_LIMIT): string {
  if (title.length <= limit) return title
  return title.substring(0, limit) + "..."
}

// Helper function to determine priority badge color (matches health analysis colors exactly)
function getPriorityColor(priority: string | number): { backgroundColor: string; color: string } {
  if (typeof priority === "string") {
    // Jira priority - matches health analysis severity colors
    switch (priority.toLowerCase()) {
      case "highest":
        return { backgroundColor: "#EF4444", color: "white" } // Critical
      case "high":
        return { backgroundColor: "#F97316", color: "white" } // Poor
      case "medium":
        return { backgroundColor: "#F59E0B", color: "white" } // Fair
      case "low":
        return { backgroundColor: "#10B981", color: "white" } // Good
      case "lowest":
        return { backgroundColor: "#9CA3AF", color: "white" }
      default:
        return { backgroundColor: "#9CA3AF", color: "white" }
    }
  } else {
    // Linear priority (1=Urgent, 2=High, 3=Medium, 4=Low, 0=None) - matches health analysis severity colors
    switch (priority) {
      case 1:
        return { backgroundColor: "#EF4444", color: "white" } // Critical
      case 2:
        return { backgroundColor: "#F97316", color: "white" } // Poor
      case 3:
        return { backgroundColor: "#F59E0B", color: "white" } // Fair
      case 4:
        return { backgroundColor: "#10B981", color: "white" } // Good
      case 0:
        return { backgroundColor: "#9CA3AF", color: "white" }
      default:
        return { backgroundColor: "#9CA3AF", color: "white" }
    }
  }
}

// Check if ticket is due within 7 days
function isDueIn7Days(dueDate: string | null): boolean {
  if (!dueDate) return false
  try {
    const date = parseISO(dueDate)
    const today = new Date()
    const sevenDaysFromNow = addDays(today, 7)
    return isAfter(date, today) && isBefore(date, sevenDaysFromNow)
  } catch {
    return false
  }
}

// Check if ticket is overdue
function isOverdue(dueDate: string | null): boolean {
  if (!dueDate) return false
  try {
    const date = parseISO(dueDate)
    return isPast(date)
  } catch {
    return false
  }
}

// Check if Jira priority is high/critical
function isJiraHighCritical(priority: string | null): boolean {
  if (!priority) return false
  return ["highest", "high"].includes(priority.toLowerCase())
}

// Check if Linear priority is urgent/high
function isLinearUrgentHigh(priority: number | null): boolean {
  return priority === 1 || priority === 2
}

// Format due date relative to today
function formatDueDate(dueDate: string | null): string {
  if (!dueDate) return "No due date"

  try {
    const date = parseISO(dueDate)
    if (isPast(date)) {
      return `Overdue by ${formatDistanceToNow(date)}`
    }
    return `Due in ${formatDistanceToNow(date)}`
  } catch {
    return "Invalid date"
  }
}

// Safe date comparison that handles invalid dates (prevents NaN)
function safeDateCompare(dateA: string | null, dateB: string | null): number {
  if (!dateA && !dateB) return 0
  if (!dateA) return 1
  if (!dateB) return -1
  const aTime = new Date(dateA).getTime()
  const bTime = new Date(dateB).getTime()
  if (isNaN(aTime) && isNaN(bTime)) return 0
  if (isNaN(aTime)) return 1
  if (isNaN(bTime)) return -1
  return aTime - bTime
}

// Jira priority order mapping
const JIRA_PRIORITY_ORDER: Record<string, number> = {
  highest: 1,
  high: 2,
  medium: 3,
  low: 4,
  lowest: 5,
}

// Sort Jira tickets by priority then due date
function sortJiraTickets(tickets: any[]): any[] {
  return [...tickets].sort((a, b) => {
    const aPriority = a.priority?.toLowerCase() || ""
    const bPriority = b.priority?.toLowerCase() || ""
    const aOrder = JIRA_PRIORITY_ORDER[aPriority] ?? 999
    const bOrder = JIRA_PRIORITY_ORDER[bPriority] ?? 999

    if (aOrder !== bOrder) return aOrder - bOrder
    return safeDateCompare(a.duedate, b.duedate)
  })
}

// Sort Linear issues by priority then due date
function sortLinearIssues(issues: any[]): any[] {
  return [...issues].sort((a, b) => {
    const aPriority = a.priority ?? 0
    const bPriority = b.priority ?? 0
    const aOrder = aPriority === 0 ? 999 : aPriority
    const bOrder = bPriority === 0 ? 999 : bPriority

    if (aOrder !== bOrder) return aOrder - bOrder
    return safeDateCompare(a.dueDate, b.dueDate)
  })
}

// Convert Linear numeric priority to display label
function getLinearPriorityLabel(priority: number): string {
  switch (priority) {
    case 1: return "Urgent"
    case 2: return "High"
    case 3: return "Med"
    case 4: return "Low"
    default: return "None"
  }
}

// Generate stable key for ticket/issue items
function getItemKey(item: any): string | null {
  return item.key || item.identifier || item.id || null
}

// Content component for Jira tickets (used in consolidated card)
function JiraTicketCardContent({ memberData }: TicketingCardProps) {
  const [isTicketsExpanded, setIsTicketsExpanded] = useState(false)

  if (!memberData?.jira_tickets || memberData.jira_tickets.length === 0) {
    return <p className="text-sm text-neutral-500 text-center py-4">No active Jira tickets</p>
  }

  const tickets = memberData.jira_tickets

  // Calculate metrics from raw data
  const totalTickets = tickets.length
  const highCriticalCount = tickets.filter((ticket: any) => isJiraHighCritical(ticket.priority)).length
  const dueIn7DaysCount = tickets.filter((ticket: any) => isDueIn7Days(ticket.duedate)).length
  const overdueCount = tickets.filter((ticket: any) => isOverdue(ticket.duedate)).length

  const sortedTickets = sortJiraTickets(tickets)

  return (
    <div className="space-y-4 w-full overflow-hidden">
      {/* Summary Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-neutral-100 p-3 rounded-md">
          <p className="text-xs text-neutral-700">Total Tickets</p>
          <p className="text-lg font-semibold text-neutral-900">{totalTickets}</p>
        </div>
        <div className="bg-neutral-100 p-3 rounded-md">
          <p className="text-xs text-neutral-700">High/Critical</p>
          <p className="text-lg font-semibold text-red-600">{highCriticalCount}</p>
        </div>
        <div className="bg-neutral-100 p-3 rounded-md">
          <p className="text-xs text-neutral-700">Due in 7 Days</p>
          <p className="text-lg font-semibold text-orange-600">{dueIn7DaysCount}</p>
        </div>
        <div className="bg-neutral-100 p-3 rounded-md">
          <p className="text-xs text-neutral-700">Overdue</p>
          <p className="text-lg font-semibold text-red-600">{overdueCount}</p>
        </div>
      </div>

      <Separator />

      {/* Collapsible Ticket List */}
      <div className="w-full overflow-hidden">
        <button
          onClick={() => setIsTicketsExpanded(!isTicketsExpanded)}
          className="flex items-center gap-1 text-xs font-semibold text-neutral-700 hover:text-neutral-900 transition-colors"
        >
          {isTicketsExpanded ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
          Active Tickets ({sortedTickets.length})
        </button>
        {isTicketsExpanded && (
          <div className="space-y-2 max-h-64 overflow-y-auto overflow-x-hidden mt-3">
            {sortedTickets.map((ticket, index) => (
              <div key={getItemKey(ticket) || `ticket-${index}`} className="flex items-center gap-2 p-2 bg-neutral-100 rounded-md hover:bg-neutral-200 transition">
                <Badge
                  className="text-xs shrink-0"
                  style={getPriorityColor(ticket.priority)}
                >
                  {ticket.priority || "N/A"}
                </Badge>
                <div className="flex-1 min-w-0 max-w-full overflow-hidden">
                  <p className="text-sm font-medium text-neutral-900">
                    <span className="font-bold">{ticket.key}</span>
                    {ticket.summary || ticket.title ? ` - ${truncateTitle(ticket.summary || ticket.title)}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-1 text-xs text-neutral-500 whitespace-nowrap shrink-0 ml-2">
                  <Clock className="w-3 h-3" />
                  <span>{formatDueDate(ticket.duedate)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// Component to display Jira tickets
function JiraTicketCard({ memberData }: TicketingCardProps): React.ReactElement {
  const [isTicketsExpanded, setIsTicketsExpanded] = useState(false)

  if (!memberData?.jira_tickets || memberData.jira_tickets.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>
            Jira Workload
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-neutral-500 text-center py-4">No active Jira tickets</p>
        </CardContent>
      </Card>
    )
  }

  const tickets = memberData.jira_tickets

  // Calculate metrics from raw data
  const totalTickets = tickets.length
  const highCriticalCount = tickets.filter((ticket: any) => isJiraHighCritical(ticket.priority)).length
  const dueIn7DaysCount = tickets.filter((ticket: any) => isDueIn7Days(ticket.duedate)).length
  const overdueCount = tickets.filter((ticket: any) => isOverdue(ticket.duedate)).length

  const sortedTickets = sortJiraTickets(tickets)

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Jira Workload
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-neutral-100 p-3 rounded-md">
            <p className="text-xs text-neutral-700">Total Tickets</p>
            <p className="text-lg font-semibold text-neutral-900">{totalTickets}</p>
          </div>
          <div className="bg-neutral-100 p-3 rounded-md">
            <p className="text-xs text-neutral-700">High/Critical</p>
            <p className="text-lg font-semibold text-red-600">{highCriticalCount}</p>
          </div>
          <div className="bg-neutral-100 p-3 rounded-md">
            <p className="text-xs text-neutral-700">Due in 7 Days</p>
            <p className="text-lg font-semibold text-orange-600">{dueIn7DaysCount}</p>
          </div>
          <div className="bg-neutral-100 p-3 rounded-md">
            <p className="text-xs text-neutral-700">Overdue</p>
            <p className="text-lg font-semibold text-red-600">{overdueCount}</p>
          </div>
        </div>

        <Separator />

        {/* Collapsible Ticket List */}
        <div className="w-full overflow-hidden">
          <button
            onClick={() => setIsTicketsExpanded(!isTicketsExpanded)}
            className="flex items-center gap-1 text-xs font-semibold text-neutral-700 hover:text-neutral-900 transition-colors"
          >
            {isTicketsExpanded ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
            Active Tickets ({sortedTickets.length})
          </button>
          {isTicketsExpanded && (
            <div className="space-y-2 max-h-64 overflow-y-auto overflow-x-hidden mt-3">
              {sortedTickets.map((ticket, index) => (
                <div key={getItemKey(ticket) || `ticket-${index}`} className="flex items-center gap-2 p-2 bg-neutral-100 rounded-md hover:bg-neutral-200 transition">
                  <Badge
                    className="text-xs shrink-0"
                    style={getPriorityColor(ticket.priority)}
                  >
                    {ticket.priority || "N/A"}
                  </Badge>
                  <div className="flex-1 min-w-0 max-w-full overflow-hidden">
                    <p className="text-sm font-medium text-neutral-900">
                      <span className="font-bold">{ticket.key}</span>
                      {ticket.summary || ticket.title ? ` - ${truncateTitle(ticket.summary || ticket.title)}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-neutral-500 whitespace-nowrap shrink-0 ml-2">
                    <Clock className="w-3 h-3" />
                    <span>{formatDueDate(ticket.duedate)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// Content component for Linear issues (used in consolidated card)
function LinearIssueCardContent({ memberData }: TicketingCardProps) {
  const [isIssuesExpanded, setIsIssuesExpanded] = useState(false)

  if (!memberData?.linear_issues || memberData.linear_issues.length === 0) {
    return <p className="text-sm text-neutral-500 text-center py-4">No active Linear issues</p>
  }

  const issues = memberData.linear_issues

  // Calculate metrics from raw data
  const totalIssues = issues.length
  const urgentHighCount = issues.filter((issue: any) => isLinearUrgentHigh(issue.priority)).length
  const dueIn7DaysCount = issues.filter((issue: any) => isDueIn7Days(issue.dueDate)).length
  const overdueCount = issues.filter((issue: any) => isOverdue(issue.dueDate)).length

  const sortedIssues = sortLinearIssues(issues)

  return (
    <div className="space-y-4 w-full overflow-hidden">
      {/* Summary Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-neutral-100 p-3 rounded-md">
          <p className="text-xs text-neutral-700">Total Issues</p>
          <p className="text-lg font-semibold text-neutral-900">{totalIssues}</p>
        </div>
        <div className="bg-neutral-100 p-3 rounded-md">
          <p className="text-xs text-neutral-700">Urgent/High</p>
          <p className="text-lg font-semibold text-red-600">{urgentHighCount}</p>
        </div>
        <div className="bg-neutral-100 p-3 rounded-md">
          <p className="text-xs text-neutral-700">Due in 7 Days</p>
          <p className="text-lg font-semibold text-orange-600">{dueIn7DaysCount}</p>
        </div>
        <div className="bg-neutral-100 p-3 rounded-md">
          <p className="text-xs text-neutral-700">Overdue</p>
          <p className="text-lg font-semibold text-red-600">{overdueCount}</p>
        </div>
      </div>

      <Separator />

      {/* Collapsible Issue List */}
      <div className="w-full overflow-hidden">
        <button
          onClick={() => setIsIssuesExpanded(!isIssuesExpanded)}
          className="flex items-center gap-1 text-xs font-semibold text-neutral-700 hover:text-neutral-900 transition-colors"
        >
          {isIssuesExpanded ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
          Active Issues ({sortedIssues.length})
        </button>
        {isIssuesExpanded && (
          <div className="space-y-2 max-h-64 overflow-y-auto overflow-x-hidden mt-3">
            {sortedIssues.map((issue, index) => (
              <div key={getItemKey(issue) || `issue-${index}`} className="flex items-center gap-2 p-2 bg-neutral-100 rounded-md hover:bg-neutral-200 transition">
                <Badge
                  className="text-xs shrink-0"
                  style={getPriorityColor(issue.priority)}
                >
                  {getLinearPriorityLabel(issue.priority)}
                </Badge>
                <div className="flex-1 min-w-0 max-w-full overflow-hidden">
                  <p className="text-sm font-medium text-neutral-900">
                    <span className="font-bold">{issue.identifier}</span>
                    {issue.title ? ` - ${truncateTitle(issue.title)}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-1 text-xs text-neutral-500 whitespace-nowrap shrink-0 ml-2">
                  <Clock className="w-3 h-3" />
                  <span>{formatDueDate(issue.dueDate)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// Component to display Linear issues
function LinearIssueCard({ memberData }: TicketingCardProps): React.ReactElement {
  const [isIssuesExpanded, setIsIssuesExpanded] = useState(false)

  if (!memberData?.linear_issues || memberData.linear_issues.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Linear Workload
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-neutral-500 text-center py-4">No active Linear issues</p>
        </CardContent>
      </Card>
    )
  }

  const issues = memberData.linear_issues

  // Calculate metrics from raw data
  const totalIssues = issues.length
  const urgentHighCount = issues.filter((issue: any) => isLinearUrgentHigh(issue.priority)).length
  const dueIn7DaysCount = issues.filter((issue: any) => isDueIn7Days(issue.dueDate)).length
  const overdueCount = issues.filter((issue: any) => isOverdue(issue.dueDate)).length

  const sortedIssues = sortLinearIssues(issues)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Linear Workload
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-neutral-100 p-3 rounded-md">
            <p className="text-xs text-neutral-700">Total Issues</p>
            <p className="text-lg font-semibold text-neutral-900">{totalIssues}</p>
          </div>
          <div className="bg-neutral-100 p-3 rounded-md">
            <p className="text-xs text-neutral-700">Urgent/High</p>
            <p className="text-lg font-semibold text-red-600">{urgentHighCount}</p>
          </div>
          <div className="bg-neutral-100 p-3 rounded-md">
            <p className="text-xs text-neutral-700">Due in 7 Days</p>
            <p className="text-lg font-semibold text-orange-600">{dueIn7DaysCount}</p>
          </div>
          <div className="bg-neutral-100 p-3 rounded-md">
            <p className="text-xs text-neutral-700">Overdue</p>
            <p className="text-lg font-semibold text-red-600">{overdueCount}</p>
          </div>
        </div>

        <Separator />

        {/* Collapsible Issue List */}
        <div className="w-full overflow-hidden">
          <button
            onClick={() => setIsIssuesExpanded(!isIssuesExpanded)}
            className="flex items-center gap-1 text-xs font-semibold text-neutral-700 hover:text-neutral-900 transition-colors"
          >
            {isIssuesExpanded ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
            Active Issues ({sortedIssues.length})
          </button>
          {isIssuesExpanded && (
            <div className="space-y-2 max-h-64 overflow-y-auto overflow-x-hidden mt-3">
              {sortedIssues.map((issue, index) => (
                <div key={getItemKey(issue) || `issue-${index}`} className="flex items-center gap-2 p-2 bg-neutral-100 rounded-md hover:bg-neutral-200 transition">
                  <Badge
                    className="text-xs shrink-0"
                    style={getPriorityColor(issue.priority)}
                  >
                    {getLinearPriorityLabel(issue.priority)}
                  </Badge>
                  <div className="flex-1 min-w-0 max-w-full overflow-hidden">
                    <p className="text-sm font-medium text-neutral-900">
                      <span className="font-bold">{issue.identifier}</span>
                      {issue.title ? ` - ${truncateTitle(issue.title)}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-neutral-500 whitespace-nowrap shrink-0 ml-2">
                    <Clock className="w-3 h-3" />
                    <span>{formatDueDate(issue.dueDate)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// Main TicketingCard component
export function TicketingCard({ memberData }: TicketingCardProps) {
  const [activeTab, setActiveTab] = useState<"jira" | "linear">("jira")

  // Check data availability
  const hasJira = memberData?.jira_account_id && memberData?.jira_tickets !== undefined
  const hasLinear = memberData?.linear_user_id && memberData?.linear_issues !== undefined

  // If neither Jira nor Linear data, don't render
  if (!hasJira && !hasLinear) {
    return null
  }

  // If both are available, show consolidated card with toggle in header
  if (hasJira && hasLinear) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>
              {activeTab === "jira" ? "Jira Workload" : "Linear Workload"}
            </CardTitle>
            <div className="flex gap-2">
              <button
                onClick={() => setActiveTab("jira")}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  activeTab === "jira"
                    ? "bg-purple-600 text-white"
                    : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                }`}
              >
                Jira
              </button>
              <button
                onClick={() => setActiveTab("linear")}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  activeTab === "linear"
                    ? "bg-purple-600 text-white"
                    : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                }`}
              >
                Linear
              </button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="w-full overflow-hidden">
          {activeTab === "jira" ? (
            <JiraTicketCardContent memberData={memberData} />
          ) : (
            <LinearIssueCardContent memberData={memberData} />
          )}
        </CardContent>
      </Card>
    )
  }

  // If only Jira is available
  if (hasJira) {
    return <JiraTicketCard memberData={memberData} />
  }

  // If only Linear is available
  return <LinearIssueCard memberData={memberData} />
}
