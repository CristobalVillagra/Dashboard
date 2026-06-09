import { NextResponse } from "next/server"
import { requireActiveUser } from "@/lib/runner-auth"

export async function GET() {
  const { user, reason } = await requireActiveUser({ touch: false })

  if (!user) {
    return NextResponse.json({ authenticated: false, reason }, { status: 401 })
  }

  return NextResponse.json({
    authenticated: true,
    user,
    runner:
      user.rol === "runner"
        ? {
            telefono: user.telefono,
            nombre: user.nombre,
            area: user.area,
          }
        : undefined,
  })
}
