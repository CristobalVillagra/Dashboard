export function normalizeArea(area: string | null | undefined) {
  const cleanArea = String(area || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()

  if (cleanArea === "frio" || cleanArea === "sala" || cleanArea === "gm") {
    return cleanArea
  }

  return null
}

export function formatAreaLabel(area: string | null | undefined) {
  const normalized = normalizeArea(area)
  if (normalized === "frio") return "Frio"
  if (normalized === "sala") return "Sala"
  if (normalized === "gm") return "GM"
  return "Sin area"
}
