"use client"

import { useState, useEffect } from "react"

export function useOnboarding() {
  const [isOpen, setIsOpen] = useState(false)
  const [currentStep, setCurrentStep] = useState(0)
  const [hasSeenOnboarding, setHasSeenOnboarding] = useState(false)

  // Initialize from localStorage
  useEffect(() => {
    const seen = localStorage.getItem("onboarding-seen")
    if (!seen) {
      setIsOpen(true)
      setHasSeenOnboarding(false)
    } else {
      setHasSeenOnboarding(true)
    }
  }, [])

  const nextStep = () => {
    if (currentStep < 3) {
      setCurrentStep(currentStep + 1)
    } else {
      completeOnboarding()
    }
  }

  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1)
    }
  }

  const completeOnboarding = () => {
    localStorage.setItem("onboarding-seen", "true")
    setIsOpen(false)
    setHasSeenOnboarding(true)
  }

  const skipOnboarding = () => {
    completeOnboarding()
  }

  const restartOnboarding = () => {
    setCurrentStep(0)
    setIsOpen(true)
    setHasSeenOnboarding(false)
  }

  return {
    isOpen,
    currentStep,
    hasSeenOnboarding,
    nextStep,
    prevStep,
    completeOnboarding,
    skipOnboarding,
    restartOnboarding,
  }
}
