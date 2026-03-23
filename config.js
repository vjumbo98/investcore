window.INVESTCORE_CONFIG = {
  adminPassword: 'adminpass123',
  resetRedirectPath: 'auth.html?type=recovery',
  supabaseHives: [
    {
      name: 'main',
      role: 'admin',
      url: 'https://khjqmipquqhnrlhdyjws.supabase.co',
      anonKey: 'sb_publishable__AydeKHEYpncS0Jgx2PEuw_Mv6DwYEG'
    },
    {
      name: 'hive1',
      role: 'user',
      url: 'https://xpqmheftmcjsozykjnxk.supabase.co',
      anonKey: 'sb_publishable_RzKc1BvadOEifZESXm7fjA_J_r1SjQQ'
    },
    {
      name: 'hive2',
      role: 'user',
      url: 'https://sfvreetqicoxxguienjc.supabase.co',
      anonKey: 'sb_publishable_9rRLLWyBu-d5oyTsHhHBPg_zUH0a1lQ'
    },
    {
      name: 'hive3',
      role: 'user',
      url: 'https://wqglrnjpuspzbfhhvhrq.supabase.co',
      anonKey: 'sb_publishable_acFTLy8hX_plWJGuIeUJ-g_c1vq8CVe'
    },
    {
      name: 'hive4',
      role: 'user',
      url: 'https://gmdunwumtucattcetobg.supabase.co',
      anonKey: 'sb_publishable_EDO3CcjHfyaQhdcXaXGmtQ_VfbEHKdH'
    },
    {
      name: 'hive5',
      role: 'user',
      url: 'https://ssrdnlnftlptejubyuip.supabase.co',
      anonKey: 'sb_publishable_Z43fZ96GU84lwc_H38IiIQ_XPbyuPe8'
    },
  ]
};

