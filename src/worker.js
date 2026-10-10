import { DurableObject } from 'cloudflare:workers';

// Claude's messages for the board. One Durable Object holds the latest
// message and pushes it to every open board over WebSockets (hibernating
// while idle, so open boards cost next to nothing).
//
//   GET  /api/live    WebSocket: the latest message now, then each new one
//   GET  /api/latest  the latest message as JSON
//   POST /api/post    { kind: 'headline' | 'body', text }  (Bearer token)
//
// A turn usually posts a short headline first, then the full reply as its
// body; the body joins the open headline instead of starting a new message.

const JOIN_MS = 30 * 60 * 1000;
const MAX_TEXT = 20000;

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
});

export class Feed extends DurableObject {
  async fetch(request) {
    const url = new URL(request.url);
    const latest = (await this.ctx.storage.get('latest')) || null;
    if (url.pathname === '/api/live') {
      if ((request.headers.get('Upgrade') || '').toLowerCase() !== 'websocket') return json({ error: 'expected websocket' }, 426);
      const [client, server] = Object.values(new WebSocketPair());
      this.ctx.acceptWebSocket(server);
      server.send(JSON.stringify({ message: latest, now: Date.now() }));
      return new Response(null, { status: 101, webSocket: client });
    }
    if (url.pathname === '/api/latest') return json({ message: latest, now: Date.now() });
    if (url.pathname === '/api/post' && request.method === 'POST') {
      const { kind, text } = await request.json().catch(() => ({}));
      const clean = typeof text === 'string' ? text.trim().slice(0, MAX_TEXT) : '';
      if (!clean || !['headline', 'body'].includes(kind)) return json({ error: 'kind and text required' }, 400);
      const now = Date.now();
      let message;
      if (kind === 'headline') {
        message = { id: now, headline: clean, body: '', at: now, open: true };
      } else if (latest && latest.body === clean) {
        return json({ ok: true, duplicate: true });
      } else if (latest && latest.open && now - latest.at < JOIN_MS) {
        message = { ...latest, body: clean, at: now, open: false };
      } else {
        message = { id: now, headline: '', body: clean, at: now, open: false };
      }
      await this.ctx.storage.put('latest', message);
      const payload = JSON.stringify({ message, now });
      for (const ws of this.ctx.getWebSockets()) {
        try { ws.send(payload); } catch { /* closed */ }
      }
      return json({ ok: true, id: message.id });
    }
    return json({ error: 'not found' }, 404);
  }

  webSocketMessage(ws, data) {
    if (data === 'ping') ws.send('pong');
  }

  webSocketClose(ws, code) {
    try { ws.close(code); } catch { /* already closed */ }
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    if (url.pathname === '/api/post') {
      const auth = request.headers.get('Authorization') || '';
      if (!env.POST_TOKEN || auth !== `Bearer ${env.POST_TOKEN}`) return json({ error: 'unauthorised' }, 401);
    }
    const stub = env.FEED.get(env.FEED.idFromName('claude'));
    return stub.fetch(request);
  },
};
