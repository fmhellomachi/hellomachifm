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
    async function loadCMSData() {
        const grid = document.getElementById('schedule-grid');
        try {
            db.collection('cms').doc('homepage').onSnapshot(doc => {
                if (doc.exists) {
                    const data = doc.data();
                    if (data.heroTitle) document.getElementById('hero-title').innerHTML = data.heroTitle;
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
                }
            } else if (index === 0) {
                isLive = true; // Fallback for first item
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
    }

    loadCMSData();

    // --- Homepage Live Banner Logic ---
    
    const voteBanner = document.getElementById('live-vote-banner');
    const bannerSinger = document.getElementById('banner-singer-name');

    if (voteBanner) {
        db.collection('live_state').doc('current').onSnapshot(doc => {
            if (!doc.exists) { voteBanner.style.display = 'none'; return; }
            const state = doc.data();
            
            // Check if ANY singer's voting is open
            const isAnyOpen = state.status === 'on-air' && (state.votingOpen1 || state.votingOpen2 || state.votingOpen);
            
            if (isAnyOpen) {
                // Fetch singer name for the banner (default to singer 1)
                const activeId = state.votingOpen2 && !state.votingOpen1 ? state.singer2 : state.singer1;
                db.collection('participants').doc(activeId).get().then(pDoc => {
                    if (pDoc.exists) {
                        bannerSinger.textContent = pDoc.data().name.toUpperCase();
                        voteBanner.style.display = 'block';
                    }
                });
            } else {
                voteBanner.style.display = 'none';
            }
        });
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
});
