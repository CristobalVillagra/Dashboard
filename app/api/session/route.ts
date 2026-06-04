import { NextResponse } from "next/server"
import { requireActiveRunner } from "@/lib/runner-auth"

export async function GET() {
  const { runner, reason } = await requireActiveRunner({ touch: false })

  if (!runner) {
    return NextResponse.json({ authenticated: false, reason }, { status: 401 })
  }

  return NextResponse.json({ authenticated: true, runner })
}
