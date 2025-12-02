import { z } from "zod"

// Integration Mapping Types
export interface IntegrationMapping {
  id: number | string // Can be number or "manual_123" for manual mappings
  source_platform: string
  source_identifier: string
  source_name?: string  // User's full name from analysis data
  target_platform: string
  target_identifier: string | null
  mapping_successful: boolean
  mapping_method: string | null
  error_message: string | null
  data_collected: boolean
  data_points_count: number | null
  created_at: string
  mapping_key: string
  // New properties for manual mappings
  is_manual?: boolean
  source?: 'integration' | 'manual'
  mapping_type?: string
  status?: string
  confidence_score?: number
  last_verified?: string
}

export interface MappingStatistics {
  overall_success_rate: number
  total_attempts: number
  mapped_members?: number
  members_with_data?: number
  manual_mappings_count?: number
  github_was_enabled?: boolean | null
  platform_breakdown: {
    [key: string]: {
      total_attempts: number
      successful: number
      failed: number
      success_rate: number
    }
  }
}

// Analysis-specific mapping statistics
export interface AnalysisMappingStatistics {
  total_team_members: number
  successful_mappings: number
  members_with_data: number
  success_rate: number
  failed_mappings: number
}

export interface ManualMapping {
  id: number
  source_platform: string
  source_identifier: string
  target_platform: string
  target_identifier: string
  mapping_type: string
  confidence_score?: number
  last_verified?: string
  created_at: string
  updated_at?: string
  status: string
  is_verified: boolean
  mapping_key: string
}

export interface ManualMappingStatistics {
  total_mappings: number
  manual_mappings: number
  auto_detected_mappings: number
  verified_mappings: number
  verification_rate: number
  platform_breakdown: { [key: string]: { [key: string]: number } }
  last_updated?: string
}

// Core Integration Types
export interface Integration {
  id: number
  name: string
  organization_name: string
  total_users: number
  total_services?: number
  is_default: boolean
  created_at: string
  last_used_at: string | null
  token_suffix: string
  platform: "rootly" | "pagerduty"
  permissions?: {
    users: {
      access: boolean
      error: string | null
    }
    incidents: {
      access: boolean
      error: string | null
    }
  }
}

export interface GitHubIntegration {
  id: number | string
  github_username: string
  organizations: string[]
  token_source: "oauth" | "manual"
  is_oauth: boolean
  supports_refresh: boolean
  connected_at: string
  last_updated: string
  token_preview?: string // Token preview for display
}

export interface SlackIntegration {
  id: number
  slack_user_id: string | null
  workspace_id: string
  workspace_name?: string
  token_source: "oauth" | "manual"
  is_oauth: boolean
  supports_refresh: boolean
  has_webhook: boolean
  webhook_configured: boolean
  connected_at: string
  last_updated: string
  total_channels?: number
  channel_names?: string[]
  token_preview?: string
  webhook_preview?: string
  connection_type?: "oauth" | "manual"
  status?: string
  owner_user_id?: number
  survey_enabled?: boolean
  communication_patterns_enabled?: boolean
  granted_scopes?: string
}

export interface JiraIntegration {
  id: number
  jira_site_url: string
  jira_site_name?: string
  jira_cloud_id: string
  jira_account_id: string
  jira_display_name?: string
  jira_email?: string
  token_source: "oauth" | "manual"
  is_oauth: boolean
  supports_refresh: boolean
  token_expires_at?: string
  updated_at: string
  accessible_sites_count?: number
  token_preview?: string
}

export interface JiraWorkspace {
  id: string
  name: string
  url: string
  scopes: string[]
  avatarUrl?: string
  is_selected: boolean
}

export interface JiraWorkspacesResponse {
  workspaces: JiraWorkspace[]
  current_workspace_id: string | null
  total_count: number
  message?: string
}

export interface PreviewData {
  organization_name: string
  total_users: number
  total_services?: number
  suggested_name?: string
  can_add?: boolean
  current_user?: string
  permissions?: {
    users?: {
      access: boolean
      error?: string
    }
    incidents?: {
      access: boolean
      error?: string
    }
  }
}

export interface UserInfo {
  name: string
  email: string
  avatar?: string
  organization_id?: number
  id?: number
  role?: string
}

// Validation Schemas
export const rootlyFormSchema = z.object({
  rootlyToken: z.string()
    .min(1, "Rootly API token is required")
    .regex(/^rootly_[a-f0-9]{64}$/, "Invalid Rootly token format. Token should start with 'rootly_' followed by 64 hex characters"),
  nickname: z.string().optional(),
})

export const pagerdutyFormSchema = z.object({
  pagerdutyToken: z.string()
    .min(1, "PagerDuty API token is required")
    .regex(/^[A-Za-z0-9+_-]{20,32}$/, "Invalid PagerDuty token format. Token should be 20-32 characters long"),
  nickname: z.string().optional(),
})

export type RootlyFormData = z.infer<typeof rootlyFormSchema>
export type PagerDutyFormData = z.infer<typeof pagerdutyFormSchema>

// Helper functions
export const isValidRootlyToken = (token: string): boolean => {
  return /^rootly_[a-f0-9]{64}$/.test(token)
}

export const isValidPagerDutyToken = (token: string): boolean => {
  return /^[A-Za-z0-9+_-]{20,32}$/.test(token)
}

// API Base URL
export const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
