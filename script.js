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
            playPauseBtn.className = `control-btn ${isPlaying ? 'pause-btn' : 'play-btn'}`;
        }
        
        if (heroPlayBtn) {
            heroPlayBtn.innerHTML = `<i class="fa-solid ${iconClass}"></i> ${isPlaying ? 'STOP LISTENING' : 'LISTEN LIVE'}`;
        }

        if (statusLabel) {
            statusLabel.textContent = labelText;
        }

        if (playerThumb) {
            if (isPlaying) playerThumb.classList.add('playing');
            else playerThumb.classList.remove('playing');
        }

        // Animated visualizer bars
        document.querySelectorAll('.visualizer span').forEach(span => {
            span.style.animationPlayState = isPlaying ? 'running' : 'paused';
        });
    }

    async function togglePlay() {
        if (audio.paused) {
            try {
                await audio.play();
                updateUIState(true);
                if(tapOverlay) tapOverlay.style.display = 'none';
            } catch (err) {
                console.error("Autoplay/Play blocked:", err);
                if(tapOverlay) tapOverlay.style.display = 'flex';
            }
        } else {
            audio.pause();
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
        try {
            const doc = await db.collection('cms').doc('homepage').get();
            if (doc.exists) {
                const data = doc.data();
                if (data.heroTitle) document.getElementById('hero-title').innerHTML = data.heroTitle;
                if (data.heroSubtitle) document.getElementById('hero-subtitle').textContent = data.heroSubtitle;
                
                if (data.scheduleBlocks && data.scheduleBlocks.length > 0) {
                    renderScheduleGrid(data.scheduleBlocks);
                }
            }
        } catch (error) {
            console.error("Error loading CMS data:", error);
        }
    }

    function renderScheduleGrid(blocks) {
        const grid = document.getElementById('schedule-grid');
        if (!grid) return;
        grid.innerHTML = '';
        
        blocks.forEach((block, index) => {
            const card = document.createElement('div');
            card.className = `schedule-card ${index === 0 ? 'active' : ''}`;
            if (index === 0) {
                card.innerHTML = `<div class="live-indicator">LIVE</div>`;
            }
            card.innerHTML += `
                <div class="card-glow"></div>
                <div class="time">${block.time}</div>
                <h3>${block.title}</h3>
                <p>Enjoy the best music and conversation with our RJs.</p>
                <div class="rj-info">
                    <div class="rj-avatar"><i class="fa-solid fa-user"></i></div>
                    <span>${block.rj || 'Hello Machi RJ'}</span>
                </div>
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

    // --- General UI ---
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const targetId = this.getAttribute('href');
            if(targetId === '#') return;
            
            const targetElement = document.querySelector(targetId);
            if (targetElement) {
                window.scrollTo({
                    top: targetElement.offsetTop - 70,
                    behavior: 'smooth'
                });
            }
        });
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
