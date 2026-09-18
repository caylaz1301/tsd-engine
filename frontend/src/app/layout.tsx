import type { Metadata } from "next"
import Link from "next/link"
import { CommandPalette } from "@/components/command-palette"
import { AppNav } from "@/components/app-nav"
import { ThemeToggle } from "@/components/theme-toggle"
import "./globals.css"

export const metadata: Metadata = {
	title: "TSD Engine",
	description:
		"Mesin pencari stored procedure dan dokumen TSD untuk REGLA_DM, REGLA_LBBU, dan REGLA_LLL.",
}

export default function RootLayout({
	children,
}: {
	children: React.ReactNode
}) {
	return (
			<html lang="id" suppressHydrationWarning>
				<head><script dangerouslySetInnerHTML={{ __html: `try{const t=localStorage.getItem('tsd-theme');if(t==='dark'||(!t&&matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.classList.add('dark')}catch{}` }} /></head>
			<body className="font-sans">
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
								<span className="hidden text-[11px] tracking-wide text-zinc-400 uppercase sm:inline">
									REGLA
								</span>
							</Link>

							<div className="hidden md:block"><AppNav /></div>

							<div className="ml-auto flex items-center gap-2">
								<ThemeToggle />
								<CommandPalette />
							</div>
						</div>
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
			</body>
		</html>
	)
}
