"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { AlertCircle, Clock } from "lucide-react"
import { formatDistanceToNow, isPast, parseISO } from "date-fns"

interface TicketingCardProps {
  memberData: any
}

// Helper function to determine priority badge color
function getPriorityColor(priority: string | number): string {
  if (typeof priority === "string") {
    // Jira priority
    switch (priority.toLowerCase()) {
      case "highest":
        return "bg-red-600 text-white"
      case "high":
        return "bg-orange-500 text-white"
      case "medium":
        return "bg-yellow-500 text-white"
      case "low":
        return "bg-blue-500 text-white"
      case "lowest":
        return "bg-gray-500 text-white"
      default:
        return "bg-gray-400 text-white"
    }
  } else {
    // Linear priority (1=Urgent, 2=High, 3=Medium, 4=Low, 0=None)
    switch (priority) {
      case 1:
        return "bg-red-600 text-white"
      case 2:
        return "bg-orange-500 text-white"
      case 3:
        return "bg-yellow-500 text-white"
      case 4:
        return "bg-blue-500 text-white"
      case 0:
        return "bg-gray-400 text-white"
      default:
        return "bg-gray-400 text-white"
    }
  }
}

// Helper function to format risk level badge
function getRiskBadgeColor(riskLevel: string): string {
  switch (riskLevel?.toLowerCase()) {
    case "low":
      return "bg-green-100 text-green-800"
    case "moderate":
      return "bg-yellow-100 text-yellow-800"
    case "high":
      return "bg-orange-100 text-orange-800"
    case "severe":
      return "bg-red-100 text-red-800"
    default:
      return "bg-gray-100 text-gray-800"
  }
}

