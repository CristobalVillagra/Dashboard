"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { ExternalLink, Instagram, Loader2, Play } from "lucide-react"
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel"

type InstagramPost = {
  id: string
  caption: string
  mediaType: string
  imageUrl: string
  permalink: string
  timestamp: string
}

const PROFILE_URL =
  process.env.NEXT_PUBLIC_INSTAGRAM_PROFILE_URL || "https://www.instagram.com/aintegration.cl/"

function formatDate(date: string) {
  if (!date) return ""

  try {
    return new Intl.DateTimeFormat("es-CL", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(new Date(date))
  } catch {
    return ""
  }
}

function truncateText(text: string, maxLength: number) {
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength).trim()}...`
}

export function InstagramFeed() {
  const [posts, setPosts] = useState<InstagramPost[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState("")
  const [isVisible, setIsVisible] = useState(false)
  const sectionRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true)
        }
      },
      { threshold: 0.1 }
    )

    if (sectionRef.current) {
      observer.observe(sectionRef.current)
    }

    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    let isMounted = true

    async function loadFeed() {
      try {
        const response = await fetch("/api/instagram-feed")
        const payload = await response.json()

        if (!response.ok) {
          throw new Error(payload?.error || "No fue posible cargar Instagram.")
        }

        if (isMounted) {
          setPosts(Array.isArray(payload?.posts) ? payload.posts : [])
          setError("")
        }
      } catch (error) {
        if (isMounted) {
          setPosts([])
          setError(error instanceof Error ? error.message : "No fue posible cargar Instagram.")
        }
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    loadFeed()

    return () => {
      isMounted = false
    }
  }, [])

  const hasPosts = posts.length > 0
  const slides = useMemo(() => posts.slice(0, 8), [posts])

  return (
    <section
      ref={sectionRef}
      id="instagram"
      className="py-24 lg:py-32 relative overflow-hidden"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(91,162,255,0.18),transparent_28%),radial-gradient(circle_at_bottom_left,rgba(0,179,155,0.14),transparent_30%)]" />

      <div className="container mx-auto px-4 sm:px-6 relative z-10">
        <div
          className={`flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between mb-12 transition-all duration-700 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}
        >
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium mb-4">
              <Instagram className="h-4 w-4" />
              Instagram en vivo
            </span>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-balance mb-4">
              Busca mas informacion de nuestros servicios publicados en @aintegration.cl
            </h2>
          </div>

          <a
            href={PROFILE_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:text-primary/80 transition-colors"
          >
            Ver perfil completo
            <ExternalLink className="h-4 w-4" />
          </a>
        </div>

        {isLoading ? (
          <div className="rounded-3xl border border-border bg-card/80 p-10 flex items-center justify-center gap-3 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            Cargando publicaciones...
          </div>
        ) : hasPosts ? (
          <div
            className={`transition-all duration-700 delay-150 ${
              isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
            }`}
          >
            <Carousel
              opts={{ align: "start", loop: slides.length > 3 }}
              className="mx-auto w-full"
            >
              <CarouselContent className="-ml-4">
                {slides.map((post) => (
                  <CarouselItem
                    key={post.id}
                    className="pl-4 md:basis-1/2 xl:basis-1/3"
                  >
                    <article className="group h-full overflow-hidden rounded-3xl border border-border bg-card/90 backdrop-blur">
                      <a
                        href={post.permalink}
                        target="_blank"
                        rel="noreferrer"
                        className="block h-full"
                      >
                        <div className="relative aspect-[4/5] overflow-hidden">
                          <img
                            src={post.imageUrl}
                            alt={truncateText(post.caption, 80)}
                            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                            loading="lazy"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-background/85 via-background/10 to-transparent" />
                          {post.mediaType === "VIDEO" ? (
                            <div className="absolute right-4 top-4 inline-flex items-center gap-2 rounded-full bg-background/80 px-3 py-1 text-xs font-medium text-foreground backdrop-blur">
                              <Play className="h-3.5 w-3.5 fill-current" />
                              Video
                            </div>
                          ) : null}
                        </div>

                        <div className="p-6">
                          <div className="flex items-center justify-between gap-4 mb-4">
                            <span className="text-xs uppercase tracking-[0.22em] text-primary/90">
                              {post.mediaType.replace("_", " ")}
                            </span>
                            <span className="text-sm text-muted-foreground">
                              {formatDate(post.timestamp)}
                            </span>
                          </div>

                          <p className="text-sm leading-7 text-foreground/90 min-h-[5.25rem]">
                            {truncateText(post.caption, 150)}
                          </p>

                          <div className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-primary">
                            Ver publicacion
                            <ExternalLink className="h-4 w-4" />
                          </div>
                        </div>
                      </a>
                    </article>
                  </CarouselItem>
                ))}
              </CarouselContent>
              <CarouselPrevious className="left-3 top-[40%] border-border bg-background/90 text-foreground hover:bg-background lg:-left-5" />
              <CarouselNext className="right-3 top-[40%] border-border bg-background/90 text-foreground hover:bg-background lg:-right-5" />
            </Carousel>
          </div>
        ) : (
          <div className="rounded-3xl border border-dashed border-border bg-card/70 p-10 text-center">
            <p className="text-lg font-semibold text-foreground mb-2">
              Aun no pudimos cargar tus publicaciones.
            </p>
            <p className="text-muted-foreground max-w-2xl mx-auto mb-6">
              {error || "Revisa el token de Meta y que la cuenta tenga acceso al endpoint de media."}
            </p>
            <a
              href={PROFILE_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Abrir Instagram
              <ExternalLink className="h-4 w-4" />
            </a>
          </div>
        )}
      </div>
    </section>
  )
}
