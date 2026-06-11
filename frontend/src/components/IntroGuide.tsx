"use client"

import { X, ChevronRight, ChevronLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import Image from "next/image"

interface IntroGuideProps {
  isOpen: boolean
  currentStep: number
  onNext: () => void
  onPrev: () => void
  onClose: () => void
  onGoToStep: (step: number) => void
}

function IntroGuide({ isOpen, currentStep, onNext, onPrev, onClose, onGoToStep }: IntroGuideProps) {
  if (!isOpen) return null

  const steps = [
    {
      title: "Welcome to On-Call Health",
      description: "Go to Integrations to connect to Rootly or PagerDuty, as well as other services such as Slack, Linear, or Jira for enhanced risk analysis.",
      image: "/images/integrations-logos.png",
    },
    {
      title: "Run an Analysis",
      description: "To run an analysis, choose the time range, data sources, and team members.",
      image: "/images/mock-data-dashboard.png",
    },
    {
      title: "Explore Team-Wide Metrics",
      description: "Track risk levels, incident counts, after-hours activity, and workload trends across your team.",
      image: "/images/team-trends-dashboard.png",
    },
    {
      title: "Dive Into Responder-Specific Data",
      description: "Drill down into individual metrics to understand who needs support and why.",
      image: "/images/responder-detail-modal.png",
    },
    {
      title: "Let AI Do the Analysis Work",
      description: "Get AI-generated summaries to quickly prep for incident reviews or spot trends you might have missed.",
      image: "/images/ai-team-insights.png",
    },
  ]

  const integrations = [
    { name: "Rootly", src: "/images/rootly-ai-logo.png", wordmark: true },
    { name: "PagerDuty", src: "/images/pagerduty-logo.svg" },
    { name: "GitHub", src: "/images/github-logo.png" },
    { name: "Slack", src: "/images/slack-logo.png" },
    { name: "Linear", src: "/images/linear-logo.png" },
    { name: "Jira", src: "/images/jira-logo.png" },
  ]

  const step = steps[currentStep]

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-slate-950 rounded-lg shadow-xl max-w-4xl w-full border border-slate-200 dark:border-slate-800 max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="flex items-start justify-between p-6 border-b border-slate-200 dark:border-slate-800 sticky top-0 bg-white dark:bg-slate-950 z-10">
            <div className="flex items-center gap-3">
              <div>
                <h2 className="text-2xl font-semibold text-slate-900 dark:text-white">{step.title}</h2>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                  Step {currentStep + 1} of {steps.length}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors"
            >
              <X className="w-5 h-5 text-slate-600 dark:text-slate-400" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6">
            <p className="text-lg text-slate-700 dark:text-slate-300 mb-3">{step.description}</p>

            {currentStep === 0 ? (
              <div className="mt-6 rounded-lg bg-white p-8">
                <div className="grid grid-cols-3 gap-x-8 gap-y-10">
                  {integrations.map((integration) => (
                    <div key={integration.name} className="flex items-center justify-center gap-2.5">
                      <Image
                        src={integration.src}
                        alt={integration.name}
                        width={integration.wordmark ? 180 : 32}
                        height={40}
                        className={integration.wordmark ? "h-10 w-auto object-contain" : "h-8 w-8 object-contain"}
                      />
                      {!integration.wordmark && (
                        <span className="text-lg font-semibold text-slate-900 select-none cursor-default">{integration.name}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : step.image && (
              <div className="mt-6 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden bg-slate-50 dark:bg-slate-900/30">
                <div className="relative w-full flex items-center justify-center" style={{ maxHeight: '320px' }}>
                  <Image
                    src={step.image}
                    alt={step.title}
                    width={1200}
                    height={675}
                    className="w-full h-auto max-h-[320px] object-contain"
                    priority
                    quality={100}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Progress dots */}
          <div className="flex justify-center gap-2 px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/30">
            {steps.map((_, index) => (
              <button
                key={index}
                type="button"
                onClick={() => onGoToStep(index)}
                aria-label={`Go to step ${index + 1}`}
                aria-current={index === currentStep ? "step" : undefined}
                className={`h-1.5 rounded-full transition-all cursor-pointer hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2 ${
                  index === currentStep ? "w-4 bg-purple-600 dark:bg-purple-500" : "w-1.5 bg-slate-300 dark:bg-slate-600 hover:bg-slate-400 dark:hover:bg-slate-500"
                }`}
              />
            ))}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between p-6 gap-3 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-200 dark:border-slate-800">
            <Button variant="outline" onClick={onClose} className="bg-transparent">
              Skip
            </Button>

            <div className="flex gap-3">
              <Button variant="outline" onClick={onPrev} disabled={currentStep === 0} className="gap-2 bg-transparent">
                <ChevronLeft className="w-4 h-4" />
                Previous
              </Button>
              <Button
                onClick={onNext}
                className="gap-2 bg-purple-700 hover:bg-purple-700 dark:bg-purple-700 dark:hover:bg-purple-700"
              >
                {currentStep === steps.length - 1 ? "Finish" : "Next"}
                {currentStep < steps.length - 1 && <ChevronRight className="w-4 h-4" />}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

export default IntroGuide
