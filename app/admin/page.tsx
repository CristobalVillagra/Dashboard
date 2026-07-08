"use client"

import { useEffect, useMemo, useState } from "react"
import { endOfWeek, format, startOfWeek } from "date-fns"
import { AlertCircle, CheckCircle2, ImagePlus, LogOut, RefreshCw, Search, ShieldCheck } from "lucide-react"
import { BrandFooter, BrandLogo } from "@/components/brand-logo"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { FixedResponseCard } from "@/components/fixed-response-card"
import { FixedResponseManager } from "@/components/fixed-response-manager"
import { ImageZoomModal } from "@/components/image-zoom-modal"
import { QuerySortControls } from "@/components/query-sort-controls"
import type { FixedResponseRecord } from "@/lib/fixed-responses"
import { formatAreaLabel } from "@/lib/areas"
import { groupConsultasBySku, sortQueryGroups, type QuerySortMode } from "@/lib/query-groups"

type AdminUser = {
  telefono: string
  nombre: string
  rol: "runner" | "admin" | "picker"
  area: string | null
  estado_usuario: string
}

type Backup = {
  id: string
  sg: string
  telefono_picker: string
  nombre_picker: string | null
  tipo_servicio: string
  foto_urls: string[]
  estado: string
  notas_admin: string | null
  drive_url: string | null
  drive_folder_url: string | null
  revisado_por: string | null
  revisado_en: string | null
  created_at: string
}

type Tab = "users" | "queries" | "demanded" | "products" | "fixed" | "backups"

