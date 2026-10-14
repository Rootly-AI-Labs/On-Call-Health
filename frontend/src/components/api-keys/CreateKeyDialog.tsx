"use client"

import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Loader2, CalendarIcon, Key } from "lucide-react"
import { format, addDays, addYears } from "date-fns"
import { CreateApiKeyRequest, CreateApiKeyResponse } from "@/types/apiKey"

interface CreateKeyDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreateKey: (request: CreateApiKeyRequest) => Promise<CreateApiKeyResponse | null>
  onKeyCreated: (response: CreateApiKeyResponse) => void
}

type ExpirationPreset = {
  label: string
  value: string | null
  getValue?: () => Date
}

const EXPIRATION_PRESETS: ExpirationPreset[] = [
  { label: "7 days", value: "7days", getValue: () => addDays(new Date(), 7) },
  { label: "30 days", value: "30days", getValue: () => addDays(new Date(), 30) },
  { label: "60 days", value: "60days", getValue: () => addDays(new Date(), 60) },
  { label: "90 days", value: "90days", getValue: () => addDays(new Date(), 90) },
  { label: "Custom", value: "custom" },
  { label: "No expiration", value: null },
]

export function CreateKeyDialog({
  open,
  onOpenChange,
  onCreateKey,
  onKeyCreated,
}: CreateKeyDialogProps) {
  const [name, setName] = useState("")
  const [expirationPreset, setExpirationPreset] = useState<string | null>(null)
  const [customDate, setCustomDate] = useState<Date | undefined>(undefined)
  const [isCreating, setIsCreating] = useState(false)
  const [nameError, setNameError] = useState<string | null>(null)

  const resetForm = () => {
    setName("")
    setExpirationPreset(null)
    setCustomDate(undefined)
    setNameError(null)
  }

  const handleClose = () => {
    if (!isCreating) {
      resetForm()
      onOpenChange(false)
    }
  }

  const getExpirationDate = (): string | null => {
    if (expirationPreset === null) return null
    if (expirationPreset === "custom" && customDate) {
      return customDate.toISOString()
    }
    const preset = EXPIRATION_PRESETS.find(p => p.value === expirationPreset)
    if (preset && preset.getValue) {
      return preset.getValue().toISOString()
    }
    return null
  }

  const handleCreate = async () => {
    // Validate
    const trimmedName = name.trim()
    if (!trimmedName) {
      setNameError("Name is required")
      return
    }
    if (trimmedName.length > 100) {
      setNameError("Name must be 100 characters or less")
      return
    }
    setNameError(null)

    setIsCreating(true)
    try {
      const request: CreateApiKeyRequest = {
        name: trimmedName,
        expires_at: getExpirationDate(),
      }
      const response = await onCreateKey(request)
      if (response) {
        resetForm()
        onOpenChange(false)
        onKeyCreated(response)
      }
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Key className="w-5 h-5" />
            Create API Key
          </DialogTitle>
          <DialogDescription>
            Create a new API key for programmatic access to the REST API.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Name input */}
          <div>
            <label htmlFor="key-name" className="block text-sm font-medium text-neutral-700 mb-1.5">
              Key Name
            </label>
            <Input
              id="key-name"
              placeholder="e.g., Claude Desktop"
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                setNameError(null)
              }}
              disabled={isCreating}
              className={nameError ? "border-red-500" : ""}
            />
            {nameError && (
              <p className="mt-1 text-sm text-red-600">{nameError}</p>
            )}
          </div>

          {/* Expiration selection */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1.5">
              Expiration
            </label>
            <div className="flex flex-wrap gap-2">
              {EXPIRATION_PRESETS.map((preset) => {
                const isSelected = expirationPreset === preset.value || (expirationPreset === null && preset.value === null)
                return (
                  <Button
                    key={preset.label}
                    type="button"
                    variant={isSelected ? "default" : "outline"}
                    size="sm"
                    onClick={() => setExpirationPreset(preset.value)}
                    disabled={isCreating}
                    className={isSelected ? "bg-purple-700 hover:bg-purple-800" : ""}
                  >
                    {preset.label}
                  </Button>
                )
              })}
            </div>

            {/* Custom date picker */}
            {expirationPreset === "custom" && (
              <div className="mt-3">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-start text-left font-normal"
                      disabled={isCreating}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {customDate ? format(customDate, "PPP") : "Select expiration date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={customDate}
                      onSelect={setCustomDate}
                      disabled={(date) => date < new Date()}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isCreating}>
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={isCreating || !name.trim()}
            className="bg-purple-700 hover:bg-purple-800"
          >
            {isCreating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              "Create Key"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
