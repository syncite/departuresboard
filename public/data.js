// Mock Sydney Trains departures from Central. Each service repeats every
// `every` minutes starting `at` minutes past the hour. Platforms are invented.
export const SERVICES = [
  { line: 'T1', dest: 'Emu Plains', via: 'Via Strathfield', plat: '16', at: 2, every: 15 },
  { line: 'T1', dest: 'Berowra', via: 'Via Gordon', plat: '18', at: 9, every: 15 },
  { line: 'T1', dest: 'Richmond', via: 'Via Blacktown', plat: '17', at: 24, every: 30 },
  { line: 'T2', dest: 'Leppington', via: 'Via Inner West', plat: '21', at: 5, every: 15 },
  { line: 'T3', dest: 'Liverpool', via: 'Via Regents Park', plat: '22', at: 12, every: 20 },
  { line: 'T4', dest: 'Cronulla', via: 'All stations', plat: '24', at: 7, every: 15 },
  { line: 'T4', dest: 'Waterfall', via: 'Limited stops', plat: '25', at: 14, every: 30 },
  { line: 'T4', dest: 'Bondi Junction', via: 'All stations', plat: '25', at: 4, every: 10 },
  { line: 'T8', dest: 'Macarthur', via: 'Via Domestic · Intl', plat: '23', at: 1, every: 10 },
  { line: 'T9', dest: 'Hornsby', via: 'Via Strathfield', plat: '19', at: 11, every: 15 },
  { line: 'T9', dest: 'Gordon', via: 'Via North Sydney', plat: '20', at: 3, every: 15 },
  { line: 'SCO', dest: 'Kiama', via: 'Via Wollongong', plat: '1', at: 18, every: 60 },
  { line: 'BMT', dest: 'Lithgow', via: 'Via Penrith', plat: '4', at: 33, every: 60 },
  { line: 'CCN', dest: 'Newcastle Interchange', via: 'Via Gosford', plat: '7', at: 46, every: 60 },
];

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
