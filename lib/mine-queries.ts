import type { QueryGroup, QueryGroupConsulta } from "@/lib/query-groups"

export const MINE_PENDING_STATES = ["tomada", "en_revision"] as const
export const MINE_RESPONDED_STATES = ["respondido", "no_disponible"] as const

const DAY_MS = 24 * 60 * 60 * 1000

export function isMineAssignedRecent(assignedAt: string | null | undefined, now = Date.now()) {
  if (!assignedAt) return true
  return new Date(assignedAt).getTime() >= now - DAY_MS
}

export function isMinePending(estado: string) {
  return MINE_PENDING_STATES.includes(estado as (typeof MINE_PENDING_STATES)[number])
}

export function isMineResponded(estado: string) {
  return MINE_RESPONDED_STATES.includes(estado as (typeof MINE_RESPONDED_STATES)[number])
}

export function filterNuevasGroups(groups: QueryGroup[]) {
  return groups
    .map((group) => {
      const pending = group.consultas.filter(
        (consulta) => isMinePending(consulta.estado) && isMineAssignedRecent(consulta.assigned_at),
      )
      if (pending.length === 0) return null
      return {
        ...group,
        total: pending.length,
        consultaIds: pending.map((consulta) => consulta.id),
        consultas: pending,
      }
    })
    .filter(Boolean) as QueryGroup[]
}

export function filterAntiguasPendingGroups(groups: QueryGroup[]) {
  return groups
    .map((group) => {
      const pending = group.consultas.filter(
        (consulta) => isMinePending(consulta.estado) && !isMineAssignedRecent(consulta.assigned_at),
      )
      if (pending.length === 0) return null
      return {
        ...group,
        total: pending.length,
        consultaIds: pending.map((consulta) => consulta.id),
        consultas: pending,
      }
    })
    .filter(Boolean) as QueryGroup[]
}

export type MineRespondedConsulta = QueryGroupConsulta & {
  sku: string
  nombreProducto: string
  marcaProducto: string
  area: string | null
  imagenUrl: string | null
}

export function listAntiguasRespondedConsultas(groups: QueryGroup[]) {
  const items: MineRespondedConsulta[] = []

  for (const group of groups) {
    for (const consulta of group.consultas) {
      if (!isMineResponded(consulta.estado) || isMineAssignedRecent(consulta.assigned_at)) {
        continue
      }

      items.push({
        ...consulta,
        sku: group.sku,
        nombreProducto: group.nombreProducto,
        marcaProducto: group.marcaProducto,
        area: group.area,
        imagenUrl: group.imagenUrl,
      })
    }
  }

  return items.sort(
    (a, b) => new Date(b.assigned_at || 0).getTime() - new Date(a.assigned_at || 0).getTime(),
  )
}

/** Consultas respondidas desde loginAt (sesión activa del runner) */
export function listSessionRespondedConsultas(groups: QueryGroup[], loginAt?: string) {
  // Si no hay loginAt, usar las últimas 8 horas como proxy de "esta sesión"
  const sessionStart = loginAt
    ? new Date(loginAt).getTime()
    : Date.now() - 8 * 60 * 60 * 1000

  const items: MineRespondedConsulta[] = []

  for (const group of groups) {
    for (const consulta of group.consultas) {
      if (!isMineResponded(consulta.estado)) continue

      const respondedTime = consulta.responded_at
        ? new Date(consulta.responded_at).getTime()
        : consulta.assigned_at
          ? new Date(consulta.assigned_at).getTime()
          : 0

      if (respondedTime < sessionStart) continue

      items.push({
        ...consulta,
        sku: group.sku,
        nombreProducto: group.nombreProducto,
        marcaProducto: group.marcaProducto,
        area: group.area,
        imagenUrl: group.imagenUrl,
      })
    }
  }

  return items.sort(
    (a, b) =>
      new Date(b.responded_at || b.assigned_at || 0).getTime() -
      new Date(a.responded_at || a.assigned_at || 0).getTime(),
  )
}
