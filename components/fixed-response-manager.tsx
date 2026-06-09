"use client"

import { useState } from "react"
import { RefreshCw } from "lucide-react"
import type { FixedResponseRecord } from "@/lib/fixed-responses"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

export function FixedResponseManager({
  response,
  canEdit,
  onUpdate,
}: {
  response: FixedResponseRecord
  canEdit: boolean
  onUpdate: (payload: { id: string; activo?: boolean; respuesta?: string }) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(response.respuesta)
  const [saving, setSaving] = useState(false)
  const [toggling, setToggling] = useState(false)

  if (!canEdit) return null

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setText(response.respuesta)
            setEditing(true)
          }}
        >
          Editar respuesta
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={toggling}
          onClick={async () => {
            setToggling(true)
            try {
              await onUpdate({ id: response.id, activo: !response.activo })
            } finally {
              setToggling(false)
            }
          }}
        >
          {toggling && <RefreshCw className="size-4 animate-spin" />}
          {response.activo ? "Desactivar" : "Activar"}
        </Button>
      </div>

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="bg-white text-[#142033] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="break-all">Editar respuesta fija SKU {response.sku}</DialogTitle>
            <DialogDescription>
              Los pickers veran este texto mientras la respuesta siga activa en el bot.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor={`fixed-edit-${response.id}`}>Respuesta</Label>
            <Textarea
              id={`fixed-edit-${response.id}`}
              value={text}
              onChange={(event) => setText(event.target.value)}
              className="min-h-32 border-[#cfd9e5] bg-white"
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setEditing(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button
              type="button"
              className="bg-[#1f7a5b] text-white"
              disabled={saving || text.trim().length < 2}
              onClick={async () => {
                setSaving(true)
                try {
                  await onUpdate({ id: response.id, respuesta: text.trim() })
                  setEditing(false)
                } finally {
                  setSaving(false)
                }
              }}
            >
              {saving && <RefreshCw className="size-4 animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
