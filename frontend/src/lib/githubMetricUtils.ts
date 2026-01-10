/**
 * Utility functions for GitHub Activity metrics and burnout factor analysis
 */

export type MetricType = 'after_hours' | 'high_commits' | 'code_reviews' | 'pull_requests'

export interface MemberWithContribution {
  [key: string]: any
  contributionScore: number
}

export interface VulnerabilityTag {
  label: string
  color: 'red' | 'orange' | 'yellow' | 'purple' | 'blue'
}

/**
 * Get team members affected by a specific GitHub metric
 * Filters based purely on GitHub-specific metrics (not OCB factors)
 * Only includes members who have GitHub integration data
 */
export function getAffectedMembers(
  members: any[],
  metricType: MetricType
): MemberWithContribution[] {
  if (!members || !Array.isArray(members)) {
    return []
  }

  const filtered = members.filter(member => {
    // Only include members with GitHub integration data
    if (!member.github_activity) {
      return false
    }

    switch (metricType) {
      case 'after_hours': {
        // After-hours commits: >= 15% (0.15) of total commits (matches backend medium threshold)
        const commitsCount = member.github_activity.commits_count || 0
        if (commitsCount === 0) return false
        const afterHoursPercent = (member.github_activity.after_hours_commits || 0) / commitsCount
        return afterHoursPercent >= 0.15
      }

      case 'high_commits': {
        // High commit volume: >= 50 commits per week OR >= 25 commits per week (adjustable)
        const commitsPerWeek = member.github_activity.commits_per_week || 0
        return commitsPerWeek >= 25
      }

      case 'code_reviews': {
        // High code review load: >= 15 reviews
        return (member.github_activity.reviews_count || 0) >= 15
      }

      case 'pull_requests': {
        // High PR activity: >= 20 pull requests
        return (member.github_activity.pull_requests_count || 0) >= 20
      }

      default:
        return false
    }
  })

  return filtered
    .map(member => ({
      ...member,
      contributionScore: calculateContribution(member, metricType)
    }))
    .sort((a, b) => b.contributionScore - a.contributionScore)
}

/**
 * Calculate contribution score for sorting members (GitHub metrics only)
 * Higher score = higher contribution to the GitHub metric
 */
export function calculateContribution(member: any, metricType: MetricType): number {
  if (!member.github_activity) {
    return 0
  }

  switch (metricType) {
    case 'after_hours': {
      // Score based on after-hours commits count and percentage
      const afterHoursCommits = member.github_activity.after_hours_commits || 0
      const totalCommits = member.github_activity.commits_count || 1
      const percentage = (afterHoursCommits / totalCommits) * 100
      // Combine count and percentage for scoring
      return afterHoursCommits * 2 + percentage
    }

    case 'high_commits':
      return member.github_activity.commits_count || 0

    case 'code_reviews':
      return member.github_activity.reviews_count || 0

    case 'pull_requests':
      return member.github_activity.pull_requests_count || 0

    default:
      return 0
  }
}

/**
 * Generate vulnerability tags for a member based on GitHub-specific metrics
 * Shows actual GitHub activity risk indicators only
 */
