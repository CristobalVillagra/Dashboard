"use client"

import { useEffect, useMemo, useState } from "react"
import { endOfWeek, format, startOfWeek } from "date-fns"
import { AlertCircle, CheckCircle2, ImagePlus, LogOut, RefreshCw, Search, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { FixedResponseCard } from "@/components/fixed-response-card"
import { QuerySortControls } from "@/components/query-sort-controls"
import type { FixedResponseRecord } from "@/lib/fixed-responses"
import { formatAreaLabel } from "@/lib/areas"
import { groupConsultasBySku, sortQueryGroups, type QuerySortMode } from "@/lib/query-groups"

type AdminUser = {
  telefono: string
  nombre: string
  rol: "runner" | "admin"
  area: string | null
  estado_usuario: string
}

type Tab = "users" | "queries" | "products" | "fixed"

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
  const [fixedResponses, setFixedResponses] = useState<FixedResponse[]>([])
  const [adminQueries, setAdminQueries] = useState<AdminQuery[]>([])
  const [querySortMode, setQuerySortMode] = useState<QuerySortMode>("newest")
  const [queryDesde, setQueryDesde] = useState(() => getCurrentWeekRange().desde)
  const [queryHasta, setQueryHasta] = useState(() => getCurrentWeekRange().hasta)
  const [exportingQueries, setExportingQueries] = useState(false)
  const [newUser, setNewUser] = useState({
    telefono: "",
    nombre: "",
    rol: "runner" as "runner" | "admin",
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

  const filteredProducts = useMemo(() => {
    const query = productSearch.trim().toLowerCase()
    if (!query) return products
    return products.filter(
      (product) =>
        product.sku.toLowerCase().includes(query) ||
        (product.nombre_producto || "").toLowerCase().includes(query),
    )
  }, [products, productSearch])

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
    if (admin) loadTab(tab)
  }, [admin, tab])

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
      } else if (current === "products") {
        const data = await fetchJson<{ products: Product[] }>("/api/admin/products")
        setProducts(data.products)
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

  async function approveUser(user: AdminUser, area: string) {
    await fetchJson("/api/admin/users", {
      method: "PATCH",
      body: JSON.stringify({ telefono: user.telefono, action: "aprobar", area }),
    })
    setSuccess(`Usuario ${user.nombre} aprobado.`)
    await loadTab("users")
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
    setSuccess(`${newUser.rol === "admin" ? "Admin" : "Runner"} creado. Ya puede solicitar OTP por WhatsApp.`)
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

  async function updateProduct(product: Product, updates: Partial<Product>, image?: File | null) {
    const formData = new FormData()
    formData.append("sku", product.sku)
    formData.append("nombreProducto", updates.nombre_producto ?? product.nombre_producto ?? "")
    formData.append("marcaProducto", updates.marca_producto ?? product.marca_producto ?? "")
    formData.append("area", updates.area ?? product.area ?? "")
    formData.append("imagenUrl", updates.imagen_url ?? product.imagen_url ?? "")
    formData.append("activo", String(updates.activo ?? product.activo))
    if (image) formData.append("imagen", image)

    await fetchForm("/api/admin/products", {
      method: "PATCH",
      body: formData,
    })
    setSuccess(`Producto ${product.sku} actualizado.`)
    await loadTab("products")
  }

  async function toggleFixedResponse(response: FixedResponse) {
    await fetchJson("/api/admin/fixed-responses", {
      method: "PATCH",
      body: JSON.stringify({ id: response.id, activo: !response.activo }),
    })
    await loadTab("fixed")
  }

  if (checkingSession) {
    return <CenteredMessage icon={RefreshCw} spin text="Validando sesion admin" />
  }

  if (!admin) {
    return (
      <main className="min-h-screen bg-[#f5f7fb] px-4 py-5 text-[#142033]">
        <section className="mx-auto flex min-h-[calc(100vh-40px)] w-full max-w-md flex-col justify-center">
          <Header title="Admin panel" />
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
        </section>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[#f5f7fb] text-[#142033]">
      <header className="border-b border-[#dce4ee] bg-white px-4 py-3 sm:px-6">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase text-[#1f7a5b]">Administrador</p>
            <h1 className="text-xl font-bold">{admin.nombre}</h1>
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
        <div className="grid grid-cols-2 gap-1 rounded-md border border-[#cfd9e5] bg-[#f7f9fc] p-1 text-sm sm:grid-cols-4">
          <TabButton active={tab === "users"} onClick={() => setTab("users")}>
            Usuarios
          </TabButton>
          <TabButton active={tab === "queries"} onClick={() => setTab("queries")}>
            Consultas
          </TabButton>
          <TabButton active={tab === "products"} onClick={() => setTab("products")}>
            Catalogo
          </TabButton>
          <TabButton active={tab === "fixed"} onClick={() => setTab("fixed")}>
            Resp. fijas
          </TabButton>
        </div>

        {error && <div className="mt-4"><Alert text={error} /></div>}
        {success && <div className="mt-4"><Success text={success} /></div>}

        {tab === "users" && (
          <div className="mt-4 space-y-4">
            <div className="rounded-lg border border-[#d8e0ea] bg-white p-4">
              <h3 className="font-semibold">Crear usuario autorizado</h3>
              <p className="mt-1 text-sm text-[#5c6f82]">
                Despues de crearlo, el usuario pide su codigo OTP y le llega por WhatsApp.
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
                  onChange={(e) => setNewUser({ ...newUser, rol: e.target.value as "runner" | "admin" })}
                >
                  <option value="runner">Runner</option>
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

            {pendingUsers.length === 0 && <Empty text="No hay runners pendientes de aprobacion." />}
            {pendingUsers.map((user) => (
              <div key={user.telefono} className="rounded-lg border border-[#d8e0ea] bg-white p-4">
                <p className="font-semibold">{user.nombre}</p>
                <p className="text-sm text-[#5c6f82]">{user.telefono}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" className="bg-[#1f7a5b] text-white" onClick={() => approveUser(user, "frio")}>
                    Aprobar Frio
                  </Button>
                  <Button size="sm" className="bg-[#1f7a5b] text-white" onClick={() => approveUser(user, "sala")}>
                    Aprobar Sala
                  </Button>
                  <Button size="sm" className="bg-[#1f7a5b] text-white" onClick={() => approveUser(user, "gm")}>
                    Aprobar GM
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => rejectUser(user)}>
                    Rechazar
                  </Button>
                </div>
              </div>
            ))}

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
              <div className="relative mt-3">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#8aa0b5]" />
                <Input
                  className="pl-9"
                  placeholder="Buscar por SKU o nombre..."
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                />
              </div>
              {productSearch.trim() && (
                <p className="mt-2 text-sm text-[#5c6f82]">
                  {filteredProducts.length} de {products.length} productos
                </p>
              )}
            </div>
            {filteredProducts.length === 0 && productSearch.trim() ? (
              <Empty text="Ningun producto coincide con la busqueda." />
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
                actions={
                  <Button size="sm" variant="outline" onClick={() => toggleFixedResponse(response)}>
                    {response.activo ? "Desactivar" : "Activar"}
                  </Button>
                }
              />
            ))}
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
  const [rol, setRol] = useState<"runner" | "admin">(user.rol)
  const [area, setArea] = useState(user.area || "frio")
  const [estado, setEstado] = useState(user.estado_usuario)
  const [saving, setSaving] = useState(false)

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
          onChange={(e) => setRol(e.target.value as "runner" | "admin")}
        >
          <option value="runner">Runner</option>
          <option value="admin">Admin</option>
        </select>
      </td>
      <td className="py-2">
        <select
          className="h-9 rounded-md border border-[#cfd9e5] bg-white px-2 text-sm"
          value={area}
          disabled={rol === "admin"}
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
            await onSave(user, { nombre, rol, area: rol === "runner" ? area : null, estado_usuario: estado })
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
  onSave: (product: Product, updates: Partial<Product>, image?: File | null) => Promise<void>
}) {
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
            <p className="font-semibold">SKU {product.sku}</p>
            <label className="flex items-center gap-2 text-sm text-[#476179]">
              <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} />
              Activo
            </label>
          </div>
          <div className="mt-2 flex flex-wrap gap-2 text-xs text-[#476179]">
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
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
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
              }, image)
              setImage(null)
              setSaving(false)
            }}
          >
            Guardar producto
          </Button>
        </div>
      </div>
    </div>
  )
}

function ProductThumb({ url, alt }: { url: string | null; alt: string }) {
  if (!url) {
    return (
      <div className="flex size-20 shrink-0 items-center justify-center rounded-md border border-[#d8e0ea] bg-[#f7f9fc]">
        <ImagePlus className="size-6 text-[#8aa0b5]" />
      </div>
    )
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={alt}
      className="size-20 shrink-0 rounded-md border border-[#d8e0ea] bg-[#f7f9fc] object-cover"
    />
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
