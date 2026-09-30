import { createHmac } from 'node:crypto';

/** A commit author as Git records it. Exists only inside the adapter that reads the history. */
export interface AuthorIdentity {
  /** Author name. */
  name: string;
  /** Author e-mail; may be empty. */
  email: string;
}

/**
 * Pseudonymises a commit author: HMAC-SHA256, keyed by `salt`, of the author's e-mail trimmed and
 * lower-cased, or of the name normalised the same way when the e-mail is empty or blank. Returns 64
 * lowercase hexadecimal characters. The same identity and salt always give the same hash; nothing
 * of the identity can be read back from it without the salt.
 */
export function pseudonymiseAuthor(identity: AuthorIdentity, salt: string): string {
  const email = normalise(identity.email);
  const subject = email === '' ? normalise(identity.name) : email;
  return createHmac('sha256', salt).update(subject).digest('hex');
}

function normalise(value: string): string {
  return value.trim().toLowerCase();
}
