"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Sparkles, ChevronRight } from "lucide-react"
import { useState } from "react"
import { AIInsightsModal } from "./AIInsightsModal"

interface AIInsightsCardProps {
  currentAnalysis: any
}

// Helper function to extract text after "Summary" section
function getTextAfterSummary(html: string): string {
  // Remove HTML tags and get plain text
  const text = html
    .replace(/<[^>]*>/g, '')
    .replace(/\n\n+/g, ' ')
    .trim();

  // Try to find "Summary" header and extract text after it
  const summaryMatch = text.match(/(?:##?\s*)?Summary[\s:]*([\s\S]+?)(?=(?:##?\s*[A-Z])|$)/i);

  if (summaryMatch && summaryMatch[1]) {
    return summaryMatch[1].trim();
  }

  // If no Summary section found, return the beginning of the text
  return text;
}

export function AIInsightsCard({ currentAnalysis }: AIInsightsCardProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Only show if AI insights data exists (show even if unavailable/loading)
  const aiInsights = currentAnalysis?.analysis_data?.ai_team_insights;
  if (!aiInsights?.available) {
    return null
  }

  const insightsData = currentAnalysis.analysis_data.ai_team_insights.insights;
  const hasContent = insightsData?.llm_team_analysis;

  return (
    <>
      <Card className="flex flex-col h-[400px]">
        <CardHeader>
          <div className="flex items-center space-x-2">
            <Sparkles className="w-5 h-5 text-blue-600" />
            <CardTitle className="text-lg">AI Team Insights</CardTitle>
          </div>
          <CardDescription>
            AI-generated analysis
          </CardDescription>
        </CardHeader>
        <CardContent className="flex-1 flex flex-col">
          {(() => {
            // Check if we have LLM-generated narrative
            if (hasContent) {
              const summaryText = getTextAfterSummary(insightsData.llm_team_analysis);

              return (
                <div className="flex flex-col h-full">
                  <div className="flex-1 mb-4 overflow-hidden">
                    <p className="text-base text-gray-700 leading-relaxed line-clamp-[12]">
                      {summaryText}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsModalOpen(true)}
                    className="w-full mt-auto"
                  >
                    View Full Insights
                    <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                </div>
              );
            }

            // No LLM-generated content available
            const isAnalysisRunning = currentAnalysis?.status === 'running' || currentAnalysis?.status === 'pending';

            if (isAnalysisRunning) {
              return (
                <div className="text-center py-8 text-gray-500">
                  <Sparkles className="h-8 w-8 mx-auto mb-3 opacity-40 animate-pulse" />
                  <p className="text-sm font-medium text-gray-700 mb-1">Generating AI Insights</p>
                  <p className="text-xs">AI analysis is being generated...</p>
                </div>
              )
            } else {
              return (
                <div className="text-center py-8 text-gray-500">
                  <Sparkles className="h-8 w-8 mx-auto mb-3 opacity-40" />
                  <p className="text-sm font-medium text-gray-700 mb-1">No AI Insights</p>
                  <p className="text-xs">Run a new analysis to generate insights</p>
                </div>
              )
            }
          })()}
        </CardContent>
      </Card>

      <AIInsightsModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        currentAnalysis={currentAnalysis}
      />
    </>
  )
}