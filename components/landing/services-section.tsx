"use client"

import { useEffect, useRef, useState } from "react"
import { Code, Brain, Settings2, CheckCircle2, ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import Link from "next/link"

const services = [
  {
    icon: Code,
    serviceId: "web-development",
    title: "Desarrollo Web",
    description: "Creamos tu pagina web lista para que tus clientes te encuentren y te contacten.",
    features: [
      "Pagina lista para usar (Hosting y dominio incluido)",
      "Seguridad incluida (SSL)",
      "Botones de redes sociales",
      "Aparece en resultados de busqueda (Google)",
    ],
    price: 94990,
  },
  {
    icon: Brain,
    serviceId: "ai-integration",
    title: "Integracion de IA",
    description: "Automatizamos tareas de tu negocio para que ahorres tiempo y respondas mas rapido.",
    features: [
      "Respuestas automaticas a clientes (Chatbots)",
      "Seguimiento de clientes (Analisis de datos)",
      "Procesos que funcionan solos (Automatizaciones)",
      "Soluciones segun tu negocio (Modelos personalizados)",
      "Conexion entre herramientas (Integraciones API)",
    ],
    price: 129990,
  },
  {
    icon: Settings2,
    serviceId: "systems",
    title: "Implementacion de Sistemas",
    description: "Implementamos sistemas clave para tu negocio como reservas, pagos o ventas online.",
    features: [
      "Sistema de reservas online (Booking)",
      "Pagos en linea (Pasarela de pago)",
      "Carrito de compras (E-commerce)",
      "Integracion con tu negocio (Sistemas personalizados)",
      "Funcionamiento automatico y eficiente",
    ],
    price: 114990,
  },
]

function ServiceCard({ service, index }: { service: typeof services[0], index: number }) {
  const [isVisible, setIsVisible] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setTimeout(() => setIsVisible(true), index * 150)
        }
      },
      { threshold: 0.1, rootMargin: "0px 0px -50px 0px" }
    )

    if (cardRef.current) {
      observer.observe(cardRef.current)
    }

    return () => observer.disconnect()
  }, [index])

  return (
    <div
      ref={cardRef}
      className={`relative group bg-card border border-border rounded-2xl p-8 transition-all duration-500 hover:border-primary/30 hover-lift flex flex-col h-full ${
        isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
      }`}
    >
      <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center mb-6 transition-all duration-300 group-hover:bg-primary/20 group-hover:scale-110">
        <service.icon className="h-7 w-7 text-primary" />
      </div>

      <h3 className="text-xl font-bold mb-3 text-foreground">{service.title}</h3>
      <p className="text-muted-foreground leading-relaxed mb-6 text-sm">
        {service.description}
      </p>

      <ul className="space-y-3 mb-8 flex-grow">
        {service.features.map((feature) => (
          <li key={feature} className="flex items-center gap-3 text-sm text-foreground/80">
            <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
            {feature}
          </li>
        ))}
      </ul>

      <div className="pt-6 border-t border-border mt-auto">
        <div className="flex items-baseline gap-1 mb-4">
          <span className="text-xs text-muted-foreground uppercase tracking-wide">Desde</span>
          <span className="text-2xl font-bold text-primary">
            ${service.price.toLocaleString('es-CL')}
          </span>
          <span className="text-xs text-muted-foreground">CLP</span>
        </div>
        <Button
          asChild
          className="w-full bg-primary text-primary-foreground hover:bg-primary/90 group/btn transition-all duration-300"
        >
          <Link href="#cotizar">
            Quiero mi web
            <ArrowRight className="ml-2 h-4 w-4 transition-transform duration-300 group-hover/btn:translate-x-1" />
          </Link>
        </Button>
      </div>
    </div>
  )
}

export function ServicesSection() {
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
    <section ref={sectionRef} id="servicios" className="py-24 lg:py-32 relative">
      <div className="container mx-auto px-4 sm:px-6">
        <div className={`text-center max-w-3xl mx-auto mb-16 transition-all duration-700 ${
          isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
        }`}>
          <span className="inline-block px-4 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium mb-4">
            Servicios
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-6 tracking-tight text-balance">
            Lo que tu negocio necesita para empezar online
          </h2>
          <p className="text-muted-foreground text-lg leading-relaxed">
            Creamos tu pagina web y dejamos funcionando todo para que recibas clientes sin complicarte.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
          {services.map((service, index) => (
            <ServiceCard key={service.serviceId} service={service} index={index} />
          ))}
        </div>
      </div>
    </section>
  )
}