document.addEventListener('DOMContentLoaded', () => {
    // --- Audio Player Logic ---
    const audioPlayer = document.getElementById('azuracast-player');
    const playPauseBtn = document.getElementById('play-pause-btn');
    const heroPlayBtn = document.getElementById('play-hero-btn');
    const volumeSlider = document.getElementById('volume-slider');
    const playerThumb = document.querySelector('.player-thumb');
    
    let isPlaying = false;

    function togglePlay() {
        if (isPlaying) {
            audioPlayer.pause();
            playPauseBtn.innerHTML = '<i class="fa-solid fa-play"></i>';
            playerThumb.classList.remove('playing');
        } else {
            // Force load the stream if needed
            if (audioPlayer.readyState === 0) {
                audioPlayer.load();
            }
            audioPlayer.play().catch(error => {
                console.error("Audio playback failed:", error);
                // Removed the alert so it doesn't annoy mobile users!
            });
            playPauseBtn.innerHTML = '<i class="fa-solid fa-pause"></i>';
            playerThumb.classList.add('playing');
        }
        isPlaying = !isPlaying;
    }

    // Event Listeners for Play Buttons
    playPauseBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        togglePlay();
    });
    
    heroPlayBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if(!isPlaying) togglePlay();
        // Scroll to player or visually indicate it's playing
        const playerElement = document.querySelector('.floating-player');
        if (playerElement) {
            playerElement.style.transform = 'translateX(-50%) scale(1.05)';
            setTimeout(() => {
                playerElement.style.transform = 'translateX(-50%) scale(1)';
            }, 300);
        }
    });

    // Volume Control
    volumeSlider.addEventListener('input', (e) => {
        audioPlayer.volume = e.target.value;
    });

    // Update state if audio ends or stalls
    audioPlayer.addEventListener('pause', () => {
        isPlaying = false;
        playPauseBtn.innerHTML = '<i class="fa-solid fa-play"></i>';
        playerThumb.classList.remove('playing');
    });

    audioPlayer.addEventListener('playing', () => {
        isPlaying = true;
        playPauseBtn.innerHTML = '<i class="fa-solid fa-pause"></i>';
        playerThumb.classList.add('playing');
    });


    // --- Dynamic CMS Data Fetching ---
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

    // --- Smooth Scrolling for Anchor Links ---
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const targetId = this.getAttribute('href');
            if(targetId === '#') return;
            
            const targetElement = document.querySelector(targetId);
            if (targetElement) {
                window.scrollTo({
                    top: targetElement.offsetTop - 70, // Offset for fixed navbar
                    behavior: 'smooth'
                });
            }
        });
    });

    // --- Navbar Scroll Effect ---
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
