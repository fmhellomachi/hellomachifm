// Global caching variables for Firestore to prevent quota limits
let cachedPoll = null;
let lastPollFetch = 0;

let cachedRequests = null;
let lastRequestsFetch = 0;

module.exports = async (req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Content-Type', 'application/json');

  try {
    const response = await fetch('https://hellomachifm.duckdns.org/api/nowplaying/hello_machi_fm');
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    const song = data.now_playing?.song || {};

    const rawTitle = song.title || "Machi Live Radio";
    const rawArtist = song.artist || "Hello Machi FM";

    const title = cleanMetadata(rawTitle) || "Machi Live Radio";
    let artist = cleanMetadata(rawArtist) || "Hello Machi FM";

    // Avoid duplicating title and artist if both fallback to the station name
    if (title === "Hello Machi FM" && artist === "Hello Machi FM") {
      artist = "Idhu Namma Area Machi";
    }

    // Search iTunes first for high-quality cover art, fall back to Azuracast's own art
    let coverArt = "https://hellomachifm.vercel.app/logo.jpg";
    if (title && title !== "Hello Machi FM" && title !== "Machi Live Radio") {
      try {
        const queryTerm = encodeURIComponent(`${title} ${artist}`.replace(/[\-()\[\]]/g, " ").trim());
        const itunesRes = await fetch(`https://itunes.apple.com/search?term=${queryTerm}&media=music&limit=1`);
        if (itunesRes.ok) {
          const itunesData = await itunesRes.json();
          if (itunesData.results && itunesData.results.length > 0) {
            const artworkUrl = itunesData.results[0].artworkUrl100 || "";
            if (artworkUrl) {
              coverArt = artworkUrl.replace("100x100bb", "600x600bb");
            }
          }
        }
      } catch (itunesErr) {
        console.error("iTunes Search API error:", itunesErr);
      }
    }

    // Fall back to Azuracast's own art if iTunes didn't find anything
    if (coverArt === "https://hellomachifm.vercel.app/logo.jpg" && song.art) {
      coverArt = song.art;
    }

    // Add a cache-busting query param to force image refresh when song changes
    if (coverArt && !coverArt.includes('logo.jpg')) {
      const separator = coverArt.includes('?') ? '&' : '?';
      coverArt += separator + '_t=' + (data.now_playing?.sh_id || Date.now());
    }

    const is_request = !!data.now_playing?.is_request;
    const now = Date.now();

    // Fetch Active Poll from Firestore (cache for 60 seconds)
    if (now - lastPollFetch > 60000) {
      try {
        const pRes = await fetch("https://firestore.googleapis.com/v1/projects/hello-machi-fm-6ebe4/databases/(default)/documents/polls/active?key=AIzaSyDcU-Gh0FjHeRHVy5A4ezE9H3-94u6aIb4");
        if (pRes.ok) cachedPoll = await pRes.json();
      } catch (e) {
        console.error("Poll fetch error:", e);
      }
      lastPollFetch = now;
    }

    // Fetch Recent Requests from Firestore (cache for 5 minutes / 300,000 ms)
    if (now - lastRequestsFetch > 300000 || !cachedRequests) {
      try {
        const reqJson = {
          structuredQuery: {
            from: [{ collectionId: "requests" }],
            orderBy: [{ field: { fieldPath: "timestamp" }, direction: "DESCENDING" }],
            limit: 100
          }
        };
        const dRes = await fetch("https://firestore.googleapis.com/v1/projects/hello-machi-fm-6ebe4/databases/(default)/documents:runQuery?key=AIzaSyDcU-Gh0FjHeRHVy5A4ezE9H3-94u6aIb4", {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(reqJson)
        });
        if (dRes.ok) {
          const rawResults = await dRes.json();
          // Filter out empty or null items
          cachedRequests = Array.isArray(rawResults) ? rawResults.filter(item => item && item.document) : [];
        }
      } catch (e) {
        console.error("Requests fetch error:", e);
      }
      lastRequestsFetch = now;
    }

    // Server-side dedication title matching if this song is a request
    let current_dedication = null;
    if (is_request && cachedRequests && cachedRequests.length > 0) {
      const cleanPlayingTitle = (title || "").toLowerCase().replace(/[^a-z0-9]/g, "");
      for (const item of cachedRequests) {
        if (!item.document || !item.document.fields) continue;
        const fields = item.document.fields;
        const docRawTitle = fields.title?.stringValue || "";
        const cleanDocTitle = cleanMetadata(docRawTitle).toLowerCase().replace(/[^a-z0-9]/g, "");
        if (cleanDocTitle && (cleanDocTitle === cleanPlayingTitle || cleanPlayingTitle.includes(cleanDocTitle) || cleanDocTitle.includes(cleanPlayingTitle))) {
          let nickname = fields.nickname?.stringValue || "A Listener";
          let recipient = fields.recipient?.stringValue || "You";
          let message = fields.raw_message?.stringValue || fields.dedication?.stringValue || "Dedicated Song";
          
          if (message.startsWith("From: ") && message.includes("Msg: ")) {
            message = message.split("Msg: ")[1];
          }
          current_dedication = {
            nickname: nickname,
            recipient: recipient,
            message: message
          };
          break;
        }
      }
    }

    res.status(200).json({
      title: title,
      artist: artist,
      cover_art: coverArt,
      is_request: is_request,
      active_poll: cachedPoll,
      recent_requests: cachedRequests ? cachedRequests.slice(0, 5) : [], // keep return array small
      current_dedication: current_dedication
    });
  } catch (err) {
    console.error("Azuracast API proxy fetch error:", err);
    res.status(200).json({
      title: "Machi Live Radio",
      artist: "Hello Machi FM",
      cover_art: "https://hellomachifm.vercel.app/logo.jpg",
      error: err.message
    });
  }
};

