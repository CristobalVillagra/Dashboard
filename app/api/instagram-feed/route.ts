import { NextResponse } from "next/server"

type InstagramMediaItem = {
  id: string
  caption?: string
  media_type: "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM" | string
  media_url?: string
  thumbnail_url?: string
  permalink?: string
  timestamp?: string
}

const ACCESS_TOKEN = process.env.INSTAGRAM_ACCESS_TOKEN
const FEED_LIMIT = Number(process.env.INSTAGRAM_FEED_LIMIT ?? 8)

export const revalidate = 900

export async function GET() {
  if (!ACCESS_TOKEN) {
    return NextResponse.json(
      { error: "Missing INSTAGRAM_ACCESS_TOKEN", posts: [] },
      { status: 500 }
    )
  }

  const url = new URL("https://graph.instagram.com/me/media")
  url.searchParams.set(
    "fields",
    "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp"
  )
  url.searchParams.set("limit", String(FEED_LIMIT))
  url.searchParams.set("access_token", ACCESS_TOKEN)

  try {
    const response = await fetch(url.toString(), {
      next: { revalidate },
    })

    const payload = await response.json()

    if (!response.ok) {
      const message =
        payload?.error?.message ?? "Meta did not return a valid feed response."

      return NextResponse.json(
        { error: message, posts: [] },
        {
          status: response.status,
          headers: {
            "Cache-Control": "public, s-maxage=300, stale-while-revalidate=900",
          },
        }
      )
    }

    const posts = Array.isArray(payload?.data)
      ? payload.data
          .map((item: InstagramMediaItem) => ({
            id: item.id,
            caption: item.caption?.trim() || "Publicacion de Instagram",
            mediaType: item.media_type,
            imageUrl: item.thumbnail_url || item.media_url || "",
            permalink: item.permalink || "",
            timestamp: item.timestamp || "",
          }))
          .filter((item) => item.imageUrl && item.permalink)
      : []

    return NextResponse.json(
      { posts },
      {
        headers: {
          "Cache-Control": "public, s-maxage=900, stale-while-revalidate=3600",
        },
      }
    )
  } catch (error) {
    console.error("Instagram feed error:", error)

    return NextResponse.json(
      { error: "Could not fetch Instagram posts.", posts: [] },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store",
        },
      }
    )
  }
}
