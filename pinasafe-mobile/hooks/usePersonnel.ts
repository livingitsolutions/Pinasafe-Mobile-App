import { useEffect, useCallback } from 'react';
import { useAppState } from '../contexts/AppStateContext';
import personnelService, { Personnel, CreatePersonnelData, UpdatePersonnelData } from '../services/personnelService';
import { logger } from '../utils/logger';

export function usePersonnel() {
  const { state, dispatch, shouldRefetch } = useAppState();

  const loadPersonnel = useCallback(async (force = false) => {
    if (!force && !shouldRefetch('personnel')) {
      logger.debug('Using cached personnel data');
      return;
    }

    dispatch({ type: 'SET_PERSONNEL_LOADING', payload: true });

    try {
      const personnel = await personnelService.getAllPersonnel();
      dispatch({ type: 'SET_PERSONNEL', payload: personnel });
    } catch (error) {
      logger.error('Failed to load personnel', error);
      dispatch({
        type: 'SET_PERSONNEL_ERROR',
        payload: error instanceof Error ? error.message : 'Failed to load personnel',
      });
    }
  }, [dispatch, shouldRefetch]);

  const createPersonnel = useCallback(async (data: CreatePersonnelData): Promise<Personnel> => {
    const personnel = await personnelService.createPersonnel(data);
    dispatch({ type: 'ADD_PERSONNEL', payload: personnel });
    return personnel;
  }, [dispatch]);

  const updatePersonnel = useCallback(async (id: string, data: UpdatePersonnelData): Promise<Personnel> => {
    const personnel = await personnelService.updatePersonnel(id, data);
    dispatch({ type: 'UPDATE_PERSONNEL', payload: personnel });
    return personnel;
  }, [dispatch]);

  const deletePersonnel = useCallback(async (id: string): Promise<void> => {
    await personnelService.deletePersonnel(id);
    dispatch({ type: 'REMOVE_PERSONNEL', payload: id });
  }, [dispatch]);

  const getRescueMembers = useCallback((): Personnel[] => {
    return state.personnel.data.filter(
      (p) => p.personnel_role === 'rescue_member' && p.is_active && p.user_id
    );
  }, [state.personnel.data]);

  useEffect(() => {
    loadPersonnel();
  }, [loadPersonnel]);

  return {
    personnel: state.personnel.data,
    loading: state.personnel.loading,
    error: state.personnel.error,
    loadPersonnel,
    createPersonnel,
    updatePersonnel,
    deletePersonnel,
    getRescueMembers,
  };
}
