import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Check, Send, Undo2, X } from 'lucide-react';
import { api, AuthError } from '../lib/api';
import { useReady } from '../lib/data';

interface ChatMessage {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  changes: string[];
  runId: number | null;
  undone: boolean;
  created_at: number;
}

type Event = { t: 'tool'; label: string } | { t: 'text'; d: string } | { t: 'done'; message: ChatMessage } | { t: 'error'; error: string };

const SUGGESTIONS = [
  'Je ne peux pas courir mardi, décale la séance.',
  'Je suis malade, allège les 5 prochains jours.',
  'Remplace ma prochaine séance de VMA par des côtes.',
  'Je pars en vacances la semaine prochaine, sans montagne.',
];

/** **gras** → <b>, le reste en texte brut (retours à la ligne conservés par le CSS). */
function Rich({ text }: { text: string }) {
  return (
    <p className="msg-text">
      {text.split(/(\*\*[^*]+\*\*)/g).map((part, i) => (part.startsWith('**') && part.endsWith('**') ? <b key={i}>{part.slice(2, -2)}</b> : part))}
    </p>
  );
}

/** Discussion avec le coach IA pour modifier le plan ; le plan se met à jour derrière le panneau. */
export function PlanChat({ onClose }: { onClose: () => void }) {
  const { saved, reload } = useReady();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [quota, setQuota] = useState<{ used: number; limit: number } | null>(null);
  const [input, setInput] = useState('');
  const [pending, setPending] = useState<{ tools: string[]; text: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    api<{ messages: ChatMessage[]; used: number; limit: number }>('/ai/chat')
      .then((r) => {
        setMessages(r.messages);
        setQuota({ used: r.used, limit: r.limit });
      })
      .catch((e: Error) => setError(e.message));
    inputRef.current?.focus();
    const onKey = (e: globalThis.KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, pending, error]);

  const send = async (text: string) => {
    const message = text.trim();
    if (!message || pending) return;
    setError(null);
    setInput('');
    setMessages((m) => [...m, { id: -Date.now(), role: 'user', content: message, changes: [], runId: null, undone: false, created_at: Date.now() / 1000 }]);
    setPending({ tools: [], text: '' });
    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message }),
      });
      if (res.status === 401) throw new AuthError('non connecté');
      if (!res.ok || !res.body) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `Erreur ${res.status}`);
      }
      setQuota((q) => (q ? { ...q, used: q.used + 1 } : q));
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buf = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += value;
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.trim()) continue;
          const ev = JSON.parse(line) as Event;
          if (ev.t === 'tool') setPending((p) => p && { ...p, tools: [...p.tools, ev.label] });
          else if (ev.t === 'text') setPending((p) => p && { ...p, text: p.text + ev.d });
          else if (ev.t === 'error') setError(ev.error);
          else if (ev.t === 'done') {
            setMessages((m) => [...m, ev.message]);
            if (ev.message.changes.length) await reload();
          }
        }
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(null);
      inputRef.current?.focus();
    }
  };

  const undo = async (runId: number) => {
    setBusy(true);
    setError(null);
    try {
      await api(`/ai/undo/${runId}`, { method: 'POST' });
      setMessages((m) => m.map((x) => (x.runId === runId ? { ...x, undone: true } : x)));
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const clear = async () => {
    await api('/ai/chat', { method: 'DELETE' }).catch(() => undefined);
    setMessages([]);
    setError(null);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    send(input);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send(input);
    }
  };

  // seule la dernière série de modifications s'annule : l'annulation restaure l'état d'avant
  const lastRun = [...messages].reverse().find((m) => m.runId);
  const left = quota ? Math.max(0, quota.limit - quota.used) : null;

  return (
    <aside className="chat" role="dialog" aria-label="Coach du plan">
      <header className="chat-head">
        <div>
          <h3>Coach du plan</h3>
          <p className="small faint">Il voit ton plan, ton profil et tes ressentis{saved?.aiActivities ? ', et tes sorties Strava' : ''}.</p>
        </div>
        <div className="row" style={{ gap: 0, flexWrap: 'nowrap' }}>
          {messages.length > 0 && !pending && (
            <button type="button" className="btn btn-ghost" onClick={clear}>
              Effacer
            </button>
          )}
          <button type="button" className="btn btn-ghost icon" onClick={onClose} aria-label="Fermer le coach">
            <X size={20} />
          </button>
        </div>
      </header>

      <div className="chat-log" ref={logRef} aria-live="polite">
        {messages.length === 0 && !pending && (
          <div className="chat-empty">
            <p>Dis au coach ce qui change pour toi ou ce que tu veux modifier. Il ajuste le plan, t’explique pourquoi, et chaque modification s’annule en un clic.</p>
            <ul className="chat-suggest">
              {SUGGESTIONS.map((s) => (
                <li key={s}>
                  <button type="button" onClick={() => send(s)}>
                    {s}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {messages.map((m) =>
          m.role === 'user' ? (
            <div key={m.id} className="msg msg-user">
              <p className="msg-text">{m.content}</p>
            </div>
          ) : (
            <div key={m.id} className="msg msg-coach">
              <Rich text={m.content} />
              {m.changes.length > 0 && (
                <ul className="msg-changes" aria-label="Modifications du plan">
                  {m.changes.map((c, i) => (
                    <li key={i} data-undone={m.undone || undefined}>
                      <Check size={14} aria-hidden /> {c}
                    </li>
                  ))}
                </ul>
              )}
              {m.undone ? (
                <p className="small faint">Modifications annulées.</p>
              ) : (
                m.runId &&
                m.id === lastRun?.id && (
                  <button type="button" className="btn btn-secondary btn-sm" disabled={busy || !!pending} onClick={() => undo(m.runId!)}>
                    <Undo2 size={14} aria-hidden /> Annuler ces modifications
                  </button>
                )
              )}
            </div>
          ),
        )}

        {pending && (
          <div className="msg msg-coach">
            {pending.tools.map((t, i) => (
              <p key={i} className="msg-tool">
                {t}…
              </p>
            ))}
            {pending.text ? <Rich text={pending.text} /> : <span className="chat-wait" role="status" aria-label="Le coach réfléchit" />}
          </div>
        )}

        {error && <p className="notice error">{error}</p>}
      </div>

      <form className="chat-input" onSubmit={submit}>
        <textarea
          ref={inputRef}
          rows={2}
          value={input}
          maxLength={2000}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Ex. : je ne cours pas jeudi, et je veux plus de côtes."
          aria-label="Ton message au coach"
        />
        <button type="submit" className="btn btn-primary icon" disabled={!input.trim() || !!pending || left === 0} aria-label="Envoyer">
          <Send size={18} aria-hidden />
        </button>
      </form>
      {left !== null && (
        <p className="chat-quota small faint">
          {left === 0 ? 'Plus de messages aujourd’hui, reviens demain.' : `${left} message${left > 1 ? 's' : ''} restant${left > 1 ? 's' : ''} aujourd’hui.`}
        </p>
      )}
    </aside>
  );
}
