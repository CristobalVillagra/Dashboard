"use client"

import { useState } from "react"

interface BrandLogoProps {
  className?: string
  height?: number
  width?: number
  textClassName?: string
}

export function BrandLogo({ className = "", height = 32, width = 120, textClassName = "" }: BrandLogoProps) {
  const [imgError, setImgError] = useState(false)

  if (imgError) {
    return (
      <span className={`font-bold tracking-tight text-[#1f7a5b] ${textClassName || "text-base"}`}>
        AIntegration
      </span>
    )
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/aintegration-logo.png"
      alt="AIntegration"
      width={width}
      height={height}
      className={className}
      onError={() => setImgError(true)}
      style={{ maxHeight: height, objectFit: "contain" }}
    />
  )
}

export function BrandFooter({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center justify-center gap-2 text-xs text-[#8ba3b8] ${className}`}>
      <span>Desarrollado por</span>
      <BrandLogo height={18} width={80} textClassName="text-xs" />
    </div>
  )
}
