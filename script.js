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

    // Handle Autoplay Policy
    // Modern browsers block autoplaying audio unless the user has interacted with the page.
    const attemptAutoplay = async () => {
        try {
            await audioPlayer.play();
            isPlaying = true;
            playPauseBtn.innerHTML = '<i class="fa-solid fa-pause"></i>';
            playerThumb.classList.add('playing');
        } catch (error) {
            console.log("Browser blocked autoplay. Waiting for user interaction.");
            // If blocked, wait for the first user interaction anywhere on the document to start playing
            const startOnInteraction = () => {
                // Ensure we don't call it multiple times
                if (!isPlaying) togglePlay();
                document.removeEventListener('click', startOnInteraction);
                document.removeEventListener('keydown', startOnInteraction);
                document.removeEventListener('touchstart', startOnInteraction);
            };
            document.addEventListener('click', startOnInteraction);
            document.addEventListener('keydown', startOnInteraction);
            document.addEventListener('touchstart', startOnInteraction);
        }
    };
    
    // Call attempt immediately
    attemptAutoplay();

    // Event Listeners for Play Buttons
    playPauseBtn.addEventListener('click', togglePlay);
    heroPlayBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if(!isPlaying) togglePlay();
        // Scroll to player or visually indicate it's playing
        const playerElement = document.querySelector('.floating-player');
        playerElement.style.transform = 'translateX(-50%) scale(1.05)';
        setTimeout(() => {
            playerElement.style.transform = 'translateX(-50%) scale(1)';
        }, 300);
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
