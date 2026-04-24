document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('registration-form');
    const submitBtn = document.getElementById('submit-registration');
    const formMessage = document.getElementById('form-message');

    let compressedPhotoBase64 = null;
    const photoInput = document.getElementById('reg-photo');
    const photoPreviewContainer = document.getElementById('photo-preview-container');
    const photoPreview = document.getElementById('photo-preview');

    if (photoInput) {
        photoInput.addEventListener('change', function(e) {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = function(event) {
                const img = new Image();
                img.onload = function() {
                    const canvas = document.createElement('canvas');
                    const MAX_WIDTH = 250;
                    const MAX_HEIGHT = 250;
                    let width = img.width;
                    let height = img.height;

                    if (width > height) {
                        if (width > MAX_WIDTH) {
                            height *= MAX_WIDTH / width;
                            width = MAX_WIDTH;
                        }
                    } else {
                        if (height > MAX_HEIGHT) {
                            width *= MAX_HEIGHT / height;
                            height = MAX_HEIGHT;
                        }
                    }

                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);
                    
                    compressedPhotoBase64 = canvas.toDataURL('image/jpeg', 0.6); // Compress to 60% quality JPEG
                    photoPreview.src = compressedPhotoBase64;
                    photoPreviewContainer.style.display = 'block';
                }
                img.src = event.target.result;
            }
            reader.readAsDataURL(file);
        });
    }

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

            let finalAuditionLink = document.getElementById('reg-link').value || '';
            const audioInput = document.getElementById('reg-audio');

            // Handle Cloudinary Audio Upload if a file is selected
            if (audioInput && audioInput.files.length > 0) {
                const audioFile = audioInput.files[0];
                
                // 5MB Limit
                if (audioFile.size > 5 * 1024 * 1024) {
                    alert("The audio file must be less than 5MB. Please upload a smaller file or paste a link instead.");
                    submitBtn.innerHTML = originalText;
                    submitBtn.disabled = false;
                    return;
                }

                submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Uploading MP3...';
                
                const formData = new FormData();
                formData.append('file', audioFile);
                formData.append('upload_preset', 'dijhnvmtt'); // Using provided string as preset

                try {
                    const uploadRes = await fetch('https://api.cloudinary.com/v1_1/dijhnvmtt/video/upload', {
                        method: 'POST',
                        body: formData
                    });
                    
                    const uploadData = await uploadRes.json();
                    
                    if (uploadData.secure_url) {
                        finalAuditionLink = uploadData.secure_url;
                    } else {
                        console.error("Cloudinary Error:", uploadData);
                        throw new Error("Invalid Upload Preset. Did you make an Unsigned preset named 'dijhnvmtt'?");
                    }
                } catch (error) {
                    alert("Audio Upload Failed: " + error.message);
                    submitBtn.innerHTML = originalText;
                    submitBtn.disabled = false;
                    return;
                }
            }

            submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving Registration...';

            const participantData = {
                name: document.getElementById('reg-name').value,
                email: document.getElementById('reg-email').value,
                phone: document.getElementById('reg-phone').value,
                auditionLink: finalAuditionLink,
                bio: document.getElementById('reg-bio').value,
                photoBase64: compressedPhotoBase64,
                registeredAt: firebase.firestore.FieldValue.serverTimestamp(),
                status: 'pending',
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
                    <div class="vote-stats"><i class="fa-solid fa-heart"></i> <span id="vote-count-${id}">${votes}</span></div>
                    <button class="vote-btn ${hasVoted ? 'voted' : ''}" data-id="${id}" ${(!currentUser || hasVoted) ? 'disabled' : ''}>
                        ${!currentUser ? 'Login to Vote' : (hasVoted ? 'Voted' : 'Vote Now')}
                    </button>
                    ${data.auditionLink ? `<a href="${data.auditionLink}" target="_blank" style="display:block; margin-top:15px; color:var(--primary); font-size:0.9rem; text-decoration:none;">Watch Audition <i class="fa-solid fa-arrow-up-right-from-square"></i></a>` : ''}
                `;
                participantsGrid.appendChild(card);
            });

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

        } catch (error) {
            console.error("Transaction failed: ", error);
            alert("Failed to register vote. Please try again.");
            btn.textContent = 'Vote Now';
            btn.disabled = false;
        }
    }
});
