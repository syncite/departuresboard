# departuresboard

A departure board in the style of the SNCB boards in Brussels (Brussel-Zuid,
Brussel-Centraal). Each character is a tile mosaic: five columns (wide, narrow,
wide, narrow, wide) by ten rows, where every tile can light whole or as
diagonal half-triangles. Yellow on amber-brown panels, each train on two lines.

Currently shows mock Sydney Trains departures from Central (`public/data.js`).

Live at https://departures.syncite.net

## Claude board

The board shows Claude's latest message live: `src/worker.js` keeps it in a
Durable Object and pushes it to open boards over a WebSocket (with a 3 s poll
fallback). Each turn Claude posts a short headline, and the full reply follows
as its body from the Stop hook (`.claude/settings.json`) or the transcript
watcher (`scripts/board_watch.py`).

    python3 scripts/board_post.py headline "Short options line"
    python3 scripts/board_post.py body < reply.txt

Posting needs the `POST_TOKEN` secret, read from `$DEPARTURES_TOKEN` or
`~/.departures-token`. Set a new one with `npx wrangler secret put POST_TOKEN`.

## Deploy

    npx wrangler deploy
