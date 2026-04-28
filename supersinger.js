document.addEventListener('DOMContentLoaded', () => {
    const getEl = (id) => document.getElementById(id);
    const form = document.getElementById('registration-form');
    const submitBtn = document.getElementById('submit-registration');
    const formMessage = document.getElementById('form-message');

    // ===== INTERACTIVE FACE CROPPER =====
    let compressedPhotoBase64 = null;
    const photoInput = document.getElementById('reg-photo');
    const photoPreviewContainer = document.getElementById('photo-preview-container');
    const photoPreview = document.getElementById('photo-preview');
    const cropModal = document.getElementById('crop-modal');
    const cropViewport = document.getElementById('crop-viewport');
    const cropImg = document.getElementById('crop-image');
    const zoomSlider = document.getElementById('zoom-slider');
    const recropBtn = document.getElementById('recrop-btn');

    let scale = 1, offsetX = 0, offsetY = 0;
    let isDragging = false, startX = 0, startY = 0;
    let rawImageSrc = null;
    const VIEWPORT_W = 260;
    const VIEWPORT_H = 320;

    function applyTransform() {
        cropImg.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
    }

    window.resetFraming = () => {
        const naturalW = cropImg.naturalWidth;
        const naturalH = cropImg.naturalHeight;
        const fitScale = Math.max(VIEWPORT_W / naturalW, VIEWPORT_H / naturalH);
        scale = fitScale;
        offsetX = (VIEWPORT_W - naturalW * scale) / 2;
        offsetY = (VIEWPORT_H - naturalH * scale) / 2;
        zoomSlider.value = Math.round(scale * 100);
        applyTransform();
    };

    function openCropModal(src) {
        rawImageSrc = src;
        cropImg.src = src;
        cropImg.onload = () => {
            resetFraming();
        };
        cropModal.style.display = 'flex';
    }

    // Drag (Mouse)
    cropViewport.addEventListener('mousedown', (e) => {
        isDragging = true; startX = e.clientX - offsetX; startY = e.clientY - offsetY;
        cropViewport.style.cursor = 'grabbing';
    });
    window.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        offsetX = e.clientX - startX; offsetY = e.clientY - startY;
        applyTransform();
    });
    window.addEventListener('mouseup', () => { isDragging = false; cropViewport.style.cursor = 'grab'; });

    // Drag (Touch)
    cropViewport.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) {
            isDragging = true;
            startX = e.touches[0].clientX - offsetX;
            startY = e.touches[0].clientY - offsetY;
        }
    }, { passive: true });
    window.addEventListener('touchmove', (e) => {
        if (!isDragging || e.touches.length !== 1) return;
        offsetX = e.touches[0].clientX - startX;
        offsetY = e.touches[0].clientY - startY;
        applyTransform();
    }, { passive: true });
    window.addEventListener('touchend', () => { isDragging = false; });

    // Zoom via scroll wheel
    cropViewport.addEventListener('wheel', (e) => {
        e.preventDefault();
        scale = Math.max(0.01, Math.min(5, scale - e.deltaY * 0.002));
        zoomSlider.value = Math.round(scale * 100);
        applyTransform();
    }, { passive: false });

    // Zoom via slider
    if (zoomSlider) {
        zoomSlider.addEventListener('input', () => {
            scale = parseInt(zoomSlider.value) / 100;
            applyTransform();
        });
    }

    // Confirmation logic for update vs initial registration
    document.getElementById('crop-confirm-btn')?.addEventListener('click', async () => {
        const img = new Image();
        img.src = rawImageSrc;
        img.onload = async () => {
            const canvas = document.createElement('canvas');
            const MAX_H = 1200;
            const targetW = Math.round(MAX_H * (VIEWPORT_W / VIEWPORT_H));
            const targetH = MAX_H;
            canvas.width = targetW;
            canvas.height = targetH;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = "#000"; 
            ctx.fillRect(0, 0, targetW, targetH);
            const ratio = targetH / VIEWPORT_H;
            ctx.drawImage(img, offsetX * ratio, offsetY * ratio, img.naturalWidth * scale * ratio, img.naturalHeight * scale * ratio);
            
            const base64 = canvas.toDataURL('image/jpeg', 0.8);
            
            if (currentUpdateDocId) {
                // Update mode
                const btn = document.getElementById('crop-confirm-btn');
                btn.disabled = true;
                btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Updating...';
                try {
                    await db.collection('participants').doc(currentUpdateDocId).update({
                        photoBase64: base64,
                        photoUpdatedAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                    alert("✅ Photo updated successfully! Re-checking status...");
                    cropModal.style.display = 'none';
                    checkStatus(); // Refresh the view
                } catch(e) { alert("Error: " + e.message); }
                btn.disabled = false;
                btn.innerHTML = '<i class="fa-solid fa-check"></i> Confirm Frame';
            } else {
                // Initial registration mode
                compressedPhotoBase64 = base64;
                photoPreview.src = compressedPhotoBase64;
                photoPreviewContainer.style.display = 'block';
                cropModal.style.display = 'none';
            }
        };
    });

    window.startPhotoUpdate = (docId) => {
        currentUpdateDocId = docId;
        // Trigger file input
        const hiddenInput = document.createElement('input');
        hiddenInput.type = 'file';
        hiddenInput.accept = 'image/*';
        hiddenInput.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => openCropModal(ev.target.result);
            reader.readAsDataURL(file);
        };
        hiddenInput.click();
    };

    // Cancel crop
    document.getElementById('crop-cancel-btn')?.addEventListener('click', () => {
        cropModal.style.display = 'none';
        if (!compressedPhotoBase64) photoInput.value = ''; // clear file if no crop done
    });

    // Re-crop button
    if (recropBtn) recropBtn.addEventListener('click', () => openCropModal(rawImageSrc));

    // Open modal when file chosen
    if (photoInput) {
        photoInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => openCropModal(ev.target.result);
            reader.readAsDataURL(file);
        });
    }

    let currentUpdateDocId = null;

    if(form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            if (!compressedPhotoBase64) {
                alert("Please select a profile photo.");
                return;
            }
            
            const originalText = submitBtn.innerHTML;
            submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processing...';
            submitBtn.disabled = true;
            formMessage.innerHTML = '';
            formMessage.className = 'form-message';

            const email = document.getElementById('reg-email').value.trim().toLowerCase();
            
            // Check for duplicate registration
            try {
                const existing = await db.collection("participants").where("email", "==", email).get();
                if (!existing.empty) {
                    alert("This email is already registered! If you need to update your details, please contact Hello Machi FM support.");
                    submitBtn.innerHTML = originalText;
                    submitBtn.disabled = false;
                    return;
                }
            } catch (err) {
                console.error("Duplicate check failed:", err);
            }

            let finalAuditionLink = '';
            const audioInput = document.getElementById('reg-audio');

            // Handle Cloudinary Audio Upload if a file is selected
            if (audioInput && audioInput.files.length > 0) {
                const audioFile = audioInput.files[0];
                
                // 5MB Limit
                if (audioFile.size > 5 * 1024 * 1024) {
                    alert("The audio file must be less than 5MB. Please upload a smaller file.");
                    submitBtn.innerHTML = originalText;
                    submitBtn.disabled = false;
                    return;
                }

                submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Uploading MP3...';
                
                const formData = new FormData();
                formData.append('file', audioFile);
                formData.append('upload_preset', 'dijhnvmtt');

                try {
                    const uploadRes = await fetch('https://api.cloudinary.com/v1_1/dijhnvmtt/video/upload', {
                        method: 'POST',
                        body: formData
                    });
                    
                    const uploadData = await uploadRes.json();
                    
                    if (uploadData.secure_url) {
                        finalAuditionLink = uploadData.secure_url;
                    } else {
                        throw new Error("Cloudinary upload failed.");
                    }
                } catch (error) {
                    alert("Audio Upload Failed: " + error.message);
                    submitBtn.innerHTML = originalText;
                    submitBtn.disabled = false;
                    return;
                }
            } else {
                alert("Please upload your audition MP3 file.");
                submitBtn.innerHTML = originalText;
                submitBtn.disabled = false;
                return;
            }

            submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving Registration...';

            const participantData = {
                name: document.getElementById('reg-name').value,
                email: email,
                phone: document.getElementById('reg-phone').value,
                city: document.getElementById('reg-city').value,
                address: document.getElementById('reg-address').value,
                auditionLink: finalAuditionLink,
                bio: document.getElementById('reg-bio').value,
                photoBase64: compressedPhotoBase64,
                registeredAt: firebase.firestore.FieldValue.serverTimestamp(),
                status: 'pending',
                isRevealed: false,
                votes: 0,
                judgeScore: 0
            };

            try {
                // Add to Firestore
                await db.collection("participants").add(participantData);
                
                // Show Success
                formMessage.innerHTML = '🎉 Registration Successful! We will contact you soon.';
                formMessage.className = 'form-message success';
                form.reset();
                // Reset crop state
                compressedPhotoBase64 = null;
                rawImageSrc = null;
                if (photoPreviewContainer) photoPreviewContainer.style.display = 'none';
                loadParticipants(); // Refresh the list
            } catch (error) {
                console.error("Error adding document: ", error);
                formMessage.innerHTML = '❌ An error occurred. Please try again. Check console for details.';
                formMessage.className = 'form-message error';
            } finally {
                // Restore button
                submitBtn.innerHTML = originalText;
                submitBtn.disabled = false;
            }
        });
    }

    // --- Voting & Auth Logic ---
    let currentUser = null;
    const provider = new firebase.auth.GoogleAuthProvider();
    
    const loginBtn = document.getElementById('google-login-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const userInfo = document.getElementById('user-info');
    const userName = document.getElementById('user-name');
    const userAvatar = document.getElementById('user-avatar');
    const participantsGrid = document.getElementById('participants-grid');

    // Auth State Observer
    if(auth) {
        auth.onAuthStateChanged((user) => {
            currentUser = user;
            if (user) {
                // User is signed in
                loginBtn.style.display = 'none';
                userInfo.style.display = 'flex';
                userName.textContent = user.displayName;
                userAvatar.src = user.photoURL || 'https://via.placeholder.com/40';
            } else {
                // User is signed out
                loginBtn.style.display = 'inline-flex';
                userInfo.style.display = 'none';
            }
            // Re-render participants to update button states based on auth
            loadParticipants();
        });

        if(loginBtn) {
            loginBtn.addEventListener('click', () => {
                auth.signInWithPopup(provider).catch(error => {
                    console.error("Login Error:", error);
                    alert("Failed to sign in. Please try again.");
                });
            });
        }

        if(logoutBtn) {
            logoutBtn.addEventListener('click', () => {
                auth.signOut();
            });
        }
    }

    // Fetch and Render Participants
    async function loadParticipants() {
        if(!participantsGrid) return;
        
        try {
            // ONLY load participants who have been approved by the admin
            const querySnapshot = await db.collection("participants").where("status", "in", ["approved", "Round 1", "Round 2", "Round 3", "Round 4", "Final"]).get();
            participantsGrid.innerHTML = ''; // Clear loading spinner
            
            if (querySnapshot.empty) {
                participantsGrid.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; color: var(--text-muted);">No participants registered yet. Check back soon!</div>';
                return;
            }

            querySnapshot.forEach((docSnap) => {
                const data = docSnap.data();
                const id = docSnap.id;
                const votes = data.votes || 0;
                
                // Get user's vote history from local storage
                const hasVoted = localStorage.getItem(`voted_${id}`) === 'true';

                const card = document.createElement('div');
                card.className = 'participant-card';
                card.innerHTML = `
                    ${data.photoBase64 ? `<img src="${data.photoBase64}" class="participant-avatar-img" alt="${data.name}">` : `<div class="participant-avatar">${data.name.charAt(0).toUpperCase()}</div>`}
                    <h3 class="participant-name">${data.name}</h3>
                    <div class="participant-bio">${data.bio ? data.bio.substring(0, 60) + '...' : 'Aspiring Singer'}</div>
                <div style="font-family:monospace; font-size:0.8rem; color:var(--primary); margin-top:5px; font-weight:bold;">${data.participantId || ''}</div>
                
                ${data.auditionLink ? `
                    <div class="audio-player-container" style="margin-top:15px; background:rgba(255,255,255,0.05); padding:10px; border-radius:12px;">
                        <audio id="audio-${id}" src="${data.auditionLink}" preload="none"></audio>
                        <button onclick="toggleCardAudio('${id}')" class="btn btn-secondary" style="width:100%; font-size:0.8rem; padding:8px; border:1px solid rgba(255,255,255,0.1);">
                            <i class="fa-solid fa-play" id="icon-${id}"></i> LISTEN SONG
                        </button>
                    </div>
                ` : ''}

                <div class="vote-stats"><i class="fa-solid fa-heart"></i> <span id="vote-count-${id}">${votes}</span></div>
                    <button class="vote-btn ${hasVoted ? 'voted' : ''}" data-id="${id}" ${(!currentUser || hasVoted) ? 'disabled' : ''}>
                        ${!currentUser ? 'Login to Vote' : (hasVoted ? 'Voted' : 'Vote Now')}
                    </button>
                `;
                participantsGrid.appendChild(card);
            });
    // --- AUDIO CONTROL ---
    let currentPlayingId = null;
    window.toggleCardAudio = (id) => {
        const audio = document.getElementById(`audio-${id}`);
        const icon = document.getElementById(`icon-${id}`);

        if (currentPlayingId && currentPlayingId !== id) {
            const prevAudio = document.getElementById(`audio-${currentPlayingId}`);
            const prevIcon = document.getElementById(`icon-${currentPlayingId}`);
            if (prevAudio) { prevAudio.pause(); prevIcon.className = 'fa-solid fa-play'; }
        }

        if (audio.paused) {
            audio.play();
            icon.className = 'fa-solid fa-pause';
            currentPlayingId = id;
        } else {
            audio.pause();
            icon.className = 'fa-solid fa-play';
        }
        
        audio.onended = () => { icon.className = 'fa-solid fa-play'; currentPlayingId = null; };
    };

    // --- SHOUTOUTS LOGIC ---
    window.sendShoutout = async () => {
        const to = getEl('shoutout-to').value;
        const msg = getEl('shoutout-msg').value;
        if(!to || !msg) return alert("Please fill both fields");
        
        try {
            await db.collection('shoutouts').add({
                to: to,
                message: msg,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });
            getEl('shoutout-to').value = '';
            getEl('shoutout-msg').value = '';
            getEl('shoutout-feedback').style.display = 'block';
            setTimeout(() => getEl('shoutout-feedback').style.display = 'none', 3000);
        } catch(e) { console.error(e); }
    };

            // Attach vote listeners
            document.querySelectorAll('.vote-btn').forEach(btn => {
                btn.addEventListener('click', handleVote);
            });

        } catch (error) {
            console.error("Error fetching participants: ", error);
            participantsGrid.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; color: red;">Error loading participants.</div>';
        }
    }

    // Handle Vote Click
    async function handleVote(e) {
        if (!currentUser) return alert("Please sign in to vote!");
        
        const btn = e.target;
        const participantId = btn.getAttribute('data-id');
        
        if (localStorage.getItem(`voted_${participantId}`) === 'true') {
            return alert("You have already voted for this participant!");
        }

        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
        btn.disabled = true;

        const participantRef = db.collection("participants").doc(participantId);

        try {
            await db.runTransaction(async (transaction) => {
                const sfDoc = await transaction.get(participantRef);
                if (!sfDoc.exists) {
                    throw "Document does not exist!";
                }
                const newVotes = (sfDoc.data().votes || 0) + 1;
                transaction.update(participantRef, { votes: newVotes });
                return newVotes;
            });

            // Update UI
            const countSpan = document.getElementById(`vote-count-${participantId}`);
            countSpan.textContent = parseInt(countSpan.textContent) + 1;
            
            // Mark as voted locally
            localStorage.setItem(`voted_${participantId}`, 'true');
            btn.textContent = 'Voted';
            btn.classList.add('voted');

            // Log detailed vote history
            try {
                await db.collection('votes_history').add({
                    participantId: participantId,
                    voterEmail: currentUser.email || 'Unknown',
                    voterName: currentUser.displayName || 'Anonymous',
                    timestamp: firebase.firestore.FieldValue.serverTimestamp()
                });
            } catch(e) {
                console.error("Failed to log vote history", e);
            }

        } catch (error) {
            console.error("Transaction failed: ", error);
            alert("Failed to register vote. Please try again.");
            btn.textContent = 'Vote Now';
            btn.disabled = false;
        }
    }
});

