import Link from "next/link"
import { getTable, type TableLineage } from "@/lib/api"
import { num, splitTableName } from "@/lib/utils"
import {
	EmptyState,
	ErrorPanel,
	Mono,
	SectionHeading,
	StatusBadge,
} from "@/components/ui"

export const dynamic = "force-dynamic"

type Row = {
	sp_name: string
	segment: string | null
	status: "matched" | "doc_only" | "sql_only" | "sql_variant"
	operations?: string | null
}

function SpList({ rows }: { rows: Row[] }) {
	if (rows.length === 0) {
		return <p className="text-zinc-500">Tidak ada.</p>
	}
	return (
		<ul className="divide-y divide-zinc-100 border-y border-zinc-200 bg-white">
			{rows.map((r) => (
				<li
					key={`${r.sp_name}-${r.operations ?? ""}`}
					className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 hover:bg-zinc-50"
				>
					<Link
						href={`/sp/${encodeURIComponent(r.sp_name)}`}
						className="min-w-0 font-mono text-sm font-semibold break-all text-zinc-950 hover:text-accent hover:underline"
					>
						{r.sp_name}
					</Link>
					<StatusBadge status={r.status} />
					{r.segment ? (
						<Mono className="text-zinc-600">{r.segment}</Mono>
					) : null}
					{r.operations ? (
						<span className="ml-auto flex shrink-0 gap-1">
							{r.operations
								.split(",")
								.filter(Boolean)
								.map((o) => (
									<span
										key={o}
									className="rounded border border-zinc-200 bg-white px-1.5 py-0.5 text-xs font-medium text-zinc-600 uppercase"
									>
										{o}
									</span>
								))}
						</span>
					) : null}
				</li>
			))}
		</ul>
	)
}

export default async function TablePage({
	params,
	searchParams,
}: {
	// Next 16 mengirim params sebagai Promise.
	params: Promise<{ name: string }>
	searchParams: Promise<{ show?: string }>
}) {
	const { name } = await params
	const query = await searchParams
	const decoded = decodeURIComponent(name)

	let lineage: TableLineage
	try {
		lineage = await getTable(decoded)
	} catch (e) {
		return (
			<ErrorPanel
				title="Data tabel tidak bisa dibaca"
				detail={e instanceof Error ? e.message : String(e)}
			/>
		)
	}

	const { prefix, name: shortName } = splitTableName(lineage.table)
	const empty =
		lineage.readers.length === 0 && lineage.writers.length === 0
	const showAll = query.show === "all"
	const limit = 100
	const visibleWriters = showAll ? lineage.writers : lineage.writers.slice(0, limit)
	const visibleReaders = showAll ? lineage.readers : lineage.readers.slice(0, limit)
	const truncated = lineage.writers.length > limit || lineage.readers.length > limit

	return (
		<div className="flex flex-col gap-6">
			<div>
				<h1 className="font-mono text-lg font-semibold break-all text-zinc-900">
					{prefix ? (
						<span className="font-normal text-zinc-400">{prefix}.</span>
					) : null}
					{shortName}
				</h1>
				<p className="mt-1 text-zinc-600">
					{num(lineage.writers.length)} prosedur menulis ·{" "}
					{num(lineage.readers.length)} prosedur membaca
				</p>
				<p className="mt-1 max-w-[72ch] text-sm text-zinc-600">
					Nama tabel dicatat apa adanya dari kode, jadi satu tabel fisik bisa
					muncul dengan beberapa penulisan berbeda.
				</p>
			</div>

			{empty ? (
				<EmptyState
					title="Tabel ini tidak dipakai prosedur mana pun"
					description="Mungkin penulisan namanya berbeda di kode, misalnya dengan atau tanpa awalan database."
				/>
			) : (
				<>
					<section className="min-w-0">
						<SectionHeading hint={`${num(lineage.writers.length)} prosedur · insert, update, delete, merge, truncate`}>
							Menulis ke tabel ini
						</SectionHeading>
						<SpList rows={visibleWriters} />
					</section>

					<section className="min-w-0">
						<SectionHeading hint={`${num(lineage.readers.length)} prosedur · select, join, using`}>
							Membaca dari tabel ini
						</SectionHeading>
						<SpList rows={visibleReaders} />
					</section>

					{truncated ? (
						<div className="border border-zinc-200 bg-white px-4 py-3">
							<p className="text-sm text-zinc-700">
								{showAll
									? "Semua prosedur sedang ditampilkan."
									: `Demi menjaga halaman tetap ringan, setiap daftar dibatasi ${num(limit)} prosedur pertama.`}
							</p>
							<Link
								href={showAll ? `/tables/${encodeURIComponent(decoded)}` : `?show=all`}
								className="mt-2 inline-flex min-h-10 items-center font-medium text-accent hover:underline"
							>
								{showAll ? "Kembali ke tampilan ringkas" : "Tampilkan semua prosedur"}
							</Link>
						</div>
					) : null}
				</>
			)}
		</div>
	)
}
