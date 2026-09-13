const ADMIN_USERNAME = "admin";

function constantTimeEqual(left: string, right: string): boolean {
  const maximumLength = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let index = 0; index < maximumLength; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return difference === 0;
}

function decodeBasicCredentials(headerValue: string | null): string | null {
  if (!headerValue?.startsWith("Basic ")) return null;
  try {
    const encoded = headerValue.slice("Basic ".length).trim();
    const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

export function isAdminAnalyticsAuthorized(
  authorizationHeader: string | null,
  configuredSecret: string | undefined,
): boolean {
  const secret = configuredSecret?.trim();
  if (!secret) return false;

  const credentials = decodeBasicCredentials(authorizationHeader);
  if (!credentials) return false;
  const separatorIndex = credentials.indexOf(":");
  if (separatorIndex < 0) return false;

  const username = credentials.slice(0, separatorIndex);
  const password = credentials.slice(separatorIndex + 1);
  return (
    constantTimeEqual(username, ADMIN_USERNAME) &&
    constantTimeEqual(password, secret)
  );
}
