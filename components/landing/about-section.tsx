"use client"

import { useEffect, useRef, useState } from "react"
import Image from "next/image"
import { CheckCircle, Users, Target, Award } from "lucide-react"

const features = [
  "Te guiamos en todo el proceso",
  "No necesitas conocimientos tecnicos",
  "Te ayudamos despues de entregar tu web",
  "Soluciones adaptadas a tu negocio",
  "Usamos herramientas simples y efectivas",
  "Precios accesibles",
]

const highlights = [
  {
    icon: Users,
    title: "Te lo hacemos facil",
    description: "Nos encargamos de todo para que no tengas que aprender nada tecnico.",
  },
  {
    icon: Target,
    title: "Hecho para tu negocio",
    description: "Tu web se adapta a lo que tu negocio necesita.",
  },
  {
    icon: Award,
    title: "Resultados reales",
    description: "Buscamos que consigas clientes, no solo que tengas una web.",
  },
]

export function AboutSection() {
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

  return (
    <section ref={sectionRef} id="nosotros" className="py-24 lg:py-32 relative overflow-hidden">
      {/* Subtle background */}
      <div className="absolute inset-0 bg-card/30" />
      
      <div className="container mx-auto px-4 sm:px-6 relative z-10">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
          {/* Left Content */}
          <div className={`transition-all duration-700 delay-100 ${
            isVisible ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-8"
          }`}>
            <span className="inline-block px-4 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium mb-4">
              Sobre Nosotros
            </span>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-6 tracking-tight text-balance">
              Ayudamos a negocios como el tuyo a tener su pagina web y empezar a recibir clientes
            </h2>
            <p className="text-muted-foreground text-lg mb-8 leading-relaxed">
              Sabemos que no todos manejan temas tecnicos, por eso nos encargamos de todo por ti.
            </p>

            <div className="grid grid-cols-2 gap-4">
              {features.map((feature, index) => (
                <div 
                  key={feature} 
                  className={`flex items-center gap-3 transition-all duration-500 ${
                    isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
                  }`}
                  style={{ transitionDelay: `${200 + index * 50}ms` }}
                >
                  <CheckCircle className="h-5 w-5 text-primary shrink-0" />
                  <span className="text-sm text-foreground">{feature}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Right Content - Image + Highlight Cards */}
          <div className="space-y-6">
            {/* Image */}
            <div className={`relative h-64 lg:h-80 rounded-2xl overflow-hidden transition-all duration-700 delay-200 ${
              isVisible ? "opacity-100 translate-x-0" : "opacity-0 translate-x-8"
            }`}>
              <Image
                src="/about-office.jpg"
                alt="Oficina AIntegration"
                fill
                className="object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-background/60 to-transparent" />
            </div>
            
            {/* Highlight Cards */}
            {highlights.map((item, index) => (
              <div
                key={item.title}
                className={`flex gap-4 p-6 rounded-xl bg-card border border-border hover:border-primary/30 transition-all duration-500 hover-lift ${
                  isVisible ? "opacity-100 translate-x-0" : "opacity-0 translate-x-8"
                }`}
                style={{ transitionDelay: `${300 + index * 150}ms` }}
              >
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 transition-all duration-300 group-hover:bg-primary/20">
                  <item.icon className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-lg mb-1 text-foreground">{item.title}</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">{item.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
