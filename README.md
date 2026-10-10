# departuresboard

A segment-display departure board in the style of the one in the Brussels-Central
concourse (c. 2009): yellow chamfered starburst characters on dark module cells,
each train on two lines, with the second line right-aligned under the destination.

Currently shows mock Sydney Trains departures from Central (`public/data.js`).

Live at https://departures.syncite.net

## Files

- `public/glyphs.js` – the segment font, drawn as polylines on an 8×14 grid
- `public/board.js` – builds the board as one SVG and refreshes it
- `public/data.js` – mock services and Sydney-time helpers

## Run and deploy

    npx serve public           # or any static server
    npx wrangler deploy        # Cloudflare Worker with static assets
