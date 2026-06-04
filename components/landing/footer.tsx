"use client"

import Image from "next/image"
import Link from "next/link"
import { Mail, Phone, MapPin, Linkedin, Instagram } from "lucide-react"

const footerLinks = {
  servicios: [
    { label: "Pagina Web", href: "#servicios" },
    { label: "Automatizacion con IA", href: "#servicios" },
    { label: "Sistemas (Reservas, pagos, ventas)", href: "#servicios" },
  ],
  empresa: [
    { label: "Nosotros", href: "#nosotros" },
    { label: "Cotizar", href: "#cotizar" },
    { label: "Contacto", href: "#contacto" },
  ],
  legal: [
    { label: "Terminos", href: "#" },
    { label: "Privacidad", href: "#" },
  ],
}

const socialLinks = [
  { icon: Linkedin, href: "#", label: "LinkedIn" },
  { icon: Instagram, href: "#", label: "Instagram" },
]

export function Footer() {
  return (
    <footer id="contacto" className="bg-card border-t border-border">
      <div className="container mx-auto px-4 sm:px-6">
        {/* Main Footer */}
        <div className="py-12 lg:py-16 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-8 lg:gap-12">
          {/* Brand */}
          <div className="col-span-2 lg:col-span-1">
            <Link href="#inicio" className="inline-block mb-4">
              <div className="relative h-10 w-40">
                <Image
                  src="/banner-logo.png"
                  alt="AIntegration"
                  fill
                  className="object-contain"
                />
              </div>
            </Link>
            <p className="text-muted-foreground text-sm mb-6 leading-relaxed max-w-xs">
              Creamos tu pagina web y hacemos que te lleguen clientes sin que tengas que hacer nada.
            </p>
            <div className="flex gap-2">
              {socialLinks.map((social) => (
                <a
                  key={social.label}
                  href={social.href}
                  className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all duration-300"
                  aria-label={social.label}
                >
                  <social.icon className="h-5 w-5" />
                </a>
              ))}
            </div>
          </div>

          {/* Servicios */}
          <div>
            <h4 className="font-semibold text-foreground mb-4">Servicios</h4>
            <ul className="space-y-3">
              {footerLinks.servicios.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="text-sm text-muted-foreground hover:text-primary transition-colors duration-300"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Empresa */}
          <div>
            <h4 className="font-semibold text-foreground mb-4">Empresa</h4>
            <ul className="space-y-3">
              {footerLinks.empresa.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="text-sm text-muted-foreground hover:text-primary transition-colors duration-300"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contacto */}
          <div>
            <h4 className="font-semibold text-foreground mb-4">Contacto</h4>
            <ul className="space-y-3">
              <li>
                <a 
                  href="mailto:aintegrationchile@gmail.com" 
                  className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors duration-300"
                >
                  <Mail className="h-4 w-4 text-primary shrink-0" />
                  aintegrationchile@gmail.com
                </a>
              </li>
              <li>
                <a 
                  href="tel:+56939022969" 
                  className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors duration-300"
                >
                  <Phone className="h-4 w-4 text-primary shrink-0" />
                  +56 9 3902 2969
                </a>
              </li>
              <li className="flex items-start gap-2 text-sm text-muted-foreground">
                <MapPin className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                Santiago, Chile
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="py-6 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            {new Date().getFullYear()} AIntegration. Todos los derechos reservados.
          </p>
          <div className="flex gap-6">
            {footerLinks.legal.map((link) => (
              <Link
                key={link.label}
                href={link.href}
                className="text-sm text-muted-foreground hover:text-primary transition-colors duration-300"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </footer>
  )
}