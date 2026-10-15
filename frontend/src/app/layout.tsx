import type { Metadata } from "next"
import Link from "next/link"
import { CommandPalette } from "@/components/command-palette"
import { AppNav } from "@/components/app-nav"
import { ThemeToggle } from "@/components/theme-toggle"
import { BankSwitcher } from "@/components/bank-switcher"
import { LogoutButton } from "@/components/logout-button"
import { getSelectedBank } from "@/lib/bank-context"
import { AUTH_COOKIE, verifySessionToken } from "@/lib/auth"
import { cookies } from "next/headers"
import "./globals.css"

export const metadata: Metadata = {
	title: "TSD Engine",
	description:
		"Mesin pencari stored procedure dan dokumen TSD untuk REGLA_DM, REGLA_LBBU, dan REGLA_LLL.",
}

export default async function RootLayout({
	children,
}: {
	children: React.ReactNode
}) {
	const store = await cookies()
	const authenticated = await verifySessionToken(store.get(AUTH_COOKIE)?.value)
	const selectedBank = await getSelectedBank()
	return (
			<html lang="id" suppressHydrationWarning>
				<head><script dangerouslySetInnerHTML={{ __html: `try{const t=localStorage.getItem('tsd-theme');if(t==='dark'||(!t&&matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.classList.add('dark')}catch{}` }} /></head>
			<body className="font-sans">
				{!authenticated ? children : (
				<div className="flex min-h-screen flex-col">
					<header className="sticky top-0 z-40 border-b border-zinc-200 bg-white/95 backdrop-blur-sm">
						<div className="mx-auto flex h-14 w-full max-w-[1320px] items-center gap-4 px-4 sm:px-6">
							<Link
								href="/"
								className="flex items-baseline gap-2 whitespace-nowrap"
							>
								<span className="font-mono text-sm font-semibold tracking-tight text-zinc-900">
									TSD&nbsp;Engine
								</span>
							</Link>

							<div className="hidden md:block"><AppNav /></div>

							<div className="ml-auto flex items-center gap-2">
								<div className="hidden md:block"><BankSwitcher selectedBank={selectedBank} /></div>
								<ThemeToggle />
								<CommandPalette selectedBank={selectedBank} />
								<LogoutButton />
							</div>
						</div>
						<div className="border-t border-zinc-100 px-4 py-2 md:hidden"><BankSwitcher selectedBank={selectedBank} /></div>
						<div className="max-w-full overflow-hidden border-t border-zinc-100 md:hidden"><AppNav /></div>
					</header>

					<main className="mx-auto w-full max-w-[1320px] flex-1 px-4 py-6 sm:px-6 sm:py-8">
						{children}
					</main>

					<footer className="border-t border-zinc-200 bg-white">
						<div className="mx-auto w-full max-w-[1320px] px-4 py-4 text-sm text-zinc-600 sm:px-6">
							Indeks dibangun dari dokumen TSD dan skrip SQL. Ringkasan AI
							ditandai eksplisit dan tidak menggantikan isi dokumen.
						</div>
					</footer>
				</div>
				)}
			</body>
		</html>
	)
}
