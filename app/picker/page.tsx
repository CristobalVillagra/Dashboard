"use client"

import type React from "react"
import { useCallback, useEffect, useRef, useState } from "react"
import {
  Camera,
  CheckCircle2,
  ChevronLeft,
  Clock3,
  ImageIcon,
  LogOut,
  MessageCircle,
  Package,
  PackageSearch,
  RefreshCw,
  Search,
  ShieldAlert,
  Truck,
  Upload,
  X,
  XCircle,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { BrandFooter, BrandLogo } from "@/components/brand-logo"

// ─── Types ────────────────────────────────────────────────────────────────────

type Picker = { telefono: string; nombre: string; area: string | null }

type Product = {
  sku: string
  nombre_producto: string | null
  marca_producto: string | null
  area: string | null
  imagen_url: string | null
  activo: boolean
}

type Consulta = {
  id: number
  sku: string
  marca_producto: string | null
  area: string | null
  estado: string
  estado_respuesta: string | null
  respuesta_runner: string | null
  nombre_runner: string | null
  mensaje_original: string | null
  created_at: string
  responded_at: string | null
  leida_picker: boolean
  nombre_producto: string | null
  imagen_url: string | null
}

type Message = {
  id: string
  rol_emisor: "picker" | "runner" | "sistema"
  nombre: string | null
  contenido: string
  leido: boolean
  created_at: string
}

type PickerTab = "search" | "active" | "resolved" | "backup"

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ESTADO_LABELS: Record<string, string> = {
  pendiente_sin_asignar: "Esperando runner",
  tomada: "Runner asignado",
  en_revision: "En revision",
  respondido: "Respondido",
  no_disponible: "No disponible",
  cancelada: "Cancelada",
}

const ESTADO_COLORS: Record<string, string> = {
  pendiente_sin_asignar: "bg-amber-100 text-amber-700",
  tomada: "bg-blue-100 text-blue-700",
  en_revision: "bg-purple-100 text-purple-700",
  respondido: "bg-[#d0f0e4] text-[#1f6a4f]",
  no_disponible: "bg-red-100 text-red-700",
  cancelada: "bg-gray-100 text-gray-600",
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return "hace un momento"
  if (min < 60) return `hace ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `hace ${h}h`
  return `hace ${Math.floor(h / 24)}d`
}

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })
}

function ProductImage({
  src,
  alt,
  className = "",
  onClick,
}: {
  src: string | null
  alt: string
  className?: string
  onClick?: () => void
}) {
  const [error, setError] = useState(false)

  if (!src || error) {
    return (
      <div className={`flex items-center justify-center bg-[#f0f4f8] ${className}`} onClick={onClick}>
        <Package className="size-8 text-[#b0bec9]" />
      </div>
    )
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className={`object-cover ${className} ${onClick ? "cursor-pointer" : ""}`}
      onError={() => setError(true)}
      onClick={onClick}
    />
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function PickerPage() {
  // Session
  const [checkingSession, setCheckingSession] = useState(true)
  const [picker, setPicker] = useState<Picker | null>(null)

  // Auth form
  const [telefono, setTelefono] = useState("")
  const [codigo, setCodigo] = useState("")
  const [otpSent, setOtpSent] = useState(false)
  const [devCode, setDevCode] = useState<string | null>(null)
  const [loadingAuth, setLoadingAuth] = useState(false)
  const [authError, setAuthError] = useState("")

  // Navigation
  const [tab, setTab] = useState<PickerTab>("search")

  // Search tab
  const [searchQuery, setSearchQuery] = useState("")
  const [searchArea, setSearchArea] = useState("")
  const [searchMarca, setSearchMarca] = useState("")
  const [searchSku, setSearchSku] = useState("")
  const [searchResults, setSearchResults] = useState<Product[]>([])
  const [searching, setSearching] = useState(false)
  const [searchDone, setSearchDone] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  const [queryMessage, setQueryMessage] = useState("")
  const [creatingQuery, setCreatingQuery] = useState(false)
  const [querySuccess, setQuerySuccess] = useState<number | null>(null)

  // Queries tabs
  const [activeConsultas, setActiveConsultas] = useState<Consulta[]>([])
  const [resolvedConsultas, setResolvedConsultas] = useState<Consulta[]>([])
  const [loadingConsultas, setLoadingConsultas] = useState(false)
  const [selectedConsulta, setSelectedConsulta] = useState<Consulta | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [loadingMessages, setLoadingMessages] = useState(false)

  // Backup tab
  const [backupId, setBackupId] = useState("")
  const [backupTipo, setBackupTipo] = useState("bicci")
  const [backupPhotos, setBackupPhotos] = useState<File[]>([])
  const [backupPreviews, setBackupPreviews] = useState<string[]>([])
  const [submittingBackup, setSubmittingBackup] = useState(false)
  const [backupSuccess, setBackupSuccess] = useState(false)
  const [backupError, setBackupError] = useState("")

  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Session check ──────────────────────────────────────────────────────────

  useEffect(() => {
    async function checkSession() {
      try {
        const res = await fetch("/api/session")
        const data = await res.json()

        if (!res.ok || !data.authenticated) {
          setPicker(null)
          return
        }

        if (data.user?.rol === "admin") {
          window.location.href = "/admin"
          return
        }

        if (data.user?.rol === "runner") {
          window.location.href = "/"
          return
        }

        if (data.user?.rol === "picker") {
          setPicker({
            telefono: data.user.telefono,
            nombre: data.user.nombre,
            area: data.user.area,
          })
        }
      } catch {
        setPicker(null)
      } finally {
        setCheckingSession(false)
      }
    }

    checkSession()
  }, [])

  // ── Polling actives ────────────────────────────────────────────────────────

  const loadConsultas = useCallback(
    async (status: "active" | "resolved") => {
      if (!picker) return
      setLoadingConsultas(true)
      try {
        const res = await fetch(`/api/picker/queries?status=${status}`)
        const data = await res.json()
        if (status === "active") setActiveConsultas(data.consultas || [])
        else setResolvedConsultas(data.consultas || [])
      } catch {
        // silent
      } finally {
        setLoadingConsultas(false)
      }
    },
    [picker],
  )

  useEffect(() => {
    if (!picker || (tab !== "active" && tab !== "resolved")) return

    const status = tab === "active" ? "active" : "resolved"
    loadConsultas(status)

    if (tab === "active") {
      const interval = setInterval(() => loadConsultas("active"), 15000)
      return () => clearInterval(interval)
    }
  }, [picker, tab, loadConsultas])

  // ── Auth handlers ──────────────────────────────────────────────────────────

  async function requestOtp() {
    setLoadingAuth(true)
    setAuthError("")
    try {
      const res = await fetch("/api/auth/request-otp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ telefono }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (data.needsRegistration) {
          setAuthError("Este numero no esta registrado como picker. Pide al administrador que cree tu cuenta.")
        } else {
          setAuthError(data.error || "No se pudo enviar el codigo.")
        }
        return
      }
      setOtpSent(true)
      setDevCode(data.devCode || null)
    } catch {
      setAuthError("Error de conexion.")
    } finally {
      setLoadingAuth(false)
    }
  }

  async function verifyOtp() {
    setLoadingAuth(true)
    setAuthError("")
    try {
      const res = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ telefono, codigo }),
      })
      const data = await res.json()
      if (!res.ok) {
        setAuthError(data.error || "Codigo incorrecto.")
        return
      }
      if (data.user?.rol === "admin") {
        window.location.href = "/admin"
        return
      }
      if (data.user?.rol === "runner") {
        window.location.href = "/"
        return
      }
      if (data.user?.rol !== "picker") {
        setAuthError("Esta cuenta no tiene acceso al panel de picker.")
        return
      }
      setPicker({
        telefono: data.user.telefono,
        nombre: data.user.nombre,
        area: data.user.area,
      })
    } catch {
      setAuthError("Error de conexion.")
    } finally {
      setLoadingAuth(false)
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" })
    setPicker(null)
    setOtpSent(false)
    setCodigo("")
    setTelefono("")
  }

  // ── Search handlers ────────────────────────────────────────────────────────

  function triggerSearch(
    q = searchQuery,
    area = searchArea,
    marca = searchMarca,
    sku = searchSku,
  ) {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    searchTimerRef.current = setTimeout(async () => {
      setSearching(true)
      setSearchDone(false)
      try {
        const params = new URLSearchParams()
        if (q)    params.set("query", q)
        if (area) params.set("area", area)
        if (marca) params.set("marca", marca)
        if (sku)  params.set("sku", sku)

        const res = await fetch(`/api/picker/products?${params}`)
        const data = await res.json()
        setSearchResults(data.products || [])
        setSearchDone(true)
      } catch {
        setSearchResults([])
        setSearchDone(true)
      } finally {
        setSearching(false)
      }
    }, 350)
  }

  async function createQuery() {
    if (!selectedProduct) return
    setCreatingQuery(true)
    try {
      const res = await fetch("/api/picker/queries", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sku: selectedProduct.sku,
          mensaje: queryMessage || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      setQuerySuccess(data.consulta?.consulta_id || null)
      setSelectedProduct(null)
      setQueryMessage("")
      setSearchResults([])
      setSearchQuery("")
      setSearchDone(false)

      if (data.autoResponse) {
        // Respuesta automática — ir a resueltas directamente
        setTab("resolved")
        await loadConsultas("resolved")
      } else {
        // Ticket creado — ir a activas
        setTab("active")
        await loadConsultas("active")
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "No se pudo crear la consulta.")
    } finally {
      setCreatingQuery(false)
    }
  }

  // ── Messages handler ───────────────────────────────────────────────────────

  async function openConsulta(consulta: Consulta) {
    setSelectedConsulta(consulta)
    setLoadingMessages(true)
    setMessages([])
    try {
      const res = await fetch(`/api/picker/queries/${consulta.id}/messages`)
      const data = await res.json()
      setMessages(data.messages || [])
    } catch {
      setMessages([])
    } finally {
      setLoadingMessages(false)
    }
  }

  // ── Backup handlers ────────────────────────────────────────────────────────

  function onPhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || [])
    if (!files.length) return

    const newPhotos = [...backupPhotos, ...files].slice(0, 4)
    setBackupPhotos(newPhotos)

    newPhotos.forEach((file, i) => {
      if (backupPreviews[i]) return
      const reader = new FileReader()
      reader.onload = (ev) => {
        setBackupPreviews((prev) => {
          const next = [...prev]
          next[i] = ev.target?.result as string
          return next
        })
      }
      reader.readAsDataURL(file)
    })

    if (cameraInputRef.current) cameraInputRef.current.value = ""
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  function removePhoto(idx: number) {
    const newPhotos = backupPhotos.filter((_, i) => i !== idx)
    const newPreviews = backupPreviews.filter((_, i) => i !== idx)
    setBackupPhotos(newPhotos)
    setBackupPreviews(newPreviews)
    if (cameraInputRef.current) cameraInputRef.current.value = ""
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  async function submitBackup() {
    setBackupError("")

    if (!backupId || !/^\d{4}$/.test(backupId)) {
      setBackupError("La SG debe ser un número de 4 dígitos.")
      return
    }

    if (backupPhotos.length === 0) {
      setBackupError("Debes adjuntar al menos una foto.")
      return
    }

    setSubmittingBackup(true)
    try {
      const formData = new FormData()
      formData.append("identificador", backupId)
      formData.append("tipo_servicio", backupTipo)
      backupPhotos.forEach((file) => formData.append("fotos", file))

      const res = await fetch("/api/picker/backups", { method: "POST", body: formData })
      const data = await res.json()

      if (!res.ok) throw new Error(data.error)

      setBackupSuccess(true)
      setBackupId("")
      setBackupTipo("bicci")
      setBackupPhotos([])
      setBackupPreviews([])
      if (fileInputRef.current) fileInputRef.current.value = ""
    } catch (err) {
      setBackupError(err instanceof Error ? err.message : "No se pudo registrar el respaldo.")
    } finally {
      setSubmittingBackup(false)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (checkingSession) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#f5f8fa]">
        <RefreshCw className="size-7 animate-spin text-[#1f7a5b]" />
        <p className="mt-3 text-sm text-[#5c6f82]">Cargando usuario...</p>
        <div className="mt-8">
          <BrandFooter />
        </div>
      </div>
    )
  }

  // ── Login screen ───────────────────────────────────────────────────────────

  if (!picker) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#f5f8fa] px-4">
        <div className="w-full max-w-sm rounded-2xl border border-[#dce8f0] bg-white p-8 shadow-sm">
          <div className="mb-6 flex flex-col items-center gap-2">
            <BrandLogo height={36} width={140} />
            <h1 className="mt-2 text-xl font-bold text-[#142033]">Panel Picker</h1>
            <p className="text-center text-sm text-[#5c6f82]">
              Ingresa tu celular para recibir un codigo de acceso
            </p>
          </div>

          {!otpSent ? (
            <div className="space-y-4">
              <div>
                <Label htmlFor="tel" className="text-sm font-medium text-[#142033]">
                  Numero de celular
                </Label>
                <Input
                  id="tel"
                  type="tel"
                  inputMode="tel"
                  placeholder="+56 9 1234 5678"
                  value={telefono}
                  onChange={(e) => setTelefono(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && requestOtp()}
                  className="mt-1.5 h-12 border-[#cfd9e5] bg-white text-base text-[#142033] placeholder:text-[#b0bec9]"
                  autoComplete="tel"
                />
              </div>

              {authError && (
                <div className="flex items-start gap-2 rounded-md border border-[#f2b8b5] bg-[#fff1f0] px-3 py-2 text-sm text-[#9b2c2c]">
                  <ShieldAlert className="mt-0.5 size-4 shrink-0" />
                  <span>{authError}</span>
                </div>
              )}

              <Button
                className="h-12 w-full bg-[#1f7a5b] text-base text-white hover:bg-[#176449]"
                onClick={requestOtp}
                disabled={loadingAuth || telefono.length < 8}
              >
                {loadingAuth ? <RefreshCw className="size-4 animate-spin" /> : "Solicitar codigo"}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-2 rounded-md border border-[#b8e0c9] bg-[#eefaf3] px-3 py-2 text-sm text-[#1f6a4f]">
                <CheckCircle2 className="size-4 shrink-0" />
                Codigo enviado por SMS a tu celular.
              </div>

              {devCode && (
                <div className="rounded-md border border-[#f0c36a] bg-[#fff8e7] px-3 py-2 text-sm text-[#745015]">
                  Modo prueba — codigo: <strong className="font-mono tracking-widest">{devCode}</strong>
                </div>
              )}

              <div>
                <Label htmlFor="code" className="text-sm font-medium text-[#142033]">
                  Codigo de 6 digitos
                </Label>
                <Input
                  id="code"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="000000"
                  value={codigo}
                  onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ""))}
                  onKeyDown={(e) => e.key === "Enter" && verifyOtp()}
                  className="mt-1.5 h-12 border-[#cfd9e5] bg-white text-center text-xl font-semibold tracking-[0.35em] text-[#142033] placeholder:text-[#b0bec9]"
                  autoComplete="one-time-code"
                />
              </div>

              {authError && (
                <div className="flex items-start gap-2 rounded-md border border-[#f2b8b5] bg-[#fff1f0] px-3 py-2 text-sm text-[#9b2c2c]">
                  <ShieldAlert className="mt-0.5 size-4 shrink-0" />
                  <span>{authError}</span>
                </div>
              )}

              <Button
                className="h-12 w-full bg-[#1f7a5b] text-base text-white hover:bg-[#176449]"
                onClick={verifyOtp}
                disabled={loadingAuth || codigo.length < 6}
              >
                {loadingAuth ? <RefreshCw className="size-4 animate-spin" /> : "Ingresar al panel"}
              </Button>

              <button
                className="w-full text-center text-xs text-[#5c6f82] underline"
                onClick={() => {
                  setOtpSent(false)
                  setCodigo("")
                  setDevCode(null)
                  setAuthError("")
                }}
              >
                Volver
              </button>
            </div>
          )}
        </div>

        <div className="mt-6">
          <BrandFooter />
        </div>
      </div>
    )
  }

  // ── Main panel ─────────────────────────────────────────────────────────────

  const activeUnread = activeConsultas.filter((c) => !c.leida_picker).length

  return (
    <div className="flex min-h-screen flex-col bg-[#f5f8fa]">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-[#dce8f0] bg-white shadow-sm">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <BrandLogo height={24} width={90} />
            <div className="h-4 w-px bg-[#dce8f0]" />
            <div>
              <p className="text-xs text-[#5c6f82]">Panel de picker</p>
              <p className="text-sm font-semibold text-[#142033] leading-tight">{picker.nombre}</p>
            </div>
          </div>
          <button
            onClick={logout}
            className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-[#5c6f82] hover:bg-[#f0f4f8] hover:text-[#142033]"
          >
            <LogOut className="size-3.5" />
            Salir
          </button>
        </div>

        {/* Tab nav */}
        <div className="mx-auto flex max-w-3xl gap-0 border-t border-[#f0f4f8]">
          {(
            [
              { id: "search", label: "Buscar", icon: Search },
              { id: "active", label: "Activas", icon: Clock3, badge: activeUnread || undefined },
              { id: "resolved", label: "Resueltas", icon: CheckCircle2 },
              { id: "backup", label: "Respaldo", icon: Camera },
            ] as Array<{ id: PickerTab; label: string; icon: React.ElementType; badge?: number }>
          ).map(({ id, label, icon: Icon, badge }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`relative flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[10px] font-medium transition-colors ${
                tab === id
                  ? "border-b-2 border-[#1f7a5b] text-[#1f7a5b]"
                  : "text-[#8ba3b8] hover:text-[#476179]"
              }`}
            >
              <Icon className="size-4" />
              {label}
              {badge ? (
                <span className="absolute right-2 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-[#e74c3c] text-[9px] text-white">
                  {badge}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-4">
        {/* ── Tab: Buscar productos ── */}
        {tab === "search" && (
          <div className="space-y-4">
            <div className="rounded-xl border border-[#dce8f0] bg-white p-4 shadow-sm">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#8ba3b8]" />
                <Input
                  placeholder="Busca por nombre, SKU o marca..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value)
                    triggerSearch(e.target.value, searchArea, searchMarca, searchSku)
                  }}
                  className="h-11 border-[#cfd9e5] bg-white pl-9 text-base text-[#142033] placeholder:text-[#b0bec9]"
                />
              </div>

              {/* Filtros secundarios */}
              <div className="mt-3 grid grid-cols-3 gap-2">
                <div>
                  <Label className="text-[10px] font-semibold uppercase tracking-wide text-[#8ba3b8]">Área</Label>
                  <Input
                    placeholder="frio, sala..."
                    value={searchArea}
                    onChange={(e) => {
                      setSearchArea(e.target.value)
                      triggerSearch(searchQuery, e.target.value, searchMarca, searchSku)
                    }}
                    className="mt-1 h-9 border-[#cfd9e5] bg-white text-sm text-[#142033] placeholder:text-[#b0bec9]"
                  />
                </div>
                <div>
                  <Label className="text-[10px] font-semibold uppercase tracking-wide text-[#8ba3b8]">Marca</Label>
                  <Input
                    placeholder="marca..."
                    value={searchMarca}
                    onChange={(e) => {
                      setSearchMarca(e.target.value)
                      triggerSearch(searchQuery, searchArea, e.target.value, searchSku)
                    }}
                    className="mt-1 h-9 border-[#cfd9e5] bg-white text-sm text-[#142033] placeholder:text-[#b0bec9]"
                  />
                </div>
                <div>
                  <Label className="text-[10px] font-semibold uppercase tracking-wide text-[#8ba3b8]">SKU</Label>
                  <Input
                    placeholder="ABC-123"
                    value={searchSku}
                    onChange={(e) => {
                      setSearchSku(e.target.value.toUpperCase())
                      triggerSearch(searchQuery, searchArea, searchMarca, e.target.value)
                    }}
                    className="mt-1 h-9 border-[#cfd9e5] bg-white font-mono text-sm text-[#142033] placeholder:text-[#b0bec9] uppercase"
                  />
                </div>
              </div>

              {(searchQuery || searchArea || searchMarca || searchSku) && (
                <button
                  className="mt-2 text-xs text-[#5c6f82] underline"
                  onClick={() => {
                    setSearchQuery("")
                    setSearchArea("")
                    setSearchMarca("")
                    setSearchSku("")
                    setSearchResults([])
                    setSearchDone(false)
                  }}
                >
                  Limpiar filtros
                </button>
              )}
            </div>

            {querySuccess && (
              <div className="flex items-center gap-2 rounded-xl border border-[#b7e4d0] bg-[#e8f5f0] px-4 py-3 text-sm text-[#1f6a4f]">
                <CheckCircle2 className="size-4 shrink-0" />
                Consulta creada. Puedes verla en &quot;Activas&quot;.
                <button className="ml-auto text-xs underline" onClick={() => setQuerySuccess(null)}>
                  Cerrar
                </button>
              </div>
            )}

            {searching && (
              <div className="flex justify-center py-6">
                <RefreshCw className="size-5 animate-spin text-[#1f7a5b]" />
              </div>
            )}

            {!searching && searchDone && searchResults.length === 0 && (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <PackageSearch className="size-10 text-[#b0bec9]" />
                <p className="text-sm text-[#5c6f82]">No se encontraron productos.</p>
                <p className="text-xs text-[#8ba3b8]">
                  Prueba con otro nombre o SKU. La busqueda tolera errores de escritura.
                </p>
              </div>
            )}

            {!searching && !searchDone && searchResults.length === 0 && (
              <div className="flex flex-col items-center gap-2 py-10 text-center">
                <PackageSearch className="size-10 text-[#b0bec9]" />
                <p className="text-sm text-[#5c6f82]">Escribe para buscar un producto.</p>
              </div>
            )}

            {searchResults.length > 0 && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {searchResults.map((p) => (
                  <button
                    key={p.sku}
                    onClick={() => setSelectedProduct(p)}
                    className="flex flex-col overflow-hidden rounded-xl border border-[#dce8f0] bg-white text-left shadow-sm transition hover:border-[#1f7a5b] hover:shadow-md"
                  >
                    <ProductImage
                      src={p.imagen_url}
                      alt={p.nombre_producto || p.sku}
                      className="h-28 w-full sm:h-36"
                    />
                    <div className="flex flex-col gap-0.5 p-2.5">
                      <p className="line-clamp-2 text-[11px] font-semibold text-[#142033] leading-tight">
                        {p.nombre_producto || p.sku}
                      </p>
                      <p className="text-[10px] text-[#8ba3b8]">{p.marca_producto}</p>
                      <div className="mt-1 flex items-center gap-1">
                        <span className="rounded bg-[#f0f4f8] px-1.5 py-0.5 text-[9px] font-mono text-[#476179]">
                          {p.sku}
                        </span>
                        {p.area && (
                          <span className="rounded bg-[#e8f5f0] px-1.5 py-0.5 text-[9px] text-[#1f6a4f]">
                            {p.area}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Tab: Consultas activas ── */}
        {tab === "active" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-[#142033]">
                Consultas activas{" "}
                {activeConsultas.length > 0 && (
                  <span className="ml-1 text-[#5c6f82]">({activeConsultas.length})</span>
                )}
              </h2>
              <button
                onClick={() => loadConsultas("active")}
                className="flex items-center gap-1 text-xs text-[#5c6f82] hover:text-[#142033]"
              >
                <RefreshCw className={`size-3.5 ${loadingConsultas ? "animate-spin" : ""}`} />
                Actualizar
              </button>
            </div>

            {activeConsultas.length === 0 && !loadingConsultas && (
              <div className="flex flex-col items-center gap-2 py-10 text-center">
                <MessageCircle className="size-10 text-[#b0bec9]" />
                <p className="text-sm text-[#5c6f82]">No tienes consultas activas.</p>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-1 border-[#1f7a5b] text-[#1f7a5b]"
                  onClick={() => setTab("search")}
                >
                  Buscar producto
                </Button>
              </div>
            )}

            {activeConsultas.map((c) => (
              <button
                key={c.id}
                onClick={() => openConsulta(c)}
                className="flex w-full items-center gap-3 rounded-xl border border-[#dce8f0] bg-white p-3 text-left shadow-sm transition hover:border-[#1f7a5b]"
              >
                <ProductImage
                  src={c.imagen_url}
                  alt={c.sku}
                  className="h-16 w-16 shrink-0 rounded-lg"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="truncate text-sm font-semibold text-[#142033]">
                      {c.nombre_producto || c.sku}
                    </p>
                    {!c.leida_picker && (
                      <span className="h-2 w-2 shrink-0 rounded-full bg-[#e74c3c]" />
                    )}
                  </div>
                  <p className="text-xs text-[#8ba3b8]">{c.sku}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${ESTADO_COLORS[c.estado] || "bg-gray-100 text-gray-600"}`}>
                      {ESTADO_LABELS[c.estado] || c.estado}
                    </span>
                    <span className="text-[10px] text-[#8ba3b8]">{timeAgo(c.created_at)}</span>
                  </div>
                </div>
                <ChevronLeft className="size-4 shrink-0 rotate-180 text-[#b0bec9]" />
              </button>
            ))}
          </div>
        )}

        {/* ── Tab: Consultas resueltas ── */}
        {tab === "resolved" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-[#142033]">
                Resueltas del turno{" "}
                {resolvedConsultas.length > 0 && (
                  <span className="ml-1 text-[#5c6f82]">({resolvedConsultas.length})</span>
                )}
              </h2>
              <button
                onClick={() => loadConsultas("resolved")}
                className="flex items-center gap-1 text-xs text-[#5c6f82] hover:text-[#142033]"
              >
                <RefreshCw className={`size-3.5 ${loadingConsultas ? "animate-spin" : ""}`} />
                Actualizar
              </button>
            </div>

            {resolvedConsultas.length === 0 && !loadingConsultas && (
              <div className="flex flex-col items-center gap-2 py-10 text-center">
                <CheckCircle2 className="size-10 text-[#b0bec9]" />
                <p className="text-sm text-[#5c6f82]">Sin consultas resueltas en este turno.</p>
              </div>
            )}

            {resolvedConsultas.map((c) => (
              <button
                key={c.id}
                onClick={() => openConsulta(c)}
                className="flex w-full items-center gap-3 rounded-xl border border-[#dce8f0] bg-white p-3 text-left shadow-sm transition hover:border-[#1f7a5b]"
              >
                <ProductImage
                  src={c.imagen_url}
                  alt={c.sku}
                  className="h-16 w-16 shrink-0 rounded-lg"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-[#142033]">
                    {c.nombre_producto || c.sku}
                  </p>
                  <p className="text-xs text-[#8ba3b8]">{c.sku}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${ESTADO_COLORS[c.estado] || "bg-gray-100 text-gray-600"}`}>
                      {ESTADO_LABELS[c.estado] || c.estado}
                    </span>
                    {c.nombre_runner && (
                      <span className="text-[10px] text-[#8ba3b8]">
                        por {c.nombre_runner}
                      </span>
                    )}
                    <span className="text-[10px] text-[#8ba3b8]">
                      {c.responded_at ? timeAgo(c.responded_at) : timeAgo(c.created_at)}
                    </span>
                  </div>
                  {c.respuesta_runner && (
                    <p className="mt-1.5 line-clamp-2 text-xs text-[#476179]">{c.respuesta_runner}</p>
                  )}
                </div>
                <ChevronLeft className="size-4 shrink-0 rotate-180 text-[#b0bec9]" />
              </button>
            ))}
          </div>
        )}

        {/* ── Tab: Adjuntar respaldo ── */}
        {tab === "backup" && (
          <div className="space-y-4">
            <div className="rounded-xl border border-[#dce8f0] bg-white p-4 shadow-sm">
              <h2 className="mb-4 text-sm font-semibold text-[#142033]">Adjuntar respaldo de pedido</h2>

              {backupSuccess && (
                <div className="mb-4 flex items-center gap-2 rounded-xl border border-[#b7e4d0] bg-[#e8f5f0] px-4 py-3 text-sm text-[#1f6a4f]">
                  <CheckCircle2 className="size-4 shrink-0" />
                  Respaldo enviado correctamente.
                  <button className="ml-auto text-xs underline" onClick={() => setBackupSuccess(false)}>
                    Nuevo
                  </button>
                </div>
              )}

              {!backupSuccess && (
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="backup-id" className="text-xs text-[#476179]">
                      SG
                    </Label>
                    <Input
                      id="backup-id"
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]{4}"
                      maxLength={4}
                      placeholder="Ej: 1234"
                      value={backupId}
                      onChange={(e) => setBackupId(e.target.value.replace(/\D/g, "").slice(0, 4))}
                      className="mt-1 h-12 border-[#cfd9e5] bg-white text-center font-mono font-semibold tracking-widest text-[#142033] placeholder:text-[#b0bec9]"
                    />
                    <p className="mt-1 text-center text-[10px] text-[#b0bec9]">Número SG de 4 dígitos</p>
                  </div>

                  <div>
                    <Label htmlFor="backup-tipo" className="text-xs text-[#476179]">
                      Tipo de servicio
                    </Label>
                    <select
                      id="backup-tipo"
                      value={backupTipo}
                      onChange={(e) => setBackupTipo(e.target.value)}
                      className="mt-1 w-full rounded-md border border-[#cfd9e5] bg-white px-3 py-2 text-sm text-[#142033] focus:outline-none focus:ring-2 focus:ring-[#1f7a5b]"
                    >
                      <option value="bicci">Bicci</option>
                      <option value="driver">Driver</option>
                      <option value="uber">Uber</option>
                      <option value="pickup">Pickup</option>
                    </select>
                  </div>

                  <div>
                    <Label className="text-xs text-[#476179]">
                      Foto(s) del respaldo
                    </Label>

                    {backupPreviews.length > 0 && (
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        {backupPreviews.map((preview, i) => (
                          <div key={i} className="relative">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={preview}
                              alt={`Foto ${i + 1}`}
                              className="h-32 w-full rounded-lg object-cover"
                            />
                            <button
                              onClick={() => removePhoto(i)}
                              className="absolute right-1 top-1 rounded-full bg-red-500 p-0.5 text-white hover:bg-red-600"
                            >
                              <X className="size-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {backupPhotos.length < 4 && (
                      <div className="mt-2 space-y-2">
                        {/* Galería (selección múltiple) */}
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/*"
                          onChange={onPhotoSelect}
                          multiple
                          className="hidden"
                          id="photo-gallery-input"
                        />
                        {/* Cámara (fuerza captura directa) */}
                        <input
                          ref={cameraInputRef}
                          type="file"
                          accept="image/*"
                          capture="environment"
                          onChange={onPhotoSelect}
                          multiple
                          className="hidden"
                          id="photo-camera-input"
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <label
                            htmlFor="photo-camera-input"
                            className="flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border-2 border-dashed border-[#dce8f0] py-5 text-[#8ba3b8] transition hover:border-[#1f7a5b] hover:bg-[#f0faf6] hover:text-[#1f7a5b]"
                          >
                            <Camera className="size-6" />
                            <p className="text-xs font-medium">Tomar foto</p>
                          </label>
                          <label
                            htmlFor="photo-gallery-input"
                            className="flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border-2 border-dashed border-[#dce8f0] py-5 text-[#8ba3b8] transition hover:border-[#1f7a5b] hover:bg-[#f0faf6] hover:text-[#1f7a5b]"
                          >
                            <ImageIcon className="size-6" />
                            <p className="text-xs font-medium">Elegir de galería</p>
                          </label>
                        </div>
                        <p className="text-center text-[10px] text-[#b0bec9]">
                          {backupPhotos.length}/4 fotos seleccionadas
                        </p>
                      </div>
                    )}
                  </div>

                  {backupError && (
                    <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{backupError}</p>
                  )}

                  <Button
                    className="w-full bg-[#1f7a5b] text-white hover:bg-[#176449]"
                    onClick={submitBackup}
                    disabled={submittingBackup || !/^\d{4}$/.test(backupId) || backupPhotos.length === 0}
                  >
                    {submittingBackup ? (
                      <RefreshCw className="size-4 animate-spin" />
                    ) : (
                      <>
                        <Upload className="size-4" />
                        Enviar respaldo
                      </>
                    )}
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      <footer className="py-4">
        <BrandFooter />
      </footer>

      {/* ── Dialog: Detalle de producto ── */}
      <Dialog open={Boolean(selectedProduct)} onOpenChange={(open) => !open && setSelectedProduct(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
          {selectedProduct && (
            <>
              <DialogHeader>
                <DialogTitle className="text-base">{selectedProduct.nombre_producto || selectedProduct.sku}</DialogTitle>
              </DialogHeader>

              {/* Imagen grande */}
              <div className="relative mt-1 overflow-hidden rounded-xl">
                <ProductImage
                  src={selectedProduct.imagen_url}
                  alt={selectedProduct.sku}
                  className="h-52 w-full cursor-zoom-in"
                  onClick={() => selectedProduct.imagen_url && setLightboxUrl(selectedProduct.imagen_url)}
                />
                {selectedProduct.imagen_url && (
                  <button
                    onClick={() => setLightboxUrl(selectedProduct.imagen_url)}
                    className="absolute bottom-2 right-2 rounded-full bg-black/40 p-1.5 text-white backdrop-blur-sm"
                  >
                    <ImageIcon className="size-3.5" />
                  </button>
                )}
              </div>

              {/* Detalles */}
              <div className="mt-3 space-y-2">
                <div className="flex gap-2">
                  <span className="rounded bg-[#f0f4f8] px-2 py-1 font-mono text-xs text-[#476179]">
                    {selectedProduct.sku}
                  </span>
                  {selectedProduct.area && (
                    <span className="rounded bg-[#e8f5f0] px-2 py-1 text-xs text-[#1f6a4f]">
                      {selectedProduct.area}
                    </span>
                  )}
                </div>
                {selectedProduct.marca_producto && (
                  <p className="text-sm text-[#5c6f82]">Marca: {selectedProduct.marca_producto}</p>
                )}
              </div>

              <div>
                <Label className="text-xs text-[#476179]">Mensaje adicional (opcional)</Label>
                <Textarea
                  placeholder="Agrega contexto si es necesario..."
                  value={queryMessage}
                  onChange={(e) => setQueryMessage(e.target.value)}
                  className="mt-1 min-h-[80px] border-[#cfd9e5] bg-white text-sm text-[#142033] placeholder:text-[#b0bec9]"
                />
              </div>

              <Button
                className="w-full bg-[#1f7a5b] text-white hover:bg-[#176449]"
                onClick={createQuery}
                disabled={creatingQuery}
              >
                {creatingQuery ? (
                  <RefreshCw className="size-4 animate-spin" />
                ) : (
                  <>
                    <MessageCircle className="size-4" />
                    Consultar este producto
                  </>
                )}
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Lightbox de imagen ── */}
      <Dialog open={Boolean(lightboxUrl)} onOpenChange={(open) => !open && setLightboxUrl(null)}>
        <DialogContent className="max-w-[95vw] border-0 bg-black/95 p-2">
          {lightboxUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={lightboxUrl}
              alt="Vista ampliada"
              className="max-h-[85vh] w-full rounded-lg object-contain"
            />
          )}
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Chat de consulta ── */}
      <Dialog
        open={Boolean(selectedConsulta)}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedConsulta(null)
            setMessages([])
          }
        }}
      >
        <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-lg">
          {selectedConsulta && (
            <>
              <DialogHeader className="shrink-0">
                <div className="flex items-center gap-3">
                  <ProductImage
                    src={selectedConsulta.imagen_url}
                    alt={selectedConsulta.sku}
                    className="h-12 w-12 shrink-0 rounded-lg"
                  />
                  <div className="min-w-0">
                    <DialogTitle className="truncate text-sm">
                      {selectedConsulta.nombre_producto || selectedConsulta.sku}
                    </DialogTitle>
                    <p className="text-xs text-[#8ba3b8]">{selectedConsulta.sku}</p>
                    <span className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${ESTADO_COLORS[selectedConsulta.estado] || "bg-gray-100 text-gray-600"}`}>
                      {ESTADO_LABELS[selectedConsulta.estado] || selectedConsulta.estado}
                    </span>
                  </div>
                </div>
              </DialogHeader>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto space-y-2 py-2 min-h-0">
                {loadingMessages && (
                  <div className="flex justify-center py-4">
                    <RefreshCw className="size-4 animate-spin text-[#1f7a5b]" />
                  </div>
                )}

                {!loadingMessages && messages.length === 0 && (
                  <p className="text-center text-xs text-[#8ba3b8] py-4">Sin mensajes aun.</p>
                )}

                {messages.map((m) => {
                  const isPicker = m.rol_emisor === "picker"
                  const isSistema = m.rol_emisor === "sistema"

                  if (isSistema) {
                    return (
                      <div key={m.id} className="flex justify-center">
                        <p className="rounded-full bg-[#f0f4f8] px-3 py-1 text-center text-[10px] text-[#5c6f82]">
                          {m.contenido}
                        </p>
                      </div>
                    )
                  }

                  return (
                    <div key={m.id} className={`flex ${isPicker ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                          isPicker
                            ? "rounded-br-sm bg-[#1f7a5b] text-white"
                            : "rounded-bl-sm bg-[#f0f4f8] text-[#142033]"
                        }`}
                      >
                        {!isPicker && m.nombre && (
                          <p className="mb-0.5 text-[10px] font-semibold text-[#5c6f82]">{m.nombre}</p>
                        )}
                        <p className="whitespace-pre-wrap leading-snug">{m.contenido}</p>
                        <p className={`mt-0.5 text-right text-[9px] ${isPicker ? "text-white/60" : "text-[#8ba3b8]"}`}>
                          {formatTime(m.created_at)}
                        </p>
                      </div>
                    </div>
                  )
                })}

                {/* Respuesta final si esta resuelta */}
                {selectedConsulta.respuesta_runner && !messages.find((m) => m.rol_emisor === "runner") && (
                  <div className="flex justify-start">
                    <div className="max-w-[80%] rounded-2xl rounded-bl-sm bg-[#f0f4f8] px-3 py-2 text-sm text-[#142033]">
                      {selectedConsulta.nombre_runner && (
                        <p className="mb-0.5 text-[10px] font-semibold text-[#5c6f82]">
                          {selectedConsulta.nombre_runner}
                        </p>
                      )}
                      <p className="whitespace-pre-wrap leading-snug">{selectedConsulta.respuesta_runner}</p>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
