// Simple API client using fetch with JWT support

const API_BASE_URL =
  process.env.REACT_APP_API_BASE_URL ||
  (typeof window !== "undefined" && window.location.hostname === "localhost"
    ? "http://localhost:4000"
    : "/api");

export function getApiBaseUrl(): string {
  return API_BASE_URL;
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit & { token?: string } = {}
): Promise<T> {
  const { token, headers, ...rest } = options;
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...(headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Request failed: ${res.status}`);
  }
  // No content
  if (res.status === 204) return undefined as unknown as T;
  return (await res.json()) as T;
}

// High-level API helpers
export const ClassesAPI = {
  listMine: (token: string) =>
    apiRequest<any[]>(`/classes?mine=true`, { token }),
  listPublic: (token: string) => apiRequest<any[]>(`/classes`, { token }),
  create: (
    data: { name: string; description?: string; isPublic?: boolean },
    token: string
  ) =>
    apiRequest<any>(`/classes`, {
      method: "POST",
      token,
      body: JSON.stringify({ isPublic: false, ...data }),
    }),
  update: (
    id: string,
    data: { name?: string; description?: string; isPublic?: boolean },
    token: string
  ) =>
    apiRequest<any>(`/classes/${id}`, {
      method: "PUT",
      token,
      body: JSON.stringify(data),
    }),
  remove: (id: string, token: string) =>
    apiRequest<void>(`/classes/${id}`, { method: "DELETE", token }),
  import: (payload: { classId?: string; quizId?: string }, token: string) =>
    apiRequest<any>(`/classes/import`, {
      method: "POST",
      token,
      body: JSON.stringify(payload),
    }),
};

export const QuizzesAPI = {
  getById: (quizId: string, token: string) =>
    apiRequest<any>(`/quizzes/${quizId}`, { token }),
  byClass: (classId: string, token: string) =>
    apiRequest<any[]>(`/quizzes/by-class/${classId}`, { token }),
  create: (data: any, token: string) =>
    apiRequest<any>(`/quizzes`, {
      method: "POST",
      token,
      body: JSON.stringify({ published: false, ...data }),
    }),
  update: (id: string, data: any, token: string) =>
    apiRequest<any>(`/quizzes/${id}`, {
      method: "PUT",
      token,
      body: JSON.stringify(data),
    }),
  remove: (id: string, token: string) =>
    apiRequest<void>(`/quizzes/${id}`, { method: "DELETE", token }),
};

// Images API
export const ImagesAPI = {
  /**
   * Upload một ảnh lên server
   * @param file File ảnh (từ input[type="file"])
   * @param token JWT token
   * @returns Promise với URL của ảnh đã upload
   */
  upload: async (file: File, token: string): Promise<string> => {
    const formData = new FormData();
    formData.append("image", file);

    const res = await fetch(`${API_BASE_URL}/images/upload`, {
      method: "POST",
      headers: token
        ? ({ Authorization: `Bearer ${token}` } as any)
        : undefined,
      body: formData,
      // Không set Content-Type header - để browser tự set với boundary
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(text || `Upload failed: ${res.status}`);
    }

    const data = await res.json();
    return data.url;
  },

  /**
   * Xóa một ảnh từ server (optional)
   * @param filename Tên file cần xóa
   * @param token JWT token
   */
  delete: async (filename: string, token: string): Promise<void> => {
    await fetch(`${API_BASE_URL}/images/${filename}`, {
      method: "DELETE",
      headers: token
        ? ({ Authorization: `Bearer ${token}` } as any)
        : undefined,
    });
  },
};

export const VisibilityAPI = {
  publicToggle: async (
    payload: {
      targetType: "class" | "quiz";
      targetId: string;
      enabled: boolean;
    },
    token: string
  ) => {
    // Always use consolidated endpoint to enforce cascading rules (Class ⇄ Quizzes)
    return await apiRequest<any>(`/visibility/public`, {
      method: "POST",
      token,
      body: JSON.stringify(payload),
    });
  },
  shareToggle: async (
    payload: {
      targetType: "class" | "quiz";
      targetId: string;
      enabled: boolean;
    },
    token: string
  ) => {
    try {
      return await apiRequest<any>(`/visibility/share`, {
        method: "POST",
        token,
        body: JSON.stringify(payload),
      });
    } catch (_e: any) {
      // Older backend without share endpoints: best-effort no-op so UI can still open Share modal
      return { ok: true, fallback: true } as any;
    }
  },
  getShareStatus: async (
    targetType: "class" | "quiz",
    targetId: string,
    token: string
  ) => {
    try {
      return await apiRequest<{ isShareable: boolean }>(
        `/visibility/share/status?targetType=${targetType}&targetId=${targetId}`,
        { token }
      );
    } catch {
      return { isShareable: false };
    }
  },
  claim: (
    payload: { classId?: string; quizId?: string; code?: string },
    token: string
  ) =>
    apiRequest<any>(`/visibility/claim`, {
      method: "POST",
      token,
      body: JSON.stringify(payload),
    }),
  removeAccess: (
    payload: { classId?: string; quizId?: string },
    token: string
  ) =>
    apiRequest<void>(`/visibility/access`, {
      method: "DELETE",
      token,
      body: JSON.stringify(payload),
    }),
  listSharedClasses: (token: string) =>
    apiRequest<any[]>(`/visibility/shared/classes`, { token }),
  listSharedQuizzes: (token: string) =>
    apiRequest<any[]>(`/visibility/shared/quizzes`, { token }),
};
export const SessionsAPI = {
  start: (quizId: string, token: string) =>
    apiRequest<any>(`/sessions/start`, {
      method: "POST",
      token,
      body: JSON.stringify({ quizId }),
    }),
  submit: (
    payload: {
      quizId: string;
      answers: Record<string, any>;
      timeSpent: number;
      attemptId?: string;
    },
    token: string
  ) =>
    apiRequest<any>(`/sessions/submit`, {
      method: "POST",
      token,
      body: JSON.stringify(payload),
    }),
  endAttempt: (attemptId: string, token: string) =>
    apiRequest<void>(`/sessions/attempt/end`, {
      method: "POST",
      token,
      body: JSON.stringify({ attemptId }),
    }),
  byQuiz: (quizId: string, token: string) =>
    apiRequest<any[]>(`/sessions/by-quiz/${quizId}`, { token }),
  getOne: (id: string, token: string) =>
    apiRequest<any>(`/sessions/${id}`, { token }),
};

export const FilesAPI = {
  listMine: (token: string) => apiRequest<any[]>(`/files`, { token }),
  upload: (
    data: {
      name: string;
      type: "docs" | "json" | "txt";
      size: number;
      content?: string;
    },
    token: string
  ) =>
    apiRequest<any>(`/files`, {
      method: "POST",
      token,
      body: JSON.stringify(data),
    }),
  remove: (id: string, token: string) =>
    apiRequest<void>(`/files/${id}`, { method: "DELETE", token }),
};

// Documents API - New file storage system (stores files on filesystem)
export const DocumentsAPI = {
  /**
   * Upload document to server filesystem
   * @param file File to upload (.doc, .docx, .txt, .json)
   * @param token JWT token
   * @param customName Optional custom name for the file (for renamed files)
   * @returns Uploaded file metadata with filePath
   */
  upload: async (file: File, token: string, customName?: string) => {
    const formData = new FormData();
    formData.append('file', file);
    if (customName) {
      formData.append('customName', customName);
    }
    
    const response = await fetch(`${API_BASE_URL}/documents/upload`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      body: formData,
    });
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Upload failed' }));
      throw new Error(error.message || 'Upload failed');
    }
    
    return response.json();
  },
  
  /**
   * List user's documents
   * @param token JWT token
   * @returns Array of document metadata
   */
  listMine: async (token: string) => {
    const response = await fetch(`${API_BASE_URL}/documents`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
    
    if (!response.ok) throw new Error('Failed to fetch documents');
    return response.json();
  },
  
  /**
   * Get document by ID
   * @param id Document ID
   * @param token JWT token
   * @returns Document metadata with optional content
   */
  getById: async (id: string, token: string) => {
    const response = await fetch(`${API_BASE_URL}/documents/${id}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
    
    if (!response.ok) throw new Error('Failed to fetch document');
    return response.json();
  },
  
  /**
   * Delete document
   * @param id Document ID
   * @param token JWT token
   */
  remove: async (id: string, token: string) => {
    const response = await fetch(`${API_BASE_URL}/documents/${id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
    
    if (!response.ok) throw new Error('Failed to delete document');
  },
};

// Chat API
export const ChatAPI = {
  list: (params: { limit?: number; before?: string; after?: string }, token: string) => {
    const q = new URLSearchParams();
    if (params.limit) q.set("limit", String(params.limit));
    if (params.before) q.set("before", params.before);
    if (params.after) q.set("after", params.after);
    return apiRequest<any[]>(`/chat/messages${q.toString() ? `?${q.toString()}` : ""}`, { token });
  },
  getOnlineCount: (token: string) =>
    apiRequest<{ count: number; windowMinutes: number }>(`/chat/online-count`, { token }),
  send: async (
    { content, file }: { content?: string; file?: File },
    token: string
  ) => {
    const form = new FormData();
    if (content) form.append("content", content);
    if (file) form.append("attachment", file);
    const res = await fetch(`${API_BASE_URL}/chat/messages`, {
      method: "POST",
      headers: token ? ({ Authorization: `Bearer ${token}` } as any) : undefined,
      body: form,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(text || `Request failed: ${res.status}`);
    }
    return await res.json();
  },
  remove: (id: string, token: string) =>
    apiRequest<void>(`/chat/messages/${id}`, { method: "DELETE", token }),
  getUnreadCount: (token: string) =>
    apiRequest<{ count: number }>(`/chat/unread-count`, { token }),
  markAsRead: (token: string) =>
    apiRequest<{ success: boolean }>(`/chat/mark-read`, { method: "POST", token }),
};

export const AuthAPI = {
  login: (email: string, password: string) =>
    apiRequest<{ token: string; user: any }>(`/auth/login`, {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  register: (data: any) =>
    apiRequest<{ token: string; user: any }>(`/auth/signup`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  me: (token: string) =>
    apiRequest<{ user: { id: string; email: string; name: string } }>(
      `/auth/me`,
      { token }
    ),
  // New OTP-based endpoints
  forgotOtp: (email: string) =>
    apiRequest<void>(`/auth/forgot-otp`, {
      method: "POST",
      body: JSON.stringify({ email }),
    }),
  resetWithOtp: (email: string, otp: string, newPassword: string) =>
    apiRequest<void>(`/auth/reset-with-otp`, {
      method: "POST",
      body: JSON.stringify({ email, otp, newPassword }),
    }),
  // Legacy (dev-only) endpoints
  forgot: (email: string) =>
    apiRequest<{ resetToken: string; resetLink: string }>(`/auth/forgot`, {
      method: "POST",
      body: JSON.stringify({ email }),
    }),
  reset: (token: string, newPassword: string) =>
    apiRequest<void>(`/auth/reset`, {
      method: "POST",
      body: JSON.stringify({ token, newPassword }),
    }),
};

export const StatsAPI = {
  getOwnerClasses: (token: string) => 
    apiRequest<any[]>(`/stats/owner/classes`, { token }),
  getClassQuizzes: (classId: string, token: string) =>
    apiRequest<any[]>(`/stats/owner/class/${classId}/quizzes`, { token }),
  getQuizStats: (quizId: string, token: string) =>
    apiRequest<any>(`/stats/owner/quiz/${quizId}/stats`, { token }),
  getProfileStats: (token: string) =>
    apiRequest<any>(`/profile/stats`, { token }),
};

export type {};
