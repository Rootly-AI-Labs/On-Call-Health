'use client'

import React from 'react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import {
  getAllMetricsAffectedMembers,
  getVulnerabilityTags,
  getRemainingTagCount,
  getTagColorClasses
} from '@/lib/githubMetricUtils'
import { getRiskScore100FromMember } from '@/lib/scoring'

interface GitHubAllMetricsPopupProps {
  isOpen: boolean
  onClose: () => void
  members: any[]
  onMemberClick: (member: any) => void
}

export default function GitHubAllMetricsPopup({
  isOpen,
  onClose,
  members,
  onMemberClick
}: GitHubAllMetricsPopupProps) {
  const metricsWithMembers = getAllMetricsAffectedMembers(members)

  const handleMemberClick = (member: any) => {
    // Transform the member object to match MemberDetailModal's expected format
    const formattedMember = {
      id: member.user_id || '',
      name: member.user_name || 'Unknown',
      email: member.user_email || '',
      healthScore: getRiskScore100FromMember(member),
      riskLevel: (member.risk_level || 'low') as 'high' | 'medium' | 'low',
      trend: 'stable' as const,
      incidentsHandled: member.incident_count || 0,
      avgResponseTime: `${Math.round(member.metrics?.avg_response_time_minutes || 0)}m`,
      factors: {
        workload: Math.round(((member.factors?.workload || 0)) * 10) / 10,
        afterHours: Math.round(((member.factors?.after_hours || 0)) * 10) / 10,
        incidentLoad: Math.round(((member.factors?.incident_load || 0)) * 10) / 10,
      },
      metrics: member.metrics || {},
      github_activity: member.github_activity || null,
      slack_activity: member.slack_activity || null
    }
    onMemberClick(formattedMember)
    onClose()
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto bg-neutral-100">
        <DialogHeader>
          <DialogTitle className="text-2xl">Team Members at Risk - GitHub Activity</DialogTitle>
          <DialogDescription className="text-sm">
            Showing all team members with medium to high risk across GitHub metrics
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 space-y-6">
          {metricsWithMembers.map((metric) => {
            const isEmpty = metric.members.length === 0

            return (
              <div key={metric.metricType} className="space-y-2 bg-white p-4 rounded-lg">
                {/* Metric Section Header */}
                <div className="pb-2">
                  <h3 className="text-base font-semibold text-neutral-900">
                    {metric.label}
                  </h3>
                  <p className="text-xs text-neutral-500 mt-0.5">
                    {isEmpty
                      ? `All team members are below the threshold for ${metric.label}`
                      : `${metric.members.length} member${metric.members.length !== 1 ? 's' : ''} at risk`}
                  </p>
                </div>

                {/* Member Cards or Empty State */}
                {isEmpty ? (
                  <div className="text-center py-4">
                    <p className="text-xs text-neutral-500 italic">
                      No team members currently at risk for this metric
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {metric.members.map((member) => {
                      const allTags = getVulnerabilityTags(member, metric.metricType)
                      // Filter out OCH tag
                      const tags = allTags.filter(tag => !tag.label.startsWith('OCH:'))
                      const remainingTags = getRemainingTagCount(member, metric.metricType) - (allTags.length - tags.length)

                      return (
                        <div
                          key={member.user_id}
                          className="flex items-center space-x-3 p-3 border border-neutral-200 rounded-md bg-neutral-50 hover:bg-neutral-100 hover:border-neutral-300 cursor-pointer transition-colors"
                          onClick={() => handleMemberClick(member)}
                        >
                          {/* Avatar */}
                          <Avatar className="flex-shrink-0 h-10 w-10">
                            <AvatarFallback className="text-xs font-medium">
                              {member.user_name
                                ? member.user_name.split(' ')
                                    .map((n: string) => n[0])
                                    .join('')
                                : '?'}
                            </AvatarFallback>
                          </Avatar>

                          {/* Member Info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <h4 className="font-semibold text-neutral-900 truncate text-sm">
                                {member.user_name}
                              </h4>

                              {/* Tags on the right */}
                              {tags.length > 0 && (
                                <div className="flex-shrink-0 flex items-center flex-wrap gap-1 justify-end">
                                  {tags.map((tag, idx) => {
                                    // Extract color class without border
                                    const colorClass = getTagColorClasses(tag.color)
                                    // Remove 'border' classes from the color class
                                    const noBorderClass = colorClass.replace(/border[\w-]*/g, '').trim()
                                    return (
                                      <span
                                        key={idx}
                                        className={`inline-flex items-center text-xs px-2 py-0.5 rounded-full ${noBorderClass}`}
                                      >
                                        {tag.label}
                                      </span>
                                    )
                                  })}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </DialogContent>
    </Dialog>
  )
}
