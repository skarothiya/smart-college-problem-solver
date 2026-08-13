/**
 * Smart College Problem Solver - Admin Dashboard Module
 * Pure Vanilla JS + Supabase PostgreSQL Data Management Engine
 */

class AdminDashboardManager {
    static async init() {
        this.adminUser = await AuthManager.requireAdminAuth();
        if (!this.adminUser) return;

        this.allProblems = [];
        this.filteredProblems = [];

        this.filters = {
            search: '',
            category: 'ALL',
            status: 'ALL',
            priority: 'ALL'
        };

        await this.loadAdminData();
        this.setupEventListeners();
    }

    static async loadAdminData() {
        this.allProblems = await AppStorage.getProblems();
        this.renderStats();
        this.applyFiltersAndRender();
    }

    static renderStats() {
        const total = this.allProblems.length;
        const pending = this.allProblems.filter(p => p.status === 'Pending').length;
        const inProgress = this.allProblems.filter(p => p.status === 'In Progress').length;
        const solved = this.allProblems.filter(p => p.status === 'Solved').length;
        const highPriority = this.allProblems.filter(p => p.priority === 'High').length;

        this.updateText('adminStatTotal', total);
        this.updateText('adminStatPending', pending);
        this.updateText('adminStatProgress', inProgress);
        this.updateText('adminStatSolved', solved);
        this.updateText('adminStatHigh', highPriority);
    }

    static updateText(id, val) {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    }

    static applyFiltersAndRender() {
        let list = [...this.allProblems];

        // Search Filter
        if (this.filters.search.trim()) {
            const q = this.filters.search.toLowerCase().trim();
            list = list.filter(p => 
                (p.id && String(p.id).toLowerCase().includes(q)) ||
                (p.title && p.title.toLowerCase().includes(q)) ||
                (p.location && p.location.toLowerCase().includes(q)) ||
                (p.studentName && p.studentName.toLowerCase().includes(q))
            );
        }

        // Category Filter
        if (this.filters.category && this.filters.category !== 'ALL') {
            list = list.filter(p => p.category === this.filters.category);
        }

        // Status Filter
        if (this.filters.status && this.filters.status !== 'ALL') {
            list = list.filter(p => p.status === this.filters.status);
        }

        // Priority Filter
        if (this.filters.priority && this.filters.priority !== 'ALL') {
            list = list.filter(p => p.priority === this.filters.priority);
        }

        // Sort: Newest first
        list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        this.filteredProblems = list;
        this.renderTable();
    }

