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
  getAllFactorsAffectedMembers,
  getVulnerabilityTags,
  getRemainingTagCount,
  getTagColorClasses,
  getOCBBadgeColorClasses
} from '@/lib/riskFactorUtils'

interface RiskFactorsAllPopupProps {
  isOpen: boolean
  onClose: () => void
  members: any[]
  onMemberClick: (member: any) => void
}

export default function RiskFactorsAllPopup({
  isOpen,
  onClose,
  members,
  onMemberClick
}: RiskFactorsAllPopupProps) {
  const factorsWithMembers = getAllFactorsAffectedMembers(members)

  const handleMemberClick = (member: any) => {
    // Transform the member object to include both original and transformed field names
    const formattedMember = {
      ...member,
      id: member.user_id || '',
      name: member.user_name || 'Unknown',
      email: member.user_email || '',
    }
    onMemberClick(formattedMember)
    onClose()
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl">Team Members at Risk - Burnout Factors</DialogTitle>
          <DialogDescription className="text-sm">
            Showing all team members with medium to high risk across burnout factors
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 space-y-6">
          {factorsWithMembers.map((factor) => {
            const isEmpty = factor.members.length === 0

            return (
              <div key={factor.factorType} className="space-y-2">
                {/* Factor Section Header */}
                <div className="border-b border-neutral-200 pb-2">
                  <h3 className="text-base font-semibold text-neutral-900">
                    {factor.label}
                  </h3>
                  <p className="text-xs text-neutral-500 mt-0.5">
                    {isEmpty
                      ? `All team members are below the threshold for ${factor.label}`
                      : `${factor.members.length} member${factor.members.length !== 1 ? 's' : ''} at risk`}
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
                    {factor.members.map((member) => {
                      const allTags = getVulnerabilityTags(member, factor.factorType)
                      // Filter out OCB tag and Risk level tags
                      const tags = allTags.filter(tag => !tag.label.startsWith('OCB:') && !tag.label.includes('Risk'))
                      const remainingTags = getRemainingTagCount(allTags) - (allTags.length - tags.length)
                      const ocbScore = member.ocb_score || 0

                      return (
                        <div
                          key={member.user_id}
                          className="flex items-start space-x-3 p-3 border border-neutral-100 rounded-md hover:bg-neutral-100 hover:border-neutral-200 cursor-pointer transition-colors"
                          onClick={() => handleMemberClick(member)}
                        >
                          {/* Avatar */}
                          <Avatar className="flex-shrink-0 mt-0.5 h-10 w-10">
                            <AvatarFallback className="text-xs font-medium">
                              {member.user_name
                                .split(' ')
                                .map((n: string) => n[0])
                                .join('')}
                            </AvatarFallback>
                          </Avatar>

                          {/* Member Info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <h4 className="font-semibold text-neutral-900 truncate text-sm">
                                  {member.user_name}
                                </h4>
                                <p className="text-xs text-neutral-500 truncate">
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
                                  <span className="inline-flex items-center text-xs px-2 py-0.5 rounded-full border bg-neutral-200 text-neutral-700 border-neutral-300">
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
