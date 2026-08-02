import type { RateLimitConfig } from "./types";

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

// Staff login — per IP, credential-stuffing/brute-force protection.
export const LOGIN_LIMIT: RateLimitConfig = { scope: "login", limit: 5, windowMs: 15 * MINUTE_MS };

// Portal login — same reasoning, isolated bucket from staff login.
export const PORTAL_LOGIN_LIMIT: RateLimitConfig = {
  scope: "portal-login",
  limit: 5,
  windowMs: 15 * MINUTE_MS,
};

// Staff signup — per IP, mass account creation protection.
export const SIGNUP_LIMIT: RateLimitConfig = { scope: "signup", limit: 5, windowMs: HOUR_MS };

// Portal signup — same reasoning, isolated bucket from staff signup.
export const PORTAL_SIGNUP_LIMIT: RateLimitConfig = {
  scope: "portal-signup",
  limit: 5,
  windowMs: HOUR_MS,
};

// Invite a team member — per inviting staff user, spam-invite protection.
export const INVITE_MEMBER_LIMIT: RateLimitConfig = {
  scope: "invite-member",
  limit: 10,
  windowMs: HOUR_MS,
};

// Invite a Client Portal user — per inviting staff user.
export const INVITE_PORTAL_USER_LIMIT: RateLimitConfig = {
  scope: "invite-portal-user",
  limit: 10,
  windowMs: HOUR_MS,
};

// Resend a team invitation — per invitation id, not per actor: caps how many
// times any one invitation's email can be re-sent to its recipient.
export const RESEND_MEMBER_INVITE_LIMIT: RateLimitConfig = {
  scope: "resend-member-invite",
  limit: 5,
  windowMs: HOUR_MS,
};

// Resend a Client Portal invitation — same reasoning, isolated bucket.
export const RESEND_PORTAL_INVITE_LIMIT: RateLimitConfig = {
  scope: "resend-portal-invite",
  limit: 5,
  windowMs: HOUR_MS,
};

// Accept a team invitation — per IP (the accepting identity isn't
// established as a member until this succeeds).
export const ACCEPT_MEMBER_INVITE_LIMIT: RateLimitConfig = {
  scope: "accept-member-invite",
  limit: 20,
  windowMs: HOUR_MS,
};

// Accept a Client Portal invitation — same reasoning, isolated bucket.
export const ACCEPT_PORTAL_INVITE_LIMIT: RateLimitConfig = {
  scope: "accept-portal-invite",
  limit: 20,
  windowMs: HOUR_MS,
};

// Attachment upload — per authenticated staff user, shared across
// Client/Project/Invoice attachments (all three call the same
// uploadAttachmentForEntity()).
export const ATTACHMENT_UPLOAD_LIMIT: RateLimitConfig = {
  scope: "attachment-upload",
  limit: 30,
  windowMs: HOUR_MS,
};

// Attachment download (staff) — lightweight abuse protection, not a hard
// day-to-day limit; per authenticated staff user.
export const ATTACHMENT_DOWNLOAD_LIMIT: RateLimitConfig = {
  scope: "attachment-download",
  limit: 120,
  windowMs: HOUR_MS,
};

// Attachment download (portal) — same reasoning, isolated bucket; per
// authenticated portal user.
export const PORTAL_ATTACHMENT_DOWNLOAD_LIMIT: RateLimitConfig = {
  scope: "portal-attachment-download",
  limit: 120,
  windowMs: HOUR_MS,
};
