"use client"

import { useGettingStarted } from "@/contexts/GettingStartedContext"
import IntroGuide from "@/components/IntroGuide"

export function GettingStartedDialog() {
  const { isOpen, currentStep, nextStep, prevStep, closeGettingStarted } = useGettingStarted()

  return (
    <IntroGuide
      isOpen={isOpen}
      currentStep={currentStep}
      onNext={nextStep}
      onPrev={prevStep}
      onClose={closeGettingStarted}
    />
  )
}
