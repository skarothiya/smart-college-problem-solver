/**
 * Smart College Problem Solver - Problems Directory & Multi-Filter Engine
 * Pure Vanilla JS + Supabase PostgreSQL Data Pipeline
 */

class ProblemsDirectoryManager {
    static async init() {
        const user = await AuthManager.requireAuth(['student', 'admin']);
        if (!user) return;

        this.currentUser = AuthManager.getStudentSession();
        this.upvotedIds = await AppStorage.getUpvotedComplaintIdsForCurrentUser();
        this.allProblems = [];
        this.filteredProblems = [];

        this.filters = {
            search: '',
            category: 'ALL',
            status: 'ALL',
            priority: 'ALL',
            myOnly: false,
            sort: 'newest'
        };

        this.parseUrlParameters();
        await this.loadProblems();
        this.setupEventListeners();
    }

    static parseUrlParameters() {
        const params = new URLSearchParams(window.location.search);
        const categoryParam = params.get('category');
        const filterParam = params.get('filter');

        if (categoryParam) {
            this.filters.category = categoryParam;
            const selectEl = document.getElementById('filterCategory');
            if (selectEl) selectEl.value = categoryParam;
        }

        if (filterParam === 'my') {
            this.filters.myOnly = true;
            const myBtn = document.getElementById('filterMyToggle');
            if (myBtn) myBtn.classList.add('active');
        }
    }

    static async loadProblems() {
        this.allProblems = await AppStorage.getProblems();
        this.applyFiltersAndRender();
    }

    static applyFiltersAndRender() {
        let list = [...this.allProblems];

        // 1. Search Filter (Title, Description, Location, Student Name)
        if (this.filters.search.trim()) {
            const q = this.filters.search.toLowerCase().trim();
            list = list.filter(p => 
                (p.title && p.title.toLowerCase().includes(q)) ||
                (p.description && p.description.toLowerCase().includes(q)) ||
                (p.location && p.location.toLowerCase().includes(q)) ||
                (p.studentName && p.studentName.toLowerCase().includes(q))
            );
        }

        // 2. Category Filter
        if (this.filters.category && this.filters.category !== 'ALL') {
            list = list.filter(p => p.category === this.filters.category);
        }

        // 3. Status Filter
        if (this.filters.status && this.filters.status !== 'ALL') {
            list = list.filter(p => p.status === this.filters.status);
        }

        // 4. Priority Filter
        if (this.filters.priority && this.filters.priority !== 'ALL') {
            list = list.filter(p => p.priority === this.filters.priority);
        }

        // 5. My Problems Only Filter
        if (this.filters.myOnly && this.currentUser) {
            list = list.filter(p => p.userId === this.currentUser.id);
        }

        // 6. Sorting
        if (this.filters.sort === 'newest') {
            list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        } else if (this.filters.sort === 'oldest') {
            list.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
        } else if (this.filters.sort === 'upvotes') {
            list.sort((a, b) => (b.upvotes || 0) - (a.upvotes || 0));
        } else if (this.filters.sort === 'priority') {
            const priorityWeight = { 'High': 3, 'Medium': 2, 'Low': 1 };
            list.sort((a, b) => (priorityWeight[b.priority] || 0) - (priorityWeight[a.priority] || 0));
        }

        this.filteredProblems = list;
        this.renderResults();
    }

