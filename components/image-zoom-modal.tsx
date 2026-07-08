"use client"

import { useEffect } from "react"
import { createPortal } from "react-dom"

type ImageZoomModalProps = {
  open: boolean
  src: string | null
  alt?: string
  onClose: () => void
}

export function ImageZoomModal({
  open,
  src,
  alt = "Imagen del producto",
  onClose,
}: ImageZoomModalProps) {
  useEffect(() => {
    if (!open) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }

    document.addEventListener("keydown", onKeyDown)
    document.body.style.overflow = "hidden"

    return () => {
      document.removeEventListener("keydown", onKeyDown)
      document.body.style.overflow = ""
    }
  }, [open, onClose])

  if (!open || !src) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex animate-in fade-in duration-150 items-center justify-center bg-black/75 px-4 py-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={alt}
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute right-4 top-4 flex size-10 items-center justify-center rounded-full bg-white text-2xl font-semibold leading-none text-[#142033] shadow-md transition active:scale-95"
        aria-label="Cerrar imagen"
      >
        x
      </button>

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        className="max-h-[85vh] max-w-[95vw] rounded-lg bg-white object-contain shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      />
    </div>,
    document.body,
  )
}
