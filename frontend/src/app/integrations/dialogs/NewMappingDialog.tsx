import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Plus } from "lucide-react"

interface NewMappingForm {
  source_platform: string
  source_identifier: string
  target_platform: string
  target_identifier: string
}

interface NewMappingDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  form: NewMappingForm
  onFormChange: (form: NewMappingForm) => void
  selectedPlatform: 'github' | 'slack' | 'jira' | null
  onCreateMapping: () => void
}

export function NewMappingDialog({
  open,
  onOpenChange,
  form,
  onFormChange,
  selectedPlatform,
  onCreateMapping
}: NewMappingDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <Plus className="w-5 h-5" />
            <span>Create New Manual Mapping</span>
          </DialogTitle>
          <DialogDescription>
            Create a manual mapping between a source platform user and {selectedPlatform === 'github' ? 'GitHub' : selectedPlatform === 'slack' ? 'Slack' : 'Jira'} account.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Source Platform</label>
              <Select
                value={form.source_platform}
                onValueChange={(value) => onFormChange({...form, source_platform: value})}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select source platform" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="rootly">Rootly</SelectItem>
                  <SelectItem value="pagerduty">PagerDuty</SelectItem>
                  <SelectItem value="jira">Jira</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Target Platform</label>
              <Select
                value={form.target_platform}
                onValueChange={(value) => onFormChange({...form, target_platform: value})}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select target platform" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="github">GitHub</SelectItem>
                  <SelectItem value="slack">Slack</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Source Identifier</label>
            <Input
              placeholder="e.g., john.doe@company.com or John Doe"
              value={form.source_identifier}
              onChange={(e) => onFormChange({...form, source_identifier: e.target.value})}
            />
            <p className="text-xs text-neutral-500">
              The email or name as it appears in {form.source_platform} incidents
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Target Identifier</label>
            <Input
              placeholder={
                form.target_platform === 'github'
                  ? "e.g., johndoe or john-doe-123"
                  : "e.g., U1234567890 or @johndoe"
              }
              value={form.target_identifier}
              onChange={(e) => onFormChange({...form, target_identifier: e.target.value})}
            />
            <p className="text-xs text-neutral-500">
              The {form.target_platform === 'github' ? 'GitHub username' : 'Slack user ID or @username'}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            onClick={onCreateMapping}
            disabled={!form.source_identifier || !form.target_identifier}
          >
            Create Mapping
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
