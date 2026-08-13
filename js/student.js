/**
 * Smart College Problem Solver - Student Dashboard Module
 * Pure Vanilla JS + Supabase PostgreSQL
 */

class StudentDashboardManager {
    static async init() {
        const user = await AuthManager.requireStudentAuth();
        if (!user) return;

        this.currentUser = user;
        this.renderHeader();
        await this.loadDashboardData();
        this.setupEventListeners();
    }

    static renderHeader() {
        const welcomeEl = document.getElementById('studentWelcomeMsg');
        const userBadgeEl = document.getElementById('studentUserBadge');

        if (welcomeEl) {
            welcomeEl.innerHTML = `Welcome back, <span class="gradient-text">${this.escapeHTML(this.currentUser.name)}</span>! 🎓`;
        }

        if (userBadgeEl) {
            userBadgeEl.textContent = `Student • ${this.currentUser.email}`;
        }
    }

    static async loadDashboardData() {
        const myProblems = await AppStorage.getProblemsByUserId(this.currentUser.id);

        // Calculate statistics
        const totalCount = myProblems.length;
        const pendingCount = myProblems.filter(p => p.status === 'Pending').length;
        const inProgressCount = myProblems.filter(p => p.status === 'In Progress').length;
        const solvedCount = myProblems.filter(p => p.status === 'Solved').length;

        // Render Stats
        this.updateElementText('statTotalCount', totalCount);
        this.updateElementText('statPendingCount', pendingCount);
        this.updateElementText('statInProgressCount', inProgressCount);
        this.updateElementText('statSolvedCount', solvedCount);

        // Render Recent Complaints Grid
        this.renderRecentComplaints(myProblems);
    }

    static updateElementText(id, text) {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    }

    static renderRecentComplaints(myProblems) {
        const container = document.getElementById('recentComplaintsGrid');
        if (!container) return;

        // Show top 4 recent complaints
        const displayProblems = myProblems.slice(0, 4);

        if (displayProblems.length === 0) {
            container.innerHTML = `
                <div class="empty-state-card" style="grid-column: 1 / -1; text-align: center; padding: 4rem 2rem; background: var(--bg-card); border: 1px dashed var(--border-color); border-radius: var(--radius-lg);">
                    <div style="font-size: 3rem; margin-bottom: 1rem;">📝</div>
                    <h3 style="font-size: 1.3rem; margin-bottom: 0.5rem;">No Problems Reported Yet</h3>
                    <p style="color: var(--text-secondary); max-width: 420px; margin: 0 auto 1.5rem;">You haven't reported any campus issues. Use the report button below to submit your first issue.</p>
                    <a href="report.html" class="btn btn-primary">Report a Problem Now</a>
                </div>
            `;
            return;
        }

        container.innerHTML = displayProblems.map(p => this.createComplaintCardHTML(p)).join('');
    }