// Helper function to format deadline pressure
function getDeadlinePressureBadgeColor(pressure: string): string {
  switch (pressure?.toLowerCase()) {
    case "none":
      return "bg-green-100 text-green-800"
    case "low":
      return "bg-blue-100 text-blue-800"
    case "moderate":
      return "bg-yellow-100 text-yellow-800"
    case "high":
      return "bg-orange-100 text-orange-800"
    case "critical":
      return "bg-red-100 text-red-800"
    default:
      return "bg-gray-100 text-gray-800"
  }
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

// Component to display Jira tickets
function JiraTicketCard({ memberData }: TicketingCardProps) {
  if (!memberData?.jira_tickets || memberData.jira_tickets.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <span className="text-blue-600">●</span> Jira Workload
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-500 text-center py-4">No active Jira tickets</p>
        </CardContent>
      </Card>
    )
  }

  const jiraIndicators = memberData.jira_burnout_breakdown?.jira_indicators || {}
  const jiraAddedRisk = memberData.jira_burnout_breakdown?.jira_added_risk || 0

  // Sort tickets by priority (high to low) then by due date
  const sortedTickets = [...memberData.jira_tickets].sort((a, b) => {
    const priorityOrder: { [key: string]: number } = {
      highest: 1,
      high: 2,
      medium: 3,
      low: 4,
      lowest: 5,
    }
    const aOrder = priorityOrder[a.priority?.toLowerCase()] || 6
    const bOrder = priorityOrder[b.priority?.toLowerCase()] || 6

    if (aOrder !== bOrder) {
      return aOrder - bOrder
    }

    // If same priority, sort by due date (earlier first)
    if (a.duedate && b.duedate) {
      return new Date(a.duedate).getTime() - new Date(b.duedate).getTime()
    }
    return a.duedate ? -1 : 1
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <span className="text-blue-600">●</span> Jira Workload
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-gray-50 p-3 rounded-md">
            <p className="text-xs text-gray-600">Total Tickets</p>
            <p className="text-lg font-semibold text-gray-900">{jiraIndicators.ticket_count || 0}</p>
          </div>
          <div className="bg-gray-50 p-3 rounded-md">
            <p className="text-xs text-gray-600">Critical</p>
            <p className="text-lg font-semibold text-red-600">{jiraIndicators.critical_count || 0}</p>
          </div>
          <div className="bg-gray-50 p-3 rounded-md">
            <p className="text-xs text-gray-600">Overload Risk</p>
            <Badge className={`${getRiskBadgeColor(jiraIndicators.overload_risk)} text-xs`}>
              {jiraIndicators.overload_risk || "Unknown"}
            </Badge>
          </div>
          <div className="bg-gray-50 p-3 rounded-md">
            <p className="text-xs text-gray-600">Deadline</p>
            <Badge className={`${getDeadlinePressureBadgeColor(jiraIndicators.deadline_pressure)} text-xs`}>
              {jiraIndicators.deadline_pressure || "None"}
            </Badge>
          </div>
        </div>

        {/* Burnout Impact */}
        <div className="bg-red-50 border border-red-200 p-3 rounded-md">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-600" />
            <span className="text-sm font-medium text-red-900">
              Jira Added Risk: <span className="font-bold">+{jiraAddedRisk.toFixed(0)}</span> points to OCB score
            </span>
          </div>
        </div>

        <Separator />

        {/* Ticket List */}
        <div>
          <p className="text-xs font-semibold text-gray-700 mb-3">Active Tickets ({sortedTickets.length})</p>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {sortedTickets.map((ticket, index) => (
              <div key={index} className="flex items-start gap-2 p-2 bg-gray-50 rounded-md hover:bg-gray-100 transition">
                <Badge className={`${getPriorityColor(ticket.priority)} text-xs mt-0.5 flex-shrink-0`}>
                  {ticket.priority || "N/A"}
                </Badge>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{ticket.key}</p>
                  <div className="flex items-center gap-1 text-xs text-gray-500 mt-1">
                    <Clock className="w-3 h-3" />
                    <span>{formatDueDate(ticket.duedate)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// Component to display Linear issues
function LinearIssueCard({ memberData }: TicketingCardProps) {
  if (!memberData?.linear_issues || memberData.linear_issues.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <span className="text-purple-600">●</span> Linear Workload
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-500 text-center py-4">No active Linear issues</p>
        </CardContent>
      </Card>
    )
  }

  const linearIndicators = memberData.linear_burnout_breakdown?.linear_indicators || {}
  const linearAddedRisk = memberData.linear_burnout_breakdown?.linear_added_risk || 0

  // Sort issues by priority (urgent to low) then by due date
  const sortedIssues = [...memberData.linear_issues].sort((a, b) => {
    // Linear priority: 1=Urgent, 2=High, 3=Medium, 4=Low, 0=None
    const aPriority = a.priority ?? 0
    const bPriority = b.priority ?? 0

    if (aPriority !== bPriority) {
      // Lower priority numbers are higher priority (1 is highest)
      return aPriority - bPriority
    }

    // If same priority, sort by due date
    if (a.dueDate && b.dueDate) {
      return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
    }
    return a.dueDate ? -1 : 1
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <span className="text-purple-600">●</span> Linear Workload
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-gray-50 p-3 rounded-md">
            <p className="text-xs text-gray-600">Total Issues</p>
            <p className="text-lg font-semibold text-gray-900">{linearIndicators.issue_count || 0}</p>
          </div>
          <div className="bg-gray-50 p-3 rounded-md">
            <p className="text-xs text-gray-600">Urgent/High</p>
            <p className="text-lg font-semibold text-red-600">{linearIndicators.urgent_high_count || 0}</p>
          </div>
          <div className="bg-gray-50 p-3 rounded-md">
            <p className="text-xs text-gray-600">Overload Risk</p>
            <Badge className={`${getRiskBadgeColor(linearIndicators.overload_risk)} text-xs`}>
              {linearIndicators.overload_risk || "Unknown"}
            </Badge>
          </div>
          <div className="bg-gray-50 p-3 rounded-md">
            <p className="text-xs text-gray-600">Deadline</p>
            <Badge className={`${getDeadlinePressureBadgeColor(linearIndicators.deadline_pressure)} text-xs`}>
              {linearIndicators.deadline_pressure || "None"}
            </Badge>
          </div>
        </div>

        {/* Burnout Impact */}
        <div className="bg-purple-50 border border-purple-200 p-3 rounded-md">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-purple-600" />
            <span className="text-sm font-medium text-purple-900">
              Linear Added Risk: <span className="font-bold">+{linearAddedRisk.toFixed(0)}</span> points to OCB score
            </span>
          </div>
        </div>

        <Separator />

        {/* Issue List */}
        <div>
          <p className="text-xs font-semibold text-gray-700 mb-3">Active Issues ({sortedIssues.length})</p>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {sortedIssues.map((issue, index) => (
              <div key={index} className="flex items-start gap-2 p-2 bg-gray-50 rounded-md hover:bg-gray-100 transition">
                <Badge className={`${getPriorityColor(issue.priority)} text-xs mt-0.5 flex-shrink-0`}>
                  {issue.priority === 1 ? "Urgent" : issue.priority === 2 ? "High" : issue.priority === 3 ? "Med" : issue.priority === 4 ? "Low" : "None"}
                </Badge>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{issue.identifier}</p>
                  <div className="flex items-center gap-1 text-xs text-gray-500 mt-1">
                    <Clock className="w-3 h-3" />
                    <span>{formatDueDate(issue.dueDate)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
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

  // If both are available, show tabbed view
  if (hasJira && hasLinear) {
    return (
      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as "jira" | "linear")} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="jira" className="flex items-center gap-2">
            <span className="text-blue-600">●</span> Jira
          </TabsTrigger>
          <TabsTrigger value="linear" className="flex items-center gap-2">
            <span className="text-purple-600">●</span> Linear
          </TabsTrigger>
        </TabsList>

        <TabsContent value="jira" className="space-y-4">
          <JiraTicketCard memberData={memberData} />
        </TabsContent>

        <TabsContent value="linear" className="space-y-4">
          <LinearIssueCard memberData={memberData} />
        </TabsContent>
      </Tabs>
    )
  }

  // If only Jira is available
  if (hasJira) {
    return <JiraTicketCard memberData={memberData} />
  }

  // If only Linear is available
  return <LinearIssueCard memberData={memberData} />
}
