// NUONUO Vercel serverless endpoint for Owner-only Staff creation.
// The Supabase service_role key must exist only in Vercel Environment Variables.
// Never expose it in config.js or browser code.

function json(res, status, body) {
  res.status(status).setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

function cleanText(value, max = 200) {
  return String(value ?? "").trim().slice(0, max);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return json(res, 405, { error: "Method not allowed." });
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NUONUO_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SECRET_KEY || process.env.NUONUO_SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NUONUO_SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NUONUO_SUPABASE_ANON_KEY || process.env.NUONUO_SUPABASE_ANON_KEY;

  // Supabase now has two kinds of server keys:
  //   - legacy service_role JWTs (eyJ...)
  //   - new secret keys (sb_secret_...)
  // New secret keys are NOT JWTs and must not be sent as a Bearer token.
  // Keeping the admin request on the apikey header works for both key types
  // and, importantly, does not accidentally attach the Owner's user JWT.
  const adminHeaders = (extra = {}) => {
    const headers = { ...extra, apikey: serviceRoleKey };
    if (String(serviceRoleKey || '').startsWith('eyJ')) {
      headers.Authorization = `Bearer ${serviceRoleKey}`;
    }
    return headers;
  };

  if (!supabaseUrl || !serviceRoleKey) {
    return json(res, 500, {
      error: "Server is not configured. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY) to the SAME Vercel project that serves this site, then redeploy."
    });
  }

  const authHeader = String(req.headers.authorization || "");
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return json(res, 401, { error: "Owner authentication is required." });
  }

  const accessToken = authHeader.slice(7).trim();
  if (!accessToken) {
    return json(res, 401, { error: "Owner authentication is required." });
  }

  try {
    // Verify the caller's Supabase session using the normal Auth user endpoint.
    const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        // The user endpoint should see the caller's JWT as the Authorization
        // credential. Use the public/anon key as the apikey when available.
        // The secret/service key remains reserved for admin operations below.
        apikey: anonKey || serviceRoleKey,
        Authorization: `Bearer ${accessToken}`
      }
    });
    const caller = await userResponse.json().catch(() => null);

    if (!userResponse.ok || !caller?.id) {
      return json(res, 401, { error: "Your login session is invalid or expired. Please sign in again." });
    }

    // Check Owner status through the existing SECURITY DEFINER RPC first.
    // This is important for Nuonuo databases where RLS blocks direct reads
    // from public.profiles even though the owner-check function is allowed.
    // The RPC uses auth.uid() from the caller's access token, so the browser
    // cannot simply claim to be an Owner.
    const rpcHeaders = {
      "Content-Type": "application/json",
      // Use the public/anon key for the RPC request so PostgREST evaluates
      // the caller as the logged-in authenticated user. The SECURITY DEFINER
      // function itself is what safely reads profiles.
      apikey: anonKey || serviceRoleKey,
      Authorization: `Bearer ${accessToken}`
    };

    let ownerCheck = null;
    let rpcError = null;
    let callerBusinessOwnerId = caller.id;
    try {
      const rpcResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/nuonuo_is_owner`, {
        method: "POST",
        headers: rpcHeaders,
        body: "{}"
      });
      const rpcBody = await rpcResponse.json().catch(() => null);
      if (rpcResponse.ok) {
        ownerCheck = rpcBody === true || (Array.isArray(rpcBody) && rpcBody[0] === true);
      } else {
        rpcError = String(rpcBody?.message || rpcBody?.hint || rpcBody?.details || `Owner RPC failed (${rpcResponse.status}).`);
      }
    } catch (e) {
      rpcError = e?.message || "Owner RPC request failed.";
    }

    // Fallback for installations that have not yet run the direct-create SQL.
    // Use the service role for this lookup, but only after the SECURITY
    // DEFINER function is unavailable.
    if (ownerCheck === null) {
      const profileHeaders = adminHeaders();

      async function findProfileById() {
        const url =
          `${supabaseUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(caller.id)}` +
          `&select=id,email,role&limit=1`;
        const response = await fetch(url, { headers: profileHeaders });
        const body = await response.json().catch(() => null);
        if (!response.ok) {
          const detail = body?.message || body?.hint || body?.details || `Profile lookup failed (${response.status}).`;
          throw new Error(`${detail} [HTTP ${response.status}]`);
        }
        return Array.isArray(body) ? body[0] || null : null;
      }

      async function findProfileByEmail() {
        const email = String(caller.email || "").trim().toLowerCase();
        if (!email) return null;
        const url =
          `${supabaseUrl}/rest/v1/profiles?email=eq.${encodeURIComponent(email)}` +
          `&select=id,email,role&limit=2`;
        const response = await fetch(url, { headers: profileHeaders });
        const body = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(body?.message || body?.hint || body?.details || `Profile email lookup failed (${response.status}).`);
        }
        return Array.isArray(body) && body.length === 1 ? body[0] : null;
      }

      try {
        const callerProfile = await findProfileById() || await findProfileByEmail();
        ownerCheck = String(callerProfile?.role || "").toLowerCase() === "owner";
        callerBusinessOwnerId = callerProfile?.owner_id || caller.id;
      } catch (profileError) {
        console.error("NUONUO owner profile lookup failed:", profileError);
        return json(res, 500, {
          error: `Owner verification could not access profiles. The Vercel SUPABASE_SERVICE_ROLE_KEY must be the current Supabase service_role/secret server key, not the anon/publishable key. Details: ${profileError.message}`
        });
      }
    }

    if (!ownerCheck) {
      return json(res, 403, { error: "Only the Owner can create staff accounts." });
    }

    // Resolve the shared business owner id. Existing Owner accounts may have
    // been created before multi-owner sharing was introduced, so fall back to
    // the caller itself when owner_id is not present yet. The SQL migration
    // also normalizes all Owners to the same canonical owner_id.
    try {
      const callerProfileResponse = await fetch(
        `${supabaseUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(caller.id)}&select=id,owner_id&limit=1`,
        { headers: adminHeaders() }
      );
      const callerProfiles = await callerProfileResponse.json().catch(() => null);
      if (callerProfileResponse.ok && Array.isArray(callerProfiles) && callerProfiles[0]?.owner_id) {
        callerBusinessOwnerId = callerProfiles[0].owner_id;
      }
    } catch (_) {}

    let body = req.body;
    if (typeof body === "string") {
      try { body = JSON.parse(body); } catch (_) { body = {}; }
    }
    body = body || {};

    const name = cleanText(body.name, 120);
    const email = cleanText(body.email, 254).toLowerCase();
    const password = String(body.password || "");
    const role = String(body.role || "staff").toLowerCase();

    if (!name || !email || !password) {
      return json(res, 400, { error: "Name, email and password are required." });
    }
    if (password.length < 6) {
      return json(res, 400, { error: "Password must be at least 6 characters." });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json(res, 400, { error: "Please enter a valid email address." });
    }
    if (!["staff", "owner"].includes(role)) {
      return json(res, 400, { error: "Invalid staff role." });
    }

    // Create the Auth account as already confirmed. No confirmation email is
    // sent, so staff can log in immediately with the password set by Owner.
    // If the Auth user already exists, reuse it instead of failing. This makes
    // the endpoint safe to retry after a partial/previously completed create.
    let user = null;
    let createdAuthUser = false;

    const createResponse = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
      method: "POST",
      headers: adminHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: name }
      })
    });

    const created = await createResponse.json().catch(() => null);

    if (createResponse.ok && created?.id) {
      user = created;
      createdAuthUser = true;
    } else {
      const raw = String(created?.msg || created?.message || created?.error || "");
      const lower = raw.toLowerCase();

      if (createResponse.status === 422 || lower.includes("already") || lower.includes("registered") || lower.includes("exists")) {
        // The Auth account may already exist from an earlier attempt. Admin
        // listUsers is used only server-side with the secret/service key.
        const usersResponse = await fetch(`${supabaseUrl}/auth/v1/admin/users?per_page=1000&page=1`, {
          headers: adminHeaders()
        });
        const usersBody = await usersResponse.json().catch(() => null);
        if (!usersResponse.ok) {
          return json(res, 500, {
            error: usersBody?.message || usersBody?.msg || "This email is already registered, but the existing Auth user could not be found."
          });
        }

        const users = Array.isArray(usersBody?.users) ? usersBody.users : [];
        const wantedEmail = email.toLowerCase();
        user = users.find((u) => String(u?.email || "").toLowerCase() === wantedEmail) || null;

        if (!user?.id) {
          return json(res, 409, { error: "This email is already registered, but the existing Auth user could not be located." });
        }
      } else {
        return json(res, 400, { error: raw || "Supabase could not create the staff account." });
      }
    }

    // Upsert the matching application profile instead of blindly inserting.
    // This handles both a completely new staff account and a profile left
    // behind by an earlier/partial attempt, avoiding profiles_pkey errors.
    const profileUpsert = await fetch(`${supabaseUrl}/rest/v1/profiles`, {
      method: "POST",
      headers: adminHeaders({
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal"
      }),
      body: JSON.stringify({
        id: user.id,
        email,
        full_name: name,
        role,
        // Every Owner and Staff login belongs to the same business.
        // Keep the Auth/profile id unique, but always point owner_id at the
        // canonical business owner so all business data is shared.
        owner_id: callerBusinessOwnerId
      })
    });

    if (!profileUpsert.ok) {
      // Only roll back an Auth user that THIS request created. Never delete an
      // existing account just because its profile update failed.
      if (createdAuthUser) {
        await fetch(`${supabaseUrl}/auth/v1/admin/users/${user.id}`, {
          method: "DELETE",
          headers: adminHeaders()
        }).catch(() => {});
      }
      const failedProfile = await profileUpsert.json().catch(() => null);
      return json(res, 500, {
        error: failedProfile?.message || failedProfile?.msg ||
          (createdAuthUser
            ? "Staff account was created but the staff profile could not be saved. The Auth account was rolled back."
            : "The Auth account exists, but the staff profile could not be saved.")
      });
    }

    return json(res, 200, {
      ok: true,
      reusedExistingAuthUser: !createdAuthUser,
      user: { id: user.id, email, full_name: name, role }
    });
  } catch (error) {
    console.error("NUONUO create-staff error:", error);
    return json(res, 500, { error: error?.message || "Unable to create staff." });
  }
}
