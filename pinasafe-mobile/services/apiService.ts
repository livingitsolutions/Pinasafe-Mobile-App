import AsyncStorage from '@react-native-async-storage/async-storage';
import { isClientRuntime } from '@/utils/clientRuntime';
import { Platform } from 'react-native';

interface APIResponse<T = any> {
  data?: T;
  error?: string;
  message?: string;
}

// Thrown by request() for any non-2xx or network-level failure.
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export const isApiError = (error: unknown): error is ApiError => error instanceof ApiError;

type SessionExpiredListener = () => void;

// Endpoints that are reachable without a valid session; a 401 here is a
// credential/validation failure, not an expired session, even if a stale
// token happens to be attached to the request.
const PUBLIC_ENDPOINTS = new Set([
  '/auth/login',
  '/auth/register',
  '/auth/personnel-invitations/accept',
]);

interface LoginResponse {
  user: {
    id: string;
    email: string;
    name: string;
    role: 'citizen' | 'responder' | 'admin' | 'super_admin';
    phone?: string;
    address?: string;
    verified: boolean;
  };
  token: string;
  mustChangePassword?: boolean;
}

export interface EmergencyReportData {
  type: 'road' | 'fire';
  description: string;
  location: string;
  coordinates?: { latitude: number; longitude: number };
  contactNumber?: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  evidence?: {
    photos: string[];
    video?: string;
  };
  aiClassification?: any;
  useAIClassification?: boolean;
  uploadSessionId?: string;
}

export interface EvidenceClassification {
  accepted: boolean;
  label: 'fire' | 'road' | 'other';
  confidence: number | null;
  status: 'valid' | 'invalid';
  action: 'accept' | 'reject' | 'uncertain';
  reason: string | null;
  caption: string | null;
}

export interface EvidenceUploadSession {
  id: string;
  status: 'active' | 'bound';
  expiresAt: string;
}

export type EvidenceUploadResult =
  | EvidenceClassification
  | { accepted: true; evidenceId: string; classification: EvidenceClassification };

class APIService {
  private token: string | null = null;
  private sessionExpiredListener: SessionExpiredListener | null = null;

  private getBaseURL(): string {
    const configuredURL = process.env.EXPO_PUBLIC_API_URL?.trim();

    if (!configuredURL) {
      throw new Error(
        'PinaSafe API is not configured. Set EXPO_PUBLIC_API_URL.'
      );
    }

    return configuredURL.replace(/\/$/, '');
  }

  // private async initializeToken() {
  //   try {
  //     const token = await AsyncStorage.getItem('auth_token');
  //     if (token) {
  //       this.token = token;
  //     }
  //   } catch (error) {
  //     console.error('Error loading token:', error);
  //   }
  // }

  // Registers a single callback invoked when an authenticated request is
  // rejected as expired (401). Avoids a circular import with AuthContext.
  onSessionExpired(listener: SessionExpiredListener | null) {
    this.sessionExpiredListener = listener;
  }

  private async handleSessionExpired() {
    await this.clearLocalSession();
    this.sessionExpiredListener?.();
  }

  private async request<T = any>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<APIResponse<T>> {
    if (!this.token && isClientRuntime()) {
      const storedToken = await AsyncStorage.getItem('auth_token');
      if (storedToken) this.token = storedToken;
    }
    const hadToken = Boolean(this.token);
    const url = `${this.getBaseURL()}/api${endpoint}`;

    const config: RequestInit = {
      headers: {
        'Content-Type': 'application/json',
        ...(this.token && { Authorization: `Bearer ${this.token}` }),
        ...options.headers,
      },
      ...options,
    };

    console.log(`🌐 API Request: ${options.method || 'GET'} ${url}`);

    let response: Response;
    try {
      response = await fetch(url, config);
    } catch (error) {
      console.error('❌ Network Error:', error);
      throw new ApiError(0, 'Network error. Please check your connection.');
    }

    const responseText = await response.text();
    let data: any;
    try {
      data = responseText ? JSON.parse(responseText) : undefined;
    } catch {
      data = undefined;
    }

    if (!response.ok) {
      console.error(`❌ API Error: ${response.status}`);

      if (response.status === 401 && hadToken && !PUBLIC_ENDPOINTS.has(endpoint)) {
        await this.handleSessionExpired();
      }

      const safeMessage =
        (typeof data?.error === 'string' && data.error) ||
        (typeof data?.message === 'string' && data.message) ||
        `Request failed with status ${response.status}`;
      throw new ApiError(response.status, safeMessage);
    }

    console.log(`✅ API Success: ${options.method || 'GET'} ${endpoint}`);
    return { data };
  }

