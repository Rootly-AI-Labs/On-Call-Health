"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { TrendingUp, TrendingDown, Minus, MessageSquare } from "lucide-react"

interface SurveyResponse {
  feeling_score: number
  workload_score: number
  combined_score: number
  submitted_at: string
  stress_factors?: string[]
  personal_circumstances?: string
  additional_comments?: string
  submitted_via?: string
}

interface SurveyData {
  survey_count_in_period: number
  latest_feeling_score: number
  latest_workload_score: number
  latest_combined_score: number
  trend: 'improving' | 'stable' | 'declining'
  survey_responses: SurveyResponse[]
}

interface SurveyResultsCardProps {
  surveyData: SurveyData | null
  userEmail: string
}

const getScoreColor = (score: number) => {
  if (score >= 4) return 'text-green-600'
  if (score >= 3) return 'text-yellow-600'
  if (score >= 2) return 'text-orange-600'
  return 'text-red-600'
}

const getScoreBadgeColor = (score: number) => {
  if (score >= 4) return 'bg-green-100 text-green-800'
  if (score >= 3) return 'bg-yellow-100 text-yellow-800'
  if (score >= 2) return 'bg-orange-100 text-orange-800'
  return 'bg-red-100 text-red-800'
}

const getTrendIcon = (trend: string) => {
  if (trend === 'improving') return <TrendingUp className="w-4 h-4 text-green-500" />
  if (trend === 'declining') return <TrendingDown className="w-4 h-4 text-red-500" />
  return <Minus className="w-4 h-4 text-gray-400" />
}

const getFeelingText = (score: number) => {
  if (score === 5) return 'Very good'
  if (score === 4) return 'Good'
  if (score === 3) return 'Okay'
  if (score === 2) return 'Not great'
  return 'Struggling'
}

const getWorkloadText = (score: number) => {
  if (score === 5) return 'Very manageable'
  if (score === 4) return 'Manageable'
  if (score === 3) return 'Moderate'
  if (score === 2) return 'Heavy'
  return 'Overwhelming'
}

export function SurveyResultsCard({ surveyData, userEmail }: SurveyResultsCardProps) {
  console.log('SurveyResultsCard - userEmail:', userEmail, 'surveyData:', surveyData);

  if (!surveyData || surveyData.survey_count_in_period === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Health Check-ins</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-500">No survey responses in this analysis period</p>
        </CardContent>
      </Card>
    )
  }

  const latestResponse = surveyData.survey_responses[surveyData.survey_responses.length - 1]
  const previousResponse = surveyData.survey_responses.length > 1
    ? surveyData.survey_responses[surveyData.survey_responses.length - 2]
    : null

  return (
    <div className="space-y-4">
      {/* Latest Check-in Summary */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">Latest Check-in</CardTitle>
            <div className="flex items-center gap-2">
              {getTrendIcon(surveyData.trend)}
              <span className="text-xs text-gray-500 capitalize">{surveyData.trend}</span>
            </div>
          </div>
          <CardDescription>
            {new Date(latestResponse.submitted_at).toLocaleString()} via {latestResponse.submitted_via || 'web'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <span className="text-xs text-gray-500">How they're feeling</span>
              <div className="flex items-center gap-2">
                <Badge className={getScoreBadgeColor(latestResponse.feeling_score)}>
                  {latestResponse.feeling_score}/5
                </Badge>
                <span className="text-sm font-medium">{getFeelingText(latestResponse.feeling_score)}</span>
              </div>
            </div>

            <div className="space-y-1">
              <span className="text-xs text-gray-500">Workload</span>
              <div className="flex items-center gap-2">
                <Badge className={getScoreBadgeColor(latestResponse.workload_score)}>
                  {latestResponse.workload_score}/5
                </Badge>
                <span className="text-sm font-medium">{getWorkloadText(latestResponse.workload_score)}</span>
              </div>
            </div>
          </div>

          {latestResponse.stress_factors && latestResponse.stress_factors.length > 0 && (
            <>
              <Separator />
              <div>
                <div className="text-xs font-medium text-gray-700 mb-2">Stress Factors</div>
                <div className="flex flex-wrap gap-1">
                  {latestResponse.stress_factors.map((factor, index) => (
                    <Badge key={index} variant="outline" className="text-xs">
                      {factor}
                    </Badge>
                  ))}
                </div>
              </div>
            </>
          )}

          {latestResponse.personal_circumstances && (
            <>
              <Separator />
              <div>
                <div className="text-xs font-medium text-gray-700 mb-1">Personal Circumstances Impact</div>
                <p className="text-sm text-gray-600">{latestResponse.personal_circumstances}</p>
              </div>
            </>
          )}

          {latestResponse.additional_comments && (
            <>
              <Separator />
              <div>
                <div className="flex items-center gap-1 text-xs font-medium text-gray-700 mb-1">
                  <MessageSquare className="w-3 h-3" />
                  <span>Comments</span>
                </div>
                <p className="text-sm text-gray-600">{latestResponse.additional_comments}</p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Response History */}
      {surveyData.survey_responses.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Response History</CardTitle>
            <CardDescription>{surveyData.survey_count_in_period} responses in analysis period</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {surveyData.survey_responses.slice().reverse().slice(1, 6).map((response, index) => (
                <div key={index} className="flex items-center justify-between text-sm py-2 border-b last:border-0">
                  <span className="text-xs text-gray-500">
                    {new Date(response.submitted_at).toLocaleDateString()}
                  </span>
                  <div className="flex gap-4 text-xs">
                    <span className={getScoreColor(response.feeling_score)}>
                      Feeling: {response.feeling_score}/5
                    </span>
                    <span className={getScoreColor(response.workload_score)}>
                      Workload: {response.workload_score}/5
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
