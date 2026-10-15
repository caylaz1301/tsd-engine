import Link from "next/link"
import { ArrowLeft, Database, FolderKanban } from "lucide-react"
import { SourceManager } from "@/components/source-manager"
import { ErrorPanel } from "@/components/ui"
import { getSegments, getSqlSources } from "@/lib/api"
import { getSelectedBank } from "@/lib/bank-context"

export const dynamic = "force-dynamic"

export default async function SourcesAdminPage() {
	const bank = await getSelectedBank()
	let documents
	let sqlSources
	try {
		;[documents, sqlSources] = await Promise.all([
			getSegments(bank),
			getSqlSources(bank),
		])
	} catch (cause) {
		return <ErrorPanel title="Pengelolaan sumber belum dapat dibuka" detail={cause instanceof Error ? cause.message : String(cause)} />
	}
	const activeDocuments = documents.filter((item) => item.status === "active").length
	return <div className="space-y-6">
			<header className="border-b border-zinc-200 pb-5">
				<Link href="/segments" className="inline-flex min-h-9 items-center gap-2 text-sm text-zinc-600 hover:text-zinc-950"><ArrowLeft className="size-4" />Kembali ke repository</Link>
				<div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
					<div><h1 className="text-xl font-semibold text-zinc-950">Kelola sumber {bank}</h1><p className="mt-1 max-w-[72ch] text-zinc-600">Unggah dokumen TSD dan skrip SQL langsung ke ruang data bank ini. Sistem menyimpan file, membaca isinya, dan memperbarui indeks secara otomatis.</p></div>
					<dl className="flex flex-wrap gap-x-7 gap-y-3 text-sm">
						<div className="flex items-center gap-2"><FolderKanban className="size-4 text-zinc-500" /><dt className="text-zinc-600">TSD aktif</dt><dd className="font-mono font-semibold text-zinc-950">{activeDocuments}</dd></div>
						<div className="flex items-center gap-2"><Database className="size-4 text-zinc-500" /><dt className="text-zinc-600">Skrip SQL</dt><dd className="font-mono font-semibold text-zinc-950">{sqlSources.length}</dd></div>
					</dl>
				</div>
			</header>
				<SourceManager bank={bank} initialSqlSources={sqlSources} />
		</div>
}
