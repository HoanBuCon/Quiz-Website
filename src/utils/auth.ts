// Cookie-based authentication - tokens are stored in httpOnly cookies
// We can no longer read the token directly from JavaScript (security feature)

const API_URL = process.env.REACT_APP_API_BASE_URL || 
  (typeof window !== 'undefined' && window.location.hostname === 'localhost'
    ? 'http://localhost:4000'
    : '/api');

/**
 * Check if user is authenticated by verifying the auth cookie
 * This makes a lightweight API call since we can't read httpOnly cookies from JS
 */
export async function checkAuth(): Promise<boolean> {
  try {
    const response = await fetch(`${API_URL}/auth/me`, {
      credentials: 'include', // Important: send cookies
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Legacy function for backward compatibility
 * Returns a dummy value so old code doesn't break
 * Actual authentication uses httpOnly cookie
 */
export function getToken(): string | null {
  // Return dummy value for backward compatibility
  // Backend middleware prioritizes cookie over Authorization header
  // So this value is ignored when cookie exists
  return '_cookie_auth_';
}

/**
 * @deprecated No longer needed with cookie-based auth
 * Server handles cookie setting automatically
 */
export function setToken(_token: string) {
  // No-op: Cookie is set by server via Set-Cookie header
  // Keeping function for backward compatibility during migration
}

/**
 * @deprecated No longer needed with cookie-based auth  
 * Server handles cookie clearing on logout
 */
export function clearToken() {
  // No-op: Cookie is cleared by server on /auth/logout
  // Keeping function for backward compatibility during migration
}
