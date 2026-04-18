import { FormEvent, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

interface Message {
  role: 'user' | 'model'
  text: string
}

interface Props {
  systemContext: string
  placeholder?: string
}

export default function ChatPanel({
  systemContext,
  placeholder = 'Escribe tu pregunta o instrucción…',
}: Props) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight)
  }, [messages])

  const handleSend = async (e: FormEvent) => {
    e.preventDefault()
    const text = input.trim()
    if (!text || sending) return
    setInput('')
    setError(null)

    const newMessages: Message[] = [...messages, { role: 'user', text }]
    setMessages(newMessages)
    setSending(true)

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) throw new Error('No hay sesión activa.')

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          messages: newMessages,
          systemContext,
        }),
      })
      if (!res.ok) {
        let err = `HTTP ${res.status}`
        try {
          const body = (await res.json()) as { error?: string }
          if (body.error) err = body.error
        } catch {
          // ignore
        }
        throw new Error(err)
      }
      const data = (await res.json()) as { reply: string }
      setMessages([...newMessages, { role: 'model', text: data.reply }])
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex flex-col rounded-lg border border-slate-200 bg-slate-50">
      <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
        <p className="text-xs font-semibold text-slate-600">
          💬 Chat con la IA
        </p>
        {messages.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setMessages([])
              setError(null)
            }}
            className="text-[10px] text-slate-400 hover:text-slate-600"
          >
            Limpiar
          </button>
        )}
      </div>

      <div
        ref={scrollRef}
        className="flex-1 space-y-2 overflow-y-auto p-3"
        style={{ maxHeight: '250px', minHeight: '120px' }}
      >
        {messages.length === 0 && !sending && (
          <p className="py-4 text-center text-xs text-slate-400">
            Pregúntale a la IA sobre datos faltantes, pídele que revise
            algo del documento, o solicita instrucciones para
            completar información.
          </p>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={`rounded-lg px-3 py-2 text-xs ${
              m.role === 'user'
                ? 'ml-8 bg-indigo-100 text-indigo-900'
                : 'mr-8 bg-white text-slate-800 shadow-sm'
            }`}
          >
            <p className="whitespace-pre-line">{m.text}</p>
          </div>
        ))}
        {sending && (
          <div className="mr-8 animate-pulse rounded-lg bg-white px-3 py-2 text-xs text-slate-400 shadow-sm">
            Pensando…
          </div>
        )}
      </div>

      {error && (
        <p className="px-3 pb-1 text-[11px] text-red-600">{error}</p>
      )}

      <form
        onSubmit={handleSend}
        className="flex gap-2 border-t border-slate-200 p-2"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={placeholder}
          disabled={sending}
          className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={sending || !input.trim()}
          className="flex-shrink-0 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          Enviar
        </button>
      </form>
    </div>
  )
}
