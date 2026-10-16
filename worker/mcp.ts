/**
 * Serveur MCP (Streamable HTTP, réponses JSON) pour brancher Foulée sur Claude.
 * URL personnelle : /mcp/<jeton>. À ajouter dans Claude → Réglages → Connecteurs.
 *
 * Règle Strava : aucune donnée issue de l'API Strava (activités, estimations dérivées)
 * n'est exposée ici. Claude ne voit que ce que l'athlète a saisi dans Foulée.
 */
import { callTool, INSTRUCTIONS, TOOLS } from './coachTools';

interface Rpc {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

const PROTOCOL = '2025-06-18';

export async function handleMcp(req: Request, env: Env, token: string): Promise<Response> {
  if (req.method === 'GET' || req.method === 'DELETE') return new Response('Method Not Allowed', { status: 405, headers: { allow: 'POST' } });
  if (req.method !== 'POST') return new Response(null, { status: 405 });
  if (!/^[A-Za-z0-9_-]{32,}$/.test(token)) return new Response('Not found', { status: 404 });
  const user = await env.DB.prepare('SELECT id FROM users WHERE mcp_token = ?1').bind(token).first<{ id: number }>();
  if (!user) return new Response('Not found', { status: 404 });

  let body: Rpc | Rpc[];
  try {
    body = await req.json();
  } catch {
    return json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
  }
  const batch = Array.isArray(body) ? body : [body];
  const results = [];
  for (const msg of batch) {
    if (msg.id === undefined || msg.id === null) continue; // notification
    results.push(await dispatch(msg, env, user.id));
  }
  if (!results.length) return new Response(null, { status: 202 });
  return json(Array.isArray(body) ? results : results[0]);
}

async function dispatch(msg: Rpc, env: Env, uid: number) {
  const ok = (result: unknown) => ({ jsonrpc: '2.0', id: msg.id, result });
  try {
    switch (msg.method) {
      case 'initialize':
        return ok({
          protocolVersion: typeof msg.params?.protocolVersion === 'string' ? msg.params.protocolVersion : PROTOCOL,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: 'foulee', version: '1.0.0' },
          instructions: INSTRUCTIONS,
        });
      case 'ping':
        return ok({});
      case 'tools/list':
        return ok({ tools: TOOLS });
      case 'tools/call': {
        const name = String(msg.params?.name ?? '');
        const args = (msg.params?.arguments ?? {}) as Record<string, unknown>;
        try {
          const out = await callTool(name, args, env, uid);
          return ok({ content: [{ type: 'text', text: typeof out === 'string' ? out : JSON.stringify(out, null, 1) }] });
        } catch (e) {
          return ok({ content: [{ type: 'text', text: `Erreur : ${(e as Error).message}` }], isError: true });
        }
      }
      default:
        return { jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: `Méthode inconnue : ${msg.method}` } };
    }
  } catch (e) {
    return { jsonrpc: '2.0', id: msg.id, error: { code: -32603, message: (e as Error).message } };
  }
}

function json(data: unknown) {
  return new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });
}
