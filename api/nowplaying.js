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
    res.status(200).json({
      title: song.title || "Machi Live Radio",
      artist: song.artist || "Hello Machi FM",
      cover_art: song.art || "https://hello-machi.github.io/hello-machi-portal/logo.jpg"
    });
  } catch (err) {
    console.error("Azuracast API proxy fetch error:", err);
    res.status(200).json({
      title: "Machi Live Radio",
      artist: "Hello Machi FM",
      cover_art: "https://hello-machi.github.io/hello-machi-portal/logo.jpg",
      error: err.message
    });
  }
};
