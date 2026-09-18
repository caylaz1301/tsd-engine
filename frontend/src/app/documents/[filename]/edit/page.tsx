import Link from "next/link"
import { ArrowLeft, ShieldCheck } from "lucide-react"
import { DocumentEditor } from "@/components/document-editor"

export default async function EditDocumentPage({ params }: { params: Promise<{ filename: string }> }) {
	const { filename } = await params
	const decoded = decodeURIComponent(filename)
	return (
		<div className="fixed inset-0 z-50 flex flex-col bg-zinc-100">
			<header className="flex h-14 shrink-0 items-center gap-3 border-b border-zinc-200 bg-white px-4">
				<Link href={`/documents/${encodeURIComponent(decoded)}`} className="inline-flex size-9 items-center justify-center border border-zinc-200 text-zinc-700 hover:bg-zinc-100" title="Kembali ke preview" aria-label="Kembali ke preview"><ArrowLeft className="size-4" /></Link>
				<div className="min-w-0 flex-1"><h1 className="truncate font-mono text-sm font-semibold text-zinc-950" title={decoded}>{decoded}</h1><p className="text-xs text-zinc-600">Perubahan disimpan ke repository dan indeks diperbarui setelah penyimpanan.</p></div>
				<span className="hidden items-center gap-1.5 text-xs text-emerald-700 sm:inline-flex"><ShieldCheck className="size-4" />Tersimpan di Docker</span>
			</header>
			<DocumentEditor filename={decoded} />
		</div>
	)
}
