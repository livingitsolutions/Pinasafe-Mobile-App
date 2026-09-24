import React, { createContext, useContext, useReducer, ReactNode } from 'react';
import { Personnel } from '../services/personnelService';
import { RescueTeam } from '../services/teamService';

interface AppState {
  personnel: {
    data: Personnel[];
    loading: boolean;
    error: string | null;
    lastFetch: number | null;
  };
  teams: {
    data: RescueTeam[];
    loading: boolean;
    error: string | null;
    lastFetch: number | null;
  };
  alerts: {
    count: number;
    unread: number;
    lastCheck: number | null;
  };
  network: {
    isConnected: boolean;
    isSlowConnection: boolean;
  };
}

type AppAction =
  | { type: 'SET_PERSONNEL'; payload: Personnel[] }
  | { type: 'SET_PERSONNEL_LOADING'; payload: boolean }
  | { type: 'SET_PERSONNEL_ERROR'; payload: string | null }
  | { type: 'ADD_PERSONNEL'; payload: Personnel }
  | { type: 'UPDATE_PERSONNEL'; payload: Personnel }
  | { type: 'REMOVE_PERSONNEL'; payload: string }
  | { type: 'SET_TEAMS'; payload: RescueTeam[] }
  | { type: 'SET_TEAMS_LOADING'; payload: boolean }
  | { type: 'SET_TEAMS_ERROR'; payload: string | null }
  | { type: 'ADD_TEAM'; payload: RescueTeam }
  | { type: 'UPDATE_TEAM'; payload: RescueTeam }
  | { type: 'REMOVE_TEAM'; payload: string }
  | { type: 'SET_ALERT_COUNT'; payload: { count: number; unread: number } }
  | { type: 'SET_NETWORK_STATUS'; payload: { isConnected: boolean; isSlowConnection: boolean } }
  | { type: 'RESET_STATE' };

const initialState: AppState = {
  personnel: {
    data: [],
    loading: false,
    error: null,
    lastFetch: null,
  },
  teams: {
    data: [],
    loading: false,
    error: null,
    lastFetch: null,
  },
  alerts: {
    count: 0,
    unread: 0,
    lastCheck: null,
  },
  network: {
    isConnected: true,
    isSlowConnection: false,
  },
};

const CACHE_DURATION = 5 * 60 * 1000;

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_PERSONNEL':
      return {
        ...state,
        personnel: {
          data: action.payload,
          loading: false,
          error: null,
          lastFetch: Date.now(),
        },
      };
    case 'SET_PERSONNEL_LOADING':
      return {
        ...state,
        personnel: { ...state.personnel, loading: action.payload },
      };
    case 'SET_PERSONNEL_ERROR':
      return {
        ...state,
        personnel: { ...state.personnel, error: action.payload, loading: false },
      };
    case 'ADD_PERSONNEL':
      return {
        ...state,
        personnel: {
          ...state.personnel,
          data: [...state.personnel.data, action.payload],
        },
      };
    case 'UPDATE_PERSONNEL':
      return {
        ...state,
        personnel: {
          ...state.personnel,
          data: state.personnel.data.map((p) =>
            p.id === action.payload.id ? action.payload : p
          ),
        },
      };
    case 'REMOVE_PERSONNEL':
      return {
        ...state,
        personnel: {
          ...state.personnel,
          data: state.personnel.data.filter((p) => p.id !== action.payload),
        },
      };
    case 'SET_TEAMS':
      return {
        ...state,
        teams: {
          data: action.payload,
          loading: false,
          error: null,
          lastFetch: Date.now(),
        },
      };
    case 'SET_TEAMS_LOADING':
      return {
        ...state,
        teams: { ...state.teams, loading: action.payload },
      };
    case 'SET_TEAMS_ERROR':
      return {
        ...state,
        teams: { ...state.teams, error: action.payload, loading: false },
      };
    case 'ADD_TEAM':
      return {
        ...state,
        teams: {
          ...state.teams,
          data: [...state.teams.data, action.payload],
        },
      };
    case 'UPDATE_TEAM':
      return {
        ...state,
        teams: {
          ...state.teams,
          data: state.teams.data.map((t) =>
            t.id === action.payload.id ? action.payload : t
          ),
        },
      };
    case 'REMOVE_TEAM':
      return {
        ...state,
        teams: {
          ...state.teams,
          data: state.teams.data.filter((t) => t.id !== action.payload),
        },
      };
    case 'SET_ALERT_COUNT':
      return {
        ...state,
        alerts: {
          ...action.payload,
          lastCheck: Date.now(),
        },
      };
    case 'SET_NETWORK_STATUS':
      return {
        ...state,
        network: action.payload,
      };
    case 'RESET_STATE':
      return initialState;
    default:
      return state;
  }
}

interface AppStateContextType {
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
  shouldRefetch: (type: 'personnel' | 'teams') => boolean;
}

const AppStateContext = createContext<AppStateContextType | undefined>(undefined);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState);

  const shouldRefetch = (type: 'personnel' | 'teams'): boolean => {
    const lastFetch = state[type].lastFetch;
    if (!lastFetch) return true;
    return Date.now() - lastFetch > CACHE_DURATION;
  };

  return (
    <AppStateContext.Provider value={{ state, dispatch, shouldRefetch }}>
      {children}
    </AppStateContext.Provider>
  );
}

export function useAppState() {
  const context = useContext(AppStateContext);
  if (context === undefined) {
    throw new Error('useAppState must be used within AppStateProvider');
  }
  return context;
}
