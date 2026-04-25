import * as React from "react"
import { cn } from "@/lib/utils"

export interface SwitchProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

const Switch = React.forwardRef<HTMLInputElement, SwitchProps>(
  ({ className, checked, ...props }, ref) => {
    return (
      <label 
        className="relative inline-flex items-center cursor-pointer" 
        role="switch"
        aria-checked={checked}
      >
        <input
          type="checkbox"
          className="sr-only peer"
          ref={ref}
          checked={checked}
          {...props}
        />
        <div className={cn(
          "relative w-11 h-6 bg-zinc-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-600 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600",
          className
        )} />
      </label>
    )
  }
)
Switch.displayName = "Switch"

export { Switch }