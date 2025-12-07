"use client"

import { createContext, useContext, useState, ReactNode } from "react"

interface GettingStartedContextType {
  isOpen: boolean
  currentStep: number
  openGettingStarted: () => void
  closeGettingStarted: () => void
  nextStep: () => void
  prevStep: () => void
  setCurrentStep: (step: number) => void
}

const GettingStartedContext = createContext<GettingStartedContextType | undefined>(undefined)

export function GettingStartedProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  const [currentStep, setCurrentStepState] = useState(0)

  const openGettingStarted = () => {
    setCurrentStepState(0)
    setIsOpen(true)
  }

  const closeGettingStarted = () => {
    setIsOpen(false)
  }

  const nextStep = () => {
    if (currentStep < 3) {
      setCurrentStepState(currentStep + 1)
    } else {
      closeGettingStarted()
    }
  }

  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStepState(currentStep - 1)
    }
  }

  const setCurrentStep = (step: number) => {
    setCurrentStepState(step)
  }

  return (
    <GettingStartedContext.Provider
      value={{
        isOpen,
        currentStep,
        openGettingStarted,
        closeGettingStarted,
        nextStep,
        prevStep,
        setCurrentStep,
      }}
    >
      {children}
    </GettingStartedContext.Provider>
  )
}

export function useGettingStarted() {
  const context = useContext(GettingStartedContext)
  if (context === undefined) {
    throw new Error("useGettingStarted must be used within GettingStartedProvider")
  }
  return context
}
