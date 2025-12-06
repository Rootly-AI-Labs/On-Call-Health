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
}

function IntroGuide({ isOpen, currentStep, onNext, onPrev, onClose }: IntroGuideProps) {
  if (!isOpen) return null

  const steps = [
    {
      title: "Welcome to On-Call Burnout Detector",
      description: "Detects potential signs of overwork in incident responders, which could lead to burnout.",
      details:
        "To compute a per-responder risk score, it integrates with Rootly, PagerDuty, GitHub, Slack and Pagerduty.",
      icon: "🎯",
    },
    {
      title: "Understanding Mock Data",
      description: (
        <>
          The <strong>Dashboard</strong> you see here is displaying mock data for demonstration purposes.
        </>
      ),
      details:
        "The left panel shows the mock data source, while the center analysis section displays the mock analysis results. This helps you understand what real data will look like.",
      icon: "📊",
      highlight: "mock-data-demo",
      image: "/images/mock-data-dashboard.png",
    },
    {
      title: "Connect Your Integrations",
      description: "To get real data for your team, you need to add integrations.",
      details: (
        <>
          Go to the <strong>Integrations</strong> section to sync and edit your integrations. Click{" "}
          <strong>&quot;View Members&quot;</strong> to see the mappings of your team members and manage their data
          sources.
        </>
      ),
      icon: "🔗",
      images: ["/images/integrations-page.png", "/images/team-members-modal.png"],
    },
    {
      title: "Learn More About Our Methodology",
      description: "Understand how we calculate burnout risk and our motivation behind the analysis.",
      details: (
        <>
          Click your user profile in the top right corner and select <strong>&quot;Getting Started&quot;</strong> anytime to review
          these slides. You can also select <strong>&quot;Methodology&quot;</strong> to view detailed information about our burnout detection framework and calculations.
        </>
      ),
      icon: "📚",
      images: ["/images/user-profile-menu.png", "/images/methodology-page.png"],
    },
  ]

  const step = steps[currentStep]

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40" onClick={onClose} />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-slate-950 rounded-lg shadow-xl max-w-4xl w-full border border-slate-200 dark:border-slate-800 max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="flex items-start justify-between p-6 border-b border-slate-200 dark:border-slate-800 sticky top-0 bg-white dark:bg-slate-950 z-10">
            <div className="flex items-center gap-3">
              <span className="text-3xl">{step.icon}</span>
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
            <p className="text-base text-slate-600 dark:text-slate-400 leading-relaxed mb-4">{step.details}</p>

            {/* Highlight boxes for specific steps */}
            {currentStep === 0 && (
              <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg">
                <p className="text-sm text-blue-900 dark:text-blue-200">
                  <strong>✨ What you'll see:</strong> Real-time burnout analysis for your on-call team members with
                  multiple data sources.
                </p>
              </div>
            )}

            {currentStep === 1 && step.image && (
              <div className="mt-6 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden bg-slate-50 dark:bg-slate-900/30">
                <div className="relative w-full">
                  <Image
                    src={step.image || "/placeholder.svg"}
                    alt="Dashboard with Mock Data"
                    width={500}
                    height={280}
                    className="w-full h-auto"
                    priority
                    quality={100}
                  />
                </div>
                <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div className="flex items-start gap-2">
                      <span className="text-purple-600 dark:text-purple-400 font-bold">👈</span>
                      <div>
                        <p className="font-medium text-slate-900 dark:text-white">Left Panel</p>
                        <p className="text-slate-600 dark:text-slate-400">
                          Shows "Mock Data" source with 43 synced members
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="text-purple-600 dark:text-purple-400 font-bold">👉</span>
                      <div>
                        <p className="font-medium text-slate-900 dark:text-white">Center Section</p>
                        <p className="text-slate-600 dark:text-slate-400">
                          Displays burnout scores, incidents, and analysis charts
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {currentStep === 2 && "images" in step && step.images && (
              <div className="mt-6 space-y-4">
                <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden bg-slate-50 dark:bg-slate-900/30">
                  <div className="relative w-full">
                    <Image
                      src={step.images[0] || "/placeholder.svg"}
                      alt="Integrations Page"
                      width={500}
                      height={320}
                      className="w-full h-auto"
                      priority
                      quality={100}
                    />
                  </div>
                  <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950">
                    <p className="text-sm font-medium text-slate-900 dark:text-white">📍 Integrations Page</p>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                      Navigate to the Integrations tab to view all available connections and team management options.
                    </p>
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden bg-slate-50 dark:bg-slate-900/30">
                  <div className="relative w-full">
                    <Image
                      src={step.images[1] || "/placeholder.svg"}
                      alt="Team Members Modal"
                      width={350}
                      height={320}
                      className="w-full h-auto"
                      priority
                      quality={100}
                    />
                  </div>
                  <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950">
                    <p className="text-sm font-medium text-slate-900 dark:text-white">👥 View Members</p>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                      Click "View Members" to see team member mappings across integrations and manage their data
                      sources.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {currentStep === 3 && "images" in step && step.images && (
              <div className="mt-6 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden bg-slate-50 dark:bg-slate-900/30">
                <div className="relative w-full max-w-2xl mx-auto">
                  <Image
                    src={step.images[1] || "/placeholder.svg"}
                    alt="Methodology Page"
                    width={350}
                    height={230}
                    className="w-full h-auto"
                    priority
                    quality={100}
                  />
                </div>
                <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950">
                  <p className="text-sm font-medium text-slate-900 dark:text-white">📖 Methodology Details</p>
                  <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                    Learn about the On-Call Burnout Score (OCB), our research-backed framework, and the five key
                    burnout factors we analyze.
                  </p>
                </div>
              </div>
            )}

            {currentStep === 3 && !("images" in step && step.images) && (
              <div className="mt-4 p-4 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg">
                <p className="text-sm text-green-900 dark:text-green-200">
                  <strong>🔍 Pro tip:</strong> You can anytime click "Getting Started" in your profile menu to review these slides.
                </p>
              </div>
            )}
          </div>

          {/* Progress dots */}
          <div className="flex justify-center gap-2 px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/30">
            {steps.map((_, index) => (
              <div
                key={index}
                className={`h-2 rounded-full transition-all ${
                  index === currentStep ? "w-6 bg-purple-600 dark:bg-purple-500" : "w-2 bg-slate-300 dark:bg-slate-600"
                }`}
              />
            ))}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between p-6 gap-3 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-200 dark:border-slate-800">
            <button
              onClick={onClose}
              className="text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 transition-colors"
            >
              Skip
            </button>

            <div className="flex gap-3">
              <Button variant="outline" onClick={onPrev} disabled={currentStep === 0} className="gap-2 bg-transparent">
                <ChevronLeft className="w-4 h-4" />
                Previous
              </Button>
              <Button
                onClick={onNext}
                className="gap-2 bg-purple-600 hover:bg-purple-700 dark:bg-purple-600 dark:hover:bg-purple-700"
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
