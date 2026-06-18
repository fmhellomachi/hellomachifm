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

    res.status(200).json({
      title: title,
      artist: artist,
      cover_art: coverArt
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

