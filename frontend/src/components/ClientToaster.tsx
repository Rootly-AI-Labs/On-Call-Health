"use client"

import { useEffect, useState, type ComponentType } from 'react'

export default function ClientToaster() {
  const [ToasterComponent, setToasterComponent] = useState<ComponentType<any> | null>(null)

  useEffect(() => {
    // Dynamically import sonner only on client side
    import('sonner').then((mod) => {
      setToasterComponent(() => mod.Toaster)
    })
  }, [])

  if (!ToasterComponent) return null

  return (
    <ToasterComponent
      theme="light"
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-white group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
    />
  )
}