export function getVulnerabilityTags(
  member: any,
  metricType: MetricType
): VulnerabilityTag[] {
  const tags: VulnerabilityTag[] = []
  if (!member.github_activity) {
    return tags
  }

  const commitsCount = member.github_activity.commits_count || 1

  if (metricType === 'after_hours') {
    const afterHoursPercent = member.github_activity.after_hours_commits
      ? ((member.github_activity.after_hours_commits / commitsCount) * 100)
      : 0

    // Backend thresholds: high >= 30%, medium >= 15%
    if (afterHoursPercent >= 30) {
      tags.push({ label: `${Math.round(afterHoursPercent)}% After-Hours`, color: 'red' })
    } else if (afterHoursPercent >= 15) {
      tags.push({ label: `${Math.round(afterHoursPercent)}% After-Hours`, color: 'orange' })
    }

    const afterHoursCount = member.github_activity.after_hours_commits || 0
    if (afterHoursCount > 0) {
      tags.push({ label: `${afterHoursCount} commits`, color: 'blue' })
    }
  }

  if (metricType === 'high_commits') {
    const commitsPerWeek = member.github_activity.commits_per_week || 0
    if (commitsPerWeek >= 50) {
      tags.push({ label: `${Math.round(commitsPerWeek)}/week`, color: 'red' })
    } else if (commitsPerWeek >= 35) {
      tags.push({ label: `${Math.round(commitsPerWeek)}/week`, color: 'orange' })
    } else {
      tags.push({ label: `${Math.round(commitsPerWeek)}/week`, color: 'yellow' })
    }

    const totalCommits = member.github_activity.commits_count || 0
    if (totalCommits > 0) {
      tags.push({ label: `${totalCommits} total`, color: 'blue' })
    }
  }

  if (metricType === 'code_reviews') {
    const reviewsCount = member.github_activity.reviews_count || 0
    if (reviewsCount >= 30) {
      tags.push({ label: `${reviewsCount} Code Reviews`, color: 'red' })
    } else if (reviewsCount >= 20) {
      tags.push({ label: `${reviewsCount} Code Reviews`, color: 'orange' })
    } else {
      tags.push({ label: `${reviewsCount} Code Reviews`, color: 'blue' })
    }
  }

  if (metricType === 'pull_requests') {
    const prCount = member.github_activity.pull_requests_count || 0
    if (prCount >= 50) {
      tags.push({ label: `${prCount} Pull Requests`, color: 'red' })
    } else if (prCount >= 35) {
      tags.push({ label: `${prCount} Pull Requests`, color: 'orange' })
    } else {
      tags.push({ label: `${prCount} Pull Requests`, color: 'blue' })
    }
  }

  // Limit to 3 tags, others will be indicated with "+"
  return tags.slice(0, 3)
}

/**
 * Get remaining tag count if there are more than 3 tags
 */
export function getRemainingTagCount(
  member: any,
  metricType: MetricType
): number {
  const allTags = getAllVulnerabilityTags(member, metricType)
  return Math.max(0, allTags.length - 3)
}

/**
 * Get all vulnerability tags (internal helper for getRemainingTagCount)
 * GitHub-specific metrics only
 */
function getAllVulnerabilityTags(
  member: any,
  metricType: MetricType
): VulnerabilityTag[] {
  const tags: VulnerabilityTag[] = []
  if (!member.github_activity) {
    return tags
  }

  const commitsCount = member.github_activity.commits_count || 1

  if (metricType === 'after_hours') {
    const afterHoursPercent = member.github_activity.after_hours_commits
      ? ((member.github_activity.after_hours_commits / commitsCount) * 100)
      : 0

    // Backend thresholds: high >= 30%, medium >= 15%
    if (afterHoursPercent >= 30) {
      tags.push({ label: `${Math.round(afterHoursPercent)}% After-Hours`, color: 'red' })
    } else if (afterHoursPercent >= 15) {
      tags.push({ label: `${Math.round(afterHoursPercent)}% After-Hours`, color: 'orange' })
    }

    const afterHoursCount = member.github_activity.after_hours_commits || 0
    if (afterHoursCount > 0) {
      tags.push({ label: `${afterHoursCount} commits`, color: 'blue' })
    }
  }

  if (metricType === 'high_commits') {
    const commitsPerWeek = member.github_activity.commits_per_week || 0
    if (commitsPerWeek >= 50) {
      tags.push({ label: `${Math.round(commitsPerWeek)}/week`, color: 'red' })
    } else if (commitsPerWeek >= 35) {
      tags.push({ label: `${Math.round(commitsPerWeek)}/week`, color: 'orange' })
    } else {
      tags.push({ label: `${Math.round(commitsPerWeek)}/week`, color: 'yellow' })
    }

    const totalCommits = member.github_activity.commits_count || 0
    if (totalCommits > 0) {
      tags.push({ label: `${totalCommits} total`, color: 'blue' })
    }
  }

  if (metricType === 'code_reviews') {
    const reviewsCount = member.github_activity.reviews_count || 0
    if (reviewsCount >= 30) {
      tags.push({ label: `${reviewsCount} Code Reviews`, color: 'red' })
    } else if (reviewsCount >= 20) {
      tags.push({ label: `${reviewsCount} Code Reviews`, color: 'orange' })
    } else {
      tags.push({ label: `${reviewsCount} Code Reviews`, color: 'blue' })
    }
  }

  if (metricType === 'pull_requests') {
    const prCount = member.github_activity.pull_requests_count || 0
    if (prCount >= 50) {
      tags.push({ label: `${prCount} Pull Requests`, color: 'red' })
    } else if (prCount >= 35) {
      tags.push({ label: `${prCount} Pull Requests`, color: 'orange' })
    } else {
      tags.push({ label: `${prCount} Pull Requests`, color: 'blue' })
    }
  }

  return tags
}

