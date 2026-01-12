"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Sparkles, Copy, Check } from "lucide-react"

interface AIInsightsModalProps {
  isOpen: boolean
  onClose: () => void
  currentAnalysis: any
}

export function AIInsightsModal({ isOpen, onClose, currentAnalysis }: AIInsightsModalProps) {
  const [copied, setCopied] = useState(false)
  const aiInsights = currentAnalysis?.analysis_data?.ai_team_insights?.insights;

  const handleCopy = async () => {
    if (!aiInsights?.llm_team_analysis) return

    try {
      // Extract plain text from markdown-like content
      // Convert markdown formatting to plain text
      let plainText = aiInsights.llm_team_analysis
        // Remove markdown headers and convert to plain text with line breaks
        .replace(/^### (.*?)$/gm, '$1\n')
        .replace(/^## (.*?)$/gm, '$1\n\n')
        .replace(/^# (.*?)$/gm, '$1\n\n')
        // Remove bold markers
        .replace(/\*\*(.*?)\*\*/g, '$1')
        // Ensure proper line breaks
        .replace(/\n{3,}/g, '\n\n')
        .trim()
      
      await navigator.clipboard.writeText(plainText)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy text:', err)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        className="max-w-5xl max-h-[80vh] overflow-y-auto"
        aria-describedby="ai-insights-description"
      >
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Sparkles className="w-6 h-6 text-blue-600" />
              <DialogTitle>AI Team Insights</DialogTitle>
              <Badge variant="secondary" className="text-xs">AI Enhanced</Badge>
            </div>
            {aiInsights?.llm_team_analysis && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopy}
                className="flex items-center space-x-2"
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    <span>Copy</span>
                  </>
                )}
              </Button>
            )}
          </div>
          <DialogDescription id="ai-insights-description">
            Analysis generated from {aiInsights?.team_size || 0} team members
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4">
          {(() => {
            // Check if we have LLM-generated narrative
            if (aiInsights?.llm_team_analysis) {
              return (
                <div className="prose prose-sm max-w-none">
                  <div
                    className="leading-relaxed text-neutral-900 [&>*:last-child]:mb-0"
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
                <div className="text-center py-12 text-neutral-500">
                  <Sparkles className="h-10 w-10 mx-auto mb-4 opacity-40 animate-pulse" />
                  <h4 className="font-medium text-neutral-700 mb-2">Generating AI Insights</h4>
                  <p className="text-sm">AI analysis is being generated...</p>
                </div>
              )
            } else {
              return (
                <div className="text-center py-12 text-neutral-500">
                  <Sparkles className="h-10 w-10 mx-auto mb-4 opacity-40" />
                  <h4 className="font-medium text-neutral-700 mb-2">No AI Insights Generated</h4>
                  <p className="text-sm">Run a new analysis to generate AI insights</p>
                </div>
              )
            }
          })()}
        </div>
      </DialogContent>
    </Dialog>
  )
}
