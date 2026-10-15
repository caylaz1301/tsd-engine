import { LogOut } from "lucide-react"

export function LogoutButton() {
	return <form action="/logout" method="post"><button type="submit" className="inline-flex size-9 items-center justify-center border border-zinc-300 bg-white text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950" aria-label="Keluar dari aplikasi" title="Keluar"><LogOut className="size-4" /></button></form>
}
