
export interface Integration {
  id: number
  name: string
  organization_name: string
  total_users: number
  is_default: boolean
  created_at: string
  last_used_at: string | null
  token_suffix: string
  platform?: 'rootly' | 'pagerduty'
  permissions?: {
    users?: {
      access: boolean
    }
    incidents?: {
      access: boolean
    }
  }
}

export interface GitHubIntegration {
  id: number
  github_username: string
  organizations: string[]
  token_source: string
  connected_at: string
  last_updated: string
}

export interface SlackIntegration {
  id: number
  slack_user_id: string
  workspace_id: string
  token_source: string
  connected_at: string
  last_updated: string
  total_channels?: number
  survey_enabled?: boolean
  communication_patterns_enabled?: boolean
  granted_scopes?: string
}

export interface JiraIntegration {
  id: number
  jira_workspace_id: string
  jira_username: string
  token_source: string
  connected_at: string
  last_updated: string
}

export interface OrganizationMember {
  id: string
  name: string
  email: string
  role?: string
  avatar?: string
  cbiScore: number // CBI score (0-100)
  cbi_score?: number // API returns snake_case
  riskLevel: 'critical' | 'poor' | 'fair' | 'healthy' // CBI-based risk levels
  trend: 'up' | 'down' | 'stable'
  incidentsHandled: number
  incident_count?: number // API returns this
  avgResponseTime: string
  factors: {
    workload: number
    afterHours: number
    weekendWork: number
    incidentLoad: number
    responseTime: number
    // Snake case versions from API
    after_hours?: number
    weekend_work?: number
    incident_load?: number
    response_time?: number
  }
  metrics?: {
    avg_response_time_minutes: number
    after_hours_percentage: number
    weekend_percentage: number
    status_distribution?: any
  }
  github_activity?: {
    commits_count: number
    pull_requests_count: number
    reviews_count: number
    after_hours_commits: number
    weekend_commits: number
    avg_pr_size: number
    burnout_indicators: {
      excessive_commits: boolean
      late_night_activity: boolean
      weekend_work: boolean
      large_prs: boolean
    }
  }
  slack_activity?: {
    messages_sent: number
    channels_active: number
    after_hours_messages: number
    weekend_messages: number
    avg_response_time_minutes: number
    sentiment_score: number
    burnout_indicators: {
      excessive_messaging: boolean
      poor_sentiment: boolean
      late_responses: boolean
      after_hours_activity: boolean
    }
  }
  github_burnout_breakdown?: {
    exhaustion_score: number
    depersonalization_score: number
    accomplishment_score: number
    final_score: number
  }
  // Additional fields from API response
  user_id?: string
  user_name?: string
  user_email?: string
  risk_level?: string
}

export interface AnalysisResult {
  id: string
  uuid?: string
  integration_id: number
  created_at: string
  status: string
  time_range: number
  error_message?: string
  organizationName?: string // For display purposes
  timeRange?: string // For display purposes
  overallScore?: number // For display purposes
  trend?: "up" | "down" | "stable" // For display purposes
  atRiskCount?: number // For display purposes
  totalMembers?: number // For display purposes
  lastAnalysis?: string // For display purposes
  trends?: {
    daily: Array<{ date: string; score: number }>
    weekly: Array<{ week: string; score: number }>
    monthly: Array<{ month: string; score: number }>
  } // For display purposes
  organizationMembers?: OrganizationMember[] // For display purposes
  burnoutFactors?: Array<{ factor: string; value: number }> // For display purposes
  analysis_data?: {
    data_sources: {
      incident_data: boolean
      github_data: boolean
      slack_data: boolean
      github_users_analyzed?: number
      slack_users_analyzed?: number
    }
    team_health: {
      overall_score: number
      risk_distribution: {
        low: number
        medium: number
        high: number
        critical: number
      }
      health_status: string
      data_source_contributions?: {
        incident_contribution: number
        github_contribution: number
        slack_contribution: number
      }
    }
    team_summary?: {
      total_users: number
      average_score: number
      highest_score: number
      risk_distribution: {
        high: number
        medium: number
        low: number
        critical: number
      }
      users_at_risk: number
    }
    team_analysis: {
      members: Array<{
        user_id: string
        user_name: string
        user_email: string
        cbi_score: number  // CBI score (0-100)
        risk_level?: string // Optional legacy field
        factors: {
          workload: number
          after_hours: number
          weekend_work: number
          incident_load: number
          response_time: number
        }
        incident_count: number
        metrics: {
          avg_response_time_minutes: number
          after_hours_percentage: number
          weekend_percentage: number
          status_distribution?: any
        }
        github_activity?: any
        slack_activity?: any
      }>
    } | Array<{
      user_id: string
      user_name: string
      user_email: string
      cbi_score: number  // CBI score (0-100)
      risk_level?: string // Optional legacy field
      incident_count: number
      key_metrics?: {
        incidents_per_week: number
        severity_weighted_per_week?: number
        after_hours_percentage: number
        avg_resolution_hours: number
      }
      recommendations?: string[]
      factors?: any
      metrics?: any
      github_activity?: any
      slack_activity?: any
    }>
    github_insights?: {
      total_commits: number
      total_pull_requests: number
      total_reviews: number
      after_hours_activity_percentage: number
      weekend_activity_percentage?: number
      weekend_commit_percentage?: number
      top_contributors: Array<{
        username: string
        commits: number
        prs: number
        reviews: number
      }>
      burnout_indicators: {
        excessive_late_night_commits: number
        large_pr_pattern: number
        weekend_workers: number
      }
      activity_data?: {
        commits_count: number
        pull_requests_count: number
        reviews_count: number
        after_hours_commits: number
        weekend_commits: number
        avg_pr_size: number
      }
    }
    slack_insights?: {
      total_messages: number
      active_channels: number
      avg_response_time_minutes: number
      after_hours_activity_percentage: number
      weekend_activity_percentage?: number
      weekend_commit_percentage?: number
      weekend_percentage?: number
      sentiment_analysis: {
        avg_sentiment: number
        negative_sentiment_users: number
      }
      burnout_indicators: {
        excessive_messaging: number
        poor_sentiment_users: number
        after_hours_communicators: number
      }
    }
    insights: Array<{
      type: string
      message: string
      severity: string
      source?: 'incident' | 'github' | 'slack' | 'combined'
    }>
    recommendations: Array<{
      type: string
      message: string
      priority: string
      source?: 'incident' | 'github' | 'slack' | 'combined'
    }>
    partial_data?: {
      users: Array<any>
      incidents: Array<any>
      metadata: any
    }
    error?: string
    data_collection_successful?: boolean
    failure_stage?: string
    session_hours?: number
    total_incidents?: number
    ai_team_insights?: {
      available: boolean
      summary?: string
      recommendations?: string[]
      key_insights?: string[]
      insights?: {
        team_size?: number
        risk_distribution?: {
          high: number
          medium: number
          low: number
          critical?: number
        }
        [key: string]: any
      }
    }
    daily_trends?: Array<{
      date: string
      overall_score: number
      incident_count: number
      severity_weighted_count: number
      after_hours_count: number
      users_involved: number
      members_at_risk: number
      total_members: number
      health_status: string
    }>
    period_summary?: {
      average_score: number
      days_analyzed: number
      total_days_with_data: number
    }
  }
}

export type AnalysisStage = "loading" | "connecting" | "fetching_users" | "fetching" | "fetching_github" | "fetching_slack" | "calculating" | "analyzing" | "preparing" | "complete"

