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

            // 1. Check if it's the master admin
            if (user.email === 'fmhellomachi@gmail.com') {
                isAuthorized = true;
                isMaster = true;
            } else {
                // 2. If not master, check the 'admins' collection in Firestore
                try {
                    const adminDoc = await db.collection('admins').doc(user.email).get();
                    if (adminDoc.exists) {
                        isAuthorized = true;
                    }
                } catch (err) {
                    console.error("Error checking admin status:", err);
                }
            }

            if (isAuthorized) {
                // User is an Admin
                loginBtn.style.display = 'none';
                adminUserInfo.style.display = 'flex';
                adminName.textContent = user.displayName;
                lockedContent.style.display = 'none';
                adminContent.style.display = 'block';
                
                fetchAdminData();

                if (isMaster) {
                    masterAdminSection.style.display = 'block';
                    fetchAdminsList();
                } else {
                    masterAdminSection.style.display = 'none';
                }
            } else {
                // Unauthorized user
                auth.signOut();
                alert("Access Denied: Your email (" + user.email + ") is not authorized to view the Admin Dashboard.");
            }
        } else {
            // Logged out
            loginBtn.style.display = 'block';
            adminUserInfo.style.display = 'none';
            lockedContent.style.display = 'block';
            adminContent.style.display = 'none';
        }
    });

    if (loginBtn) {
        loginBtn.addEventListener('click', () => {
            auth.signInWithPopup(provider).catch((error) => {
                console.error("Auth Error:", error);
                alert("Login Failed: " + error.message + "\n\n(If you are using Incognito mode, Brave, or Safari, this might be because third-party cookies are blocked).");
            });
        });
    }

    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            auth.signOut();
        });
    }

    window.filterTable = (status) => {
        currentFilter = status;
        
        // Update tab styling
        const buttons = document.querySelectorAll('#admin-tabs button');
        buttons.forEach(btn => {
            btn.className = 'btn btn-secondary';
            if (btn.textContent.toLowerCase().includes(status.toLowerCase()) || (status === 'all' && btn.textContent === 'All')) {
                btn.className = 'btn btn-primary';
            }
        });
        
        fetchAdminData();
    };

    // Fetch Data
    async function fetchAdminData() {
        try {
            let q = db.collection("participants").orderBy("registeredAt", "desc");
            const querySnapshot = await q.get();
            tableBody.innerHTML = '';

            let hasRows = false;

            querySnapshot.forEach((doc) => {
                const data = doc.data();
                const id = doc.id;
                
                // Client-side filtering because of potential missing composite indexes
                if (currentFilter !== 'all' && data.status !== currentFilter) {
                    return;
                }
                
                hasRows = true;
                const tr = document.createElement('tr');
                
                let badgeClass = 'badge-pending';
                if(data.status !== 'pending') badgeClass = 'badge-approved';

                const waPhone = data.phone.replace(/[^0-9]/g, '');

                tr.innerHTML = `
                    <td>
                        ${data.photoBase64 ? `<img src="${data.photoBase64}" style="width:50px; height:50px; border-radius:50%; object-fit:cover;">` : `<div style="width:50px; height:50px; border-radius:50%; background:#333; color:white; display:flex; align-items:center; justify-content:center;">${data.name.charAt(0)}</div>`}
                    </td>
                    <td>
                        <strong>${data.name}</strong><br>
                        <a href="https://wa.me/${waPhone}" target="_blank" style="color:#25D366; text-decoration:none; font-size:0.85rem;"><i class="fa-brands fa-whatsapp"></i> ${data.phone}</a>
                    </td>
                    <td>
                        ${data.auditionLink ? `<a href="${data.auditionLink}" target="_blank" style="color:var(--primary); text-decoration:none;"><i class="fa-solid fa-play"></i> Link</a>` : '<span style="color:#666;">None</span>'}
                    </td>
                    <td>
                        <div style="margin-bottom: 5px;">Votes: <strong style="color:var(--primary);">${data.votes || 0}</strong></div>
                        <div style="display:flex; align-items:center; gap:5px;">
                            <label style="font-size:0.8rem;">Score:</label>
                            <input type="number" min="0" max="10" value="${data.judgeScore || 0}" id="score-${id}" style="width:50px; background:rgba(0,0,0,0.5); color:white; border:1px solid #444; padding:2px 5px; border-radius:4px;">
                            <button onclick="saveScore('${id}')" style="background:var(--primary); border:none; border-radius:4px; padding:2px 5px; cursor:pointer;"><i class="fa-solid fa-save"></i></button>
                        </div>
                    </td>
                    <td>
                        <span class="badge ${badgeClass}">${data.status.toUpperCase()}</span>
                    </td>
                    <td>
                        <select onchange="updateStatus('${id}', this.value)" style="background:rgba(0,0,0,0.5); color:white; border:1px solid #444; padding:5px; border-radius:4px; margin-right:5px;">
                            <option value="pending" ${data.status === 'pending' ? 'selected' : ''}>Pending</option>
                            <option value="Round 1" ${data.status === 'Round 1' ? 'selected' : ''}>Round 1</option>
                            <option value="Round 2" ${data.status === 'Round 2' ? 'selected' : ''}>Round 2</option>
                            <option value="Round 3" ${data.status === 'Round 3' ? 'selected' : ''}>Round 3</option>
                            <option value="Final" ${data.status === 'Final' ? 'selected' : ''}>Final</option>
                        </select>
                        <button class="action-btn btn-danger" onclick="deleteParticipant('${id}')" title="Delete Participant"><i class="fa-solid fa-trash"></i></button>
                    </td>
                `;
                tableBody.appendChild(tr);
            });

            if (!hasRows) {
                tableBody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 20px;">No participants found for '${currentFilter}'.</td></tr>`;
            }

        } catch (error) {
            console.error("Error fetching data:", error);
            tableBody.innerHTML = '<tr><td colspan="6" style="color: red; text-align: center;">Error loading data. ' + error.message + '</td></tr>';
        }
    }

    // Global Functions
    window.saveScore = async (id) => {
        const scoreInput = document.getElementById(`score-${id}`).value;
        const score = parseFloat(scoreInput) || 0;
        
        try {
            await db.collection("participants").doc(id).update({
                judgeScore: score
            });
            alert("Score saved!");
        } catch (error) {
            console.error("Error updating score:", error);
            alert("Failed to save score.");
        }
    };

    window.updateStatus = async (id, newStatus) => {
        try {
            await db.collection("participants").doc(id).update({
                status: newStatus
            });
            // Don't alert, just refresh to be snappy
            fetchAdminData();
        } catch (error) {
            console.error("Error updating:", error);
            alert("Failed to update status.");
        }
    };

    window.deleteParticipant = async (id) => {
        if(!confirm("Are you SURE you want to delete this participant permanently? This cannot be undone.")) return;
        
        try {
            await db.collection("participants").doc(id).delete();
            fetchAdminData();
        } catch (error) {
            console.error("Error deleting:", error);
            alert("Failed to delete.");
        }
    };

    // --- Admin Management Functions (Master Only) ---
    async function fetchAdminsList() {
        try {
            const querySnapshot = await db.collection("admins").get();
            adminListBody.innerHTML = '';
            
            querySnapshot.forEach((doc) => {
                const email = doc.id;
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${email}</td>
                    <td>
                        <button class="action-btn btn-danger" onclick="removeAdmin('${email}')" title="Revoke Access"><i class="fa-solid fa-trash"></i> Remove</button>
                    </td>
                `;
                adminListBody.appendChild(tr);
            });
        } catch (error) {
            console.error("Error fetching admins:", error);
        }
    }

    window.addAdmin = async () => {
        const emailInput = document.getElementById('new-admin-email');
        const email = emailInput.value.trim().toLowerCase();
        
        if (!email || !email.includes('@')) {
            alert("Please enter a valid email address.");
            return;
        }

        if (email === 'fmhellomachi@gmail.com') {
            alert("This email is already the Master Admin.");
            return;
        }

        try {
            // Document ID is the email address for easy lookup
            await db.collection("admins").doc(email).set({
                addedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            alert(`${email} has been granted Admin Access!`);
            emailInput.value = '';
            fetchAdminsList();
        } catch (error) {
            console.error("Error adding admin:", error);
            alert("Failed to add admin. Check console.");
        }
    };

    window.removeAdmin = async (email) => {
        if(!confirm(`Are you sure you want to revoke admin access for ${email}?`)) return;
        
        try {
            await db.collection("admins").doc(email).delete();
            fetchAdminsList();
        } catch (error) {
            console.error("Error removing admin:", error);
            alert("Failed to remove admin.");
        }
    };
});
