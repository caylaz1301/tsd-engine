"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { CornerDownLeft, Loader2, Search } from "lucide-react"
import { search, type SearchRow } from "@/lib/api"
import { cn } from "@/lib/utils"
import { StatusBadge } from "@/components/ui"

/**
 * Pintu masuk utama pencarian. Dibuka dengan Cmd+K atau Ctrl+K.
 *
 * Pencarian dijalankan setelah jeda 180 ms supaya tiap ketikan tidak memicu
 * permintaan ke backend. Setiap permintaan membawa nomor urut, dan hasil yang
 * datang terlambat dibuang, karena jawaban lama bisa tiba setelah jawaban baru.
 */
export function CommandPalette() {
	const router = useRouter()
	const [open, setOpen] = useState(false)
	const [q, setQ] = useState("")
	const [rows, setRows] = useState<SearchRow[]>([])
	const [total, setTotal] = useState(0)
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [active, setActive] = useState(0)

	const inputRef = useRef<HTMLInputElement>(null)
	const triggerRef = useRef<HTMLButtonElement>(null)
	const seq = useRef(0)

	// Cmd+K / Ctrl+K membuka, Escape menutup.
	useEffect(() => {
		function onKey(e: KeyboardEvent) {
			if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
				e.preventDefault()
				setOpen((v) => !v)
			}
			if (e.key === "Escape") setOpen(false)
		}
		window.addEventListener("keydown", onKey)
		return () => window.removeEventListener("keydown", onKey)
	}, [])

	useEffect(() => {
		if (open) {
			const trigger = triggerRef.current
			document.body.style.overflow = "hidden"
			const t = setTimeout(() => inputRef.current?.focus(), 20)
			return () => {
				clearTimeout(t)
				document.body.style.overflow = ""
				trigger?.focus()
			}
		}
	}, [open])

	useEffect(() => {
		const term = q.trim()
		if (term.length < 2) {
			const timer = setTimeout(() => {
				setRows([])
				setTotal(0)
				setError(null)
				setLoading(false)
			}, 0)
			return () => clearTimeout(timer)
		}
		const mine = ++seq.current
		const timer = setTimeout(async () => {
			setLoading(true)
			try {
				const res = await search({ q: term, hideVariants: true, limit: 8 })
				if (mine !== seq.current) return
				setRows(res.results)
				setTotal(res.total)
				setActive(0)
				setError(null)
			} catch (e) {
				if (mine !== seq.current) return
				setRows([])
				setError(e instanceof Error ? e.message : "Pencarian gagal.")
			} finally {
				if (mine === seq.current) setLoading(false)
			}
		}, 180)
		return () => clearTimeout(timer)
	}, [q])

	const go = useCallback(
		(row: SearchRow | undefined) => {
			const href = row
				? `/sp/${encodeURIComponent(row.sp_name)}`
				: `/search?q=${encodeURIComponent(q.trim())}`
			router.push(href)
			setOpen(false)
		},
		[q, router],
	)

	function onInputKey(e: React.KeyboardEvent<HTMLInputElement>) {
		if (e.key === "ArrowDown") {
			e.preventDefault()
			setActive((i) => Math.min(i + 1, rows.length - 1))
		} else if (e.key === "ArrowUp") {
			e.preventDefault()
			setActive((i) => Math.max(i - 1, 0))
		} else if (e.key === "Enter") {
			e.preventDefault()
			go(rows[active])
		}
	}

	return (
		<>
			<button
				ref={triggerRef}
				type="button"
				onClick={() => setOpen(true)}
				aria-label="Buka pencarian"
				className="flex size-10 items-center gap-2 border border-zinc-300 bg-white px-3 text-left text-zinc-700 hover:border-zinc-400 hover:bg-zinc-50 hover:text-zinc-950 sm:h-10 sm:w-[240px]"
			>
				<Search className="size-3.5" aria-hidden />
				<span className="hidden flex-1 sm:inline">Cari stored procedure</span>
				<kbd className="hidden border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 font-mono text-xs text-zinc-600 sm:inline">
					⌘K
				</kbd>
			</button>

			{open ? (
				<div
					className="command-palette-overlay fixed inset-0 z-50 flex items-start justify-center bg-white/60 px-3 pt-16 sm:px-4 sm:pt-20"
					onMouseDown={() => setOpen(false)}
					role="presentation"
				>
					<div
						className="command-palette-panel w-full max-w-[760px] border border-zinc-300 bg-white shadow-[0_4px_8px_rgb(24_24_27_/_0.06)]"
						onMouseDown={(e) => e.stopPropagation()}
						role="dialog"
						aria-modal="true"
						aria-label="Cari stored procedure"
					>
						<div className="command-palette-input-row flex h-14 items-center gap-3 border-b border-zinc-200 px-4">
							{loading ? (
								<Loader2
									className="size-4 shrink-0 animate-spin text-zinc-500"
									aria-hidden
								/>
							) : (
								<Search
									className="command-palette-search-icon size-4 shrink-0 text-zinc-500"
									aria-hidden
								/>
							)}
							<input
								ref={inputRef}
								value={q}
								onChange={(e) => setQ(e.target.value)}
								onKeyDown={onInputKey}
								placeholder="Nama SP, tabel, atau segment..."
								className={cn(
									"command-palette-input h-full min-w-0 flex-1 bg-transparent font-mono text-[15px] text-zinc-950 outline-none placeholder:font-sans placeholder:text-zinc-500",
									q.length === 0 ? "caret-transparent" : "caret-zinc-900",
								)}
								spellCheck={false}
								autoComplete="off"
								aria-label="Cari stored procedure, tabel, atau segment"
							/>
							<kbd className="shrink-0 border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 font-mono text-xs text-zinc-600">
								esc
							</kbd>
						</div>

						<div className="max-h-[56vh] overflow-y-auto thin-scroll">
							{error ? (
								<p className="px-3 py-5 text-red-700">{error}</p>
							) : q.trim().length < 2 ? (
								<div className="px-3 py-4">
									<p className="text-zinc-700">
										Ketik minimal dua karakter untuk mencari SP, tabel, atau
										segment.
									</p>
									<p className="mt-1 text-sm text-zinc-600">
										Salinan arsip disembunyikan dari hasil cepat.
									</p>
								</div>
							) : rows.length === 0 && !loading ? (
								<p className="px-3 py-5 text-zinc-600">
									Tidak ada hasil untuk{" "}
									<span className="font-mono">{q.trim()}</span>.
								</p>
							) : (
								<ul>
									{rows.map((r, i) => (
										<li key={r.sp_key}>
											<Link
												href={`/sp/${encodeURIComponent(r.sp_name)}`}
												onMouseEnter={() => setActive(i)}
												onClick={() => setOpen(false)}
												className={cn(
											"flex min-h-14 w-full items-center gap-3 border-b border-zinc-100 px-4 py-3 text-left hover:bg-zinc-50",
													i === active && "bg-zinc-100",
												)}
											>
												<span className="min-w-0 flex-1">
											<span className="block truncate font-mono text-sm font-medium text-zinc-950">
														{r.sp_name}
													</span>
											<span className="mt-0.5 block truncate text-sm text-zinc-600">
														{r.segment ?? r.sql_database ?? "tanpa segment"}
														{r.body_lines ? ` · ${r.body_lines} baris` : ""}
													</span>
												</span>
												<StatusBadge status={r.status} />
												{i === active ? (
													<CornerDownLeft
														className="size-3.5 shrink-0 text-zinc-400"
														aria-hidden
													/>
												) : null}
											</Link>
										</li>
									))}
								</ul>
							)}
						</div>

						<div className="flex min-h-11 items-center justify-between border-t border-zinc-200 bg-zinc-50 px-4 py-2 text-xs text-zinc-600">
							<span>
								{total > rows.length
									? `Menampilkan ${rows.length} dari ${total} hasil`
									: "↑↓ pilih · ↵ buka"}
							</span>
							{q.trim() ? (
								<Link
									href={`/search?q=${encodeURIComponent(q.trim())}`}
									onClick={() => setOpen(false)}
									className="font-medium text-zinc-800 hover:underline"
								>
									Lihat semua hasil
								</Link>
							) : null}
						</div>
					</div>
				</div>
			) : null}
		</>
	)
}
