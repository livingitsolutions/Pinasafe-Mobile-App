import { useEffect, useCallback } from 'react';
import { useAppState } from '../contexts/AppStateContext';
import teamService, { RescueTeam, CreateTeamData, UpdateTeamData, AddTeamMemberData } from '../services/teamService';
import { logger } from '../utils/logger';

export function useTeams() {
  const { state, dispatch, shouldRefetch } = useAppState();

  const loadTeams = useCallback(async (force = false) => {
    if (!force && !shouldRefetch('teams')) {
      logger.debug('Using cached teams data');
      return;
    }

    dispatch({ type: 'SET_TEAMS_LOADING', payload: true });

    try {
      const teams = await teamService.getTeams();
      dispatch({ type: 'SET_TEAMS', payload: teams });
    } catch (error) {
      logger.error('Failed to load teams', error);
      dispatch({
        type: 'SET_TEAMS_ERROR',
        payload: error instanceof Error ? error.message : 'Failed to load teams',
      });
    }
  }, [dispatch, shouldRefetch]);

  const createTeam = useCallback(async (data: CreateTeamData): Promise<RescueTeam> => {
    const team = await teamService.createTeam(data);
    dispatch({ type: 'ADD_TEAM', payload: team });
    return team;
  }, [dispatch]);

  const updateTeam = useCallback(async (id: string, data: UpdateTeamData): Promise<RescueTeam> => {
    const team = await teamService.updateTeam(id, data);
    dispatch({ type: 'UPDATE_TEAM', payload: team });
    return team;
  }, [dispatch]);

  const deleteTeam = useCallback(async (id: string): Promise<void> => {
    await teamService.deleteTeam(id);
    dispatch({ type: 'REMOVE_TEAM', payload: id });
  }, [dispatch]);

  const addTeamMember = useCallback(async (teamId: string, data: AddTeamMemberData) => {
    await teamService.addTeamMember(teamId, data);
    await loadTeams(true);
  }, [loadTeams]);

  const removeTeamMember = useCallback(async (teamId: string, memberId: string) => {
    await teamService.removeTeamMember(teamId, memberId);
    await loadTeams(true);
  }, [loadTeams]);

  useEffect(() => {
    loadTeams();
  }, [loadTeams]);

  return {
    teams: state.teams.data,
    loading: state.teams.loading,
    error: state.teams.error,
    loadTeams,
    createTeam,
    updateTeam,
    deleteTeam,
    addTeamMember,
    removeTeamMember,
  };
}
