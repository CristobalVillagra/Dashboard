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
import { Checkbox } from "@/components/ui/checkbox"
import { QuerySortControls } from "@/components/query-sort-controls"
import { formatAreaLabel } from "@/lib/areas"
import {
  filterAntiguasPendingGroups,
  filterNuevasGroups,
  listAntiguasRespondedConsultas,
  type MineRespondedConsulta,
} from "@/lib/mine-queries"
import {
  sortQueryGroups,
  type QueryGroup,
  type QuerySortMode,
} from "@/lib/query-groups"
import { FixedResponseCard } from "@/components/fixed-response-card"
import { FixedResponseManager } from "@/components/fixed-response-manager"
import type { FixedResponseRecord } from "@/lib/fixed-responses"
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
  myTickets: number
  topSku: string | null
  topSkuCount: number
  answeredToday: number
}

type QueryGroupView = QueryGroup

type AreaFilter = "all" | "frio" | "sala" | "gm"
type ViewTab = "available" | "mine" | "fixed"
type MineSubTab = "nuevas" | "antiguas"
type AnswerMode = "disponible" | "no_disponible" | "ir_a_revisar"

const emptyMetrics: Metrics = {
  pendingConsultas: 0,
  pendingSkus: 0,
  myTickets: 0,
  topSku: null,
  topSkuCount: 0,
  answeredToday: 0,
}