    static createComplaintCardHTML(p) {
        const priorityClass = `badge-priority-${(p.priority || 'medium').toLowerCase()}`;
        
        let statusClass = 'badge-pending';
        if (p.status === 'In Progress') statusClass = 'badge-progress';
        if (p.status === 'Solved') statusClass = 'badge-solved';

        const formattedDate = this.formatRelativeTime(p.createdAt);

        return `
            <div class="complaint-card" id="card-${p.id}">
                <div class="card-header">
                    <div class="card-category-wrapper">
                        <span class="badge badge-pill">${this.getCategoryIcon(p.category)} ${p.category}</span>
                    </div>
                    <div class="card-badges">
                        <span class="badge ${priorityClass}">${p.priority} Priority</span>
                        <span class="badge ${statusClass}">${p.status}</span>
                    </div>
                </div>

                <div class="card-body">
                    <h3 class="card-title">${this.escapeHTML(p.title)}</h3>
                    <p class="card-location">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                        ${this.escapeHTML(p.location || 'Campus Location')}
                    </p>
                    <p class="card-desc">${this.escapeHTML(p.description)}</p>
                </div>

                <div class="card-footer">
                    <div class="upvote-box">
                        <button class="upvote-btn" onclick="StudentDashboardManager.handleUpvote('${p.id}', event)">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
                            <span id="upvote-count-${p.id}">${p.upvotes || 0}</span>
                        </button>
                    </div>
                    <div class="card-meta">
                        <span>${formattedDate}</span>
                        <button class="btn btn-outline btn-sm" onclick="StudentDashboardManager.openDetailModal('${p.id}')">
                            Details
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    static async handleUpvote(id, event) {
        if (event) event.stopPropagation();
        const updated = await AppStorage.upvoteProblem(id);
        if (updated) {
            const countEl = document.getElementById(`upvote-count-${id}`);
            if (countEl) countEl.textContent = updated.upvotes;

            const modalCountEl = document.getElementById(`modal-upvote-${id}`);
            if (modalCountEl) modalCountEl.textContent = updated.upvotes;

            if (window.showToast) {
                window.showToast(`Upvoted! Total upvotes: ${updated.upvotes}`, 'success');
            }
        }
    }

    static async openDetailModal(id) {
        const problem = await AppStorage.getProblemById(id);
        if (!problem) return;

        let modal = document.getElementById('problemDetailModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'problemDetailModal';
            modal.className = 'modal-backdrop';
            document.body.appendChild(modal);
        }

        const priorityClass = `badge-priority-${(problem.priority || 'medium').toLowerCase()}`;
        let statusClass = 'badge-pending';
        if (problem.status === 'In Progress') statusClass = 'badge-progress';
        if (problem.status === 'Solved') statusClass = 'badge-solved';

        modal.innerHTML = `
            <div class="modal-card">
                <div class="modal-header">
                    <div>
                        <span class="badge badge-pill" style="margin-bottom: 0.5rem;">${this.getCategoryIcon(problem.category)} ${problem.category}</span>
                        <h2 style="font-size: 1.4rem; font-weight: 800; color: #fff;">${this.escapeHTML(problem.title)}</h2>
                    </div>
                    <button class="modal-close-btn" onclick="StudentDashboardManager.closeDetailModal()">&times;</button>
                </div>

                <div class="modal-body" style="display: flex; flex-direction: column; gap: 1.25rem;">
                    <div style="display: flex; gap: 0.75rem; flex-wrap: wrap;">
                        <span class="badge ${statusClass}">Status: ${problem.status}</span>
                        <span class="badge ${priorityClass}">Priority: ${problem.priority}</span>
                        <span class="badge badge-pill">📍 ${this.escapeHTML(problem.location)}</span>
                    </div>

                    <div>
                        <h4 style="font-size: 0.85rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.35rem;">Submitted By</h4>
                        <p style="font-size: 0.95rem; font-weight: 600; color: var(--text-primary);">${this.escapeHTML(problem.studentName)}</p>
                    </div>

                    <div>
                        <h4 style="font-size: 0.85rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.35rem;">Detailed Description</h4>
                        <p style="font-size: 0.95rem; color: var(--text-secondary); line-height: 1.6; background: rgba(15,23,42,0.6); padding: 1rem; border-radius: var(--radius-md); border: 1px solid var(--border-color);">
                            ${this.escapeHTML(problem.description)}
                        </p>
                    </div>

                    ${problem.image ? `
                        <div>
                            <h4 style="font-size: 0.85rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.5rem;">Attached Evidence Photo</h4>
                            <img src="${problem.image}" alt="Problem photo" style="max-height: 240px; border-radius: var(--radius-md); width: 100%; object-fit: cover; border: 1px solid var(--border-color);">
                        </div>
                    ` : ''}

                    <div style="display: flex; justify-content: space-between; align-items: center; padding-top: 1rem; border-top: 1px solid var(--border-color); font-size: 0.85rem; color: var(--text-muted);">
                        <span>Submitted on: ${new Date(problem.createdAt).toLocaleString()}</span>
                        <div class="upvote-box">
                            <button class="upvote-btn" onclick="StudentDashboardManager.handleUpvote('${problem.id}', event)">
                                👍 <span id="modal-upvote-${problem.id}">${problem.upvotes || 0}</span> Upvotes
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        modal.classList.add('active');
    }

    static closeDetailModal() {
        const modal = document.getElementById('problemDetailModal');
        if (modal) modal.classList.remove('active');
    }

    static setupEventListeners() {
        // Close modal on escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') this.closeDetailModal();
        });
    }

    static getCategoryIcon(cat) {
        const icons = {
            'Wi-Fi / Network': '🌐',
            'Electrical': '⚡',
            'Water': '💧',
            'Cleanliness': '🧹',
            'Classroom': '🏫',
            'Library': '📚',
            'Computer / Lab': '💻',
            'Canteen': '🍔',
            'Transport': '🚌',
            'Other': '📌'
        };
        return icons[cat] || '📌';
    }

    static formatRelativeTime(isoString) {
        if (!isoString) return 'Recently';
        const date = new Date(isoString);
        const diffMs = Date.now() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);

        if (diffMins < 60) return `${diffMins || 1}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays === 1) return 'Yesterday';
        return `${diffDays} days ago`;
    }

    static escapeHTML(str) {
        if (!str) return '';
        return str.replace(/[&<>'"]/g, 
            tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
        );
    }
}

document.addEventListener('DOMContentLoaded', () => {
    StudentDashboardManager.init();
});

window.StudentDashboardManager = StudentDashboardManager;
