"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import Image from "next/image"
import { useRouter, usePathname } from "next/navigation"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { NotificationDrawer } from "@/components/notifications"
import { LogOut } from "lucide-react"

interface UserInfo {
  name: string
  email: string
  avatar?: string
}

export function TopPanel() {
  const router = useRouter()
  const pathname = usePathname()
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null)

  useEffect(() => {
    const userName = localStorage.getItem("user_name")
    const userEmail = localStorage.getItem("user_email")
    if (userName && userEmail) setUserInfo({ name: userName, email: userEmail })
  }, [])

  const handleSignOut = () => {
    localStorage.removeItem("auth_token")
    router.push("/")
  }

  const isActive = (path: string) => pathname === path

  return (
    <header className="sticky top-0 z-50 bg-white border-b border-gray-200 shadow-sm">
      <div className="px-6">
        <div className="flex h-24 items-center justify-between">
          {/* Left: brand + nav */}
          <div className="flex items-center gap-8">
            {/* Powered by Rootly AI */}
            <div className="flex flex-col items-start">
              <span className="text-sm leading-none text-gray-400">powered by</span>
              <Image
                src="/images/rootly-ai-logo.png"
                alt="Rootly AI"
                width={112}
                height={44}
                className="h-9 w-auto"
                priority
              />
            </div>

            <nav className="flex items-center gap-2">
              <Link
                href="/dashboard"
                className={`px-4 py-2 text-lg font-medium rounded-md transition-colors ${
                  isActive("/dashboard")
                    ? "text-black bg-gray-300"
                    : "text-black hover:text-black hover:bg-gray-50"
                }`}
              >
                Dashboard
              </Link>
              <Link
                href="/integrations"
                className={`px-4 py-2 text-lg font-medium rounded-md transition-colors ${
                  isActive("/integrations")
                    ? "text-black bg-gray-300"
                    : "text-black hover:text-black hover:bg-gray-50"
                }`}
              >
                Integrations
              </Link>
              <Link
                href="/methodology"
                className={`px-4 py-2 text-lg font-medium rounded-md transition-colors ${
                  isActive("/methodology")
                    ? "text-black bg-gray-300"
                    : "text-black hover:text-black hover:bg-gray-50"
                }`}
              >
                Methodology
              </Link>
            </nav>
          </div>

          {/* Right: notifications + user */}
          <div className="flex items-center gap-4">
            <NotificationDrawer />
            {userInfo && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center gap-4 px-2 py-2 rounded-full border border-slate-200 bg-slate-50/80 hover:bg-slate-100 transition-colors">
                    <Avatar className="h-9 w-9">
                      <AvatarImage src={userInfo.avatar} alt={userInfo.name} />
                      <AvatarFallback className="bg-purple-600 text-white text-base font-medium">
                        {userInfo.name
                          .split(" ")
                          .map((n) => n[0])
                          .join("")
                          .substring(0, 2)
                          .toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="hidden sm:block text-base font-medium text-black">
                      {userInfo.name.split(" ")[0]}
                    </span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <div className="px-2 py-2">
                    <p className="text-base font-medium text-gray-900">{userInfo.name}</p>
                    <p className="text-sm text-gray-500">{userInfo.email}</p>
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={handleSignOut}
                    className="cursor-pointer text-red-600 focus:text-red-600 focus:bg-red-50"
                  >
                    <LogOut className="w-4 h-4 mr-2" />
                    Sign Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}

