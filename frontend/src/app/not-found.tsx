import Link from "next/link"
import { EmptyState } from "@/components/ui"

export default function NotFound() {
	return (
		<div className="space-y-4">
			<EmptyState
				title="Halaman atau data tidak ditemukan"
				description="Nama stored procedure atau tabel mungkin berbeda dari yang tercatat di indeks."
			/>
			<Link
				href="/search"
				className="mx-auto flex min-h-11 w-fit items-center border border-zinc-300 bg-white px-4 py-2 font-medium text-zinc-800 hover:bg-zinc-100"
			>
				Kembali ke pencarian
			</Link>
		</div>
	)
}
