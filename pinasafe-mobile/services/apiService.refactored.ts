import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '../utils/logger';

export interface APIResponse<T = unknown> {
  data?: T;
  error?: string;
  message?: string;
}

export interface APIError {
  message: string;
  status?: number;
  code?: string;
}

interface LoginResponse {
  user: {
    id: string;
    email: string;
    name: string;
    role: 'citizen' | 'responder' | 'admin';
    phone?: string;
    address?: string;
    verified: boolean;
    organization_id?: string;
  };
  token: string;
  mustChangePassword?: boolean;
}

interface EmergencyReportData {
  type: 'rescue' | 'fire';
  description: string;
  location: string;
  coordinates?: { latitude: number; longitude: number };
  contactNumber?: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  evidence?: {
    photos: string[];
    video?: string;
  };
  aiClassification?: Record<string, unknown>;
  useAIClassification?: boolean;
}

interface RequestConfig extends RequestInit {
  timeout?: number;
  retries?: number;
}

class APIService {
  private baseURL: string;
  private token: string | null = null;
  private readonly DEFAULT_TIMEOUT = 30000;
  private readonly MAX_RETRIES = 3;

  constructor() {
    this.baseURL =
      process.env.EXPO_PUBLIC_API_URL ||
      'https://sinister-cauldron-q79q59r7446jfxpqq-3000.app.github.dev';
  }

  private async getAuthToken(): Promise<string | null> {
    if (this.token) return this.token;
    try {
      const storedToken = await AsyncStorage.getItem('auth_token');
      if (storedToken) {
        this.token = storedToken;
      }
      return storedToken;
    } catch (error) {
      logger.error('Failed to retrieve auth token', error);
      return null;
    }
  }

  setToken(token: string): void {
    this.token = token;
  }

  async clearToken(): Promise<void> {
    this.token = null;
    try {
      await AsyncStorage.removeItem('auth_token');
    } catch (error) {
      logger.error('Failed to clear auth token', error);
    }
  }

