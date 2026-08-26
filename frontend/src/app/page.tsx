import Link from "next/link"
import { ArrowUpRight } from "lucide-react"
import { getStats, type Stats } from "@/lib/api"
import { num } from "@/lib/utils"
import {
	ErrorPanel,
	Mono,
	SectionHeading,
	Stat,
} from "@/components/ui"

export const dynamic = "force-dynamic"

export default async function HomePage() {
	let stats: Stats
	try {
		stats = await getStats()
	} catch (e) {
		return (
			<ErrorPanel
				title="Indeks tidak bisa dibaca"
				detail={e instanceof Error ? e.message : String(e)}
				hint={
					<>
						Jalankan backend lebih dulu:{" "}
						<Mono>uvicorn app.main:app --reload --port 8000</Mono>
					</>
				}
			/>
		)
	}

	const s = stats.by_status
	const documented = (s.matched ?? 0) + (s.doc_only ?? 0)
	const variants = s.sql_variant ?? 0
	const total = stats.totals.sp_total
	const utama = total - variants
	const variantPct = total > 0 ? Math.round((variants / total) * 100) : 0
	const coveragePct =
		utama > 0 ? Math.round(((s.matched ?? 0) / utama) * 1000) / 10 : 0

	return (
		<div className="flex flex-col gap-6">
			<section className="border border-zinc-200 bg-white p-5">
				<h1 className="text-xl font-semibold tracking-tight text-zinc-900">
					Ringkasan indeks
				</h1>
				<p className="mt-1 max-w-3xl text-zinc-600">
					Hasil pemindaian {stats.totals.documents} dokumen TSD dan tiga skrip
					database REGLA. Tekan{" "}
					<kbd className="border border-zinc-200 bg-zinc-50 px-1 font-mono text-[11px]">
						⌘K
					</kbd>{" "}
					untuk mencari stored procedure.
				</p>

				<div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-5">
					<Stat
						label="SP di database"
						value={num(total)}
						sub={`${num(utama)} SP utama`}
					/>
					<Stat
						label="Terdokumentasi"
						value={num(documented)}
						sub={`${num(s.matched ?? 0)} cocok dengan kode`}
						tone="good"
					/>
					<Stat
						label="Salinan arsip"
						value={`${variantPct}%`}
						sub={`${num(variants)} objek bertanggal`}
						tone="warn"
					/>
					<Stat
						label="SP tanpa TSD"
						value={num(s.sql_only ?? 0)}
						sub="perlu ditinjau"
						tone="warn"
					/>
					<Stat
						label="Diagram"
						value={num(stats.totals.images)}
						sub={`${num(stats.totals.spec_fields)} field spesifikasi`}
					/>
				</div>
				<div className="mt-4 flex flex-wrap items-center justify-between gap-3 border border-zinc-200 bg-zinc-50 px-3 py-3">
					<p className="text-sm text-zinc-800">
						<span className="font-semibold text-zinc-950">
							Cakupan TSD {coveragePct}%:
						</span>{" "}
						<span className="font-mono tabular-nums">{num(s.matched ?? 0)}</span>{" "}
						dari{" "}
						<span className="font-mono tabular-nums">{num(utama)}</span> SP utama
						sudah cocok dengan dokumen TSD.
					</p>
					<Link
						href="/review"
						className="border border-zinc-300 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-800 hover:border-zinc-400 hover:text-accent"
					>
						Buka daftar perlu ditinjau
					</Link>
				</div>
			</section>

			<section className="border border-zinc-200 bg-white p-5">
				<SectionHeading hint="jumlah dihitung per kemunculan di dokumen">
					Dokumen TSD
				</SectionHeading>
				<div className="overflow-x-auto thin-scroll">
					<table className="w-full min-w-[560px] border-collapse">
						<thead>
							<tr className="border-b border-zinc-200 text-left text-[11px] tracking-wide text-zinc-500 uppercase">
								<th className="py-2 font-medium">Segment</th>
								<th className="py-2 text-right font-medium">SP</th>
								<th className="py-2 text-right font-medium">Cocok</th>
								<th className="py-2 text-right font-medium">Perlu ditinjau</th>
							</tr>
						</thead>
						<tbody>
							{stats.segments.map((seg) => (
								<tr
									key={seg.segment}
									className="border-b border-zinc-100 hover:bg-zinc-50"
								>
									<td className="py-2">
										<Link
											href={`/search?q=${encodeURIComponent(seg.segment)}&segment=${encodeURIComponent(seg.segment)}`}
											className="inline-flex items-center gap-1 hover:text-accent hover:underline"
										>
											<Mono>{seg.segment}</Mono>
											<ArrowUpRight
												className="size-3 text-zinc-400"
												aria-hidden
											/>
										</Link>
									</td>
									<td className="py-2 text-right font-mono tabular-nums">
										{num(seg.total)}
									</td>
									<td className="py-2 text-right font-mono tabular-nums">
										{num(seg.matched)}
									</td>
									<td className="py-2 text-right font-mono tabular-nums">
										{seg.total - seg.matched + seg.low_confidence === 0 ? (
											<span className="text-zinc-300">–</span>
										) : (
											<span className="text-amber-700">
												{num(seg.total - seg.matched + seg.low_confidence)}
											</span>
										)}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</section>

			<div className="grid gap-6 lg:grid-cols-2">
				<section className="border border-zinc-200 bg-white p-5">
					<SectionHeading hint="tidak ada yang terdokumentasi">
						Paling banyak disalin
					</SectionHeading>
					<ul>
						{stats.most_copied.slice(0, 10).map((m) => (
							<li
								key={m.base_name}
								className="flex items-center gap-3 border-b border-zinc-100 py-1.5"
							>
								<Link
									href={`/search?q=${encodeURIComponent(m.base_name)}`}
									className="min-w-0 flex-1 truncate hover:text-accent hover:underline"
								>
									<Mono>{m.base_name}</Mono>
								</Link>
								<span className="shrink-0 font-mono text-xs text-amber-700 tabular-nums">
									{m.copies} salinan
								</span>
							</li>
						))}
					</ul>
				</section>

				<section className="border border-zinc-200 bg-white p-5">
					<SectionHeading hint="jumlah SP yang menyentuh tabel">
						Tabel paling banyak dipakai
					</SectionHeading>
					<ul>
						{stats.hot_tables.slice(0, 10).map((t) => (
							<li
								key={t.table_name}
								className="flex items-center gap-3 border-b border-zinc-100 py-1.5"
							>
								<Link
									href={`/tables/${encodeURIComponent(t.table_name)}`}
									className="min-w-0 flex-1 truncate hover:text-accent hover:underline"
								>
									<Mono>{t.table_name}</Mono>
								</Link>
								<span className="shrink-0 font-mono text-xs text-zinc-500 tabular-nums">
									{num(t.sp_count)} SP
								</span>
							</li>
						))}
					</ul>
				</section>
			</div>
		</div>
	)
}
