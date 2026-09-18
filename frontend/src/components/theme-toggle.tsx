"use client"

import { Moon, Sun } from "lucide-react"

export function ThemeToggle() {
	function toggle() {
		const next = !document.documentElement.classList.contains("dark")
		document.documentElement.classList.toggle("dark", next)
		localStorage.setItem("tsd-theme", next ? "dark" : "light")
	}

	return (
		<button type="button" onClick={toggle} title="Ganti mode terang atau gelap" aria-label="Ganti mode terang atau gelap" className="inline-flex size-10 items-center justify-center border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100">
			<Moon className="size-4 dark:hidden" aria-hidden /><Sun className="hidden size-4 dark:block" aria-hidden />
		</button>
	)
}
