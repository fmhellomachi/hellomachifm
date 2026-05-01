document.addEventListener('DOMContentLoaded', () => {
    // --- SAFE SELECTORS ---
    const getEl = (id) => document.getElementById(id);
    
    const loginBtn = getEl('admin-login-btn');
    const logoutBtn = getEl('admin-logout-btn');
    const adminUserInfo = getEl('admin-user-info');
    const adminName = getEl('admin-name');
    const adminContent = getEl('admin-content');
    const lockedContent = getEl('locked-content');
    const tableBody = getEl('participants-table-body');
    const masterAdminSection = getEl('master-admin-section');
    const adminListBody = getEl('admin-list-body');

    // ===== PROFESSIONAL PHOTO FRAMER LOGIC =====
    let editPhotoBase64 = null;
    const editPhotoFile = getEl('edit-photo-file');
    const editPhotoPreview = getEl('edit-photo-preview');
    const cropModal = getEl('crop-modal');
    const cropViewport = getEl('crop-viewport');
    const cropImg = getEl('crop-image');
    const zoomSlider = getEl('zoom-slider');
    
    let scale = 1, offsetX = 0, offsetY = 0;
    let isDragging = false, startX = 0, startY = 0;
    let rawImageSrc = null;
    const VIEWPORT_W = 260;
    const VIEWPORT_H = 320;

    function applyTransform() {
        if(cropImg) cropImg.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
    }

    function setScaleCenter(newScale) {
        if (!cropViewport) return;
        const rect = cropViewport.getBoundingClientRect();
        const cx = rect.width / 2;
        const cy = rect.height / 2;
        offsetX = cx - (cx - offsetX) * (newScale / scale);
        offsetY = cy - (cy - offsetY) * (newScale / scale);
        scale = newScale;
        applyTransform();
    }

    window.resetFraming = () => {
        if (!cropImg || !cropViewport) return;
        const rect = cropViewport.getBoundingClientRect();
        const actualVW = rect.width;
        const actualVH = rect.height;
        const naturalW = cropImg.naturalWidth;
        const naturalH = cropImg.naturalHeight;
        
        if (!naturalW || !naturalH) return;
        
        const fitScale = Math.max(actualVW / naturalW, actualVH / naturalH);
        scale = fitScale;
        offsetX = (actualVW - naturalW * scale) / 2;
        offsetY = (actualVH - naturalH * scale) / 2;
        if(zoomSlider) zoomSlider.value = Math.round(scale * 100);
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

    if (cropViewport) {
        cropViewport.addEventListener('mousedown', (e) => {
            isDragging = true; startX = e.clientX - offsetX; startY = e.clientY - offsetY;
            cropViewport.style.cursor = 'grabbing';
        });
        window.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            offsetX = e.clientX - startX; offsetY = e.clientY - startY;
            applyTransform();
        });
        window.addEventListener('mouseup', () => { isDragging = false; if(cropViewport) cropViewport.style.cursor = 'grab'; });
        
        // Zoom via scroll wheel
        cropViewport.addEventListener('wheel', (e) => {
            e.preventDefault();
            const newScale = Math.max(0.01, Math.min(5, scale - e.deltaY * 0.002));
            if(zoomSlider) zoomSlider.value = Math.round(newScale * 100);
            setScaleCenter(newScale);
        }, { passive: false });

        // Pinch-to-zoom for mobile
        let initialPinchDist = 0;
        let initialScale = 1;

        cropViewport.addEventListener('touchstart', (e) => {
            if (e.touches.length === 2) {
                initialPinchDist = Math.hypot(
                    e.touches[0].pageX - e.touches[1].pageX,
                    e.touches[0].pageY - e.touches[1].pageY
                );
                initialScale = scale;
            }
        }, { passive: true });

        cropViewport.addEventListener('touchmove', (e) => {
            if (e.touches.length === 2) {
                e.preventDefault();
                const dist = Math.hypot(
                    e.touches[0].pageX - e.touches[1].pageX,
                    e.touches[0].pageY - e.touches[1].pageY
                );
                const ratio = dist / initialPinchDist;
                const newScale = Math.max(0.01, Math.min(5, initialScale * ratio));
                if(zoomSlider) zoomSlider.value = Math.round(newScale * 100);
                setScaleCenter(newScale);
            }
        }, { passive: false });
    }

    if (zoomSlider) {
        zoomSlider.addEventListener('input', () => {
            const newScale = parseInt(zoomSlider.value) / 100;
            setScaleCenter(newScale);
        });
    }

    getEl('crop-cancel-btn')?.addEventListener('click', () => {
        cropModal.style.display = 'none';
        if (!editPhotoBase64 && editPhotoFile) editPhotoFile.value = '';
    });

    getEl('crop-confirm-btn')?.addEventListener('click', () => {
        const img = new Image();
        img.src = rawImageSrc;
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const rect = cropViewport.getBoundingClientRect();
            const actualVW = rect.width || VIEWPORT_W;
            const actualVH = rect.height || VIEWPORT_H;

            const MAX_H = 1200;
            const targetW = Math.round(MAX_H * (actualVW / actualVH));
            const targetH = MAX_H;
            canvas.width = targetW;
            canvas.height = targetH;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = "#000"; 
            ctx.fillRect(0, 0, targetW, targetH);
            const ratio = targetH / actualVH;
            ctx.drawImage(img, offsetX * ratio, offsetY * ratio, img.naturalWidth * scale * ratio, img.naturalHeight * scale * ratio);
            
            editPhotoBase64 = canvas.toDataURL('image/jpeg', 0.8);
            if (editPhotoPreview) {
                editPhotoPreview.src = editPhotoBase64;
                editPhotoPreview.style.display = 'block';
            }
            cropModal.style.display = 'none';
        };
    });

    const provider = new firebase.auth.GoogleAuthProvider();
    let currentFilter = 'all';

    const AUTHORIZED_EMAILS = [
        'fmhellomachi@gmail.com',
        'admin@hellomachi.com'
    ];

    // Ensure Firebase is ready
    if (!firebase || !auth || !db) {
        console.error("Firebase not initialized correctly.");
        return;
    }

    // Declarations for real-time listeners
    let judgeScoresUnsub = null;
    let audienceScoresUnsub = null;
    let currentJudgeSingerId = null;
    let liveStateUnsub = null;

    if (loginBtn) {
        loginBtn.addEventListener('click', () => {
            auth.signInWithPopup(provider).catch(error => {
                if (error.code === 'auth/popup-blocked') {
                    return auth.signInWithRedirect(provider);
                }
                console.error("Login Error:", error);
                alert("Login failed: " + error.message);
            });
        });
    }
    if (logoutBtn) logoutBtn.addEventListener('click', () => auth.signOut());

    window.switchMainTab = (tabId) => {
        console.log("Switching to tab:", tabId);
        
        // Panels to toggle
        const panels = {
            'participants': getEl('view-participants'),
            'cms': getEl('view-cms'),
            'admins': getEl('master-admin-section'),
            'live-control': getEl('live-control-panel'),
            'history': getEl('view-history'),
            'wall-of-fame': getEl('view-wall-of-fame'),
            'leaderboard': getEl('leaderboard-panel')
        };

        // Hide all
        Object.values(panels).forEach(p => { if(p) p.style.display = 'none'; });

        // Show target
        if (panels[tabId]) {
            panels[tabId].style.display = 'block';
            if (tabId === 'participants') fetchAdminData();
            if (tabId === 'cms') fetchCMS();
            if (tabId === 'admins') fetchAdminsList();
            if (tabId === 'live-control') { fetchParticipantsForLive(); listenToLiveStats(); }
            if (tabId === 'history') fetchHistory();
            if (tabId === 'wall-of-fame') fetchWofCandidates();
            if (tabId === 'leaderboard') calculateLeaderboard();
        }

        // Update Button States
        document.querySelectorAll('#admin-content .btn, #admin-content li.btn').forEach(btn => {
            btn.classList.remove('btn-primary');
            btn.classList.add('btn-secondary');
        });

        // Find the active tab button
        const activeBtn = Array.from(document.querySelectorAll('#admin-content li, #admin-content .btn'))
            .find(el => el.getAttribute('onclick') && el.getAttribute('onclick').includes(tabId));
        if (activeBtn) {
            activeBtn.classList.add('btn-primary');
            activeBtn.classList.remove('btn-secondary');
        }
    };

    // --- Live Control Room Logic ---
    let allLiveParticipants = []; // cache all participants

    function populateSingerDropdowns(round) {
        const s1 = getEl('live-singer-1');
        const s2 = getEl('live-singer-2');
        if (!s1 || !s2) return;

        // Filter to only participants in the selected round
        const filtered = allLiveParticipants.filter(p => p.status === round);

        let opts = '<option value="">-- Select Participant --</option>';
        filtered.forEach(p => {
            opts += `<option value="${p.id}">${p.name}</option>`;
        });

        if (filtered.length === 0) {
            opts = `<option value="">-- No participants in ${round} --</option>`;
        }

        s1.innerHTML = opts;
        s2.innerHTML = opts.replace('-- Select Participant --', '-- Optional Secondary --');
    }

    async function fetchParticipantsForLive() {
        const s1 = getEl('live-singer-1');
        const s2 = getEl('live-singer-2');
        const roundSel = getEl('live-round');
        if (!s1 || !s2) return;

        s1.innerHTML = '<option value="">Loading...</option>';
        s2.innerHTML = '<option value="">Loading...</option>';

        try {
            // Load all participants into cache
            const snap = await db.collection('participants').orderBy('name', 'asc').get();
            allLiveParticipants = [];
            snap.forEach(doc => allLiveParticipants.push({ id: doc.id, ...doc.data() }));

            // Restore saved live state
            const stateDoc = await db.collection('live_state').doc('current').get();
            let savedRound = 'Round 1';
            let savedS1 = '';
            let savedS2 = '';
            // Set round dropdown to saved value
            if (roundSel) roundSel.value = savedRound;

            // Populate singers for that round
            populateSingerDropdowns(savedRound);

            // Restore previous selections if still valid for this round
            if (savedS1) s1.value = savedS1;
            if (savedS2) s2.value = savedS2;

            // Update UI toggles for voting
            if (stateDoc.exists) {
                const state = stateDoc.data();
                updateVotingUI(state.votingOpen1, 1);
                updateVotingUI(state.votingOpen2, 2);
                const s2Ctrl = getEl('singer-2-voting-ctrl');
                if(s2Ctrl) s2Ctrl.style.display = state.singer2 ? 'block' : 'none';
            }

            // Re-populate singers whenever round changes
            if (roundSel) {
                roundSel.onchange = () => {
                    populateSingerDropdowns(roundSel.value);
                };
            }

            // ✅ Auto-load persistent judges into the scoring panel
            await loadJudgesIntoPanel();

        } catch (err) { console.error(err); }
    }

    // Load saved persistent judges into the Live Control scoring panel
    async function loadJudgesIntoPanel() {
        const container = getEl('judge-rows');
        if (!container) return;
        try {
            const doc = await db.collection('config').doc('judges').get();
            const judges = (doc.exists && doc.data().list) ? doc.data().list : [];
            if (judges.length === 0) {
                container.innerHTML = '<div style="color:#888;font-size:0.8rem;text-align:center;padding:10px;">No judges added yet. Use the input below to add judge names.</div>';
                return;
            }
            container.innerHTML = '';
            judges.forEach(name => {
                const row = document.createElement('div');
                row.style.cssText = 'display:flex;align-items:center;gap:10px;background:#0d0d18;border:1px solid #2a2a3a;border-radius:10px;padding:10px 14px;';
                row.innerHTML = `
                    <span style="flex:1;font-size:0.9rem;font-weight:700;color:#FFD700;"><i class="fa-solid fa-gavel" style="margin-right:6px;font-size:0.75rem;"></i>${name}</span>
                    <div style="display:flex;align-items:center;gap:6px;">
                        <input type="number" min="0" max="10" step="0.5" value="" placeholder="—"
                            data-judge="${name}"
                            style="width:75px;background:#111;border:1px solid #FFD700;color:#FFD700;padding:8px;border-radius:8px;font-size:1.1rem;font-weight:900;text-align:center;">
                        <span style="font-size:0.7rem;color:#555;">/10</span>
                    </div>
                    <button onclick="this.parentElement.remove()" style="background:transparent;border:1px solid #333;color:#555;padding:4px 8px;border-radius:6px;cursor:pointer;font-size:0.8rem;">✕</button>
                `;
                container.appendChild(row);
            });
            // Also cache them for quick score
            if (typeof persistentJudgesCache !== 'undefined') {
                persistentJudgesCache = judges;
            }
        } catch(e) { console.error('loadJudgesIntoPanel error:', e); }
    }

    window.updateLiveState = async (status) => {
        const round = getEl('live-round').value;
        const s1 = getEl('live-singer-1').value;
        const s2 = getEl('live-singer-2').value;

        if (!s1 && status === 'on-air') { alert("Select a singer!"); return; }

        try {
            await db.collection('live_state').doc('current').set({
                status: status, round: round, singer1: s1, singer2: s2,
                votingOpen1: false, votingOpen2: false,
                scoreRevealStep: 0, updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            
            // Clear current live votes
            const vSnap = await db.collection('live_votes').get();
            const batch = db.batch();
            vSnap.docs.forEach(doc => batch.delete(doc.ref));
            await batch.commit();

            alert("Stage Updated! Scores reset.");
            updateVotingUI(false, 1);
            updateVotingUI(false, 2);
            
            // Show/Hide Singer 2 controls based on presence
            const s2Ctrl = getEl('singer-2-voting-ctrl');
            if(s2Ctrl) s2Ctrl.style.display = s2 ? 'block' : 'none';

        } catch (err) { console.error(err); }
    };

    window.toggleVoting = async (isOpen, singerIndex) => {
        try {
            const updates = {};
            updates[`votingOpen${singerIndex}`] = isOpen;
            await db.collection('live_state').doc('current').update(updates);
            updateVotingUI(isOpen, singerIndex);
        } catch (err) { console.error(err); }
    };

    window.resetLiveState = () => { if(confirm("Reset Stage?")) updateLiveState('idle'); };

    function updateVotingUI(isOpen, singerIndex) {
        const statusEl = getEl(`voting-status-${singerIndex}`);
        if(!statusEl) return;
        statusEl.innerHTML = isOpen ? 'Status: <strong style="color:#28a745;">OPEN</strong>' : 'Status: <strong style="color:#dc3545;">CLOSED</strong>';
    }

    let statsUnsub = null;
    function listenToLiveStats() {
        if (statsUnsub) statsUnsub();
        statsUnsub = db.collection('live_votes').onSnapshot(snap => {
            const count = snap.size;
            let total = 0;
            snap.forEach(doc => total += doc.data().score);
            if(getEl('stat-total-votes')) getEl('stat-total-votes').textContent = count;
            if(getEl('stat-avg-score')) getEl('stat-avg-score').textContent = count > 0 ? (total/count).toFixed(1) : "0.0";
        });
    }

    // --- History Logic ---
    let historyAllItems = []; // cache for filter tabs

    window.setHistoryFilter = (filter) => {
        // Update button styles
        ['all','scores','status','votes'].forEach(f => {
            const btn = getEl(`hfilter-${f}`);
            if (!btn) return;
            btn.className = f === filter ? 'btn btn-primary' : 'btn btn-secondary';
        });
        renderHistoryFeed(filter);
    };

    function renderHistoryFeed(filter = 'all') {
        const feed = getEl('history-feed');
        if (!feed) return;

        const items = filter === 'all'
            ? historyAllItems
            : historyAllItems.filter(i => i.type === filter);

        if (items.length === 0) {
            feed.innerHTML = `<div style="text-align:center;padding:40px;color:#555;">No ${filter === 'all' ? '' : filter + ' '}activity found.</div>`;
            return;
        }

        const fmt = (ts) => ts ? ts.toDate().toLocaleString('en-IN', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }) : 'Just now';

        feed.innerHTML = items.map(item => {
            if (item.type === 'scores') {
                // Judge score submission
                const judgeEntries = Object.entries(item.judgeScores || {})
                    .map(([n,v]) => `<span style="background:rgba(255,215,0,0.1);border:1px solid rgba(255,215,0,0.3);padding:2px 8px;border-radius:6px;font-size:0.75rem;"><strong style="color:#FFD700;">${n}</strong>: ${v.toFixed(1)}</span>`)
                    .join(' ');
                const vals = Object.values(item.judgeScores || {});
                const avg = vals.length ? (vals.reduce((a,b)=>a+b,0)/vals.length).toFixed(2) : '—';
                return `
                    <div style="background:rgba(255,215,0,0.04);border:1px solid rgba(255,215,0,0.15);border-left:4px solid #FFD700;border-radius:12px;padding:14px 18px;margin-bottom:10px;">
                        <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:6px;">
                            <div>
                                <span style="font-size:0.65rem;font-weight:900;color:#FFD700;text-transform:uppercase;letter-spacing:1px;">📊 Score Submission</span>
                                <div style="font-weight:900;font-size:1rem;color:#fff;margin-top:4px;">${item.singerName || '—'}</div>
                                <div style="font-size:0.75rem;color:#888;margin-top:2px;">Round: <strong style="color:var(--primary);">${item.round || '—'}</strong> &nbsp;·&nbsp; Judge Avg: <strong style="color:#FFD700;">${avg} / 10</strong> &nbsp;·&nbsp; Audience: <strong style="color:#00BFFF;">${item.audienceAvg ? item.audienceAvg.toFixed(2) : '—'}</strong></div>
                                <div style="margin-top:6px;display:flex;flex-wrap:wrap;gap:4px;">${judgeEntries}</div>
                            </div>
                            <div style="font-size:0.72rem;color:#555;white-space:nowrap;">${fmt(item.timestamp)}</div>
                        </div>
                    </div>`;

            } else if (item.type === 'status') {
                // Status change
                const clr = item.status === 'Eliminated' ? '#ff4d4d' : item.status === 'Winner' ? '#FFD700' : item.status === 'waitlisted' ? '#00ffff' : '#FF1493';
                return `
                    <div style="background:rgba(255,20,147,0.04);border:1px solid rgba(255,20,147,0.12);border-left:4px solid ${clr};border-radius:12px;padding:14px 18px;margin-bottom:10px;">
                        <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:6px;">
                            <div>
                                <span style="font-size:0.65rem;font-weight:900;color:${clr};text-transform:uppercase;letter-spacing:1px;">🔄 Status Change</span>
                                <div style="font-weight:900;font-size:1rem;color:#fff;margin-top:4px;">${item.name || '—'}</div>
                                <div style="font-size:0.75rem;color:#888;margin-top:2px;">
                                    Moved to: <strong style="color:${clr};">${item.status}</strong>
                                    &nbsp;·&nbsp; ID: <span style="font-family:monospace;color:#555;">${item.participantId || '—'}</span>
                                </div>
                            </div>
                            <div style="font-size:0.72rem;color:#555;white-space:nowrap;">${fmt(item.timestamp)}</div>
                        </div>
                    </div>`;

            } else if (item.type === 'votes') {
                // Audience vote
                return `
                    <div style="background:rgba(0,191,255,0.03);border:1px solid rgba(0,191,255,0.1);border-left:4px solid #00BFFF;border-radius:12px;padding:12px 18px;margin-bottom:8px;">
                        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;">
                            <div>
                                <span style="font-size:0.65rem;font-weight:900;color:#00BFFF;text-transform:uppercase;letter-spacing:1px;">🗳️ Audience Vote</span>
                                <div style="font-size:0.82rem;color:#ccc;margin-top:4px;">
                                    Voter: <strong style="color:#fff;">${item.voterId || 'Anonymous'}</strong>
                                    &nbsp;→&nbsp; Singer: <strong style="color:#FF1493;">${item.singerName || item.singerId || '—'}</strong>
                                    &nbsp;·&nbsp; Score: <strong style="color:#00BFFF;">${item.score} / 10</strong>
                                </div>
                            </div>
                            <div style="font-size:0.72rem;color:#555;white-space:nowrap;">${fmt(item.timestamp)}</div>
                        </div>
                    </div>`;
            }
            return '';
        }).join('');
    }

    window.fetchHistory = async () => {
        const feed = getEl('history-feed');
        if (feed) feed.innerHTML = '<div style="text-align:center;padding:40px;color:#888;"><i class="fa-solid fa-spinner fa-spin"></i> Loading...</div>';

        try {
            // Build participant map for name lookups
            const pSnap = await db.collection('participants').get();
            const pMap = {};
            pSnap.forEach(d => pMap[d.id] = d.data());

            historyAllItems = [];

            // 1. Round score submissions from round_results (newest first)
            try {
                const rrSnap = await db.collection('round_results').orderBy('timestamp', 'desc').limit(200).get();
                rrSnap.forEach(d => {
                    const data = d.data();
                    historyAllItems.push({ type: 'scores', ...data, _ts: data.timestamp ? data.timestamp.toMillis() : 0 });
                });
            } catch(e) { /* collection may not exist yet */ }

            // 2. Status changes: read from participants and surface recent status updates
            //    We approximate by reading updatedAt on participants
            pSnap.forEach(d => {
                const data = d.data();
                if (!data.status || data.status === 'pending') return;
                historyAllItems.push({
                    type: 'status',
                    name: data.name,
                    status: data.status,
                    participantId: data.participantId,
                    timestamp: data.updatedAt || data.createdAt || null,
                    _ts: data.updatedAt ? data.updatedAt.toMillis() : 0
                });
            });

            // 3. Audience votes (newest first, limit 100)
            const vSnap = await db.collection('live_votes').orderBy('timestamp', 'desc').limit(100).get().catch(() => ({ forEach: ()=>{} }));
            vSnap.forEach(d => {
                const data = d.data();
                const singer = pMap[data.singerId];
                historyAllItems.push({
                    type: 'votes',
                    ...data,
                    singerName: singer ? singer.name : data.singerId,
                    _ts: data.timestamp ? data.timestamp.toMillis() : 0
                });
            });

            // Sort ALL items newest first
            historyAllItems.sort((a, b) => b._ts - a._ts);

            renderHistoryFeed('all');

        } catch(e) {
            console.error(e);
            if (feed) feed.innerHTML = `<div style="text-align:center;padding:40px;color:red;">Error loading history: ${e.message}</div>`;
        }
    };

    window.pushToStage = async (id) => {
        if (!confirm("Are you sure you want to push this participant to the Live Stage immediately?")) return;
        try {
            await db.collection('live_state').doc('current').update({
                singer1: id,
                singer2: "",
                status: "on-air",
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            alert("Participant pushed to stage successfully.");
            switchMainTab('live-control');
        } catch (e) {
            alert("Error: " + e.message);
        }
    };

    // --- Wall of Fame Controls Logic ---
    window.fetchWofCandidates = async () => {
        const body = getEl('wof-candidates-body');
        if (!body) return;
        body.innerHTML = '<tr><td colspan="3" style="text-align:center;"><i class="fa-solid fa-spinner fa-spin"></i> Loading...</td></tr>';
        
        try {
            // Get current filter
            const stateDoc = await db.collection('live_state').doc('current').get();
            if (stateDoc.exists && stateDoc.data().wallOfFameFilter) {
                const select = getEl('wof-filter-select');
                if (select) select.value = stateDoc.data().wallOfFameFilter;
            }

            const pSnap = await db.collection('participants').orderBy('name', 'asc').get();
            let html = '';
            pSnap.forEach(doc => {
                const data = doc.data();
                if (data.status === 'pending') return; // Don't show pending
                html += `
                    <tr>
                        <td>
                            <strong>${data.name}</strong><br>
                            <span style="font-size:0.75rem; color:#aaa;">ID: ${data.participantId || '---'}</span>
                        </td>
                        <td><span class="badge badge-gold">${(data.status || '').toUpperCase()}</span></td>
                        <td>
                            ${data.isRevealed 
                                ? `<button onclick="toggleReveal('${doc.id}', true); setTimeout(fetchWofCandidates, 500)" class="btn btn-danger" style="width:100%;"><i class="fa-solid fa-eye-slash"></i> Hide from Wall</button>` 
                                : `<button onclick="toggleReveal('${doc.id}', false); setTimeout(fetchWofCandidates, 500)" class="btn btn-primary" style="width:100%; background:var(--primary); color:black; font-weight:bold;"><i class="fa-solid fa-eye"></i> Trigger Reveal</button>`
                            }
                        </td>
                    </tr>
                `;
            });
            body.innerHTML = html || '<tr><td colspan="3" style="text-align:center;">No active candidates found.</td></tr>';
        } catch (e) {
            body.innerHTML = '<tr><td colspan="3" style="text-align:center; color:red;">Error loading candidates</td></tr>';
        }
    };

    window.updateWofFilter = async (filterVal) => {
        try {
            await db.collection('live_state').doc('current').update({ wallOfFameFilter: filterVal });
            // Toast notification
            const toast = document.createElement('div');
            toast.textContent = "Wall of Fame Filter Updated!";
            toast.style.cssText = "position:fixed;bottom:20px;right:20px;background:var(--primary);color:black;padding:10px 20px;border-radius:8px;z-index:9999;";
            document.body.appendChild(toast);
            setTimeout(()=>toast.remove(), 3000);
        } catch(e) { console.error(e); }
    };

    window.resetWallOfFame = async () => {
        if (!confirm("This will clear all reveals from the Wall of Fame. Are you sure?")) return;
        try {
            const pSnap = await db.collection('participants').where('isRevealed', '==', true).get();
            const batch = db.batch();
            pSnap.forEach(doc => batch.update(doc.ref, { isRevealed: false }));
            
            // Also reset the display filter to 'all_active' so the wall clears
            batch.update(db.collection('live_state').doc('current'), { wallOfFameFilter: 'all_active' });
            
            await batch.commit();
            alert("Wall of Fame has been reset.");
            
            // Update local dropdown if it exists
            const select = getEl('wof-filter-select');
            if (select) select.value = 'all_active';
            
            fetchWofCandidates();
        } catch(e) { alert("Error resetting: " + e.message); }
    };

    // --- Factory Reset ---
    window.factoryResetSystem = async () => {
        const pass = prompt("WARNING! Type 'DELETE EVERYTHING' to confirm wiping all data.");
        if (pass !== 'DELETE EVERYTHING') {
            alert("Reset cancelled.");
            return;
        }

        const btn = document.querySelector('button[onclick="factoryResetSystem()"]');
        if (btn) btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> WIPING DATA...';

        try {
            // Delete all participants
            const pSnap = await db.collection('participants').get();
            let batch = db.batch();
            pSnap.forEach(doc => batch.delete(doc.ref));
            if (pSnap.size > 0) await batch.commit();

            // Delete all judge scores
            const jSnap = await db.collection('judge_scores').get();
            batch = db.batch();
            jSnap.forEach(doc => batch.delete(doc.ref));
            if (jSnap.size > 0) await batch.commit();

            // Delete all vote history
            const vSnap = await db.collection('votes_history').get();
            batch = db.batch();
            vSnap.forEach(doc => batch.delete(doc.ref));
            if (vSnap.size > 0) await batch.commit();

            // Delete all live votes
            const lvSnap = await db.collection('live_votes').get();
            batch = db.batch();
            lvSnap.forEach(doc => batch.delete(doc.ref));
            if (lvSnap.size > 0) await batch.commit();

            // Reset live state
            await db.collection('live_state').doc('current').set({
                status: 'idle',
                round: 'Round 1',
                singer1: '',
                singer2: '',
                votingOpen: false,
                scoreRevealStep: 0,
                scoreRevealSingerId: '',
                wallOfFameFilter: 'all_active',
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            alert("SYSTEM RESET COMPLETE. ALL DATA HAS BEEN WIPED.");
            window.location.reload();
        } catch (e) {
            console.error(e);
            alert("An error occurred during reset: " + e.message);
            if (btn) btn.innerHTML = '<i class="fa-solid fa-skull-crossbones"></i> HARD FACTORY RESET';
        }
    };

    // --- Participants Logic ---
    async function fetchAdminData() {
        if (!tableBody) return;
        tableBody.innerHTML = '<tr><td colspan="7" style="text-align:center;">Loading participants...</td></tr>';
        try {
            const snap = await db.collection("participants").get();
            tableBody.innerHTML = '';
            let sNo = 0;
            snap.forEach((doc) => {
                const data = doc.data();
                const id = doc.id;
                if (currentFilter !== 'all' && data.status !== currentFilter) return;
                sNo++;

                const tr = document.createElement('tr');
                tr.setAttribute('data-id', id); // for in-place updates
                const ph = data.phone ? data.phone.replace(/\D/g,'') : '';
                const encodedMsg = encodeURIComponent(`Hello ${data.name}, greetings from Hello Machi FM!`);
                const bClass = data.status === 'approved' ? 'badge-approved' : 'badge-pending';
                
                tr.innerHTML = `
                    <td style="text-align:center;"><input type="checkbox" class="participant-checkbox" value="${id}" onclick="updateSelectedCount()"></td>
                    <td data-label="S.NO" style="color:#888; font-family:monospace; font-size:0.85rem;">${sNo}</td>
                    <td data-label="ID" style="color:var(--primary); font-weight:bold; font-family:monospace;">${data.participantId || '---'}</td>
                    <td data-label="PHOTO">${data.photoBase64 ? `<img src="${data.photoBase64}" style="width:90px;height:90px;border-radius:10px;object-fit:contain;background:#000;border:1px solid #333;box-shadow:0 4px 10px rgba(0,0,0,0.3);">` : `<div style="width:90px;height:90px;border-radius:10px;background:#333;display:flex;align-items:center;justify-content:center;">${data.name ? data.name.charAt(0) : '?'}</div>`}</td>
                    <td data-label="NAME">
                        <strong>${data.name || 'Unknown'}</strong><br>
                        ${ph ? `<a href="https://wa.me/${ph}?text=${encodedMsg}" target="_blank" style="color:#25D366;font-size:0.85rem;"><i class="fa-brands fa-whatsapp"></i> Notify WhatsApp</a>` : ''}
                    </td>
                    <td data-label="LOCATION" style="font-size:0.85rem;color:var(--text-muted);">
                        <i class="fa-solid fa-city"></i> ${data.city || 'N/A'}<br>
                        <small>${data.address || ''}</small>
                    </td>
                    <td data-label="LINK">
                        ${data.auditionLink ? `
                            <button onclick="previewAudio('${data.auditionLink}', '${data.name}')" style="background:var(--secondary); color:white; border:none; padding:5px 10px; border-radius:5px; cursor:pointer;">
                                <i class="fa-solid fa-play"></i> Listen
                            </button>
                        ` : 'None'}
                    </td>
                    <td data-label="SCORE"><div style="display:flex;gap:5px;"><input type="number" value="${data.judgeScore||0}" id="sc-${id}" style="width:45px;background:#222;color:white;border:1px solid #444;"><button onclick="saveScore('${id}')" style="background:var(--primary);border:none;padding:2px 5px;"><i class="fa-solid fa-save"></i></button></div></td>
                    <td data-label="STATUS">
                        <span class="badge ${bClass}">${(data.status || 'pending').toUpperCase()}</span><br>
                        <button onclick="toggleReveal('${id}', ${data.isRevealed})" style="margin-top:5px; font-size:0.7rem; background:${data.isRevealed?'#28a745':'#444'}; border:none; color:white; border-radius:4px; padding:2px 5px;">
                            ${data.isRevealed ? '<i class="fa-solid fa-eye"></i> Revealed' : '<i class="fa-solid fa-eye-slash"></i> Hidden'}
                        </button>
                    </td>
                    <td data-label="ACTIONS">
                        <div style="display:flex; gap:5px; flex-wrap:wrap;">
                            <select onchange="updateStatus('${id}', this.value)" style="background:#222;color:white;border:1px solid #444;padding:4px; font-size:0.8rem;">
                                <option value="pending" ${data.status==='pending'?'selected':''}>Pending</option>
                                <option value="approved" ${data.status==='approved'?'selected':''}>Approve (Selection)</option>
                                <option value="Round 1" ${data.status==='Round 1'?'selected':''}>Round 1</option>
                                <option value="Round 2" ${data.status==='Round 2'?'selected':''}>Round 2</option>
                                <option value="Round 3" ${data.status==='Round 3'?'selected':''}>Round 3</option>
                                <option value="Semi-Final" ${data.status==='Semi-Final'?'selected':''}>Semi-Final</option>
                                <option value="Final Round" ${data.status==='Final Round'?'selected':''}>Final Round</option>
                                <option value="Grand Finale" ${data.status==='Grand Finale'?'selected':''}>Grand Finale</option>
                                <option value="Optional Round" ${data.status==='Optional Round'?'selected':''}>Optional Round</option>
                                <option value="Winner" ${data.status==='Winner'?'selected':''}>Winner</option>
                                <option value="Runner Up 1" ${data.status==='Runner Up 1'?'selected':''}>Runner Up 1</option>
                                <option value="Runner Up 2" ${data.status==='Runner Up 2'?'selected':''}>Runner Up 2</option>
                                <option value="waitlisted" ${data.status==='waitlisted'?'selected':''}>Waitlist</option>
                                <option value="Eliminated" ${data.status==='Eliminated'?'selected':''}>Eliminated</option>
                            </select>
                            <button class="action-btn" onclick="openEditModal('${id}')"><i class="fa-solid fa-pen"></i></button>
                            <button class="action-btn btn-danger" onclick="deleteParticipant('${id}')"><i class="fa-solid fa-trash"></i></button>
                        </div>
                    </td>
                `;
                tableBody.appendChild(tr);
            });
        } catch (e) { console.error(e); }
    }

    window.saveScore = async (id) => {
        const sc = parseFloat(getEl(`sc-${id}`).value) || 0;
        try { await db.collection("participants").doc(id).update({ judgeScore: sc }); alert("Saved!"); } catch(e){}
    };

    window.updateStatus = async (id, s) => {
        try { 
            const docRef = db.collection("participants").doc(id);
            const doc = await docRef.get();
            const data = doc.data();
            const updates = { status: s };
            
            // If advancing to a selection status and no ID exists, generate one
            const selectionStatuses = ['approved', 'Round 1', 'Round 2', 'Round 3', 'Semi-Final', 'Final Round', 'Grand Finale', 'Optional Round', 'Winner', 'Runner Up 1', 'Runner Up 2', 'waitlisted'];
            if (selectionStatuses.includes(s) && !data.participantId) {
                updates.participantId = await generateNextId();
            }

            await docRef.update(updates); 
            // ---- NO full reload — update the single row in-place ----
            const tr = document.querySelector(`tr[data-id="${id}"]`);
            if (tr) {
                const statusCell = tr.querySelector('td[data-label="STATUS"] span.badge');
                if (statusCell) { 
                    statusCell.textContent = s.toUpperCase();
                    statusCell.className = `badge ${s === 'approved' ? 'badge-approved' : 'badge-pending'}`;
                }
            } else {
                // Fallback: full refresh but preserve scroll
                const scroller = document.getElementById('admin-content') || document.scrollingElement;
                const savedScroll = scroller ? scroller.scrollTop : 0;
                await fetchAdminData();
                if (scroller) requestAnimationFrame(() => { scroller.scrollTop = savedScroll; });
            }
        } catch(e){ console.error(e); }
    };

    // ---- Bulk Action Functions ----
    window.toggleSelectAll = () => {
        const master = document.getElementById('select-all-checkbox');
        const checkboxes = document.querySelectorAll('.participant-checkbox');
        checkboxes.forEach(cb => cb.checked = master.checked);
        updateSelectedCount();
    };

    window.updateSelectedCount = () => {
        const checkboxes = document.querySelectorAll('.participant-checkbox:checked');
        const count = checkboxes.length;
        const countEl = document.getElementById('selected-count');
        const menuEl = document.getElementById('bulk-menu');
        if (countEl) countEl.textContent = count;
        if (menuEl) menuEl.style.display = count > 0 ? 'flex' : 'none';
    };

    window.clearSelection = () => {
        const master = document.getElementById('select-all-checkbox');
        if (master) master.checked = false;
        document.querySelectorAll('.participant-checkbox').forEach(cb => cb.checked = false);
        updateSelectedCount();
    };

    window.applyBulkStatus = async () => {
        const newStatus = document.getElementById('bulk-status-select').value;
        if (!newStatus) return alert("Please select a status first.");
        
        const selected = Array.from(document.querySelectorAll('.participant-checkbox:checked')).map(cb => cb.value);
        if (selected.length === 0) return alert("No participants selected.");
        
        if (!confirm(`Are you sure you want to move ${selected.length} participants to ${newStatus}?`)) return;

        const btn = document.querySelector('button[onclick="applyBulkStatus()"]');
        const originalText = btn ? btn.innerHTML : '';
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processing...'; }

        try {
            const selectionStatuses = ['approved', 'Round 1', 'Round 2', 'Round 3', 'Semi-Final', 'Final Round', 'Grand Finale', 'Optional Round', 'Winner', 'Runner Up 1', 'Runner Up 2', 'waitlisted'];
            
            // We'll process them one by one to ensure sequential ID generation works correctly
            for (const id of selected) {
                const docRef = db.collection("participants").doc(id);
                const doc = await docRef.get();
                const data = doc.data();
                const updates = { status: newStatus };

                if (selectionStatuses.includes(newStatus) && !data.participantId) {
                    updates.participantId = await generateNextId();
                } else if ((newStatus === 'pending' || newStatus === 'rejected') && data.participantId) {
                    updates.participantId = firebase.firestore.FieldValue.delete();
                }

                await docRef.update(updates);
            }

            alert(`Bulk update complete! ${selected.length} participants moved to ${newStatus}.`);
            clearSelection();
            fetchAdminData();
        } catch (e) {
            console.error(e);
            alert("Bulk update failed: " + e.message);
        } finally {
            if (btn) { btn.disabled = false; btn.innerHTML = originalText; }
        }
    };

    window.applyBulkReveal = async (revealVal) => {
        const selected = Array.from(document.querySelectorAll('.participant-checkbox:checked')).map(cb => cb.value);
        if (selected.length === 0) return alert("No participants selected.");
        
        if (!confirm(`Are you sure you want to ${revealVal ? 'Reveal' : 'Hide'} ${selected.length} participants on the Wall of Fame?`)) return;

        const btn = document.querySelector(`button[onclick="applyBulkReveal(${revealVal})"]`);
        const originalText = btn ? btn.innerHTML : '';
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Updating...'; }

        try {
            const batch = db.batch();
            selected.forEach(id => {
                const ref = db.collection("participants").doc(id);
                const updates = { isRevealed: revealVal };
                if (revealVal) {
                    updates.lastRevealedAt = firebase.firestore.FieldValue.serverTimestamp();
                }
                batch.update(ref, updates);
            });

            await batch.commit();
            alert(`Bulk ${revealVal ? 'Reveal' : 'Hide'} complete!`);
            clearSelection();
            fetchAdminData();
        } catch (e) {
            console.error(e);
            alert("Bulk update failed: " + e.message);
        } finally {
            if (btn) { btn.disabled = false; btn.innerHTML = originalText; }
        }
    };


    // ---- Open ADD modal (blank form) ----
    window.openAddModal = () => {
        editPhotoBase64 = null;
        document.getElementById('edit-id').value = '';
        document.getElementById('modal-title').innerHTML = '<i class="fa-solid fa-user-plus"></i> Add New Participant';
        document.getElementById('modal-save-btn').textContent = 'Add Participant';
        ['edit-name','edit-email','edit-phone','edit-city','edit-address','edit-bio','edit-audition-link'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        document.getElementById('edit-status').value = 'pending';
        document.getElementById('edit-judge-score').value = '0';
        if (editPhotoPreview) editPhotoPreview.style.display = 'none';
        if (editPhotoFile) editPhotoFile.value = '';
        document.getElementById('edit-modal').style.display = 'flex';
    };

    // ---- Open EDIT modal (prefilled) ----
    window.openEditModal = async (id) => {
        editPhotoBase64 = null;
        const doc = await db.collection("participants").doc(id).get();
        const data = doc.data();
        document.getElementById('edit-id').value = id;
        document.getElementById('modal-title').innerHTML = '<i class="fa-solid fa-user-pen"></i> Edit Participant';
        document.getElementById('modal-save-btn').textContent = 'Save Changes';
        document.getElementById('edit-name').value = data.name || '';
        document.getElementById('edit-email').value = data.email || '';
        document.getElementById('edit-phone').value = data.phone || '';
        document.getElementById('edit-city').value = data.city || '';
        document.getElementById('edit-address').value = data.address || '';
        document.getElementById('edit-bio').value = data.bio || '';
        document.getElementById('edit-status').value = data.status || 'pending';
        document.getElementById('edit-judge-score').value = data.judgeScore || 0;
        document.getElementById('edit-audition-link').value = data.auditionLink || '';
        if (editPhotoFile) editPhotoFile.value = '';
        if (editPhotoPreview) {
            if (data.photoBase64) {
                editPhotoPreview.src = data.photoBase64;
                editPhotoPreview.style.display = 'block';
            } else {
                editPhotoPreview.style.display = 'none';
            }
        }
        document.getElementById('edit-modal').style.display = 'flex';
    };

    window.closeEditModal = () => { document.getElementById('edit-modal').style.display = 'none'; };

    // ---- ID Generation Logic ----
    const generateNextId = async () => {
        const pSnap = await db.collection("participants").get();
        let maxNum = 0;
        pSnap.forEach(doc => {
            const pid = doc.data().participantId;
            if (pid && pid.startsWith('HM-SS-')) {
                const num = parseInt(pid.replace('HM-SS-', ''));
                if (!isNaN(num) && num > maxNum) maxNum = num;
            }
        });
        return `HM-SS-${(maxNum + 1).toString().padStart(3, '0')}`;
    };

    window.regenerateAllIds = async () => {
        if (!confirm("This will REMOVE all existing IDs and create new ones (HM-SS-001, etc.) for all approved participants. Are you sure?")) return;
        
        const btn = document.getElementById('regen-ids-btn');
        const originalText = btn ? btn.innerHTML : '';
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Re-indexing...'; }

        try {
            const pSnap = await db.collection("participants").orderBy('registeredAt', 'asc').get();
            const batch = db.batch();
            let count = 0;

            pSnap.forEach(doc => {
                const data = doc.data();
                if (data.status !== 'pending' && data.status !== 'rejected') {
                    count++;
                    const newId = `HM-SS-${count.toString().padStart(3, '0')}`;
                    batch.update(doc.ref, { participantId: newId });
                } else {
                    // Remove ID if they are pending or rejected
                    batch.update(doc.ref, { participantId: firebase.firestore.FieldValue.delete() });
                }
            });

            await batch.commit();
            alert(`Success! Re-indexed ${count} participants.`);
            fetchAdminData();
        } catch (e) {
            console.error(e);
            alert("Error regenerating IDs: " + e.message);
        } finally {
            if (btn) { btn.disabled = false; btn.innerHTML = originalText; }
        }
    };

    // ---- Save (works for both Add and Edit) ----
    window.saveParticipantChanges = async () => {
        const id = document.getElementById('edit-id').value;
        const isNew = !id;

        const name = document.getElementById('edit-name').value.trim();
        const email = document.getElementById('edit-email').value.trim().toLowerCase();
        if (!name || !email) { alert('Name and Email are required.'); return; }

        const newStatus = document.getElementById('edit-status').value;
        
        const updates = {
            name,
            email,
            phone: document.getElementById('edit-phone').value.trim(),
            city: document.getElementById('edit-city').value.trim(),
            address: document.getElementById('edit-address').value.trim(),
            bio: document.getElementById('edit-bio').value.trim(),
            status: newStatus,
            judgeScore: parseFloat(document.getElementById('edit-judge-score').value) || 0,
            auditionLink: document.getElementById('edit-audition-link').value.trim(),
        };

        if (editPhotoBase64) updates.photoBase64 = editPhotoBase64;

        const saveBtn = document.getElementById('modal-save-btn');
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';

        try {
            if (isNew) {
                updates.registeredAt = firebase.firestore.FieldValue.serverTimestamp();
                updates.isRevealed = false;
                updates.votes = 0;
                if (!updates.photoBase64) updates.photoBase64 = '';
                
                // If added as non-pending, generate ID
                if (newStatus !== 'pending' && newStatus !== 'rejected') {
                    updates.participantId = await generateNextId();
                }

                await db.collection("participants").add(updates);
                alert('Participant added successfully!');
            } else {
                // Fetch current to check if status is changing from pending
                const currentDoc = await db.collection("participants").doc(id).get();
                const currentData = currentDoc.data();
                
                // If moving from pending/rejected to an active status, and no ID exists
                if ((currentData.status === 'pending' || currentData.status === 'rejected') && 
                    (newStatus !== 'pending' && newStatus !== 'rejected') && 
                    !currentData.participantId) {
                    updates.participantId = await generateNextId();
                }

                await db.collection("participants").doc(id).update(updates);
                alert('Changes saved!');
            }
            closeEditModal();
            fetchAdminData();
        } catch (e) {
            console.error(e);
            alert('Error saving: ' + e.message);
        } finally {
            saveBtn.disabled = false;
            saveBtn.textContent = isNew ? 'Add Participant' : 'Save Changes';
        }
    };

    window.previewAudio = (url, name) => {
        const modal = document.createElement('div');
        modal.style = "position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.9); z-index:20000; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:20px;";
        modal.id = 'audio-preview-modal';
        modal.innerHTML = `
            <div style="background:#111; padding:40px; border-radius:20px; text-align:center; border:1px solid var(--primary); max-width:400px; width:100%;">
                <h3 style="color:var(--primary); margin-bottom:10px;">${name}'s Audition</h3>
                <audio controls autoplay style="width:100%; margin-bottom:20px;">
                    <source src="${url}" type="audio/mpeg">
                </audio>
                <div style="height:50px; display:flex; align-items:flex-end; gap:3px; justify-content:center; margin-bottom:20px;">
                    ${Array.from({length: 20}).map(() => `<div class="wave-bar" style="width:5px; background:var(--primary); height:10px;"></div>`).join('')}
                </div>
                <button onclick="document.getElementById('audio-preview-modal').remove()" class="btn btn-secondary" style="width:100%;">Close Preview</button>
            </div>
            <style>
                .wave-bar { animation: barDance 1s ease-in-out infinite alternate; }
                @keyframes barDance { 0% { height: 10px; } 100% { height: 40px; } }
                .wave-bar:nth-child(2n) { animation-delay: 0.2s; }
                .wave-bar:nth-child(3n) { animation-delay: 0.4s; }
            </style>
        `;
        document.body.appendChild(modal);
    };

    window.toggleReveal = async (id, currentVal) => {
        try {
            const updates = { isRevealed: !currentVal };
            if (!currentVal) {
                // If we are revealing, set a timestamp to force the animation on the wall
                updates.lastRevealedAt = firebase.firestore.FieldValue.serverTimestamp();
            }
            await db.collection("participants").doc(id).update(updates);
            fetchAdminData();
        } catch(e) {}
    };

    window.filterTable = (status) => {
        currentFilter = status;
        fetchAdminData();
        // Update tab buttons
        document.querySelectorAll('#admin-tabs button').forEach(btn => {
            btn.classList.remove('btn-primary');
            btn.classList.add('btn-secondary');
            if(btn.textContent.toLowerCase() === status.toLowerCase() || (status === 'all' && btn.textContent === 'All')) {
                btn.classList.add('btn-primary');
                btn.classList.remove('btn-secondary');
            }
        });
    };

    window.deleteParticipant = async (id) => {
        if(confirm("Delete?")) { await db.collection("participants").doc(id).delete(); fetchAdminData(); }
    };

    // --- Leaderboard ---
    async function calculateLeaderboard() {
        const body = getEl('leaderboard-body');
        if(!body) return;
        body.innerHTML = '<tr><td colspan="6">Calculating...</td></tr>';
        try {
            const pSnap = await db.collection('participants').get();
            const vSnap = await db.collection('live_votes').get();
            const res = [];
            pSnap.forEach(doc => {
                const p = doc.data();
                const v = vSnap.docs.filter(d => d.data().singerId === doc.id).map(d => d.data().score);
                const aud = v.length > 0 ? (v.reduce((a,b)=>a+b,0)/v.length) : 0;
                res.push({ name: p.name, photo: p.photoBase64, judge: p.judgeScore||0, audience: aud, status: p.status });
            });
            res.sort((a,b) => (b.judge*6 + b.audience*4) - (a.judge*6 + a.audience*4));
            body.innerHTML = '';
            res.forEach((r, i) => {
                const tr = document.createElement('tr');
                tr.innerHTML = `<td data-label="RANK">#${i+1}</td><td data-label="SINGER">${r.name}</td><td data-label="JUDGE">${r.judge}</td><td data-label="AUDIENCE">${r.audience.toFixed(1)}</td><td data-label="TOTAL"><strong>${(r.judge*6 + r.audience*4).toFixed(1)}</strong></td><td data-label="STATUS">${r.status}</td>`;
                body.appendChild(tr);
            });
        } catch(e){}
    }

    // --- Admins ---

    // --- Admins ---
    async function fetchAdminsList() {
        const snap = await db.collection("admins").get();
        if(adminListBody) {
            adminListBody.innerHTML = '';
            snap.forEach(doc => {
                const tr = document.createElement('tr');
                tr.innerHTML = `<td>${doc.id}</td><td><button onclick="removeAdmin('${doc.id}')">X</button></td>`;
                adminListBody.appendChild(tr);
            });
        }
    }
    window.addAdmin = async () => {
        const e = getEl('new-admin-email').value;
        await db.collection("admins").doc(e).set({addedAt: firebase.firestore.FieldValue.serverTimestamp()});
        fetchAdminsList();
    };
    window.removeAdmin = async (e) => {
        await db.collection("admins").doc(e).delete();
        fetchAdminsList();
    };

    // ====================================================
    // JUDGE SCORING SYSTEM
    // (Variables declared at the top of the file)
    let currentJudgeSingerName = 'Unknown';
    let latestLiveState = null;

    window.switchJudgeSingerToggle = () => {
        if (!latestLiveState) return;
        const toggleVal = document.querySelector('input[name="judge_singer_toggle"]:checked').value;
        const singerId = toggleVal === 'singer2' ? latestLiveState.singer2 : latestLiveState.singer1;
        updateJudgePanelTarget(singerId);
    };

    function updateJudgePanelTarget(singerId) {
        if (!singerId) {
            document.getElementById('judge-singer-label').innerHTML = '🎤 No singer assigned to this slot';
            currentJudgeSingerId = null;
            if (judgeScoresUnsub) { judgeScoresUnsub(); judgeScoresUnsub = null; }
            if (audienceScoresUnsub) { audienceScoresUnsub(); audienceScoresUnsub = null; }
            document.getElementById('saved-judge-scores').style.display = 'none';
            return;
        }
        if (singerId !== currentJudgeSingerId) {
            currentJudgeSingerId = singerId;
            db.collection('participants').doc(singerId).get().then(pDoc => {
                if (pDoc.exists) {
                    currentJudgeSingerName = pDoc.data().name || 'Singer';
                    document.getElementById('judge-singer-label').innerHTML = 
                        `🎤 Current Target: <span style="color:var(--primary)">${currentJudgeSingerName}</span>`;
                }
            });
            loadJudgeScores(singerId);
            loadAudienceScores(singerId);
        }
    }

    // Listen to live_state to update singer label in judge panel
    db.collection('live_state').doc('current').onSnapshot(doc => {
        if (!doc.exists) return;
        latestLiveState = doc.data();
        switchJudgeSingerToggle(); // Re-eval based on current radio selection
    });

    // Add a judge row in the panel (and optionally save to persistent list)
    window.addJudgeRow = async () => {
        const input = document.getElementById('new-judge-name');
        const name = (input ? input.value : '').trim();
        if (!name) { alert('Enter a judge name first'); return; }
        if (input) input.value = '';
        const container = document.getElementById('judge-rows');
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;gap:10px;background:#0d0d18;border:1px solid #2a2a3a;border-radius:10px;padding:10px 14px;';
        row.innerHTML = `
            <span style="flex:1;font-size:0.9rem;font-weight:700;color:#FFD700;"><i class="fa-solid fa-gavel" style="margin-right:6px;font-size:0.75rem;"></i>${name}</span>
            <div style="display:flex;align-items:center;gap:6px;">
                <input type="number" min="0" max="10" step="0.5" value="" placeholder="—"
                    data-judge="${name}"
                    style="width:75px;background:#111;border:1px solid #FFD700;color:#FFD700;padding:8px;border-radius:8px;font-size:1.1rem;font-weight:900;text-align:center;">
                <span style="font-size:0.7rem;color:#555;">/10</span>
            </div>
            <button onclick="this.parentElement.remove()" style="background:transparent;border:1px solid #333;color:#555;padding:4px 8px;border-radius:6px;cursor:pointer;font-size:0.8rem;">✕</button>
        `;
        container.appendChild(row);
        // Also persist to firebase so it shows next time
        try {
            const doc = await db.collection('config').doc('judges').get();
            const existing = (doc.exists && doc.data().list) ? doc.data().list : [];
            if (!existing.includes(name)) {
                existing.push(name);
                await db.collection('config').doc('judges').set({ list: existing }, { merge: true });
                if (typeof persistentJudgesCache !== 'undefined') persistentJudgesCache = existing;
            }
        } catch(e) { /* non-critical */ }
    };

    // Submit all judge scores
    window.submitJudgeScores = async () => {
        if (!currentJudgeSingerId) { alert('No singer is currently on stage.'); return; }
        const round = getEl('live-round').value;
        const inputs = document.querySelectorAll('#judge-rows input[data-judge]');
        if (inputs.length === 0) { alert('Add at least one judge first.'); return; }
        
        const scores = {};
        inputs.forEach(inp => { scores[inp.dataset.judge] = parseFloat(inp.value) || 0; });
        
        try {
            // 1. Save to current live scores
            await db.collection('judge_scores').doc(currentJudgeSingerId).set({
                singerId: currentJudgeSingerId,
                singerName: currentJudgeSingerName,
                scores,
                round: round,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });

            // 2. Also archive to historical round results
            // Get current audience average for this singer
            const vSnap = await db.collection('live_votes').get();
            const votes = [];
            vSnap.forEach(vDoc => { 
                const vData = vDoc.data();
                if (vData.singerId === currentJudgeSingerId && vData.score) votes.push(vData.score); 
            });
            const audienceAvg = votes.length ? (votes.reduce((a, b) => a + b, 0) / votes.length) : 0;

            const historyId = `${currentJudgeSingerId}_${round.replace(/\s+/g, '_')}`;
            await db.collection('round_results').doc(historyId).set({
                singerId: currentJudgeSingerId,
                singerName: currentJudgeSingerName,
                round: round,
                judgeScores: scores,
                audienceAvg: audienceAvg,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });

            alert('✅ Judge scores saved and archived for ' + round + '!');
        } catch(e) { alert('Error: ' + e.message); }
    };

    // Score Reveal Step Logic
    window.revealScoreStep = async (action) => {
        try {
            const stateDoc = await db.collection('live_state').doc('current').get();
            let currentStep = stateDoc.exists ? (stateDoc.data().scoreRevealStep || 0) : 0;
            
            if (action === 'hide') {
                currentStep = 0;
            } else if (action === 'next-judge') {
                if (typeof currentStep === 'number') currentStep += 1;
                else currentStep = 1;
            } else if (action === 'audience') {
                currentStep = 'audience';
            } else if (action === 'final') {
                currentStep = 'final';
            }

            await db.collection('live_state').doc('current').update({ 
                scoreRevealStep: currentStep,
                scoreRevealSingerId: currentJudgeSingerId,
                scoreRevealTimestamp: firebase.firestore.FieldValue.serverTimestamp()
            });
        } catch (e) {
            console.error(e);
            alert("Error updating reveal state");
        }
    };

    // Real-time listener for saved judge scores
    function loadJudgeScores(singerId) {
        if (judgeScoresUnsub) judgeScoresUnsub();
        judgeScoresUnsub = db.collection('judge_scores').doc(singerId).onSnapshot(doc => {
            const saved = document.getElementById('saved-judge-scores');
            const list = document.getElementById('saved-scores-list');
            if (!doc.exists || !doc.data().scores) { saved.style.display = 'none'; return; }
            saved.style.display = 'block';
            const scores = doc.data().scores;
            const names = Object.keys(scores);
            list.innerHTML = names.map(n => `
                <div style="background:#1a1a24;border:1px solid #333;padding:8px 14px;border-radius:10px;font-size:0.8rem;">
                    <span style="color:#888;">${n}</span><br>
                    <strong style="color:#FFD700;font-size:1.2rem;">${scores[n]}</strong><small style="color:#555;">/10</small>
                </div>
            `).join('');
            const avg = names.reduce((a, n) => a + scores[n], 0) / names.length;
            document.getElementById('judge-avg-display').textContent = avg.toFixed(1);
            updateCombined();
        });
    }

    // Real-time audience average
    function loadAudienceScores(singerId) {
        if (audienceScoresUnsub) audienceScoresUnsub();
        audienceScoresUnsub = db.collection('live_votes').onSnapshot(snap => {
            const votes = [];
            snap.forEach(doc => { 
                const d = doc.data();
                if (d.score && d.singerId === singerId) votes.push(d.score); 
            });
            const avg = votes.length ? (votes.reduce((a, b) => a + b, 0) / votes.length) : 0;
            const el = document.getElementById('audience-avg-display');
            if (el) el.textContent = avg.toFixed(1);
            updateCombined();
        });
    }

    function updateCombined() {
        const jEl = document.getElementById('judge-avg-display');
        const aEl = document.getElementById('audience-avg-display');
        const cEl = document.getElementById('combined-score-display');
        if (!jEl || !aEl || !cEl) return;
        const j = parseFloat(jEl.textContent) || 0;
        const a = parseFloat(aEl.textContent) || 0;
        cEl.textContent = (j * 0.6 + a * 0.4).toFixed(2);
    }

    // ==========================================
    // ALL-IN-ONE HUB: LEADERBOARD & SELECTION
    // ==========================================
    let lbData = []; // Cached leaderboard data
    let lbSortCol = 'total';
    let lbSortAsc = false;
    let persistentJudgesCache = [];
    const ROUND_ORDER_LB = ['Round 1','Round 2','Round 3','Semi-Final','Final Round','Grand Finale','Optional Round'];

    window.calculateLeaderboard = async () => {
        const tbody = document.getElementById('leaderboard-body');
        if (!tbody) return;
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:40px;"><i class="fa-solid fa-spinner fa-spin fa-2x"></i><br><br>Crunching all scores...</td></tr>';

        try {
            const [pSnap, jSnap, vSnap, rrSnap] = await Promise.all([
                db.collection('participants').get(),
                db.collection('judge_scores').get(),
                db.collection('live_votes').get(),
                db.collection('round_results').get().catch(() => ({ forEach: () => {} }))
            ]);

            const pMap = {}; pSnap.forEach(d => pMap[d.id] = { id: d.id, ...d.data() });
            const judgeMap = {}; jSnap.forEach(d => judgeMap[d.id] = d.data());
            const voteMap = {}; 
            vSnap.forEach(d => {
                const { singerId, score } = d.data();
                if (!singerId || !score) return;
                if (!voteMap[singerId]) voteMap[singerId] = [];
                voteMap[singerId].push(score);
            });
            const rrMap = {};
            rrSnap.forEach(d => {
                const data = d.data();
                if (!rrMap[data.singerId]) rrMap[data.singerId] = [];
                rrMap[data.singerId].push(data);
            });

            // Weight Engine
            const weightSlider = document.getElementById('weight-slider');
            const jWeightBase = weightSlider ? parseInt(weightSlider.value) / 100 : 0.6;
            const aWeightBase = 1 - jWeightBase;

            lbData = [];
            const allRoundsFound = new Set();

            Object.values(pMap).forEach(p => {
                const st = p.status || '';
                if (!st || st === 'pending' || st === 'waitlisted' || st === 'Eliminated' || st === 'approved') return; // Only show active competitors

                const performances = [];
                const archived = rrMap[p.id] || [];
                archived.forEach(h => {
                    const jVals = Object.values(h.judgeScores || {});
                    const jAvg = jVals.length ? jVals.reduce((a,b)=>a+b,0)/jVals.length : 0;
                    const aAvg = h.audienceAvg || 0;
                    
                    // Dynamic Weighting
                    let jW = jWeightBase; let aW = aWeightBase;
                    if (jAvg === 0 && aAvg > 0) { jW = 0; aW = 1; }
                    if (aAvg === 0 && jAvg > 0) { jW = 1; aW = 0; }
                    
                    const subtotal = jAvg * jW + aAvg * aW;
                    performances.push({ round: h.round, jAvg, aAvg, subtotal });
                    allRoundsFound.add(h.round);
                });

                // Check active un-archived round
                const currentJ = judgeMap[p.id];
                let currentRound = st;
                if (currentJ && currentJ.scores && Object.keys(currentJ.scores).length > 0) {
                    currentRound = currentJ.round || st;
                    if (!performances.some(a => a.round === currentRound)) {
                        const jVals = Object.values(currentJ.scores);
                        const jAvg = jVals.length ? jVals.reduce((a,b)=>a+b,0)/jVals.length : 0;
                        const vList = voteMap[p.id] || [];
                        const aAvg = vList.length ? vList.reduce((a,b)=>a+b,0)/vList.length : 0;
                        
                        let jW = jWeightBase; let aW = aWeightBase;
                        if (jAvg === 0 && aAvg > 0) { jW = 0; aW = 1; }
                        if (aAvg === 0 && jAvg > 0) { jW = 1; aW = 0; }
                        
                        performances.push({ round: currentRound, jAvg, aAvg, subtotal: jAvg * jW + aAvg * aW });
                        allRoundsFound.add(currentRound);
                    }
                } else if (!performances.some(a => a.round === st)) {
                    // Just audience or zero
                    const vList = voteMap[p.id] || [];
                    const aAvg = vList.length ? vList.reduce((a,b)=>a+b,0)/vList.length : 0;
                    let jW = jWeightBase; let aW = aWeightBase;
                    if (aAvg > 0) { jW = 0; aW = 1; }
                    performances.push({ round: st, jAvg: 0, aAvg, subtotal: aAvg * aW });
                    allRoundsFound.add(st);
                }

                const cumulative = performances.reduce((s, r) => s + r.subtotal, 0);
                
                // Map performances by round for easy table columns
                const roundScores = {};
                performances.forEach(pf => roundScores[pf.round] = pf.subtotal);

                lbData.push({ ...p, performances, roundScores, cumulative, currentStatus: st });
            });

            // Update Dynamic Headers
            const headerRow = document.getElementById('lb-header-row');
            if (headerRow) {
                // remove existing round columns
                document.querySelectorAll('.dyn-round-col').forEach(el => el.remove());
                const roundsArr = Array.from(allRoundsFound).sort((a,b) => ROUND_ORDER_LB.indexOf(a) - ROUND_ORDER_LB.indexOf(b));
                
                // Insert right before Total Score
                const totalCol = Array.from(headerRow.children).find(th => th.textContent.includes('Total Score'));
                roundsArr.forEach(r => {
                    const th = document.createElement('th');
                    th.className = 'dyn-round-col';
                    th.innerHTML = `${r} <i class="fa-solid fa-sort"></i>`;
                    th.style.cursor = 'pointer';
                    th.onclick = () => window.sortLeaderboard(`round_${r}`);
                    headerRow.insertBefore(th, totalCol);
                });
            }

            window.sortLeaderboard(lbSortCol, true); // Keep current sort, just render

        } catch(err) {
            console.error(err);
            tbody.innerHTML = `<tr><td colspan="5" style="color:red; text-align:center;">Error loading leaderboard.</td></tr>`;
        }
    };

    window.sortLeaderboard = (col, skipToggle = false) => {
        if (!skipToggle) {
            if (lbSortCol === col) lbSortAsc = !lbSortAsc;
            else { lbSortCol = col; lbSortAsc = false; }
        }

        lbData.sort((a, b) => {
            let valA = 0, valB = 0;
            if (col === 'rank' || col === 'total') { valA = a.cumulative; valB = b.cumulative; }
            else if (col === 'name') { valA = a.name.toLowerCase(); valB = b.name.toLowerCase(); }
            else if (col.startsWith('round_')) {
                const r = col.replace('round_', '');
                valA = a.roundScores[r] || 0; valB = b.roundScores[r] || 0;
            }

            if (typeof valA === 'string') return lbSortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
            return lbSortAsc ? valA - valB : valB - valA;
        });

        window.filterLeaderboard(); // renders table
    };

    window.filterLeaderboard = () => {
        const search = (document.getElementById('lb-search')?.value || '').toLowerCase();
        const rFilter = document.getElementById('lb-round-filter')?.value || 'all';
        const tbody = document.getElementById('leaderboard-body');
        if (!tbody) return;

        let filtered = lbData.filter(s => {
            const matchName = (s.name || '').toLowerCase().includes(search);
            const matchRound = (rFilter === 'all') || (s.currentStatus === rFilter) || (s.roundScores[rFilter] !== undefined);
            return matchName && matchRound;
        });

        const roundsArr = Array.from(document.querySelectorAll('.dyn-round-col')).map(th => th.textContent.replace(/[^a-zA-Z0-9 -]/g, '').trim());

        let html = '';
        filtered.forEach((s, idx) => {
            let rankHtml = lbSortCol === 'total' || lbSortCol === 'rank' ? (idx + 1) : '-';
            
            let roundHtml = '';
            roundsArr.forEach(r => {
                const sc = s.roundScores[r] !== undefined ? s.roundScores[r].toFixed(2) : '<span style="color:#444;">-</span>';
                roundHtml += `<td><strong style="color:var(--secondary);">${sc}</strong></td>`;
            });

            // Status Dropdown identical to Participants tab
            const statuses = ["pending", "approved", "Round 1", "Round 2", "Round 3", "Semi-Final", "Final Round", "Grand Finale", "Optional Round", "Winner", "waitlisted", "Eliminated"];
            let optHtml = statuses.map(st => `<option value="${st}" ${s.currentStatus === st ? 'selected' : ''}>${st}</option>`).join('');

            html += `
                <tr style="background:rgba(255,255,255,0.02); border-bottom:1px solid #222;">
                    <td><div class="badge" style="background:#222; color:#fff;">${rankHtml}</div></td>
                    <td>
                        <div style="display:flex; align-items:center; gap:10px;">
                            <img src="${s.photoBase64||'logo.jpg'}" style="width:40px; height:40px; border-radius:8px; object-fit:cover; border:1px solid var(--primary);">
                            <div>
                                <div style="font-weight:bold; color:#fff; font-size:0.95rem;">${s.name}</div>
                                <div style="color:#888; font-size:0.7rem; font-family:monospace;">${s.participantId}</div>
                            </div>
                        </div>
                    </td>
                    ${roundHtml}
                    <td><div style="font-size:1.2rem; font-weight:900; color:var(--gold);">${s.cumulative.toFixed(2)}</div></td>
                    <td>
                        <select onchange="updateStatus('${s.id}', this.value)" style="padding:6px; background:#111; color:white; border:1px solid #444; border-radius:6px; font-size:0.8rem; width:100%;">
                            ${optHtml}
                        </select>
                    </td>
                    <td>
                        <div style="display:flex; gap:6px;">
                            <button onclick="pushToLiveStage('${s.id}', '${s.currentStatus}')" class="btn btn-secondary" style="padding:6px 10px; font-size:0.75rem; background:#333; color:#fff;" title="Push to Live Stage"><i class="fa-solid fa-tower-broadcast"></i></button>
                            <button onclick="revealOnWall('${s.id}')" class="btn btn-secondary" style="padding:6px 10px; font-size:0.75rem; background:#28a745; color:#fff;" title="Reveal on Wall of Fame"><i class="fa-solid fa-star"></i></button>
                            <button onclick="openQuickScore('${s.id}', '${s.currentStatus}', '${s.name.replace(/'/g, "\\'")}')" class="btn btn-primary" style="padding:6px 10px; font-size:0.75rem;" title="Quick Judge Score"><i class="fa-solid fa-gavel"></i></button>
                        </div>
                    </td>
                </tr>
            `;
        });
        
        if (!html) html = '<tr><td colspan="10" style="text-align:center; padding:20px;">No participants found for this filter.</td></tr>';
        tbody.innerHTML = html;
    };

    window.autoPromoteTopX = async () => {
        const countStr = prompt("How many top participants to promote?", "5");
        if (!countStr || isNaN(countStr)) return;
        const targetCount = parseInt(countStr);
        const nextRound = prompt("Promote to which round?", "Round 2");
        if (!nextRound) return;
        const toPromote = lbData.slice(0, targetCount);
        if (!toPromote.length) { alert('No data in leaderboard.'); return; }
        if (!confirm(`Promote top ${toPromote.length} to "${nextRound}"?\n\n${toPromote.map((p,i) => `${i+1}. ${p.name}`).join('\n')}`)) return;
        try {
            const batch = db.batch();
            toPromote.forEach(p => batch.update(db.collection('participants').doc(p.id), { status: nextRound }));
            await batch.commit();
            alert(`✅ Promoted ${toPromote.length} participants to ${nextRound}!`);
            calculateLeaderboard();
        } catch(e) { alert('Error: ' + e.message); }
    };

    window.pushToLiveStage = async (singerId, round) => {
        try {
            await db.collection('live_state').doc('current').set({
                round: round,
                singer1: singerId,
                singer2: "",
                status: "on-air",
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            
            await db.collection('live_votes').get().then(snap => {
                const batch = db.batch();
                snap.forEach(doc => batch.delete(doc.ref));
                return batch.commit();
            });

            alert("Pushed to Live Stage successfully!");
        } catch(e) {
            console.error(e);
            alert("Error pushing to live stage");
        }
    };

    window.revealOnWall = async (singerId) => {
        try {
            const ref = db.collection('wall_of_fame_reveals').doc(singerId);
            const doc = await ref.get();
            if (doc.exists && doc.data().revealed) {
                // Already revealed, maybe hide? 
                await ref.set({ revealed: false }, { merge: true });
                alert("Candidate hidden from Wall.");
            } else {
                await ref.set({ revealed: true, timestamp: firebase.firestore.FieldValue.serverTimestamp() });
                alert("Candidate REVEALED on Wall of Fame!");
            }
        } catch(err) { console.error(err); alert("Error revealing on wall"); }
    };

    // ==========================================
    // QUICK SCORE & PERSISTENT JUDGES
    // ==========================================
    
    window.openManageJudgesModal = async () => {
        document.getElementById('manage-judges-modal').style.display = 'flex';
        await loadPersistentJudges();
    };

    window.closeManageJudgesModal = () => {
        document.getElementById('manage-judges-modal').style.display = 'none';
    };

    const loadPersistentJudges = async () => {
        try {
            const doc = await db.collection('config').doc('judges').get();
            persistentJudgesCache = doc.exists && doc.data().list ? doc.data().list : [];
            renderPersistentJudges();
        } catch(e) { console.error(e); }
    };

    window.renderPersistentJudges = () => {
        const list = document.getElementById('persistent-judges-list');
        if (!list) return;
        list.innerHTML = persistentJudgesCache.map((jName, i) => `
            <div style="display:flex; justify-content:space-between; align-items:center; background:#222; padding:10px; border-radius:8px;">
                <span style="color:white; font-weight:bold;">${jName}</span>
                <button onclick="removePersistentJudge(${i})" class="btn btn-danger" style="padding:4px 8px;"><i class="fa-solid fa-trash"></i></button>
            </div>
        `).join('');
    };

    window.addPersistentJudge = async () => {
        const input = document.getElementById('new-pjudge-name');
        const name = input.value.trim();
        if(!name) return;
        persistentJudgesCache.push(name);
        await db.collection('config').doc('judges').set({ list: persistentJudgesCache }, {merge:true});
        input.value = '';
        renderPersistentJudges();
    };

    window.removePersistentJudge = async (idx) => {
        persistentJudgesCache.splice(idx, 1);
        await db.collection('config').doc('judges').set({ list: persistentJudgesCache }, {merge:true});
        renderPersistentJudges();
    };

    window.openQuickScore = async (singerId, round, name) => {
        document.getElementById('quick-score-modal').style.display = 'flex';
        document.getElementById('qs-singer-id').value = singerId;
        document.getElementById('qs-round').value = round;
        document.getElementById('qs-singer-name').textContent = `${name} (${round})`;

        // Ensure we have judges loaded
        if (persistentJudgesCache.length === 0) await loadPersistentJudges();

        const container = document.getElementById('qs-judge-rows');
        container.innerHTML = '';
        
        // Check if scores already exist for this round
        let existingScores = {};
        try {
            const jDoc = await db.collection('judge_scores').doc(singerId).get();
            if (jDoc.exists && jDoc.data().round === round) {
                existingScores = jDoc.data().scores || {};
            }
        } catch(e){}

        if (persistentJudgesCache.length === 0) {
            container.innerHTML = '<div style="color:#aaa; font-size:0.8rem; text-align:center;">No persistent judges found. Manage Judges first!</div>';
        } else {
            persistentJudgesCache.forEach((jName, i) => {
                const existingVal = existingScores[jName] !== undefined ? existingScores[jName] : '';
                container.innerHTML += `
                    <div style="display:flex; align-items:center; gap:10px; background:#222; padding:10px; border-radius:8px;">
                        <span style="flex:1; color:var(--gold); font-weight:bold; font-size:0.9rem;">${jName}</span>
                        <input type="number" class="qs-score-input" data-jname="${jName}" min="0" max="10" step="0.5" value="${existingVal}" placeholder="10" style="width:80px; padding:10px; background:#111; color:white; border:1px solid #444; border-radius:6px; font-weight:bold; text-align:center;">
                    </div>
                `;
            });
        }
    };

    window.closeQuickScore = () => {
        document.getElementById('quick-score-modal').style.display = 'none';
    };

    window.saveQuickScore = async () => {
        const singerId = document.getElementById('qs-singer-id').value;
        const round = document.getElementById('qs-round').value;
        const inputs = document.querySelectorAll('.qs-score-input');
        
        let scores = {};
        inputs.forEach(input => {
            const jName = input.getAttribute('data-jname');
            const val = parseFloat(input.value);
            if (!isNaN(val)) scores[jName] = val;
        });

        if (Object.keys(scores).length === 0) {
            alert("Please enter at least one score.");
            return;
        }

        try {
            await db.collection('judge_scores').doc(singerId).set({
                singerId: singerId,
                round: round,
                scores: scores,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            
            alert("Scores saved successfully!");
            closeQuickScore();
            if (document.getElementById('leaderboard-panel').style.display !== 'none') {
                calculateLeaderboard();
            }
        } catch (error) {
            console.error(error);
            alert("Error saving scores: " + error.message);
        }
    };

    window.triggerGoldenBuzzer = async () => {
        if(!confirm("Are you sure you want to trigger the GOLDEN BUZZER? This will instantly promote them to the Grand Finale and trigger the live animation!")) return;
        
        const singerId = document.getElementById('qs-singer-id').value;
        try {
            // Promote to Grand Finale
            await db.collection('participants').doc(singerId).update({ status: 'Grand Finale' });
            
            // Trigger animation on live stage
            await db.collection('live_state').doc('current').set({
                golden_buzzer: true,
                golden_singer_id: singerId,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            
            // Auto reset buzzer flag after 10 seconds so it doesn't loop forever
            setTimeout(() => {
                db.collection('live_state').doc('current').update({ golden_buzzer: false });
            }, 10000);

            alert("GOLDEN BUZZER TRIGGERED!!!");
            closeQuickScore();
            if (document.getElementById('leaderboard-panel').style.display !== 'none') {
                calculateLeaderboard();
            }
        } catch(err) {
            console.error(err);
            alert("Error triggering Golden Buzzer");
        }
    };

    // Setup Auth Listener (At the end to ensure all functions are defined)
    auth.onAuthStateChanged(async (user) => {
        try {
            if (user) {
                let isAuthorized = false;
                let isMaster = (user.email === 'fmhellomachi@gmail.com');

                if (isMaster || AUTHORIZED_EMAILS.includes(user.email.toLowerCase())) {
                    isAuthorized = true;
                } else {
                    try {
                        const adminDoc = await db.collection('admins').doc(user.email).get();
                        if (adminDoc.exists) isAuthorized = true;
                    } catch (err) { console.error("Admin check failed", err); }
                }

                if (isAuthorized) {
                    if(loginBtn) loginBtn.style.display = 'none';
                    if(adminUserInfo) adminUserInfo.style.display = 'flex';
                    if(adminName) adminName.textContent = user.displayName;
                    if(lockedContent) lockedContent.style.display = 'none';
                    if(adminContent) adminContent.style.display = 'block';
                    
                    switchMainTab('participants');
                } else {
                    auth.signOut();
                    alert("Access Denied: " + user.email);
                }
            } else {
                if(loginBtn) loginBtn.style.display = 'block';
                if(adminUserInfo) adminUserInfo.style.display = 'none';
                if(lockedContent) lockedContent.style.display = 'block';
                if(adminContent) adminContent.style.display = 'none';
            }
        } catch (e) {
            console.error("Auth Listener Error:", e);
        }
    });
});

