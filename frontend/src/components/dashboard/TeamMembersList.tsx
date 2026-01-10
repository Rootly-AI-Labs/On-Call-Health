"use client"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ChevronDown, ChevronRight, Users, Loader2 } from "lucide-react"
import { useState } from "react"

interface TeamMembersListProps {
  currentAnalysis: any
  setSelectedMember: (member: any) => void
  getRiskColor: (riskLevel: string) => string
  getProgressColor: (riskLevel: string) => string
}

export function TeamMembersList({
  currentAnalysis,
  setSelectedMember,
  getRiskColor,
  getProgressColor
}: TeamMembersListProps) {
  const [showMembersWithoutIncidents, setShowMembersWithoutIncidents] = useState(false);
  
  // Check if data is still loading
  const isLoading = !currentAnalysis || !currentAnalysis.analysis_data;


  // Official OCB 4-color system for progress bars (0-100 scale, higher = more burnout)
  const getOCBProgressColor = (score: number) => {
    const clampedScore = Math.max(0, Math.min(100, score));
    
    if (clampedScore < 25) return '#10b981';      // Green - Low/minimal burnout (0-24)
    if (clampedScore < 50) return '#eab308';      // Yellow - Mild burnout symptoms (25-49)  
    if (clampedScore < 75) return '#f97316';      // Orange - Moderate/significant burnout (50-74)
    return '#dc2626';                             // Red - High/severe burnout (75-100)
  };

  // Official OCB 4-color system for text/badges
  const getOCBTextColor = (score: number) => {
    if (score < 25) return '#10b981';       // Green - Low/minimal burnout
    if (score < 50) return '#eab308';       // Yellow - Mild burnout symptoms
    if (score < 75) return '#f97316';       // Orange - Moderate/significant burnout  
    return '#dc2626';                       // Red - High/severe burnout
  };

  const renderMemberCard = (member: any) => (
    <Card
      key={member.user_id}
      className="cursor-pointer hover:shadow-md transition-shadow"
      onClick={() => setSelectedMember({
        id: member.user_id || '',
        name: member.user_name || 'Unknown',
        email: member.user_email || '',
        burnoutScore: member.ocb_score || 0, // Use OCH risk level directly
        riskLevel: (member.risk_level || 'low') as 'high' | 'medium' | 'low',
        trend: 'stable' as const,
        incidentsHandled: member.incident_count || 0,
        avgResponseTime: `${Math.round(member.metrics?.avg_response_time_minutes || 0)}m`,
        factors: {
          workload: Math.round(((member.factors?.workload || (member as any).key_metrics?.incidents_per_week || 0)) * 10) / 10,
          afterHours: Math.round(((member.factors?.after_hours || (member as any).key_metrics?.after_hours_percentage || 0)) * 10) / 10,
          weekendWork: Math.round(((member.factors?.weekend_work || 0)) * 10) / 10,
          incidentLoad: Math.round(((member.factors?.incident_load || (member as any).key_metrics?.incidents_per_week || 0)) * 10) / 10,
          responseTime: Math.round(((member.factors?.response_time || (member as any).key_metrics?.avg_resolution_hours || 0)) * 10) / 10,
        },
        metrics: member.metrics || {},
        github_activity: member.github_activity || null,
        slack_activity: member.slack_activity || null
      })}
    >
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-3">
            <Avatar>
              <AvatarFallback>
                {member.user_name
                  .split(" ")
                  .map((n) => n[0])
                  .join("")}
              </AvatarFallback>
            </Avatar>
            <div>
              <h3 className="font-medium">{member.user_name}</h3>
              <p className="text-sm text-gray-500">{member.user_email}</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            {member.is_oncall && (
              <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-300">
                ON-CALL
              </Badge>
            )}
          </div>
        </div>
        
        {/* Integration icons - show based on user mappings */}
        <div className="flex flex-wrap gap-2 mb-3">
          {/* GitHub - show if user has GitHub mapping */}
          {member.github_username && (
            <div className="flex items-center justify-center w-6 h-6 bg-gray-100 rounded-full border border-gray-200" title="GitHub">
              <svg className="w-3.5 h-3.5 text-gray-700" fill="currentColor" viewBox="0 0 24 24">
                <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"/>
              </svg>
            </div>
          )}

          {/* Slack - show if user has Slack mapping */}
          {member.slack_user_id && (
            <div className="flex items-center justify-center w-6 h-6 bg-white rounded-full border border-gray-200" title="Slack">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
                {/* Official Slack logo pattern */}
                <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52z" fill="#E01E5A"/>
                <path d="M6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313z" fill="#E01E5A"/>
                <path d="M8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834z" fill="#36C5F0"/>
                <path d="M8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312z" fill="#36C5F0"/>
                <path d="M18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834z" fill="#2EB67D"/>
                <path d="M17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312z" fill="#2EB67D"/>
                <path d="M15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52z" fill="#ECB22E"/>
                <path d="M15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z" fill="#ECB22E"/>
              </svg>
            </div>
          )}

          {/* Jira - show if user has Jira mapping */}
          {member.jira_account_id && (
            <div className="flex items-center justify-center w-6 h-6 bg-blue-50 rounded-full border border-blue-200" title="Jira">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
                <path d="M11.571 11.513H0a5.218 5.218 0 0 0 5.232 5.215h2.13v2.057A5.215 5.215 0 0 0 12.575 24V12.518a1.005 1.005 0 0 0-1.005-1.005zm5.723-5.756H5.736a5.215 5.215 0 0 0 5.215 5.214h2.129v2.058a5.218 5.218 0 0 0 5.215 5.214V6.758a1.001 1.001 0 0 0-1.001-1.001zM23.013 0H11.455a5.215 5.215 0 0 0 5.215 5.215h2.129v2.057A5.215 5.215 0 0 0 24 12.483V1.005A1.001 1.001 0 0 0 23.013 0z" fill="#2684FF"/>
              </svg>
            </div>
          )}

          {/* Linear - show if user has Linear mapping */}
          {member.linear_user_id && (
            <div className="flex items-center justify-center w-6 h-6 bg-purple-50 rounded-full border border-purple-200" title="Linear">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
                <path d="M0 0h24v24H0V0z" fill="none"/>
                <path d="M2.5 21.5l19-19M5.5 21.5l16-16M8.5 21.5l13-13M11.5 21.5l10-10M14.5 21.5l7-7M17.5 21.5l4-4" stroke="#5E6AD2" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </div>
          )}

          {/* Survey - show if user has survey data */}
          {currentAnalysis?.analysis_data?.member_surveys?.[member.user_email] && (
            <div className="flex items-center justify-center w-6 h-6 bg-blue-50 rounded-full border border-blue-200" title="Survey Data Available">
              <svg className="w-3.5 h-3.5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
          )}
        </div>

        <div className="space-y-2">
          {member?.ocb_score !== undefined ? (
            <div className="flex justify-between items-center text-sm">
              <span>Risk Level</span>
              {(() => {
                const getOCBRiskLevel = (ocb_score: number): string => {
                  if (ocb_score < 25) return 'healthy';
                  if (ocb_score < 50) return 'fair';
                  if (ocb_score < 75) return 'poor';
                  return 'critical';
                };

                const riskLevel = getOCBRiskLevel(member.ocb_score);
                const displayLabel = riskLevel === 'healthy' ? 'HEALTHY' :
                                   riskLevel === 'fair' ? 'FAIR' :
                                   riskLevel === 'poor' ? 'POOR' :
                                   'CRITICAL';

                return <Badge className={getRiskColor(riskLevel)}>{displayLabel}</Badge>;
              })()}
            </div>
          ) : (
            <div className="flex justify-between text-sm">
              <span>No Risk Level Available</span>
              <span className="font-medium text-gray-500">-</span>
            </div>
          )}
          <div className="relative h-2 w-full overflow-hidden rounded-full bg-gray-200">
            <div 
              className="h-full transition-all"
              style={{ 
                width: `${member?.ocb_score || 0}%`,
                backgroundColor: member?.ocb_score !== undefined 
                  ? getOCBProgressColor(member.ocb_score)
                  : undefined
              }}
            />
          </div>
          <div className="flex justify-between text-xs text-gray-500">
            <span>{member.incident_count} incidents</span>
            <span>
              {member.github_activity?.commits_count ? (
                <>
                  {member.github_activity.commits_count} commits
                  {member.github_activity.commits_per_week && ` (${member.github_activity.commits_per_week.toFixed(1)}/week)`}
                </>
              ) : (
                'No GitHub data'
              )}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  )

  return (
    <>
      {/* Organization Members Grid */}
      <Card>
        <CardHeader>
          <CardTitle>Team Overview</CardTitle>
          <CardDescription>Click on a member to view detailed analysis</CardDescription>
        </CardHeader>
        <CardContent>
          {(() => {
            const teamAnalysis = currentAnalysis?.analysis_data?.team_analysis
            const allMembers = Array.isArray(teamAnalysis) ? teamAnalysis : teamAnalysis?.members
            
            if (!allMembers || allMembers.length === 0) {
              return (
                <div className="text-center text-gray-500 py-8">
                  No organization member data available yet
                </div>
              )
            }
            
            // Filter members with valid scores
            const validMembers = allMembers.filter((member) => {
              return member.ocb_score !== undefined && member.ocb_score !== null
            })
            
            // Separate members with incidents/burnout and those with neither
            // Include members with incidents OR OCH risk level (e.g., from Jira) in main section
            const membersWithIncidents = validMembers.filter(member =>
              (member.incident_count || 0) > 0 || (member.ocb_score || 0) > 0
            )
            // Only hide members with BOTH zero incidents AND zero OCH risk level
            const membersWithoutIncidents = validMembers.filter(member =>
              (member.incident_count || 0) === 0 && (member.ocb_score || 0) === 0
            )

            
            // Sort members by score (highest risk first)
            const sortMembers = (members: any[]) => members.sort((a, b) => {
              // Sort by OCH risk level only (higher score = higher risk)
              return (b.ocb_score || 0) - (a.ocb_score || 0);
            })

            return (
              <>
                {/* Members with incidents or burnout (from Jira, GitHub, etc.) */}
                {membersWithIncidents.length > 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                    {sortMembers(membersWithIncidents).map(renderMemberCard)}
                  </div>
                )}

                {/* Collapsible section for members with no activity (no incidents and no burnout) */}
                {(membersWithoutIncidents.length > 0 || isLoading) && (
                  <div className="mt-6">
                    <Button
                      variant="outline" 
                      onClick={() => setShowMembersWithoutIncidents(!showMembersWithoutIncidents)}
                      className="w-full mb-4 text-gray-600 border-gray-300 hover:bg-gray-50"
                      disabled={isLoading}
                    >
                      <div className="flex items-center justify-center space-x-2">
                        {isLoading ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          showMembersWithoutIncidents ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />
                        )}
                        <Users className="w-4 h-4" />
                        <span>
                          {isLoading ? (
                            'Loading team members...'
                          ) : (
                            <>
                              {showMembersWithoutIncidents ? 'Hide' : 'Show'} team members with no activity
                              <span className="ml-1 text-xs bg-gray-200 px-2 py-1 rounded">
                                {membersWithoutIncidents.length}
                              </span>
                            </>
                          )}
                        </span>
                      </div>
                    </Button>

                    {showMembersWithoutIncidents && !isLoading && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {sortMembers(membersWithoutIncidents).map(renderMemberCard)}
                      </div>
                    )}
                  </div>
                )}

                {/* No members case */}
                {membersWithIncidents.length === 0 && membersWithoutIncidents.length === 0 && (
                  <div className="text-center text-gray-500 py-8">
                    No team members with valid burnout data found
                  </div>
                )}
              </>
            )
          })()}
        </CardContent>
      </Card>
    </>
  )
}