  private async fetchWithTimeout(
    url: string,
    config: RequestConfig
  ): Promise<Response> {
    const timeout = config.timeout || this.DEFAULT_TIMEOUT;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        ...config,
        signal: controller.signal,
      });
      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private async retryRequest<T>(
    fn: () => Promise<APIResponse<T>>,
    retries: number = this.MAX_RETRIES
  ): Promise<APIResponse<T>> {
    try {
      return await fn();
    } catch (error) {
      if (retries > 0 && this.isRetryableError(error)) {
        logger.warn(`Retrying request, attempts remaining: ${retries - 1}`);
        await this.delay(1000);
        return this.retryRequest(fn, retries - 1);
      }
      throw error;
    }
  }

  private isRetryableError(error: unknown): boolean {
    if (error instanceof Error) {
      return (
        error.name === 'AbortError' ||
        error.message.includes('Network') ||
        error.message.includes('timeout')
      );
    }
    return false;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async request<T = unknown>(
    endpoint: string,
    options: RequestConfig = {}
  ): Promise<APIResponse<T>> {
    const method = options.method || 'GET';
    const url = `${this.baseURL}/api${endpoint}`;

    try {
      const token = await this.getAuthToken();
      const config: RequestConfig = {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...(token && { Authorization: `Bearer ${token}` }),
          ...options.headers,
        },
      };

      logger.api(method, endpoint);

      const response = await this.fetchWithTimeout(url, config);
      const contentType = response.headers.get('content-type');
      const isJson = contentType?.includes('application/json');

      let data: unknown;
      if (isJson) {
        data = await response.json();
      } else {
        data = await response.text();
      }

      if (!response.ok) {
        const errorMessage =
          isJson && typeof data === 'object' && data && 'message' in data
            ? String((data as { message: unknown }).message)
            : `HTTP ${response.status}`;

        logger.api(method, endpoint, response.status);

        if (response.status === 401) {
          await this.clearToken();
        }

        return { error: errorMessage };
      }

      logger.api(method, endpoint, response.status);
      return { data: data as T };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        logger.error(`Request timeout: ${method} ${endpoint}`);
        return { error: 'Request timeout. Please try again.' };
      }
      logger.error(`Network error: ${method} ${endpoint}`, error);
      return { error: 'Network error. Please check your connection.' };
    }
  }

  async get<T = unknown>(endpoint: string, config?: RequestConfig): Promise<APIResponse<T>> {
    return this.retryRequest(() =>
      this.request<T>(endpoint, { ...config, method: 'GET' })
    );
  }

  async post<T = unknown>(
    endpoint: string,
    data?: unknown,
    config?: RequestConfig
  ): Promise<APIResponse<T>> {
    return this.request<T>(endpoint, {
      ...config,
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async put<T = unknown>(
    endpoint: string,
    data?: unknown,
    config?: RequestConfig
  ): Promise<APIResponse<T>> {
    return this.request<T>(endpoint, {
      ...config,
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async delete<T = unknown>(endpoint: string, config?: RequestConfig): Promise<APIResponse<T>> {
    return this.request<T>(endpoint, { ...config, method: 'DELETE' });
  }

  async login(email: string, password: string): Promise<APIResponse<LoginResponse>> {
    const response = await this.post<LoginResponse>('/auth/login', {
      email,
      password,
    });

    if (response.data?.token) {
      this.setToken(response.data.token);
      await AsyncStorage.setItem('auth_token', response.data.token);
    }

    return response;
  }

  async register(userData: {
    email: string;
    password: string;
    name: string;
    phone: string;
    role: string;
  }): Promise<APIResponse<LoginResponse>> {
    const response = await this.post<LoginResponse>('/auth/register', userData);

    if (response.data?.token) {
      this.setToken(response.data.token);
      await AsyncStorage.setItem('auth_token', response.data.token);
    }

    return response;
  }

  async logout(): Promise<void> {
    await this.post('/auth/logout');
    await this.clearToken();
  }

  async refreshToken(): Promise<APIResponse<{ token: string }>> {
    const response = await this.post<{ token: string }>('/auth/refresh');

    if (response.data?.token) {
      this.setToken(response.data.token);
      await AsyncStorage.setItem('auth_token', response.data.token);
    }

    return response;
  }

  async getProfile(): Promise<APIResponse<unknown>> {
    return this.get('/users/profile');
  }

  async updateProfile(data: Record<string, unknown>): Promise<APIResponse<unknown>> {
    return this.put('/users/profile', data);
  }

  async submitEmergencyReport(data: EmergencyReportData): Promise<APIResponse<unknown>> {
    return this.post('/emergency-reports', data);
  }

  async getEmergencyReports(filters: Record<string, unknown> = {}): Promise<APIResponse<unknown[]>> {
    const params = new URLSearchParams(filters as Record<string, string>);
    return this.get(`/emergency-reports?${params}`);
  }

  async updateEmergencyReport(
    reportId: string,
    data: Record<string, unknown>
  ): Promise<APIResponse<unknown>> {
    return this.put(`/emergency-reports/${reportId}`, data);
  }

  async assignTeamToReport(
    reportId: string,
    teamId: string
  ): Promise<APIResponse<unknown>> {
    return this.post(`/emergency-reports/${reportId}/assign-team`, { teamId });
  }

  async initiateEmergencyCall(data: {
    location: string;
    coordinates: { latitude: number; longitude: number };
  }): Promise<APIResponse<unknown>> {
    return this.post('/emergency-calls', data);
  }

  async getEmergencyCallsByUser(): Promise<APIResponse<unknown[]>> {
    return this.get('/emergency-calls/user');
  }

  async getActiveAlerts(): Promise<APIResponse<unknown[]>> {
    return this.get('/alerts');
  }

  async createAlert(data: {
    title: string;
    message: string;
    severity: string;
    targetAudience: string;
  }): Promise<APIResponse<unknown>> {
    return this.post('/alerts', data);
  }

  async dismissAlert(alertId: string): Promise<APIResponse<unknown>> {
    return this.post(`/alerts/${alertId}/dismiss`);
  }

  async getOrganizations(): Promise<APIResponse<unknown[]>> {
    return this.get('/organizations');
  }

  async getPersonnelByOrganization(): Promise<APIResponse<unknown[]>> {
    return this.get('/personnel');
  }

  async createPersonnel(personnel: {
    name: string;
    position?: string;
    contactNumber?: string;
    email?: string;
    personnelRole: string;
  }): Promise<APIResponse<unknown>> {
    return this.post('/personnel', personnel);
  }

  async updatePersonnel(
    personnelId: string,
    updates: Record<string, unknown>
  ): Promise<APIResponse<unknown>> {
    return this.put(`/personnel/${personnelId}`, updates);
  }

  async getEmergencyStats(): Promise<APIResponse<{
    totalReports: number;
    activeIncidents: number;
    resolvedToday: number;
    averageResponseTime: string;
  }>> {
    return this.get('/stats/emergency');
  }

  async getIncidentClusters(): Promise<APIResponse<unknown[]>> {
    return this.get('/clusters');
  }

  async getClusterDetails(clusterId: string): Promise<APIResponse<unknown>> {
    return this.get(`/clusters/${clusterId}`);
  }

  async acknowledgeCluster(clusterId: string): Promise<APIResponse<unknown>> {
    return this.post(`/clusters/${clusterId}/acknowledge`);
  }

  async resolveCluster(
    clusterId: string,
    data: Record<string, unknown>
  ): Promise<APIResponse<unknown>> {
    return this.post(`/clusters/${clusterId}/resolve`, data);
  }

  async getTeams(): Promise<APIResponse<unknown>> {
    return this.get('/teams');
  }

  async getUserLocationUpdates(userId: string): Promise<APIResponse<unknown[]>> {
    return this.get(`/location-tracking/${userId}`);
  }

  async updateUserLocation(data: {
    latitude: number;
    longitude: number;
    accuracy?: number;
  }): Promise<APIResponse<unknown>> {
    return this.post('/location-tracking', data);
  }
}

export const apiService = new APIService();
