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
		<ul className="divide-y divide-zinc-100 border-y border-zinc-100">
			{rows.map((r) => (
				<li
					key={`${r.sp_name}-${r.operations ?? ""}`}
					className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2"
				>
					<Link
						href={`/sp/${encodeURIComponent(r.sp_name)}`}
						className="min-w-0 font-mono text-[13px] break-all text-zinc-900 hover:text-accent hover:underline"
					>
						{r.sp_name}
					</Link>
					<StatusBadge status={r.status} />
					{r.segment ? (
						<Mono className="text-xs text-zinc-500">{r.segment}</Mono>
					) : null}
					{r.operations ? (
						<span className="ml-auto flex shrink-0 gap-1">
							{r.operations
								.split(",")
								.filter(Boolean)
								.map((o) => (
									<span
										key={o}
										className="rounded border border-zinc-200 px-1 text-[10px] tracking-wide text-zinc-600 uppercase"
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
}: {
	// Next 16 mengirim params sebagai Promise.
	params: Promise<{ name: string }>
}) {
	const { name } = await params
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

	const { prefix, name: shortName } = splitTableName(lineage.table_name)
	const empty =
		lineage.readers.length === 0 && lineage.writers.length === 0

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
				<p className="mt-1 text-xs text-zinc-500">
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
					<section>
						<SectionHeading hint="insert, update, delete, merge, truncate">
							Menulis ke tabel ini
						</SectionHeading>
						<SpList rows={lineage.writers} />
					</section>

					<section>
						<SectionHeading hint="select, join, using">
							Membaca dari tabel ini
						</SectionHeading>
						<SpList rows={lineage.readers} />
					</section>
				</>
			)}
		</div>
	)
}
