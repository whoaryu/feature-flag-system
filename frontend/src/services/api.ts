const BASE_URL = 'http://localhost:3001/api/v1';

function getHeaders() {
  const token = localStorage.getItem('ff_admin_token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

async function request(path: string, options: RequestInit = {}) {
  const url = `${BASE_URL}${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      ...getHeaders(),
      ...options.headers
    }
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || `Request failed with status ${response.status}`);
  }

  // Handle DELETE or empty responses
  if (response.status === 204) return null;
  return response.json().catch(() => null);
}

export const api = {
  // Auth
  async login(email: string, password: string) {
    const data = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    if (data.token) {
      localStorage.setItem('ff_admin_token', data.token);
    }
    return data;
  },

  async signup(email: string, password: string, name: string) {
    const data = await request('/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ email, password, name })
    });
    if (data.token) {
      localStorage.setItem('ff_admin_token', data.token);
    }
    return data;
  },

  async getMe() {
    return request('/auth/me');
  },

  logout() {
    localStorage.removeItem('ff_admin_token');
  },

  // Projects
  async listProjects() {
    return request('/projects');
  },

  async createProject(name: string) {
    return request('/projects', {
      method: 'POST',
      body: JSON.stringify({ name })
    });
  },

  // Flags
  async listFlags(projectId: string) {
    return request(`/flags?projectId=${projectId}`);
  },

  async getFlag(id: string) {
    return request(`/flags/${id}`);
  },

  async createFlag(
    projectId: string,
    key: string,
    name: string,
    type: string,
    variants: Array<{ name: string; value: any }>
  ) {
    return request('/flags', {
      method: 'POST',
      body: JSON.stringify({ projectId, key, name, type, variants })
    });
  },

  async updateFlag(id: string, flagData: any) {
    return request(`/flags/${id}`, {
      method: 'PUT',
      body: JSON.stringify(flagData)
    });
  },

  async deleteFlag(id: string) {
    return request(`/flags/${id}`, {
      method: 'DELETE'
    });
  },

  // Audit Logs
  async getAuditLogs(projectId: string) {
    return request(`/audit-logs?projectId=${projectId}`);
  },

  // Evaluation Stats
  async getFlagStats(id: string, projectId: string) {
    return request(`/flags/${id}/stats?projectId=${projectId}`);
  }
};
