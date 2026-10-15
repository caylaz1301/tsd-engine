import { Database, FileCheck2, Search, ShieldCheck } from "lucide-react"
import { safeRedirect } from "@/lib/auth"
import { LoginForm } from "./login-form"

export const metadata = { title: "Masuk | TSD Engine" }

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
	const { next } = await searchParams
	return (
		<main className="grid min-h-screen bg-white lg:grid-cols-[minmax(360px,0.82fr)_minmax(520px,1.18fr)]">
			<section className="relative hidden overflow-hidden bg-[#10234d] px-10 py-12 text-white lg:flex lg:flex-col lg:justify-between xl:px-16 xl:py-16">
				<div>
					<div className="flex items-center gap-3"><span className="flex size-10 items-center justify-center border border-blue-300/40 bg-blue-600"><Database className="size-5" /></span><span className="font-mono text-lg font-semibold">TSD Engine</span></div>
					<div className="mt-20 max-w-lg">
						<h1 className="text-4xl font-semibold leading-tight tracking-[-0.03em] text-balance xl:text-5xl">Satu ruang kerja untuk sumber TSD yang dapat dipercaya.</h1>
						<p className="mt-5 max-w-[58ch] text-base leading-7 text-blue-100">Telusuri stored procedure, periksa dokumen, dan kelola sumber setiap bank dalam konteks yang terpisah.</p>
					</div>
			</div>

			<div className="max-w-lg border-t border-blue-200/25 pt-7">
				<div className="grid gap-5 sm:grid-cols-2">
					<div className="flex gap-3"><Search className="mt-0.5 size-5 shrink-0 text-blue-300" /><div><p className="font-medium">Pencarian terarah</p><p className="mt-1 text-sm leading-6 text-blue-100">SP, diagram, dan lineage dalam satu indeks.</p></div></div>
					<div className="flex gap-3"><FileCheck2 className="mt-0.5 size-5 shrink-0 text-emerald-300" /><div><p className="font-medium">Sumber terisolasi</p><p className="mt-1 text-sm leading-6 text-blue-100">TSD dan SQL tersimpan sesuai bank yang dipilih.</p></div></div>
				</div>
			</div>
			<div className="pointer-events-none absolute right-12 top-12 size-56 border border-blue-200/10" aria-hidden><div className="absolute inset-8 border border-blue-200/10" /><div className="absolute inset-16 border border-blue-200/10" /></div>
			</section>

			<section className="flex min-h-screen items-center justify-center bg-[#f7f7f8] px-5 py-10 sm:px-10">
				<div className="w-full max-w-[430px]">
					<div className="mb-10 flex items-center gap-3 lg:hidden"><span className="flex size-10 items-center justify-center bg-blue-700 text-white"><Database className="size-5" /></span><span className="font-mono text-lg font-semibold text-zinc-950">TSD Engine</span></div>
					<div className="flex size-11 items-center justify-center border border-zinc-300 bg-white text-blue-700"><ShieldCheck className="size-5" /></div>
					<h2 className="mt-5 text-2xl font-semibold tracking-[-0.02em] text-zinc-950">Selamat datang kembali</h2>
					<p className="mt-2 max-w-[52ch] leading-6 text-zinc-600">Masuk menggunakan akun pengelola untuk mengakses dokumen dan indeks internal.</p>
					<LoginForm next={safeRedirect(next)} />
					<p className="mt-6 border-t border-zinc-200 pt-5 text-sm leading-6 text-zinc-600">Sesi berakhir otomatis setelah 8 jam. Jangan membagikan kredensial melalui dokumen atau repository Git.</p>
				</div>
			</section>
		</main>
	)
}
