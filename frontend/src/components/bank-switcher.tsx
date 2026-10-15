"use client"

import { Building2 } from "lucide-react"
import { useTransition } from "react"
import { usePathname, useRouter } from "next/navigation"
import { BANK_COOKIE, BANKS } from "@/lib/bank"

export function BankSwitcher({ selectedBank }: { selectedBank: string }) {
	const [pending, startTransition] = useTransition()
	const pathname = usePathname()
	const router = useRouter()

	function changeBank(bank: string) {
		if (!BANKS.some((item) => item === bank)) return
		document.cookie = `${BANK_COOKIE}=${encodeURIComponent(bank)}; Path=/; Max-Age=${60 * 60 * 24 * 365}; SameSite=Lax`
		const params = new URLSearchParams(window.location.search)
		params.delete("bank")
		params.delete("offset")
		const mainPage = pathname === "/" || pathname === "/search" || pathname === "/segments"
		const target = mainPage ? (params.size ? `${pathname}?${params.toString()}` : pathname) : "/"
		startTransition(() => {
			router.replace(target)
			router.refresh()
		})
	}

	return (
		<label className="relative flex h-9 w-full min-w-0 items-center border border-zinc-300 bg-white text-zinc-700 md:w-auto" title="Pilih konteks bank">
			<Building2 className="pointer-events-none ml-2.5 size-4 shrink-0 text-zinc-500" aria-hidden />
			<span className="sr-only">Bank aktif</span>
			<select
				value={selectedBank}
				onChange={(event) => changeBank(event.target.value)}
				disabled={pending}
				aria-label="Pilih bank untuk seluruh aplikasi"
				className="h-full min-w-0 flex-1 appearance-none bg-transparent pr-7 pl-2 text-sm font-medium outline-none disabled:opacity-60 md:max-w-52"
			>
				{BANKS.map((bank) => <option key={bank} value={bank}>{bank}</option>)}
			</select>
			<span className="pointer-events-none absolute right-2 text-[10px] text-zinc-500">▾</span>
		</label>
	)
}