function getCurrentWeekRange() {
  const now = new Date()
  return {
    desde: format(startOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd"),
    hasta: format(endOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd"),
  }
}

type AdminQuery = {
  id: string
  sku: string
  marca_producto: string | null
  area: string | null
  telefono_picker: string | null
  estado: string
  respuesta_runner: string | null
  nombre_runner: string | null
  created_at: string | null
  responded_at: string | null
}

type Product = {
  sku: string
  nombre_producto: string | null
  marca_producto: string | null
  area: string | null
  imagen_url: string | null
  activo: boolean
  local_id: string | null
  reportes_no_disponible?: number | null
  ultimo_reporte_no_disponible?: string | null
  ultimo_estado_reportado?: string | null
  fixed_respuesta?: string | null
  fixed_activo?: boolean | null
  fixed_runner?: string | null
  fixed_estado?: string | null
  runners_reportando?: number
  reporte_stale?: boolean
  reporte_multiples_runners?: boolean
  no_registrado?: boolean
  consultas_abiertas?: number
}

type DemandedProduct = {
  sku: string
  nombre_producto: string | null
  marca_producto: string | null
  cantidad_consultas: number
  cantidad_no_encontrado: number
  porcentaje_no_encontrado: number
}

type FixedResponse = FixedResponseRecord

export default function AdminPage() {
  const [checkingSession, setCheckingSession] = useState(true)
  const [admin, setAdmin] = useState<{ telefono: string; nombre: string } | null>(null)
  const [tab, setTab] = useState<Tab>("users")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")

  const [telefono, setTelefono] = useState("")
  const [codigo, setCodigo] = useState("")
  const [otpSent, setOtpSent] = useState(false)
  const [devCode, setDevCode] = useState<string | null>(null)
  const [loadingAuth, setLoadingAuth] = useState(false)

  const [pendingUsers, setPendingUsers] = useState<AdminUser[]>([])
  const [users, setUsers] = useState<AdminUser[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [demandedProducts, setDemandedProducts] = useState<DemandedProduct[]>([])
  const [demandedDays, setDemandedDays] = useState<1 | 7 | 30>(1)
  const [fixedResponses, setFixedResponses] = useState<FixedResponse[]>([])
  const [adminQueries, setAdminQueries] = useState<AdminQuery[]>([])
  const [backups, setBackups] = useState<Backup[]>([])
  const [backupEstado, setBackupEstado] = useState<"pendiente" | "revisado" | "rechazado" | "all">("pendiente")
  const [reviewingBackup, setReviewingBackup] = useState<string | null>(null)
  const [dispatchingBackup, setDispatchingBackup] = useState<string | null>(null)
  const [backupSgSearch, setBackupSgSearch] = useState("")
  const [backupSgResults, setBackupSgResults] = useState<Backup[] | null>(null)
  const [loadingBackupSg, setLoadingBackupSg] = useState(false)
  const [filtroTipo, setFiltroTipo] = useState<string | null>(null)
  const [approvalAreas, setApprovalAreas] = useState<Record<string, string>>({})
  const [querySortMode, setQuerySortMode] = useState<QuerySortMode>("newest")
  const [queryDesde, setQueryDesde] = useState(() => getCurrentWeekRange().desde)
  const [queryHasta, setQueryHasta] = useState(() => getCurrentWeekRange().hasta)
  const [exportingQueries, setExportingQueries] = useState(false)
  const [newUser, setNewUser] = useState({
    telefono: "",
    nombre: "",
    rol: "runner" as "runner" | "admin" | "picker",
    area: "frio",
    estadoUsuario: "activo",
  })

  const [newProduct, setNewProduct] = useState({
    sku: "",
    nombreProducto: "",
    marcaProducto: "",
    area: "frio",
    imagenUrl: "",
  })
  const [newProductImage, setNewProductImage] = useState<File | null>(null)
  const [productSearch, setProductSearch] = useState("")
  const [productView, setProductView] = useState<"catalogo" | "no_registrados">("catalogo")

  const filteredProducts = useMemo(() => {
    const query = productSearch.trim().toLowerCase()
    const scopedProducts =
      productView === "no_registrados"
        ? products.filter((product) => product.no_registrado)
        : products.filter((product) => !product.no_registrado)

    if (!query) return scopedProducts
    return scopedProducts.filter(
      (product) =>
        product.sku.toLowerCase().includes(query) ||
        (product.nombre_producto || "").toLowerCase().includes(query) ||
        (product.marca_producto || "").toLowerCase().includes(query),
    )
  }, [products, productSearch, productView])

  const visibleQueryGroups = useMemo(() => {
    const rows = adminQueries.map((query) => ({
      id: query.id,
      sku: query.sku,
      marca_producto: query.marca_producto,
      area: query.area,
      telefono_picker: query.telefono_picker,
      mensaje_original: query.respuesta_runner,
      created_at: query.created_at || query.responded_at,
    }))
    return sortQueryGroups(groupConsultasBySku(rows), querySortMode)
  }, [adminQueries, querySortMode])

  async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
    const response = await fetch(url, {
      ...options,
      headers: { "content-type": "application/json", ...(options?.headers || {}) },
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data.error || "Error inesperado.")
    return data as T
  }

  useEffect(() => {
    async function checkSession() {
      try {
        const data = await fetchJson<{
          user?: { telefono: string; nombre: string; rol: string }
        }>("/api/session")

        if (data.user?.rol === "admin") {
          setAdmin({ telefono: data.user.telefono, nombre: data.user.nombre })
        } else if (data.user?.rol === "runner") {
          window.location.href = "/"
        } else if (data.user?.rol === "picker") {
          window.location.href = "/picker"
        }
      } catch {
        setAdmin(null)
      } finally {
        setCheckingSession(false)
      }
    }

    checkSession()
  }, [])

  useEffect(() => {
    if (admin && tab !== "demanded" && tab !== "backups") loadTab(tab)
  }, [admin, tab])

  useEffect(() => {
    if (admin && tab === "demanded") loadTab("demanded")
  }, [admin, tab, demandedDays])

  useEffect(() => {
    if (admin && tab === "backups") loadTab("backups")
  }, [admin, tab, backupEstado])

  async function loadTab(current: Tab) {
    setLoading(true)
    setError("")
    try {
      if (current === "users") {
        const data = await fetchJson<{ users: AdminUser[] }>("/api/admin/users?estado=all")
        setUsers(data.users)
        setPendingUsers(data.users.filter((user) => user.estado_usuario === "pendiente_aprobacion"))
      } else if (current === "queries") {
        const data = await fetchJson<{ queries: AdminQuery[] }>("/api/admin/queries")
        setAdminQueries(data.queries)
      } else if (current === "demanded") {
        const data = await fetchJson<{ products: DemandedProduct[] }>(`/api/admin/demanded-products?days=${demandedDays}`)
        setDemandedProducts(data.products)
      } else if (current === "products") {
        const data = await fetchJson<{ products: Product[] }>("/api/admin/products")
        setProducts(data.products)
      } else if (current === "backups") {
        const data = await fetchJson<{ backups: Backup[] }>(`/api/admin/backups?estado=${backupEstado}`)
        setBackups(data.backups)
      } else {
        const data = await fetchJson<{ responses: FixedResponse[] }>("/api/admin/fixed-responses")
        setFixedResponses(data.responses)
      }
    } catch (currentError) {
      setError(currentError instanceof Error ? currentError.message : "No se pudo cargar datos.")
    } finally {
      setLoading(false)
    }
  }

  async function requestOtp() {
    setLoadingAuth(true)
    setError("")
    try {
      const data = await fetchJson<{ message: string; devCode?: string }>("/api/auth/request-otp", {
        method: "POST",
        body: JSON.stringify({ telefono }),
      })
      setOtpSent(true)
      setDevCode(data.devCode || null)
      setSuccess(data.message)
    } catch (currentError) {
      setError(currentError instanceof Error ? currentError.message : "No se pudo enviar codigo.")
    } finally {
      setLoadingAuth(false)
    }
  }

  async function verifyOtp() {
    setLoadingAuth(true)
    setError("")
    try {
      const data = await fetchJson<{
        user?: { telefono: string; nombre: string; rol: string }
      }>("/api/auth/verify-otp", {
        method: "POST",
        body: JSON.stringify({ telefono, codigo }),
      })

      if (data.user?.rol === "picker") {
        window.location.href = "/picker"
        return
      }
      if (data.user?.rol === "runner") {
        window.location.href = "/"
        return
      }
      if (data.user?.rol !== "admin") {
        window.location.href = "/"
        return
      }

      setAdmin({ telefono: data.user.telefono, nombre: data.user.nombre })
      setOtpSent(false)
      setSuccess("Sesion admin iniciada.")
    } catch (currentError) {
      setError(currentError instanceof Error ? currentError.message : "Codigo invalido.")
    } finally {
      setLoadingAuth(false)
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" })
    setAdmin(null)
  }

  async function reviewBackup(id: string, estado: "revisado" | "rechazado", notas?: string, motivoRechazo?: string) {
    setReviewingBackup(id)
    try {
      await fetchJson("/api/admin/backups", {
        method: "PATCH",
        body: JSON.stringify({ id, estado, notas_admin: notas || null, motivoRechazo: motivoRechazo || null }),
      })
      const now = new Date().toISOString()
      const patch = { estado, revisado_por: admin?.nombre || null, revisado_en: now }
      setBackups((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)))
      setBackupSgResults((prev) => prev ? prev.map((b) => (b.id === id ? { ...b, ...patch } : b)) : null)
      setSuccess(`Respaldo marcado como ${estado}.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo actualizar el respaldo.")
    } finally {
      setReviewingBackup(null)
    }
  }

  async function dispatchToDrive(id: string) {
    setDispatchingBackup(id)
    setError("")
    try {
      const data = await fetchJson<{ ok: boolean; skipped?: boolean; message?: string }>("/api/admin/backups", {
        method: "POST",
        body: JSON.stringify({ id }),
      })
      setSuccess(data.message || "Enviado a Drive correctamente.")
      // Recargar el backup para mostrar el link de Drive actualizado
      setTimeout(() => loadTab("backups"), 4000)
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo enviar a Drive.")
    } finally {
      setDispatchingBackup(null)
    }
  }

  async function buscarPorSg(sg: string, tipoServicio?: string | null) {
    const clean = sg.trim()
    if (!clean && !tipoServicio) return
    if (clean && !/^\d{4}$/.test(clean)) return
    setLoadingBackupSg(true)
    setError("")
    try {
      const params = new URLSearchParams()
      if (clean) params.set("sg", clean)
      if (tipoServicio) params.set("tipo_servicio", tipoServicio)
      const data = await fetchJson<{ backups: Backup[] }>(`/api/admin/backups?${params.toString()}`)
      setBackupSgResults(data.backups)
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo buscar respaldos.")
      setBackupSgResults([])
    } finally {
      setLoadingBackupSg(false)
    }
  }

  async function approveUser(user: AdminUser, area?: string) {
    try {
      await fetchJson("/api/admin/users", {
        method: "PATCH",
        body: JSON.stringify({ telefono: user.telefono, action: "aprobar", area: area || null }),
      })
      setSuccess(`${user.nombre} aprobado correctamente.`)
      await loadTab("users")
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo aprobar el usuario.")
    }
  }

  async function rejectUser(user: AdminUser) {
    await fetchJson("/api/admin/users", {
      method: "PATCH",
      body: JSON.stringify({ telefono: user.telefono, action: "rechazar" }),
    })
    setSuccess(`Usuario ${user.nombre} rechazado.`)
    await loadTab("users")
  }

  async function createUser() {
    await fetchJson("/api/admin/users", {
      method: "POST",
      body: JSON.stringify(newUser),
    })
    const rolLabel = newUser.rol === "admin" ? "Admin" : newUser.rol === "picker" ? "Picker" : "Runner"
    const acceso = newUser.rol === "picker" ? "en /picker" : "por SMS/WhatsApp"
    setSuccess(`${rolLabel} creado. Ya puede solicitar OTP ${acceso}.`)
    setNewUser({ telefono: "", nombre: "", rol: "runner", area: "frio", estadoUsuario: "activo" })
    await loadTab("users")
  }

  async function exportQueries() {
    setExportingQueries(true)
    setError("")
    setSuccess("")
    try {
      const params = new URLSearchParams({ desde: queryDesde, hasta: queryHasta })
      const response = await fetch(`/api/admin/queries/export?${params}`)
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || "No se pudo exportar.")
      }
      const blob = await response.blob()
      const disposition = response.headers.get("content-disposition")
      const filenameMatch = disposition?.match(/filename="([^"]+)"/)
      const filename = filenameMatch?.[1] || `consultas_${queryDesde}_${queryHasta}.xlsx`
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = filename
      link.click()
      URL.revokeObjectURL(url)
      setSuccess("Archivo Excel descargado.")
    } catch (currentError) {
      setError(currentError instanceof Error ? currentError.message : "No se pudo exportar.")
    } finally {
      setExportingQueries(false)
    }
  }

  async function createProduct() {
    const formData = new FormData()
    formData.append("sku", newProduct.sku)
    formData.append("nombreProducto", newProduct.nombreProducto)
    formData.append("marcaProducto", newProduct.marcaProducto)
    formData.append("area", newProduct.area)
    formData.append("imagenUrl", newProduct.imagenUrl)
    if (newProductImage) formData.append("imagen", newProductImage)

    await fetchForm("/api/admin/products", {
      method: "POST",
      body: formData,
    })
    setSuccess("Producto guardado.")
    setNewProduct({ sku: "", nombreProducto: "", marcaProducto: "", area: "frio", imagenUrl: "" })
    setNewProductImage(null)
    await loadTab("products")
  }

  async function fetchForm<T>(url: string, options: RequestInit): Promise<T> {
    const response = await fetch(url, options)
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data.error || "Error inesperado.")
    return data as T
  }

  async function updateUser(user: AdminUser, updates: Partial<AdminUser>) {
    await fetchJson("/api/admin/users", {
      method: "PATCH",
      body: JSON.stringify({
        telefono: user.telefono,
        action: "editar",
        nombre: updates.nombre ?? user.nombre,
        rol: updates.rol ?? user.rol,
        area: updates.area ?? user.area,
        estadoUsuario: updates.estado_usuario ?? user.estado_usuario,
      }),
    })
    setSuccess(`Usuario ${updates.nombre ?? user.nombre} actualizado.`)
    await loadTab("users")
  }

  async function updateProduct(
    product: Product,
    updates: Partial<Product>,
    image?: File | null,
    newSku?: string,
  ) {
    const formData = new FormData()
    formData.append("sku", product.sku)
    if (newSku && newSku !== product.sku) formData.append("newSku", newSku)
    formData.append("nombreProducto", updates.nombre_producto ?? product.nombre_producto ?? "")
    formData.append("marcaProducto", updates.marca_producto ?? product.marca_producto ?? "")
    formData.append("area", updates.area ?? product.area ?? "")
    formData.append("imagenUrl", updates.imagen_url ?? product.imagen_url ?? "")
    formData.append("activo", String(updates.activo ?? product.activo))
    if (image) formData.append("imagen", image)

    await fetchForm("/api/admin/products", {
      method: product.no_registrado ? "POST" : "PATCH",
      body: formData,
    })
    setSuccess(`Producto ${newSku && newSku !== product.sku ? newSku : product.sku} actualizado.`)
    await loadTab("products")
  }

  async function updateFixedResponse(payload: { id: string; activo?: boolean; respuesta?: string }) {
    const removedItem = payload.activo === false
      ? fixedResponses.find((r) => r.id === payload.id) ?? null
      : null

    if (removedItem) {
      setFixedResponses((prev) => prev.filter((r) => r.id !== payload.id))
    }

    try {
      await fetchJson("/api/admin/fixed-responses", {
        method: "PATCH",
        body: JSON.stringify(payload),
      })
      setSuccess(
        payload.activo === false
          ? "Llegada a bodega confirmada. Respuesta automática desactivada."
          : "Respuesta fija actualizada.",
      )
      if (payload.activo !== false) {
        await loadTab("fixed")
      }
    } catch (err) {
      if (removedItem) {
        setFixedResponses((prev) => [...prev, removedItem])
      }
      setError(err instanceof Error ? err.message : "No se pudo actualizar la respuesta.")
    }
  }

  if (checkingSession) {
    return <CenteredMessage icon={RefreshCw} spin text="Cargando usuario..." />
  }

  if (!admin) {
    return (
      <main className="min-h-screen bg-[#f5f7fb] px-4 py-5 text-[#142033]">
        <section className="mx-auto flex min-h-[calc(100vh-40px)] w-full max-w-md flex-col justify-center">
          <div className="mb-6 flex flex-col items-start gap-2">
            <BrandLogo height={32} width={130} />
            <div>
              <h1 className="text-2xl font-bold text-[#142033]">Panel Admin</h1>
              <p className="text-sm text-[#5c6f82]">Acceso restringido</p>
            </div>
          </div>
          <div className="rounded-lg border border-[#d8e0ea] bg-white p-5 shadow-sm">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Celular admin</Label>
                <Input value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="+569..." />
              </div>
              {otpSent && (
                <div className="space-y-2">
                  <Label>Codigo</Label>
                  <Input value={codigo} onChange={(e) => setCodigo(e.target.value)} maxLength={6} />
                </div>
              )}
              {devCode && <p className="text-sm text-[#745015]">Codigo dev: {devCode}</p>}
              {error && <Alert text={error} />}
              {success && <Success text={success} />}
              <Button
                className="w-full bg-[#1f7a5b] text-white"
                onClick={otpSent ? verifyOtp : requestOtp}
                disabled={loadingAuth}
              >
                {otpSent ? "Iniciar sesion" : "Enviar codigo"}
              </Button>
            </div>
          </div>
          <div className="mt-6">
            <BrandFooter />
          </div>
        </section>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[#f5f7fb] text-[#142033]">
      <header className="border-b border-[#dce4ee] bg-white px-4 py-3 sm:px-6">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div className="flex items-center gap-3">
            <BrandLogo height={24} width={90} />
            <div className="h-4 w-px bg-[#dce8f0]" />
            <div>
              <p className="text-xs text-[#5c6f82]">Panel de administrador</p>
              <h1 className="text-sm font-bold text-[#142033]">{admin.nombre}</h1>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="icon" onClick={() => loadTab(tab)} disabled={loading}>
              <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
            <Button variant="outline" size="icon" onClick={logout}>
              <LogOut className="size-4" />
            </Button>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-4 py-5 sm:px-6">
        <div className="grid grid-cols-3 gap-1 rounded-md border border-[#cfd9e5] bg-[#f7f9fc] p-1 text-sm sm:grid-cols-6">
          <TabButton active={tab === "users"} onClick={() => setTab("users")}>
            Usuarios
          </TabButton>
          <TabButton active={tab === "queries"} onClick={() => setTab("queries")}>
            Consultas
          </TabButton>
          <TabButton active={tab === "demanded"} onClick={() => setTab("demanded")}>
            Demandados
          </TabButton>
          <TabButton active={tab === "products"} onClick={() => setTab("products")}>
            Catalogo
          </TabButton>
          <TabButton active={tab === "fixed"} onClick={() => setTab("fixed")}>
            Resp. fijas
          </TabButton>
          <TabButton active={tab === "backups"} onClick={() => setTab("backups")}>
            Respaldos
          </TabButton>
        </div>

        {error && <div className="mt-4"><Alert text={error} /></div>}
        {success && <div className="mt-4"><Success text={success} /></div>}

        {tab === "users" && (
          <div className="mt-4 space-y-4">
            <div className="rounded-lg border border-[#d8e0ea] bg-white p-4">
              <h3 className="font-semibold">Crear usuario autorizado</h3>
              <p className="mt-1 text-sm text-[#5c6f82]">
                Runners y admins reciben el OTP por SMS. Pickers ingresan desde <strong>/picker</strong>.
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <Input
                  placeholder="+569..."
                  value={newUser.telefono}
                  onChange={(e) => setNewUser({ ...newUser, telefono: e.target.value })}
                />
                <Input
                  placeholder="Nombre"
                  value={newUser.nombre}
                  onChange={(e) => setNewUser({ ...newUser, nombre: e.target.value })}
                />
                <select
                  className="h-10 rounded-md border border-[#cfd9e5] bg-white px-3 text-sm"
                  value={newUser.rol}
                  onChange={(e) => setNewUser({ ...newUser, rol: e.target.value as "runner" | "admin" | "picker" })}
                >
                  <option value="runner">Runner</option>
                  <option value="picker">Picker</option>
                  <option value="admin">Admin</option>
                </select>
                {newUser.rol === "runner" && (
                  <select
                    className="h-10 rounded-md border border-[#cfd9e5] bg-white px-3 text-sm"
                    value={newUser.area}
                    onChange={(e) => setNewUser({ ...newUser, area: e.target.value })}
                  >
                    <option value="frio">Frio</option>
                    <option value="sala">Sala</option>
                    <option value="gm">GM</option>
                  </select>
                )}
              </div>
              <Button className="mt-3 bg-[#1f7a5b] text-white" onClick={createUser}>
                Crear usuario
              </Button>
            </div>

            {pendingUsers.length === 0 && <Empty text="No hay usuarios pendientes de aprobacion." />}
            {pendingUsers.map((user) => {
              const isPicker = user.rol === "picker"
              const selectedArea = approvalAreas[user.telefono] || "frio"
              return (
                <div key={user.telefono} className="rounded-lg border border-[#d8e0ea] bg-white p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-[#142033]">{user.nombre}</p>
                      <p className="text-sm text-[#5c6f82]">{user.telefono}</p>
                      <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                        isPicker ? "bg-blue-100 text-blue-700" : "bg-[#e8f5f0] text-[#1f6a4f]"
                      }`}>
                        {isPicker ? "Picker" : "Runner"}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {!isPicker && (
                        <select
                          className="h-9 rounded-md border border-[#cfd9e5] bg-white px-2 text-sm"
                          value={selectedArea}
                          onChange={(e) =>
                            setApprovalAreas((prev) => ({ ...prev, [user.telefono]: e.target.value }))
                          }
                        >
                          <option value="frio">Frio</option>
                          <option value="sala">Sala</option>
                          <option value="gm">GM</option>
                        </select>
                      )}
                      <Button
                        size="sm"
                        className="bg-[#1f7a5b] text-white hover:bg-[#176449]"
                        onClick={() => approveUser(user, isPicker ? undefined : selectedArea)}
                      >
                        <CheckCircle2 className="size-3.5" />
                        Aprobar
                      </Button>
                      <Button size="sm" variant="outline" className="border-red-200 text-red-600 hover:bg-red-50" onClick={() => rejectUser(user)}>
                        Rechazar
                      </Button>
                    </div>
                  </div>
                </div>
              )
            })}

            <div className="rounded-lg border border-[#d8e0ea] bg-white p-4">
              <h3 className="font-semibold">Usuarios registrados</h3>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[620px] text-left text-sm">
                  <thead className="text-xs uppercase text-[#5c6f82]">
                    <tr>
                      <th className="py-2">Nombre</th>
                      <th>Telefono</th>
                      <th>Rol</th>
                      <th>Area</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user) => (
                      <UserRow key={`${user.rol}-${user.telefono}`} user={user} onSave={updateUser} />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {tab === "queries" && (
          <div className="mt-4 space-y-4">
            <div className="rounded-lg border border-[#d8e0ea] bg-white p-4">
              <h3 className="font-semibold">Exportar consultas</h3>
              <p className="mt-1 text-sm leading-6 text-[#5c6f82]">
                Descarga el historial de consultas respondidas en el rango seleccionado. Por defecto se usa la semana
                actual (lunes a domingo).
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="query-desde">Desde</Label>
                  <Input
                    id="query-desde"
                    type="date"
                    value={queryDesde}
                    onChange={(e) => setQueryDesde(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="query-hasta">Hasta</Label>
                  <Input
                    id="query-hasta"
                    type="date"
                    value={queryHasta}
                    onChange={(e) => setQueryHasta(e.target.value)}
                  />
                </div>
              </div>
              <Button
                className="mt-4 bg-[#1f7a5b] text-white"
                onClick={exportQueries}
                disabled={exportingQueries || !queryDesde || !queryHasta}
              >
                {exportingQueries ? "Exportando..." : "Exportar a Excel"}
              </Button>
            </div>
            <div className="rounded-lg border border-[#d8e0ea] bg-white p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="font-semibold">Historial de consultas</h3>
                  <p className="mt-1 text-sm text-[#5c6f82]">
                    Consultas respondidas cargadas en memoria. El ordenamiento se aplica en el navegador.
                  </p>
                </div>
                <div className="w-full sm:max-w-xl">
                  <QuerySortControls value={querySortMode} onChange={setQuerySortMode} />
                </div>
              </div>
              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                {visibleQueryGroups.map((group) => (
                  <div key={`${group.sku}-${group.area}-${group.marcaProducto}`} className="rounded-lg border border-[#d8e0ea] bg-[#f7f9fc] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold break-all">SKU {group.sku}</p>
                        {group.marcaProducto && (
                          <p className="mt-1 text-sm font-medium text-[#476179]">{group.marcaProducto}</p>
                        )}
                      </div>
                      <span className="shrink-0 rounded-md bg-[#e7f5ee] px-2.5 py-1 text-sm font-semibold text-[#1f6a4f]">
                        {group.total}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-[#476179]">
                      <span className="rounded-md bg-white px-2 py-1">{formatAreaLabel(group.area)}</span>
                      <span className="rounded-md bg-white px-2 py-1">{group.pickers.length} picker(s)</span>
                    </div>
                    {group.sampleMessage && (
                      <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-[#5c6f82]">
                        {group.sampleMessage}
                      </p>
                    )}
                  </div>
                ))}
              </div>
              {!loading && visibleQueryGroups.length === 0 && (
                <Empty text="No hay consultas respondidas para mostrar." />
              )}
            </div>
          </div>
        )}

        {tab === "demanded" && (
          <div className="mt-4 space-y-4">
            <div className="rounded-lg border border-[#d8e0ea] bg-white p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="font-semibold">Productos mas demandados</h3>
                  <p className="mt-1 text-sm text-[#5c6f82]">
                    Ranking basado en consultas SKU recibidas por WhatsApp.
                  </p>
                </div>
                <div className="grid grid-cols-3 rounded-md border border-[#cfd9e5] bg-[#f7f9fc] p-1 text-sm">
                  <TabButton active={demandedDays === 1} onClick={() => setDemandedDays(1)}>
                    24h
                  </TabButton>
                  <TabButton active={demandedDays === 7} onClick={() => setDemandedDays(7)}>
                    7 dias
                  </TabButton>
                  <TabButton active={demandedDays === 30} onClick={() => setDemandedDays(30)}>
                    30 dias
                  </TabButton>
                </div>
              </div>
            </div>

            {demandedProducts.length === 0 && !loading ? (
              <Empty text="Aun no hay consultas registradas para este periodo." />
            ) : (
              <div className="grid gap-3 lg:grid-cols-2">
                {demandedProducts.map((product) => {
                  const percentage = Number(product.porcentaje_no_encontrado || 0)
                  const urgent = percentage > 30

                  return (
                    <div key={product.sku} className="rounded-lg border border-[#d8e0ea] bg-white p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold uppercase text-[#6b7c8f]">SKU</p>
                          <h4 className="mt-1 break-all text-lg font-bold">{product.sku}</h4>
                          <p className="mt-1 text-sm font-semibold text-[#142033]">
                            {product.nombre_producto || "Producto sin registrar"}
                          </p>
                          {product.marca_producto && (
                            <p className="mt-1 text-sm text-[#476179]">{product.marca_producto}</p>
                          )}
                        </div>
                        {urgent ? (
                          <span className="shrink-0 rounded-md bg-[#fff1f0] px-2.5 py-1 text-xs font-semibold text-[#9b2c2c]">
                            Reposicion urgente
                          </span>
                        ) : (
                          <span className="shrink-0 rounded-md bg-[#e7f5ee] px-2.5 py-1 text-xs font-semibold text-[#1f6a4f]">
                            Normal
                          </span>
                        )}
                      </div>
                      <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
                        <div className="rounded-md bg-[#f7f9fc] p-3">
                          <p className="text-xs text-[#5c6f82]">Consultas</p>
                          <p className="mt-1 text-xl font-bold">{product.cantidad_consultas}</p>
                        </div>
                        <div className="rounded-md bg-[#f7f9fc] p-3">
                          <p className="text-xs text-[#5c6f82]">No encontrado</p>
                          <p className="mt-1 text-xl font-bold">{product.cantidad_no_encontrado}</p>
                        </div>
                        <div className="rounded-md bg-[#f7f9fc] p-3">
                          <p className="text-xs text-[#5c6f82]">% quiebre</p>
                          <p className={`mt-1 text-xl font-bold ${urgent ? "text-[#9b2c2c]" : ""}`}>
                            {percentage.toFixed(1)}%
                          </p>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {tab === "products" && (
          <div className="mt-4 space-y-4">
            <div className="rounded-lg border border-[#d8e0ea] bg-white p-4">
              <h3 className="font-semibold">Nuevo producto</h3>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <Input placeholder="SKU" value={newProduct.sku} onChange={(e) => setNewProduct({ ...newProduct, sku: e.target.value })} />
                <Input placeholder="Nombre" value={newProduct.nombreProducto} onChange={(e) => setNewProduct({ ...newProduct, nombreProducto: e.target.value })} />
                <Input placeholder="Marca" value={newProduct.marcaProducto} onChange={(e) => setNewProduct({ ...newProduct, marcaProducto: e.target.value })} />
                <select
                  className="h-10 rounded-md border border-[#cfd9e5] bg-white px-3 text-sm"
                  value={newProduct.area}
                  onChange={(e) => setNewProduct({ ...newProduct, area: e.target.value })}
                >
                  <option value="frio">Frio</option>
                  <option value="sala">Sala</option>
                  <option value="gm">GM</option>
                </select>
                <Input placeholder="Imagen URL opcional" value={newProduct.imagenUrl} onChange={(e) => setNewProduct({ ...newProduct, imagenUrl: e.target.value })} />
                <label className="flex h-10 cursor-pointer items-center gap-2 rounded-md border border-[#cfd9e5] bg-white px-3 text-sm text-[#476179]">
                  <ImagePlus className="size-4" />
                  <span className="truncate">{newProductImage ? newProductImage.name : "Subir foto JPG/PNG/WebP/AVIF"}</span>
                  <input
                    className="sr-only"
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif"
                    onChange={(e) => setNewProductImage(e.target.files?.[0] || null)}
                  />
                </label>
              </div>
              <Button className="mt-3 bg-[#1f7a5b] text-white" onClick={createProduct}>
                Guardar producto
              </Button>
            </div>
            <div className="rounded-lg border border-[#d8e0ea] bg-white p-4">
              <h3 className="font-semibold">Catalogo de productos</h3>
              <div className="mt-3 grid grid-cols-2 rounded-md border border-[#cfd9e5] bg-[#f7f9fc] p-1 text-sm">
                <TabButton active={productView === "catalogo"} onClick={() => setProductView("catalogo")}>
                  Registrados
                </TabButton>
                <TabButton active={productView === "no_registrados"} onClick={() => setProductView("no_registrados")}>
                  No registrados ({products.filter((product) => product.no_registrado).length})
                </TabButton>
              </div>
              <div className="relative mt-3">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#8aa0b5]" />
                <Input
                  className="pl-9"
                  placeholder="Buscar por SKU, nombre o marca..."
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                />
              </div>
              {productSearch.trim() && (
                <p className="mt-2 text-sm text-[#5c6f82]">
                  {filteredProducts.length} resultado(s)
                </p>
              )}
            </div>
            {filteredProducts.length === 0 && productSearch.trim() ? (
              <Empty text="Ningun producto coincide con la busqueda." />
            ) : filteredProducts.length === 0 && productView === "no_registrados" ? (
              <Empty text="No hay SKU no registrados con consultas abiertas." />
            ) : (
              filteredProducts.map((product) => (
                <ProductEditor key={product.sku} product={product} onSave={updateProduct} />
              ))
            )}
          </div>
        )}

        {tab === "fixed" && (
          <div className="mt-4 space-y-3">
            {fixedResponses.length === 0 && !loading && (
              <Empty text="No hay respuestas fijas registradas." />
            )}
            {fixedResponses.map((response) => (
              <FixedResponseCard
                key={response.id}
                response={response}
                actions={<FixedResponseManager response={response} canEdit onUpdate={updateFixedResponse} />}
              />
            ))}
          </div>
        )}

        {tab === "backups" && (
          <div className="mt-4 space-y-4">
            {/* Buscador por SG */}
            <div className="rounded-lg border border-[#d8e0ea] bg-white p-4">
              <h3 className="font-semibold">Buscar por SG</h3>
              <div className="mt-3 flex flex-wrap gap-2">
                {["Uber", "Pickup", "Driver", "Bicci"].map((tipo) => (
                  <button
                    key={tipo}
                    type="button"
                    onClick={() => {
                      const next = filtroTipo === tipo ? null : tipo
                      setFiltroTipo(next)
                      if (next || backupSgSearch.length === 4) {
                        buscarPorSg(backupSgSearch, next)
                      } else {
                        setBackupSgResults(null)
                      }
                    }}
                    className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                      filtroTipo === tipo
                        ? "bg-blue-600 text-white"
                        : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                    }`}
                  >
                    {tipo}
                  </button>
                ))}
              </div>
              <div className="mt-3 flex gap-2">
                <Input
                  placeholder="Buscar por SG..."
                  inputMode="numeric"
                  pattern="[0-9]{4}"
                  maxLength={4}
                  value={backupSgSearch}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, "").slice(0, 4)
                    setBackupSgSearch(v)
                    if (v.length < 4 && !filtroTipo) setBackupSgResults(null)
                  }}
                  onKeyDown={(e) => e.key === "Enter" && buscarPorSg(backupSgSearch, filtroTipo)}
                  className="max-w-xs"
                />
                <Button
                  className="bg-[#1f7a5b] text-white hover:bg-[#176449]"
                  onClick={() => buscarPorSg(backupSgSearch, filtroTipo)}
                  disabled={loadingBackupSg || (backupSgSearch.length > 0 && backupSgSearch.length < 4) || (!backupSgSearch && !filtroTipo)}
                >
                  {loadingBackupSg ? <RefreshCw className="size-4 animate-spin" /> : <Search className="size-4" />}
                  Buscar
                </Button>
                {backupSgResults !== null && (
                  <Button
                    variant="outline"
                    onClick={() => { setBackupSgSearch(""); setBackupSgResults(null); setFiltroTipo(null) }}
                  >
                    Limpiar
                  </Button>
                )}
              </div>
              {backupSgSearch.length > 0 && backupSgSearch.length < 4 && (
                <p className="mt-1 text-xs text-[#8ba3b8]">Ingresa 4 dígitos</p>
              )}
            </div>

            {/* Resultados de búsqueda por SG */}
            {backupSgResults !== null && (
              <div className="space-y-3">
                <p className="text-sm font-medium text-[#476179]">
                  {backupSgResults.length === 0
                    ? `No se encontraron respaldos${backupSgSearch ? ` con SG ${backupSgSearch}` : ""}${filtroTipo ? ` (${filtroTipo})` : ""}`
                    : `Resultados${backupSgSearch ? ` para "${backupSgSearch}"` : ""}${filtroTipo ? ` · ${filtroTipo}` : ""} (${backupSgResults.length})`}
                </p>
                {backupSgResults.map((b) => (
                  <BackupCard
                    key={b.id}
                    b={b}
                    reviewingBackup={reviewingBackup}
                    dispatchingBackup={dispatchingBackup}
                    onReview={reviewBackup}
                    onDispatch={dispatchToDrive}
                  />
                ))}
              </div>
            )}

            {/* Filtro por estado (solo si no hay búsqueda activa) */}
            {backupSgResults === null && (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-[#142033]">Estado:</span>
                  {(["pendiente", "revisado", "rechazado", "all"] as const).map((e) => (
                    <button
                      key={e}
                      onClick={() => {
                        setBackupEstado(e)
                        loadTab("backups")
                      }}
                      className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                        backupEstado === e
                          ? "bg-[#1f7a5b] text-white"
                          : "bg-[#f0f4f8] text-[#5c6f82] hover:bg-[#e0eaf2]"
                      }`}
                    >
                      {e === "all" ? "Todos" : e.charAt(0).toUpperCase() + e.slice(1)}
                    </button>
                  ))}
                </div>

                {backups.length === 0 && !loading && (
                  <Empty text="No hay respaldos en este estado." />
                )}

                <div className="space-y-3">
                  {backups.map((b) => (
                    <BackupCard
                      key={b.id}
                      b={b}
                      reviewingBackup={reviewingBackup}
                      dispatchingBackup={dispatchingBackup}
                      onReview={reviewBackup}
                      onDispatch={dispatchToDrive}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </section>
    </main>
  )
}

function UserRow({
  user,
  onSave,
}: {
  user: AdminUser
  onSave: (user: AdminUser, updates: Partial<AdminUser>) => Promise<void>
}) {
  const [nombre, setNombre] = useState(user.nombre)
  const [rol, setRol] = useState<"runner" | "admin" | "picker">(user.rol)
  const [area, setArea] = useState(user.area || "frio")
  const [estado, setEstado] = useState(user.estado_usuario)
  const [saving, setSaving] = useState(false)

  const needsArea = rol === "runner"

  return (
    <tr className="border-t border-[#edf1f6] align-top">
      <td className="py-2">
        <Input className="h-9 min-w-36" value={nombre} onChange={(e) => setNombre(e.target.value)} />
      </td>
      <td className="py-2 text-[#476179]">{user.telefono}</td>
      <td className="py-2">
        <select
          className="h-9 rounded-md border border-[#cfd9e5] bg-white px-2 text-sm"
          value={rol}
          onChange={(e) => setRol(e.target.value as "runner" | "admin" | "picker")}
        >
          <option value="runner">Runner</option>
          <option value="picker">Picker</option>
          <option value="admin">Admin</option>
        </select>
      </td>
      <td className="py-2">
        <select
          className="h-9 rounded-md border border-[#cfd9e5] bg-white px-2 text-sm"
          value={area}
          disabled={!needsArea}
          onChange={(e) => setArea(e.target.value)}
        >
          <option value="frio">Frio</option>
          <option value="sala">Sala</option>
          <option value="gm">GM</option>
        </select>
      </td>
      <td className="py-2">
        <select
          className="h-9 rounded-md border border-[#cfd9e5] bg-white px-2 text-sm"
          value={estado}
          onChange={(e) => setEstado(e.target.value)}
        >
          <option value="pendiente_aprobacion">Pendiente</option>
          <option value="activo">Activo</option>
          <option value="inactivo">Inactivo</option>
          <option value="rechazado">Rechazado</option>
        </select>
      </td>
      <td className="py-2">
        <Button
          size="sm"
          variant="outline"
          disabled={saving}
          onClick={async () => {
            setSaving(true)
            await onSave(user, { nombre, rol, area: needsArea ? area : null, estado_usuario: estado })
            setSaving(false)
          }}
        >
          Guardar
        </Button>
      </td>
    </tr>
  )
}

function ProductEditor({
  product,
  onSave,
}: {
  product: Product
  onSave: (product: Product, updates: Partial<Product>, image?: File | null, newSku?: string) => Promise<void>
}) {
  const [sku, setSku] = useState(product.sku)
  const [nombre, setNombre] = useState(product.nombre_producto || "")
  const [marca, setMarca] = useState(product.marca_producto || "")
  const [area, setArea] = useState(product.area || "frio")
  const [imageUrl, setImageUrl] = useState(product.imagen_url || "")
  const [activo, setActivo] = useState(product.activo)
  const [image, setImage] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)

  return (
    <div className="rounded-lg border border-[#d8e0ea] bg-white p-4 text-sm">
      <div className="flex flex-col gap-3 sm:flex-row">
        <ProductThumb url={product.imagen_url} alt={product.nombre_producto || product.sku} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <label className="flex items-center gap-2 text-sm text-[#476179]">
              <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} />
              Activo
            </label>
            {product.no_registrado && (
              <span className="w-fit rounded-md bg-[#fff8e7] px-2 py-1 text-xs font-semibold text-[#745015]">
                SKU no registrado
              </span>
            )}
          </div>
          <div className="mt-2 flex flex-wrap gap-2 text-xs text-[#476179]">
            {product.no_registrado && (
              <span className="rounded-md bg-[#fff8e7] px-2 py-1 font-semibold text-[#745015]">
                {product.consultas_abiertas || 1} consulta(s) abierta(s)
              </span>
            )}
            <span className="rounded-md bg-[#f0f4f8] px-2 py-1">
              Reportes no disponible: {product.reportes_no_disponible || 0}
            </span>
            <span className="rounded-md bg-[#f0f4f8] px-2 py-1">
              Ultimo estado: {formatEstadoProducto(product.ultimo_estado_reportado)}
            </span>
            {product.ultimo_reporte_no_disponible && (
              <span className="rounded-md bg-[#f0f4f8] px-2 py-1">
                Ultimo reporte: {new Date(product.ultimo_reporte_no_disponible).toLocaleString("es-CL")}
              </span>
            )}
            {product.reporte_multiples_runners && (
              <span className="rounded-md bg-[#fff1f0] px-2 py-1 font-semibold text-[#9b2c2c]">
                {product.runners_reportando} runners reportaron (7d)
              </span>
            )}
            {product.reporte_stale && (
              <span className="rounded-md bg-[#fff1f0] px-2 py-1 font-semibold text-[#9b2c2c]">
                Sin stock hace +3 dias
              </span>
            )}
          </div>
          {product.fixed_respuesta && (
            <div className="mt-3 rounded-md border border-[#d8e0ea] bg-[#f7f9fc] p-3">
              <p className="text-xs font-semibold uppercase text-[#1f6a4f]">Respuesta fija activa</p>
              <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-[#5c6f82]">
                {product.fixed_respuesta}
              </p>
              {product.fixed_runner && (
                <p className="mt-1 text-xs text-[#476179]">Runner: {product.fixed_runner}</p>
              )}
            </div>
          )}
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <Input placeholder="SKU" value={sku} onChange={(e) => setSku(e.target.value.toUpperCase())} />
            <Input placeholder="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} />
            <Input placeholder="Marca" value={marca} onChange={(e) => setMarca(e.target.value)} />
            <select
              className="h-10 rounded-md border border-[#cfd9e5] bg-white px-3 text-sm"
              value={area}
              onChange={(e) => setArea(e.target.value)}
            >
              <option value="frio">Frio</option>
              <option value="sala">Sala</option>
              <option value="gm">GM</option>
            </select>
            <Input placeholder="Imagen URL" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} />
            <label className="flex h-10 cursor-pointer items-center gap-2 rounded-md border border-[#cfd9e5] bg-white px-3 text-sm text-[#476179] sm:col-span-2">
              <ImagePlus className="size-4" />
              <span className="truncate">{image ? image.name : "Reemplazar foto"}</span>
              <input
                className="sr-only"
                type="file"
                accept="image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif"
                onChange={(e) => setImage(e.target.files?.[0] || null)}
              />
            </label>
          </div>
          <Button
            size="sm"
            className="mt-3 bg-[#1f7a5b] text-white"
            disabled={saving}
            onClick={async () => {
              setSaving(true)
              await onSave(product, {
                nombre_producto: nombre,
                marca_producto: marca,
                area,
                imagen_url: imageUrl,
                activo,
              }, image, sku.trim().toUpperCase() !== product.sku ? sku.trim().toUpperCase() : undefined)
              setImage(null)
              setSaving(false)
            }}
          >
            {product.no_registrado ? "Registrar producto" : "Guardar producto"}
          </Button>
        </div>
      </div>
    </div>
  )
}

function ProductThumb({ url, alt }: { url: string | null; alt: string }) {
  const [zoomOpen, setZoomOpen] = useState(false)

  if (!url) {
    return (
      <div className="flex size-20 shrink-0 items-center justify-center rounded-md border border-[#d8e0ea] bg-[#f7f9fc]">
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
        />
      </button>

      <ImageZoomModal open={zoomOpen} src={url} alt={alt} onClose={() => setZoomOpen(false)} />
    </>
  )
}

function Header({ title }: { title: string }) {
  return (
    <div className="mb-8 flex items-center gap-3">
      <div className="flex size-11 items-center justify-center rounded-lg bg-[#1f7a5b] text-white">
        <ShieldCheck className="size-6" />
      </div>
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-[#476179]">AIntegration</p>
        <h1 className="text-2xl font-bold">{title}</h1>
      </div>
    </div>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-9 rounded px-2 font-medium ${active ? "bg-white text-[#1f7a5b] shadow-sm" : "text-[#5c6f82]"}`}
    >
      {children}
    </button>
  )
}

function Alert({ text }: { text: string }) {
  return (
    <div className="flex gap-2 rounded-md border border-[#f2b8b5] bg-[#fff1f0] px-3 py-2 text-sm text-[#9b2c2c]">
      <AlertCircle className="mt-0.5 size-4 shrink-0" />
      <span>{text}</span>
    </div>
  )
}

function Success({ text }: { text: string }) {
  return (
    <div className="flex gap-2 rounded-md border border-[#b8e0c9] bg-[#eefaf3] px-3 py-2 text-sm text-[#1f6a4f]">
      <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
      <span>{text}</span>
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-[#d8e0ea] bg-white p-8 text-center text-sm text-[#5c6f82]">
      {text}
    </div>
  )
}

function formatEstadoProducto(estado: string | null | undefined) {
  if (estado === "disponible") return "Disponible"
  if (estado === "no_disponible") return "No disponible"
  if (estado === "ir_a_revisar") return "Ir a revisar"
  return "Sin reportes"
}

function CenteredMessage({
  icon: Icon,
  text,
  spin,
}: {
  icon: typeof RefreshCw
  text: string
  spin?: boolean
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f5f7fb] px-4">
      <div className="flex items-center gap-3 rounded-lg border bg-white px-4 py-3 shadow-sm">
        <Icon className={`size-5 text-[#1f7a5b] ${spin ? "animate-spin" : ""}`} />
        <span className="text-sm font-medium">{text}</span>
      </div>
    </main>
  )
}

function BackupCard({
  b,
  reviewingBackup,
  dispatchingBackup,
  onReview,
  onDispatch,
}: {
  b: Backup
  reviewingBackup: string | null
  dispatchingBackup: string | null
  onReview: (id: string, estado: "revisado" | "rechazado", notas?: string, motivoRechazo?: string) => Promise<void>
  onDispatch: (id: string) => Promise<void>
}) {
  const [showRechazo, setShowRechazo] = useState(false)
  const [motivo, setMotivo] = useState("")

  const decided = b.estado === "revisado" || b.estado === "rechazado"

  return (
    <div className="rounded-lg border border-[#d8e0ea] bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-base font-bold text-[#142033]">SG: {b.sg}</span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              b.tipo_servicio === "bicci" ? "bg-blue-100 text-blue-700" :
              b.tipo_servicio === "uber"  ? "bg-purple-100 text-purple-700" :
              b.tipo_servicio === "driver" ? "bg-orange-100 text-orange-700" :
              "bg-gray-100 text-gray-700"
            }`}>
              {b.tipo_servicio}
            </span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              b.estado === "revisado"  ? "bg-[#d0f0e4] text-[#1f6a4f]" :
              b.estado === "rechazado" ? "bg-red-100 text-red-700" :
              "bg-amber-100 text-amber-700"
            }`}>
              {b.estado === "revisado" ? "Revisado ✓" : b.estado === "rechazado" ? "Rechazado ✗" : "⏳ Pendiente"}
            </span>
          </div>
          <p className="text-sm text-[#476179]">
            Picker: {b.nombre_picker || b.telefono_picker}
          </p>
          <p className="text-xs text-[#8ba3b8]">
            {new Date(b.created_at).toLocaleString("es-CL")}
          </p>
          {b.foto_urls && (
            <p className="text-xs text-[#8ba3b8]">{b.foto_urls.length} foto(s)</p>
          )}
          {(b.drive_url || b.drive_folder_url) && (
            <a
              href={b.drive_folder_url || b.drive_url || ""}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-[#1f7a5b] underline"
            >
              Ver en Drive
            </a>
          )}
          {b.revisado_por && (
            <p className="text-xs text-[#5c6f82]">
              Revisado por: {b.revisado_por}
              {b.revisado_en ? ` — ${new Date(b.revisado_en).toLocaleString("es-CL")}` : ""}
            </p>
          )}
        </div>

        {b.foto_urls && b.foto_urls.length > 0 && (
          <div className="flex gap-2">
            {b.foto_urls.slice(0, 3).map((url, i) => (
              <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt={`Foto ${i + 1}`}
                  className="h-16 w-16 rounded-lg border border-[#dce8f0] object-cover hover:opacity-80"
                />
              </a>
            ))}
            {b.foto_urls.length > 3 && (
              <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-[#f0f4f8] text-xs text-[#5c6f82]">
                +{b.foto_urls.length - 3}
              </div>
            )}
          </div>
        )}
      </div>

      {!decided && (
        <div className="mt-3 space-y-2">
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              className="bg-[#1f7a5b] text-white hover:bg-[#176449]"
              disabled={reviewingBackup === b.id}
              onClick={() => { setShowRechazo(false); onReview(b.id, "revisado") }}
            >
              {reviewingBackup === b.id && !showRechazo ? (
                <RefreshCw className="size-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="size-3.5" />
              )}
              Aprobar
            </Button>
            {!showRechazo && (
              <Button
                size="sm"
                variant="outline"
                className="border-red-300 text-red-600 hover:bg-red-50"
                disabled={reviewingBackup === b.id}
                onClick={() => setShowRechazo(true)}
              >
                Rechazar
              </Button>
            )}
          </div>
          {showRechazo && (
            <div className="flex flex-wrap items-center gap-2">
              <Input
                placeholder="Motivo del rechazo (opcional)"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                className="h-9 max-w-xs text-sm"
              />
              <Button
                size="sm"
                variant="outline"
                className="border-red-300 text-red-600 hover:bg-red-50"
                disabled={reviewingBackup === b.id}
                onClick={() => onReview(b.id, "rechazado", undefined, motivo || undefined)}
              >
                {reviewingBackup === b.id ? <RefreshCw className="size-3.5 animate-spin" /> : null}
                Confirmar rechazo
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-[#5c6f82]"
                onClick={() => { setShowRechazo(false); setMotivo("") }}
              >
                Cancelar
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
