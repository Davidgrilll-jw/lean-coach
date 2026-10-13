// Thin client for the two Supabase HTTP APIs the app needs: Auth (GoTrue)
// and the table API (PostgREST). Plain fetch, no SDK.

export class CloudError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

const AUTH_MESSAGES = {
  invalid_credentials: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง',
  email_not_confirmed: 'ยังไม่ได้ยืนยันอีเมล — เปิดลิงก์ในอีเมลที่ได้รับก่อน',
  user_already_exists: 'อีเมลนี้มีบัญชีอยู่แล้ว — กด "เข้าสู่ระบบ"',
  weak_password: 'รหัสผ่านสั้นหรือเดาง่ายเกินไป',
  signup_disabled: 'โปรเจกต์นี้ปิดการสมัครบัญชีใหม่แล้ว',
  over_email_send_rate_limit: 'ส่งอีเมลถี่เกินไป รอสักครู่แล้วลองใหม่',
  over_request_rate_limit: 'ลองถี่เกินไป รอสักครู่แล้วลองใหม่',
};

export function createSupabase({ url, key }) {
  const base = url.replace(/\/+$/, '');

  async function call(path, { method = 'GET', token, body, headers = {} } = {}) {
    let res;
    try {
      res = await fetch(base + path, {
        method,
        headers: { apikey: key, Authorization: `Bearer ${token || key}`, ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new CloudError('เชื่อมต่ออินเทอร์เน็ตไม่ได้', 0);
    }
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      /* not JSON */
    }
    if (!res.ok) {
      const code = json?.error_code || json?.code || json?.error;
      throw new CloudError(AUTH_MESSAGES[code] || json?.msg || json?.message || json?.error_description || `เซิร์ฟเวอร์ตอบกลับ ${res.status}`, res.status);
    }
    return json;
  }

  const toSession = (j) => ({
    accessToken: j.access_token,
    refreshToken: j.refresh_token,
    expiresAt: Date.now() + (j.expires_in || 3600) * 1000,
    user: { id: j.user.id, email: j.user.email },
  });

  return {
    /** Returns a session, or null when the project requires e-mail confirmation first. */
    async signUp(email, password) {
      const j = await call('/auth/v1/signup', { method: 'POST', body: { email, password } });
      return j?.access_token ? toSession(j) : null;
    },
    async signIn(email, password) {
      return toSession(await call('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password } }));
    },
    async refresh(refreshToken) {
      return toSession(await call('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: refreshToken } }));
    },
    async signOut(token) {
      await call('/auth/v1/logout', { method: 'POST', token }).catch(() => {});
    },

    /** The remote the sync engine talks to. `getToken` resolves to a fresh access token. */
    remote(getToken) {
      const pageSize = 500;
      return {
        pageSize,
        async pull(cursor, includePhotos) {
          let q = `/rest/v1/records?select=store,id,data,deleted,client_updated_at,updated_at&order=updated_at.asc,store.asc,id.asc&limit=${pageSize}`;
          if (cursor) q += `&updated_at=gte.${encodeURIComponent(cursor)}`;
          if (!includePhotos) q += '&store=neq.photos';
          const rows = await call(q, { token: await getToken() });
          return rows.map((r) => ({ store: r.store, id: r.id, data: r.data, deleted: r.deleted, clientUpdatedAt: new Date(r.client_updated_at).toISOString(), updatedAt: r.updated_at }));
        },
        async push(rows) {
          await call('/rest/v1/records?on_conflict=user_id,store,id', {
            method: 'POST',
            token: await getToken(),
            headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
            body: rows.map((r) => ({ store: r.store, id: r.id, data: r.data, deleted: r.deleted, client_updated_at: r.clientUpdatedAt })),
          });
        },
      };
    },
  };
}
