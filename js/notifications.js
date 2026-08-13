/**
 * Smart College Problem Solver - Student Notification Panel
 * PostgreSQL-backed notification bell, badge, and dropdown.
 */

class NotificationManager {
    static async init() {
        await AuthManager.refreshSession();
        const student = AuthManager.getStudentSession();
        if (!student) return;

        this.notifications = [];
        this.ensureWidget();
        await this.refresh();
        this.setupEventListeners();
    }

    static ensureWidget() {
        if (document.getElementById('notificationWidget')) return;

        const navActions = document.querySelector('.nav-actions');
        if (!navActions) return;

        const mobileToggle = document.getElementById('mobileToggle');
        const widget = document.createElement('div');
        widget.id = 'notificationWidget';
        widget.style.cssText = 'position: relative; display: flex; align-items: center;';

        widget.innerHTML = `
            <button type="button" id="notificationBellBtn" class="btn btn-outline btn-sm" aria-label="Notifications"
                    style="position: relative; padding: 0.45rem 0.65rem;">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                    <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
                </svg>
                <span id="notificationBadge"
                      style="display: none; position: absolute; top: -4px; right: -4px; min-width: 18px; height: 18px;
                             padding: 0 5px; border-radius: var(--radius-full); background: var(--primary); color: #fff;
                             font-size: 0.7rem; font-weight: 700; line-height: 18px; text-align: center;">0</span>
            </button>
            <div id="notificationDropdown"
                 style="display: none; position: absolute; top: calc(100% + 10px); right: 0; width: 320px; max-width: 90vw;
                        background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-md);
                        box-shadow: var(--shadow-md); backdrop-filter: blur(20px); z-index: 1000; overflow: hidden;">
                <div style="padding: 0.85rem 1rem; border-bottom: 1px solid var(--border-color);
                            display: flex; justify-content: space-between; align-items: center;">
                    <strong style="font-size: 0.9rem; color: #fff;">Notifications</strong>
                    <span id="notificationDropdownCount" style="font-size: 0.75rem; color: var(--text-muted);"></span>
                </div>
                <div id="notificationList" style="max-height: 340px; overflow-y: auto;"></div>
            </div>
        `;

        if (mobileToggle) {
            navActions.insertBefore(widget, mobileToggle);
        } else {
            navActions.appendChild(widget);
        }
    }

    static setupEventListeners() {
        const bellBtn = document.getElementById('notificationBellBtn');
        const dropdown = document.getElementById('notificationDropdown');

        if (bellBtn) {
            bellBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleDropdown();
            });
        }

        document.addEventListener('click', (e) => {
            const widget = document.getElementById('notificationWidget');
            if (!widget || !dropdown) return;
            if (!widget.contains(e.target)) {
                dropdown.style.display = 'none';
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && dropdown) {
                dropdown.style.display = 'none';
            }
        });
    }

    static toggleDropdown() {
        const dropdown = document.getElementById('notificationDropdown');
        if (!dropdown) return;
        dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
    }

    static async refresh() {
        this.notifications = await AppStorage.getNotificationsForCurrentUser();
        this.renderBadge();
        this.renderList();
    }

    static renderBadge() {
        const badge = document.getElementById('notificationBadge');
        const dropdownCount = document.getElementById('notificationDropdownCount');
        if (!badge) return;

        const unread = this.notifications.filter((n) => !n.isRead).length;
        badge.textContent = unread > 99 ? '99+' : String(unread);
        badge.style.display = unread > 0 ? 'block' : 'none';

        if (dropdownCount) {
            dropdownCount.textContent = unread > 0 ? `${unread} unread` : 'All caught up';
        }
    }

    static renderList() {
        const listEl = document.getElementById('notificationList');
        if (!listEl) return;

        if (!this.notifications.length) {
            listEl.innerHTML = `
                <div style="padding: 2rem 1rem; text-align: center; color: var(--text-muted); font-size: 0.875rem;">
                    No notifications yet
                </div>
            `;
            return;
        }

        listEl.innerHTML = this.notifications.map((n) => {
            const isUnread = !n.isRead;
            const timeLabel = this.formatRelativeTime(n.createdAt);
            return `
                <button type="button" class="notification-item" data-id="${n.id}"
                        style="display: block; width: 100%; text-align: left; padding: 0.85rem 1rem;
                               border: none; border-bottom: 1px solid var(--border-color); cursor: pointer;
                               background: ${isUnread ? 'rgba(99, 102, 241, 0.08)' : 'transparent'};
                               transition: var(--transition);"
                        onclick="NotificationManager.handleNotificationClick(${n.id}, event)">
                    <p style="font-size: 0.875rem; color: var(--text-primary); margin-bottom: 0.35rem; line-height: 1.45;">
                        ${this.escapeHTML(n.message)}
                    </p>
                    <span style="font-size: 0.75rem; color: var(--text-muted);">${timeLabel}</span>
                </button>
            `;
        }).join('');
    }

    static async handleNotificationClick(id, event) {
        if (event) event.stopPropagation();

        const notification = this.notifications.find((n) => String(n.id) === String(id));
        if (!notification || notification.isRead) return;

        const ok = await AppStorage.markNotificationRead(id);
        if (ok) {
            notification.isRead = true;
            this.renderBadge();
            this.renderList();
        }
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
            (tag) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
        );
    }
}

document.addEventListener('DOMContentLoaded', () => {
    NotificationManager.init();
});

window.NotificationManager = NotificationManager;
