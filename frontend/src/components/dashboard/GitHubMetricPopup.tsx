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
  getAffectedMembers,
  getVulnerabilityTags,
  getRemainingTagCount,
  getTagColorClasses,
  getOCBBadgeColor,
  type MetricType
} from '@/lib/githubMetricUtils'

interface GitHubMetricPopupProps {
  isOpen: boolean
  onClose: () => void
  metricType: MetricType
  metricLabel: string
  members: any[]
  onMemberClick: (member: any) => void
}

export default function GitHubMetricPopup({
  isOpen,
  onClose,
  metricType,
  metricLabel,
  members,
  onMemberClick
}: GitHubMetricPopupProps) {
  const affectedMembers = getAffectedMembers(members, metricType)
  const isEmpty = affectedMembers.length === 0

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
        weekendWork: Math.round(((member.factors?.weekend_work || 0)) * 10) / 10,
        incidentLoad: Math.round(((member.factors?.incident_load || 0)) * 10) / 10,
        responseTime: Math.round(((member.factors?.response_time || 0)) * 10) / 10,
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
      <DialogContent className="max-w-2xl max-h-[600px] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <span>Team Members Affected by {metricLabel}</span>
          </DialogTitle>
          <DialogDescription>
            {isEmpty
              ? 'No team members currently at risk for this metric'
              : `Showing ${affectedMembers.length} member${affectedMembers.length !== 1 ? 's' : ''} with medium to high risk`}
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4">
          {isEmpty ? (
            <div className="text-center py-8">
              <p className="text-gray-500">
                All team members are below the threshold for {metricLabel}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {affectedMembers.map((member) => {
                const tags = getVulnerabilityTags(member, metricType)
                const remainingTags = getRemainingTagCount(member, metricType)
                const ocbScore = member.ocb_score || 0

                return (
                  <div
                    key={member.user_id}
                    className="flex items-start space-x-3 p-3 border-b hover:bg-gray-50 cursor-pointer transition-colors last:border-b-0"
                    onClick={() => handleMemberClick(member)}
                  >
                    {/* Avatar */}
                    <Avatar className="flex-shrink-0 mt-0.5">
                      <AvatarFallback className="text-xs font-medium">
                        {member.user_name
                          .split(' ')
                          .map((n: string) => n[0])
                          .join('')}
                      </AvatarFallback>
                    </Avatar>

                    {/* Member Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between">
                        <div>
                          <h4 className="font-medium text-gray-900 truncate">
                            {member.user_name}
                          </h4>
                          <p className="text-xs text-gray-500 truncate">
                            {member.user_email}
                          </p>
                        </div>

                        {/* OCB Badge */}
                        <Badge
                          variant="outline"
                          className={`flex-shrink-0 ml-2 ${getOCBBadgeColor(ocbScore)}`}
                        >
                          {ocbScore.toFixed(0)}/100
                        </Badge>
                      </div>

                      {/* Tags and Contribution */}
                      <div className="mt-2 space-y-2">
                        {/* Tags */}
                        <div className="flex items-center flex-wrap gap-1">
                          {tags.map((tag, idx) => (
                            <span
                              key={idx}
                              className={`inline-flex items-center text-xs px-2 py-1 rounded-full border ${getTagColorClasses(tag.color)}`}
                            >
                              {tag.label}
                            </span>
                          ))}
                          {remainingTags > 0 && (
                            <span className="inline-flex items-center text-xs px-2 py-1 rounded-full border bg-gray-100 text-gray-700 border-gray-300">
                              +{remainingTags} more
                            </span>
                          )}
                        </div>

                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