function cleanMetadata(text) {
  if (!text) return "";
  
  // 1. Replace underscores with spaces
  let cleaned = text.replace(/_/g, " ");

  // 2. Remove URLs (http/https links)
  cleaned = cleaned.replace(/https?:\/\/[^\s]+/gi, "");
  
  // 3. Remove domains (e.g. www.site.com, site.fm, site.co.in)
  cleaned = cleaned.replace(/\b([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,6}\b/gi, "");

  // 4. Remove common Tamil music sites, jingle suffixes, and quality keywords (case-insensitive)
  const keywords = [
    "masstamilan", "isaimini", "starmusiq", "oldtamilmp3", "tamilcutty", "tamilkutty",
    "kuttyweb", "sensongs", "sensong", "sensongsmp3", "singamda", "tamilanda",
    "tamilrockers", "tamilrocker", "isaiyo", "isaipadam", "tamiltunes", "tamiltune",
    "tamilyogi", "tamilyog", "isaiminico", "1tamilmv", "tamilmv", "isaiplay", "isaiminisensongs",
    "tamilmp3world", "tamilmp3", "mass_tamilan", "star_musiq", "old_tamil_mp3",
    "320kbps", "128kbps", "kbps", "vbr", "mp3", "download", "free download",
    "direct download", "single track", "special track", "hq", "cdrip", "rip", "original",
    "website", "stream link", "listen live", "latest songs", "for free"
  ];
  
  const keywordRegex = new RegExp("\\b(" + keywords.join("|") + ")\\b", "gi");
  cleaned = cleaned.replace(keywordRegex, "");

  // 5. Clean up bracketed terms that might have remnants, e.g. [Masstamilan] or (MassTamilan)
  cleaned = cleaned.replace(/\(\s*\)|\[\s*\]|\{\s*\}/g, "");

  // 6. Clean up dashes and punctuation remnants
  cleaned = cleaned.replace(/\s*-\s*-\s*/g, " - ");
  cleaned = cleaned.replace(/\s*-\s*$/, ""); // trailing dashes
  cleaned = cleaned.replace(/^\s*-\s*/, "");  // leading dashes
  cleaned = cleaned.replace(/\s+/g, " ");     // duplicate spaces
  
  // 7. Standardize station/jingle fallbacks
  const cleanedLower = cleaned.toLowerCase().trim();
  if (cleanedLower.startsWith("hello macchi fm") || 
      cleanedLower.startsWith("hello machi fm") || 
      cleanedLower.startsWith("macchi fm") || 
      cleanedLower.startsWith("machi fm") ||
      cleanedLower === "") {
      return "Hello Machi FM";
  }

  return cleaned.trim();
}

