import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center bg-clip-padding text-base whitespace-nowrap transition-colors transition-transform duration-150 outline-none select-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: // Primary — our token bg-accent text-foreground, h-12 (48px), rounded-md, no pill
          "bg-accent text-foreground shadow-button hover:bg-accent-strong border-none rounded-md min-h-[48px] px-4 font-medium text-sm",
        outline: // Secondary surface — bg-card border-border rounded-md
          "border border-border bg-card hover:bg-muted hover:text-foreground border-none rounded-md min-h-[48px] px-4 font-medium text-sm",
        secondary: // Surface button — bg-surface variant
          "bg-secondary text-secondary-foreground hover:bg-secondary/90 border-none rounded-md min-h-[48px] px-4 font-medium text-sm",
        ghost: // Ghost — transparent bg, text-muted-foreground, hover accent
          "text-muted-foreground hover:bg-accent hover:text-foreground border-none rounded-md min-h-[48px] px-4 font-normal text-sm aria-expanded:bg-accent aria-expanded:text-foreground",
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/20 border-none rounded-md min-h-[48px] px-4 font-medium text-sm",
        link: "text-primary underline-offset-4 hover:underline border-none rounded-md min-h-[48px] px-4 font-medium text-sm",
        navigation: // Bottom nav item — transparent, no radius, active/inactive text colors
          "text-muted-foreground hover:text-foreground border-none rounded-none h-full px-0 font-normal text-sm flex items-center justify-center gap-1",
        "input-button": // Input button / search mini
          "text-foreground hover:bg-accent border-none rounded-sm px-1 h-10 font-normal text-sm",
      },
      size: {
        default: "gap-2 px-4 rounded-md has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        xs: "gap-1.5 rounded-md px-3 text-base in-data-[slot=button-group]:rounded-md has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-3.5",
        sm: "gap-1.5 rounded-md px-3 text-base in-data-[slot=button-group]:rounded-md has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-4",
        lg: "gap-2 px-4 rounded-md has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        xl: "gap-2 px-5 rounded-md text-base",
        icon: "size-12 rounded-md",
        "icon-xs": "size-12 rounded-md in-data-[slot=button-group]:rounded-md [&_svg:not([class*='size-'])]:size-3.5",
        "icon-sm": "size-12 rounded-md in-data-[slot=button-group]:rounded-md",
        "icon-lg": "size-14 rounded-md",
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
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
