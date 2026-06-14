document.addEventListener('DOMContentLoaded', () => {
    // --- Audio Control System ---
    const audio = document.getElementById('azuracast-player');
    const playPauseBtn = document.getElementById('play-pause-btn');
    const heroPlayBtn = document.getElementById('play-hero-btn');
    const volumeSlider = document.getElementById('volume-slider');
    const tapOverlay = document.getElementById('tap-to-play-overlay');
    const playerThumb = document.querySelector('.player-thumb');
    const statusLabel = document.querySelector('.now-playing-label');

    // --- REAL WEB AUDIO VISUALIZER LOGIC ---
    let audioCtx, analyser, dataArray, source;
    const visualizerBlocks = document.querySelectorAll('.vis-block-col');

    function initVisualizer(audioElement) {
        if (audioCtx) return;
        try {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            analyser = audioCtx.createAnalyser();
            analyser.fftSize = 64; 
            
            // Note: If CORS error occurs, visualization might stay flat.
            // We use crossOrigin = "anonymous" in the togglePlay function.
            
            source = audioCtx.createMediaElementSource(audioElement);
            source.connect(analyser);
            analyser.connect(audioCtx.destination);
            
            dataArray = new Uint8Array(analyser.frequencyBinCount);
            requestAnimationFrame(animateVisualizer);
        } catch (e) {
            console.error("Visualizer Init Failed (CORS?):", e);
            simulateVisualizer();
        }
    }

    // --- LIQUID SYNC VISUALIZER LOGIC ---
    let prevHeights = [0, 0, 0, 0];

    function animateVisualizer() {
        if (!analyser || audio.paused) {
            if (audio.paused) resetBlocks();
            requestAnimationFrame(animateVisualizer);
            return;
        }

        analyser.getByteFrequencyData(dataArray);
        
        const ranges = [
            dataArray.slice(0, 2),   
            dataArray.slice(2, 6),   
            dataArray.slice(6, 12),  
            dataArray.slice(12, 20)  
        ];

        ranges.forEach((range, colIndex) => {
            const avg = range.reduce((a, b) => a + b, 0) / range.length;
            
            // Per-column sensitivity tuning
            let sensitivity = 10;
            if (colIndex === 0) sensitivity = 6;  // Reduce Bass Sensitivity
            if (colIndex === 1) sensitivity = 7;  // Reduce Mid-Low Sensitivity
            if (colIndex === 3) sensitivity = 14; // Boost Treble Sensitivity
            
            const targetHeight = Math.min(8, Math.round((avg / 255) * sensitivity)); 
            
            // REFINED LIQUID SYNC (Faster 0.4 snap)
            prevHeights[colIndex] = (targetHeight * 0.4) + (prevHeights[colIndex] * 0.6);
            
            updateColumn(colIndex, Math.round(prevHeights[colIndex]));
        });

        requestAnimationFrame(animateVisualizer);
    }

    function updateColumn(colIndex, activeCount) {
        const columns = document.querySelectorAll('.vis-block-col');
        if (!columns[colIndex]) return;
        const blocks = columns[colIndex].querySelectorAll('.vis-block');
        blocks.forEach((block, i) => {
            if (i < activeCount) {
                block.style.opacity = "1";
                block.style.boxShadow = "0 0 10px currentColor";
            } else {
                block.style.opacity = "0.1";
                block.style.boxShadow = "none";
            }
        });
    }

    function resetBlocks() {
        document.querySelectorAll('.vis-block').forEach(b => {
            b.style.opacity = "0.1";
            b.style.boxShadow = "none";
        });
    }

    function simulateVisualizer() {
        if (audio.paused) return;
        document.querySelectorAll('.vis-block-col').forEach((col, idx) => {
            const randomActive = Math.floor(Math.random() * 5) + 1;
            updateColumn(idx, randomActive);
        });
        setTimeout(simulateVisualizer, 150);
    }

    function updateUIState(isPlaying) {
        console.log("Updating UI State. Playing:", isPlaying);
        const iconClass = isPlaying ? 'fa-pause' : 'fa-play';
        const playerElement = document.querySelector('.floating-player');
        const playIcon = document.getElementById('play-icon');
        
        if (playIcon) playIcon.className = `fa-solid ${iconClass}`;
        
        if (playerElement) {
            if (isPlaying) {
                playerElement.classList.add('spinning');
                initVisualizer(audio);
            } else {
                playerElement.classList.remove('spinning');
                resetBlocks();
            }
        }
        
        if (heroPlayBtn) {
            heroPlayBtn.innerHTML = `<i class="fa-solid ${iconClass}"></i> ${isPlaying ? 'STOP LISTENING' : 'LISTEN LIVE'}`;
        }
    }

    async function togglePlay() {
        if (audio.paused) {
            try {
                // Force reload with CORS support
                const currentSrc = audio.querySelector('source').src;
                audio.crossOrigin = "anonymous"; 
                audio.src = currentSrc + "?t=" + new Date().getTime(); 
                audio.load();
                
                await audio.play();
                updateUIState(true);
                if(tapOverlay) tapOverlay.style.display = 'none';
            } catch (err) {
                console.error("Playback failed:", err);
                // If it failed, try the fallback URL
                try {
                    audio.src = "https://azuracast.hellomachi.com/listen/hello_machi_fm/radio.mp3";
                    await audio.play();
                    updateUIState(true);
                } catch(e) {
                    if(tapOverlay) tapOverlay.style.display = 'flex';
                }
            }
        } else {
            audio.pause();
            audio.src = ""; // Stop the download stream entirely
            updateUIState(false);
        }
    }

    if (playPauseBtn) playPauseBtn.addEventListener('click', togglePlay);
    if (heroPlayBtn) heroPlayBtn.addEventListener('click', togglePlay);
    if (tapOverlay) tapOverlay.addEventListener('click', togglePlay);

    if (volumeSlider) {
        volumeSlider.addEventListener('input', (e) => {
            audio.volume = e.target.value;
        });
    }

    // --- Live Chat System ---
    const socket = io('https://hello-machi-backend.onrender.com');
    const chatToggle = document.getElementById('chat-toggle-btn');
    const chatWindow = document.getElementById('chat-window');
    const chatMessages = document.getElementById('chat-messages');
    const chatInput = document.getElementById('chat-input');
    const chatSend = document.getElementById('chat-send-btn');
    
    let chatUsername = localStorage.getItem('chat_username') || ('Listener_' + Math.floor(Math.random() * 9000 + 1000));

    // Listener count is synced via the complete syncListeners() below

    window.setChatName = () => {
        const name = prompt("Choose a unique nickname:", chatUsername);
        if (name && name.trim().length > 2) {
            chatUsername = name.trim();
            localStorage.setItem('chat_username', chatUsername);
            alert("Name updated to: " + chatUsername);
        }
    };

    window.toggleChat = () => {
        const isOpen = chatWindow.style.display === 'flex';
        chatWindow.style.display = isOpen ? 'none' : 'flex';
        if (!isOpen) {
            chatInput.focus();
        }
    };

    if (chatToggle) chatToggle.addEventListener('click', toggleChat);

    function addMessageToUI(data) {
        const div = document.createElement('div');
        const isMe = data.user === chatUsername;
        div.style.alignSelf = isMe ? 'flex-end' : 'flex-start';
        div.style.maxWidth = '80%';
        div.style.background = isMe ? 'var(--primary)' : 'rgba(255,255,255,0.1)';
        div.style.color = isMe ? 'black' : 'white';
        div.style.padding = '8px 12px';
        div.style.borderRadius = isMe ? '15px 15px 0 15px' : '15px 15px 15px 0';
        div.style.fontSize = '0.9rem';
        div.style.wordBreak = 'break-word';
        
        div.innerHTML = `
            <div style="font-size:0.7rem; opacity:0.7; font-weight:bold; margin-bottom:2px;">${data.user}</div>
            <div>${data.text}</div>
        `;
        chatMessages.appendChild(div);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    // Existing Backend Events
    socket.on('new_message', (data) => {
        addMessageToUI(data);
    });

    socket.on('user_count', (count) => {
        console.log("Real-time User Count Update:", count);
        const mainCounter = document.getElementById('onlineCount');
        const chatCounter = document.getElementById('chatOnlineCount');
        
        if (mainCounter) {
            mainCounter.innerHTML = `<span class="pulse"></span> ${count} Listeners Online`;
        }
        if (chatCounter) {
            chatCounter.textContent = `${count} Online`;
        }
    });

    socket.on('chat_history', (history) => {
        chatMessages.innerHTML = '';
        history.forEach(addMessageToUI);
    });

    async function sendMessage() {
        const text = chatInput.value.trim();
        if (!text) return;

        const msgData = {
            user: chatUsername,
            text: text
        };

        // Emit via Socket (The backend will handle saving to Firestore once you update it)
        socket.emit('send_message', msgData);
        chatInput.value = '';
    }

    if (chatSend) chatSend.addEventListener('click', sendMessage);
    if (chatInput) {
        chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') sendMessage();
        });
    }

    // --- Website CMS Logic ---
    function sanitizeHTML(str) {
        if (!str) return '';
        const el = document.createElement('div');
        el.textContent = str;
        let safe = el.innerHTML;
        // Allow only basic inline tags: <br>, <span>, <strong>, <em>, <b>, <i>
        safe = safe.replace(/&lt;(\/?(?:br|span|strong|em|b|i)(?:\s[^&gt]*)?)&gt;/gi, '<$1>');
        // Strip anything that looks like an event handler
        safe = safe.replace(/\son\w+\s*=\s*["'][^"']*["']/gi, '');
        return safe;
    }

    async function loadCMSData() {
        const grid = document.getElementById('schedule-grid');
        try {
            db.collection('cms').doc('homepage').onSnapshot(doc => {
                if (doc.exists) {
                    const data = doc.data();
                    if (data.heroTitle) document.getElementById('hero-title').innerHTML = sanitizeHTML(data.heroTitle);
                    if (data.heroSubtitle) document.getElementById('hero-subtitle').textContent = data.heroSubtitle;
                    
                    if (data.scheduleBlocks && data.scheduleBlocks.length > 0) {
                        renderScheduleGrid(data.scheduleBlocks);
                        if (window.renderRJs) window.renderRJs(data.scheduleBlocks);
                    } else {
                        useDefaultSchedule();
                    }
                } else {
                    useDefaultSchedule();
                }
                if (grid) grid.style.opacity = '1';
            });
        } catch (error) {
            console.error("Error loading CMS data:", error);
            useDefaultSchedule();
            if (grid) grid.style.opacity = '1';
        }
    }

    function useDefaultSchedule() {
        const defaults = [
            { time: "06:00", endTime: "09:00", title: "Morning Vibes", rj: "RJ Malar" },
            { time: "09:00", endTime: "12:00", title: "Retro Hits", rj: "RJ Uthiran" },
            { time: "12:00", endTime: "16:00", title: "Midday Melodies", rj: "RJ Malar" },
            { time: "16:00", endTime: "20:00", title: "Evening Express", rj: "RJ Vijay" },
            { time: "20:00", endTime: "23:59", title: "Romantic Night", rj: "RJ Uthiran" },
            { time: "00:00", endTime: "06:00", title: "Iravin Madiyil", rj: "RJ Vijay" }
        ];
        renderScheduleGrid(defaults);
    }

    function renderScheduleGrid(blocks) {
        const grid = document.getElementById('schedule-grid');
        if (!grid) return;
        grid.innerHTML = '';
        
        // Get current IST time
        const nowIST = new Date().toLocaleString("en-US", {timeZone: "Asia/Kolkata"});
        const istDate = new Date(nowIST);
        const currentHour = istDate.getHours();
        const currentMin = istDate.getMinutes();
        const currentTimeVal = currentHour * 60 + currentMin;

        let activeShowTitle = "Live Broadcast";
        let activeShowRJ = "Machi Team";

        blocks.forEach((block, index) => {
            let isLive = false;
            
            // Helper to parse time string like "06:00 AM" or "18:00"
            function parseTimeToMinutes(timeStr) {
                if(!timeStr) return null;
                const parts = timeStr.match(/(\d+):(\d+)\s*(AM|PM)?/i);
                if(!parts) return null;
                let hours = parseInt(parts[1]);
                let minutes = parseInt(parts[2]);
                const ampm = parts[3] ? parts[3].toUpperCase() : null;

                if (ampm === "PM" && hours < 12) hours += 12;
                if (ampm === "AM" && hours === 12) hours = 0;
                return hours * 60 + minutes;
            }

            const startVal = parseTimeToMinutes(block.time);
            const endVal = parseTimeToMinutes(block.endTime) || (startVal + 180); // Default 3 hours if missing

            if (startVal !== null) {
                if (currentTimeVal >= startVal && currentTimeVal < endVal) {
                    isLive = true;
                    activeShowTitle = block.title;
                    activeShowRJ = block.rj || "Machi Team";
                }
            } else if (index === 0) {
                isLive = true; // Fallback for first item
                activeShowTitle = block.title;
                activeShowRJ = block.rj || "Machi Team";
            }

            const card = document.createElement('div');
            card.className = `schedule-row ${isLive ? 'active' : ''}`;
            
            card.innerHTML = `
                ${isLive ? '<div class="live-tag">LIVE NOW</div>' : ''}
                <div class="time">${block.time || '00:00'} — ${block.endTime || '00:00'}</div>
                <h3>${block.title}</h3>
                <div class="rj-name">with ${block.rj || 'Hello Machi RJ'}</div>
            `;
            grid.appendChild(card);
        });

        // Update active show text on Now Playing HUD
        const hudProgramTitle = document.getElementById('hud-program-title');
        const hudProgramRj = document.getElementById('hud-program-rj');
        if (hudProgramTitle) {
            hudProgramTitle.textContent = activeShowTitle.toUpperCase();
        }
        if (hudProgramRj) {
            hudProgramRj.textContent = `WITH ${activeShowRJ.toUpperCase()}`;
        }
    }

    loadCMSData();

    // --- Dynamic HUD & Now Playing Polling ---
    async function pollNowPlaying() {
        try {
            const res = await fetch('/api/nowplaying');
            const data = await res.json();
            if (data && data.title) {
                // Update Homepage HUD
                const hudCover = document.getElementById('hud-cover-art');
                const hudStatus = document.getElementById('hud-status-text');
                const hudMarquee = document.getElementById('hud-track-marquee');
                
                if (hudCover && data.cover_art) hudCover.src = data.cover_art;
                if (hudStatus) hudStatus.textContent = `Live: "${data.title}" by ${data.artist || 'Machi RJ'}`;
                if (hudMarquee) {
                    hudMarquee.innerHTML = `<span class="marquee-prefix">NOW PLAYING</span> ${data.title.toUpperCase()} — ${(data.artist || 'Hello Machi FM').toUpperCase()}`;
                }
                
                // Update Floating Player HUD
                const playerTitle = document.getElementById('now-playing-title');
                const diskImg = document.getElementById('player-disk-img');
                
                if (playerTitle) {
                    playerTitle.textContent = data.title;
                }
                if (diskImg && data.cover_art) diskImg.src = data.cover_art;
            }
        } catch (e) {
            console.error("Error fetching nowplaying metadata:", e);
        }
    }
    
    pollNowPlaying();
    setInterval(pollNowPlaying, 20000);

    // --- Live Studio Poll Listener ---
    const homePollEmpty = document.getElementById('home-poll-empty');
    const homePollActive = document.getElementById('home-poll-active');
    const homePollQuestion = document.getElementById('home-poll-question');
    const homePollOptions = document.getElementById('home-poll-options');
    const homePollContainer = document.getElementById('home-poll-container');
    const homePollCard = document.getElementById('home-poll-card');
    
    if (homePollContainer) {
        db.collection('polls').doc('active').onSnapshot(doc => {
            const hasActivePoll = doc.exists && doc.data().status === 'active';
            
            if (homePollCard) {
                homePollCard.style.display = hasActivePoll ? 'flex' : 'none';
            }
            
            if (hasActivePoll) {
                const poll = doc.data();
                const pollId = doc.id + '_' + poll.timestamp;
                
                if (homePollEmpty) homePollEmpty.style.display = 'none';
                if (homePollActive) homePollActive.style.display = 'flex';
                if (homePollQuestion) homePollQuestion.textContent = poll.question;
                
                if (homePollOptions) {
                    homePollOptions.innerHTML = '';
                    const hasVoted = localStorage.getItem('voted_poll_' + pollId);
                    const votes = poll.votes || {};
                    const total = Object.values(votes).reduce((a, b) => a + b, 0);
                    
                    function createVoteBtn(opt, pct, count, hasVoted, pollId, idx) {
                        if (hasVoted) {
                            const div = document.createElement('div');
                            div.style.cssText = "display: flex; flex-direction: column; gap: 4px; margin-bottom: 5px;";
                            div.innerHTML = `
                                <div style="display: flex; justify-content: space-between; font-size: 0.8rem; color: #ccc;">
                                    <span>${opt}</span>
                                    <strong>${count} votes (${pct}%)</strong>
                                </div>
                                <div style="background: rgba(255,255,255,0.05); height: 8px; border-radius: 4px; overflow: hidden;">
                                    <div style="background: #FFD700; height: 100%; width: ${pct}%; border-radius: 4px; transition: width 0.4s ease;"></div>
                                </div>
                            `;
                            return div;
                        } else {
                            const button = document.createElement('button');
                            button.style.cssText = "background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; color: white; padding: 10px; cursor: pointer; text-align: left; font-size: 0.85rem; font-weight: bold; transition: all 0.2s; outline: none; margin-bottom: 5px;";
                            button.textContent = opt;
                            button.onmouseover = () => { button.style.background = 'rgba(255, 215, 0, 0.1)'; button.style.borderColor = '#FFD700'; };
                            button.onmouseout = () => { button.style.background = 'rgba(255,255,255,0.05)'; button.style.borderColor = 'rgba(255,255,255,0.1)'; };
                            button.onclick = async () => {
                                try {
                                    const pollRef = db.collection('polls').doc('active');
                                    const snap = await pollRef.get();
                                    if (!snap.exists) return;
                                    const votes = snap.data().votes || {};
                                    votes[opt] = (votes[opt] || 0) + 1;
                                    await pollRef.update({ votes });
                                    localStorage.setItem('voted_poll_' + pollId, opt);
                                    alert("🗳 Vote submitted successfully!");
                                } catch (err) {
                                    console.error("Vote failed:", err);
                                    alert("Vote error: " + (err.message || "Try again."));
                                }
                            };
                            return button;
                        }
                    }
                    
                    // Render in hub card
                    poll.options.forEach((opt, idx) => {
                        const isNewFormat = Object.keys(votes).length === 0 || Object.keys(votes).every(k => /^\d+$/.test(k));
                        const key = isNewFormat ? String(idx) : opt;
                        const count = votes[key] || 0;
                        const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                        homePollOptions.appendChild(createVoteBtn(opt, pct, count, hasVoted, pollId, idx));
                    });
                }
            } else {
                if (homePollEmpty) homePollEmpty.style.display = 'block';
                if (homePollActive) homePollActive.style.display = 'none';
                if (homePollCard) homePollCard.style.display = 'none';
            }
        });
    }

    // --- Live Shoutout Submission ---
    const nicknameInput = document.getElementById('home-shoutout-nickname');
    const messageInput = document.getElementById('home-shoutout-message');
    const sendBtn = document.getElementById('home-shoutout-send-btn');
    
    if (nicknameInput) {
        nicknameInput.value = localStorage.getItem('chat_username') || '';
    }
    
    if (sendBtn) {
        sendBtn.onclick = async () => {
            const nickname = nicknameInput.value.trim() || 'Anonymous';
            const message = messageInput.value.trim();
            
            if (!message) {
                alert("Please write a request or message to send to the RJ!");
                return;
            }
            
            sendBtn.disabled = true;
            sendBtn.textContent = 'SENDING...';
            
            try {
                await db.collection('shoutouts').add({
                    nickname: nickname,
                    message: message,
                    timestamp: Date.now()
                });
                
                localStorage.setItem('chat_username', nickname);
                messageInput.value = '';
                alert("🚀 Shoutout sent live to Studio Jockey!");
            } catch (e) {
                console.error("Error submitting shoutout:", e);
                alert("Failed to send shoutout. Please check connection.");
            } finally {
                sendBtn.disabled = false;
                sendBtn.textContent = 'SEND LIVE TO RJ';
            }
        };
    }

    // --- Persistent Navigation (SPA) ---
    async function navigateTo(url) {
        try {
            // Ensure we use the right URL for fetch
            const fetchUrl = url.startsWith('http') ? url : window.location.origin + '/' + url;
            const response = await fetch(fetchUrl);
            const html = await response.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            const newContent = doc.querySelector('#app-content');
            
            if (newContent) {
                document.getElementById('app-content').innerHTML = newContent.innerHTML;
                window.history.pushState({}, '', url);
                
                if (url.includes('supersinger')) {
                    const script = document.createElement('script');
                    script.src = 'supersinger.js';
                    document.body.appendChild(script);
                } else {
                    loadCMSData(); 
                }
                window.scrollTo(0, 0);
            } else {
                window.location.href = url;
            }
        } catch (e) { 
            console.error("Navigation failed:", e); 
            window.location.href = url; // Hard fallback
        }
    }

    document.addEventListener('click', (e) => {
        const link = e.target.closest('a');
        if (link && link.href.includes(window.location.origin)) {
            const path = link.getAttribute('href');
            // If it's a real page link and not a hash
            if (path && !path.startsWith('#') && !path.includes('admin')) {
                e.preventDefault();
                // Ensure the path is relative for the fetch
                const relativePath = path.split('/').pop();
                navigateTo(relativePath);
            }
        }
    });    // --- Presence Logic is now handled via Socket.io above ---
    // syncListeners(); // Disabling Firebase fallback to avoid conflicts

    // --- RJ Introduction Rendering ---
    window.renderRJs = function(blocks) {
        const rjGrid = document.getElementById('rj-intro-grid');
        if (!rjGrid) return;
        
        const sourceData = (blocks && blocks.length > 0) ? blocks : [
            { rj: "RJ Malar", rjPhoto: "logo.jpg", show: "Morning Vibes" },
            { rj: "RJ Uthiran", rjPhoto: "logo.jpg", show: "Retro Hits" },
            { rj: "RJ Vijay", rjPhoto: "logo.jpg", show: "Evening Express" }
        ];

        const rjs = [];
        const seen = new Set();
        sourceData.forEach(b => {
            if (b.rj && !seen.has(b.rj)) {
                rjs.push({ name: b.rj, photo: b.rjPhoto || 'logo.jpg', show: b.show || 'Hello Machi FM' });
                seen.add(b.rj);
            }
        });

        rjGrid.innerHTML = rjs.map(rj => `
            <div class="rj-premium-card">
                <img src="${rj.photo}" alt="${rj.name}" onerror="this.src='logo.jpg'">
                <div class="rj-overlay">
                    <h3>${rj.name}</h3>
                    <p>${rj.show}</p>
                </div>
            </div>
        `).join('');
    };
;

    window.addEventListener('scroll', () => {
        const navbar = document.querySelector('.navbar');
        if (window.scrollY > 50) {
            navbar.style.background = 'rgba(10, 10, 15, 0.9)';
            navbar.style.boxShadow = '0 4px 20px rgba(0,0,0,0.5)';
        } else {
            navbar.style.background = 'rgba(15, 15, 20, 0.6)';
            navbar.style.boxShadow = 'none';
        }
    });

    // --- Fetch APK Download Config from API ---
    fetch('/api/config')
        .then(r => r.json())
        .then(cfg => {
            const link = document.getElementById('apk-download-link');
            const ver = document.getElementById('apk-version');
            if (link && cfg.apk_url) {
                link.href = cfg.apk_url;
            }
            if (ver && cfg.latest_version_code) {
                ver.textContent = 'v' + cfg.latest_version_code;
            }
        })
        .catch(err => console.error('APK config fetch failed:', err));

    // --- Public Shoutout Wall ---
    const wallFeed = document.getElementById('shoutout-wall-feed');
    if (wallFeed) {
        db.collection('shoutouts')
            .orderBy('timestamp', 'desc')
            .limit(20)
            .onSnapshot(snap => {
                wallFeed.innerHTML = '';
                if (snap.empty) {
                    wallFeed.innerHTML = '<div style="text-align: center; color: rgba(255,255,255,0.3); padding: 20px;">Be the first to send a shoutout!</div>';
                    return;
                }
                snap.forEach(doc => {
                    const data = doc.data();
                    const time = data.timestamp
                        ? new Date(data.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                        : '';
                    const div = document.createElement('div');
                    div.style.cssText = 'background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 16px; padding: 16px 20px; display: flex; flex-direction: column; gap: 4px;';
                    div.innerHTML = `
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <strong style="color: var(--primary); font-size: 0.85rem;">${escapeHtml(data.nickname || 'Anonymous')}</strong>
                            <span style="color: rgba(255,255,255,0.3); font-size: 0.7rem;">${time}</span>
                        </div>
                        <p style="color: #ddd; font-size: 0.9rem; margin: 0;">${escapeHtml(data.message || '')}</p>
                        ${data.reply ? `
                            <div style="margin-top: 8px; padding: 10px 14px; background: rgba(0, 230, 118, 0.06); border-left: 3px solid var(--secondary); border-radius: 0 12px 12px 0;">
                                <span style="color: var(--secondary); font-weight: bold; font-size: 0.75rem;">${escapeHtml(data.repliedBy || 'RJ')} replied</span>
                                <p style="color: #eee; font-size: 0.85rem; margin: 4px 0 0 0;">${escapeHtml(data.reply)}</p>
                            </div>
                        ` : ''}
                    `;
                    wallFeed.appendChild(div);
                });
            }, err => {
                wallFeed.innerHTML = '<div style="text-align: center; color: rgba(255,255,255,0.3); padding: 20px;">Unable to load shoutouts.</div>';
            });
    }

    function escapeHtml(str) {
        const el = document.createElement('div');
        el.textContent = str;
        return el.innerHTML;
    }
});
