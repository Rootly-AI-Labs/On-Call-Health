"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Sparkles } from "lucide-react"
import { useRouter } from "next/navigation"

interface AIInsightsCardProps {
  currentAnalysis: any
}

export function AIInsightsCard({ currentAnalysis }: AIInsightsCardProps) {
  const router = useRouter()

  // Only show if AI insights data exists (show even if unavailable/loading)
  const aiInsights = currentAnalysis?.analysis_data?.ai_team_insights;
  if (!aiInsights?.available) {
    return null
  }

  return (
    <Card className="mb-6 bg-gradient-to-br from-blue-50 via-white to-indigo-50 border-blue-200 shadow-sm">
      <CardHeader>
        <div className="flex items-center space-x-2">
          <CardTitle>AI Team Insights</CardTitle>
          <Badge variant="secondary" className="text-xs">AI Enhanced</Badge>
        </div>
        <CardDescription>
          Analysis generated from {currentAnalysis.analysis_data.ai_team_insights.insights?.team_size || 0} team members
        </CardDescription>
      </CardHeader>
      <CardContent className="prose prose-sm max-w-none">
        {(() => {
          const aiInsights = currentAnalysis.analysis_data.ai_team_insights.insights;

          // Check if we have LLM-generated narrative
          if (aiInsights?.llm_team_analysis) {
            return (
              <div className="space-y-4">
                <div
                  className="leading-relaxed text-gray-800"
                  dangerouslySetInnerHTML={{
                    __html: aiInsights.llm_team_analysis
                      .replace(/^### (.*?)$/gm, '<h3 class="text-lg font-semibold mt-6 mb-3">$1</h3>')
                      .replace(/^## (.*?)$/gm, '<h2 class="text-xl font-bold mt-6 mb-4">$1</h2>')
                      .replace(/^# (.*?)$/gm, '<h1 class="text-2xl font-bold mt-6 mb-4">$1</h1>')
                      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                      .replace(/\n\n/g, '</p><p class="mt-4">')
                      .replace(/^(?!<h[123]|<p)/, '<p>')
                      .replace(/(?<!>)$/, '</p>')
                  }}
                />
              </div>
            );
          }

          // No LLM-generated content available
          const isAnalysisRunning = currentAnalysis?.status === 'running' || currentAnalysis?.status === 'pending';

          if (isAnalysisRunning) {
            return (
              <div className="text-center py-12 text-gray-500">
                <Sparkles className="h-10 w-10 mx-auto mb-4 opacity-40 animate-pulse" />
                <h4 className="font-medium text-gray-700 mb-2">Generating AI Insights</h4>
                <p className="text-sm">AI analysis is being generated...</p>
              </div>
            )
          } else {
            return (
              <div className="text-center py-12 text-gray-500">
                <Sparkles className="h-10 w-10 mx-auto mb-4 opacity-40" />
                <h4 className="font-medium text-gray-700 mb-2">No AI Insights Generated</h4>
                <p className="text-sm">Run a new analysis to generate AI insights</p>
              </div>
            )
          }
        })()}
      </CardContent>
    </Card>
  )
}