window.InvestCoreSupabase = (function () {
  'use strict';

  const config = window.INVESTCORE_CONFIG || { supabaseHives: [] };
  const hiveConfigs = Array.isArray(config.supabaseHives) ? config.supabaseHives : [];
  const clients = new Map();

  function ensureSupabaseLibrary() {
    if (!window.supabase || typeof window.supabase.createClient !== 'function') {
      throw new Error('Supabase JS library is missing.');
    }
  }

  function getHiveConfig(index) {
    return hiveConfigs[index] || null;
  }

  function getUserHives() {
    return hiveConfigs.slice(1);
  }

  function getAllHiveClients() {
    return hiveConfigs.map(function (_, index) {
      try {
        return createClientForHive(index);
      } catch (error) {
        console.warn('[InvestCoreSupabase] Failed to create hive client for index', index, error);
        return null;
      }
    }).filter(Boolean);
  }

  function mapAuthUser(user, hiveId) {
    if (!user) return null;
    return {
      id: user.id,
      email: user.email || '',
      phone: user.phone || '',
      hiveId: hiveId,
      full_name: user.user_metadata && user.user_metadata.full_name ? user.user_metadata.full_name : '',
      metadata: user.user_metadata || {},
      created_at: user.created_at || null,
      last_sign_in_at: user.last_sign_in_at || null,
      raw: user
    };
  }

  async function safeGetCurrentUser(client) {
    if (!client || !client.auth || typeof client.auth.getUser !== 'function') {
      return null;
    }
    try {
      var response = await client.auth.getUser();
      return response && response.data ? response.data.user || null : null;
    } catch (error) {
      console.warn('[InvestCoreSupabase] safeGetCurrentUser failed', error);
      return null;
    }
  }

  async function safeListUsersForHive(hiveId, page, perPage) {
    var client = createClientForHive(hiveId);
    if (!client) {
      return { users: [], error: new Error('Supabase client not available.'), hiveId: hiveId };
    }

    try {
      // Query user_balances for unique user_ids (admin RLS allows all)
      const { data, error, count } = await client
        .from('user_balances')
        .select('user_id', { count: 'exact' })
        .range((page - 1) * perPage, page * perPage - 1)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const users = [...new Set(data.map(item => item.user_id))]; // Unique uids
      return {
        users,
        error: null,
        hiveId: hiveId,
        total: count || users.length
      };
    } catch (error) {
      return { users: [], error: error, hiveId: hiveId };
    }
  }

  async function safeListAllUsers(page, perPage) {
    var results = [];
    for (var hiveId = 0; hiveId < hiveConfigs.length; hiveId += 1) {
      results.push(await safeListUsersForHive(hiveId, page, perPage));
    }
    return results;
  }

  function buildStorageKey(index) {
    return 'investcore-sb-auth-' + index;
  }

  function createClientForHive(index) {
    ensureSupabaseLibrary();
    const hive = getHiveConfig(index);
    if (!hive || !hive.url || !hive.anonKey) {
      throw new Error('Missing Supabase hive configuration for index ' + index + '.');
    }

    if (!clients.has(index)) {
      const client = window.supabase.createClient(hive.url, hive.anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          storageKey: buildStorageKey(index)
        }
      });
      clients.set(index, client);
    }

    return clients.get(index);
  }

  function getStoredHiveId() {
    const value = Number(localStorage.getItem('investcore_hiveId'));
    return Number.isFinite(value) ? value : null;
  }

  function storeAuthContext(payload) {
    if (payload && payload.hiveId !== undefined) {
      localStorage.setItem('investcore_hiveId', String(payload.hiveId));
    }
    if (payload && payload.userId) {
      localStorage.setItem('investcore_userId', payload.userId);
    }
    if (payload && payload.email) {
      localStorage.setItem('investcore_userEmail', payload.email);
    }
    if (payload && payload.fullName) {
      localStorage.setItem('investcore_fullName', payload.fullName);
    }
  }

  function clearAuthContext() {
    localStorage.removeItem('investcore_hiveId');
    localStorage.removeItem('investcore_userId');
    localStorage.removeItem('investcore_userEmail');
    localStorage.removeItem('investcore_fullName');
  }

  function getClient(options) {
    const opts = options || {};
    if (opts.admin) {
      return createClientForHive(0);
    }
    if (typeof opts.hiveId === 'number') {
      return createClientForHive(opts.hiveId);
    }
    const storedHiveId = getStoredHiveId();
    if (storedHiveId !== null) {
      return createClientForHive(storedHiveId);
    }
    if (hiveConfigs.length > 1) {
      return createClientForHive(1);
    }
    return createClientForHive(0);
  }

  async function signUpAcrossHives(email, password, metadata) {
    const userHives = getUserHives();
    const errors = [];

    for (let offset = 0; offset < userHives.length; offset += 1) {
      const hiveId = offset + 1;
      const client = createClientForHive(hiveId);
      const result = await client.auth.signUp({
        email,
        password,
        options: {
          data: metadata || {}
        }
      });

      if (!result.error) {
        // Signup succeeded on this hive — store context and return
        var user = result.data && result.data.user ? result.data.user : null;
        storeAuthContext({
          hiveId,
          userId: user ? user.id : '',
          email,
          fullName: metadata && metadata.full_name ? metadata.full_name : ''
        });
        return { hiveId, client, result };
      }

      // Signup failed on this hive — record error and try next one
      errors.push({ hiveId, message: result.error.message });
    }

    var hasRateLimit = errors.some(function(e) {
      return /rate.?limit|too many requests|over.?request/i.test(e.message);
    });
    if (hasRateLimit) {
      throw new Error('Too many attempts. Please wait a few minutes and try again.');
    }

    var hasWeakPassword = errors.some(function(e) {
      return /password.*short|password.*weak|password.*length|at least/i.test(e.message);
    });
    if (hasWeakPassword) {
      throw new Error('Your password is too weak. Please use at least 8 characters with a mix of letters and numbers.');
    }

    throw new Error('Unable to create your account right now. Please try again later.');
  }

  async function signInAcrossHives(email, password) {
    const userHives = getUserHives();
    const errors = [];

    for (let offset = 0; offset < userHives.length; offset += 1) {
      const hiveId = offset + 1;
      const client = createClientForHive(hiveId);
      const result = await client.auth.signInWithPassword({ email, password });

      if (!result.error) {
        const user = result.data && result.data.user ? result.data.user : null;
        storeAuthContext({
          hiveId,
          userId: user ? user.id : '',
          email,
          fullName: user && user.user_metadata ? user.user_metadata.full_name || '' : ''
        });
        return { hiveId, client, result };
      }

      errors.push({ hiveId, message: result.error.message });
    }

    // Build user-friendly error — never expose hive/server internals
    var hasInvalidCreds = errors.some(function(e) {
      return /invalid.*credentials|invalid login/i.test(e.message);
    });
    var hasEmailNotConfirmed = errors.some(function(e) {
      return /email not confirmed/i.test(e.message);
    });

    if (hasEmailNotConfirmed) {
      var err = new Error('Your email has not been confirmed yet. Please check your inbox for the confirmation code.');
      err.code = 'EMAIL_NOT_CONFIRMED';
      throw err;
    }
    if (hasInvalidCreds) {
      throw new Error('Invalid email or password. Please check your credentials and try again.');
    }
    throw new Error('Unable to sign in right now. Please try again later.');
  }

  async function getCurrentUserAcrossHives() {
    for (let hiveId = 1; hiveId < hiveConfigs.length; hiveId += 1) {
      const client = createClientForHive(hiveId);
      const user = await safeGetCurrentUser(client);
      if (user) {
        storeAuthContext({
          hiveId,
          userId: user.id,
          email: user.email || '',
          fullName: user.user_metadata ? user.user_metadata.full_name || '' : ''
        });
        return { hiveId, client, user };
      }
    }
    return null;
  }

  async function logoutAll() {
    const jobs = [];
    for (let hiveId = 0; hiveId < hiveConfigs.length; hiveId += 1) {
      try {
        const client = createClientForHive(hiveId);
        jobs.push(client.auth.signOut());
      } catch (error) {
        console.warn(error);
      }
    }
    await Promise.allSettled(jobs);
    clearAuthContext();
  }

  async function fetchApprovedReviewsAcrossHives() {
    const results = [];

    for (let hiveId = 1; hiveId < hiveConfigs.length; hiveId += 1) {
      const client = createClientForHive(hiveId);
      const response = await client
        .from('reviews')
        .select('*')
        .eq('approved', true)
        .order('created_at', { ascending: false });

      if (!response.error && Array.isArray(response.data)) {
        response.data.forEach(function (item) {
          results.push(Object.assign({}, item, { hiveId }));
        });
      }
    }

    return results;
  }

  async function fetchPendingReviewsAcrossHives() {
    const results = [];

    for (let hiveId = 1; hiveId < hiveConfigs.length; hiveId += 1) {
      const client = createClientForHive(hiveId);
      const response = await client
        .from('reviews')
        .select('*')
        .eq('approved', false)
        .order('created_at', { ascending: false });

      if (!response.error && Array.isArray(response.data)) {
        response.data.forEach(function (item) {
          results.push(Object.assign({}, item, { hiveId }));
        });
      }
    }

    return results;
  }

  return {
    config,
    hiveConfigs,
    getHiveConfig,
    getUserHives,
    getAllHiveClients,
    getStoredHiveId,
    storeAuthContext,
    clearAuthContext,
    getClient,
    signUpAcrossHives,
    signInAcrossHives,
    safeGetCurrentUser,
    safeListUsersForHive,
    safeListAllUsers,
    getCurrentUserAcrossHives,
    logoutAll,
    fetchApprovedReviewsAcrossHives,
    fetchPendingReviewsAcrossHives
  };
})();
