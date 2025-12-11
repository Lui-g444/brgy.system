// ==========================================
// 1. CONFIGURATION (Supabase & EmailJS)
// ==========================================
const SUPABASE_URL = 'https://gjtpnwjboutksfomrsfa.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdqdHBud2pib3V0a3Nmb21yc2ZhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUxMzE4MzcsImV4cCI6MjA4MDcwNzgzN30.54rFgEWNjggqDIRdbCnffCt8rva_qnrkQOxHIXhbqIM';

// *** REPLACE THESE WITH YOUR EMAILJS KEYS ***
const EMAIL_SERVICE_ID = "service_o1cj7bf";   
const EMAIL_TEMPLATE_ID = "template_bfca4pn"; 
const EMAIL_PUBLIC_KEY = "X4uWsTwC1QEeEByTY";   

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Global State
let currentResidentsFilter = '';
let currentCertificatesFilter = '';
let currentBlotterFilter = '';
let notificationFilter = 'all'; // 'all', 'cert', 'report'

// Initialize EmailJS
(function(){
    if(window.emailjs) emailjs.init(EMAIL_PUBLIC_KEY);
})();

// ==========================================
// 2. UTILITY FUNCTIONS
// ==========================================

const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    try {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    } catch (error) {
        console.error('Error formatting date:', error);
        return 'Invalid Date';
    }
};

const hashPassword = (password) => {
    return btoa(password); 
};

const validateEmail = (email) => {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
};

const checkPasswordStrength = (password) => {
    let strength = 0;
    if (password.length >= 8) strength++;
    if (/[a-z]/.test(password)) strength++;
    if (/[A-Z]/.test(password)) strength++;
    if (/[0-9]/.test(password)) strength++;
    if (/[^A-Za-z0-9]/.test(password)) strength++;
    return strength;
};

// Helper: Send Real Email via EmailJS
const sendRealEmail = async (toEmail, subject, body) => {
    if (!toEmail || toEmail.includes('@example.com')) return;
    if (!window.emailjs) return console.error('EmailJS not loaded');

    const templateParams = {
        to_email: toEmail,
        subject: subject,
        message: body
    };

    try {
        await emailjs.send(EMAIL_SERVICE_ID, EMAIL_TEMPLATE_ID, templateParams);
        console.log(`Email sent to ${toEmail}`);
    } catch (error) {
        console.error('Failed to send email:', error);
    }
};

// ==========================================
// 3. NOTIFICATION SYSTEM (FIXED)
// ==========================================

const sendNotification = async (residentId, title, message) => {
    try {
        // 1. In-App Notification
        await supabase.from('notifications').insert([{ resident_id: residentId, title, message }]);
        
        // 2. Email Notification
        const { data: resident } = await supabase.from('residents').select('email, name').eq('id', residentId).single();
        if (resident && resident.email) {
            const emailBody = `Hi ${resident.name},\n\n${message}\n\n- Barangay Panlaitan`;
            await sendRealEmail(resident.email, title, emailBody);
        }
    } catch (e) { console.error('Notification failed', e); }
};

const showToast = (title, message, type = 'info') => {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    let icon = 'fa-info-circle', color = 'text-primary';
    if (type === 'warning') { icon = 'fa-exclamation-circle'; color = 'text-warning'; }
    if (type === 'success') { icon = 'fa-check-circle'; color = 'text-success'; }
    if (type === 'danger') { icon = 'fa-bell'; color = 'text-danger'; }

    const id = 'toast-' + Date.now();
    const html = `
        <div id="${id}" class="toast" role="alert" aria-live="assertive" aria-atomic="true">
            <div class="toast-header"><i class="fas ${icon} ${color} me-2"></i><strong class="me-auto">${title}</strong><small>Just now</small><button type="button" class="btn-close" data-bs-dismiss="toast"></button></div>
            <div class="toast-body">${message}</div>
        </div>`;

    container.insertAdjacentHTML('beforeend', html);
    const el = document.getElementById(id);
    const toast = new bootstrap.Toast(el, { delay: 5000 });
    toast.show();
    el.addEventListener('hidden.bs.toast', () => el.remove());
};

window.setNotificationFilter = (filter) => { notificationFilter = filter; loadNotifications(); };

window.deleteNotification = async (id, event) => {
    if (event) event.stopPropagation();
    if (confirm('Delete this notification?')) {
        await supabase.from('notifications').delete().eq('id', id);
        loadNotifications();
    }
};

window.clearAllNotifications = async () => {
    const user = JSON.parse(sessionStorage.getItem('currentUser'));
    if (!user || !user.resident_id) return;
    if (confirm('Clear ALL notifications?')) {
        await supabase.from('notifications').delete().eq('resident_id', user.resident_id);
        loadNotifications();
    }
};

