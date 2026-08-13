/**
 * Smart College Problem Solver - Core App & Data Store Manager
 * Complaints, upvotes, notifications & images: Supabase PostgreSQL + Storage
 */

const STORAGE_KEYS = {};

/** @deprecated Legacy keys — cleared on init */
const LEGACY_AUTH_KEYS = ['studentSession', 'adminSession', 'students', 'admins'];
const LEGACY_COMPLAINTS_KEY = 'smart_college_problems';
const LEGACY_UPVOTE_KEY_PREFIX = 'smart_college_upvoted_';
const LEGACY_UPVOTE_OVERLAY_KEY = 'smart_college_upvote_overlay';
const LEGACY_NOTIFICATIONS_KEY = 'smart_college_notifications';

const COMPLAINT_IMAGES_BUCKET = 'complaint-images';
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
const SIGNED_URL_EXPIRY_SECONDS = 3600;

class AppStorage {
    static getSupabase() {
        return window.SupabaseConfig ? window.SupabaseConfig.getClient() : null;
    }

    static clearLegacyAuthStorage() {
        LEGACY_AUTH_KEYS.forEach((key) => localStorage.removeItem(key));
    }

    static clearLegacyComplaintsStorage() {
        localStorage.removeItem(LEGACY_COMPLAINTS_KEY);
    }

    static clearLegacyUpvoteStorage() {
        localStorage.removeItem(LEGACY_UPVOTE_OVERLAY_KEY);
        Object.keys(localStorage).forEach((key) => {
            if (key.startsWith(LEGACY_UPVOTE_KEY_PREFIX)) {
                localStorage.removeItem(key);
            }
        });
    }

    static clearLegacyNotificationStorage() {
        localStorage.removeItem(LEGACY_NOTIFICATIONS_KEY);
    }

    static init() {
        this.clearLegacyAuthStorage();
        this.clearLegacyComplaintsStorage();
        this.clearLegacyUpvoteStorage();
        this.clearLegacyNotificationStorage();
    }

    /** Map PostgreSQL row (+ optional profile) to existing UI complaint shape */
    static mapRowToProblem(row, profileMap = {}, resolvedImageUrl = null) {
        if (!row) return null;
        const profile = profileMap[row.user_id];

        return {
            id: row.id,
            userId: row.user_id,
            studentName: profile?.full_name || 'Student',
            title: row.title,
            category: row.category,
            location: row.location || '',
            description: row.description,
            priority: row.priority,
            status: row.status,
            image: resolvedImageUrl !== null ? resolvedImageUrl : (row.image_url || ''),
            upvotes: row.upvotes || 0,
            createdAt: row.created_at,
            updatedAt: row.updated_at
        };
    }

    static isStorageImagePath(value) {
        if (!value || typeof value !== 'string') return false;
        if (value.startsWith('data:') || value.startsWith('http://') || value.startsWith('https://')) {
            return false;
        }
        return /^[0-9a-f-]{36}\/.+/i.test(value);
    }