  async get<T = any>(endpoint: string): Promise<APIResponse<T>> {
    return this.request<T>(endpoint, { method: 'GET' });
  }

  async post<T = any>(endpoint: string, data?: any): Promise<APIResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async put<T = any>(endpoint: string, data?: any): Promise<APIResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async delete<T = any>(endpoint: string): Promise<APIResponse<T>> {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }

  // Authentication methods
  async login(email: string, password: string): Promise<APIResponse<LoginResponse>> {
    const response = await this.request<LoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });

    if (response.data) {
      this.token = response.data.token;
      await AsyncStorage.setItem('auth_token', response.data.token);
    }

    return response;
  }

  async register(userData: {
    email: string;
    password: string;
    name: string;
    phone?: string;
    address?: string;
  }): Promise<APIResponse<LoginResponse>> {
    const response = await this.request<LoginResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(userData),
    });

    if (response.data) {
      this.token = response.data.token;
      await AsyncStorage.setItem('auth_token', response.data.token);
    }

    return response;
  }

  async logout(): Promise<void> {
    const response = await this.request('/auth/logout', { method: 'POST' });
    if (response.error) {
      throw new Error(response.error);
    }
    this.token = null;
    await AsyncStorage.removeItem('auth_token');
  }

  async clearLocalSession(): Promise<void> {
    this.token = null;
    await AsyncStorage.removeItem('auth_token');
  }

  async refreshToken(): Promise<APIResponse<{ token: string }>> {
    const response = await this.request<{ token: string }>('/auth/refresh', {
      method: 'POST',
    });

    if (response.data) {
      this.token = response.data.token;
      await AsyncStorage.setItem('auth_token', response.data.token);
    }

    return response;
  }

  // User profile methods
  async getProfile(): Promise<APIResponse<any>> {
    return this.request('/users/profile');
  }

  async updateProfile(updates: any): Promise<APIResponse<any>> {
    return this.request('/users/profile', {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  // Emergency report methods
  async createEmergencyReport(reportData: EmergencyReportData): Promise<APIResponse<any>> {
    return this.request('/emergency-reports', {
      method: 'POST',
      body: JSON.stringify(reportData),
    });
  }

  async createEvidenceSession(): Promise<APIResponse<{ data: EvidenceUploadSession }>> {
    return this.request('/evidence/sessions', { method: 'POST', body: JSON.stringify({}) });
  }

  async uploadEvidenceImage(
    sessionId: string,
    image: { uri: string; name?: string; type?: string }
  ): Promise<APIResponse<{ data: EvidenceUploadResult }>> {
    const formData = new FormData();
    const name = image.name || 'evidence.jpg';
    const type = image.type || 'image/jpeg';

    if (Platform.OS === 'web') {
      if (!isClientRuntime()) {
        throw new Error('Evidence upload is unavailable outside the browser.');
      }

      const imageResponse = await fetch(image.uri);
      if (!imageResponse.ok) {
        throw new Error('Unable to prepare evidence image for upload.');
      }

      const sourceBlob = await imageResponse.blob();
      const uploadBlob =
        sourceBlob.type === type
          ? sourceBlob
          : new Blob([sourceBlob], { type });

      formData.append('image', uploadBlob, name);
    } else {
      formData.append('image', {
        uri: image.uri,
        name,
        type,
      } as unknown as Blob);
    }

    return this.request(`/evidence/sessions/${sessionId}/image`, {
      method: 'POST',
      headers: {},
      body: formData,
    });
  }

  async getEmergencyReports(filters: any = {}): Promise<APIResponse<any[]>> {
    const params = new URLSearchParams(filters);
    return this.request(`/emergency-reports?${params}`);
  }

  async updateEmergencyReportStatus(
    reportId: string,
    status: string,
    notes?: string
  ): Promise<APIResponse<any>> {
    return this.request(`/emergency-reports/${reportId}`, {
      method: 'PUT',
      body: JSON.stringify({ status, notes }),
    });
  }

  async updateResponderLifecycleStatus(
    reportId: string,
    status: 'responding' | 'resolved'
  ): Promise<APIResponse<any>> {
    return this.request(`/emergency-reports/${reportId}`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
    });
  }

  async assignTeamToReport(reportId: string, teamId: string): Promise<APIResponse<{
    message: string;
    data: {
      id: string;
      status: 'dispatched';
      assigned_team_id: string;
      assigned_team?: { id: string; name: string };
      [key: string]: unknown;
    };
  }>> {
    return this.request(`/emergency-reports/${reportId}/assign-team`, {
      method: 'POST',
      body: JSON.stringify({ teamId }),
    });
  }

  // Emergency call methods
  async logEmergencyCall(callData: {
    serviceName: string;
    serviceNumber: string;
    callDate: string;
    callTime: string;
    duration?: string;
    status: 'completed' | 'missed' | 'busy';
    location?: string;
    outcome?: string;
  }): Promise<APIResponse<any>> {
    return this.request('/emergency-calls', {
      method: 'POST',
      body: JSON.stringify(callData),
    });
  }

  async getEmergencyCallsByUser(): Promise<APIResponse<any[]>> {
    return this.request('/emergency-calls/user');
  }

  // System alerts methods
  async getActiveAlerts(): Promise<APIResponse<any[]>> {
    return this.request('/alerts');
  }

  async createAlert(alertData: {
    type: 'weather' | 'emergency' | 'community' | 'system';
    title: string;
    description: string;
    priority: 'low' | 'medium' | 'high' | 'critical';
    location: string;
    affectedAreas?: string[];
    expiresAt?: string;
  }): Promise<APIResponse<any>> {
    return this.request('/alerts', {
      method: 'POST',
      body: JSON.stringify(alertData),
    });
  }

  async dismissAlert(alertId: string): Promise<APIResponse<any>> {
    return this.request(`/alerts/${alertId}/dismiss`, {
      method: 'PUT',
    });
  }

  // Organization methods
  async getOrganizations(): Promise<APIResponse<any[]>> {
    return this.request('/organizations');
  }

  async getPersonnelByOrganization(organizationId: string): Promise<APIResponse<any[]>> {
    return this.request('/personnel');
  }

  async createPersonnel(organizationId: string, personnel: {
    name: string;
    position?: string;
    contact_number?: string;
    email?: string;
    is_active?: boolean;
    team?: string;
  }): Promise<APIResponse<any>> {
    return this.request('/personnel', {
      method: 'POST',
      body: JSON.stringify({
        name: personnel.name,
        position: personnel.position || '',
        contactNumber: personnel.contact_number || '',
        email: personnel.email || '',
        personnelRole: 'staff'
      }),
    });
  }


  async updatePersonnel(personnelId: string, updates: Record<string, any>): Promise<APIResponse<any>> {
    return this.request(`/personnel/${personnelId}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  // Statistics methods
  async getEmergencyStats(): Promise<APIResponse<{
    totalReports: number;
    activeIncidents: number;
    resolvedToday: number;
    averageResponseTime: string;
  }>> {
    return this.request('/stats/emergency');
  }

  // Cluster methods
  async getMyClusters(): Promise<APIResponse<any[]>> {
    return this.request('/clusters/my-clusters');
  }

  async getClusterInfo(clusterId: string): Promise<APIResponse<any>> {
    return this.request(`/clusters/${clusterId}/info`);
  }

  async getClusterUpdates(clusterId: string): Promise<APIResponse<any[]>> {
    return this.request(`/clusters/${clusterId}/updates`);
  }

  async createClusterUpdate(
    clusterId: string,
    message: string,
    status: string
  ): Promise<APIResponse<any>> {
    return this.request(`/clusters/${clusterId}/updates`, {
      method: 'POST',
      body: JSON.stringify({ message, status }),
    });
  }

  async getClusterStatistics(): Promise<APIResponse<any>> {
    return this.request('/clusters/statistics');
  }

  // Users (admin)
  async getUsers(filters: { page?: number; limit?: number; role?: string; verified?: boolean } = {}): Promise<APIResponse<any[]>> {
    const params = new URLSearchParams();
    if (filters.page) params.append('page', String(filters.page));
    if (filters.limit) params.append('limit', String(filters.limit));
    if (filters.role) params.append('role', filters.role);
    if (typeof filters.verified === 'boolean') params.append('verified', String(filters.verified));

    const query = params.toString() ? `?${params.toString()}` : '';
    return this.request(`/users${query}`);
  }

  // Location Tracking methods
  async startLocationTracking(
    emergencyId: string,
    latitude: number,
    longitude: number,
    accuracy?: number
  ): Promise<APIResponse<any>> {
    return this.request(`/location-tracking/start/${emergencyId}`, {
      method: 'POST',
      body: JSON.stringify({ latitude, longitude, accuracy }),
    });
  }

  async updateLocation(
    emergencyId: string,
    data: {
      latitude: number;
      longitude: number;
      speed: number;
      heading?: number;
      accuracy?: number;
      eta_minutes?: number;
    }
  ): Promise<APIResponse<any>> {
    return this.request(`/location-tracking/update/${emergencyId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async stopLocationTracking(emergencyId: string): Promise<APIResponse<any>> {
    return this.request(`/location-tracking/stop/${emergencyId}`, {
      method: 'POST',
    });
  }

  async getEmergencyLocations(emergencyId: string): Promise<APIResponse<any[]>> {
    return this.request(`/location-tracking/emergency/${emergencyId}`);
  }

  async getTeamLocations(teamId: string): Promise<APIResponse<any[]>> {
    return this.request(`/location-tracking/team/${teamId}`);
  }

  // Organization methods
  async getOrganizationReadiness(): Promise<APIResponse<any[]>> {
    return this.request('/organizations/readiness');
  }

  // Team management methods
  async getTeams(): Promise<APIResponse<any[]>> {
    return this.request('/teams');
  }

  async getTeamById(id: string): Promise<APIResponse<any>> {
    return this.request(`/teams/${id}`);
  }

  async createTeam(data: any): Promise<APIResponse<any>> {
    return this.request('/teams', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateTeam(id: string, data: any): Promise<APIResponse<any>> {
    return this.request(`/teams/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteTeam(id: string): Promise<APIResponse<any>> {
    return this.request(`/teams/${id}`, {
      method: 'DELETE',
    });
  }

  async addTeamMember(teamId: string, userId: string): Promise<APIResponse<any>> {
    return this.request(`/teams/${teamId}/members`, {
      method: 'POST',
      body: JSON.stringify({ userId }),
    });
  }

  async removeTeamMember(teamId: string, memberId: string): Promise<APIResponse<any>> {
    return this.request(`/teams/${teamId}/members/${memberId}`, {
      method: 'DELETE',
    });
  }

  // Utility methods
  setToken(token: string) {
    this.token = token;
  }

  getToken(): string | null {
    return this.token;
  }

  isAuthenticated(): boolean {
    return !!this.token;
  }
}

export const apiService = new APIService();