// Unified Loader (Admin Tasks + Resident Messages)
const loadNotifications = async () => {
    const user = JSON.parse(sessionStorage.getItem('currentUser'));
    if (!user) return;

    const listContainer = document.getElementById('modal-notification-list');
    const badge = document.getElementById('notification-badge');
    const clearBtn = document.getElementById('btn-clear-notifs');
    if (!listContainer) return;

    listContainer.innerHTML = '<div class="text-center py-3"><i class="fas fa-spinner fa-spin"></i> Loading...</div>';

    try {
        // ADMIN: Pending Tasks
        if (user.role === 'admin') {
            if(clearBtn) clearBtn.style.display = 'none';

            const [certs, reports] = await Promise.all([
                supabase.from('certificates').select('*').eq('status', 'Requested').order('request_date', { ascending: false }),
                supabase.from('blotter_reports').select('*').eq('status', 'Open').order('date_reported', { ascending: false })
            ]);

            let combined = [
                ...(certs.data || []).map(c => ({ type: 'cert', title: 'New Certificate Request', message: `${c.resident_name}: ${c.document_type}`, date: c.request_date })),
                ...(reports.data || []).map(r => ({ type: 'report', title: 'New Incident Report', message: `[${r.incident_type}] by ${r.complainant}`, date: r.date_reported }))
            ];

            if (notificationFilter === 'cert') combined = combined.filter(i => i.type === 'cert');
            if (notificationFilter === 'report') combined = combined.filter(i => i.type === 'report');

            listContainer.innerHTML = '';
            if (combined.length === 0) {
                listContainer.innerHTML = `<div class="text-center py-4 text-muted">No pending items</div>`;
                if (badge) badge.style.display = 'none';
            } else {
                if (badge) { badge.textContent = combined.length; badge.style.display = 'inline-block'; }
                combined.forEach(item => {
                    const action = item.type === 'cert' ? "showPage('certificates')" : "showPage('blotter')";
                    const icon = item.type === 'cert' ? "fa-file-alt text-primary" : "fa-exclamation-triangle text-danger";
                    listContainer.innerHTML += `
                        <div class="list-group-item list-group-item-action p-3" onclick="${action}; bootstrap.Modal.getInstance(document.getElementById('notificationModal')).hide();" style="cursor: pointer;">
                            <div class="d-flex w-100 justify-content-between"><strong><i class="fas ${icon} me-2"></i>${item.title}</strong><small>${formatDate(item.date)}</small></div>
                            <p class="mb-0 small">${item.message}</p>
                        </div>`;
                });
            }
        } 
        // RESIDENT: Messages (With FIXED Filtering)
        else if (user.resident_id) {
            if(clearBtn) clearBtn.style.display = 'block';

            const { data: notifs } = await supabase.from('notifications')
                .select('*')
                .eq('resident_id', user.resident_id)
                .order('created_at', { ascending: false })
                .limit(20);
            
            let filtered = notifs || [];

            // --- FIXED FILTER LOGIC START (BROAD MATCH) ---
            if (notificationFilter === 'cert') {
                filtered = filtered.filter(n => 
                    n.title.includes('Certificate') || 
                    n.title.includes('Document')
                );
            }
            if (notificationFilter === 'report') {
                // Fix: Show ANYTHING that is NOT a certificate (Catch-all for Blotter/Incident/Case)
                filtered = filtered.filter(n => 
                    !n.title.includes('Certificate') && 
                    !n.title.includes('Document')
                );
            }
            // --- FIXED FILTER LOGIC END ---

            listContainer.innerHTML = '';
            if (filtered.length === 0) {
                listContainer.innerHTML = `<div class="text-center py-4 text-muted">No notifications found</div>`;
                if (badge) badge.style.display = 'none';
            } else {
                if (badge) { badge.textContent = notifs.length; badge.style.display = 'inline-block'; }
                
                filtered.forEach(n => {
                    listContainer.innerHTML += `
                        <div class="list-group-item p-3 position-relative">
                            <div class="d-flex justify-content-between pe-4">
                                <strong class="text-primary">${n.title}</strong>
                                <small>${new Date(n.created_at).toLocaleDateString()}</small>
                            </div>
                            <p class="mb-0 small text-dark">${n.message}</p>
                            <button class="btn btn-sm text-muted position-absolute top-0 end-0 mt-2 me-2" onclick="deleteNotification(${n.id}, event)" title="Delete"><i class="fas fa-trash"></i></button>
                        </div>`;
                });
            }
        }
    } catch (e) { console.error(e); }
};

// ==========================================
// 4. AUTHENTICATION & NAVIGATION
// ==========================================

const showPage = (pageId) => {
    // Hide all pages
    document.querySelectorAll('.page-content').forEach(page => page.classList.add('hidden'));
    
    // Show requested page
    const page = document.getElementById(pageId + '-page');
    if (page) page.classList.remove('hidden');

    // Update Sidebar Active State
    document.querySelectorAll('.sidebar .nav-link').forEach(link => {
        link.classList.remove('active');
        if(link.getAttribute('data-page') === pageId) {
            link.classList.add('active');
        }
    });

    // Update Title
    const pageTitle = document.getElementById('page-title');
    if (pageTitle) {
        const pageNames = { 'dashboard': 'Dashboard', 'residents': 'Residents', 'certificates': 'Certificates', 'blotter': 'Blotter Reports', 'announcements': 'Announcements', 'resident-dashboard': 'Dashboard', 'my-profile': 'My Profile', 'my-requests': 'My Requests', 'view-announcements': 'Announcements' };
        pageTitle.textContent = pageNames[pageId] || 'Barangay Portal';
    }
};

const login = async (email, password) => {
    try {
        const hashedPassword = hashPassword(password);
        const { data: users, error } = await supabase.from('auth_users').select('*').eq('email', email).eq('password_hash', hashedPassword);

        if (error || !users || users.length === 0) return false;

        const user = users[0];
        if (!user.verified && user.role !== 'admin') {
            alert('Your account is pending verification.');
            return false;
        }

        sessionStorage.setItem('currentUser', JSON.stringify(user));
        initializeSession(user);
        return true;
    } catch (error) { console.error('Login error:', error); return false; }
};

const logout = () => {
    sessionStorage.removeItem('currentUser');
    window.location.reload();
};