// --- Status Checker Logic ---
async function checkStatus() {
    const phone = document.getElementById('status-phone').value.trim();
    const resultDiv = document.getElementById('status-result');
    
    if (!phone) {
        alert("Please enter your phone number.");
        return;
    }

    resultDiv.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Checking status...';
    resultDiv.style.display = 'block';

    try {
        const querySnapshot = await db.collection("participants").where("phone", "==", phone).get();
        
        if (querySnapshot.empty) {
            resultDiv.innerHTML = `
                <div style="padding: 20px; background: rgba(220, 53, 69, 0.1); border: 1px solid #dc3545; border-radius: 12px; color: #dc3545; animation: shake 0.5s;">
                    <i class="fa-solid fa-circle-xmark fa-2x"></i><br>
                    <strong style="display:block; margin-top:10px;">No registration found!</strong>
                    <p style="font-size:0.9rem; margin-top:5px;">Please make sure you entered the correct WhatsApp number used during registration.</p>
                </div>
            `;
            return;
        }

        const data = querySnapshot.docs[0].data();
        const status = data.status || 'pending';
        const isRevealed = data.isRevealed !== false; // Default to true if not specified, but we set it to false now
        
        // Remove the isRevealed block to always show the status to the participant
        // if (!isRevealed && status !== 'pending') { ... }

        if (status === 'pending') {
            resultDiv.innerHTML = `
                <div style="padding: 20px; background: rgba(0, 210, 255, 0.05); border: 1px solid var(--primary); border-radius: 12px; text-align:center;">
                    <i class="fa-solid fa-hourglass-half fa-2x" style="color: var(--primary);"></i><br>
                    <h3 class="mt-2">Application Received</h3>
                    <p>Hi <strong>${data.name}</strong>, your application is currently under review by our judges. We will notify you once the selection is made!</p>
                    
                    <div style="margin-top:20px; padding:15px; background:rgba(255,255,255,0.05); border-radius:10px;">
                        <img src="${data.photoBase64}" style="width:100px; height:120px; border-radius:10px; object-fit:contain; border:2px solid #444; background:#000; margin-bottom:10px;">
                        <p style="font-size:0.8rem; color:#888;">Current Profile Photo</p>
                        <button onclick="startPhotoUpdate('${querySnapshot.docs[0].id}')" class="btn btn-secondary" style="font-size:0.8rem; padding:6px 15px; margin-top:10px;">Update Photo</button>
                    </div>
                </div>
            `;
        } else if (status === 'rejected' || status === 'Eliminated') {
            resultDiv.innerHTML = `
                <div style="padding: 20px; background: rgba(255, 255, 255, 0.05); border: 1px solid #444; border-radius: 12px;">
                    <i class="fa-solid fa-heart fa-2x" style="color: #666;"></i><br>
                    <h3 class="mt-2">Not Selected</h3>
                    <p>Thank you for participating, <strong>${data.name}</strong>. Unfortunately, you didn't make it to the next round this time. Keep singing and keep the passion alive!</p>
                </div>
            `;
        } else {
            // SELECTED / ROUND 1 / ROUND 2 etc. -> SHOW GOLDEN TICKET
            resultDiv.innerHTML = `
                <div id="golden-ticket" style="padding: 40px; background: linear-gradient(135deg, #FFD700 0%, #B8860B 100%); border-radius: 20px; color: black; box-shadow: 0 0 50px rgba(255, 215, 0, 0.5); position: relative; overflow: hidden; animation: goldenPop 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275); text-align: center;">
                    <div style="position: absolute; top: -20px; right: -20px; font-size: 8rem; opacity: 0.1; transform: rotate(15deg);"><i class="fa-solid fa-trophy"></i></div>
                    <div style="position: absolute; bottom: -20px; left: -20px; font-size: 8rem; opacity: 0.1; transform: rotate(-15deg);"><i class="fa-solid fa-microphone"></i></div>
                    
                    <div style="margin: 20px 0;">
                        <img src="${data.photoBase64 || 'logo.jpg'}" style="width: 150px; height: 180px; border-radius: 15px; border: 4px solid white; background: #000; object-fit: contain; box-shadow: 0 10px 20px rgba(0,0,0,0.3);">
                    </div>

                    <div class="no-print" style="margin-bottom: 20px;">
                        <button onclick="startPhotoUpdate('${querySnapshot.docs[0].id}')" style="background:rgba(0,0,0,0.1); border:1px solid rgba(0,0,0,0.2); color:black; padding:5px 15px; border-radius:20px; font-size:0.75rem; cursor:pointer; font-weight:bold;">Re-upload Photo</button>
                    </div>

                    <i class="fa-solid fa-star fa-3x" style="color: white; filter: drop-shadow(0 0 10px rgba(255,255,255,0.8));"></i>
                    <h2 style="font-size: 2.2rem; margin: 10px 0; font-family: 'Outfit', sans-serif; font-weight: 900; letter-spacing: 2px;">GOLDEN TICKET</h2>
                    
                    <div style="font-family: monospace; font-weight: bold; background: black; color: #FFD700; display: inline-block; padding: 5px 20px; border-radius: 5px; margin-bottom: 15px; font-size: 1.1rem; letter-spacing: 1px;">ID: ${data.participantId || '---'}</div>
                    
                    <p style="font-size: 1.4rem; font-weight: 900; color: #000; margin-bottom: 5px;">${data.name.toUpperCase()}</p>
                    <p style="font-size: 0.9rem; opacity: 0.8; margin-bottom: 20px;">${data.city || 'Tamil Nadu'}</p>
                    
                    <div style="margin: 10px 0 25px; padding: 12px 25px; background: rgba(0,0,0,0.1); border: 2px dashed rgba(0,0,0,0.2); border-radius: 12px; display: inline-block;">
                        <span style="letter-spacing: 2px; font-weight: 900; font-size: 1.1rem;">PROMOTED TO: ${status.toUpperCase()}</span>
                    </div>
                    
                    <div style="border-top: 1px solid rgba(0,0,0,0.1); padding-top: 20px; margin-top: 10px;">
                        <p style="font-size: 0.85rem; font-weight: bold; opacity: 0.7;">HELLO MACHI SUPER SINGER 2026</p>
                    </div>
                    
                    <div class="no-print" style="margin-top: 30px;">
                        <button onclick="downloadTicket()" class="btn" style="background: black; color: white; border: none; padding: 12px 30px; border-radius: 50px; font-weight: 900; cursor: pointer; transition: transform 0.2s;">
                            <i class="fa-solid fa-download"></i> DOWNLOAD TICKET
                        </button>
                    </div>
                </div>
                <style>
                    @keyframes goldenPop {
                        0% { transform: scale(0.5) translateY(50px); opacity: 0; }
                        100% { transform: scale(1) translateY(0); opacity: 1; }
                    }
                    @keyframes shake {
                        0%, 100% { transform: translateX(0); }
                        25% { transform: translateX(-10px); }
                        75% { transform: translateX(10px); }
                    }
                    @media print {
                        .no-print { display: none !important; }
                        body * { visibility: hidden; }
                        #golden-ticket, #golden-ticket * { visibility: visible; }
                        #golden-ticket { position: absolute; left: 0; top: 0; width: 100%; border: none; box-shadow: none; }
                    }
                </style>
            `;
        }

    } catch (error) {
        console.error("Error checking status: ", error);
        resultDiv.innerHTML = '❌ Error checking status. Please try again.';
    }
}

// --- DOWNLOAD TICKET FUNCTION ---
window.downloadTicket = () => {
    // We use a high-quality print approach with ticket-specific styling
    // This allows the user to 'Save as PDF' which is the standard way to download official tickets.
    window.print();
};
