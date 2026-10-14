"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
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

  // Check if AI insights data exists
  const aiInsights = currentAnalysis?.analysis_data?.ai_team_insights;
  const aiEnhanced = currentAnalysis?.analysis_data?.ai_enhanced;
  const hasAIData = aiInsights?.available;

  const insightsData = aiInsights?.insights;
  const hasContent = insightsData?.llm_team_analysis;

  return (
    <>
      <Card className="border border-neutral-300 flex flex-col h-full min-h-[200px]">
        <CardHeader className="pb-1 md:pb-2 px-2 md:px-4 py-2 md:py-3">
          <CardTitle className="text-xs md:text-base font-medium text-blue-700 flex items-center space-x-1 md:space-x-2">
            <Sparkles className="w-3 md:w-4 h-3 md:h-4" />
            <span>AI Team Insights</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex-1 flex flex-col pb-0 px-2 md:px-4 py-2 md:py-3">
          {(() => {
            if (!aiEnhanced && !hasAIData) {
              return (
                <div className="text-center py-2 md:py-4 text-neutral-500">
                  <Sparkles className="h-6 md:h-8 w-6 md:w-8 mx-auto mb-2 md:mb-3 opacity-30" />
                  <p className="text-[10px] md:text-sm font-medium text-neutral-700 mb-0.5 md:mb-1">AI Insights Not Enabled</p>
                  <p className="text-[9px] md:text-xs">Enable AI in analysis settings to generate insights</p>
                </div>
              )
            }

            // Check if we have LLM-generated narrative
            if (hasContent) {
              const summaryText = getTextAfterSummary(insightsData.llm_team_analysis);

              return (
                <div className="flex flex-col h-full pt-0.5 md:pt-1 pb-0 -mb-1">
                  <div className="mb-1 md:mb-2 overflow-hidden">
                    <p className="text-[10px] md:text-sm text-neutral-700 leading-relaxed md:leading-5 line-clamp-6">
                      {summaryText}
                    </p>
                  </div>
                  <div className="mt-auto flex justify-end pt-0 pb-2 md:pb-3">
                    <button
                      onClick={() => setIsModalOpen(true)}
                      className="text-[9px] md:text-xs text-blue-600 hover:text-blue-700 hover:underline flex items-center space-x-0.5 md:space-x-1 cursor-pointer"
                    >
                      <span>View more</span>
                      <ChevronRight className="w-2.5 md:w-3 h-2.5 md:h-3" />
                    </button>
                  </div>
                </div>
              );
            }

            // No LLM-generated content available
            const isAnalysisRunning = currentAnalysis?.status === 'running' || currentAnalysis?.status === 'pending';

            if (isAnalysisRunning) {
              return (
                <div className="text-center py-2 md:py-4 text-neutral-500">
                  <Sparkles className="h-6 md:h-8 w-6 md:w-8 mx-auto mb-2 md:mb-3 opacity-40 animate-pulse" />
                  <p className="text-[10px] md:text-sm font-medium text-neutral-700 mb-0.5 md:mb-1">Generating AI Insights</p>
                  <p className="text-[9px] md:text-xs">AI analysis is being generated...</p>
                </div>
              )
            } else {
              return (
                <div className="text-center py-2 md:py-4 text-neutral-500">
                  <Sparkles className="h-6 md:h-8 w-6 md:w-8 mx-auto mb-2 md:mb-3 opacity-40" />
                  <p className="text-[10px] md:text-sm font-medium text-neutral-700 mb-0.5 md:mb-1">No AI Insights</p>
                  <p className="text-[9px] md:text-xs">Run a new analysis to generate insights</p>
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