const initializeSession = async (user) => {
    if (user.role === 'admin') {
        document.getElementById('admin-sidebar').classList.remove('hidden');
        document.getElementById('resident-sidebar').classList.add('hidden');
        document.getElementById('user-name').textContent = user.name;
        showPage('dashboard');
        loadDashboard();
    } else {
        document.getElementById('admin-sidebar').classList.add('hidden');
        document.getElementById('resident-sidebar').classList.remove('hidden');
        document.getElementById('user-name').textContent = user.name;
        showPage('resident-dashboard');
        if (user.resident_id) loadResidentProfile(user.resident_id);
    }
    document.getElementById('login-page').classList.add('hidden');
    document.getElementById('app-container').classList.remove('hidden');
    await loadAnnouncements();
    await loadNotifications();
};

// ==========================================
// 5. DATA LOADING
// ==========================================

const loadDashboard = async () => {
    try {
        const [residents, certificates, blotter] = await Promise.all([
            supabase.from('residents').select('id', { count: 'exact' }),
            supabase.from('certificates').select('*').order('request_date', { ascending: false }).limit(5),
            supabase.from('blotter_reports').select('*').order('date_reported', { ascending: false }).limit(5)
        ]);

        const { count: resCount } = await supabase.from('residents').select('*', { count: 'exact', head: true });
        const { count: certCount } = await supabase.from('certificates').select('*', { count: 'exact', head: true });
        const { count: blotterCount } = await supabase.from('blotter_reports').select('*', { count: 'exact', head: true }).eq('status', 'Open');

        document.getElementById('residents-count').textContent = resCount || 0;
        document.getElementById('certificates-count').textContent = certCount || 0;
        document.getElementById('blotter-count').textContent = blotterCount || 0;

        const certTable = document.getElementById('recent-certificates-table').querySelector('tbody');
        certTable.innerHTML = '';
        if (certificates.data.length === 0) certTable.innerHTML = '<tr><td colspan="4">No requests</td></tr>';
        certificates.data.forEach(c => {
            const statusClass = c.status === 'Requested' ? 'status-requested' : c.status === 'Approved' ? 'status-approved' : 'status-released';
            certTable.innerHTML += `<tr><td>${c.resident_name}</td><td>${c.document_type}</td><td>${formatDate(c.request_date)}</td><td><span class="status-badge ${statusClass}">${c.status}</span></td></tr>`;
        });

        const blotterTable = document.getElementById('recent-blotter-table').querySelector('tbody');
        blotterTable.innerHTML = '';
        if (blotter.data.length === 0) blotterTable.innerHTML = '<tr><td colspan="4">No reports</td></tr>';
        blotter.data.forEach(r => {
            const statusClass = r.status === 'Open' ? 'status-open' : r.status === 'In Progress' ? 'status-in-progress' : 'status-resolved';
            blotterTable.innerHTML += `<tr><td>${r.complainant}</td><td>${r.respondent}</td><td>${formatDate(r.date_reported)}</td><td><span class="status-badge ${statusClass}">${r.status}</span></td></tr>`;
        });
    } catch (e) { console.error(e); }
};

const loadResidents = async (searchTerm = '', filter = '') => {
    let query = supabase.from('residents').select('*');
    if (searchTerm) query = query.or(`name.ilike.%${searchTerm}%,address.ilike.%${searchTerm}%`);
    if (filter === 'age') query = query.order('age', { ascending: false });
    else query = query.order('name');

    const { data: residents } = await query;
    const tbody = document.getElementById('residents-table').querySelector('tbody');
    tbody.innerHTML = '';
    if (!residents || residents.length === 0) tbody.innerHTML = '<tr><td colspan="6" class="text-center">No residents found</td></tr>';
    else residents.forEach(r => {
        tbody.innerHTML += `<tr><td>${r.name}</td><td>${r.age}</td><td>${r.address}</td><td>${r.contact}</td><td>${r.household_id || '-'}</td>
        <td><button class="btn btn-sm btn-primary me-1" onclick="editResident(${r.id})"><i class="fas fa-edit"></i></button>
        <button class="btn btn-sm btn-danger" onclick="deleteResident(${r.id})"><i class="fas fa-trash"></i></button></td></tr>`;
    });
};

const loadCertificates = async (q='', f='') => {
    let qry = supabase.from('certificates').select('*');
    if(q) qry = qry.ilike('resident_name', `%${q}%`);
    if(f) qry = qry.eq('status', f);
    const { data } = await qry.order('request_date', {ascending:false}).limit(10);
    
    // Admin Dashboard Table (Recent)
    const tb = document.getElementById('recent-certificates-table').querySelector('tbody');
    if(tb) {
        tb.innerHTML = '';
        data?.slice(0,5).forEach(c => tb.innerHTML += `<tr><td>${c.resident_name}</td><td>${c.document_type}</td><td>${formatDate(c.request_date)}</td><td>${c.status}</td></tr>`);
    }
    
    // Admin Full Table (With Payment Info)
    const tbFull = document.getElementById('certificates-table').querySelector('tbody');
    if(tbFull) {
        tbFull.innerHTML = '';
        data?.forEach(c => {
            // Check for Payment Proof
            let payBtn = '';
            if (c.payment_proof) {
                payBtn = `<a href="${c.payment_proof}" target="_blank" class="btn btn-sm btn-success me-1" title="View Payment"><i class="fas fa-receipt"></i></a>`;
            } else if (c.payment_method === 'GCash') {
                payBtn = `<span class="badge bg-danger me-1">No Proof</span>`;
            }

            tbFull.innerHTML += `
                <tr>
                    <td>${c.resident_name}</td>
                    <td>${c.document_type}</td>
                    <td>
                        ${c.purpose}
                        <br><small class="text-muted">${c.payment_method} ${c.payment_ref ? '('+c.payment_ref+')' : ''}</small>
                    </td>
                    <td>${formatDate(c.request_date)}</td>
                    <td><span class="badge bg-${c.status=='Approved'?'success':'secondary'}">${c.status}</span></td>
                    <td>
                        ${payBtn}
                        <button class="btn btn-sm btn-primary" onclick="updateCertificateStatus(${c.id})"><i class="fas fa-edit"></i></button>
                    </td>
                </tr>`;
        });
    }
};

