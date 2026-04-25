document.addEventListener('DOMContentLoaded', () => {
    // --- Audio Control System ---
    const audio = document.getElementById('azuracast-player');
    const playPauseBtn = document.getElementById('play-pause-btn');
    const heroPlayBtn = document.getElementById('play-hero-btn');
    const volumeSlider = document.getElementById('volume-slider');
    const tapOverlay = document.getElementById('tap-to-play-overlay');
    const playerThumb = document.querySelector('.player-thumb');
    const statusLabel = document.querySelector('.now-playing-label');

    function updateUIState(isPlaying) {
        const iconClass = isPlaying ? 'fa-pause' : 'fa-play';
        const labelText = isPlaying ? 'PLAYING LIVE' : 'STREAMING LIVE';
        
        if (playPauseBtn) {
            playPauseBtn.innerHTML = `<i class="fa-solid ${iconClass}"></i>`;
            if (isPlaying) playPauseBtn.classList.add('playing');
            else playPauseBtn.classList.remove('playing');
        }
        
        if (heroPlayBtn) {
            heroPlayBtn.innerHTML = `<i class="fa-solid ${iconClass}"></i> ${isPlaying ? 'STOP LISTENING' : 'LISTEN LIVE'}`;
        }

        const rotatingDisk = document.getElementById('player-rotating-disk');
        if (rotatingDisk) {
            if (isPlaying) rotatingDisk.classList.add('spinning');
            else rotatingDisk.classList.remove('spinning');
        }

        // Animated visualizer bars
        document.querySelectorAll('.visualizer span').forEach(span => {
            span.style.animationPlayState = isPlaying ? 'running' : 'paused';
        });
    }

    async function togglePlay() {
        if (audio.paused) {
            try {
                // Force reload the source to ensure fresh buffer
                const currentSrc = audio.querySelector('source').src;
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

    // Update Listener Counter (Sync with Firestore)
    function syncListeners() {
        const statsRef = db.collection('stats').doc('presence');
        // Increment on load
        statsRef.set({ count: firebase.firestore.FieldValue.increment(1) }, { merge: true });
        
        // Listen for updates
        statsRef.onSnapshot(doc => {
            if (doc.exists) {
                const count = Math.max(124, doc.data().count || 0); // Premium padding
                const counterEl = document.getElementById('online-counter');
                if (counterEl) counterEl.innerHTML = `<span class="pulse"></span> ${count} Listeners Online`;
            }
        });

        // Decrement on close (best effort)
        window.addEventListener('beforeunload', () => {
            statsRef.update({ count: firebase.firestore.FieldValue.increment(-1) });
        });
    }
    syncListeners();

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
            { time: "06:00 AM", title: "Morning Vibes", rj: "RJ Malar" },
            { time: "09:00 AM", title: "Retro Hits", rj: "RJ Uthiran" },
            { time: "12:00 PM", title: "Midday Melodies", rj: "RJ Malar" },
            { time: "04:00 PM", title: "Evening Express", rj: "RJ Vijay" }
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
            card.className = `schedule-card ${isLive ? 'active' : ''}`;
            
            card.innerHTML = `
                <div class="time">${block.time || '00:00'} ${block.endTime ? ' - ' + block.endTime : ''}</div>
                <h3>${block.title}</h3>
                <div class="rj-info">
                    <div class="rj-avatar" style="width:30px; height:30px;">
                        <img src="${block.rjPhoto || 'logo.jpg'}" alt="RJ" style="width:100%; height:100%; object-fit:cover;" onerror="this.src='logo.jpg'">
                    </div>
                    <span style="font-size:0.8rem;">${block.rj || 'Hello Machi RJ'}</span>
                </div>
                ${isLive ? '<div class="live-indicator" style="position:static; margin-left:15px;">LIVE</div>' : ''}
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
            const state = doc.data();
            if (state && state.status === 'on-air' && state.votingOpen) {
                // Fetch singer name for the banner
                db.collection('participants').doc(state.singer1).get().then(pDoc => {
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
            const response = await fetch(url);
            const html = await response.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            const newContent = doc.querySelector('#app-content');
            
            if (newContent) {
                document.getElementById('app-content').innerHTML = newContent.innerHTML;
                window.history.pushState({}, '', url);
                // Re-init specific page logic
                if (url.includes('supersinger')) {
                    // Trigger Supersinger JS (assuming it's global or needs re-init)
                    const script = document.createElement('script');
                    script.src = 'supersinger.js';
                    document.body.appendChild(script);
                }
                loadCMSData(); // Refresh schedule
                window.scrollTo(0, 0);
            }
        } catch (e) { console.error("Navigation failed:", e); }
    }

    document.addEventListener('click', (e) => {
        const link = e.target.closest('a');
        if (link && link.href.includes(window.location.origin)) {
            const path = link.getAttribute('href');
            if (path && !path.startsWith('#') && !path.includes('admin')) {
                e.preventDefault();
                navigateTo(path);
            }
        }
    });

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
