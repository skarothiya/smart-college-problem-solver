/**
 * Smart College Problem Solver - Supabase Authentication
 * Session managed by Supabase Auth (not custom localStorage sessions).
 */

const MIN_PASSWORD_LENGTH = 6;

class AuthManager {
    static _cachedProfile = null;
    static _lastProfileError = null;

    static getSupabase() {
        return window.SupabaseConfig ? window.SupabaseConfig.getClient() : null;
    }

    static isValidEmail(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }

    static mapProfile(row) {
        if (!row) return null;
        return {
            id: row.id,
            name: row.full_name,
            email: row.email,
            role: row.role
        };
    }

    static escapeHTML(str) {
        if (!str) return '';
        return str.replace(/[&<>'"]/g,
            (tag) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
        );
    }

    static async fetchProfile(userId) {
        const supabase = this.getSupabase();
        if (!supabase || !userId) return null;

        const { data, error } = await supabase
            .from('profiles')
            .select('id, full_name, email, role')
            .eq('id', userId)
            .maybeSingle();

        if (error) {
            this._lastProfileError = error;
            console.error('[Auth] Profile fetch error:', error.message, error.code || '');
            return null;
        }

        this._lastProfileError = null;
        return this.mapProfile(data);
    }

    static getProfileErrorMessage() {
        const err = this._lastProfileError;
        if (!err) {
            return 'Could not load your profile. Supabase SQL setup may be incomplete.';
        }

        const msg = (err.message || '').toLowerCase();
        const code = err.code || '';

        if (code === 'PGRST205' || msg.includes('does not exist') || msg.includes('schema cache')) {
            return 'Database tables are missing. Run supabase/schema.sql in Supabase SQL Editor, then try again.';
        }
        if (code === 'PGRST202' || msg.includes('ensure_my_student_profile')) {
            return 'Database function missing. Run supabase/fix-profile-login.sql in Supabase SQL Editor, then try again.';
        }
        if (msg.includes('permission') || msg.includes('policy') || code === '42501') {
            return 'Database permission error. Run supabase/fix-profile-login.sql in Supabase SQL Editor, then try again.';
        }

        return 'Could not load your profile. Run supabase/fix-profile-login.sql in Supabase SQL Editor, then try again.';
    }

    static async refreshSession() {
        const supabase = this.getSupabase();
        if (!supabase) {
            this._cachedProfile = null;
            return null;
        }

        try {
            const { data: { session }, error } = await supabase.auth.getSession();
            if (error) throw error;

            if (!session || !session.user) {
                this._cachedProfile = null;
                return null;
            }

            let profile = await this.fetchProfile(session.user.id);
            if (!profile && session.user) {
                await this.fetchOrCreateProfile(session.user);
                profile = await this.fetchProfile(session.user.id);
            }
            this._cachedProfile = profile;
            return profile;
        } catch (err) {
            console.error('[Auth] Session refresh error:', err);
            this._cachedProfile = null;
            return null;
        }
    }

    /** Sync read of cached student profile (call refreshSession first). */
    static getStudentSession() {
        if (this._cachedProfile && this._cachedProfile.role === 'student') {
            return this._cachedProfile;
        }
        return null;
    }

    /** Sync read of cached admin profile (call refreshSession first). */
    static getAdminSession() {
        if (this._cachedProfile && this._cachedProfile.role === 'admin') {
            return this._cachedProfile;
        }
        return null;
    }

    static _mapAuthError(error, fallback) {
        if (!error) return fallback;
        const msg = (error.message || '').toLowerCase();

        if (msg.includes('already registered') || msg.includes('already been registered')) {
            return 'An account with this email already exists.';
        }
        if (msg.includes('invalid login credentials') || msg.includes('invalid email or password')) {
            return 'Invalid email or password.';
        }
        if (msg.includes('password') && (msg.includes('short') || msg.includes('least') || msg.includes('weak'))) {
            return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
        }
        if (msg.includes('network') || msg.includes('fetch')) {
            return 'Network error. Please check your connection and try again.';
        }

        return error.message || fallback;
    }

    static async ensureStudentProfile(user, fullName, email) {
        const supabase = this.getSupabase();
        if (!supabase || !user) return null;

        const name = (fullName || '').trim() || user.user_metadata?.full_name || user.email?.split('@')[0] || 'Student';
        const mail = email || user.email || '';

        try {
            const { data, error } = await supabase.rpc('ensure_my_student_profile', {
                p_full_name: name,
                p_email: mail
            });

            if (!error && data) {
                const row = Array.isArray(data) ? data[0] : data;
                if (row) return this.mapProfile(row);
            }

            if (error) {
                this._lastProfileError = error;
                console.warn('[Auth] ensure_my_student_profile RPC:', error.message, error.code || '', '- trying direct insert');
            }
        } catch (err) {
            console.warn('[Auth] ensure_my_student_profile RPC failed:', err);
        }

        const { error: insertError } = await supabase.from('profiles').insert({
            id: user.id,
            full_name: name,
            email: mail,
            role: 'student'
        });

        if (insertError) {
            if (insertError.code === '23505') {
                return await this.fetchProfile(user.id);
            }
            this._lastProfileError = insertError;
            console.error('[Auth] Profile insert failed:', insertError.message, insertError.code || '', insertError);
            return null;
        }

        return await this.fetchProfile(user.id);
    }

    /**
     * Load profile; create student profile on first login if trigger missed it.
     */
    static async fetchOrCreateProfile(user) {
        if (!user) return null;

        let profile = await this.fetchProfile(user.id);
        if (profile) return profile;

        const fullName = user.user_metadata?.full_name
            || user.email?.split('@')[0]
            || 'Student';

        profile = await this.ensureStudentProfile(user, fullName, user.email || '');
        return profile;
    }

    /**
     * Student Registration — supabase.auth.signUp()
     */
    static async registerStudent(name, email, password, confirmPassword) {
        const trimmedName = (name || '').trim();
        const trimmedEmail = (email || '').trim();
        const trimmedPassword = password || '';
        const trimmedConfirm = confirmPassword || '';

        if (!trimmedName || !trimmedEmail || !trimmedPassword || !trimmedConfirm) {
            return { success: false, message: 'Please fill in all fields.' };
        }

        if (!this.isValidEmail(trimmedEmail)) {
            return { success: false, message: 'Please enter a valid email address.' };
        }

        if (trimmedPassword.length < MIN_PASSWORD_LENGTH) {
            return { success: false, message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` };
        }

        if (trimmedPassword !== trimmedConfirm) {
            return { success: false, message: 'Password and Confirm Password do not match.' };
        }

        const supabase = this.getSupabase();
        if (!supabase) {
            return { success: false, message: 'Authentication service is unavailable. Please try again later.' };
        }

        try {
            const { data, error } = await supabase.auth.signUp({
                email: trimmedEmail,
                password: trimmedPassword,
                options: {
                    data: { full_name: trimmedName }
                }
            });

            if (error) {
                return {
                    success: false,
                    message: this._mapAuthError(error, 'Registration failed. Please try again.')
                };
            }

            if (data.user) {
                await this.ensureStudentProfile(data.user, trimmedName, trimmedEmail);
            }

            if (data.session) {
                const profile = await this.fetchOrCreateProfile(data.user);
                if (profile && profile.role === 'student') {
                    this._cachedProfile = profile;
                } else {
                    await supabase.auth.signOut();
                    this._cachedProfile = null;
                }
            }

            return { success: true, needsEmailConfirmation: !data.session };
        } catch (err) {
            return {
                success: false,
                message: this._mapAuthError(err, 'Registration failed. Please try again.')
            };
        }
    }

    /**
     * Student Login — supabase.auth.signInWithPassword()
     */
    static async studentLogin(email, password) {
        if (!email || !password) {
            return { success: false, message: 'Invalid email or password.' };
        }

        const supabase = this.getSupabase();
        if (!supabase) {
            return { success: false, message: 'Authentication service is unavailable. Please try again later.' };
        }

        try {
            const { data, error } = await supabase.auth.signInWithPassword({
                email: email.trim(),
                password: password
            });

            if (error) {
                return {
                    success: false,
                    message: this._mapAuthError(error, 'Invalid email or password.')
                };
            }

            await supabase.auth.getSession();

            const profile = await this.fetchOrCreateProfile(data.user);

            if (!profile) {
                await supabase.auth.signOut();
                this._cachedProfile = null;
                return {
                    success: false,
                    message: this.getProfileErrorMessage()
                };
            }

            if (profile.role !== 'student') {
                await supabase.auth.signOut();
                this._cachedProfile = null;
                return { success: false, message: 'Invalid email or password.' };
            }

            this._cachedProfile = profile;
            return { success: true, session: profile };
        } catch (err) {
            return {
                success: false,
                message: this._mapAuthError(err, 'Invalid email or password.')
            };
        }
    }

    /**
     * Admin Login — supabase.auth.signInWithPassword() + role admin check
     */
    static async adminLogin(email, password) {
        if (!email || !password) {
            return { success: false, message: 'Invalid email or password.' };
        }

        const supabase = this.getSupabase();
        if (!supabase) {
            return { success: false, message: 'Authentication service is unavailable. Please try again later.' };
        }

        try {
            const { data, error } = await supabase.auth.signInWithPassword({
                email: email.trim(),
                password: password
            });

            if (error) {
                return {
                    success: false,
                    message: this._mapAuthError(error, 'Invalid email or password.')
                };
            }

            const profile = await this.fetchProfile(data.user.id);

            if (!profile) {
                await supabase.auth.signOut();
                this._cachedProfile = null;
                return { success: false, message: 'Profile not found. Please contact support.' };
            }

            if (profile.role !== 'admin') {
                await supabase.auth.signOut();
                this._cachedProfile = null;
                return { success: false, message: 'Invalid email or password.' };
            }

            this._cachedProfile = profile;
            return { success: true, session: profile };
        } catch (err) {
            return {
                success: false,
                message: this._mapAuthError(err, 'Invalid email or password.')
            };
        }
    }

    /**
     * Student or admin access guard (e.g. browse complaints)
     */
    static async requireAuth(allowedRoles = ['student', 'admin']) {
        await this.refreshSession();
        const profile = this._cachedProfile;

        if (profile && allowedRoles.includes(profile.role)) {
            return profile;
        }

        if (window.showToast) {
            window.showToast('Please sign in to continue.', 'error');
        }

        setTimeout(() => {
            window.location.href = 'student-login.html';
        }, 400);

        return null;
    }

    /**
     * Strict Student Access Guard
     */
    static async requireStudentAuth() {
        await this.refreshSession();
        const student = this.getStudentSession();

        if (student && student.role === 'student') {
            return student;
        }

        if (window.showToast) {
            window.showToast('Student access required.', 'error');
        }

        setTimeout(() => {
            window.location.href = 'student-login.html';
        }, 400);

        return null;
    }

    /**
     * Strict Admin Access Guard
     */
    static async requireAdminAuth() {
        await this.refreshSession();
        const admin = this.getAdminSession();

        if (admin && admin.role === 'admin') {
            return admin;
        }

        if (window.showToast) {
            window.showToast('Admin access required.', 'error');
        }

        setTimeout(() => {
            window.location.href = 'admin-login.html';
        }, 400);

        return null;
    }

    /**
     * Student Logout
     */
    static async studentLogout() {
        const supabase = this.getSupabase();
        if (supabase) {
            await supabase.auth.signOut();
        }
        this._cachedProfile = null;

        if (window.showToast) {
            window.showToast('Logged out of Student Portal', 'info');
        }

        setTimeout(() => {
            window.location.href = 'student-login.html';
        }, 300);
    }

    /**
     * Admin Logout
     */
    static async adminLogout() {
        const supabase = this.getSupabase();
        if (supabase) {
            await supabase.auth.signOut();
        }
        this._cachedProfile = null;

        if (window.showToast) {
            window.showToast('Logged out of Admin Portal', 'info');
        }

        setTimeout(() => {
            window.location.href = 'admin-login.html';
        }, 300);
    }

    /**
     * Dynamic Navigation Bar State Updating
     */
    static updateNavUI() {
        const student = this.getStudentSession();
        const admin = this.getAdminSession();
        const navMenu = document.getElementById('navMenu');
        if (!navMenu) return;

        let authLi = navMenu.querySelector('.nav-auth-item');
        if (!authLi) {
            authLi = document.createElement('li');
            authLi.className = 'nav-auth-item';
            navMenu.appendChild(authLi);
        }

        const isPageAdmin = window.location.pathname.includes('admin');

        if (isPageAdmin && admin) {
            authLi.innerHTML = `
                <div style="display:flex; align-items:center; gap:0.6rem;">
                    <a href="admin.html" class="badge badge-pill" style="text-transform:none; text-decoration:none;">
                        ⚙️ ${this.escapeHTML(admin.name)} (ADMIN)
                    </a>
                    <button onclick="AuthManager.adminLogout()" class="btn btn-secondary btn-sm" style="padding:0.35rem 0.75rem;">
                        Sign Out
                    </button>
                </div>
            `;
        } else if (student) {
            authLi.innerHTML = `
                <div style="display:flex; align-items:center; gap:0.6rem;">
                    <a href="student-dashboard.html" class="badge badge-pill" style="text-transform:none; text-decoration:none;">
                        🎓 ${this.escapeHTML(student.name)} (STUDENT)
                    </a>
                    <button onclick="AuthManager.studentLogout()" class="btn btn-secondary btn-sm" style="padding:0.35rem 0.75rem;">
                        Sign Out
                    </button>
                </div>
            `;
        } else if (admin) {
            authLi.innerHTML = `
                <div style="display:flex; align-items:center; gap:0.6rem;">
                    <a href="admin.html" class="badge badge-pill" style="text-transform:none; text-decoration:none;">
                        ⚙️ ${this.escapeHTML(admin.name)} (ADMIN)
                    </a>
                    <button onclick="AuthManager.adminLogout()" class="btn btn-secondary btn-sm" style="padding:0.35rem 0.75rem;">
                        Sign Out
                    </button>
                </div>
            `;
        } else {
            authLi.innerHTML = '';
        }
    }

    static _setupAuthListener() {
        const supabase = this.getSupabase();
        if (!supabase) return;

        supabase.auth.onAuthStateChange(async () => {
            await this.refreshSession();
            this.updateNavUI();
        });
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    if (window.AppStorage && typeof window.AppStorage.clearLegacyAuthStorage === 'function') {
        window.AppStorage.clearLegacyAuthStorage();
    }

    if (window.SupabaseConfig && window.SupabaseConfig.isConfigured()) {
        await AuthManager.refreshSession();
        AuthManager._setupAuthListener();
    }

    AuthManager.updateNavUI();
});

window.AuthManager = AuthManager;