const loadBlotter = async (searchTerm = '', filter = '') => {
    let query = supabase.from('blotter_reports').select('*');
    if (searchTerm) query = query.or(`complainant.ilike.%${searchTerm}%,respondent.ilike.%${searchTerm}%,incident_type.ilike.%${searchTerm}%`);
    if (filter) query = query.eq('status', filter);
    query = query.order('date_reported', { ascending: false });

    const { data: reports } = await query;
    const tbody = document.getElementById('blotter-table').querySelector('tbody');
    tbody.innerHTML = '';
    if (!reports || reports.length === 0) tbody.innerHTML = '<tr><td colspan="6" class="text-center">No reports</td></tr>';
    else reports.forEach(r => {
        const statusClass = r.status === 'Open' ? 'status-open' : r.status === 'In Progress' ? 'status-in-progress' : 'status-resolved';
        const urlMatch = r.description ? r.description.match(/(https?:\/\/[^\s]+)/) : null;
        const evidenceBtn = urlMatch ? `<a href="${urlMatch[0]}" target="_blank" class="btn btn-sm btn-info me-1" title="View Evidence"><i class="fas fa-image text-white"></i></a>` : '';
        tbody.innerHTML += `<tr><td>${r.complainant}</td><td>${r.respondent}</td><td>${r.incident_type}</td><td>${formatDate(r.date_reported)}</td>
        <td><span class="status-badge ${statusClass}">${r.status}</span></td>
        <td>${evidenceBtn}<button class="btn btn-sm btn-primary me-1" onclick="editBlotterReport(${r.id})"><i class="fas fa-edit"></i></button>
        <button class="btn btn-sm btn-danger" onclick="deleteBlotterReport(${r.id})"><i class="fas fa-trash"></i></button></td></tr>`;
    });
};

const loadAnnouncements = async () => {
    const { data: list } = await supabase.from('announcements').select('*').order('pub_date', { ascending: false });
    const container = document.getElementById('announcements-list');
    container.innerHTML = '';
    if (!list?.length) container.innerHTML = '<div class="text-center py-4">No announcements</div>';
    else list.forEach(a => {
        container.innerHTML += `<div class="announcement-card${a.important ? ' border-warning' : ''}">
        <div class="d-flex justify-content-between align-items-start mb-2"><h5 class="mb-0">${a.important ? '<i class="fas fa-star text-warning me-2"></i>' : ''}${a.title}</h5>
        <div><button class="btn btn-sm btn-primary" onclick="editAnnouncement(${a.id})"><i class="fas fa-edit"></i></button></div></div>
        <p class="announcement-date">${formatDate(a.pub_date)}</p><p>${a.content}</p></div>`;
    });

    const residentView = document.getElementById('resident-announcements-list');
    if (residentView && list) {
        residentView.innerHTML = '';
        list.slice(0, 3).forEach(a => {
            residentView.innerHTML += `<div class="announcement-card${a.important ? ' border-warning' : ''}"><h5>${a.important ? '<i class="fas fa-star text-warning me-2"></i>' : ''}${a.title}</h5><p class="announcement-date">${formatDate(a.pub_date)}</p><p>${a.content}</p></div>`;
        });
        if (list.length > 3) residentView.innerHTML += `<div class="text-center mt-3"><a href="javascript:void(0)" class="btn btn-outline-primary" onclick="showPage('view-announcements')">View All</a></div>`;
    }
    
    const viewAll = document.getElementById('resident-view-announcements');
    if (viewAll && list) {
        viewAll.innerHTML = '';
        list.forEach(a => {
            viewAll.innerHTML += `<div class="announcement-card${a.important ? ' border-warning' : ''}"><h5>${a.important ? '<i class="fas fa-star text-warning me-2"></i>' : ''}${a.title}</h5><p class="announcement-date">${formatDate(a.pub_date)}</p><p>${a.content}</p></div>`;
        });
    }
};

const loadResidentProfile = async (id) => {
    const { data } = await supabase.from('residents').select('*').eq('id', id).single();
    if (!data) return;
    document.getElementById('profile-name').value = data.name;
    document.getElementById('profile-age').value = data.age;
    document.getElementById('profile-address').value = data.address;
    document.getElementById('profile-contact').value = data.contact;
    document.getElementById('profile-email').value = data.email || '';
    
    if (data.household_id) {
        const { data: members } = await supabase.from('residents').select('*').eq('household_id', data.household_id).neq('id', id);
        const tbody = document.getElementById('household-members-table').querySelector('tbody');
        tbody.innerHTML = '';
        if(!members || members.length === 0) tbody.innerHTML = '<tr><td colspan="3" class="text-center">No other members</td></tr>';
        else members.forEach(m => tbody.innerHTML += `<tr><td>${m.name}</td><td>${m.age}</td><td>Family Member</td></tr>`);
    }

    loadResidentRequests(id);
};

