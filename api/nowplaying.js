const state = require('./_state');

// ── NO FIRESTORE READS HERE ──────────────────────────────────────────────────
// All dedication data flows through /api/dedicate (POST) which stores it in the
// shared in-memory `state` object. This eliminates all Firestore quota usage
// from the nowplaying polling loop (every 30 s × N users = huge read counts).
// ─────────────────────────────────────────────────────────────────────────────

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Content-Type', 'application/json');
  // Cache the response at Vercel's edge network for 20 seconds
  res.setHeader('Cache-Control', 's-maxage=20, stale-while-revalidate');

  try {
    const response = await fetch('https://hellomachifm.duckdns.org/api/nowplaying/hello_machi_fm');
    if (!response.ok) throw new Error(`AzuraCast error: ${response.status}`);
    const data = await response.json();
    const song = data.now_playing?.song || {};

    const rawTitle  = song.title  || 'Machi Live Radio';
    const rawArtist = song.artist || 'Hello Machi FM';

    const title  = cleanMetadata(rawTitle)  || 'Machi Live Radio';
    let   artist = cleanMetadata(rawArtist) || 'Hello Machi FM';

    if (title === 'Hello Machi FM' && artist === 'Hello Machi FM') {
      artist = 'Idhu Namma Area Machi';
    }

    // iTunes cover art
    let coverArt = 'https://hellomachifm.vercel.app/logo.jpg';
    if (title && title !== 'Hello Machi FM' && title !== 'Machi Live Radio') {
      try {
        const q = encodeURIComponent(`${title} ${artist}`.replace(/[-()[\]]/g, ' ').trim());
        const iRes = await fetch(`https://itunes.apple.com/search?term=${q}&media=music&limit=1`);
        if (iRes.ok) {
          const iData = await iRes.json();
          const url = iData.results?.[0]?.artworkUrl100;
          if (url) coverArt = url.replace('100x100bb', '600x600bb');
        }
      } catch (_) {}
    }
    if (coverArt === 'https://hellomachifm.vercel.app/logo.jpg' && song.art) {
      coverArt = song.art;
    }
    if (coverArt && !coverArt.includes('logo.jpg')) {
      coverArt += (coverArt.includes('?') ? '&' : '?') + '_t=' + (data.now_playing?.sh_id || Date.now());
    }

    const is_request = !!data.now_playing?.is_request;
    const now = Date.now();
    // ── Dedication lookup (conditional database lookup for requests) ─────────
    let current_dedication = null;
    const DEDICATE_TTL_MS = 15 * 60 * 1000; // 15 minutes

    // 1. Attempt in-memory lookup first
    if (state.currentDedication && (now - state.dedicationSetAt) < DEDICATE_TTL_MS) {
      const d = state.currentDedication;
      const cleanPlaying = normalizeTitle(title);
      const cleanStored  = normalizeTitle(d.songTitle || '');

      if (cleanStored && cleanPlaying &&
          (cleanPlaying === cleanStored ||
           cleanPlaying.includes(cleanStored) ||
           cleanStored.includes(cleanPlaying))) {
        current_dedication = {
          nickname:  d.nickname  || 'A Listener',
          recipient: d.recipient || '',
          message:   d.message   || '',
        };
      }
    }

    // 2. If no in-memory match found but stream confirms it's a request, query Firestore
    if (!current_dedication && is_request && title && title !== 'Hello Machi FM') {
      try {
        const FIREBASE_API_KEY = 'AIzaSyDcU-Gh0FjHeRHVy5A4ezE9H3-94u6aIb4';
        const queryUrl = `https://firestore.googleapis.com/v1/projects/hello-machi-fm-6ebe4/databases/(default)/documents:runQuery?key=${FIREBASE_API_KEY}`;
        const queryJson = {
          structuredQuery: {
            from: [{ collectionId: 'requests' }],
            where: {
              fieldFilter: {
                field: { fieldPath: 'title' },
                op: 'EQUAL',
                value: { stringValue: title }
              }
            },
            orderBy: [{ field: { fieldPath: 'timestamp' }, direction: 'DESCENDING' }],
            limit: 1
          }
        };

        const fsRes = await fetch(queryUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(queryJson)
        });

        if (fsRes.ok) {
          const fsData = await fsRes.json();
          if (Array.isArray(fsData) && fsData.length > 0 && fsData[0].document) {
            const fields = fsData[0].document.fields || {};
            const nickname = fields.nickname?.stringValue || 'A Listener';
            const recipient = fields.recipient?.stringValue || '';
            const message = fields.raw_message?.stringValue || fields.dedication?.stringValue || '';
            
            current_dedication = {
              nickname,
              recipient,
              message
            };
          }
        }
      } catch (fsErr) {
        console.error('API Firestore lookup fallback error:', fsErr);
      }
    }
    // ─────────────────────────────────────────────────────────────────────────

    res.status(200).json({
      title,
      artist,
      cover_art: coverArt,
      is_request,
      active_poll: null,        // polls managed separately to avoid Firestore reads
      recent_requests: [],      // removed — was causing 100s of Firestore reads/day
      current_dedication,
    });
  } catch (err) {
    console.error('nowplaying error:', err);
    res.status(200).json({
      title:     'Machi Live Radio',
      artist:    'Hello Machi FM',
      cover_art: 'https://hellomachifm.vercel.app/logo.jpg',
      is_request: false,
      current_dedication: null,
      error: err.message,
    });
  }
};

function normalizeTitle(text) {
  return (text || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function cleanMetadata(text) {
  if (!text) return '';
  let s = text.replace(/_/g, ' ');
  s = s.replace(/https?:\/\/[^\s]+/gi, '');
  s = s.replace(/\b([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,6}\b/gi, '');
  const kw = [
    'masstamilan','isaimini','starmusiq','oldtamilmp3','tamilcutty','tamilkutty',
    'kuttyweb','sensongs','sensong','sensongsmp3','singamda','tamilanda',
    'tamilrockers','tamilrocker','isaiyo','isaipadam','tamiltunes','tamiltune',
    'tamilyogi','tamilyog','isaiminico','1tamilmv','tamilmv','isaiplay','isaiminisensongs',
    'tamilmp3world','tamilmp3','mass_tamilan','star_musiq','old_tamil_mp3',
    '320kbps','128kbps','kbps','vbr','mp3','download','free download',
    'direct download','single track','special track','hq','cdrip','rip','original',
    'website','stream link','listen live','latest songs','for free',
  ];
  s = s.replace(new RegExp('\\b(' + kw.join('|') + ')\\b', 'gi'), '');
  s = s.replace(/\(\s*\)|\[\s*\]|\{\s*\}/g, '');
  s = s.replace(/\s*-\s*-\s*/g, ' - ').replace(/\s*-\s*$/, '').replace(/^\s*-\s*/, '').replace(/\s+/g, ' ');
  const l = s.toLowerCase().trim();
  if (l.startsWith('hello macchi fm') || l.startsWith('hello machi fm') ||
      l.startsWith('macchi fm')       || l.startsWith('machi fm') || l === '') {
    return 'Hello Machi FM';
  }
  return s.trim();
}
