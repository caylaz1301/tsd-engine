"use client"

import { useActionState, useState } from "react"
import { AlertCircle, Eye, EyeOff, Loader2, LockKeyhole, LogIn, UserRound } from "lucide-react"
import { login, type LoginState } from "./actions"

const initialState: LoginState = { error: null }

export function LoginForm({ next }: { next: string }) {
	const [state, action, pending] = useActionState(login, initialState)
	const [visible, setVisible] = useState(false)

	return (
		<form action={action} className="mt-8 space-y-5">
			<input type="hidden" name="next" value={next} />
			{state.error ? <div role="alert" aria-live="polite" className="flex items-start gap-3 border border-red-300 bg-red-50 px-3 py-3 text-sm leading-5 text-red-800"><AlertCircle className="mt-0.5 size-4 shrink-0" /><span>{state.error}</span></div> : null}

			<div>
				<label htmlFor="username" className="text-sm font-medium text-zinc-800">Nama pengguna</label>
				<span className="mt-1.5 flex h-11 items-center border border-zinc-300 bg-white focus-within:border-blue-700 focus-within:ring-1 focus-within:ring-blue-700">
					<UserRound className="ml-3 size-4 shrink-0 text-zinc-500" aria-hidden />
					<input id="username" name="username" autoComplete="username" required autoFocus disabled={pending} className="login-input h-full min-w-0 flex-1 bg-transparent px-3 text-zinc-950 outline-none placeholder:text-zinc-500 disabled:bg-zinc-50" placeholder="Masukkan nama pengguna" />
				</span>
			</div>

			<div>
				<label htmlFor="password" className="text-sm font-medium text-zinc-800">Kata sandi</label>
				<span className="mt-1.5 flex h-11 items-center border border-zinc-300 bg-white focus-within:border-blue-700 focus-within:ring-1 focus-within:ring-blue-700">
					<LockKeyhole className="ml-3 size-4 shrink-0 text-zinc-500" aria-hidden />
					<input id="password" name="password" type={visible ? "text" : "password"} autoComplete="current-password" required disabled={pending} className="login-input h-full min-w-0 flex-1 bg-transparent px-3 text-zinc-950 outline-none placeholder:text-zinc-500 disabled:bg-zinc-50" placeholder="Masukkan kata sandi" />
					<button type="button" onClick={() => setVisible((value) => !value)} disabled={pending} className="mr-1 inline-flex size-9 items-center justify-center text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900" aria-label={visible ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"} title={visible ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}>{visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button>
				</span>
			</div>

			<button type="submit" disabled={pending} className="inline-flex min-h-11 w-full items-center justify-center gap-2 bg-blue-700 px-4 font-semibold text-white hover:bg-blue-800 active:bg-blue-900 disabled:cursor-wait disabled:bg-zinc-300 disabled:text-zinc-600">{pending ? <Loader2 className="size-4 animate-spin" /> : <LogIn className="size-4" />}{pending ? "Memverifikasi..." : "Masuk ke TSD Engine"}</button>
		</form>
	)
}