const loadResidentRequests = async (id) => {
    const { data } = await supabase.from('certificates').select('*').eq('resident_id', id).order('request_date', { ascending: false });
    const tbody = document.getElementById('my-requests-table').querySelector('tbody');
    if(tbody) {
        tbody.innerHTML = '';
        if (!data?.length) tbody.innerHTML = '<tr><td colspan="4" class="text-center">No requests</td></tr>';
        else data.forEach(c => {
            const statusClass = c.status === 'Requested' ? 'status-requested' : c.status === 'Approved' ? 'status-approved' : 'status-released';
            tbody.innerHTML += `<tr><td>${c.document_type}</td><td>${c.purpose}</td><td>${formatDate(c.request_date)}</td><td><span class="status-badge ${statusClass}">${c.status}</span></td></tr>`;
        });
    }
};

// ==========================================
// 6. WINDOW HELPERS (FOR MODALS)
// ==========================================

window.editResident = async (id) => {
    const { data } = await supabase.from('residents').select('*').eq('id', id).single();
    if (data) {
        document.getElementById('edit-resident-id').value = data.id;
        document.getElementById('edit-resident-name').value = data.name;
        document.getElementById('edit-resident-age').value = data.age;
        document.getElementById('edit-resident-address').value = data.address;
        document.getElementById('edit-resident-contact').value = data.contact;
        document.getElementById('edit-resident-email').value = data.email || '';
        document.getElementById('edit-resident-household').value = data.household_id || '';
        new bootstrap.Modal(document.getElementById('editResidentModal')).show();
    }
};

window.deleteResident = async (id) => {
    if (confirm('Delete this resident?')) {
        await supabase.from('residents').delete().eq('id', id);
        loadResidents(); loadDashboard();
    }
};

window.updateCertificateStatus = async (id) => {
    const { data } = await supabase.from('certificates').select('*').eq('id', id).single();
    if (data) {
        document.getElementById('edit-certificate-id').value = data.id;
        document.getElementById('edit-certificate-resident').value = data.resident_name;
        document.getElementById('edit-certificate-type').value = data.document_type;
        document.getElementById('edit-certificate-purpose').value = data.purpose;
        document.getElementById('edit-certificate-status').value = data.status;
        document.getElementById('edit-certificate-notes').value = data.notes || '';
        new bootstrap.Modal(document.getElementById('updateCertificateModal')).show();
    }
};

window.editBlotterReport = async (id) => {
    const { data } = await supabase.from('blotter_reports').select('*').eq('id', id).single();
    if (data) {
        document.getElementById('edit-blotter-id').value = data.id;
        document.getElementById('edit-blotter-complainant').value = data.complainant;
        document.getElementById('edit-blotter-respondent').value = data.respondent;
        document.getElementById('edit-blotter-type').value = data.incident_type;
        document.getElementById('edit-blotter-date').value = data.incident_date;
        document.getElementById('edit-blotter-location').value = data.location;
        document.getElementById('edit-blotter-description').value = data.description;
        document.getElementById('edit-blotter-status').value = data.status;
        new bootstrap.Modal(document.getElementById('editBlotterModal')).show();
    }
};

window.deleteBlotterReport = async (id) => {
    if (confirm('Delete this report?')) {
        await supabase.from('blotter_reports').delete().eq('id', id);
        loadBlotter(); loadDashboard();
    }
};

window.editAnnouncement = async (id) => {
    const { data } = await supabase.from('announcements').select('*').eq('id', id).single();
    if (data) {
        document.getElementById('edit-announcement-id').value = data.id;
        document.getElementById('edit-announcement-title').value = data.title;
        document.getElementById('edit-announcement-content').value = data.content;
        document.getElementById('edit-announcement-pubdate').value = data.pub_date;
        document.getElementById('edit-announcement-expiry').value = data.expiry_date || '';
        document.getElementById('edit-important-switch').checked = data.important;
        new bootstrap.Modal(document.getElementById('editAnnouncementModal')).show();
    }
};

window.returnToDashboard = async () => {
    showPage('resident-dashboard');
    document.getElementById('resident-announcements-list').innerHTML = '<div class="text-center py-5"><div class="spinner-border text-primary"></div></div>';
    await loadAnnouncements();
    await loadNotifications();
};

// ==========================================
// 7. REALTIME SETUP
// ==========================================

const setupRealtimeSubscriptions = () => {
    supabase.channel('public-db-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'announcements' }, () => loadAnnouncements())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'residents' }, () => { loadResidents(); loadDashboard(); })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'certificates' }, (payload) => {
            const user = JSON.parse(sessionStorage.getItem('currentUser'));
            if (!user) return;
            if (user.role === 'admin') {
                loadCertificates(); loadDashboard();
                if (payload.eventType === 'INSERT') showToast('New Certificate', `${payload.new.resident_name} requested a doc`, 'info');
            } else if (user.resident_id) {
                loadResidentRequests(user.resident_id);
                if (payload.eventType === 'UPDATE' && payload.new.resident_id === user.resident_id) {
                    showToast('Update', `Request status: ${payload.new.status}`, 'success');
                    loadNotifications();
                }
            }
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'blotter_reports' }, (payload) => {
            const user = JSON.parse(sessionStorage.getItem('currentUser'));
            if (user?.role === 'admin') {
                loadBlotter(); loadDashboard();
                if (payload.eventType === 'INSERT') showToast('New Incident', `Type: ${payload.new.incident_type}`, 'danger');
            }
        })
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, (payload) => {
            const user = JSON.parse(sessionStorage.getItem('currentUser'));
            if (user?.resident_id === payload.new.resident_id) {
                loadNotifications();
                showToast('New Message', payload.new.title, 'warning');
            }
        })
        .subscribe();
};