    static validateImageFile(file) {
        if (!file) {
            return { ok: false, message: 'No image file selected.' };
        }
        if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
            return { ok: false, message: 'Invalid file type. Please use JPEG, PNG, or WebP.' };
        }
        if (file.size > MAX_IMAGE_SIZE_BYTES) {
            return { ok: false, message: 'Image file size exceeds 5MB limit' };
        }
        return { ok: true };
    }

    static buildComplaintImagePath(userId, file) {
        const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
        const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        return `${userId}/${unique}.${ext}`;
    }

    static async uploadComplaintImage(file, userId) {
        const validation = this.validateImageFile(file);
        if (!validation.ok) {
            if (window.showToast) window.showToast(validation.message, 'error');
            return null;
        }

        const supabase = this.getSupabase();
        if (!supabase) {
            if (window.showToast) window.showToast('Storage unavailable. Please try again.', 'error');
            return null;
        }

        const path = this.buildComplaintImagePath(userId, file);

        try {
            const { error } = await supabase.storage
                .from(COMPLAINT_IMAGES_BUCKET)
                .upload(path, file, {
                    contentType: file.type,
                    upsert: false
                });

            if (error) throw error;
            return path;
        } catch (err) {
            console.error('[AppStorage] uploadComplaintImage error:', err);
            if (window.showToast) {
                window.showToast('Failed to upload image. Please try again.', 'error');
            }
            return null;
        }
    }

    static async resolveImageUrl(imagePathOrLegacy) {
        if (!imagePathOrLegacy) return '';

        if (!this.isStorageImagePath(imagePathOrLegacy)) {
            return imagePathOrLegacy;
        }

        const supabase = this.getSupabase();
        if (!supabase) return '';

        try {
            const { data, error } = await supabase.storage
                .from(COMPLAINT_IMAGES_BUCKET)
                .createSignedUrl(imagePathOrLegacy, SIGNED_URL_EXPIRY_SECONDS);

            if (error) throw error;
            return data?.signedUrl || '';
        } catch (err) {
            console.error('[AppStorage] resolveImageUrl error:', err);
            return '';
        }
    }

    static async resolveProblemImages(problems, rows) {
        await Promise.all(problems.map(async (problem, index) => {
            const raw = rows[index]?.image_url;
            if (raw && this.isStorageImagePath(raw)) {
                problem.image = await this.resolveImageUrl(raw);
            }
        }));
        return problems;
    }

    static normalizeComplaintId(id) {
        if (id === undefined || id === null || id === '') return null;
        return typeof id === 'string' && /^\d+$/.test(id) ? parseInt(id, 10) : id;
    }

    static async fetchProfilesForUserIds(userIds) {
        const supabase = this.getSupabase();
        if (!supabase || !userIds.length) return {};

        const { data, error } = await supabase
            .from('profiles')
            .select('id, full_name, email')
            .in('id', userIds);

        if (error) {
            console.error('[AppStorage] Profile fetch error:', error.message);
            return {};
        }

        const map = {};
        (data || []).forEach((p) => {
            map[p.id] = p;
        });
        return map;
    }

    static async mapRowsWithProfiles(rows) {
        const userIds = [...new Set((rows || []).map((r) => r.user_id).filter(Boolean))];
        const profileMap = await this.fetchProfilesForUserIds(userIds);
        const problems = (rows || []).map((row) => this.mapRowToProblem(row, profileMap));
        return this.resolveProblemImages(problems, rows || []);
    }

    /**
     * Load all complaints (students & admins — RLS applies)
     */
    static async getProblems() {
        const supabase = this.getSupabase();
        if (!supabase) {
            console.error('[AppStorage] Supabase client unavailable');
            return [];
        }

        try {
            const { data, error } = await supabase
                .from('complaints')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            return await this.mapRowsWithProfiles(data);
        } catch (err) {
            console.error('[AppStorage] getProblems error:', err);
            if (window.showToast) {
                window.showToast('Failed to load complaints. Please try again.', 'error');
            }
            return [];
        }
    }

    /**
     * Load complaints for one student by auth user UUID
     */
    static async getProblemsByUserId(userId) {
        const supabase = this.getSupabase();
        if (!supabase || !userId) return [];

        try {
            const { data, error } = await supabase
                .from('complaints')
                .select('*')
                .eq('user_id', userId)
                .order('created_at', { ascending: false });

            if (error) throw error;
            return await this.mapRowsWithProfiles(data);
        } catch (err) {
            console.error('[AppStorage] getProblemsByUserId error:', err);
            if (window.showToast) {
                window.showToast('Failed to load your complaints.', 'error');
            }
            return [];
        }
    }

    static async getProblemById(id) {
        const supabase = this.getSupabase();
        if (!supabase || id === undefined || id === null || id === '') return null;

        const numericId = this.normalizeComplaintId(id);

        try {
            const { data, error } = await supabase
                .from('complaints')
                .select('*')
                .eq('id', numericId)
                .maybeSingle();

            if (error) throw error;
            if (!data) return null;

            const profileMap = await this.fetchProfilesForUserIds([data.user_id]);
            const problem = this.mapRowToProblem(data, profileMap);
            await this.resolveProblemImages([problem], [data]);
            return problem;
        } catch (err) {
            console.error('[AppStorage] getProblemById error:', err);
            return null;
        }
    }

    /**
     * Create complaint — requires authenticated student (RLS)
     * Images uploaded to Supabase Storage (complaint-images bucket)
     */
    static async addProblem(problemData) {
        const supabase = this.getSupabase();
        if (!supabase) {
            if (window.showToast) window.showToast('Database unavailable. Please try again.', 'error');
            return null;
        }

        await AuthManager.refreshSession();
        const student = AuthManager.getStudentSession();
        if (!student) {
            if (window.showToast) window.showToast('Please sign in as a student to report a problem.', 'error');
            return null;
        }

        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (userError || !user) {
            if (window.showToast) window.showToast('Please sign in to submit a complaint.', 'error');
            return null;
        }

        let imagePath = null;
        if (problemData.imageFile instanceof File) {
            imagePath = await this.uploadComplaintImage(problemData.imageFile, user.id);
            if (!imagePath) return null;
        }

        const payload = {
            user_id: user.id,
            title: problemData.title,
            category: problemData.category || 'Other',
            location: problemData.location || 'Campus Main Ground',
            description: problemData.description,
            priority: problemData.priority || 'Medium',
            status: 'Pending',
            image_url: imagePath,
            upvotes: 0
        };

        try {
            const { data, error } = await supabase
                .from('complaints')
                .insert(payload)
                .select('*')
                .single();

            if (error) {
                if (imagePath) {
                    await supabase.storage.from(COMPLAINT_IMAGES_BUCKET).remove([imagePath]);
                }
                throw error;
            }

            const profileMap = await this.fetchProfilesForUserIds([data.user_id]);
            const problem = this.mapRowToProblem(data, profileMap);
            await this.resolveProblemImages([problem], [data]);
            return problem;
        } catch (err) {
            console.error('[AppStorage] addProblem error:', err);
            if (window.showToast) {
                window.showToast('Failed to save complaint. Please try again.', 'error');
            }
            return null;
        }
    }

    /**
     * Admin status update — PostgreSQL (RLS: admin only)
     * Creates student notification when status changes to In Progress or Solved.
     */
    static async updateProblemStatus(id, newStatus) {
        const supabase = this.getSupabase();
        if (!supabase) return null;

        const numericId = this.normalizeComplaintId(id);
        if (numericId === null) return null;

        try {
            const { data: before, error: fetchError } = await supabase
                .from('complaints')
                .select('id, user_id, status')
                .eq('id', numericId)
                .maybeSingle();

            if (fetchError) throw fetchError;
            if (!before) return null;

            const oldStatus = before.status;
            if (oldStatus === newStatus) {
                return await this.getProblemById(numericId);
            }

            const { data, error } = await supabase
                .from('complaints')
                .update({ status: newStatus })
                .eq('id', numericId)
                .select('*')
                .single();

            if (error) throw error;

            const profileMap = await this.fetchProfilesForUserIds([data.user_id]);
            const updated = this.mapRowToProblem(data, profileMap);

            await this.createStatusChangeNotification({
                complaintId: numericId,
                userId: before.user_id,
                oldStatus,
                newStatus
            });

            return updated;
        } catch (err) {
            console.error('[AppStorage] updateProblemStatus error:', err);
            if (window.showToast) {
                window.showToast('Failed to update status. Please try again.', 'error');
            }
            return null;
        }
    }

    static shouldNotifyStatusChange(oldStatus, newStatus) {
        if (!oldStatus || !newStatus || oldStatus === newStatus) return false;
        return newStatus === 'In Progress' || newStatus === 'Solved';
    }

    static getStatusNotificationMessage(newStatus) {
        if (newStatus === 'In Progress') {
            return 'Your complaint has been marked as In Progress.';
        }
        if (newStatus === 'Solved') {
            return 'Your complaint has been marked as Solved.';
        }
        return null;
    }

    static mapRowToNotification(row) {
        if (!row) return null;
        return {
            id: row.id,
            userId: row.user_id,
            complaintId: row.complaint_id,
            message: row.message,
            isRead: row.is_read,
            createdAt: row.created_at
        };
    }

    /**
     * Insert notification after admin status change (RLS: admin only)
     */
    static async createStatusChangeNotification({ complaintId, userId, oldStatus, newStatus }) {
        if (!this.shouldNotifyStatusChange(oldStatus, newStatus)) return true;

        const message = this.getStatusNotificationMessage(newStatus);
        if (!message) return true;

        const supabase = this.getSupabase();
        if (!supabase) {
            console.error('[AppStorage] createStatusChangeNotification: Supabase unavailable');
            return false;
        }

        try {
            const { error } = await supabase
                .from('notifications')
                .insert({
                    user_id: userId,
                    complaint_id: complaintId,
                    message,
                    is_read: false
                });

            if (error) throw error;
            return true;
        } catch (err) {
            console.error('[AppStorage] createStatusChangeNotification error:', err);
            if (window.showToast) {
                window.showToast('Status updated, but notification could not be sent.', 'error');
            }
            return false;
        }
    }

    /**
     * Load notifications for authenticated student (PostgreSQL)
     */
    static async getNotificationsForCurrentUser() {
        const supabase = this.getSupabase();
        if (!supabase) return [];

        await AuthManager.refreshSession();
        const student = AuthManager.getStudentSession();
        if (!student) return [];

        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (userError || !user) return [];

        try {
            const { data, error } = await supabase
                .from('notifications')
                .select('*')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false });

            if (error) throw error;
            return (data || []).map((row) => this.mapRowToNotification(row));
        } catch (err) {
            console.error('[AppStorage] getNotificationsForCurrentUser error:', err);
            if (window.showToast) {
                window.showToast('Failed to load notifications.', 'error');
            }
            return [];
        }
    }

    /**
     * Unread notification count for authenticated student
     */
    static async getUnreadNotificationCountForCurrentUser() {
        const supabase = this.getSupabase();
        if (!supabase) return 0;

        await AuthManager.refreshSession();
        const student = AuthManager.getStudentSession();
        if (!student) return 0;

        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (userError || !user) return 0;

        try {
            const { count, error } = await supabase
                .from('notifications')
                .select('id', { count: 'exact', head: true })
                .eq('user_id', user.id)
                .eq('is_read', false);

            if (error) throw error;
            return count || 0;
        } catch (err) {
            console.error('[AppStorage] getUnreadNotificationCount error:', err);
            return 0;
        }
    }

    /**
     * Mark one notification as read (RLS: own rows only)
     */
    static async markNotificationRead(id) {
        const supabase = this.getSupabase();
        if (!supabase) return false;

        await AuthManager.refreshSession();
        const student = AuthManager.getStudentSession();
        if (!student) return false;

        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (userError || !user) return false;

        const numericId = this.normalizeComplaintId(id);
        if (numericId === null) return false;

        try {
            const { error } = await supabase
                .from('notifications')
                .update({ is_read: true })
                .eq('id', numericId)
                .eq('user_id', user.id);

            if (error) throw error;
            return true;
        } catch (err) {
            console.error('[AppStorage] markNotificationRead error:', err);
            if (window.showToast) {
                window.showToast('Failed to mark notification as read.', 'error');
            }
            return false;
        }
    }

    /**
     * Complaint IDs the current student has upvoted (PostgreSQL)
     */
    static async getUpvotedComplaintIdsForCurrentUser() {
        const supabase = this.getSupabase();
        if (!supabase) return [];

        await AuthManager.refreshSession();
        const student = AuthManager.getStudentSession();
        if (!student) return [];

        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (userError || !user) return [];

        try {
            const { data, error } = await supabase
                .from('upvotes')
                .select('complaint_id')
                .eq('user_id', user.id);

            if (error) throw error;
            return (data || []).map((row) => String(row.complaint_id));
        } catch (err) {
            console.error('[AppStorage] getUpvotedComplaintIds error:', err);
            return [];
        }
    }

    /**
     * Create upvote — inserts into public.upvotes (RLS: student only)
     * complaints.upvotes synced by DB trigger sync_complaint_upvote_count
     */
    static async upvoteProblem(id) {
        const supabase = this.getSupabase();
        if (!supabase) {
            if (window.showToast) window.showToast('Database unavailable. Please try again.', 'error');
            return null;
        }

        await AuthManager.refreshSession();
        const student = AuthManager.getStudentSession();
        if (!student) {
            if (window.showToast) window.showToast('Please sign in as a student to upvote.', 'error');
            return null;
        }

        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (userError || !user) {
            if (window.showToast) window.showToast('Please sign in to upvote.', 'error');
            return null;
        }

        const complaintId = this.normalizeComplaintId(id);
        if (complaintId === null) return null;

        try {
            const { data: existing, error: checkError } = await supabase
                .from('upvotes')
                .select('id')
                .eq('complaint_id', complaintId)
                .eq('user_id', user.id)
                .maybeSingle();

            if (checkError) throw checkError;

            if (existing) {
                if (window.showToast) {
                    window.showToast('You have already upvoted this problem!', 'error');
                }
                return null;
            }

            const { error: insertError } = await supabase
                .from('upvotes')
                .insert({
                    complaint_id: complaintId,
                    user_id: user.id
                });

            if (insertError) {
                if (insertError.code === '23505') {
                    if (window.showToast) {
                        window.showToast('You have already upvoted this problem!', 'error');
                    }
                    return null;
                }
                throw insertError;
            }

            return await this.getProblemById(complaintId);
        } catch (err) {
            console.error('[AppStorage] upvoteProblem error:', err);
            if (window.showToast) {
                window.showToast('Failed to upvote. Please try again.', 'error');
            }
            return null;
        }
    }
}

