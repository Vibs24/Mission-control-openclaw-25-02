const API = import.meta.env.VITE_API_URL || 'http://localhost:4000';
let token = '';
export const setToken = (t) => (token = t);
export async function api(path, init) {
    const res = await fetch(`${API}/api${path}`, {
        ...init,
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(init?.headers || {})
        }
    });
    if (!res.ok)
        throw new Error(await res.text());
    return res.json();
}
