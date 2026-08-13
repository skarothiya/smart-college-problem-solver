/**
 * Smart College Problem Solver - Supabase Connection Test
 * Console-only check; does not alter app UI, auth, or localStorage behavior.
 */

(function (global) {
    'use strict';

    async function runSupabaseConnectionTest() {
        const result = {
            success: false,
            configured: false,
            clientCreated: false,
            message: '',
            error: null,
            testedAt: new Date().toISOString()
        };

        if (!global.SupabaseConfig) {
            result.message = 'SupabaseConfig not loaded.';
            global.SupabaseConnectionTest = result;
            console.warn('[Supabase Test]', result.message);
            return result;
        }

        result.configured = global.SupabaseConfig.isConfigured();
        if (!result.configured) {
            result.message = 'Supabase credentials are missing.';
            global.SupabaseConnectionTest = result;
            console.warn('[Supabase Test]', result.message);
            return result;
        }

        const client = global.SupabaseConfig.getClient();
        if (!client) {
            result.message = 'Failed to create Supabase client.';
            global.SupabaseConnectionTest = result;
            console.error('[Supabase Test]', result.message);
            return result;
        }

        result.clientCreated = true;

        try {
            const { data, error } = await client.auth.getSession();

            if (error) {
                result.error = error.message || String(error);
                result.message = 'Supabase client created, but connection test returned an error.';
                global.SupabaseConnectionTest = result;
                console.warn('[Supabase Test]', result.message, error);
                return result;
            }

            result.success = true;
            result.message = 'Supabase client initialized and connected successfully.';
            result.session = data.session ? 'active' : 'none';
            global.SupabaseConnectionTest = result;
            console.info('[Supabase Test] ✅', result.message, '(session:', result.session + ')');
            return result;
        } catch (err) {
            result.error = err.message || String(err);
            result.message = 'Supabase connection test failed.';
            global.SupabaseConnectionTest = result;
            console.error('[Supabase Test] ❌', result.message, err);
            return result;
        }
    }

    global.runSupabaseConnectionTest = runSupabaseConnectionTest;

    document.addEventListener('DOMContentLoaded', function () {
        runSupabaseConnectionTest();
    });
})(window);
