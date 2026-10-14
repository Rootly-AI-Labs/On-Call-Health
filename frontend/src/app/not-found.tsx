import Link from "next/link"
import { Button } from "@/components/ui/button"

export default function NotFound() {
  return (
    <main className="min-h-screen bg-linear-to-b from-purple-50 via-white to-white">
      <div className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center px-6 text-center">
        <p className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-purple-700">
          Error 404
        </p>
        <h1 className="font-display text-4xl font-semibold text-neutral-900 sm:text-5xl">
          Page not found
        </h1>
        <p className="mt-4 max-w-xl text-base text-neutral-600 sm:text-lg">
          The page you requested does not exist or may have moved.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button asChild size="lg">
            <Link href="/">Go to home</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/integrations">View integrations</Link>
          </Button>
        </div>
      </div>
    </main>
  )
}
