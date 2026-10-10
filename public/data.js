// Mock Sydney Trains departures from Central. Each service repeats every
// `every` minutes starting `at` minutes past the hour. Platforms are invented.
export const SERVICES = [
  { line: 'T1', dest: 'Emu Plains', via: 'Via Strathfield', plat: '16', at: 2, every: 15,
    stops: ['Redfern', 'Strathfield', 'Lidcombe', 'Parramatta', 'Blacktown', 'St Marys', 'Penrith', 'Emu Plains'] },
  { line: 'T1', dest: 'Berowra', via: 'Via Gordon', plat: '18', at: 9, every: 15,
    stops: ['Town Hall', 'Wynyard', 'North Sydney', 'Chatswood', 'Gordon', 'Hornsby', 'Berowra'] },
  { line: 'T1', dest: 'Richmond', via: 'Via Blacktown', plat: '17', at: 24, every: 30,
    stops: ['Redfern', 'Strathfield', 'Parramatta', 'Blacktown', 'Schofields', 'Windsor', 'Richmond'] },
  { line: 'T2', dest: 'Leppington', via: 'Via Inner West', plat: '21', at: 5, every: 15,
    stops: ['Redfern', 'Newtown', 'Ashfield', 'Burwood', 'Strathfield', 'Granville', 'Cabramatta', 'Liverpool', 'Leppington'] },
  { line: 'T3', dest: 'Liverpool', via: 'Via Regents Park', plat: '22', at: 12, every: 20,
    stops: ['Redfern', 'Strathfield', 'Lidcombe', 'Berala', 'Regents Park', 'Villawood', 'Cabramatta', 'Liverpool'] },
  { line: 'T4', dest: 'Cronulla', via: 'All stations', plat: '24', at: 7, every: 15,
    stops: ['Redfern', 'Sydenham', 'Wolli Creek', 'Rockdale', 'Kogarah', 'Hurstville', 'Sutherland', 'Caringbah', 'Cronulla'] },
  { line: 'T4', dest: 'Waterfall', via: 'Limited stops', plat: '25', at: 14, every: 30,
    stops: ['Redfern', 'Wolli Creek', 'Hurstville', 'Sutherland', 'Engadine', 'Heathcote', 'Waterfall'] },
  { line: 'T4', dest: 'Bondi Junction', via: 'All stations', plat: '25', at: 4, every: 10,
    stops: ['Town Hall', 'Martin Place', 'Kings Cross', 'Edgecliff', 'Bondi Junction'] },
  { line: 'T8', dest: 'Macarthur', via: 'Via Airport', plat: '23', at: 1, every: 10,
    stops: ['Green Square', 'Mascot', 'Domestic', 'International', 'Wolli Creek', 'Revesby', 'Glenfield', 'Campbelltown', 'Macarthur'] },
  { line: 'T9', dest: 'Hornsby', via: 'Via Strathfield', plat: '19', at: 11, every: 15,
    stops: ['Redfern', 'Burwood', 'Strathfield', 'Rhodes', 'Epping', 'Hornsby'] },
  { line: 'T9', dest: 'Gordon', via: 'Via North Sydney', plat: '20', at: 3, every: 15,
    stops: ['Town Hall', 'Wynyard', 'Milsons Point', 'North Sydney', 'Chatswood', 'Lindfield', 'Gordon'] },
  { line: 'SCO', dest: 'Kiama', via: 'Via Wollongong', plat: '1', at: 18, every: 60,
    stops: ['Redfern', 'Wolli Creek', 'Hurstville', 'Sutherland', 'Thirroul', 'Wollongong', 'Kiama'] },
  { line: 'BMT', dest: 'Lithgow', via: 'Via Penrith', plat: '4', at: 33, every: 60,
    stops: ['Strathfield', 'Parramatta', 'Blacktown', 'Penrith', 'Katoomba', 'Mount Victoria', 'Lithgow'] },
  { line: 'CCN', dest: 'Newcastle Interchange', via: 'Via Gosford', plat: '7', at: 46, every: 60,
    stops: ['Strathfield', 'Epping', 'Hornsby', 'Gosford', 'Wyong', 'Fassifern', 'Newcastle Interchange'] },
];

/** Word-wraps text into lines of at most `width` characters. */
export function wrap(text, width) {
  const out = [];
  let line = '';
  for (let word of text.split(' ')) {
    // Words too long for a line break with a hyphen.
    while (word.length > width) {
      if (line) { out.push(line); line = ''; }
      out.push(`${word.slice(0, width - 1)}-`);
      word = word.slice(width - 1);
    }
    if (!word) continue;
    if (!line) line = word;
    else if (line.length + 1 + word.length <= width) line += ` ${word}`;
    else { out.push(line); line = word; }
  }
  if (line) out.push(line);
  return out;
}

/**
 * The pages a train's remarks cycle through: its "via" note, then its
 * stopping pattern, packed so each page wraps to at most `maxLines` lines of
 * `width` characters. Each page is returned as its wrapped lines.
 */
export function remarkPages(t, width, maxLines = 1) {
  const fits = text => wrap(text, width).length <= maxLines;
  const pages = [t.via];
  let page = '';
  for (const stop of t.stops) {
    const next = page ? `${page} · ${stop}` : stop;
    if (fits(next)) page = next;
    else { if (page) pages.push(page); page = stop; }
  }
  if (page) pages.push(page);
  // A single stop too long for the space is cut short with a full stop, as
  // the real boards abbreviate.
  return pages.map(p => {
    const lines = wrap(p, width);
    if (lines.length <= maxLines) return lines;
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = `${kept[maxLines - 1].replace(/-$/, '').slice(0, width - 1)}.`;
    return kept;
  });
}

/** Minutes since midnight in Sydney, plus seconds for smooth rollover. */
export function sydneyNow(date = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-AU', {
      timeZone: 'Australia/Sydney', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).formatToParts(date).map(p => [p.type, p.value]),
  );
  return { minutes: +parts.hour * 60 + +parts.minute, seconds: +parts.second };
}

/** The next `count` departures at or after `now` (minutes since midnight). */
export function upcoming(now, count) {
  const out = [];
  for (const s of SERVICES) {
    const hourStart = now - (now % 60) - 60;
    for (let t = hourStart + s.at; t < now + 120; t += s.every) {
      if (t >= now) out.push({ ...s, time: t });
    }
  }
  return out.sort((a, b) => a.time - b.time || a.line.localeCompare(b.line)).slice(0, count);
}

export function hhmm(minutes) {
  const m = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}
