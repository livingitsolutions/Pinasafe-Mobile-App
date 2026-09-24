import { apiService } from './apiService';

export interface TeamMember {
  id: string;
  team_id: string;
  user_id: string;
  assigned_at: string;
  assigned_by: string;
  user?: {
    id: string;
    name: string;
    email: string;
    phone: string;
  };
  assigned_by_user?: {
    id: string;
    name: string;
  };
}

export interface RescueTeam {
  id: string;
  organization_id: string;
  name: string;
  team_leader_id?: string;
  description?: string;
  is_active: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
  organization?: {
    id: string;
    name: string;
    type: string;
  };
  team_leader?: {
    id: string;
    name: string;
    email: string;
    phone: string;
  };
  created_by_user?: {
    id: string;
    name: string;
  };
  members: TeamMember[];
}

export interface CreateTeamData {
  name: string;
  teamLeaderId?: string;
  description?: string;
}

export interface UpdateTeamData {
  name?: string;
  teamLeaderId?: string;
  description?: string;
  isActive?: boolean;
}

export interface AddTeamMemberData {
  userId: string;
}

class TeamService {
  async getTeams(): Promise<RescueTeam[]> {
    try {
      const response = await apiService.getTeams();
      // Backend returns {data: [...]} which gets wrapped as {data: {data: [...]}}
      const teams = response.data?.data || response.data || [];
      return Array.isArray(teams) ? teams : [];
    } catch (error) {
      console.error('Get teams error:', error);
      return [];
    }
  }

  async getAllTeams(): Promise<RescueTeam[]> {
    return this.getTeams();
  }

  async getTeamById(id: string): Promise<RescueTeam> {
    try {
      const response = await apiService.get(`/teams/${id}`);
      return response.data?.data || response.data;
    } catch (error) {
      console.error('Get team error:', error);
      throw error;
    }
  }

  async createTeam(data: CreateTeamData): Promise<RescueTeam> {
    try {
      const response = await apiService.post('/teams', data);
      return response.data?.data || response.data;
    } catch (error) {
      console.error('Create team error:', error);
      throw error;
    }
  }

  async updateTeam(id: string, data: UpdateTeamData): Promise<RescueTeam> {
    try {
      const response = await apiService.put(`/teams/${id}`, data);
      return response.data?.data || response.data;
    } catch (error) {
      console.error('Update team error:', error);
      throw error;
    }
  }

  async deleteTeam(id: string): Promise<void> {
    try {
      await apiService.delete(`/teams/${id}`);
    } catch (error) {
      console.error('Delete team error:', error);
      throw error;
    }
  }

  async addTeamMember(teamId: string, data: AddTeamMemberData): Promise<TeamMember> {
    try {
      const response = await apiService.post(`/teams/${teamId}/members`, data);
      return response.data?.data || response.data;
    } catch (error) {
      console.error('Add team member error:', error);
      throw error;
    }
  }

  async removeTeamMember(teamId: string, memberId: string): Promise<void> {
    try {
      await apiService.delete(`/teams/${teamId}/members/${memberId}`);
    } catch (error) {
      console.error('Remove team member error:', error);
      throw error;
    }
  }
}

export default new TeamService();
