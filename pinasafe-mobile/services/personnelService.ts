import { apiService } from './apiService';

export interface Personnel {
  id: string;
  organization_id: string;
  user_id?: string;
  name: string;
  position: string;
  contact_number: string;
  email?: string;
  specializations: string[];
  personnel_role: 'staff' | 'rescue_member';
  is_active: boolean;
  team_id?: string;
  created_at: string;
  user?: {
    id: string;
    name: string;
    email: string;
    phone: string;
    role: string;
  };
  organization?: {
    id: string;
    name: string;
    type: string;
  };
}

export interface CreatePersonnelData {
  userId?: string;
  name: string;
  contactNumber: string;
  email?: string;
  address?: string;
  barangay?: string;
  city?: string;
  province?: string;
  specializations?: string[];
  personnelRole: 'staff' | 'rescue_member';
}

export interface UpdatePersonnelData {
  contactNumber?: string;
  email?: string;
  address?: string;
  barangay?: string;
  city?: string;
  province?: string;
  specializations?: string[];
  personnelRole?: 'staff' | 'rescue_member';
  isActive?: boolean;
}

class PersonnelService {
  async getAllPersonnel(): Promise<Personnel[]> {
    try {
      const response = await apiService.get('/personnel');
      return response.data?.data || [];
    } catch (error) {
      console.error('Get personnel error:', error);
      throw error;
    }
  }

  async createPersonnel(data: CreatePersonnelData): Promise<Personnel> {
    try {
      const response = await apiService.post('/personnel', data);
      return response.data?.data || response.data;
    } catch (error) {
      console.error('Create personnel error:', error);
      throw error;
    }
  }

  async updatePersonnel(id: string, data: UpdatePersonnelData): Promise<Personnel> {
    try {
      const response = await apiService.put(`/personnel/${id}`, data);
      return response.data?.data || response.data;
    } catch (error) {
      console.error('Update personnel error:', error);
      throw error;
    }
  }

  async deletePersonnel(id: string): Promise<void> {
    try {
      await apiService.delete(`/personnel/${id}`);
    } catch (error) {
      console.error('Delete personnel error:', error);
      throw error;
    }
  }

  async getRescueMembers(): Promise<Personnel[]> {
    try {
      const response = await apiService.get('/personnel/rescue-members');
      return response.data?.data || [];
    } catch (error) {
      console.error('Get rescue members error:', error);
      throw error;
    }
  }

  async getPersonnelByUserId(userId: string): Promise<Personnel | null> {
    try {
      const response = await apiService.get(`/personnel/by-user/${userId}`);
      return response.data?.data || null;
    } catch (error) {
      console.error('Get personnel by user ID error:', error);
      return null;
    }
  }
}

export default new PersonnelService();
