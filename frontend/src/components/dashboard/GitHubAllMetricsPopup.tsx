'use client'

import React from 'react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
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
  getTagColorClasses,
  getOCBBadgeColorClasses
} from '@/lib/githubMetricUtils'

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
      burnoutScore: member.ocb_score || 0,
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
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
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
              <div key={metric.metricType} className="space-y-2">
                {/* Metric Section Header */}
                <div className="border-b border-gray-200 pb-2">
                  <h3 className="text-base font-semibold text-gray-900">
                    {metric.label}
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {isEmpty
                      ? `All team members are below the threshold for ${metric.label}`
                      : `${metric.members.length} member${metric.members.length !== 1 ? 's' : ''} at risk`}
                  </p>
                </div>

                {/* Member Cards or Empty State */}
                {isEmpty ? (
                  <div className="text-center py-4">
                    <p className="text-xs text-gray-500 italic">
                      No team members currently at risk for this metric
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {metric.members.map((member) => {
                      const allTags = getVulnerabilityTags(member, metric.metricType)
                      // Filter out OCB tag
                      const tags = allTags.filter(tag => !tag.label.startsWith('OCB:'))
                      const remainingTags = getRemainingTagCount(member, metric.metricType) - (allTags.length - tags.length)
                      const ocbScore = member.ocb_score || 0

                      return (
                        <div
                          key={member.user_id}
                          className="flex items-start space-x-3 p-3 border border-gray-100 rounded-md hover:bg-gray-50 hover:border-gray-200 cursor-pointer transition-colors"
                          onClick={() => handleMemberClick(member)}
                        >
                          {/* Avatar */}
                          <Avatar className="flex-shrink-0 mt-0.5 h-10 w-10">
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
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <h4 className="font-semibold text-gray-900 truncate text-sm">
                                  {member.user_name}
                                </h4>
                                <p className="text-xs text-gray-500 truncate">
                                  {member.user_email}
                                </p>
                              </div>

                              {/* OCB Badge on the right */}
                              <Badge
                                variant="outline"
                                className={`flex-shrink-0 ${getOCBBadgeColorClasses(ocbScore)} text-xs py-1 px-2`}
                              >
                                {ocbScore.toFixed(1)}/100
                              </Badge>
                            </div>

                            {/* Tags */}
                            {tags.length > 0 && (
                              <div className="mt-2 flex items-center flex-wrap gap-1">
                                {tags.map((tag, idx) => (
                                  <span
                                    key={idx}
                                    className={`inline-flex items-center text-xs px-2 py-0.5 rounded-full border ${getTagColorClasses(tag.color)}`}
                                  >
                                    {tag.label}
                                  </span>
                                ))}
                                {remainingTags > 0 && (
                                  <span className="inline-flex items-center text-xs px-2 py-0.5 rounded-full border bg-gray-100 text-gray-700 border-gray-300">
                                    +{remainingTags} more
                                  </span>
                                )}
                              </div>
                            )}
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