    static renderResults() {
        const grid = document.getElementById('problemsGrid');
        const countEl = document.getElementById('resultsCount');

        if (countEl) {
            countEl.textContent = `Showing ${this.filteredProblems.length} of ${this.allProblems.length} reported problems`;
        }

        if (!grid) return;

        if (this.filteredProblems.length === 0) {
            grid.innerHTML = `
                <div style="grid-column: 1 / -1; text-align: center; padding: 4rem 2rem; background: var(--bg-card); border: 1px dashed var(--border-color); border-radius: var(--radius-lg);">
                    <div style="font-size: 3rem; margin-bottom: 1rem;">🔍</div>
                    <h3 style="font-size: 1.3rem; margin-bottom: 0.5rem; color: #fff;">No Matching Problems Found</h3>
                    <p style="color: var(--text-secondary); max-width: 440px; margin: 0 auto 1.5rem;">We couldn't find any complaints matching your search keywords or active filters.</p>
                    <button class="btn btn-secondary" onclick="ProblemsDirectoryManager.resetFilters()">Clear Filters & Reset</button>
                </div>
            `;
            return;
        }

        const upvotedIds = this.upvotedIds || [];

        grid.innerHTML = this.filteredProblems.map(p => {
            const hasUpvoted = upvotedIds.includes(String(p.id));
            const priorityClass = `badge-priority-${(p.priority || 'medium').toLowerCase()}`;
            
            let statusClass = 'badge-pending';
            if (p.status === 'In Progress') statusClass = 'badge-progress';
            if (p.status === 'Solved') statusClass = 'badge-solved';

            const formattedDate = this.formatRelativeTime(p.createdAt);

            return `
                <div class="complaint-card" id="problem-card-${p.id}">
                    <div class="card-header">
                        <div>
                            <span class="badge badge-pill" style="margin-bottom: 0.4rem; display: inline-flex; align-items: center; gap: 0.35rem;">
                                ${this.getCategoryIcon(p.category)} ${p.category}
                            </span>
                            <h3 class="card-title">${this.escapeHTML(p.title)}</h3>
                        </div>
                        <div class="card-badges">
                            <span class="badge ${priorityClass}">${p.priority} Priority</span>
                            <span class="badge ${statusClass}">${p.status}</span>
                        </div>
                    </div>

                    <div class="card-body">
                        <p class="card-location">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                            ${this.escapeHTML(p.location || 'Campus Facility')}
                        </p>
                        <p class="card-desc">${this.escapeHTML(p.description)}</p>
                    </div>

                    <div class="card-footer">
                        <div style="display: flex; align-items: center; gap: 0.75rem;">
                            <button class="upvote-btn ${hasUpvoted ? 'upvoted-active' : ''}" 
                                    style="${hasUpvoted ? 'background: var(--primary); color: #fff;' : ''}"
                                    onclick="ProblemsDirectoryManager.handleUpvote('${p.id}', event)">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
                                <span id="upvote-count-${p.id}">${p.upvotes || 0}</span>
                            </button>
                            <span style="font-size: 0.8rem; color: var(--text-muted);">By ${this.escapeHTML(p.studentName)}</span>
                        </div>

                        <div class="card-meta">
                            <span>${formattedDate}</span>
                            <button class="btn btn-outline btn-sm" onclick="ProblemsDirectoryManager.openDetailModal('${p.id}')">
                                Details
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    static async handleUpvote(id, event) {
        if (event) event.stopPropagation();

        const idKey = String(id);
        const upvotedIds = this.upvotedIds || [];

        if (upvotedIds.includes(idKey)) {
            if (window.showToast) {
                window.showToast('You have already upvoted this problem!', 'error');
            }
            return;
        }

        const updated = await AppStorage.upvoteProblem(id);
        if (updated) {
            if (!this.upvotedIds) this.upvotedIds = [];
            this.upvotedIds.push(idKey);

            // Update UI count immediately
            const countEl = document.getElementById(`upvote-count-${id}`);
            if (countEl) countEl.textContent = updated.upvotes;

            const modalCountEl = document.getElementById(`modal-upvote-${id}`);
            if (modalCountEl) modalCountEl.textContent = updated.upvotes;

            // Re-render card button state
            const btn = event.currentTarget;
            if (btn) {
                btn.style.background = 'var(--primary)';
                btn.style.color = '#ffffff';
            }

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

        const upvotedIds = this.upvotedIds || [];
        const hasUpvoted = upvotedIds.includes(String(problem.id));

        modal.innerHTML = `
            <div class="modal-card">
                <div class="modal-header">
                    <div>
                        <span class="badge badge-pill" style="margin-bottom: 0.5rem;">${this.getCategoryIcon(problem.category)} ${problem.category}</span>
                        <h2 style="font-size: 1.4rem; font-weight: 800; color: #fff;">${this.escapeHTML(problem.title)}</h2>
                    </div>
                    <button class="modal-close-btn" onclick="ProblemsDirectoryManager.closeDetailModal()">&times;</button>
                </div>

                <div class="modal-body" style="display: flex; flex-direction: column; gap: 1.25rem;">
                    <div style="display: flex; gap: 0.75rem; flex-wrap: wrap;">
                        <span class="badge ${statusClass}">Status: ${problem.status}</span>
                        <span class="badge ${priorityClass}">Priority: ${problem.priority}</span>
                        <span class="badge badge-pill">📍 ${this.escapeHTML(problem.location)}</span>
                    </div>

                    <div>
                        <h4 style="font-size: 0.85rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.35rem;">Reported By</h4>
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
                        <button class="upvote-btn" style="${hasUpvoted ? 'background: var(--primary); color: #fff;' : ''}"
                                onclick="ProblemsDirectoryManager.handleUpvote('${problem.id}', event)">
                            👍 <span id="modal-upvote-${problem.id}">${problem.upvotes || 0}</span> Upvotes
                        </button>
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
        // Search Input
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.filters.search = e.target.value;
                this.applyFiltersAndRender();
            });
        }

