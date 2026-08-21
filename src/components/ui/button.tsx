import { cn } from 'src/utilities/cn'
import { Slot } from '@radix-ui/react-slot'
import { type VariantProps, cva } from 'class-variance-authority'
import * as React from 'react'

const buttonVariants = cva(
  // newwebsite.builders's button language: square, uppercase, letter-spaced
  // micro-type. No shadows, no lift — borders and colour swaps do the work.
  'inline-flex items-center justify-center whitespace-nowrap text-xs tracking-[0.15em] uppercase font-medium ring-offset-background transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    defaultVariants: {
      size: 'default',
      variant: 'default',
    },
    variants: {
      size: {
        clear: '',
        default: 'px-8 py-3.5',
        icon: 'h-10 w-10',
        lg: 'px-10 py-4',
        sm: 'px-4 py-2 text-[10px] tracking-[0.12em]',
      },
      variant: {
        // The site's primary CTA is an outline that fills on hover.
        default: 'border border-foreground text-foreground hover:bg-foreground hover:text-background',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        ghost: 'text-muted-foreground hover:text-foreground',
        // Text link, not a lozenge: normal-case, underlined like site links.
        link: 'text-muted-foreground items-start justify-start normal-case tracking-normal text-sm hover:text-foreground underline underline-offset-4',
        outline: 'border border-border text-muted-foreground hover:text-foreground hover:border-foreground',
        secondary: 'bg-foreground text-background hover:bg-foreground/90',
      },
    },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ asChild = false, className, size, variant, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp className={cn(buttonVariants({ className, size, variant }))} ref={ref} {...props} />
    )
  },
)
Button.displayName = 'Button'

export { Button, buttonVariants }