    static renderTable() {
        const tbody = document.getElementById('adminTableBody');
        const countEl = document.getElementById('adminCountText');

        if (countEl) {
            countEl.textContent = `Showing ${this.filteredProblems.length} of ${this.allProblems.length} total complaints`;
        }

        if (!tbody) return;

        if (this.filteredProblems.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" style="text-align: center; padding: 3rem 1rem; color: var(--text-muted);">
                        <div style="font-size: 2rem; margin-bottom: 0.5rem;">📋</div>
                        <strong>No complaints match your active filters.</strong>
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = this.filteredProblems.map(p => {
            const priorityClass = `badge-priority-${(p.priority || 'medium').toLowerCase()}`;
            
            let statusClass = 'badge-pending';
            if (p.status === 'In Progress') statusClass = 'badge-progress';
            if (p.status === 'Solved') statusClass = 'badge-solved';

            const formattedDate = new Date(p.createdAt).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });

            return `
                <tr id="row-${p.id}">
                    <td style="font-family: monospace; font-size: 0.825rem; color: var(--secondary); font-weight: 600;">
                        ${p.id}
                    </td>
                    <td>
                        <strong style="color: #fff; font-size: 0.925rem; display: block;">${this.escapeHTML(p.title)}</strong>
                        <span style="font-size: 0.78rem; color: var(--text-muted);">By ${this.escapeHTML(p.studentName)} • 👍 ${p.upvotes || 0} Upvotes</span>
                    </td>
                    <td>
                        <span class="badge badge-pill" style="font-size: 0.78rem;">
                            ${this.getCategoryIcon(p.category)} ${p.category}
                        </span>
                    </td>
                    <td style="font-size: 0.85rem; color: var(--text-secondary);">
                        ${this.escapeHTML(p.location)}
                    </td>
                    <td>
                        <span class="badge ${priorityClass}">${p.priority}</span>
                    </td>
                    <td>
                        <span class="badge ${statusClass}" id="status-badge-${p.id}">${p.status}</span>
                    </td>
                    <td style="font-size: 0.8rem; color: var(--text-muted); white-space: nowrap;">
                        ${formattedDate}
                    </td>
                    <td>
                        <div style="display: flex; gap: 0.4rem; align-items: center;">
                            <select class="form-select" style="padding: 0.35rem 0.5rem; font-size: 0.8rem; width: auto;" 
                                    onchange="AdminDashboardManager.handleStatusSelectChange('${p.id}', this.value)">
                                <option value="Pending" ${p.status === 'Pending' ? 'selected' : ''}>Pending</option>
                                <option value="In Progress" ${p.status === 'In Progress' ? 'selected' : ''}>In Progress</option>
                                <option value="Solved" ${p.status === 'Solved' ? 'selected' : ''}>Solved</option>
                            </select>

                            <button class="btn btn-outline btn-sm" style="padding: 0.35rem 0.65rem;" onclick="AdminDashboardManager.openDetailModal('${p.id}')">
                                Details
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }

    static handleStatusSelectChange(id, newStatus) {
        this.updateStatus(id, newStatus);
    }

    static async updateStatus(id, newStatus) {
        const previousStatus = this.allProblems.find(p => String(p.id) === String(id))?.status;
        const updated = await AppStorage.updateProblemStatus(id, newStatus);
        if (updated) {
            const statusChanged = previousStatus !== newStatus;

            const idxAll = this.allProblems.findIndex(p => String(p.id) === String(id));
            if (idxAll !== -1) this.allProblems[idxAll].status = newStatus;

            const idxF = this.filteredProblems.findIndex(p => String(p.id) === String(id));
            if (idxF !== -1) this.filteredProblems[idxF].status = newStatus;

            // Re-render statistics
            this.renderStats();

            // Update status badge inline
            const badge = document.getElementById(`status-badge-${id}`);
            if (badge) {
                badge.textContent = newStatus;
                badge.className = 'badge ';
                if (newStatus === 'Pending') badge.classList.add('badge-pending');
                if (newStatus === 'In Progress') badge.classList.add('badge-progress');
                if (newStatus === 'Solved') badge.classList.add('badge-solved');
            }

            if (statusChanged && window.showToast) {
                window.showToast(`Complaint #${id} status updated to [${newStatus}]`, 'success');
            }
        }
    }

    static async openDetailModal(id) {
        const problem = await AppStorage.getProblemById(id);
        if (!problem) return;

        let modal = document.getElementById('adminDetailModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'adminDetailModal';
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
                    <button class="modal-close-btn" onclick="AdminDashboardManager.closeDetailModal()">&times;</button>
                </div>

                <div class="modal-body" style="display: flex; flex-direction: column; gap: 1.25rem;">
                    
                    <!-- Admin Status Change Controls -->
                    <div style="background: rgba(99, 102, 241, 0.12); border: 1px solid var(--border-glow); padding: 1rem; border-radius: var(--radius-md); display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap;">
                        <div>
                            <strong style="display: block; font-size: 0.9rem; color: #fff;">Change Complaint Status</strong>
                            <span style="font-size: 0.8rem; color: var(--text-secondary);">Currently: <strong style="color: var(--primary);">${problem.status}</strong></span>
                        </div>
                        
                        <div style="display: flex; gap: 0.5rem;">
                            <button class="btn btn-sm ${problem.status === 'Pending' ? 'btn-primary' : 'btn-secondary'}" onclick="AdminDashboardManager.updateStatusFromModal('${problem.id}', 'Pending')">
                                Mark Pending
                            </button>
                            <button class="btn btn-sm ${problem.status === 'In Progress' ? 'btn-primary' : 'btn-secondary'}" onclick="AdminDashboardManager.updateStatusFromModal('${problem.id}', 'In Progress')">
                                Mark In Progress
                            </button>
                            <button class="btn btn-sm ${problem.status === 'Solved' ? 'btn-primary' : 'btn-secondary'}" onclick="AdminDashboardManager.updateStatusFromModal('${problem.id}', 'Solved')">
                                Mark Solved
                            </button>
                        </div>
                    </div>

                    <div style="display: flex; gap: 0.75rem; flex-wrap: wrap;">
                        <span class="badge ${statusClass}">Status: ${problem.status}</span>
                        <span class="badge ${priorityClass}">Priority: ${problem.priority}</span>
                        <span class="badge badge-pill">📍 ${this.escapeHTML(problem.location)}</span>
                        <span class="badge badge-pill">👍 ${problem.upvotes || 0} Upvotes</span>
                    </div>

                    <div>
                        <h4 style="font-size: 0.85rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.35rem;">Reported Student</h4>
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
                            <img src="${problem.image}" alt="Problem photo" style="max-height: 260px; border-radius: var(--radius-md); width: 100%; object-fit: cover; border: 1px solid var(--border-color);">
                        </div>
                    ` : ''}

                    <div style="display: flex; justify-content: space-between; align-items: center; padding-top: 1rem; border-top: 1px solid var(--border-color); font-size: 0.85rem; color: var(--text-muted);">
                        <span>Complaint ID: ${problem.id}</span>
                        <span>Created: ${new Date(problem.createdAt).toLocaleString()}</span>
                    </div>
                </div>
            </div>
        `;

        modal.classList.add('active');
    }

    static updateStatusFromModal(id, newStatus) {
        this.updateStatus(id, newStatus);
        this.openDetailModal(id); // refresh modal UI
    }

    static closeDetailModal() {
        const modal = document.getElementById('adminDetailModal');
        if (modal) modal.classList.remove('active');
    }

    static setupEventListeners() {
        const searchInput = document.getElementById('adminSearchInput');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.filters.search = e.target.value;
                this.applyFiltersAndRender();
            });
        }

        const catSelect = document.getElementById('adminFilterCategory');
        if (catSelect) {
            catSelect.addEventListener('change', (e) => {
                this.filters.category = e.target.value;
                this.applyFiltersAndRender();
            });
        }

        const statusSelect = document.getElementById('adminFilterStatus');
        if (statusSelect) {
            statusSelect.addEventListener('change', (e) => {
                this.filters.status = e.target.value;
                this.applyFiltersAndRender();
            });
        }

        const prioritySelect = document.getElementById('adminFilterPriority');
        if (prioritySelect) {
            prioritySelect.addEventListener('change', (e) => {
                this.filters.priority = e.target.value;
                this.applyFiltersAndRender();
            });
        }

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') this.closeDetailModal();
        });
    }

    static resetFilters() {
        this.filters = { search: '', category: 'ALL', status: 'ALL', priority: 'ALL' };
        
        const searchInput = document.getElementById('adminSearchInput');
        const catSelect = document.getElementById('adminFilterCategory');
        const statusSelect = document.getElementById('adminFilterStatus');
        const prioritySelect = document.getElementById('adminFilterPriority');

        if (searchInput) searchInput.value = '';
        if (catSelect) catSelect.value = 'ALL';
        if (statusSelect) statusSelect.value = 'ALL';
        if (prioritySelect) prioritySelect.value = 'ALL';

        this.applyFiltersAndRender();
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

    static escapeHTML(str) {
        if (!str) return '';
        return str.replace(/[&<>'"]/g, 
            tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
        );
    }
}

document.addEventListener('DOMContentLoaded', () => {
    AdminDashboardManager.init();
});

window.AdminDashboardManager = AdminDashboardManager;
