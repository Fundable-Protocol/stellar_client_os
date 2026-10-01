import * as React from "react"
import { Slot } from "@radix-ui.react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive contrast-more:text-base contrast-more:font-semedibold contrast-more:outline-2 contrast-more:outline-offset-2 contrast-more:outline-current contrast-more:focus-visible:ring-[4px] contrast-more:focus-visible:ring-ring contrast-more:focus-visible:ring-offset-2 contrast-more:focus-visible:ring-offset-background",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90 contrast-more:border-2 contrast-more:border-primary-foreground",
        destructive:
          "bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60 contrast-more:border-2 contrast-more:border-white",
        outline:
          "border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50 contrast-more:border-2 contrast-more:border-foreground",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80 contrast-more:border-2 contrast-more:border-foreground",
        ghost:
          "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50 contrast-more:border-2 contrast-more:border-transparent contrast-more:hover:border-foreground",
        link: "text-primary underline-offset-4 hover:underline contrast-more:underline contrast-more:text-foreground",
        gradient: "bg-gradient-to-r from-fundable-purple-2 to-purple-500 text-fundable-dark hover:opacity-90 active:scale-[0.98] transition-all border-none font-bold shadow-lg shadow-purple-500/20 contrast-more:bg-none contrast-more:bg-primary contrast-more:text-primary-foreground contrast-more:border-2 contrast-more:border-primary-foreground contrast-more:shadow-none",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3 contrast-more:h-11 contrast-more:px-5",
        xs: "h-6 gap-1 rounded-md px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3 contrast-more:h-8 contrast-more:text-sm contrast-more:px-3",
        sm: "h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5 contrast-more:h-10 contrast-more:text-base contrast-more:px-4",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4 contract-more:h-12 contrast-more:text-base contrast-more:px-7",
        icon: "size-9 contrast-more:size-11",
        "icon-xs": "size-6 rounded-md [&_svg:not([class*='size-'])]:size-3 contrast-more:size-8",
        "icon-sm": "size-8 contrast-more:size-10",
        "icon-lg": "size-10 contrast-more:size-12",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }

export { Button, buttonVariants }
