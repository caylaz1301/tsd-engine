import Link from "next/link"
import { AlertTriangle, ArrowUpRight, Files } from "lucide-react"
import { getReview, type ReviewRow, type SpStatus } from "@/lib/api"
import { num } from "@/lib/utils"
import {
	ErrorPanel,
	LowConfidenceBadge,
	Mono,
	SectionHeading,
	Stat,
	StatusBadge,
} from "@/components/ui"

export const dynamic = "force-dynamic"

function ReviewList({
	rows,
	empty,
}: {
	rows: ReviewRow[]
	empty: string
}) {
	if (rows.length === 0) {
		return (
			<p className="border-y border-zinc-200 py-4 text-zinc-500">{empty}</p>
		)
	}

	return (
		<ul className="divide-y divide-zinc-100 border-y border-zinc-200 bg-white">
			{rows.map((r) => (
				<li key={r.sp_key} className="px-3 py-3 hover:bg-zinc-50">
					<div className="flex items-start justify-between gap-4">
						<div className="min-w-0">
							<Link
								href={`/sp/${encodeURIComponent(r.sp_name)}`}
								className="group inline-flex max-w-full items-center gap-1.5 font-mono text-[13px] font-semibold text-zinc-950 hover:text-accent"
							>
								<span className="truncate">{r.sp_name}</span>
								<ArrowUpRight
									className="size-3 shrink-0 text-zinc-400 group-hover:text-accent"
									aria-hidden
								/>
							</Link>
						</div>
						<div className="flex shrink-0 flex-wrap justify-end gap-1.5">
							<StatusBadge status={r.status as SpStatus} />
							{r.confidence === "low" ? <LowConfidenceBadge /> : null}
							{r.document_count ? (
								<span className="inline-flex items-center gap-1 border border-amber-200 bg-amber-50 px-1.5 py-px text-[11px] font-medium text-amber-800">
									<Files className="size-3" aria-hidden />
									{num(r.document_count)} dokumen
								</span>
							) : null}
						</div>
					</div>

					<div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-600">
						{r.segment || r.segments ? (
							<span>
								TSD{" "}
								<Mono className="text-xs">
									{r.segments ? r.segments.replaceAll(",", ", ") : r.segment}
								</Mono>
							</span>
						) : (
							<span className="text-amber-700">tidak ada di TSD</span>
						)}
						{r.sql_database ? (
							<span>
								db <Mono className="text-xs">{r.sql_database}</Mono>
							</span>
						) : null}
						{r.body_lines ? (
							<span className="tabular-nums">{num(r.body_lines)} baris</span>
						) : null}
						{r.image_count > 0 ? (
							<span className="tabular-nums">{num(r.image_count)} diagram</span>
						) : null}
						{r.called_by ? (
							<span>
								dipanggil oleh <Mono className="text-xs">{r.called_by}</Mono>
							</span>
						) : null}
					</div>
				</li>
			))}
		</ul>
	)
}

export default async function ReviewPage() {
	let review
	try {
		review = await getReview(12)
	} catch (e) {
		return (
			<ErrorPanel
				title="Daftar tinjauan tidak bisa dibaca"
				detail={e instanceof Error ? e.message : String(e)}
				hint={
					<>
						Pastikan backend hidup:{" "}
						<Mono>uvicorn app.main:app --reload --port 8000</Mono>
					</>
				}
			/>
		)
	}

	return (
		<div className="flex flex-col gap-6">
			<section className="border border-zinc-200 bg-white p-5">
				<h1 className="text-xl font-semibold tracking-tight text-zinc-900">
					Perlu ditinjau
				</h1>
				<p className="mt-1 max-w-3xl text-zinc-600">
					Antrian kerja untuk SP yang belum punya pasangan TSD, hanya muncul di
					dokumen, confidence rendah, atau muncul di lebih dari satu dokumen.
				</p>

				<div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
					<Stat
						label="Tanpa TSD"
						value={num(review.totals.sql_only)}
						sub="SP utama"
						tone="warn"
					/>
					<Stat
						label="TSD saja"
						value={num(review.totals.doc_only)}
						sub="belum cocok ke SQL"
						tone="warn"
					/>
					<Stat
						label="Confidence rendah"
						value={num(review.totals.low_confidence)}
						sub="perlu validasi nama"
						tone="warn"
					/>
					<Stat
						label="Multi-dokumen"
						value={num(review.totals.multi_doc)}
						sub="perlu cek konsistensi"
						tone="warn"
					/>
				</div>
			</section>

			<section className="border border-zinc-200 bg-white p-5">
				<SectionHeading hint="prioritas: SP panjang yang belum terdokumentasi">
					SP tanpa TSD
				</SectionHeading>
				<ReviewList
					rows={review.sql_only}
					empty="Tidak ada SP utama tanpa dokumen TSD."
				/>
				<Link
					href="/search?q=usp&status=sql_only"
					className="mt-3 inline-flex text-xs text-accent hover:underline"
				>
					Lihat lebih banyak di pencarian
				</Link>
			</section>

			<div className="grid gap-6 lg:grid-cols-2">
				<section className="border border-zinc-200 bg-white p-5">
					<SectionHeading hint="ada di TSD, belum cocok ke SQL">
						TSD saja
					</SectionHeading>
					<ReviewList
						rows={review.doc_only}
						empty="Semua SP TSD sudah punya pasangan SQL."
					/>
				</section>

				<section className="border border-zinc-200 bg-white p-5">
					<SectionHeading hint="nama cocok tetapi perlu dicek manual">
						Confidence rendah
					</SectionHeading>
					<ReviewList
						rows={review.low_confidence}
						empty="Tidak ada match confidence rendah."
					/>
				</section>
			</div>

			<section className="border border-zinc-200 bg-white p-5">
				<SectionHeading hint="rawan perbedaan diagram atau uraian antar segment">
					Muncul di banyak dokumen
				</SectionHeading>
				<ReviewList
					rows={review.multi_doc}
					empty="Tidak ada SP yang muncul di banyak dokumen."
				/>
			</section>

			<p className="flex items-start gap-2 border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700">
				<AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-700" aria-hidden />
				<span>
					Daftar ini tidak mengubah indeks. Ia hanya mengurutkan titik yang paling
					layak dicek manual dari data TSD dan SQL saat ini.
				</span>
			</p>
		</div>
	)
}
