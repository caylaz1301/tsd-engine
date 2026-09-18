import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, Download, ExternalLink, FilePenLine, FileText } from "lucide-react"
import { documentDownloadUrl, documentPdfUrl, getDocumentPreview } from "@/lib/api"

export const dynamic = "force-dynamic"

export default async function DocumentPage({ params }: { params: Promise<{ filename: string }> }) {
	const { filename } = await params
	let document
	try {
		document = await getDocumentPreview(decodeURIComponent(filename), 0, 20)
	} catch {
		notFound()
	}
	const pdfUrl = documentPdfUrl(document.filename)

	return (
		<div className="flex flex-col gap-5">
			<Link href="/segments" className="inline-flex w-fit items-center gap-2 text-sm text-zinc-600 hover:text-zinc-950"><ArrowLeft className="size-4" />Kembali ke dokumen</Link>
			<header className="flex flex-col gap-4 border-b border-zinc-200 pb-5 lg:flex-row lg:items-start lg:justify-between">
				<div className="min-w-0">
					<div className="flex flex-wrap items-center gap-2"><span className="border border-zinc-200 bg-zinc-50 px-2 py-1 font-mono text-xs text-zinc-700">{document.module}</span><span className={document.status === "active" ? "text-sm text-emerald-700" : "text-sm text-amber-700"}>{document.status === "active" ? "Sumber aktif" : "Nonaktif"}</span></div>
					<h1 className="mt-2 font-mono text-xl font-semibold break-words text-zinc-950">{document.filename}</h1>
					<p className="mt-1 text-sm text-zinc-600">{document.segment} · {(document.size_bytes / 1024 / 1024).toFixed(2)} MB</p>
				</div>
				<div className="flex flex-wrap gap-2">
					<a href={pdfUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center gap-2 border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-100"><ExternalLink className="size-4" />Buka tab baru</a>
					<a href={documentPdfUrl(document.filename, true)} className="inline-flex min-h-10 items-center gap-2 border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-100"><Download className="size-4" />PDF</a>
					<a href={documentDownloadUrl(document.filename, document.modified_at)} className="inline-flex min-h-10 items-center gap-2 border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-100"><FileText className="size-4" />DOCX</a>
					<Link href={`/documents/${encodeURIComponent(document.filename)}/edit`} className="inline-flex min-h-10 items-center gap-2 bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-blue-800"><FilePenLine className="size-4" />Edit dokumen</Link>
				</div>
			</header>

			<div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
				<aside>
					<h2 className="border-b border-zinc-200 pb-2 text-sm font-semibold text-zinc-900">Tentang dokumen</h2>
					<dl className="divide-y divide-zinc-100 text-sm"><div className="py-2"><dt className="text-zinc-500">Judul</dt><dd className="mt-0.5 text-zinc-900">{document.title || "Tidak tercatat"}</dd></div><div className="py-2"><dt className="text-zinc-500">Penulis</dt><dd className="mt-0.5 text-zinc-900">{document.author || "Tidak tercatat"}</dd></div><div className="py-2"><dt className="text-zinc-500">Format preview</dt><dd className="mt-0.5 text-zinc-900">PDF dari DOCX aktif</dd></div></dl>
					<p className="mt-5 text-xs leading-5 text-zinc-600">Preview mempertahankan tata letak, tabel, gambar, dan pembagian halaman dari dokumen Word. Browser menyediakan zoom, print, dan download.</p>
				</aside>
				<section className="min-w-0 border border-zinc-300 bg-zinc-100 p-2"><iframe src={pdfUrl} title={`Preview ${document.filename}`} className="h-[calc(100vh-10rem)] min-h-[680px] w-full bg-white" /></section>
			</div>
		</div>
	)
}
