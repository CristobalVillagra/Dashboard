const STALE_REPORT_MS = 3 * 24 * 60 * 60 * 1000
const MULTI_RUNNER_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

export type ProductCatalogInsight = {
  fixed_respuesta: string | null
  fixed_activo: boolean | null
  fixed_runner: string | null
  fixed_estado: string | null
  runners_reportando: number
  reporte_stale: boolean
  reporte_multiples_runners: boolean
}

export function isStaleNoDisponibleReport(
  ultimoEstado: string | null | undefined,
  ultimoReporte: string | null | undefined,
  now = Date.now(),
) {
  if (ultimoEstado !== "no_disponible" || !ultimoReporte) return false
  return now - new Date(ultimoReporte).getTime() >= STALE_REPORT_MS
}

export function buildRunnerReportCounts(
  rows: Array<{ sku: string | null; telefono_runner: string | null }>,
  now = Date.now(),
) {
  const cutoff = now - MULTI_RUNNER_WINDOW_MS
  const map = new Map<string, Set<string>>()

  for (const row of rows) {
    const sku = String(row.sku || "").trim().toUpperCase()
    const runner = String(row.telefono_runner || "").trim()
    if (!sku || !runner) continue

    map.set(sku, map.get(sku) || new Set<string>())
    map.get(sku)!.add(runner)
  }

  // Re-filter by date requires responded_at on rows - caller passes pre-filtered rows
  void cutoff
  return map
}

export function insightFromProductRow(
  product: {
    sku: string
    ultimo_estado_reportado?: string | null
    ultimo_reporte_no_disponible?: string | null
  },
  fixed:
    | {
        respuesta: string
        activo: boolean | null
        nombre_runner: string | null
        estado_respuesta: string | null
      }
    | null
    | undefined,
  runnersReportando: number,
) {
  const reporteStale = isStaleNoDisponibleReport(
    product.ultimo_estado_reportado,
    product.ultimo_reporte_no_disponible,
  )

  return {
    fixed_respuesta: fixed?.respuesta || null,
    fixed_activo: fixed?.activo ?? null,
    fixed_runner: fixed?.nombre_runner || null,
    fixed_estado: fixed?.estado_respuesta || null,
    runners_reportando: runnersReportando,
    reporte_stale: reporteStale,
    reporte_multiples_runners: runnersReportando > 1,
  } satisfies ProductCatalogInsight
}
