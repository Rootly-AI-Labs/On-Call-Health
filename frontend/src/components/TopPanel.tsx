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
import { TeamManagementDialog } from "@/components/TeamManagementDialog"
import { useGettingStarted } from "@/contexts/GettingStartedContext"
import {
  LogOut,
  BookOpen,
  HelpCircle,
  Settings,
  Users,
  FileText,
  MessageSquareMore,
  Key,
  Menu,
} from "lucide-react"
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
} from "@/components/ui/sheet"

interface UserInfo {
  name: string
  email: string
  avatar?: string
  role?: string
}

export function TopPanel() {
  const router = useRouter()
  const pathname = usePathname()
  const { openGettingStarted } = useGettingStarted()
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null)
  const [showAccountSettings, setShowAccountSettings] = useState(false)
  const [showTeamManagement, setShowTeamManagement] = useState(false)
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const [isNavDrawerOpen, setIsNavDrawerOpen] = useState(false)

  useEffect(() => {
    // Only access localStorage on client-side to prevent SSR hydration mismatch
    if (typeof window === 'undefined') return

    const authToken = localStorage.getItem("auth_token")
    const userName = localStorage.getItem("user_name")
    const userEmail = localStorage.getItem("user_email")
    const userRole = localStorage.getItem("user_role")
    // Require auth_token to exist along with user details.
    // Note: True token validation (signature, expiration) happens on the backend.
    // This check prevents unnecessary UI rendering when there's clearly no session.
    // Invalid tokens will result in 401 errors that redirect to login.
    if (authToken && userName && userEmail) {
      setUserInfo({ name: userName, email: userEmail, role: userRole || undefined })
    }
  }, [])

  const handleSignOut = () => {
    // Clear all auth-related data and redirect
    localStorage.removeItem("auth_token")
    localStorage.removeItem("user_name")
    localStorage.removeItem("user_email")
    localStorage.removeItem("user_role")
    setUserInfo(null)
    router.push("/")
  }

  const isActive = (path: string) => pathname === path

  // Check if user is admin (support both old and new role names during transition)
  const isAdmin = userInfo?.role === 'admin'

  return (
    <header className="sticky top-0 z-50 w-full bg-white border-b border-neutral-300">
      <div className="px-2 sm:px-4 md:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Left: brand + nav */}
          <div className="flex items-center gap-1 sm:gap-2 md:gap-6 lg:gap-10">
            {/* On-Call Health logo */}
            <Link href="/dashboard" className="flex flex-col items-start -space-y-0.5 hover:opacity-80 transition-opacity">
              <div className="flex items-center gap-1">
                <span className="text-xs sm:text-sm md:text-base lg:text-lg font-normal text-black">On-Call Health</span>
                <Image
                  src="/images/on-call-health-logo.svg"
                  alt="On-Call Health"
                  width={32}
                  height={32}
                  className="w-4 sm:w-5 md:w-6"
                />
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[8px] text-black/70 font-light">Powered by</span>
                <Image
                  src="/images/rootly-ai-logo.png"
                  alt="Rootly"
                  width={321}
                  height={129}
                  className="w-[45px] sm:w-[60px]"
                  priority
                />
              </div>
            </Link>

            {/* Desktop navigation - hidden on mobile */}
            <nav className="hidden md:flex items-center gap-1">
              <Link
                href="/dashboard"
                className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all duration-200 ${
                  isActive("/dashboard")
                    ? "bg-purple-700 text-white shadow-xs"
                    : "text-neutral-700 hover:text-white hover:bg-purple-800"
                }`}
              >
                Dashboard
              </Link>
              <Link
                href="/integrations"
                className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all duration-200 ${
                  isActive("/integrations")
                    ? "bg-purple-700 text-white shadow-xs"
                    : "text-neutral-700 hover:text-white hover:bg-purple-800"
                }`}
              >
                Integrations
              </Link>
              <Link
                href="/management"
                className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all duration-200 ${
                  isActive("/management")
                    ? "bg-purple-700 text-white shadow-xs"
                    : "text-neutral-700 hover:text-white hover:bg-purple-800"
                }`}
              >
                Team Settings
              </Link>
            </nav>

            {/* Mobile navigation - hamburger menu */}
            <Sheet open={isNavDrawerOpen} onOpenChange={setIsNavDrawerOpen}>
              <SheetTrigger asChild>
                <button className="md:hidden flex items-center justify-center p-2 rounded-lg hover:bg-purple-100 transition-colors">
                  <Menu className="w-6 h-6 text-neutral-700" />
                </button>
              </SheetTrigger>
              <SheetContent side="left" className="w-64">
                <SheetTitle className="hidden">Navigation Menu</SheetTitle>
                <nav className="flex flex-col gap-2 mt-8">
                  <Link
                    href="/dashboard"
                    onClick={() => setIsNavDrawerOpen(false)}
                    className={`px-4 py-3 text-base font-semibold rounded-lg transition-all duration-200 ${
                      isActive("/dashboard")
                        ? "bg-purple-700 text-white shadow-xs"
                        : "text-neutral-700 hover:text-white hover:bg-purple-800"
                    }`}
                  >
                    Dashboard
                  </Link>
                  <Link
                    href="/integrations"
                    onClick={() => setIsNavDrawerOpen(false)}
                    className={`px-4 py-3 text-base font-semibold rounded-lg transition-all duration-200 ${
                      isActive("/integrations")
                        ? "bg-purple-700 text-white shadow-xs"
                        : "text-neutral-700 hover:text-white hover:bg-purple-800"
                    }`}
                  >
                    Integrations
                  </Link>
                  <Link
                    href="/management"
                    onClick={() => setIsNavDrawerOpen(false)}
                    className={`px-4 py-3 text-base font-semibold rounded-lg transition-all duration-200 ${
                      isActive("/management")
                        ? "bg-purple-700 text-white shadow-xs"
                        : "text-neutral-700 hover:text-white hover:bg-purple-800"
                    }`}
                  >
                    Management
                  </Link>
                </nav>
              </SheetContent>
            </Sheet>
          </div>

          {/* Right: feedback + notifications + user (only shown when authenticated) */}
          <div className="flex items-center gap-1 sm:gap-2 md:gap-3">
            {userInfo && (
              <>
                <a
                  href="https://github.com/Rootly-AI-Labs/On-Call-Health/issues/new"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 sm:gap-2 px-1.5 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm font-medium text-purple-700 bg-purple-100 hover:bg-purple-200 rounded-lg transition-colors"
                >
                  <MessageSquareMore className="w-5 h-5 sm:w-5 sm:h-5" />
                  <span className="hidden sm:inline">Feedback</span>
                </a>
                <NotificationDrawer />
              <DropdownMenu open={isDropdownOpen} onOpenChange={(open) => {
                setIsDropdownOpen(open)
                // Close dropdown when dialog opens
                if (showAccountSettings) {
                  setIsDropdownOpen(false)
                }
              }}>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center gap-1.5 sm:gap-2.5 px-1 sm:px-2.5 py-1 sm:py-1.5 rounded-full border border-neutral-200 bg-white hover:bg-purple-100 hover:border-neutral-300 transition-all duration-200 shadow-xs hover:shadow-xs">
                    <Avatar className="h-7 w-7 sm:h-8 sm:w-8 md:h-9 md:w-9 ring-2 ring-white">
                      <AvatarImage src={userInfo.avatar} alt={userInfo.name} />
                      <AvatarFallback className="bg-purple-700 text-white text-xs sm:text-sm font-semibold">
                        {userInfo.name
                          .split(" ")
                          .map((n) => n[0])
                          .join("")
                          .substring(0, 2)
                          .toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="hidden sm:block text-xs sm:text-sm font-semibold text-neutral-900 pr-0.5 sm:pr-1">
                      {userInfo.name.split(" ")[0]}
                    </span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 shadow-lg">
                  <div className="px-3 py-2.5">
                    <p className="text-sm font-semibold text-neutral-900">{userInfo.name}</p>
                    <p className="text-xs text-neutral-500 mt-0.5">{userInfo.email}</p>
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => {
                      setShowAccountSettings(true)
                      setIsDropdownOpen(false)
                    }}
                    className="cursor-pointer focus:bg-purple-100 focus:text-purple-900"
                  >
                    <Settings className="w-4 h-4 mr-2" />
                    Account Settings
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      router.push("/management?view=team")
                      setIsDropdownOpen(false)
                    }}
                    className="cursor-pointer focus:bg-purple-100 focus:text-purple-900"
                  >
                    <Users className="w-4 h-4 mr-2" />
                    <span className="flex-1">Team</span>
                    {userInfo.role && (
                      <span className="ml-2 px-1.5 py-0.5 text-[10px] font-medium rounded-sm bg-purple-200 text-purple-900 capitalize">
                        {userInfo.role.replace('_', ' ')}
                      </span>
                    )}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      router.push("/dashboard/api-keys")
                      setIsDropdownOpen(false)
                    }}
                    className="cursor-pointer focus:bg-purple-100 focus:text-purple-900"
                  >
                    <Key className="w-4 h-4 mr-2" />
                    API Keys
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => {
                      openGettingStarted()
                      setIsDropdownOpen(false)
                    }}
                    className="cursor-pointer focus:bg-purple-100 focus:text-purple-900"
                  >
                    <HelpCircle className="w-4 h-4 mr-2" />
                    Getting Started
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => router.push("/methodology")}
                    className="cursor-pointer focus:bg-purple-200 focus:text-purple-900"
                  >
                    <BookOpen className="w-4 h-4 mr-2" />
                    Methodology
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => router.push("/disclaimer")}
                    className="cursor-pointer focus:bg-purple-200 focus:text-purple-900"
                  >
                    <FileText className="w-4 h-4 mr-2" />
                    Disclaimer
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
              </>
            )}
          </div>
        </div>
      </div>
      <AccountSettingsDialog
        isOpen={showAccountSettings}
        onClose={() => setShowAccountSettings(false)}
        userEmail={userInfo?.email || ''}
      />
      <TeamManagementDialog
        isOpen={showTeamManagement}
        onClose={() => setShowTeamManagement(false)}
      />
    </header>
  )
}

