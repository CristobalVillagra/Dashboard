import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-semibold shadow-sm transition-all duration-150 ease-out active:scale-[0.97] active:shadow-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-[#34d399]/45 focus-visible:ring-offset-2 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default: 'bg-[#1f7a5b] text-white hover:bg-[#1a6b50]',
        destructive:
          'bg-[#b42318] text-white hover:bg-[#9f1f16] focus-visible:ring-[#f97066]/35',
        outline:
          'border border-[#cfd9e5] bg-white text-[#31506b] hover:border-[#1f7a5b] hover:bg-[#eefaf3] hover:text-[#1f6a4f]',
        secondary:
          'bg-[#e7f5ee] text-[#1f6a4f] hover:bg-[#d6efe3]',
        ghost:
          'text-[#31506b] shadow-none hover:bg-[#eefaf3] hover:text-[#1f6a4f]',
        link: 'text-[#1f7a5b] shadow-none underline-offset-4 hover:text-[#176449] hover:underline',
      },
      size: {
        default: 'h-9 px-4 py-2 has-[>svg]:px-3',
        sm: 'h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5',
        lg: 'h-10 rounded-md px-6 has-[>svg]:px-4',
        icon: 'size-9',
        'icon-sm': 'size-8',
        'icon-lg': 'size-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : 'button'

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
