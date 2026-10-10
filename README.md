# departuresboard

A departure board in the style of the SNCB boards in Brussels (Brussel-Zuid,
Brussel-Centraal). Each character is a tile mosaic: five columns (wide, narrow,
wide, narrow, wide) by ten rows, where every tile can light whole or as
diagonal half-triangles. Yellow on amber-brown panels, each train on two lines.

Currently shows mock Sydney Trains departures from Central (`public/data.js`).

Live at https://departures.syncite.net

## Files

- `public/glyphs.js` – the tile-mosaic font (upper and lower case, digits)
- `public/board.js` – builds the board as one SVG and refreshes it
- `public/data.js` – mock services and Sydney-time helpers

## Run and deploy

    npx serve public           # or any static server
    npx wrangler deploy        # Cloudflare Worker with static assets
