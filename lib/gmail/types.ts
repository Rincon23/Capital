/** A word or phrase the user wants to be told about when it shows up in an e-mail. */
export interface GmailKeyword {
  id: string;
  keyword: string;
  createdAt: string;
}

/** What the monitor reads of an e-mail: the same three fields the bot checked. */
export interface GmailMessageSummary {
  id: string;
  subject: string;
  from: string;
  /** Gmail's preview of the body (HTML entities already decoded). */
  snippet: string;
  /** ISO timestamp of when Gmail received it. */
  receivedAt: string;
  labelIds: string[];
}

/** An e-mail that matched, as kept in the history (one per e-mail, whatever the keywords). */
export interface GmailAlert {
  messageId: string;
  keywords: string[];
  subject: string;
  from: string;
  receivedAt: string;
  notifiedAt: string | null;
  /** Opens this e-mail in Gmail, in the connected account. */
  url: string;
}

/**
 * The connected account. `reconnect` means Google no longer accepts the permission (it was
 * revoked, or the Cloud app is still in "Testing" and the token expired after 7 days).
 */
export interface GmailAccountStatus {
  email: string;
  connectedAt: string;
  lastCheckedAt: string | null;
  status: 'ok' | 'error' | 'reconnect';
  lastError: string | null;
}

export interface GmailOverview {
  /** Whether this server has the Google client and the encryption key set up. */
  configured: boolean;
  /** The address to register in Google Cloud as a redirect URI; only for the server's admin. */
  redirectUri: string | null;
  account: GmailAccountStatus | null;
  keywords: GmailKeyword[];
  alerts: GmailAlert[];
}