export default function RunnerHome() {
  const [checkingSession, setCheckingSession] = useState(true)
  const [runner, setRunner] = useState<Runner | null>(null)
  const [viewTab, setViewTab] = useState<ViewTab>("available")
  const [telefono, setTelefono] = useState("")
  const [registerName, setRegisterName] = useState("")
  const [registerArea, setRegisterArea] = useState<AreaFilter>("frio")
  const [needsRegistration, setNeedsRegistration] = useState(false)
  const [codigo, setCodigo] = useState("")
  const [otpSent, setOtpSent] = useState(false)
  const [devCode, setDevCode] = useState<string | null>(null)
  const [loadingAuth, setLoadingAuth] = useState(false)
  const [loadingData, setLoadingData] = useState(false)
  const [claimingSku, setClaimingSku] = useState<string | null>(null)
  const [error, setError] = useState("")
  const [metrics, setMetrics] = useState<Metrics>(emptyMetrics)
  const [groups, setGroups] = useState<QueryGroupView[]>([])
  const [fixedResponses, setFixedResponses] = useState<FixedResponseRecord[]>([])
  const [sortMode, setSortMode] = useState<QuerySortMode>("newest")
  const [availableAreaParam, setAvailableAreaParam] = useState("")
  const [availableAreas, setAvailableAreas] = useState<string[]>([])
  const [mineSubTab, setMineSubTab] = useState<MineSubTab>("nuevas")
  const [selected, setSelected] = useState<QueryGroupView | null>(null)
  const [editingConsulta, setEditingConsulta] = useState<MineRespondedConsulta | null>(null)
  const [editAnswer, setEditAnswer] = useState("")
  const [savingEdit, setSavingEdit] = useState(false)
  const [answer, setAnswer] = useState("")
  const [answerMode, setAnswerMode] = useState<AnswerMode>("disponible")
  const [respuestaFija, setRespuestaFija] = useState(false)
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

  async function loadQueries(tab: ViewTab = viewTab, area = availableAreaParam) {
    if (!runner) return

    setLoadingData(true)
    setError("")

    try {
      if (tab === "fixed") {
        const data = await fetchJson<{ responses: FixedResponseRecord[] }>("/api/queries/fixed-responses")
        setFixedResponses(data.responses)
        return
      }

      const params = new URLSearchParams({ view: tab })
      if (tab === "available" && area) {
        params.set("area", area)
      }

      const data = await fetchJson<{ metrics: Metrics; groups: QueryGroup[]; availableAreas?: string[] }>(
        `/api/queries?${params}`,
      )
      setMetrics(data.metrics)
      setGroups(data.groups)
      if (tab === "available" && data.availableAreas) {
        setAvailableAreas(data.availableAreas)
      }
    } catch (currentError) {
      if (tab === "fixed") {
        setFixedResponses([])
      } else {
        setRunner(null)
        setGroups([])
        setMetrics(emptyMetrics)
      }
      setError(currentError instanceof Error ? currentError.message : "Sesion expirada.")
    } finally {
      setLoadingData(false)
    }
  }

  useEffect(() => {
    async function checkSession() {
      try {
        const data = await fetchJson<{
          runner?: Runner
          user?: { rol: string }
        }>("/api/session")

        if (data.user?.rol === "admin") {
          window.location.href = "/admin"
          return
        }

        setRunner(data.runner || null)
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
      loadQueries(viewTab, viewTab === "available" ? availableAreaParam : "")
    }
  }, [runner, viewTab, availableAreaParam])

  useEffect(() => {
    if (!runner) return

    const heartbeat = window.setInterval(() => {
      fetch("/api/session").catch(() => undefined)
    }, 5 * 60 * 1000)

    return () => window.clearInterval(heartbeat)
  }, [runner])

  const visibleGroups = useMemo(() => {
    if (viewTab === "mine") {
      const filtered =
        mineSubTab === "nuevas" ? filterNuevasGroups(groups) : filterAntiguasPendingGroups(groups)
      return sortQueryGroups(filtered, sortMode)
    }
    return sortQueryGroups(groups, sortMode)
  }, [viewTab, mineSubTab, groups, sortMode])

  const antiguasRespondidas = useMemo(() => {
    if (viewTab !== "mine" || mineSubTab !== "antiguas") return []
    return listAntiguasRespondedConsultas(groups)
  }, [viewTab, mineSubTab, groups])

  const mineListEmpty =
    mineSubTab === "nuevas"
      ? visibleGroups.length === 0
      : visibleGroups.length === 0 && antiguasRespondidas.length === 0

  const showEmptyState =
    viewTab === "available"
      ? visibleGroups.length === 0
      : viewTab === "mine"
        ? mineListEmpty
        : false

  async function requestOtp() {
    setLoadingAuth(true)
    setError("")
    setSuccessMessage("")

    try {
      const data = await fetchJson<{
        devCode?: string
        message: string
        pendingApproval?: boolean
      }>("/api/auth/request-otp", {
        method: "POST",
        body: JSON.stringify({
          telefono,
          nombre: needsRegistration ? registerName : undefined,
          area: needsRegistration ? registerArea : undefined,
        }),
      })

      if (data.pendingApproval) {
        setNeedsRegistration(false)
        setSuccessMessage(data.message)
        return
      }

      setOtpSent(true)
      setNeedsRegistration(false)
      setDevCode(data.devCode || null)
      setSuccessMessage(data.message)
    } catch (currentError) {
      const message = currentError instanceof Error ? currentError.message : "No se pudo enviar el codigo."
      setError(message)
      if (message.toLowerCase().includes("nombre") || message.toLowerCase().includes("registrar")) {
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
      const data = await fetchJson<{
        runner?: Runner
        user?: { rol: string }
      }>("/api/auth/verify-otp", {
        method: "POST",
        body: JSON.stringify({ telefono, codigo }),
      })

      if (data.user?.rol === "admin") {
        window.location.href = "/admin"
        return
      }

      setRunner(data.runner || null)
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

  async function claimTicket(group: QueryGroupView) {
    setClaimingSku(group.sku)
    setError("")

    try {
      const data = await fetchJson<{ claimedConsultas: number }>("/api/queries/claim", {
        method: "POST",
        body: JSON.stringify({
          sku: group.sku,
          consultaIds: group.consultaIds,
        }),
      })

      setSuccessMessage(`Tomaste ${data.claimedConsultas} consulta(s) del SKU ${group.sku}.`)
      setViewTab("mine")
    } catch (currentError) {
      setError(currentError instanceof Error ? currentError.message : "No se pudo tomar la consulta.")
    } finally {
      setClaimingSku(null)
    }
  }

  async function updateRunnerFixedResponse(payload: { id: string; activo?: boolean; respuesta?: string }) {
    await fetchJson("/api/queries/fixed-responses", {
      method: "PATCH",
      body: JSON.stringify(payload),
    })
    setSuccessMessage("Respuesta fija actualizada.")
    await loadQueries("fixed")
  }

  async function saveEditedAnswer() {
    if (!editingConsulta) return

    setSavingEdit(true)
    setError("")
    setSuccessMessage("")

    try {
      const data = await fetchJson<{ whatsappOk?: boolean }>(`/api/queries/${editingConsulta.id}/respond`, {
        method: "PUT",
        body: JSON.stringify({ respuesta: editAnswer }),
      })

      if (data.whatsappOk === false) {
        setSuccessMessage("Respuesta actualizada, pero no se pudo reenviar WhatsApp. Revisa n8n.")
      } else {
        setSuccessMessage("Respuesta actualizada y reenviada por WhatsApp.")
      }
      setEditingConsulta(null)
      setEditAnswer("")
      await loadQueries(viewTab)
    } catch (currentError) {
      setError(currentError instanceof Error ? currentError.message : "No se pudo actualizar la respuesta.")
    } finally {
      setSavingEdit(false)
    }
  }

  async function saveAnswer() {
    if (!selected) return

    setSavingAnswer(true)
    setError("")

    try {
      const data = await fetchJson<{
        updatedConsultas: number
        estadoRespuesta?: AnswerMode
        whatsappOk?: boolean
        dispatchResults?: Array<{ ok: boolean; status?: number; error?: string }>
      }>("/api/queries/respond", {
        method: "POST",
        body: JSON.stringify({
          sku: selected.sku,
          consultaIds: selected.consultaIds,
          respuesta: answer,
          estadoRespuesta: answerMode,
          respuestaFija: respuestaFija && answerMode !== "ir_a_revisar",
        }),
      })

      if (data.whatsappOk === false) {
        const firstError = data.dispatchResults?.find((result) => !result.ok)
        const detail = firstError?.error
          ? ` Detalle: ${firstError.error}`
          : firstError?.status
            ? ` HTTP ${firstError.status}.`
            : ""
        setSuccessMessage(
          `Respuesta guardada, pero no se pudo enviar WhatsApp al picker. Revisa n8n runner-response-dispatch.${detail}`,
        )
      } else {
        setSuccessMessage(
          answerMode === "ir_a_revisar"
            ? `Aviso enviado al picker. El ticket del SKU ${selected.sku} sigue abierto para confirmar disponible/no disponible.`
            : `Respuesta definitiva guardada y enviada por WhatsApp para ${data.updatedConsultas} consulta(s) del SKU ${selected.sku}.`,
        )
      }
      setSelected(null)
      setAnswer("")
      setAnswerMode("disponible")
      setRespuestaFija(false)
      await loadQueries(viewTab)
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
                {otpSent ? "Iniciar sesion" : needsRegistration ? "Solicitar registro" : "Enviar codigo"}
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
              onClick={() => loadQueries(viewTab)}
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
          <MetricCard icon={MessageCircle} label="Consultas disponibles" value={metrics.pendingConsultas} />
          <MetricCard icon={PackageSearch} label="SKUs disponibles" value={metrics.pendingSkus} />
          <MetricCard icon={ArrowDownUp} label="Mis tickets" value={metrics.myTickets} />
          <MetricCard icon={CheckCircle2} label="Respondidas hoy" value={metrics.answeredToday} />
        </div>

        <div className="mt-4 grid grid-cols-3 rounded-md border border-[#cfd9e5] bg-[#f7f9fc] p-1 text-sm">
          <SortButton active={viewTab === "available"} onClick={() => setViewTab("available")}>
            Disponibles
          </SortButton>
          <SortButton active={viewTab === "mine"} onClick={() => setViewTab("mine")}>
            Mis solicitudes
          </SortButton>
          <SortButton active={viewTab === "fixed"} onClick={() => setViewTab("fixed")}>
            Resp. fijas
          </SortButton>
        </div>

        {viewTab !== "fixed" && (
          <div className="mt-4 flex flex-col gap-3 rounded-lg border border-[#d8e0ea] bg-white p-3 shadow-sm sm:mt-5 sm:flex-row sm:items-center sm:justify-between sm:p-4">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold">
                {viewTab === "available" ? "Solicitudes disponibles" : "Mis solicitudes"}
              </h2>
              <p className="mt-1 text-sm text-[#5c6f82]">
                {viewTab === "available"
                  ? "Toma un ticket para responderlo desde Mis solicitudes."
                  : "Responde los tickets que tomaste."}
              </p>
            </div>
            <QuerySortControls value={sortMode} onChange={setSortMode} />
          </div>
        )}

        {viewTab === "fixed" && (
          <div className="mt-4 rounded-lg border border-[#d8e0ea] bg-white p-3 shadow-sm sm:p-4">
            <h2 className="text-lg font-semibold">Respuestas fijas</h2>
            <p className="mt-1 text-sm text-[#5c6f82]">
              Respuestas permanentes que no expiran en la limpieza diaria. Referencia completa para consulta.
            </p>
          </div>
        )}

        {viewTab === "mine" && (
          <div className="mt-3 grid grid-cols-2 rounded-md border border-[#cfd9e5] bg-[#f7f9fc] p-1 text-sm">
            <SortButton active={mineSubTab === "nuevas"} onClick={() => setMineSubTab("nuevas")}>
              Nuevas
            </SortButton>
            <SortButton active={mineSubTab === "antiguas"} onClick={() => setMineSubTab("antiguas")}>
              Antiguas
            </SortButton>
          </div>
        )}

        {viewTab === "available" && (
          <div className="mt-3 rounded-lg border border-[#d8e0ea] bg-white p-3 sm:p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <Label htmlFor="available-area">Area</Label>
                <p className="text-sm text-[#5c6f82]">Filtra las solicitudes disponibles por area.</p>
              </div>
              <select
                id="available-area"
                className="h-10 w-full rounded-md border border-[#cfd9e5] bg-white px-3 text-sm sm:max-w-xs"
                value={availableAreaParam}
                onChange={(event) => setAvailableAreaParam(event.target.value)}
              >
                <option value="">Mi area</option>
                {availableAreas.map((area) => (
                  <option key={area} value={area}>
                    {formatAreaLabel(area)}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

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

        {viewTab !== "fixed" && !(viewTab === "mine" && mineSubTab === "antiguas") && (
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {visibleGroups.map((group) => (
            <div
              key={`${viewTab}-${group.sku}-${group.area}-${group.consultaIds.join("-")}`}
              className="min-w-0 rounded-lg border border-[#d8e0ea] bg-white p-3 shadow-sm sm:p-4"
            >
              <div className="flex gap-3">
                <ProductImage url={group.imagenUrl} alt={group.nombreProducto || group.marcaProducto || group.sku} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-wide text-[#6b7c8f]">SKU</p>
                      <h3 className="mt-1 break-all text-lg font-bold leading-snug sm:text-xl">{group.sku}</h3>
                      {group.nombreProducto && (
                        <p className="mt-1 text-sm font-semibold text-[#142033]">{group.nombreProducto}</p>
                      )}
                      {group.marcaProducto && (
                        <p className="mt-1 text-sm font-medium text-[#476179]">{group.marcaProducto}</p>
                      )}
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
                    <span className="rounded-md bg-[#e7f5ee] px-2 py-1 font-semibold text-[#1f6a4f]">
                      {formatArea(group.area)}
                    </span>
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
                  <div className="mt-4 flex gap-2">
                    {viewTab === "available" ? (
                      <Button
                        type="button"
                        className="bg-[#1f7a5b] text-white hover:bg-[#176449]"
                        onClick={() => claimTicket(group)}
                        disabled={claimingSku === group.sku}
                      >
                        {claimingSku === group.sku && <RefreshCw className="size-4 animate-spin" />}
                        Tomar
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        className="bg-[#1f7a5b] text-white hover:bg-[#176449]"
                        onClick={() => {
                          setSelected(group)
                          setAnswer("")
                          setAnswerMode("disponible")
                          setRespuestaFija(false)
                        }}
                      >
                        Responder
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </div>
            ))}
          </div>
        )}

        {viewTab === "mine" && mineSubTab === "antiguas" && (
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {antiguasRespondidas.map((consulta) => (
              <div
                key={consulta.id}
                className="min-w-0 rounded-lg border border-[#d8e0ea] bg-white p-3 shadow-sm sm:p-4"
              >
                <div className="flex gap-3">
                  <ProductImage url={consulta.imagenUrl} alt={consulta.nombreProducto || consulta.marcaProducto || consulta.sku} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-wide text-[#6b7c8f]">SKU</p>
                        <h3 className="mt-1 break-all text-lg font-bold leading-snug sm:text-xl">{consulta.sku}</h3>
                        {consulta.nombreProducto && (
                          <p className="mt-1 text-sm font-semibold text-[#142033]">{consulta.nombreProducto}</p>
                        )}
                        {consulta.marcaProducto && (
                          <p className="mt-1 text-sm font-medium text-[#476179]">{consulta.marcaProducto}</p>
                        )}
                      </div>
                      <span className="shrink-0 rounded-md bg-[#eefaf3] px-2.5 py-1 text-xs font-semibold text-[#1f6a4f]">
                        Respondida
                      </span>
                    </div>
                    <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-[#5c6f82]">
                      {consulta.respuesta_runner || "Sin respuesta registrada."}
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2 text-xs text-[#476179]">
                      <span className="rounded-md bg-[#f0f4f8] px-2 py-1">{formatAreaLabel(consulta.area)}</span>
                      {consulta.assigned_at && (
                        <span className="inline-flex items-center gap-1 rounded-md bg-[#f0f4f8] px-2 py-1">
                          <Clock3 className="size-3" />
                          {new Date(consulta.assigned_at).toLocaleString("es-CL")}
                        </span>
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      className="mt-4"
                      onClick={() => {
                        setEditingConsulta(consulta)
                        setEditAnswer(consulta.respuesta_runner || "")
                      }}
                    >
                      Editar respuesta
                    </Button>
                  </div>
                </div>
              </div>
            ))}
            {visibleGroups.map((group) => (
              <div
                key={`antiguas-pending-${group.sku}-${group.area}-${group.consultaIds.join("-")}`}
                className="min-w-0 rounded-lg border border-[#d8e0ea] bg-white p-3 shadow-sm sm:p-4"
              >
                <div className="flex gap-3">
                  <ProductImage url={group.imagenUrl} alt={group.nombreProducto || group.marcaProducto || group.sku} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-wide text-[#6b7c8f]">SKU</p>
                        <h3 className="mt-1 break-all text-lg font-bold leading-snug sm:text-xl">{group.sku}</h3>
                        {group.nombreProducto && (
                          <p className="mt-1 text-sm font-semibold text-[#142033]">{group.nombreProducto}</p>
                        )}
                        {group.marcaProducto && (
                          <p className="mt-1 text-sm font-medium text-[#476179]">{group.marcaProducto}</p>
                        )}
                      </div>
                      <span className="shrink-0 rounded-md bg-[#fff8e7] px-2.5 py-1 text-sm font-semibold text-[#745015]">
                        {group.total}
                      </span>
                    </div>
                    <p className="mt-3 line-clamp-2 text-sm leading-6 text-[#5c6f82]">
                      {group.sampleMessage || "Sin mensaje original registrado."}
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2 text-xs text-[#476179]">
                      <span className="rounded-md bg-[#f0f4f8] px-2 py-1">{group.pickers.length} picker(s)</span>
                      <span className="rounded-md bg-[#e7f5ee] px-2 py-1 font-semibold text-[#1f6a4f]">
                        {formatArea(group.area)}
                      </span>
                    </div>
                    <Button
                      type="button"
                      className="mt-4 bg-[#1f7a5b] text-white hover:bg-[#176449]"
                      onClick={() => {
                        setSelected(group)
                        setAnswer("")
                        setAnswerMode("disponible")
                        setRespuestaFija(false)
                      }}
                    >
                      Responder
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {viewTab === "fixed" && (
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {fixedResponses.map((response) => (
              <FixedResponseCard
                key={response.id}
                response={response}
                actions={
                  runner && response.telefono_runner === runner.telefono ? (
                    <FixedResponseManager
                      response={response}
                      canEdit
                      onUpdate={updateRunnerFixedResponse}
                    />
                  ) : undefined
                }
              />
            ))}
          </div>
        )}

        {!loadingData && viewTab === "fixed" && fixedResponses.length === 0 && (
          <div className="mt-4 rounded-lg border border-[#d8e0ea] bg-white p-8 text-center shadow-sm">
            <CheckCircle2 className="mx-auto size-10 text-[#1f7a5b]" />
            <h3 className="mt-3 text-lg font-semibold">No hay respuestas fijas</h3>
            <p className="mt-1 text-sm text-[#5c6f82]">
              Marca una respuesta como fija al responder un ticket para que quede registrada aqui.
            </p>
          </div>
        )}

        {!loadingData && viewTab !== "fixed" && showEmptyState && (
          <div className="mt-4 rounded-lg border border-[#d8e0ea] bg-white p-8 text-center shadow-sm">
            <CheckCircle2 className="mx-auto size-10 text-[#1f7a5b]" />
            <h3 className="mt-3 text-lg font-semibold">
              {viewTab === "available"
                ? "No hay solicitudes disponibles"
                : mineSubTab === "nuevas"
                  ? "No tienes tickets nuevos asignados"
                  : "No tienes solicitudes antiguas"}
            </h3>
            <p className="mt-1 text-sm text-[#5c6f82]">
              {viewTab === "available"
                ? "Cuando entren nuevos SKUs apareceran aqui."
                : mineSubTab === "nuevas"
                  ? "Toma tickets desde la pestana Disponibles."
                  : "Las consultas respondidas hace mas de 24 horas apareceran aqui."}
            </p>
          </div>
        )}
      </section>

      <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-h-[90vh] w-[calc(100vw-24px)] overflow-y-auto bg-white text-[#142033] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="break-all">Responder SKU {selected?.sku}</DialogTitle>
            <DialogDescription>Esta respuesta se enviara a los pickers asociados a este ticket.</DialogDescription>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="flex gap-3 rounded-md border border-[#d8e0ea] bg-[#f7f9fc] p-3">
                <ProductImage
                  url={selected.imagenUrl}
                  alt={selected.nombreProducto || selected.marcaProducto || selected.sku}
                  size="sm"
                />
                <div>
                  <p className="text-sm font-semibold">{selected.total} consulta(s) asignadas</p>
                  <p className="mt-1 text-sm text-[#476179]">
                    {selected.nombreProducto || "Producto no registrado"}
                    {selected.marcaProducto ? ` - ${selected.marcaProducto}` : ""} - {formatArea(selected.area)}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-[#5c6f82]">
                    {selected.sampleMessage || "Sin mensaje original."}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-3 rounded-md border border-[#cfd9e5] bg-[#f7f9fc] p-1 text-sm">
                <SortButton active={answerMode === "disponible"} onClick={() => setAnswerMode("disponible")}>
                  Disponible
                </SortButton>
                <SortButton active={answerMode === "no_disponible"} onClick={() => setAnswerMode("no_disponible")}>
                  No disponible
                </SortButton>
                <SortButton active={answerMode === "ir_a_revisar"} onClick={() => setAnswerMode("ir_a_revisar")}>
                  Ir a revisar
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
                      : answerMode === "ir_a_revisar"
                        ? "Ej: Estamos revisando el producto en sala. Te avisamos por este chat."
                        : "Ej: Disponible en pasillo 20 o usar producto alternativo ABC."
                  }
                  className="min-h-32 border-[#cfd9e5] bg-white text-base text-[#142033]"
                />
              </div>
              {answerMode !== "ir_a_revisar" && (
                <label className="flex items-center gap-2 text-sm text-[#476179]">
                  <Checkbox checked={respuestaFija} onCheckedChange={(checked) => setRespuestaFija(checked === true)} />
                  Marcar como respuesta fija (no expira en la limpieza diaria)
                </label>
              )}
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
              disabled={
                savingAnswer ||
                (answerMode === "disponible" && answer.trim().length < 2)
              }
            >
              {savingAnswer && <RefreshCw className="size-4 animate-spin" />}
              Aceptar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editingConsulta)} onOpenChange={(open) => !open && setEditingConsulta(null)}>
        <DialogContent className="max-h-[90vh] w-[calc(100vw-24px)] overflow-y-auto bg-white text-[#142033] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="break-all">Editar respuesta SKU {editingConsulta?.sku}</DialogTitle>
            <DialogDescription>
              La actualizacion se reenviara por WhatsApp a los pickers que consultaron este SKU hoy.
            </DialogDescription>
          </DialogHeader>
          {editingConsulta && (
            <div className="space-y-4">
              <div className="rounded-md border border-[#d8e0ea] bg-[#f7f9fc] p-3 text-sm text-[#476179]">
                {formatAreaLabel(editingConsulta.area)}
                {editingConsulta.assigned_at && (
                  <span className="ml-2">
                    - Asignada {new Date(editingConsulta.assigned_at).toLocaleString("es-CL")}
                  </span>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-respuesta">Respuesta actualizada</Label>
                <Textarea
                  id="edit-respuesta"
                  value={editAnswer}
                  onChange={(event) => setEditAnswer(event.target.value)}
                  className="min-h-32 border-[#cfd9e5] bg-white text-base text-[#142033]"
                />
              </div>
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setEditingConsulta(null)} disabled={savingEdit}>
              Cancelar
            </Button>
            <Button
              type="button"
              className="bg-[#1f7a5b] text-white hover:bg-[#176449]"
              onClick={saveEditedAnswer}
              disabled={savingEdit || editAnswer.trim().length < 2}
            >
              {savingEdit && <RefreshCw className="size-4 animate-spin" />}
              Guardar cambios
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  )
}

function ProductImage({
  url,
  alt,
  size = "md",
}: {
  url?: string | null
  alt: string
  size?: "sm" | "md"
}) {
  const [failed, setFailed] = useState(false)
  const className =
    size === "sm"
      ? "flex size-16 shrink-0 items-center justify-center rounded-md border border-[#d8e0ea] bg-[#f7f9fc]"
      : "flex size-20 shrink-0 items-center justify-center rounded-md border border-[#d8e0ea] bg-[#f7f9fc]"

  if (!url || failed) {
    return (
      <div className={className} title={alt}>
        <PackageSearch className="size-6 text-[#8aa0b5]" />
      </div>
    )
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={alt}
      className={`${className} object-cover`}
      onError={() => setFailed(true)}
    />
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
