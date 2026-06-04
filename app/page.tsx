"use client"

import { useEffect, useMemo, useState } from "react"
import type { ReactNode } from "react"
import {
  AlertCircle,
  ArrowDownUp,
  CheckCircle2,
  Clock3,
  LogOut,
  MessageCircle,
  PackageSearch,
  RefreshCw,
  ShieldCheck,
  Smartphone,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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

type Runner = {
  telefono: string
  nombre: string
  area: string | null
}

type Metrics = {
  pendingConsultas: number
  pendingSkus: number
  topSku: string | null
  topSkuCount: number
  answeredToday: number
}

type QueryGroup = {
  sku: string
  marcaProducto: string
  area: string | null
  total: number
  oldestDate: string | null
  sampleMessage: string
  pickers: string[]
  consultaIds: string[]
}

type SortMode = "priority" | "oldest" | "sku"
type AreaFilter = "all" | "frio" | "sala" | "gm"

const emptyMetrics: Metrics = {
  pendingConsultas: 0,
  pendingSkus: 0,
  topSku: null,
  topSkuCount: 0,
  answeredToday: 0,
}

export default function RunnerHome() {
  const [checkingSession, setCheckingSession] = useState(true)
  const [runner, setRunner] = useState<Runner | null>(null)
  const [telefono, setTelefono] = useState("")
  const [registerName, setRegisterName] = useState("")
  const [registerArea, setRegisterArea] = useState<AreaFilter>("frio")
  const [needsRegistration, setNeedsRegistration] = useState(false)
  const [codigo, setCodigo] = useState("")
  const [otpSent, setOtpSent] = useState(false)
  const [devCode, setDevCode] = useState<string | null>(null)
  const [loadingAuth, setLoadingAuth] = useState(false)
  const [loadingData, setLoadingData] = useState(false)
  const [error, setError] = useState("")
  const [metrics, setMetrics] = useState<Metrics>(emptyMetrics)
  const [groups, setGroups] = useState<QueryGroup[]>([])
  const [sortMode, setSortMode] = useState<SortMode>("priority")
  const [areaFilter, setAreaFilter] = useState<AreaFilter>("all")
  const [selected, setSelected] = useState<QueryGroup | null>(null)
  const [answer, setAnswer] = useState("")
  const [answerMode, setAnswerMode] = useState<"respondido" | "no_disponible">("respondido")
  const [savingAnswer, setSavingAnswer] = useState(false)
  const [successMessage, setSuccessMessage] = useState("")

  async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
    const response = await fetch(url, {
      ...options,
      headers: {
        "content-type": "application/json",
        ...(options?.headers || {}),
      },
    })

    const data = await response.json().catch(() => ({}))

    if (!response.ok) {
      throw new Error(data.error || "Ocurrio un error inesperado.")
    }

    return data as T
  }

  async function loadQueries() {
    if (!runner) return

    setLoadingData(true)
    setError("")

    try {
      const data = await fetchJson<{ metrics: Metrics; groups: QueryGroup[] }>("/api/queries")
      setMetrics(data.metrics)
      setGroups(data.groups)
    } catch (currentError) {
      setRunner(null)
      setGroups([])
      setMetrics(emptyMetrics)
      setError(currentError instanceof Error ? currentError.message : "Sesion expirada.")
    } finally {
      setLoadingData(false)
    }
  }

  useEffect(() => {
    async function checkSession() {
      try {
        const data = await fetchJson<{ runner: Runner }>("/api/session")
        setRunner(data.runner)
      } catch {
        setRunner(null)
      } finally {
        setCheckingSession(false)
      }
    }

    checkSession()
  }, [])

  useEffect(() => {
    if (runner) {
      loadQueries()
    }
  }, [runner])

  useEffect(() => {
    if (!runner) return

    const heartbeat = window.setInterval(() => {
      fetch("/api/session").catch(() => undefined)
    }, 5 * 60 * 1000)

    return () => window.clearInterval(heartbeat)
  }, [runner])

  const visibleGroups = useMemo(() => {
    const filteredGroups = areaFilter === "all" ? groups : groups.filter((group) => group.area === areaFilter)

    return [...filteredGroups].sort((a, b) => {
      if (sortMode === "oldest") {
        return new Date(a.oldestDate || 0).getTime() - new Date(b.oldestDate || 0).getTime()
      }

      if (sortMode === "sku") {
        return a.sku.localeCompare(b.sku)
      }

      return b.total - a.total
    })
  }, [areaFilter, groups, sortMode])

  async function requestOtp() {
    setLoadingAuth(true)
    setError("")
    setSuccessMessage("")

    try {
      const data = await fetchJson<{ devCode?: string; message: string }>("/api/auth/request-otp", {
        method: "POST",
        body: JSON.stringify({
          telefono,
          nombre: needsRegistration ? registerName : undefined,
          area: needsRegistration ? registerArea : undefined,
        }),
      })

      setOtpSent(true)
      setNeedsRegistration(false)
      setDevCode(data.devCode || null)
      setSuccessMessage(data.message)
    } catch (currentError) {
      const message = currentError instanceof Error ? currentError.message : "No se pudo enviar el codigo."
      setError(message)
      if (message.toLowerCase().includes("nombre") || message.toLowerCase().includes("runner")) {
        setNeedsRegistration(true)
      }
    } finally {
      setLoadingAuth(false)
    }
  }

  async function verifyOtp() {
    setLoadingAuth(true)
    setError("")
    setSuccessMessage("")

    try {
      const data = await fetchJson<{ runner: Runner }>("/api/auth/verify-otp", {
        method: "POST",
        body: JSON.stringify({ telefono, codigo }),
      })

      setRunner(data.runner)
      setCodigo("")
      setDevCode(null)
      setOtpSent(false)
      setSuccessMessage("Sesion iniciada. Estado activo.")
    } catch (currentError) {
      setError(currentError instanceof Error ? currentError.message : "Codigo invalido.")
    } finally {
      setLoadingAuth(false)
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" })
    setRunner(null)
    setGroups([])
    setMetrics(emptyMetrics)
    setSuccessMessage("")
  }

  async function saveAnswer() {
    if (!selected) return

    setSavingAnswer(true)
    setError("")

    try {
      const data = await fetchJson<{ updatedConsultas: number }>("/api/queries/respond", {
        method: "POST",
        body: JSON.stringify({
          sku: selected.sku,
          consultaIds: selected.consultaIds,
          respuesta: answer,
          estadoRespuesta: answerMode,
        }),
      })

      setSuccessMessage(`Respuesta guardada para ${data.updatedConsultas} consulta(s) del SKU ${selected.sku}.`)
      setSelected(null)
      setAnswer("")
      setAnswerMode("respondido")
      await loadQueries()
    } catch (currentError) {
      setError(currentError instanceof Error ? currentError.message : "No se pudo guardar la respuesta.")
    } finally {
      setSavingAnswer(false)
    }
  }

  if (checkingSession) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f5f7fb] px-4 text-[#142033]">
        <div className="flex items-center gap-3 rounded-lg border border-[#d9e2ef] bg-white px-4 py-3 shadow-sm">
          <RefreshCw className="size-5 animate-spin text-[#1f7a5b]" />
          <span className="text-sm font-medium">Validando sesion runner</span>
        </div>
      </main>
    )
  }

  if (!runner) {
    return (
      <main className="min-h-screen bg-[#f5f7fb] px-4 py-5 text-[#142033] sm:px-6">
        <section className="mx-auto flex min-h-[calc(100vh-40px)] w-full max-w-md flex-col justify-center">
          <div className="mb-8 flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-lg bg-[#1f7a5b] text-white">
              <ShieldCheck className="size-6" />
            </div>
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-[#476179]">AIntegration</p>
              <h1 className="text-2xl font-bold leading-tight">Runner center</h1>
            </div>
          </div>

          <div className="rounded-lg border border-[#d8e0ea] bg-white p-5 shadow-sm">
            <div className="mb-5">
              <h2 className="text-xl font-semibold">Ingreso por WhatsApp</h2>
              <p className="mt-2 text-sm leading-6 text-[#5c6f82]">
                Escribe tu celular registrado. Recibiras un codigo para activar tu estado y entrar al panel.
              </p>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="telefono">Celular runner</Label>
                <div className="relative">
                  <Smartphone className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#6b7c8f]" />
                  <Input
                    id="telefono"
                    inputMode="tel"
                    placeholder="+56912345678"
                    value={telefono}
                    onChange={(event) => setTelefono(event.target.value)}
                    className="h-12 border-[#cfd9e5] bg-white pl-10 text-base text-[#142033]"
                  />
                </div>
              </div>

              {needsRegistration && !otpSent && (
                <div className="space-y-4 rounded-md border border-[#d8e0ea] bg-[#f7f9fc] p-3">
                  <div className="space-y-2">
                    <Label htmlFor="runner-name">Nombre runner</Label>
                    <Input
                      id="runner-name"
                      value={registerName}
                      onChange={(event) => setRegisterName(event.target.value)}
                      placeholder="Nombre y apellido"
                      className="h-11 border-[#cfd9e5] bg-white text-base text-[#142033]"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Area asignada</Label>
                    <div className="grid grid-cols-3 rounded-md border border-[#cfd9e5] bg-white p-1 text-sm">
                      <SortButton active={registerArea === "frio"} onClick={() => setRegisterArea("frio")}>
                        Frio
                      </SortButton>
                      <SortButton active={registerArea === "sala"} onClick={() => setRegisterArea("sala")}>
                        Sala
                      </SortButton>
                      <SortButton active={registerArea === "gm"} onClick={() => setRegisterArea("gm")}>
                        GM
                      </SortButton>
                    </div>
                  </div>
                </div>
              )}

              {otpSent && (
                <div className="space-y-2">
                  <Label htmlFor="codigo">Codigo recibido</Label>
                  <Input
                    id="codigo"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="000000"
                    value={codigo}
                    onChange={(event) => setCodigo(event.target.value.replace(/\D/g, ""))}
                    className="h-12 border-[#cfd9e5] bg-white text-center text-xl font-semibold tracking-[0.35em] text-[#142033]"
                  />
                </div>
              )}

              {devCode && (
                <div className="rounded-md border border-[#f0c36a] bg-[#fff8e7] px-3 py-2 text-sm text-[#745015]">
                  Modo prueba sin webhook WhatsApp: codigo <strong>{devCode}</strong>
                </div>
              )}

              {error && (
                <div className="flex gap-2 rounded-md border border-[#f2b8b5] bg-[#fff1f0] px-3 py-2 text-sm text-[#9b2c2c]">
                  <AlertCircle className="mt-0.5 size-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {successMessage && (
                <div className="flex gap-2 rounded-md border border-[#b8e0c9] bg-[#eefaf3] px-3 py-2 text-sm text-[#1f6a4f]">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
                  <span>{successMessage}</span>
                </div>
              )}

              <Button
                type="button"
                className="h-12 w-full bg-[#1f7a5b] text-base text-white hover:bg-[#176449]"
                onClick={otpSent ? verifyOtp : requestOtp}
                disabled={loadingAuth || (needsRegistration && !otpSent && registerName.trim().length < 2)}
              >
                {loadingAuth && <RefreshCw className="size-4 animate-spin" />}
                {otpSent ? "Iniciar sesion" : needsRegistration ? "Registrar y enviar codigo" : "Enviar codigo"}
              </Button>
            </div>
          </div>
        </section>
      </main>
    )
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#f5f7fb] text-[#142033]">
      <header className="sticky top-0 z-20 border-b border-[#dce4ee] bg-white/95 px-3 py-2 backdrop-blur sm:px-6 sm:py-3">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#1f7a5b]">Runner activo</p>
            <h1 className="truncate text-lg font-bold sm:text-xl">{runner.nombre}</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="border-[#cfd9e5] bg-white text-[#476179]"
              onClick={loadQueries}
              disabled={loadingData}
              title="Actualizar"
            >
              <RefreshCw className={`size-4 ${loadingData ? "animate-spin" : ""}`} />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="border-[#cfd9e5] bg-white text-[#476179]"
              onClick={logout}
              title="Cerrar sesion"
            >
              <LogOut className="size-4" />
            </Button>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-3 py-4 sm:px-6 sm:py-5">
        <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
          <MetricCard icon={MessageCircle} label="Consultas pendientes" value={metrics.pendingConsultas} />
          <MetricCard icon={PackageSearch} label="SKUs por responder" value={metrics.pendingSkus} />
          <MetricCard icon={ArrowDownUp} label="SKU mas urgente" value={metrics.topSku || "-"} detail={`${metrics.topSkuCount} consulta(s)`} />
          <MetricCard icon={CheckCircle2} label="Respondidas hoy" value={metrics.answeredToday} />
        </div>

        <div className="mt-4 flex flex-col gap-3 rounded-lg border border-[#d8e0ea] bg-white p-3 shadow-sm sm:mt-5 sm:flex-row sm:items-center sm:justify-between sm:p-4">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold">Consultas activas</h2>
            <p className="mt-1 text-sm text-[#5c6f82]">Agrupadas por SKU para responder una sola vez cada producto.</p>
          </div>
          <div className="grid w-full grid-cols-3 rounded-md border border-[#cfd9e5] bg-[#f7f9fc] p-1 text-sm sm:w-auto">
            <SortButton active={sortMode === "priority"} onClick={() => setSortMode("priority")}>
              Prioridad
            </SortButton>
            <SortButton active={sortMode === "oldest"} onClick={() => setSortMode("oldest")}>
              Antiguas
            </SortButton>
            <SortButton active={sortMode === "sku"} onClick={() => setSortMode("sku")}>
              SKU
            </SortButton>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-4 rounded-md border border-[#cfd9e5] bg-[#f7f9fc] p-1 text-sm">
          <SortButton active={areaFilter === "all"} onClick={() => setAreaFilter("all")}>
            Todas
          </SortButton>
          <SortButton active={areaFilter === "frio"} onClick={() => setAreaFilter("frio")}>
            Frio
          </SortButton>
          <SortButton active={areaFilter === "sala"} onClick={() => setAreaFilter("sala")}>
            Sala
          </SortButton>
          <SortButton active={areaFilter === "gm"} onClick={() => setAreaFilter("gm")}>
            GM
          </SortButton>
        </div>

        {error && (
          <div className="mt-4 flex gap-2 rounded-md border border-[#f2b8b5] bg-[#fff1f0] px-3 py-2 text-sm text-[#9b2c2c]">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {successMessage && (
          <div className="mt-4 flex gap-2 rounded-md border border-[#b8e0c9] bg-[#eefaf3] px-3 py-2 text-sm text-[#1f6a4f]">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {visibleGroups.map((group) => (
            <button
              key={group.sku}
              type="button"
              onClick={() => {
                setSelected(group)
                setAnswer("")
                setAnswerMode("respondido")
              }}
              className="min-w-0 rounded-lg border border-[#d8e0ea] bg-white p-3 text-left shadow-sm transition hover:border-[#1f7a5b] hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[#1f7a5b]/30 sm:p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[#6b7c8f]">SKU</p>
                  <h3 className="mt-1 break-all text-lg font-bold leading-snug sm:text-xl">{group.sku}</h3>
                  {group.marcaProducto && <p className="mt-1 text-sm font-medium text-[#476179]">{group.marcaProducto}</p>}
                </div>
                <span className="shrink-0 rounded-md bg-[#e7f5ee] px-2.5 py-1 text-sm font-semibold text-[#1f6a4f]">
                  {group.total}
                </span>
              </div>
              <p className="mt-3 line-clamp-2 text-sm leading-6 text-[#5c6f82]">
                {group.sampleMessage || "Sin mensaje original registrado."}
              </p>
              <div className="mt-4 flex flex-wrap gap-2 text-xs text-[#476179]">
                <span className="rounded-md bg-[#f0f4f8] px-2 py-1">{group.pickers.length} picker(s)</span>
                <span className="rounded-md bg-[#e7f5ee] px-2 py-1 font-semibold text-[#1f6a4f]">{formatArea(group.area)}</span>
                {group.oldestDate && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-[#f0f4f8] px-2 py-1">
                    <Clock3 className="size-3" />
                    {new Date(group.oldestDate).toLocaleTimeString("es-CL", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>

        {!loadingData && visibleGroups.length === 0 && (
          <div className="mt-4 rounded-lg border border-[#d8e0ea] bg-white p-8 text-center shadow-sm">
            <CheckCircle2 className="mx-auto size-10 text-[#1f7a5b]" />
            <h3 className="mt-3 text-lg font-semibold">No hay consultas pendientes</h3>
            <p className="mt-1 text-sm text-[#5c6f82]">Cuando entren nuevos SKUs apareceran aqui automaticamente al actualizar.</p>
          </div>
        )}
      </section>

      <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-h-[90vh] w-[calc(100vw-24px)] overflow-y-auto bg-white text-[#142033] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="break-all">Responder SKU {selected?.sku}</DialogTitle>
            <DialogDescription>
              Esta respuesta se guardara solo en las consultas seleccionadas de este SKU y area.
            </DialogDescription>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="rounded-md border border-[#d8e0ea] bg-[#f7f9fc] p-3">
                <p className="text-sm font-semibold">{selected.total} consulta(s) pendientes</p>
                <p className="mt-1 text-sm text-[#476179]">
                  {selected.marcaProducto || "Producto no registrado"} - {formatArea(selected.area)}
                </p>
                <p className="mt-2 text-sm leading-6 text-[#5c6f82]">{selected.sampleMessage || "Sin mensaje original."}</p>
              </div>
              <div className="grid grid-cols-2 rounded-md border border-[#cfd9e5] bg-[#f7f9fc] p-1 text-sm">
                <SortButton active={answerMode === "respondido"} onClick={() => setAnswerMode("respondido")}>
                  Disponible
                </SortButton>
                <SortButton active={answerMode === "no_disponible"} onClick={() => setAnswerMode("no_disponible")}>
                  No disponible
                </SortButton>
              </div>
              <div className="space-y-2">
                <Label htmlFor="respuesta">Respuesta para pickers</Label>
                <Textarea
                  id="respuesta"
                  value={answer}
                  onChange={(event) => setAnswer(event.target.value)}
                  placeholder={
                    answerMode === "no_disponible"
                      ? "Opcional: producto no disponible en esta area."
                      : "Ej: Disponible en pasillo 20 o usar producto alternativo ABC."
                  }
                  className="min-h-32 border-[#cfd9e5] bg-white text-base text-[#142033]"
                />
              </div>
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setSelected(null)} disabled={savingAnswer}>
              Cancelar
            </Button>
            <Button
              type="button"
              className="bg-[#1f7a5b] text-white hover:bg-[#176449]"
              onClick={saveAnswer}
              disabled={savingAnswer || (answerMode === "respondido" && answer.trim().length < 2)}
            >
              {savingAnswer && <RefreshCw className="size-4 animate-spin" />}
              Aceptar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  )
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof MessageCircle
  label: string
  value: number | string
  detail?: string
}) {
  return (
    <div className="min-w-0 rounded-lg border border-[#d8e0ea] bg-white p-3 shadow-sm sm:p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 text-xs font-medium leading-tight text-[#5c6f82] sm:text-sm">{label}</p>
        <Icon className="size-4 shrink-0 text-[#1f7a5b] sm:size-5" />
      </div>
      <p className="mt-2 break-all text-2xl font-bold tracking-normal sm:mt-3 sm:text-3xl">{value}</p>
      {detail && <p className="mt-1 text-sm text-[#5c6f82]">{detail}</p>}
    </div>
  )
}

function SortButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-9 rounded px-2 font-medium transition sm:px-3 ${
        active ? "bg-white text-[#1f7a5b] shadow-sm" : "text-[#5c6f82]"
      }`}
    >
      {children}
    </button>
  )
}

function formatArea(area: string | null) {
  if (area === "frio") return "Frio"
  if (area === "sala") return "Sala"
  if (area === "gm") return "GM"

  return "Sin area"
}
