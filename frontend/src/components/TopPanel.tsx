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
import { AccountSettingsDialog } from "@/components/AccountSettingsDialog"
import { useGettingStarted } from "@/contexts/GettingStartedContext"
import { LogOut, BookOpen, HelpCircle, Settings } from "lucide-react"

interface UserInfo {
  name: string
  email: string
  avatar?: string
}

export function TopPanel() {
  const router = useRouter()
  const pathname = usePathname()
  const { openGettingStarted } = useGettingStarted()
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null)
  const [showAccountSettings, setShowAccountSettings] = useState(false)
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)

  useEffect(() => {
    const userName = localStorage.getItem("user_name")
    const userEmail = localStorage.getItem("user_email")
    if (userName && userEmail) setUserInfo({ name: userName, email: userEmail })
  }, [])

  const handleSignOut = () => {
    // Clear auth token and redirect
    localStorage.removeItem("auth_token")
    router.push("/")
  }

  const isActive = (path: string) => pathname === path

  return (
    <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-gray-200/60">
      <div className="px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Left: brand + nav */}
          <div className="flex items-center gap-10">
            {/* On-Call Burnout powered by Rootly AI */}
            <div className="flex flex-col items-start gap-1">
              <span className="text-sm font-extrabold text-gray-700">On-Call Burnout</span>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] uppercase tracking-wide leading-none text-gray-400 font-medium">powered by</span>
                <Image
                  src="/images/rootly-ai-logo.png"
                  alt="Rootly AI"
                  width={112}
                  height={44}
                  className="h-5 w-auto"
                  priority
                />
              </div>
            </div>

            <nav className="hidden md:flex items-center gap-1">
              <Link
                href="/dashboard"
                className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all duration-200 ${
                  isActive("/dashboard")
                    ? "text-purple-700 bg-purple-50 shadow-sm"
                    : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                }`}
              >
                Dashboard
              </Link>
              <Link
                href="/integrations"
                className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all duration-200 ${
                  isActive("/integrations")
                    ? "text-purple-700 bg-purple-50 shadow-sm"
                    : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                }`}
              >
                Integrations
              </Link>
            </nav>
          </div>

          {/* Right: notifications + user */}
          <div className="flex items-center gap-3">
            <NotificationDrawer />
            {userInfo && (
              <DropdownMenu open={isDropdownOpen} onOpenChange={(open) => {
                setIsDropdownOpen(open)
                // Close dropdown when dialog opens
                if (showAccountSettings) {
                  setIsDropdownOpen(false)
                }
              }}>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center gap-3 px-2.5 py-1.5 rounded-full border border-gray-200 bg-white hover:bg-gray-50 hover:border-gray-300 transition-all duration-200 shadow-sm hover:shadow">
                    <Avatar className="h-8 w-8 ring-2 ring-white">
                      <AvatarImage src={userInfo.avatar} alt={userInfo.name} />
                      <AvatarFallback className="bg-gradient-to-br from-purple-600 to-purple-700 text-white text-sm font-semibold">
                        {userInfo.name
                          .split(" ")
                          .map((n) => n[0])
                          .join("")
                          .substring(0, 2)
                          .toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="hidden sm:block text-sm font-semibold text-gray-700 pr-1">
                      {userInfo.name.split(" ")[0]}
                    </span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 shadow-lg">
                  <div className="px-3 py-2.5">
                    <p className="text-sm font-semibold text-gray-900">{userInfo.name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{userInfo.email}</p>
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => {
                      openGettingStarted()
                      setIsDropdownOpen(false)
                    }}
                    className="cursor-pointer"
                  >
                    <HelpCircle className="w-4 h-4 mr-2" />
                    Getting Started
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => router.push("/methodology")}
                    className="cursor-pointer"
                  >
                    <BookOpen className="w-4 h-4 mr-2" />
                    Methodology
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      setShowAccountSettings(true)
                      setIsDropdownOpen(false)
                    }}
                    className="cursor-pointer"
                  >
                    <Settings className="w-4 h-4 mr-2" />
                    Account Settings
                  </DropdownMenuItem>
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
      <AccountSettingsDialog
        isOpen={showAccountSettings}
        onClose={() => setShowAccountSettings(false)}
        userEmail={userInfo?.email || ''}
      />
    </header>
  )
}

