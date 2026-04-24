document.addEventListener('DOMContentLoaded', () => {
    const loginBtn = document.getElementById('admin-login-btn');
    const logoutBtn = document.getElementById('admin-logout-btn');
    const adminUserInfo = document.getElementById('admin-user-info');
    const adminName = document.getElementById('admin-name');
    const adminContent = document.getElementById('admin-content');
    const lockedContent = document.getElementById('locked-content');
    const tableBody = document.getElementById('participants-table-body');

    const provider = new firebase.auth.GoogleAuthProvider();
    let currentFilter = 'all';

    const masterAdminSection = document.getElementById('master-admin-section');
    const adminListBody = document.getElementById('admin-list-body');

    // Setup Auth Listener
    auth.onAuthStateChanged(async (user) => {
        if (user) {
            let isAuthorized = false;
            let isMaster = false;

            if (user.email === 'fmhellomachi@gmail.com') {
                isAuthorized = true;
                isMaster = true;
            } else {
                try {
                    const adminDoc = await db.collection('admins').doc(user.email).get();
                    if (adminDoc.exists) isAuthorized = true;
                } catch (err) { console.error(err); }
            }

            if (isAuthorized) {
                loginBtn.style.display = 'none';
                adminUserInfo.style.display = 'flex';
                adminName.textContent = user.displayName;
                lockedContent.style.display = 'none';
                adminContent.style.display = 'block';
                
                switchMainTab('participants');

                if (isMaster) {
                    masterAdminSection.style.display = 'block';
                    fetchAdminsList();
                } else {
                    masterAdminSection.style.display = 'none';
                }
            } else {
                auth.signOut();
                alert("Access Denied.");
            }
        } else {
            loginBtn.style.display = 'block';
            adminUserInfo.style.display = 'none';
            lockedContent.style.display = 'block';
            adminContent.style.display = 'none';
        }
    });

    if (loginBtn) loginBtn.addEventListener('click', () => auth.signInWithPopup(provider));
    if (logoutBtn) logoutBtn.addEventListener('click', () => auth.signOut());

    window.switchMainTab = (tabId) => {
        // Hide all panels
        document.querySelectorAll('.main-panel').forEach(p => p.style.display = 'none');
        document.getElementById('view-cms').style.display = 'none';
        document.getElementById('master-admin-section').style.display = 'none';
        document.getElementById('live-control-panel').style.display = 'none';

        // Show selected panel
        if (tabId === 'participants') {
            document.getElementById('participants-panel').style.display = 'block';
            fetchAdminData();
        } else if (tabId === 'cms') {
            document.getElementById('view-cms').style.display = 'block';
            fetchCMS();
        } else if (tabId === 'leaderboard') {
            document.getElementById('leaderboard-panel').style.display = 'block';
            calculateLeaderboard();
        } else if (tabId === 'admins') {
            document.getElementById('master-admin-section').style.display = 'block';
            fetchAdminsList();
        } else if (tabId === 'live-control') {
            document.getElementById('live-control-panel').style.display = 'block';
            fetchParticipantsForLive();
            listenToLiveStats();
        }

        // Update active button state
        document.querySelectorAll('#admin-content .btn').forEach(btn => {
            btn.classList.remove('btn-primary');
            btn.classList.add('btn-secondary');
        });
        // Find the button that was clicked (based on tabId)
        const clickedBtn = Array.from(document.querySelectorAll('#admin-content li')).find(li => li.getAttribute('onclick').includes(tabId));
        if (clickedBtn) {
            clickedBtn.classList.add('btn-primary');
            clickedBtn.classList.remove('btn-secondary');
        }
    };

    // --- Live Control Room Logic ---
    async function fetchParticipantsForLive() {
        const s1 = document.getElementById('live-singer-1');
        const s2 = document.getElementById('live-singer-2');
        if (!s1 || !s2) return;

        s1.innerHTML = '<option value="">Loading participants...</option>';
        s2.innerHTML = '<option value="">Loading participants...</option>';

        try {
            // Fetch ALL participants so the list is never empty
            const snap = await db.collection('participants').orderBy('name', 'asc').get();
            
            let options = '<option value="">-- Select Participant --</option>';
            snap.forEach(doc => {
                const data = doc.data();
                options += `<option value="${doc.id}">${data.name} (${data.status})</option>`;
            });

            s1.innerHTML = options;
            s2.innerHTML = options.replace('-- Select Participant --', '-- Select Secondary (Optional) --');

            // Pre-fill current live state
            const stateDoc = await db.collection('live_state').doc('current').get();
            if (stateDoc.exists) {
                const state = stateDoc.data();
                document.getElementById('live-round').value = state.round || "1";
                s1.value = state.singer1 || "";
                s2.value = state.singer2 || "";
                updateVotingUI(state.votingOpen);
            }
        } catch (err) {
            console.error("Live fetch error:", err);
            s1.innerHTML = '<option value="">Error loading data</option>';
        }
    }

    window.updateLiveState = async (status) => {
        const round = document.getElementById('live-round').value;
        const singer1 = document.getElementById('live-singer-1').value;
        const singer2 = document.getElementById('live-singer-2').value;

        if (!singer1 && status === 'on-air') {
            alert("Please select at least one singer!");
            return;
        }

        try {
            await db.collection('live_state').doc('current').set({
                status: status,
                round: round,
                singer1: singer1,
                singer2: singer2,
                votingOpen: false, // Always close voting when changing singers
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            
            // Clear previous votes when starting a new performance
            const voteSnap = await db.collection('live_votes').get();
            const batch = db.batch();
            voteSnap.docs.forEach(doc => batch.delete(doc.ref));
            await batch.commit();

            alert("Live Stage Updated!");
            updateVotingUI(false);
        } catch (err) { console.error(err); }
    };

    window.toggleVoting = async (isOpen) => {
        try {
            await db.collection('live_state').doc('current').update({
                votingOpen: isOpen
            });
            updateVotingUI(isOpen);
        } catch (err) { console.error(err); }
    };

    window.resetLiveState = () => {
        if(confirm("Reset the stage? This will clear all live data.")) {
            updateLiveState('idle');
        }
    };

    function updateVotingUI(isOpen) {
        const badge = document.getElementById('voting-status-badge');
        if (isOpen) {
            badge.innerHTML = 'Status: <strong style="color:#28a745;">OPEN</strong>';
            badge.style.background = 'rgba(40, 167, 69, 0.1)';
        } else {
            badge.innerHTML = 'Status: <strong style="color:#dc3545;">CLOSED</strong>';
            badge.style.background = 'rgba(220, 53, 69, 0.1)';
        }
    }

    let statsUnsubscribe = null;
    function listenToLiveStats() {
        if (statsUnsubscribe) statsUnsubscribe();
        
        statsUnsubscribe = db.collection('live_votes').onSnapshot(snap => {
            const count = snap.size;
            let total = 0;
            snap.forEach(doc => total += doc.data().score);
            const avg = count > 0 ? (total / count).toFixed(1) : "0.0";

            document.getElementById('stat-total-votes').textContent = count;
            document.getElementById('stat-avg-score').textContent = avg;
        });
    }

    // --- Original Participant Logic ---
    async function fetchAdminData() {
        try {
            let q = db.collection("participants").orderBy("registeredAt", "desc");
            const querySnapshot = await q.get();
            tableBody.innerHTML = '';
            querySnapshot.forEach((doc) => {
                const data = doc.data();
                const id = doc.id;
                if (currentFilter !== 'all' && data.status !== currentFilter) return;
                const tr = document.createElement('tr');
                let badgeClass = data.status === 'pending' ? 'badge-pending' : 'badge-approved';
                const waPhone = data.phone.replace(/[^0-9]/g, '');
                tr.innerHTML = `
                    <td data-label="PHOTO">${data.photoBase64 ? `<img src="${data.photoBase64}" class="singer-preview" style="width:50px;height:50px;border-radius:50%;object-fit:cover;">` : `<div style="width:50px;height:50px;border-radius:50%;background:#333;color:white;display:flex;align-items:center;justify-content:center;">${data.name.charAt(0)}</div>`}</td>
                    <td data-label="NAME"><strong>${data.name}</strong><br><a href="https://wa.me/${waPhone}" target="_blank" style="color:#25D366;text-decoration:none;font-size:0.85rem;"><i class="fa-brands fa-whatsapp"></i> ${data.phone}</a></td>
                    <td data-label="EMAIL" style="font-size:0.85rem;color:var(--text-muted);">${data.email || 'N/A'}</td>
                    <td data-label="LINK">${data.auditionLink ? `<a href="${data.auditionLink}" target="_blank" style="color:var(--primary);text-decoration:none;"><i class="fa-solid fa-play"></i> Link</a>` : '<span style="color:#666;">None</span>'}</td>
                    <td data-label="SCORE">
                        <div style="display:flex;align-items:center;gap:5px;">
                            <input type="number" min="0" max="10" value="${data.judgeScore || 0}" id="score-${id}" style="width:50px;background:rgba(0,0,0,0.5);color:white;border:1px solid #444;padding:2px 5px;border-radius:4px;">
                            <button onclick="saveScore('${id}')" style="background:var(--primary);border:none;border-radius:4px;padding:2px 5px;cursor:pointer;"><i class="fa-solid fa-save"></i></button>
                        </div>
                    </td>
                    <td data-label="STATUS"><span class="badge ${badgeClass}">${data.status.toUpperCase()}</span></td>
                    <td data-label="ACTIONS">
                        <select onchange="updateStatus('${id}', this.value)" style="background:rgba(0,0,0,0.5);color:white;border:1px solid #444;padding:5px;border-radius:4px;">
                            <option value="pending" ${data.status === 'pending' ? 'selected' : ''}>Pending</option>
                            <option value="Round 1" ${data.status === 'Round 1' ? 'selected' : ''}>Round 1</option>
                            <option value="Round 2" ${data.status === 'Round 2' ? 'selected' : ''}>Round 2</option>
                            <option value="Round 3" ${data.status === 'Round 3' ? 'selected' : ''}>Round 3</option>
                            <option value="Final" ${data.status === 'Final' ? 'selected' : ''}>Final</option>
                        </select>
                        <button class="action-btn btn-danger" onclick="deleteParticipant('${id}')"><i class="fa-solid fa-trash"></i></button>
                    </td>
                `;
                tableBody.appendChild(tr);
            });
        } catch (error) { console.error(error); }
    }

    window.saveScore = async (id) => {
        const score = parseFloat(document.getElementById(`score-${id}`).value) || 0;
        try {
            await db.collection("participants").doc(id).update({ judgeScore: score });
            alert("Score saved!");
        } catch (err) { console.error(err); }
    };

    window.updateStatus = async (id, newStatus) => {
        try {
            await db.collection("participants").doc(id).update({ status: newStatus });
            fetchAdminData();
        } catch (err) { console.error(err); }
    };

    window.deleteParticipant = async (id) => {
        if(!confirm("Are you sure?")) return;
        try {
            await db.collection("participants").doc(id).delete();
            fetchAdminData();
        } catch (err) { console.error(err); }
    };

    // --- Admin Management ---
    async function fetchAdminsList() {
        try {
            const snap = await db.collection("admins").get();
            adminListBody.innerHTML = '';
            snap.forEach((doc) => {
                const tr = document.createElement('tr');
                tr.innerHTML = `<td>${doc.id}</td><td><button class="action-btn btn-danger" onclick="removeAdmin('${doc.id}')"><i class="fa-solid fa-trash"></i></button></td>`;
                adminListBody.appendChild(tr);
            });
        } catch (err) { console.error(err); }
    }

    window.addAdmin = async () => {
        const email = document.getElementById('new-admin-email').value.trim().toLowerCase();
        if (!email.includes('@')) return;
        try {
            await db.collection("admins").doc(email).set({ addedAt: firebase.firestore.FieldValue.serverTimestamp() });
            fetchAdminsList();
        } catch (err) { console.error(err); }
    };

    window.removeAdmin = async (email) => {
        if(!confirm("Remove?")) return;
        try {
            await db.collection("admins").doc(email).delete();
            fetchAdminsList();
        } catch (err) { console.error(err); }
    };

    // --- CMS Logic ---
    let scheduleBlocksData = [];
    async function fetchCMS() {
        const doc = await db.collection('cms').doc('homepage').get();
        if (doc.exists) {
            const data = doc.data();
            document.getElementById('cms-hero-title').value = data.heroTitle || '';
            document.getElementById('cms-hero-subtitle').value = data.heroSubtitle || '';
            scheduleBlocksData = data.scheduleBlocks || [];
            renderScheduleBlocks();
        }
    }

    window.saveCMS = async () => {
        try {
            await db.collection('cms').doc('homepage').set({
                heroTitle: document.getElementById('cms-hero-title').value,
                heroSubtitle: document.getElementById('cms-hero-subtitle').value,
                scheduleBlocks: scheduleBlocksData,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            alert("Homepage updated!");
        } catch (err) { console.error(err); }
    };

    window.addScheduleBlock = () => {
        const t = document.getElementById('new-schedule-time').value;
        const tt = document.getElementById('new-schedule-title').value;
        const rj = document.getElementById('new-schedule-rj').value;
        if (!t || !tt) return;
        scheduleBlocksData.push({ time: t, title: tt, rj: rj });
        renderScheduleBlocks();
    };

    window.removeScheduleBlock = (i) => {
        scheduleBlocksData.splice(i, 1);
        renderScheduleBlocks();
    };

    function renderScheduleBlocks() {
        const list = document.getElementById('cms-schedule-list');
        list.innerHTML = '';
        scheduleBlocksData.forEach((block, i) => {
            const div = document.createElement('div');
            div.className = 'cms-schedule-item';
            div.innerHTML = `<span>${block.time} - ${block.title} (RJ: ${block.rj})</span> <button onclick="removeScheduleBlock(${i})"><i class="fa-solid fa-trash"></i></button>`;
            list.appendChild(div);
        });
    }
    async function calculateLeaderboard() {
        const body = document.getElementById('leaderboard-body');
        if (!body) return;
        body.innerHTML = '<tr><td colspan="6" style="text-align:center;">Calculating scores...</td></tr>';

        try {
            const participantsSnap = await db.collection('participants').get();
            const votesSnap = await db.collection('live_votes').get();
            
            const results = [];

            participantsSnap.forEach(doc => {
                const p = doc.data();
                const id = doc.id;
                
                const pVotes = votesSnap.docs.filter(v => v.data().singerId === id).map(v => v.data().score);
                const audienceAvg = pVotes.length > 0 ? (pVotes.reduce((a,b) => a+b, 0) / pVotes.length) : 0;
                
                const judgeScore = p.judgeScore || 0;
                const totalScore = (judgeScore * 6) + (audienceAvg * 4); // 60/40 Weight

                results.push({
                    name: p.name,
                    photo: p.photoBase64,
                    judgeScore: judgeScore,
                    audienceAvg: audienceAvg.toFixed(1),
                    totalScore: totalScore.toFixed(1),
                    status: p.status
                });
            });

            results.sort((a,b) => b.totalScore - a.totalScore);

            body.innerHTML = '';
            results.forEach((res, index) => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td data-label="RANK" style="font-size:1.5rem; font-weight:800; color:var(--primary);">#${index + 1}</td>
                    <td data-label="SINGER">
                        <div style="display:flex; align-items:center; gap:10px;">
                            <img src="${res.photo || 'logo.jpg'}" style="width:40px; height:40px; border-radius:50%; object-fit:cover;">
                            <strong>${res.name}</strong>
                        </div>
                    </td>
                    <td data-label="JUDGE">${res.judgeScore}</td>
                    <td data-label="AUDIENCE">${res.audienceAvg}</td>
                    <td data-label="TOTAL"><strong style="color:var(--secondary); font-size:1.2rem;">${res.totalScore}</strong></td>
                    <td data-label="STATUS"><span class="badge ${res.status === 'Eliminated' ? 'badge-pending' : 'badge-approved'}">${res.status}</span></td>
                `;
                body.appendChild(tr);
            });
        } catch (err) { console.error(err); }
    }
});
