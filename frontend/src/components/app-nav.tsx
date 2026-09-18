"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"

const ITEMS = [
	{ href: "/", label: "Ringkasan" },
	{ href: "/search", label: "Pencarian" },
	{ href: "/segments", label: "Dokumen TSD" },
]

export function AppNav() {
	const pathname = usePathname()

	return (
		<nav aria-label="Navigasi utama" className="thin-scroll flex w-full max-w-full overflow-x-auto">
			{ITEMS.map((item) => {
				const active = item.href === "/"
					? pathname === "/"
					: item.href === "/search"
						? pathname.startsWith("/search") || pathname.startsWith("/sp/") || pathname.startsWith("/tables/")
						: pathname.startsWith(item.href)
				return (
					<Link
						key={item.href}
						href={item.href}
						aria-current={active ? "page" : undefined}
						className={cn(
							"flex h-11 shrink-0 items-center border-b-2 px-2 text-sm font-medium transition-colors duration-150 md:px-3",
							active
								? "border-accent text-zinc-950"
								: "border-transparent text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950",
						)}
					>
						{item.label}
					</Link>
				)
			})}
		</nav>
	)
}