        // Category Filter Select
        const catSelect = document.getElementById('filterCategory');
        if (catSelect) {
            catSelect.addEventListener('change', (e) => {
                this.filters.category = e.target.value;
                this.applyFiltersAndRender();
            });
        }

        // Status Filter Select
        const statusSelect = document.getElementById('filterStatus');
        if (statusSelect) {
            statusSelect.addEventListener('change', (e) => {
                this.filters.status = e.target.value;
                this.applyFiltersAndRender();
            });
        }

        // Priority Filter Select
        const prioritySelect = document.getElementById('filterPriority');
        if (prioritySelect) {
            prioritySelect.addEventListener('change', (e) => {
                this.filters.priority = e.target.value;
                this.applyFiltersAndRender();
            });
        }

        // Sort Select
        const sortSelect = document.getElementById('filterSort');
        if (sortSelect) {
            sortSelect.addEventListener('change', (e) => {
                this.filters.sort = e.target.value;
                this.applyFiltersAndRender();
            });
        }

        // Close modal on Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') this.closeDetailModal();
        });
    }

    static toggleMyFilter() {
        this.filters.myOnly = !this.filters.myOnly;
        const myBtn = document.getElementById('filterMyToggle');
        if (myBtn) {
            if (this.filters.myOnly) {
                myBtn.classList.add('btn-primary');
                myBtn.classList.remove('btn-secondary');
            } else {
                myBtn.classList.add('btn-secondary');
                myBtn.classList.remove('btn-primary');
            }
        }
        this.applyFiltersAndRender();
    }

    static setCategoryFilter(category) {
        this.filters.category = category;
        const selectEl = document.getElementById('filterCategory');
        if (selectEl) selectEl.value = category;

        // Highlight category pill buttons
        document.querySelectorAll('.cat-pill').forEach(btn => {
            if (btn.dataset.category === category) {
                btn.classList.add('btn-primary');
                btn.classList.remove('btn-secondary');
            } else {
                btn.classList.add('btn-secondary');
                btn.classList.remove('btn-primary');
            }
        });

        this.applyFiltersAndRender();
    }

    static resetFilters() {
        this.filters = {
            search: '',
            category: 'ALL',
            status: 'ALL',
            priority: 'ALL',
            myOnly: false,
            sort: 'newest'
        };

        const searchInput = document.getElementById('searchInput');
        const catSelect = document.getElementById('filterCategory');
        const statusSelect = document.getElementById('filterStatus');
        const prioritySelect = document.getElementById('filterPriority');
        const sortSelect = document.getElementById('filterSort');

        if (searchInput) searchInput.value = '';
        if (catSelect) catSelect.value = 'ALL';
        if (statusSelect) statusSelect.value = 'ALL';
        if (prioritySelect) prioritySelect.value = 'ALL';
        if (sortSelect) sortSelect.value = 'newest';

        this.setCategoryFilter('ALL');
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
    ProblemsDirectoryManager.init();
});

window.ProblemsDirectoryManager = ProblemsDirectoryManager;
