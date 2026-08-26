import type { Metadata } from "next"
import Link from "next/link"
import { Inter, JetBrains_Mono } from "next/font/google"
import { CommandPalette } from "@/components/command-palette"
import "./globals.css"

const inter = Inter({
	subsets: ["latin"],
	variable: "--font-inter",
	display: "swap",
})

const mono = JetBrains_Mono({
	subsets: ["latin"],
	variable: "--font-mono-code",
	display: "swap",
})

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
		<html lang="id" className={`${inter.variable} ${mono.variable}`}>
			<body className="font-sans">
				<div className="flex min-h-screen flex-col">
					<header className="sticky top-0 z-40 border-b border-zinc-200 bg-white/95 backdrop-blur-sm">
						<div className="mx-auto flex h-14 w-full max-w-[1400px] items-center gap-6 px-6">
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

							<nav className="hidden items-center gap-1 text-sm text-zinc-600 md:flex">
								<Link className="px-2 py-1.5 hover:bg-zinc-100 hover:text-zinc-900" href="/">
									Ringkasan
								</Link>
								<Link className="px-2 py-1.5 hover:bg-zinc-100 hover:text-zinc-900" href="/search">
									Pencarian
								</Link>
								<Link className="px-2 py-1.5 hover:bg-zinc-100 hover:text-zinc-900" href="/review">
									Perlu ditinjau
								</Link>
								<Link className="px-2 py-1.5 hover:bg-zinc-100 hover:text-zinc-900" href="/segments">
									Dokumen TSD
								</Link>
							</nav>

							<div className="ml-auto">
								<CommandPalette />
							</div>
						</div>
					</header>

					<main className="mx-auto w-full max-w-[1400px] flex-1 px-6 py-8">
						{children}
					</main>

					<footer className="border-t border-zinc-200 bg-white">
						<div className="mx-auto w-full max-w-[1400px] px-6 py-4 text-xs text-zinc-500">
							Indeks dibangun dari dokumen TSD dan skrip SQL. Ringkasan AI
							ditandai eksplisit dan tidak menggantikan isi dokumen.
						</div>
					</footer>
				</div>
			</body>
		</html>
	)
}
