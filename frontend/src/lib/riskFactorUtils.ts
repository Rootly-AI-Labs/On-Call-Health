/**
 * Utility functions for Risk Factor metrics and member risk analysis
 */

export type RiskFactorType = 'workload' | 'after_hours' | 'weekend_work' | 'incident_load' | 'response_time'

export interface MemberWithRiskScore {
  [key: string]: any
  riskScore: number
}

export interface VulnerabilityTag {
  label: string
  color: 'red' | 'orange' | 'yellow' | 'green' | 'blue'
}

/**
 * Risk thresholds for each factor (0-100 scale)
 * Medium: >= 50, High: >= 70
 */
export const RISK_THRESHOLDS = {
  workload: { medium: 50, high: 70 },
  after_hours: { medium: 50, high: 70 },
  weekend_work: { medium: 50, high: 70 },
  incident_load: { medium: 50, high: 70 },
  response_time: { medium: 50, high: 70 }
} as const

/**
 * Get team members affected by a specific risk factor
 * Only includes members with medium to high risk (>= 50/100)
 */
export function getAffectedMembers(
  members: any[],
  factorType: RiskFactorType
): MemberWithRiskScore[] {
  if (!members || !Array.isArray(members)) {
    return []
  }

  const filtered = members.filter(member => {
    // Only include members with OCB scores (active members)
    if (!member.ocb_score) {
      return false
    }

    // Get the factor value (0-10 scale from backend)
    const factorValue = member?.factors?.[factorType] ?? 0

    // Convert to 0-100 scale for threshold comparison
    const riskScore = Math.round(factorValue * 10)

    // Only include members at medium/high risk (>= 50)
    return riskScore >= RISK_THRESHOLDS[factorType].medium
  })

  return filtered
    .map(member => ({
      ...member,
      riskScore: calculateRiskScore(member, factorType)
    }))
    .sort((a, b) => b.riskScore - a.riskScore)
}

/**
 * Calculate risk score for a member on a specific factor (0-100 scale)
 */
export function calculateRiskScore(member: any, factorType: RiskFactorType): number {
  const factorValue = member?.factors?.[factorType] ?? 0
  return Math.round(factorValue * 10)
}

/**
 * Get risk level based on score
 */
export function getRiskLevel(score: number): 'high' | 'medium' | 'low' {
  if (score >= 70) return 'high'
  if (score >= 50) return 'medium'
  return 'low'
}

/**
 * Get user-friendly display name for a risk factor type
 */
export function getFactorDisplayName(factorType: RiskFactorType): string {
  const names: Record<RiskFactorType, string> = {
    workload: 'Workload Intensity',
    after_hours: 'After Hours Activity',
    weekend_work: 'Weekend Work',
    incident_load: 'Incident Load',
    response_time: 'Response Time'
  }
  return names[factorType]
}

/**
 * Get color for OCB score badge
 */
export function getOCBBadgeColor(ocbScore: number): string {
  if (ocbScore >= 70) return 'red'
  if (ocbScore >= 50) return 'orange'
  if (ocbScore >= 30) return 'yellow'
  return 'green'
}

/**
 * Get Tailwind color classes for OCB badge
 */
export function getOCBBadgeColorClasses(ocbScore: number): string {
  if (ocbScore >= 70) return 'bg-red-100 text-red-800 border-red-300'
  if (ocbScore >= 50) return 'bg-orange-100 text-orange-800 border-orange-300'
  if (ocbScore >= 30) return 'bg-yellow-100 text-yellow-800 border-yellow-300'
  return 'bg-green-100 text-green-800 border-green-300'
}

/**
 * Get Tailwind color classes for tags
 */
export function getTagColorClasses(color: 'red' | 'orange' | 'yellow' | 'green' | 'blue'): string {
  const colorMap = {
    red: 'bg-red-100 text-red-800 border-red-300',
    orange: 'bg-orange-100 text-orange-800 border-orange-300',
    yellow: 'bg-yellow-100 text-yellow-800 border-yellow-300',
    green: 'bg-green-100 text-green-800 border-green-300',
    blue: 'bg-blue-100 text-blue-800 border-blue-300'
  }
  return colorMap[color]
}

/**
 * Generate vulnerability tags for a member
 */
export function getVulnerabilityTags(member: any, factorType: RiskFactorType): VulnerabilityTag[] {
  const tags: VulnerabilityTag[] = []
  const riskScore = calculateRiskScore(member, factorType)
  const riskLevel = getRiskLevel(riskScore)
  const ocbScore = member.ocb_score || 0

  // Risk level tag
  if (riskLevel === 'high') {
    tags.push({
      label: 'High Risk',
      color: 'red'
    })
  } else if (riskLevel === 'medium') {
    tags.push({
      label: 'Medium Risk',
      color: 'orange'
    })
  }

  // OCB score tag
  const ocbLevel = getOCBBadgeColor(ocbScore)
  tags.push({
    label: `OCB: ${ocbScore}/100`,
    color: ocbLevel as 'red' | 'orange' | 'yellow' | 'green' | 'blue'
  })

  // Factor-specific metric tag
  const factorName = getFactorDisplayName(factorType)
  tags.push({
    label: `${factorName.split(' ')[0]}: ${riskScore}/100`,
    color: riskLevel === 'high' ? 'red' : riskLevel === 'medium' ? 'orange' : 'yellow'
  })

  return tags
}

/**
 * Get the number of tags to show initially (others are hidden)
 */
export function getVisibleTagCount(): number {
  return 2
}

/**
 * Get the count of remaining tags (if any) beyond visible count
 */
export function getRemainingTagCount(tags: VulnerabilityTag[]): number {
  const visible = getVisibleTagCount()
  return Math.max(0, tags.length - visible)
}

/**
 * Get formatted metric text for a member's factor
 */
export function getFactorMetricText(member: any, factorType: RiskFactorType): string {
  const riskScore = calculateRiskScore(member, factorType)
  const riskLevel = getRiskLevel(riskScore)
  return `${riskScore}/100 (${riskLevel.charAt(0).toUpperCase() + riskLevel.slice(1)})`
}

/**
 * Get all affected members across all risk factors
 */
export function getAllFactorsAffectedMembers(members: any[]): Array<{
  factorType: RiskFactorType
  label: string
  members: MemberWithRiskScore[]
}> {
  const factorTypes: RiskFactorType[] = ['workload', 'after_hours', 'weekend_work', 'response_time', 'incident_load']

  return factorTypes.map(factorType => ({
    factorType,
    label: getFactorDisplayName(factorType),
    members: getAffectedMembers(members, factorType)
  }))
}
