/**
 * Smart College Problem Solver - Supabase Configuration
 * Frontend-only setup using the official Supabase JS browser client.
 *
 * SECURITY:
 * - Use only the Supabase "anon" / publishable key here (safe for browsers).
 * - NEVER put the service_role or secret key in frontend code.
 *
 * SETUP (choose one):
 *
 * Option A — separate env file (recommended):
 *   1. Create js/supabase-env.js (do not commit real keys to public repos)
 *   2. Set: window.SUPABASE_URL = 'https://YOUR_PROJECT.supabase.co';
 *          window.SUPABASE_PUBLISHABLE_KEY = 'YOUR_ANON_PUBLISHABLE_KEY';
 *
 * Option B — set on window before this script loads.
 *
 * HTML load order (when wiring pages later):
 *   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
 *   <script src="js/supabase-env.js"></script>
 *   <script src="js/supabase-config.js"></script>
 */

(function (global) {
    'use strict';

    const SUPABASE_URL = global.SUPABASE_URL || 'https://texsoapbhgjnbkrsivqp.supabase.co';
    const SUPABASE_PUBLISHABLE_KEY = global.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_UC90l9fWw7f42SSd3KMkhQ_3jphA5Ro';

    function createClient() {
        if (typeof global.supabase === 'undefined' || typeof global.supabase.createClient !== 'function') {
            console.error(
                '[Supabase] JS library not loaded. Include the official CDN before supabase-config.js:\n' +
                'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'
            );
            return null;
        }

        if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
            console.warn(
                '[Supabase] Missing SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY. ' +
                'Provide them via js/supabase-env.js or window.SUPABASE_URL / window.SUPABASE_PUBLISHABLE_KEY.'
            );
            return null;
        }

        return global.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
    }

    let _client = null;

    global.SupabaseConfig = {
        SUPABASE_URL: SUPABASE_URL,
        SUPABASE_PUBLISHABLE_KEY: SUPABASE_PUBLISHABLE_KEY,

        isConfigured: function () {
            return Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);
        },

        getClient: function () {
            if (!_client) {
                _client = createClient();
            }
            return _client;
        },

        resetClient: function () {
            _client = null;
        }
    };
})(window);
