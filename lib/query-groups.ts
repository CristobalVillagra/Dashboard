import { normalizeArea } from "@/lib/areas"

export type QuerySortMode = "newest" | "oldest" | "skuCount"

export const QUERY_SORT_OPTIONS: { value: QuerySortMode; label: string }[] = [
  { value: "newest", label: "Mas reciente primero" },
  { value: "oldest", label: "Mas antiguo primero" },
  { value: "skuCount", label: "Por cantidad de consultas del mismo SKU" },
]

export type ConsultaRow = {
  id: string
  sku: string
  nombre_producto?: string | null
  marca_producto?: string | null
  area: string | null
  canal?: string | null
  telefono_picker?: string | null
  picker_nombre?: string | null
  mensaje_original?: string | null
  created_at: string | null
  assigned_at?: string | null
  responded_at?: string | null
  estado?: string | null
  respuesta_runner?: string | null
  nombre_runner?: string | null
  imagen_url?: string | null
}

export type QueryGroupConsulta = {
  id: string
  estado: string
  respuesta_runner: string | null
  nombre_runner?: string | null
  assigned_at: string | null
  responded_at?: string | null
}

export type QueryGroup = {
  sku: string
  nombreProducto: string
  marcaProducto: string
  area: string | null
  imagenUrl: string | null
  total: number
  oldestDate: string | null
  newestDate: string | null
  assignedAt: string | null
  sampleMessage: string
  pickers: string[]
  consultaIds: string[]
  consultas: QueryGroupConsulta[]
}

const validSkuPattern = /^[A-Z0-9_-]{2,32}$/

export function groupConsultasBySku(rows: ConsultaRow[]): QueryGroup[] {
  const groups = new Map<string, ConsultaRow[]>()

  for (const row of rows) {
    const sku = String(row.sku || "").trim().toUpperCase()
    const area = normalizeArea(row.area)
    const nombre = String(row.nombre_producto || "").trim()
    const marca = String(row.marca_producto || "").trim()

    if (!validSkuPattern.test(sku) || !area) {
      continue
    }

    const groupKey = [sku, area].join("|")
    const normalizedRow = { ...row, sku, area, nombre_producto: nombre || null, marca_producto: marca || null }
    const current = groups.get(groupKey) || []
    current.push(normalizedRow)
    groups.set(groupKey, current)
  }

  return Array.from(groups.values()).map((items) => {
    const sorted = [...items].sort(
      (a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime(),
    )
    const first = sorted[0]
    const last = sorted[sorted.length - 1]

    return {
      sku: first?.sku || "",
      nombreProducto: first?.nombre_producto || "",
      marcaProducto: first?.marca_producto || "",
      area: first?.area || null,
      imagenUrl: first?.imagen_url || null,
      total: items.length,
      oldestDate: first?.created_at || null,
      newestDate: last?.created_at || null,
      assignedAt:
        sorted.reduce<string | null>((latest, item) => {
          const candidate = item.assigned_at || item.created_at || null
          if (!candidate) return latest
          if (!latest) return candidate
          return new Date(candidate).getTime() > new Date(latest).getTime() ? candidate : latest
        }, null) ||
        first?.assigned_at ||
        first?.created_at ||
        null,
      sampleMessage: first?.mensaje_original || "",
      pickers: Array.from(new Set(items.map((item) => item.telefono_picker).filter(Boolean))) as string[],
      consultaIds: items.map((item) => item.id),
      consultas: sorted.map((item) => ({
        id: item.id,
        estado: String(item.estado || ""),
        respuesta_runner: item.respuesta_runner || null,
        assigned_at: item.assigned_at || item.created_at || null,
      })),
    }
  })
}

export function sortQueryGroups(groups: QueryGroup[], mode: QuerySortMode): QueryGroup[] {
  const copy = [...groups]

  if (mode === "oldest") {
    return copy.sort(
      (a, b) => new Date(a.oldestDate || 0).getTime() - new Date(b.oldestDate || 0).getTime(),
    )
  }

  if (mode === "skuCount") {
    const skuCounts = new Map<string, number>()
    for (const group of copy) {
      skuCounts.set(group.sku, (skuCounts.get(group.sku) || 0) + group.total)
    }

    return copy.sort((a, b) => {
      const countDiff = (skuCounts.get(b.sku) || 0) - (skuCounts.get(a.sku) || 0)
      if (countDiff !== 0) return countDiff
      return new Date(b.newestDate || 0).getTime() - new Date(a.newestDate || 0).getTime()
    })
  }

  return copy.sort(
    (a, b) => new Date(b.newestDate || 0).getTime() - new Date(a.newestDate || 0).getTime(),
  )
}

export function filterQueryGroupsByArea(groups: QueryGroup[], area: string | null | "all"): QueryGroup[] {
  if (!area || area === "all") return groups
  return groups.filter((group) => group.area === area)
}