// ==========================================
// 8. EVENT LISTENERS (DOM READY)
// ==========================================

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Session Check
    const currentUser = JSON.parse(sessionStorage.getItem('currentUser'));
    if (currentUser) initializeSession(currentUser);
    else document.getElementById('login-page').classList.remove('hidden');

    // 2. Setup Realtime
    setupRealtimeSubscriptions();

    // 3. Bulletproof Navigation Logic
    document.addEventListener('click', (e) => {
        const link = e.target.closest('.sidebar .nav-link');
        if (link) {
            e.preventDefault();
            const pageId = link.getAttribute('data-page');
            if (pageId) {
                showPage(pageId);
                // Load specific data per page
                if (pageId === 'dashboard') loadDashboard();
                if (pageId === 'residents') loadResidents();
                if (pageId === 'certificates') loadCertificates();
                if (pageId === 'blotter') loadBlotter();
                if (pageId === 'announcements') loadAnnouncements();
                
                if (pageId === 'resident-dashboard') { loadAnnouncements(); loadNotifications(); }
                if (pageId === 'my-requests') { const u = JSON.parse(sessionStorage.getItem('currentUser')); if(u) loadResidentRequests(u.resident_id); }
                if (pageId === 'my-profile') { const u = JSON.parse(sessionStorage.getItem('currentUser')); if(u) loadResidentProfile(u.resident_id); }
                if (pageId === 'view-announcements') loadAnnouncements();
                
                // AUTO-FILL REPORTER NAME
                if (pageId === 'report-incident') {
                    const u = JSON.parse(sessionStorage.getItem('currentUser'));
                    const nameField = document.getElementById('reporter-name');
                    if(u && nameField) {
                        nameField.value = u.name;
                    }
                }
            }
        }
    });

    // 4. Setup Search
    const setupSearch = (inputId, filterId, loadFn) => {
        const input = document.getElementById(inputId);
        const filter = document.getElementById(filterId);
        const btn = input?.closest('.input-group')?.querySelector('button');
        if (input && btn) {
            const run = () => loadFn(input.value, filter ? filter.value : '');
            btn.addEventListener('click', run);
            input.addEventListener('keypress', (e) => { if (e.key === 'Enter') run(); });
            if (filter) filter.addEventListener('change', run);
        }
    };
    setupSearch('search-residents', 'filter-residents', loadResidents);
    setupSearch('search-certificates', 'filter-certificates', loadCertificates);
    setupSearch('search-blotter', 'filter-blotter', loadBlotter);

    // Auth Forms
    document.getElementById('login-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const success = await login(document.getElementById('username').value, document.getElementById('password').value);
        if (!success) alert('Invalid credentials');
    });

    document.getElementById('logout-btn')?.addEventListener('click', logout);

    // Register Form Logic
    const regForm = document.getElementById('register-form');
    if (regForm) {
        // Toggle fields based on Account Type
        document.getElementById('account-type')?.addEventListener('change', function() {
            document.getElementById('resident-fields').classList.toggle('hidden', this.value !== 'resident');
            document.getElementById('admin-fields').classList.toggle('hidden', this.value !== 'admin');
        });

        // Toggle Resident Existence fields
        document.querySelectorAll('input[name="residentExists"]').forEach(r => r.addEventListener('change', function() {
            document.getElementById('existing-resident-fields').classList.toggle('hidden', this.value !== 'yes');
            document.getElementById('new-resident-fields').classList.toggle('hidden', this.value === 'yes');
        }));
        
        // Handle Registration Submit
        document.getElementById('register-btn')?.addEventListener('click', async () => {
            const fd = new FormData(regForm);
            
            // 1. Password Match Check
            if (fd.get('password') !== fd.get('confirmPassword')) return alert('Passwords mismatch');
            
            const userData = { name: fd.get('name'), email: fd.get('email'), password: fd.get('password'), role: fd.get('accountType') };
            
            // 2. ADMIN SECURITY CHECK (The New Part)
            if (userData.role === 'admin') {
                const secretCode = fd.get('adminCode');
                // Change 'ADMIN123' to whatever secret password you want
                if (secretCode !== 'ADMIN123') { 
                    return alert('Invalid Admin Access Code. You are not authorized to create an admin account.');
                }
            } 
            
            // 3. Resident Logic (Link to existing or new)
            else if (userData.role === 'resident') {
                if (fd.get('residentExists') === 'yes') {
                    // Try to find existing resident
                    const {data} = await supabase.from('residents').select('*').ilike('name', `%${fd.get('residentIdentifier')}%`).limit(1);
                    if(!data || !data.length) return alert('Resident not found in database. Please contact the barangay or register as new.');
                    userData.residentId = data[0].id;
                } else {
                    // Prepare new resident data
                    userData.residentData = { age: fd.get('age'), contact: fd.get('contact'), address: fd.get('address') };
                }
            }
            
            try {
                // 4. Create User in Auth Table
                const {data: newUser, error} = await supabase.from('auth_users').insert([{
                    email: userData.email, 
                    password_hash: hashPassword(userData.password), 
                    role: userData.role, 
                    name: userData.name, 
                    // Auto-verify if they are a Resident OR if they passed the Admin Code check
                    verified: true, 
                    resident_id: userData.residentId || null
                }]).select().single();
                
                if(error) throw error;
                
                // 5. If New Resident, Add to Residents Table
                if(userData.residentData) {
                    const {data: res} = await supabase.from('residents').insert([{name: userData.name, ...userData.residentData}]).select().single();
                    // Link the new resident ID back to the auth user
                    await supabase.from('auth_users').update({resident_id: res.id}).eq('id', newUser.id);
                }
                
                alert('Account created successfully! You can now log in.');
                // Use the safe modal closing method
                bootstrap.Modal.getOrCreateInstance(document.getElementById('registerModal')).hide();
                regForm.reset();
            } catch(e) { 
                console.error(e); 
                alert('Error creating account: ' + e.message); 
            }
        });
    }
    // Incident Reporting
    const incidentForm = document.getElementById('incident-report-form');
    if (incidentForm) {
        incidentForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            const btn = document.getElementById('submit-incident-btn');
            const originalText = btn.innerHTML;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';
            btn.disabled = true;

            try {
                const formData = new FormData(this);
                const isAnon = document.getElementById('anonymous-toggle').checked;
                const fileInput = document.getElementById('evidence-files');
                
                let urls = [];
                if (fileInput.files.length) {
                    for (let file of fileInput.files) {
                        const path = `evidence/${Date.now()}_${file.name}`;
                        try {
                            const { error } = await supabase.storage.from('evidence').upload(path, file);
                            if (error) throw error;
                            const { data } = supabase.storage.from('evidence').getPublicUrl(path);
                            urls.push(data.publicUrl);
                        } catch (err) { console.warn('Upload failed', err); urls.push(`[Upload Failed: ${file.name}]`); }
                    }
                }

                const description = `INCIDENT REPORT\n---------------\nDescription: ${formData.get('description')}\nDetails:\n- Urgency: ${formData.get('urgency')}\n- Injuries: ${formData.get('hasInjuries')}\n- Reporter: ${isAnon ? 'Anonymous' : formData.get('reporterName')}\n- Contact: ${isAnon ? 'N/A' : formData.get('reporterContact')}\n\nEVIDENCE LINKS:\n${urls.join('\n')}`;

                await supabase.from('blotter_reports').insert([{
                    complainant: isAnon ? 'Anonymous' : formData.get('reporterName'),
                    respondent: formData.get('otherParties') || 'Unknown',
                    incident_type: formData.get('incidentType'),
                    incident_date: formData.get('incidentDateTime').split('T')[0],
                    location: formData.get('location'),
                    description: description,
                    status: 'Open',
                    date_reported: new Date().toISOString().split('T')[0]
                }]);

                const modal = new bootstrap.Modal(document.getElementById('anonymousConfirmationModal'));
                document.getElementById('anonymous-report-reference').textContent = `#IR-${Date.now().toString().slice(-6)}`;
                modal.show();
                this.reset();
            } catch (err) { console.error(err); alert('Failed to submit.'); } 
            finally { btn.innerHTML = originalText; btn.disabled = false; }
        });
    }

    // Admin Updates
    document.getElementById('update-certificate-btn')?.addEventListener('click', async () => {
        const id = document.getElementById('edit-certificate-id').value;
        const status = document.getElementById('edit-certificate-status').value;
        const notes = document.getElementById('edit-certificate-notes').value;
        const { data: cert } = await supabase.from('certificates').update({ status, notes }).eq('id', id).select().single();
        if (cert) {
            let msg = `Your ${cert.document_type} is now ${status}.`;
            if (status === 'Approved') msg = 'Your request is Approved. Please visit the barangay hall.';
            if (status === 'Released') msg = 'Your document has been Released.';
            await sendNotification(cert.resident_id, 'Certificate Update', msg);
        }
        loadCertificates(); loadDashboard();
        bootstrap.Modal.getInstance(document.getElementById('updateCertificateModal')).hide();
        alert('Updated.');
    });

    // --- FIXED BLOTTER UPDATE LOGIC ---
    document.getElementById('update-blotter-btn')?.addEventListener('click', async () => {
        const id = document.getElementById('edit-blotter-id').value;
        const status = document.getElementById('edit-blotter-status').value;
        const complainant = document.getElementById('edit-blotter-complainant').value;
        
        await supabase.from('blotter_reports').update({
            complainant,
            respondent: document.getElementById('edit-blotter-respondent').value,
            incident_type: document.getElementById('edit-blotter-type').value,
            incident_date: document.getElementById('edit-blotter-date').value,
            location: document.getElementById('edit-blotter-location').value,
            description: document.getElementById('edit-blotter-description').value,
            status: status
        }).eq('id', id);

        // Improved Resident Matching
        const cleanName = complainant.trim();
        const { data: resident } = await supabase
            .from('residents')
            .select('id')
            .ilike('name', cleanName)
            .maybeSingle();

        if (resident) {
            // Updated title to match the "Report" filter in loadNotifications
            await sendNotification(resident.id, 'Blotter Case Update', `Your report status is now: ${status}`);
        } else {
            // ALERT: This helps debug why notification failed
            alert(`WARNING: Report updated, but could not find resident account for "${cleanName}" to send notification. Make sure names match exactly.`);
        }

        loadBlotter(); loadDashboard();
        bootstrap.Modal.getInstance(document.getElementById('editBlotterModal')).hide();
        alert('Report updated.');
    });

    document.getElementById('submit-request-btn')?.addEventListener('click', async () => {
        const btn = document.getElementById('submit-request-btn');
        btn.disabled = true; btn.innerHTML = 'Submitting...';

        try {
            const u = JSON.parse(sessionStorage.getItem('currentUser'));
            const form = document.getElementById('request-certificate-form');
            const fd = new FormData(form);
            
            // Handle Payment Proof Upload
            let proofUrl = null;
            const payMethod = document.getElementById('pay-gcash').checked ? 'GCash' : 'Cash';
            const fileInput = document.getElementById('payment-proof-file');

            if (payMethod === 'GCash' && fileInput.files.length > 0) {
                const file = fileInput.files[0];
                const path = `payments/${Date.now()}_${file.name}`;
                const { error: uploadErr } = await supabase.storage.from('evidence').upload(path, file); // Reusing 'evidence' bucket
                if (uploadErr) throw uploadErr;
                const { data } = supabase.storage.from('evidence').getPublicUrl(path);
                proofUrl = data.publicUrl;
            }

            const { data: resident } = await supabase.from('residents').select('name').eq('id', u.resident_id).single();
            
            await supabase.from('certificates').insert([{
                resident_id: u.resident_id, 
                resident_name: resident.name, 
                document_type: fd.get('documentType'), 
                purpose: fd.get('purpose'), 
                request_date: new Date().toISOString(), 
                status: 'Requested',
                // New Payment Fields
                payment_method: payMethod,
                payment_ref: fd.get('refNumber') || '',
                payment_proof: proofUrl,
                payment_status: payMethod === 'GCash' ? 'Pending Verification' : 'Pending'
            }]);

            loadResidentRequests(u.resident_id); 
            bootstrap.Modal.getInstance(document.getElementById('requestCertificateModal')).hide();
            form.reset();
            // Reset GCash visibility
            document.getElementById('gcash-fields').classList.add('hidden');
            document.getElementById('pay-cash').checked = true;
            
            alert('Request Submitted Successfully!');

        } catch (error) {
            console.error(error);
            alert('Error submitting request: ' + error.message);
        } finally {
            btn.disabled = false; btn.innerHTML = 'Submit Request';
        }
    });

    document.getElementById('save-resident-btn')?.addEventListener('click', async () => {
        const form = document.getElementById('add-resident-form');
        const fd = new FormData(form);
        const { data } = await supabase.from('residents').insert([{
            name: fd.get('name'), age: fd.get('age'), address: fd.get('address'), contact: fd.get('contact'),
            email: fd.get('email'), household_id: fd.get('householdId') || 'H999'
        }]).select().single();
        if (fd.get('createAccount')) {
            await supabase.from('auth_users').insert([{
                email: fd.get('email') || `${fd.get('name').replace(/\s/g,'.')}@bgy.com`, password_hash: hashPassword('resident123'),
                role: 'resident', name: fd.get('name'), resident_id: data.id, verified: true
            }]);
        }
        loadResidents(); loadDashboard();
        bootstrap.Modal.getInstance(document.getElementById('addResidentModal')).hide();
        form.reset();
    });

    document.getElementById('update-resident-btn')?.addEventListener('click', async () => {
        const id = document.getElementById('edit-resident-id').value;
        const name = document.getElementById('edit-resident-name').value;
        await supabase.from('residents').update({
            name, age: document.getElementById('edit-resident-age').value,
            address: document.getElementById('edit-resident-address').value,
            contact: document.getElementById('edit-resident-contact').value,
            email: document.getElementById('edit-resident-email').value,
            household_id: document.getElementById('edit-resident-household').value
        }).eq('id', id);
        await supabase.from('certificates').update({ resident_name: name }).eq('resident_id', id);
        loadResidents(); loadDashboard();
        bootstrap.Modal.getInstance(document.getElementById('editResidentModal')).hide();
    });

    document.getElementById('save-blotter-btn')?.addEventListener('click', async () => {
        const form = document.getElementById('add-blotter-form');
        const fd = new FormData(form);
        await supabase.from('blotter_reports').insert([{
            complainant: fd.get('complainant'), respondent: fd.get('respondent'), incident_type: fd.get('incidentType'),
            incident_date: fd.get('incidentDate'), location: fd.get('location'), description: fd.get('description'),
            status: 'Open', date_reported: new Date().toISOString().split('T')[0]
        }]);
        loadBlotter(); loadDashboard();
        bootstrap.Modal.getInstance(document.getElementById('addBlotterModal')).hide();
        form.reset();
    });

    document.getElementById('save-announcement-btn')?.addEventListener('click', async () => {
        const form = document.getElementById('add-announcement-form');
        const fd = new FormData(form);
        await supabase.from('announcements').insert([{
            title: fd.get('title'), content: fd.get('content'), pub_date: fd.get('pubDate'),
            expiry_date: fd.get('expiryDate') || null, important: fd.get('important') === 'on'
        }]);
        loadAnnouncements();
        bootstrap.Modal.getInstance(document.getElementById('addAnnouncementModal')).hide();
        form.reset();
    });

    document.getElementById('update-announcement-btn')?.addEventListener('click', async () => {
        const id = document.getElementById('edit-announcement-id').value;
        await supabase.from('announcements').update({
            title: document.getElementById('edit-announcement-title').value,
            content: document.getElementById('edit-announcement-content').value,
            pub_date: document.getElementById('edit-announcement-pubdate').value,
            expiry_date: document.getElementById('edit-announcement-expiry').value || null,
            important: document.getElementById('edit-important-switch').checked
        }).eq('id', id);
        loadAnnouncements();
        bootstrap.Modal.getInstance(document.getElementById('editAnnouncementModal')).hide();
    });

    document.getElementById('delete-announcement-btn')?.addEventListener('click', async () => {
        if(confirm('Delete?')) {
            const id = document.getElementById('edit-announcement-id').value;
            await supabase.from('announcements').delete().eq('id', id);
            loadAnnouncements();
            bootstrap.Modal.getInstance(document.getElementById('editAnnouncementModal')).hide();
        }
    });

    document.getElementById('update-profile-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const user = JSON.parse(sessionStorage.getItem('currentUser'));
        await supabase.from('residents').update({
            address: document.getElementById('profile-address').value,
            contact: document.getElementById('profile-contact').value,
            email: document.getElementById('profile-email').value
        }).eq('id', user.resident_id);
        alert('Profile updated.');
    });
});
// Toggle GCash Fields visibility
window.togglePaymentFields = () => {
    const isGcash = document.getElementById('pay-gcash').checked;
    document.getElementById('gcash-fields').classList.toggle('hidden', !isGcash);
};