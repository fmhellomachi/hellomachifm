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

    // Setup Auth Listener
    auth.onAuthStateChanged(async (user) => {
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
    });

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
            if (stateDoc.exists) {
                const state = stateDoc.data();
                savedRound = state.round || 'Round 1';
                savedS1 = state.singer1 || '';
                savedS2 = state.singer2 || '';
                updateVotingUI(state.votingOpen);
            }

            // Set round dropdown to saved value
            if (roundSel) roundSel.value = savedRound;

            // Populate singers for that round
            populateSingerDropdowns(savedRound);

            // Restore previous selections if still valid for this round
            if (savedS1) s1.value = savedS1;
            if (savedS2) s2.value = savedS2;

            // Re-populate singers whenever round changes
            if (roundSel) {
                roundSel.onchange = () => {
                    populateSingerDropdowns(roundSel.value);
                };
            }

        } catch (err) { console.error(err); }
    }

    window.updateLiveState = async (status) => {
        const round = getEl('live-round').value;
        const s1 = getEl('live-singer-1').value;
        const s2 = getEl('live-singer-2').value;

        if (!s1 && status === 'on-air') { alert("Select a singer!"); return; }

        try {
            await db.collection('live_state').doc('current').set({
                status: status, round: round, singer1: s1, singer2: s2,
                votingOpen: false, scoreRevealStep: 0, updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            
            // Clear current live votes
            const vSnap = await db.collection('live_votes').get();
            const batch = db.batch();
            vSnap.docs.forEach(doc => batch.delete(doc.ref));
            await batch.commit();

            alert("Stage Updated! Scores reset.");
            updateVotingUI(false);
        } catch (err) { console.error(err); }
    };

    window.toggleVoting = async (isOpen) => {
        try {
            await db.collection('live_state').doc('current').update({ votingOpen: isOpen });
            updateVotingUI(isOpen);
        } catch (err) { console.error(err); }
    };

    window.resetLiveState = () => { if(confirm("Reset Stage?")) updateLiveState('idle'); };

    function updateVotingUI(isOpen) {
        const badge = getEl('voting-status-badge');
        if(!badge) return;
        badge.innerHTML = isOpen ? 'Status: <strong style="color:#28a745;">OPEN</strong>' : 'Status: <strong style="color:#dc3545;">CLOSED</strong>';
        badge.style.background = isOpen ? 'rgba(40,167,69,0.1)' : 'rgba(220,53,69,0.1)';
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
                    <td data-label="PHOTO">${data.photoBase64 ? `<img src="${data.photoBase64}" style="width:60px;height:60px;border-radius:8px;object-fit:contain;background:#000;border:1px solid #333;">` : `<div style="width:60px;height:60px;border-radius:8px;background:#333;display:flex;align-items:center;justify-content:center;">${data.name ? data.name.charAt(0) : '?'}</div>`}</td>
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

    // ---- Photo preview inside modal ----
    const editPhotoFile = document.getElementById('edit-photo-file');
    const editPhotoPreview = document.getElementById('edit-photo-preview');
    let editPhotoBase64 = null;
    if (editPhotoFile) {
        editPhotoFile.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                // Compress to 250x250
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const MAX_WIDTH = 800;
                    const MAX_HEIGHT = 800;
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
                    editPhotoBase64 = canvas.toDataURL('image/jpeg', 0.85);
                    editPhotoPreview.src = editPhotoBase64;
                    editPhotoPreview.style.display = 'block';
                    editPhotoPreview.style.borderRadius = '12px'; // Rounded corners instead of circle
                };
                img.src = ev.target.result;
            };
            reader.readAsDataURL(file);
        });
    }

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
    // ====================================================
    let currentJudgeSingerId = null;
    let currentJudgeSingerName = 'Unknown';
    let judgeScoresUnsub = null;
    let audienceScoresUnsub = null;

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

    // Add a judge row in the panel
    window.addJudgeRow = () => {
        const name = (document.getElementById('new-judge-name').value || '').trim();
        if (!name) { alert('Enter a judge name first'); return; }
        document.getElementById('new-judge-name').value = '';
        const container = document.getElementById('judge-rows');
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;gap:10px;';
        row.innerHTML = `
            <span style="flex:1;font-size:0.85rem;font-weight:bold;color:#ccc;">${name}</span>
            <div style="display:flex;align-items:center;gap:6px;">
                <input type="number" min="0" max="10" step="0.5" value="5" 
                    data-judge="${name}"
                    style="width:70px;background:#1a1a24;border:1px solid #555;color:#FFD700;padding:7px;border-radius:8px;font-size:1rem;font-weight:900;text-align:center;">
                <span style="font-size:0.7rem;color:#666;">/ 10</span>
            </div>
            <button onclick="this.parentElement.remove()" style="background:transparent;border:1px solid #444;color:#888;padding:5px 8px;border-radius:6px;cursor:pointer;">✕</button>
        `;
        container.appendChild(row);
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
            snap.forEach(doc => { if (doc.data().score) votes.push(doc.data().score); });
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
        if (j === 0 && a === 0) { cEl.textContent = '—'; return; }
        cEl.textContent = (j * 0.6 + a * 0.4).toFixed(2);
    }
});
