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
  calculateRiskScore,
  getRiskLevel
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

  const getFactorColor = (score: number): string => {
    const riskLevel = getRiskLevel(score)
    if (riskLevel === 'high') return 'red'
    if (riskLevel === 'medium') return 'orange'
    return 'yellow'
  }

  const getFactorTagColor = (score: number): string => {
    const riskLevel = getRiskLevel(score)
    if (riskLevel === 'high') {
      return 'bg-red-100 text-red-700'
    } else if (riskLevel === 'medium') {
      return 'bg-orange-100 text-orange-700'
    }
    return 'bg-yellow-100 text-yellow-700'
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto bg-neutral-100">
        <DialogHeader>
          <DialogTitle className="text-2xl">Team Members at Risk - Health Factors</DialogTitle>
          <DialogDescription className="text-sm">
            Showing all team members with medium to high risk and their corresponding health factor scores
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 space-y-6">
          {factorsWithMembers.map((factor) => {
            const isEmpty = factor.members.length === 0

            return (
              <div key={factor.factorType} className="space-y-2 bg-white p-4 rounded-lg">
                {/* Factor Section Header */}
                <div className="pb-2">
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
                      // Calculate risk score for the current factor section
                      const relevantScore = calculateRiskScore(member, factor.factorType)

                      // Display only the score
                      const getTagLabel = () => `${relevantScore}/100`

                      return (
                        <div
                          key={member.user_id}
                          className="flex items-center space-x-3 p-3 border border-neutral-200 rounded-md bg-neutral-50 hover:bg-neutral-100 hover:border-neutral-300 cursor-pointer transition-colors"
                          onClick={() => handleMemberClick(member)}
                        >
                          {/* Avatar */}
                          <Avatar className="shrink-0 h-10 w-10">
                            <AvatarFallback className="text-xs font-medium">
                              {member.user_name
                                .split(' ')
                                .map((n: string) => n[0])
                                .join('')}
                            </AvatarFallback>
                          </Avatar>

                          {/* Member Info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <h4 className="font-semibold text-neutral-900 truncate text-sm">
                                {member.user_name}
                              </h4>

                              {/* Factor Tag on the right - only for current section */}
                              <span className={`shrink-0 text-xs font-semibold px-3 py-1 rounded-full ${getFactorTagColor(relevantScore)} whitespace-nowrap`}>
                                {getTagLabel()}
                              </span>
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
