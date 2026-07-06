// utils/sessionManager.js
import { randomUUID } from "crypto";
import UserSession from "../models/UserSession.js";
import CompMast from "../models/CompMast.js";
import connection from "../config/redis.js"; // ioredis client, created in the previous item-sync task

const SESSION_PREFIX = "session:"; // session:<jti> -> "1" (existence = active), TTL matches JWT expiry
const DEFAULT_SESSION_LIMIT = 1;

function redisKey(jti) {
  return `${SESSION_PREFIX}${jti}`;
}

/**
 * Reads the configured session_limit for a comp_code from CompMast.
 * Falls back to DEFAULT_SESSION_LIMIT if the company record or field is missing,
 * so this never silently allows unlimited sessions due to bad data.
 */
export async function getSessionLimit(comp_code) {
  const comp = await CompMast.findOne({ comp_code: String(comp_code) })
    .select("session_limit")
    .lean();

  if (!comp || comp.session_limit === undefined || comp.session_limit === null) {
    return DEFAULT_SESSION_LIMIT;
  }

  const limit = Number(comp.session_limit);
  return Number.isFinite(limit) && limit > 0 ? limit : DEFAULT_SESSION_LIMIT;
}

/**
 * Returns all currently active (non-revoked, non-expired) sessions for a user.
 * Mongo is the source of truth here since we need the full list, not just a count.
 */
export async function getActiveSessions(comp_code, user_id) {
  return UserSession.find({
    comp_code: String(comp_code),
    user_id: String(user_id),
    revoked: false,
    expires_at: { $gt: new Date() },
  })
    .sort({ last_active: -1 })
    .lean();
}

/**
 * Attempts to create a new session for a user, enforcing comp_code's session_limit.
 * Returns { allowed: true, session, jti } or { allowed: false, limit, active_sessions }.
 */
export async function tryCreateSession({
  comp_code,
  user_id,
  expiresInSeconds,
  device_label,
  user_agent,
  ip_address,
}) {
  const limit = await getSessionLimit(comp_code);
  const activeSessions = await getActiveSessions(comp_code, user_id);

  if (activeSessions.length >= limit) {
    return {
      allowed: false,
      limit,
      active_sessions: activeSessions.map(formatSessionPublic),
    };
  }

  const jti = randomUUID();
  const now = new Date();
  const expires_at = new Date(now.getTime() + expiresInSeconds * 1000);

  const session = await UserSession.create({
    comp_code: String(comp_code),
    user_id: String(user_id),
    jti,
    device_label: device_label || "",
    user_agent: user_agent || "",
    ip_address: ip_address || "",
    issued_at: now,
    expires_at,
    last_active: now,
  });

  // Best-effort Redis cache; Mongo remains authoritative if this fails.
  try {
    await connection.set(redisKey(jti), "1", "EX", expiresInSeconds);
  } catch (err) {
    console.warn("Redis session cache set failed (non-fatal):", err.message);
  }

  return { allowed: true, session, jti };
}

/**
 * Verifies a session (by jti) is still active. Checks Redis first for speed,
 * falls back to Mongo (and repopulates Redis) if the cache misses or errors.
 */
export async function isSessionActive(jti) {
  try {
    const cached = await connection.get(redisKey(jti));
    if (cached === "1") return true;
    if (cached === null) {
      // Could be a genuine miss (expired/revoked) or Redis was cold/evicted.
      // Confirm against Mongo before deciding.
    }
  } catch (err) {
    console.warn("Redis session cache get failed, falling back to Mongo:", err.message);
  }

  const session = await UserSession.findOne({
    jti,
    revoked: false,
    expires_at: { $gt: new Date() },
  }).lean();

  if (!session) return false;

  // Repopulate cache opportunistically.
  try {
    const ttlSeconds = Math.max(
      1,
      Math.floor((new Date(session.expires_at).getTime() - Date.now()) / 1000)
    );
    await connection.set(redisKey(jti), "1", "EX", ttlSeconds);
  } catch (err) {
    // non-fatal
  }

  return true;
}

/**
 * Updates last_active timestamp for a session. Called from auth middleware
 * on each authenticated request (fire-and-forget, doesn't block the request).
 */
export function touchSession(jti) {
  UserSession.updateOne({ jti }, { $set: { last_active: new Date() } }).catch((err) => {
    console.warn("touchSession update failed (non-fatal):", err.message);
  });
}

/**
 * Revokes a session by jti. `revoked_by` should be "self", "admin", or "system".
 */
export async function revokeSession(jti, revoked_by = "self") {
  const result = await UserSession.updateOne(
    { jti, revoked: false },
    { $set: { revoked: true, revoked_at: new Date(), revoked_by } }
  );

  try {
    await connection.del(redisKey(jti));
  } catch (err) {
    console.warn("Redis session cache del failed (non-fatal):", err.message);
  }

  return result.modifiedCount > 0;
}

/**
 * Revokes a session by its Mongo _id, scoped to a comp_code (and optionally
 * a user_id) so a user can't revoke someone else's session by guessing an id.
 */
export async function revokeSessionById(session_id, { comp_code, user_id } = {}, revoked_by = "self") {
  const filter = { _id: session_id, revoked: false };
  if (comp_code) filter.comp_code = String(comp_code);
  if (user_id) filter.user_id = String(user_id);

  const session = await UserSession.findOne(filter);
  if (!session) return false;

  return revokeSession(session.jti, revoked_by);
}

export function formatSessionPublic(session) {
  return {
    session_id: session._id,
    device_label: session.device_label || "Unknown device",
    user_agent: session.user_agent || "",
    ip_address: session.ip_address || "",
    issued_at: session.issued_at,
    last_active: session.last_active,
    expires_at: session.expires_at,
  };
}