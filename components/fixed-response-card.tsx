"use client"

import { useState, type ReactNode } from "react"
import { ImagePlus } from "lucide-react"
import type { FixedResponseRecord } from "@/lib/fixed-responses"
import { fixedSinceIso, formatDaysSinceFixed } from "@/lib/fixed-responses"
import { formatAreaLabel } from "@/lib/areas"
import { ImageZoomModal } from "@/components/image-zoom-modal"

function formatRelativeDate(iso: string | null | undefined): string {
  if (!iso) return ""
  const d = new Date(iso)
  return d.toLocaleString("es-CL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function FixedResponseCard({
  response,
  actions,
}: {
  response: FixedResponseRecord
  actions?: ReactNode
}) {
  const daysLabel = formatDaysSinceFixed(fixedSinceIso(response))

  return (
    <div className={`rounded-lg border border-[#d8e0ea] bg-white p-4 ${response.activo ? "" : "opacity-70"}`}>
      <div className="flex gap-3">
        <FixedResponseImage url={response.imagen_url} alt={response.marca_producto || response.sku} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-semibold break-all">SKU {response.sku}</p>
              {response.marca_producto && (
                <p className="mt-1 text-sm font-medium text-[#476179]">{response.marca_producto}</p>
              )}
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <span className="rounded-md bg-[#fff1f0] px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-[#9b2c2c]">
                Sin stock confirmado
              </span>
              {response.activo && daysLabel && (
                <span className="rounded-md bg-[#fff8e7] px-2 py-0.5 text-xs font-semibold text-[#745015]">
                  {daysLabel} sin confirmar llegada
                </span>
              )}
            </div>
          </div>

          <p className="mt-1.5 text-xs text-[#5c6f82]">
            Cualquier picker que consulte este SKU recibe respuesta automática de no disponible.
          </p>

          <div className="mt-2 flex flex-wrap gap-2 text-xs text-[#476179]">
            <span className="rounded-md bg-[#f0f4f8] px-2 py-1">{formatAreaLabel(response.area)}</span>
            {response.nombre_runner && (
              <span className="rounded-md bg-[#f0f4f8] px-2 py-1">Runner: {response.nombre_runner}</span>
            )}
            {response.fijado_por && (
              <span className="rounded-md bg-[#f0f4f8] px-2 py-1">Fijado por: {response.fijado_por}</span>
            )}
            {response.fijado_at && (
              <span className="rounded-md bg-[#f0f4f8] px-2 py-1">
                Fijado: {formatRelativeDate(response.fijado_at)}
              </span>
            )}
            {!response.fijado_at && response.ultima_respuesta_en && (
              <span className="rounded-md bg-[#f0f4f8] px-2 py-1">
                Fijado: {formatRelativeDate(response.ultima_respuesta_en)}
              </span>
            )}
            {typeof response.reportes_no_disponible === "number" && response.reportes_no_disponible > 0 && (
              <span className="rounded-md bg-[#fff8e7] px-2 py-1 font-semibold text-[#745015]">
                {response.reportes_no_disponible} reporte(s) no disponible
              </span>
            )}
            {response.reporte_multiples_runners && (
              <span className="rounded-md bg-[#fff1f0] px-2 py-1 font-semibold text-[#9b2c2c]">
                {response.runners_reportando} runners reportaron (7d)
              </span>
            )}
            {response.reporte_stale && (
              <span className="rounded-md bg-[#fff1f0] px-2 py-1 font-semibold text-[#9b2c2c]">
                Sin stock hace +3 dias
              </span>
            )}
            {!response.activo && (
              <span className="rounded-md bg-[#fff1f0] px-2 py-1 font-semibold text-[#9b2c2c]">Inactiva</span>
            )}
          </div>
          {response.nombre_producto && (
            <p className="mt-2 text-sm font-medium text-[#476179]">Catalogo: {response.nombre_producto}</p>
          )}
          <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-[#5c6f82]">
            {response.respuesta}
          </p>
          {actions && <div className="mt-3">{actions}</div>}
        </div>
      </div>
    </div>
  )
}

function FixedResponseImage({ url, alt }: { url: string | null; alt: string }) {
  const [failed, setFailed] = useState(false)
  const [zoomOpen, setZoomOpen] = useState(false)

  if (!url || failed) {
    return (
      <div
        className="flex size-20 shrink-0 items-center justify-center rounded-md border border-[#d8e0ea] bg-[#f7f9fc]"
        title={alt}
      >
        <ImagePlus className="size-6 text-[#8aa0b5]" />
      </div>
    )
  }

  return (
    <>
      <button
        type="button"
        className="size-20 shrink-0 overflow-hidden rounded-md border border-[#d8e0ea] bg-[#f7f9fc] transition active:scale-95"
        onClick={() => setZoomOpen(true)}
        aria-label={`Ver imagen de ${alt}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={alt}
          className="size-full object-cover"
          onError={() => setFailed(true)}
        />
      </button>

      <ImageZoomModal open={zoomOpen} src={url} alt={alt} onClose={() => setZoomOpen(false)} />
    </>
  )
}
