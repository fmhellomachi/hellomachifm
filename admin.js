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

            if (isMaster) {
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

    if (loginBtn) loginBtn.addEventListener('click', () => auth.signInWithPopup(provider));
    if (logoutBtn) logoutBtn.addEventListener('click', () => auth.signOut());

    window.switchMainTab = (tabId) => {
        console.log("Switching to tab:", tabId);
        
        // Panels to toggle
        const panels = {
            'participants': getEl('participants-panel'),
            'cms': getEl('view-cms'),
            'admins': getEl('master-admin-section'),
            'live-control': getEl('live-control-panel'),
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
    async function fetchParticipantsForLive() {
        const s1 = getEl('live-singer-1');
        const s2 = getEl('live-singer-2');
        if (!s1 || !s2) return;

        s1.innerHTML = '<option value="">Loading...</option>';
        s2.innerHTML = '<option value="">Loading...</option>';

        try {
            const snap = await db.collection('participants').orderBy('name', 'asc').get();
            let options = '<option value="">-- Select Participant --</option>';
            snap.forEach(doc => {
                const data = doc.data();
                options += `<option value="${doc.id}">${data.name} (${data.status})</option>`;
            });
            s1.innerHTML = options;
            s2.innerHTML = options.replace('-- Select Participant --', '-- Optional Secondary --');

            const stateDoc = await db.collection('live_state').doc('current').get();
            if (stateDoc.exists) {
                const state = stateDoc.data();
                if(getEl('live-round')) getEl('live-round').value = state.round || "1";
                s1.value = state.singer1 || "";
                s2.value = state.singer2 || "";
                updateVotingUI(state.votingOpen);
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
                votingOpen: false, updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            
            // Clear current live votes
            const vSnap = await db.collection('live_votes').get();
            const batch = db.batch();
            vSnap.docs.forEach(doc => batch.delete(doc.ref));
            await batch.commit();

            alert("Stage Updated!");
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

    // --- Participants Logic ---
    async function fetchAdminData() {
        if (!tableBody) return;
        tableBody.innerHTML = '<tr><td colspan="7" style="text-align:center;">Loading participants...</td></tr>';
        try {
            const snap = await db.collection("participants").orderBy("registeredAt", "desc").get();
            tableBody.innerHTML = '';
            snap.forEach((doc) => {
                const data = doc.data();
                const id = doc.id;
                if (currentFilter !== 'all' && data.status !== currentFilter) return;
                const tr = document.createElement('tr');
                let bClass = data.status === 'pending' ? 'badge-pending' : 'badge-approved';
                const ph = data.phone.replace(/[^0-9]/g, '');
                
                // Professional WhatsApp Template
                const message = `Hi ${data.name}! 👋 This is Hello Machi FM. We are excited to inform you that you have been ${data.status === 'rejected' ? 'not selected' : 'SELECTED'} for ${data.status.toUpperCase()} of Super Singer 2026! 🎤 Check your status here: https://hello-machi-fm-6ebe4.web.app/supersinger.html`;
                const encodedMsg = encodeURIComponent(message);
                
                tr.innerHTML = `
                    <td data-label="PHOTO">${data.photoBase64 ? `<img src="${data.photoBase64}" style="width:50px;height:50px;border-radius:50%;object-fit:cover;">` : `<div style="width:50px;height:50px;border-radius:50%;background:#333;display:flex;align-items:center;justify-content:center;">${data.name.charAt(0)}</div>`}</td>
                    <td data-label="NAME">
                        <strong>${data.name}</strong><br>
                        <a href="https://wa.me/${ph}?text=${encodedMsg}" target="_blank" style="color:#25D366;font-size:0.85rem;"><i class="fa-brands fa-whatsapp"></i> Notify WhatsApp</a>
                    </td>
                    <td data-label="LOCATION" style="font-size:0.85rem;color:var(--text-muted);">
                        <i class="fa-solid fa-city"></i> ${data.city || 'N/A'}<br>
                        <small>${data.address || ''}</small>
                    </td>
                    <td data-label="LINK">${data.auditionLink ? `<a href="${data.auditionLink}" target="_blank" style="color:var(--primary);"><i class="fa-solid fa-play"></i> Audition</a>` : 'None'}</td>
                    <td data-label="SCORE"><div style="display:flex;gap:5px;"><input type="number" value="${data.judgeScore||0}" id="sc-${id}" style="width:45px;background:#222;color:white;border:1px solid #444;"><button onclick="saveScore('${id}')" style="background:var(--primary);border:none;padding:2px 5px;"><i class="fa-solid fa-save"></i></button></div></td>
                    <td data-label="STATUS">
                        <span class="badge ${bClass}">${data.status.toUpperCase()}</span><br>
                        <button onclick="toggleReveal('${id}', ${data.isRevealed})" style="margin-top:5px; font-size:0.7rem; background:${data.isRevealed?'#28a745':'#444'}; border:none; color:white; border-radius:4px; padding:2px 5px;">
                            ${data.isRevealed ? '<i class="fa-solid fa-eye"></i> Revealed' : '<i class="fa-solid fa-eye-slash"></i> Hidden'}
                        </button>
                    </td>
                    <td data-label="ACTIONS">
                        <select onchange="updateStatus('${id}', this.value)" style="background:#222;color:white;border:1px solid #444;padding:4px;">
                            <option value="pending" ${data.status==='pending'?'selected':''}>Pending</option>
                            <option value="Round 1" ${data.status==='Round 1'?'selected':''}>Round 1</option>
                            <option value="Round 2" ${data.status==='Round 2'?'selected':''}>Round 2</option>
                            <option value="Round 3" ${data.status==='Round 3'?'selected':''}>Round 3</option>
                            <option value="Final" ${data.status==='Final'?'selected':''}>Final</option>
                            <option value="waitlisted" ${data.status==='waitlisted'?'selected':''}>Waitlist</option>
                            <option value="Eliminated" ${data.status==='Eliminated'?'selected':''}>Eliminated</option>
                        </select>
                        <button class="action-btn btn-danger" onclick="deleteParticipant('${id}')"><i class="fa-solid fa-trash"></i></button>
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
            const updates = { status: s };
            // If advancing, hide until revealed
            if (s !== 'pending') updates.isRevealed = false;
            await db.collection("participants").doc(id).update(updates); 
            fetchAdminData(); 
        } catch(e){}
    };

    window.toggleReveal = async (id, currentVal) => {
        try {
            await db.collection("participants").doc(id).update({ isRevealed: !currentVal });
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

    // --- CMS ---
    let scheduleData = [];
    async function fetchCMS() {
        const doc = await db.collection('cms').doc('homepage').get();
        if(doc.exists) {
            getEl('cms-hero-title').value = doc.data().heroTitle || '';
            getEl('cms-hero-subtitle').value = doc.data().heroSubtitle || '';
            scheduleData = doc.data().scheduleBlocks || [];
            renderSchedule();
        }
    }
    window.saveCMS = async () => {
        await db.collection('cms').doc('homepage').set({
            heroTitle: getEl('cms-hero-title').value,
            heroSubtitle: getEl('cms-hero-subtitle').value,
            scheduleBlocks: scheduleData
        }, {merge:true});
        alert("Saved!");
    };
    window.addScheduleBlock = () => {
        scheduleData.push({ time: getEl('new-schedule-time').value, title: getEl('new-schedule-title').value, rj: getEl('new-schedule-rj').value });
        renderSchedule();
    };
    window.removeScheduleBlock = (i) => { scheduleData.splice(i,1); renderSchedule(); };
    function renderSchedule() {
        const list = getEl('cms-schedule-list');
        list.innerHTML = '';
        scheduleData.forEach((s, i) => {
            const d = document.createElement('div');
            d.innerHTML = `${s.time} - ${s.title} <button onclick="removeScheduleBlock(${i})">X</button>`;
            list.appendChild(d);
        });
    }

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
});
