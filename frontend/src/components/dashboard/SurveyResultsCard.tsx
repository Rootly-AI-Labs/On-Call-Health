"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { useState, useEffect } from "react"
import { Loader2, TrendingUp, TrendingDown, Minus } from "lucide-react"

interface SurveyResult {
  id: number
  feeling_score: number
  workload_score: number
  feeling_text: string
  workload_text: string
  risk_level: string
  additional_comments: string | null
  submitted_via: string
  submitted_at: string
}

interface SurveyResultsCardProps {
  userId: number
  userEmail: string
  days?: number
}

const getRiskColor = (riskLevel: string) => {
  switch (riskLevel) {
    case 'healthy': return 'bg-green-500'
    case 'fair': return 'bg-yellow-500'
    case 'poor': return 'bg-orange-500'
    case 'critical': return 'bg-red-500'
    default: return 'bg-gray-500'
  }
}

const getScoreTrend = (current: number, previous: number) => {
  if (current > previous) return <TrendingUp className="w-4 h-4 text-green-500" />
  if (current < previous) return <TrendingDown className="w-4 h-4 text-red-500" />
  return <Minus className="w-4 h-4 text-gray-400" />
}

export function SurveyResultsCard({ userId, userEmail, days = 30 }: SurveyResultsCardProps) {
  const [results, setResults] = useState<SurveyResult[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchSurveyResults = async () => {
      try {
        const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
        const response = await fetch(
          `${API_BASE}/api/surveys/user/${userId}/results?days=${days}`,
          {
            headers: {
              'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
              'Content-Type': 'application/json'
            }
          }
        )

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }

        const data = await response.json()
        setResults(data.results || [])
      } catch (err) {
        console.error('Error fetching survey results:', err)
        setError(err instanceof Error ? err.message : 'Failed to load survey results')
      } finally {
        setLoading(false)
      }
    }

    fetchSurveyResults()
  }, [userId, days])

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Health Check-ins</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Health Check-ins</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-red-500">{error}</p>
        </CardContent>
      </Card>
    )
  }

  if (results.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Health Check-ins</CardTitle>
          <CardDescription>Last {days} days</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-500">No survey responses yet</p>
        </CardContent>
      </Card>
    )
  }

  const latestResult = results[0]
  const previousResult = results[1]

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Latest Check-in</CardTitle>
          <CardDescription>
            {new Date(latestResult.submitted_at).toLocaleString()}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Overall Health</span>
            <Badge className={getRiskColor(latestResult.risk_level)}>
              {latestResult.risk_level}
            </Badge>
          </div>

          <Separator />

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm">How they're feeling</span>
                {previousResult && getScoreTrend(latestResult.feeling_score, previousResult.feeling_score)}
              </div>
              <div className="text-right">
                <div className="font-medium">{latestResult.feeling_text}</div>
                <div className="text-xs text-gray-500">{latestResult.feeling_score}/5</div>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm">Workload</span>
                {previousResult && getScoreTrend(latestResult.workload_score, previousResult.workload_score)}
              </div>
              <div className="text-right">
                <div className="font-medium">{latestResult.workload_text}</div>
                <div className="text-xs text-gray-500">{latestResult.workload_score}/5</div>
              </div>
            </div>
          </div>

          {latestResult.additional_comments && (
            <>
              <Separator />
              <div>
                <div className="text-sm font-medium mb-1">Comments</div>
                <p className="text-sm text-gray-600">{latestResult.additional_comments}</p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {results.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Recent History ({results.length} responses)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {results.slice(1, 5).map((result) => (
                <div key={result.id} className="flex items-center justify-between text-sm py-2 border-b last:border-0">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${getRiskColor(result.risk_level)}`} />
                    <span className="text-xs text-gray-500">
                      {new Date(result.submitted_at).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="flex gap-4 text-xs">
                    <span>Feeling: {result.feeling_score}/5</span>
                    <span>Workload: {result.workload_score}/5</span>
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