/**
 * Get CSS classes for tag color
 */
export function getTagColorClasses(color: VulnerabilityTag['color']): string {
  const colorMap = {
    red: 'bg-red-100 text-red-800 border-red-300',
    orange: 'bg-orange-100 text-orange-800 border-orange-300',
    yellow: 'bg-yellow-100 text-yellow-800 border-yellow-300',
    purple: 'bg-purple-100 text-purple-800 border-purple-300',
    blue: 'bg-blue-100 text-blue-800 border-blue-300'
  }
  return colorMap[color]
}

/**
 * Get OCB score badge color class based on score
 */
export function getOCBBadgeColor(ocbScore: number): string {
  if (ocbScore < 25) return 'bg-green-100 text-green-800'
  if (ocbScore < 50) return 'bg-yellow-100 text-yellow-800'
  if (ocbScore < 75) return 'bg-orange-100 text-orange-800'
  return 'bg-red-100 text-red-800'
}

/**
 * Get Tailwind color classes for OCB badge (with borders for outlined variant)
 */
export function getOCBBadgeColorClasses(ocbScore: number): string {
  if (ocbScore < 25) return 'bg-green-100 text-green-800 border-green-300'
  if (ocbScore < 50) return 'bg-yellow-100 text-yellow-800 border-yellow-300'
  if (ocbScore < 75) return 'bg-orange-100 text-orange-800 border-orange-300'
  return 'bg-red-100 text-red-800 border-red-300'
}

/**
 * Get contribution display text for a member based on metric type
 */
export function getContributionText(member: any, metricType: MetricType): string {
  switch (metricType) {
    case 'after_hours': {
      const commits = member.github_activity?.after_hours_commits || 0
      const total = member.github_activity?.commits_count || 1
      const percent = ((commits / total) * 100).toFixed(0)
      return `${commits} commits (${percent}% after-hours)`
    }

    case 'high_commits':
      return `${member.github_activity?.commits_count || 0} total commits`

    case 'code_reviews':
      return `${member.github_activity?.reviews_count || 0} code reviews`

    case 'pull_requests':
      return `${member.github_activity?.pull_requests_count || 0} pull requests`

    default:
      return ''
  }
}

/**
 * Get affected members for all metrics
 * Returns array of metric objects with labels and affected members
 */
export interface MetricWithMembers {
  metricType: MetricType
  label: string
  members: MemberWithContribution[]
}

export function getAllMetricsAffectedMembers(members: any[]): MetricWithMembers[] {
  return [
    {
      metricType: 'high_commits',
      label: 'High Commit Volume',
      members: getAffectedMembers(members, 'high_commits')
    },
    {
      metricType: 'pull_requests',
      label: 'High Pull Request Activity',
      members: getAffectedMembers(members, 'pull_requests')
    },
    {
      metricType: 'code_reviews',
      label: 'High Code Review Load',
      members: getAffectedMembers(members, 'code_reviews')
    },
    {
      metricType: 'after_hours',
      label: 'After Hours Activity',
      members: getAffectedMembers(members, 'after_hours')
    }
  ]
}
