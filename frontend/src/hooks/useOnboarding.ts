"use client"

import { useState, useEffect } from "react"

export function useOnboarding(userId?: string | number) {
  const [isOpen, setIsOpen] = useState(false)
  const [currentStep, setCurrentStep] = useState(0)
  const [hasSeenOnboarding, setHasSeenOnboarding] = useState(false)

  // Generate user-specific storage key
  const storageKey = userId
    ? `onboarding-seen-${userId}`
    : "onboarding-seen"

  // Initialize from localStorage
  useEffect(() => {
    const seen = localStorage.getItem(storageKey)
    if (!seen) {
      setIsOpen(true)
      setHasSeenOnboarding(false)
    } else {
      setHasSeenOnboarding(true)
    }
  }, [storageKey])

  const nextStep = () => {
    if (currentStep < 4) {
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

  const goToStep = (step: number) => {
    setCurrentStep(step)
  }

  const completeOnboarding = () => {
    localStorage.setItem(storageKey, "true")
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
    goToStep,
    completeOnboarding,
    skipOnboarding,
    restartOnboarding,
    storageKey,
  }
}
