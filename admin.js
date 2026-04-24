document.addEventListener('DOMContentLoaded', () => {
    const loginBtn = document.getElementById('admin-login-btn');
    const logoutBtn = document.getElementById('admin-logout-btn');
    const adminUserInfo = document.getElementById('admin-user-info');
    const adminName = document.getElementById('admin-name');
    const adminContent = document.getElementById('admin-content');
    const lockedContent = document.getElementById('locked-content');
    const tableBody = document.getElementById('participants-table-body');

    const provider = new firebase.auth.GoogleAuthProvider();

    // Setup Auth Listener
    auth.onAuthStateChanged((user) => {
        if (user) {
            // User logged in
            loginBtn.style.display = 'none';
            adminUserInfo.style.display = 'flex';
            adminName.textContent = user.displayName;
            lockedContent.style.display = 'none';
            adminContent.style.display = 'block';
            
            // Load Data
            fetchAdminData();
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

    // Fetch Data
    async function fetchAdminData() {
        try {
            // Sort by registration time
            const querySnapshot = await db.collection("participants").orderBy("registeredAt", "desc").get();
            tableBody.innerHTML = '';

            if (querySnapshot.empty) {
                tableBody.innerHTML = '<tr><td colspan="6" style="text-align: center;">No participants registered yet.</td></tr>';
                return;
            }

            querySnapshot.forEach((doc) => {
                const data = doc.data();
                const id = doc.id;
                
                const tr = document.createElement('tr');
                
                // Determine Badge Class
                let badgeClass = 'badge-pending';
                if(data.status !== 'pending') badgeClass = 'badge-approved';

                // Format Phone for WhatsApp Link
                const waPhone = data.phone.replace(/[^0-9]/g, '');

                tr.innerHTML = `
                    <td>
                        <strong>${data.name}</strong><br>
                        <span style="font-size:0.8rem; color:var(--text-muted);">${data.email}</span>
                    </td>
                    <td>
                        ${data.phone}<br>
                        <a href="https://wa.me/${waPhone}" target="_blank" style="color:#25D366; text-decoration:none; font-size:0.85rem;"><i class="fa-brands fa-whatsapp"></i> Message</a>
                    </td>
                    <td>
                        <a href="${data.auditionLink}" target="_blank" style="color:var(--primary); text-decoration:none;"><i class="fa-solid fa-play"></i> Watch Link</a>
                    </td>
                    <td><strong style="color:var(--primary);">${data.votes || 0}</strong></td>
                    <td>
                        <span class="badge ${badgeClass}">${data.status.toUpperCase()}</span>
                    </td>
                    <td>
                        ${data.status === 'pending' ? 
                            `<button class="action-btn" onclick="updateStatus('${id}', 'approved')" title="Approve & Show on Voting Page"><i class="fa-solid fa-check"></i> Approve</button>` : 
                            `<button class="action-btn" onclick="updateStatus('${id}', 'Round 2')" title="Move to Round 2"><i class="fa-solid fa-arrow-up"></i> R2</button>`
                        }
                        <button class="action-btn btn-danger" onclick="deleteParticipant('${id}')" title="Delete Participant"><i class="fa-solid fa-trash"></i></button>
                    </td>
                `;
                tableBody.appendChild(tr);
            });
        } catch (error) {
            console.error("Error fetching data:", error);
            tableBody.innerHTML = '<tr><td colspan="6" style="color: red; text-align: center;">Error loading data. ' + error.message + '</td></tr>';
        }
    }

    // Global Functions for buttons
    window.updateStatus = async (id, newStatus) => {
        if(!confirm(`Are you sure you want to update this participant to: ${newStatus}?`)) return;
        
        try {
            await db.collection("participants").doc(id).update({
                status: newStatus
            });
            alert(`Participant updated to ${newStatus}.`);
            fetchAdminData(); // Refresh table
        } catch (error) {
            console.error("Error updating:", error);
            alert("Failed to update status.");
        }
    };

    window.deleteParticipant = async (id) => {
        if(!confirm("Are you SURE you want to delete this participant permanently? This cannot be undone.")) return;
        
        try {
            await db.collection("participants").doc(id).delete();
            fetchAdminData(); // Refresh table
        } catch (error) {
            console.error("Error deleting:", error);
            alert("Failed to delete.");
        }
    };
});