// Global Toast System Utility
function showToast(message, type = 'info') {
    let container = document.getElementById('toastContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toastContainer';
        container.style.cssText = `
            position: fixed;
            bottom: 24px;
            right: 24px;
            z-index: 9999;
            display: flex;
            flex-direction: column;
            gap: 10px;
            pointer-events: none;
        `;
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.style.cssText = `
        pointer-events: auto;
        padding: 12px 20px;
        border-radius: 10px;
        background: #1e293b;
        color: #f8fafc;
        font-size: 0.9rem;
        font-weight: 500;
        box-shadow: 0 10px 30px rgba(0,0,0,0.5);
        border: 1px solid rgba(255,255,255,0.1);
        display: flex;
        align-items: center;
        gap: 10px;
        animation: fadeIn 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        transition: all 0.3s ease;
    `;

    let icon = 'ℹ️';
    if (type === 'success') {
        icon = '✅';
        toast.style.borderColor = 'rgba(16, 185, 129, 0.4)';
    } else if (type === 'error') {
        icon = '⚠️';
        toast.style.borderColor = 'rgba(239, 68, 68, 0.4)';
    }

    toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

// Mobile Navigation Toggle Setup
document.addEventListener('DOMContentLoaded', () => {
    AppStorage.init();

    const mobileToggle = document.getElementById('mobileToggle');
    const navMenu = document.getElementById('navMenu');

    if (mobileToggle && navMenu) {
        mobileToggle.addEventListener('click', () => {
            navMenu.classList.toggle('active');
        });

        document.addEventListener('click', (e) => {
            if (!navMenu.contains(e.target) && !mobileToggle.contains(e.target)) {
                navMenu.classList.remove('active');
            }
        });
    }
});

window.AppStorage = AppStorage;
window.showToast = showToast;
