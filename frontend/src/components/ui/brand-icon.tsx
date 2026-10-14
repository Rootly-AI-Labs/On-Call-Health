import type { SVGProps } from "react"
import type { SimpleIcon } from "simple-icons"

type BrandIconProps = Omit<SVGProps<SVGSVGElement>, "viewBox" | "fill" | "role"> & {
  icon: SimpleIcon | "linkedin"
}

const linkedinPath =
  "M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.35V9h3.414v1.561h.049c.476-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 1 1-.004-4.124 2.062 2.062 0 0 1 .004 4.124zM7.119 20.452H3.556V9h3.563v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0z"

export function BrandIcon({ icon, ...props }: BrandIconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" role="img" aria-hidden="true" {...props}>
      <path d={icon === "linkedin" ? linkedinPath : icon.path} />
    </svg>
  )
}
